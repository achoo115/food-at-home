// Pure helpers for the weekly meal plan: the week key, and rotation ranking so
// hearted meals resurface and recently-cooked ones sink (Harvest's rotation idea).

export const MEAL_SLOTS: { meal_type: string; label: string }[] = [
  { meal_type: 'breakfast', label: 'Breakfast' },
  { meal_type: 'lunch', label: 'Lunch' },
  { meal_type: 'dinner', label: 'Dinner' },
  { meal_type: 'dinner', label: 'Dinner' },
]

/** Monday (local) of the week containing `d`, as YYYY-MM-DD — the meal-plan key. */
export function weekStart(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface RotatableRecipe {
  last_cooked_at: string | null
  is_favorited: boolean
}

function cookedWithin(r: RotatableRecipe, now: Date, days: number): boolean {
  if (!r.last_cooked_at) return false
  const diff = (now.getTime() - new Date(r.last_cooked_at).getTime()) / 86400000
  return diff >= 0 && diff < days
}

/**
 * Order recipes for picking into a plan:
 *  1. meals NOT cooked within `recencyDays` come before recent ones,
 *  2. within each group, favorites first,
 *  3. then oldest-cooked (never-cooked counts as oldest) first.
 * Stable, pure, non-mutating.
 */
export function rankForRotation<T extends RotatableRecipe>(
  recipes: readonly T[],
  opts: { now?: Date; recencyDays?: number } = {},
): T[] {
  const now = opts.now ?? new Date()
  const recencyDays = opts.recencyDays ?? 14
  return [...recipes].sort((a, b) => {
    const aRecent = cookedWithin(a, now, recencyDays)
    const bRecent = cookedWithin(b, now, recencyDays)
    if (aRecent !== bRecent) return aRecent ? 1 : -1
    if (a.is_favorited !== b.is_favorited) return a.is_favorited ? -1 : 1
    const at = a.last_cooked_at ? new Date(a.last_cooked_at).getTime() : 0
    const bt = b.last_cooked_at ? new Date(b.last_cooked_at).getTime() : 0
    return at - bt
  })
}
