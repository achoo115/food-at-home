import { describe, it, expect } from 'vitest'
import { normalizePreferences, DEFAULT_PREFERENCES } from './preferences'
import { hasMacros, formatMacros } from './macros'

describe('normalizePreferences', () => {
  it('returns defaults for empty input', () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
  })

  it('dedupes and trims lists, dropping empties (case-insensitive)', () => {
    const p = normalizePreferences({ hard_nos: [' Pineapple ', 'pineapple', '', 'Cilantro'] })
    expect(p.hard_nos).toEqual(['Pineapple', 'Cilantro'])
  })

  it('clamps numeric ranges', () => {
    const p = normalizePreferences({ min_protein_types_per_week: 99, recency_weeks: -3, max_cook_minutes: 1 })
    expect(p.min_protein_types_per_week).toBe(7)
    expect(p.recency_weeks).toBe(0)
    expect(p.max_cook_minutes).toBe(5) // clamped up to floor
  })

  it('treats null max_cook_minutes as "no limit"', () => {
    expect(normalizePreferences({ max_cook_minutes: null }).max_cook_minutes).toBeNull()
  })

  it('keeps only positive finite macro targets', () => {
    const p = normalizePreferences({ macro_targets: { calories: 500, protein_g: 0, fiber_g: NaN as unknown as number } })
    expect(p.macro_targets).toEqual({ calories: 500 })
  })

  it('coerces junk numbers to defaults instead of throwing', () => {
    const p = normalizePreferences({ recency_weeks: 'abc' as unknown as number })
    expect(p.recency_weeks).toBe(DEFAULT_PREFERENCES.recency_weeks)
  })
})

describe('macros', () => {
  it('hasMacros is true only when a positive value exists', () => {
    expect(hasMacros(null)).toBe(false)
    expect(hasMacros({})).toBe(false)
    expect(hasMacros({ calories: 0, protein_g: null })).toBe(false)
    expect(hasMacros({ fiber_g: 8 })).toBe(true)
  })

  it('formatMacros omits missing/zero fields and labels the rest', () => {
    const chips = formatMacros({ calories: 520, protein_g: 34, carbs_g: 0, fiber_g: 9 })
    expect(chips).toEqual([
      { label: 'cal', value: '520' },
      { label: 'protein', value: '34g' },
      { label: 'fiber', value: '9g' },
    ])
  })
})
