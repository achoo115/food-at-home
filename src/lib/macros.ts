export interface MacroSet {
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
}

const FIELDS: { key: keyof MacroSet; label: string; suffix: string }[] = [
  { key: 'calories', label: 'cal', suffix: '' },
  { key: 'protein_g', label: 'protein', suffix: 'g' },
  { key: 'carbs_g', label: 'carbs', suffix: 'g' },
  { key: 'fat_g', label: 'fat', suffix: 'g' },
  { key: 'fiber_g', label: 'fiber', suffix: 'g' },
]

/** True when the recipe carries at least one usable (>0) macro value. */
export function hasMacros(m: MacroSet | null | undefined): boolean {
  if (!m) return false
  return FIELDS.some(({ key }) => {
    const v = m[key]
    return typeof v === 'number' && Number.isFinite(v) && v > 0
  })
}

/** Present macros as display chips, omitting any that are missing/zero. */
export function formatMacros(m: MacroSet | null | undefined): { label: string; value: string }[] {
  if (!m) return []
  const out: { label: string; value: string }[] = []
  for (const { key, label, suffix } of FIELDS) {
    const v = m[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out.push({ label, value: `${Math.round(v)}${suffix}` })
    }
  }
  return out
}
