import { describe, it, expect } from 'vitest'
import { buildRecipeConstraints } from './mealRules'
import { DEFAULT_PREFERENCES } from './preferences'
import type { Preferences } from '../types/preferences'

const prefs = (o: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...o })
const joined = (lines: string[]) => lines.join('\n')

describe('buildRecipeConstraints', () => {
  it('always includes fiber-first, 4-pillar, and macro-output rules', () => {
    const text = joined(buildRecipeConstraints(prefs()))
    expect(text).toMatch(/fiber is a priority/i)
    expect(text).toMatch(/four pillars/i)
    expect(text).toMatch(/per-serving macros/i)
  })

  it('emits dietary restrictions and hard-nos only when set', () => {
    const none = joined(buildRecipeConstraints(prefs()))
    expect(none).not.toMatch(/dietary restrictions/i)
    expect(none).not.toMatch(/hard no/i)

    const set = joined(buildRecipeConstraints(prefs({ dietary_restrictions: ['vegetarian'], hard_nos: ['pineapple'] })))
    expect(set).toMatch(/dietary restrictions: vegetarian/i)
    expect(set).toMatch(/hard no\): pineapple/i)
  })

  it('adds a cook-time cap when max_cook_minutes is set, omits when null', () => {
    expect(joined(buildRecipeConstraints(prefs({ max_cook_minutes: 25 })))).toMatch(/at most 25 minutes/i)
    expect(joined(buildRecipeConstraints(prefs({ max_cook_minutes: null })))).not.toMatch(/minutes/i)
  })

  it('formats macro targets, skipping unset ones', () => {
    const text = joined(buildRecipeConstraints(prefs({ macro_targets: { calories: 500, fiber_g: 10 } })))
    expect(text).toMatch(/~500 cal/)
    expect(text).toMatch(/~10g fiber/)
    expect(text).not.toMatch(/~\d+g protein/) // protein target was not set
  })

  it('lists recent meals to avoid only when history exists and recency > 0', () => {
    const withHist = joined(buildRecipeConstraints(prefs({ recency_weeks: 2 }), ['Salmon Bowl', 'Chicken Tacos']))
    expect(withHist).toMatch(/recently-made meals: Salmon Bowl; Chicken Tacos/i)

    const off = joined(buildRecipeConstraints(prefs({ recency_weeks: 0 }), ['Salmon Bowl']))
    expect(off).not.toMatch(/recently-made/i)

    const noHist = joined(buildRecipeConstraints(prefs({ recency_weeks: 2 }), []))
    expect(noHist).not.toMatch(/recently-made/i)
  })

  it('includes the cuisine-variety rule only when enabled', () => {
    expect(joined(buildRecipeConstraints(prefs({ cuisine_variety: true })))).toMatch(/vary the cuisine/i)
    expect(joined(buildRecipeConstraints(prefs({ cuisine_variety: false })))).not.toMatch(/vary the cuisine/i)
  })
})
