import type { Preferences, MacroTargets } from '../types/preferences'

export const DEFAULT_PREFERENCES: Preferences = {
  dietary_restrictions: [],
  hard_nos: [],
  macro_targets: {},
  max_cook_minutes: 30,
  min_protein_types_per_week: 3,
  cuisine_variety: true,
  recency_weeks: 2,
}

const clampInt = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

const cleanList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const s = String(item ?? '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

const cleanTargets = (raw: unknown): MacroTargets => {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: MacroTargets = {}
  for (const k of ['calories', 'protein_g', 'fiber_g'] as const) {
    const v = Number(t[k])
    if (Number.isFinite(v) && v > 0) out[k] = Math.round(v)
  }
  return out
}

/**
 * Coerce arbitrary/partial input (a form, or a stored row) into a valid
 * Preferences object: clamp numbers to sane ranges, dedupe/trim lists, drop
 * junk macro targets. Never throws.
 */
export function normalizePreferences(input: Partial<Preferences> | null | undefined): Preferences {
  const p = input ?? {}
  // Absent (undefined) → fall back to the default limit; explicit null → "no limit".
  const maxCook =
    p.max_cook_minutes === undefined
      ? (DEFAULT_PREFERENCES.max_cook_minutes as number)
      : p.max_cook_minutes === null
        ? null
        : clampInt(p.max_cook_minutes, 5, 240, DEFAULT_PREFERENCES.max_cook_minutes as number)
  const out: Preferences = {
    dietary_restrictions: cleanList(p.dietary_restrictions),
    hard_nos: cleanList(p.hard_nos),
    macro_targets: cleanTargets(p.macro_targets),
    max_cook_minutes: maxCook,
    min_protein_types_per_week: clampInt(p.min_protein_types_per_week, 0, 7, DEFAULT_PREFERENCES.min_protein_types_per_week),
    cuisine_variety: p.cuisine_variety ?? DEFAULT_PREFERENCES.cuisine_variety,
    recency_weeks: clampInt(p.recency_weeks, 0, 8, DEFAULT_PREFERENCES.recency_weeks),
  }
  if (p.id !== undefined) out.id = p.id
  if (p.user_id !== undefined) out.user_id = p.user_id
  return out
}
