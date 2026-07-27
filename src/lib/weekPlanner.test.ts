import { describe, it, expect } from 'vitest'
import { slotConstraints, violatesHardNo, planSavings, countMealsUsingDeals, mainProtein } from './weekPlanner'
import { DEFAULT_PREFERENCES } from './preferences'
import type { Preferences } from '../types/preferences'

const prefs = (o: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...o })
const join = (a: string[]) => a.join('\n')

describe('slotConstraints', () => {
  it('adds a meal-type framing and lunch = assemble-only', () => {
    const lunch = join(slotConstraints({ meal_type: 'lunch', label: 'Lunch' }, [], prefs(), []))
    expect(lunch).toMatch(/this meal is the LUNCH/i)
    expect(lunch).toMatch(/assemble-only/i)
    const dinner = join(slotConstraints({ meal_type: 'dinner', label: 'Dinner' }, [], prefs(), []))
    expect(dinner).not.toMatch(/assemble-only/i)
  })

  it('adds an avoid-list only when meals are already chosen', () => {
    expect(join(slotConstraints({ meal_type: 'dinner', label: 'Dinner' }, [], prefs(), []))).not.toMatch(/already in this week/i)
    const withChosen = join(slotConstraints({ meal_type: 'dinner', label: 'Dinner' }, [{ title: 'Salmon Bowl' }], prefs(), []))
    expect(withChosen).toMatch(/different main protein AND a different cuisine/i)
    expect(withChosen).toMatch(/Salmon Bowl/)
  })

  it('carries the household rules through (hard-nos)', () => {
    const c = join(slotConstraints({ meal_type: 'dinner', label: 'Dinner' }, [], prefs({ hard_nos: ['pineapple'] }), []))
    expect(c).toMatch(/hard no\).*pineapple/i)
  })
})

describe('violatesHardNo', () => {
  it('flags a hard-no ingredient regardless of case, else null', () => {
    expect(violatesHardNo(['2 cups Pineapple chunks', 'rice'], ['pineapple'])).toBe('pineapple')
    expect(violatesHardNo(['chicken', 'rice'], ['pineapple'])).toBeNull()
    expect(violatesHardNo(['anything'], [])).toBeNull()
  })
})

describe('mainProtein', () => {
  it('classifies from build.pro or ingredients, else other', () => {
    expect(mainProtein(['Chicken Thighs'])).toBe('chicken')
    expect(mainProtein(['Wild Salmon Fillet'])).toBe('salmon')
    expect(mainProtein(['egg', 'oats'])).toBe('egg')
    expect(mainProtein([], ['1 can black beans', 'rice'])).toBe('legume')
    expect(mainProtein(['mystery protein'])).toBe('other')
  })
})

describe('planSavings & countMealsUsingDeals', () => {
  const recipes = [
    { ingredients: [{ name: 'wild salmon fillet' }, { name: 'rice' }] },
    { ingredients: [{ name: 'chicken thighs' }, { name: 'broccoli' }] },
    { ingredients: [{ name: 'oats' }, { name: 'banana' }] },
  ]
  const specials = [
    { item: 'Salmon', regular_price: 14.99, sale_price: 9.99 },
    { item: 'Chicken Thighs', regular_price: 6.99, sale_price: 4.49 },
    { item: 'Sparkling Water', regular_price: 5.99, sale_price: 3.99 }, // not used
    { item: 'Avocado', regular_price: null, sale_price: 1.5 }, // no regular price → skip
  ]

  it('sums savings only for on-sale items actually used', () => {
    // salmon 5.00 + chicken 2.50 = 7.50 → rounded 8
    expect(planSavings(recipes, specials)).toBe(8)
  })

  it('counts how many meals use a deal', () => {
    expect(countMealsUsingDeals(recipes, specials)).toBe(2) // salmon + chicken meals
  })
})
