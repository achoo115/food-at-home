import { describe, expect, it } from 'vitest'
import { normalizeScanItems, dedupeKey } from './scanItems'

// The owner's Whole Foods order screenshot (2026-10-31) as the model should
// return it. The shrimp's printed total is clipped to "$13.5" in the image;
// the paid amount is 16.99 − 3.40 = 13.59.
const ORDER = [
  { name: '365 by Whole Foods Market Uncured Bacon & Cheddar Egg Bites', quantity: 1, unit_price: 4.39, line_total: 4.39, category: 'protein', location: 'fridge', container: 'box' },
  { name: 'Chobani® Greek Yogurt Strawberry Kiwi', quantity: 1, unit_price: 2.39, line_total: 1.78, category: 'dairy', location: 'fridge', container: 'other' },
  { name: 'Hoboken Farms Basil Marinara', quantity: 1, unit_price: 9.99, line_total: 5.99, category: 'condiment', location: 'pantry', container: 'jar' },
  { name: 'Raw Seafood Inc Frozen Shrimp Grilled Cocktail Sauce', quantity: 1, unit_price: 16.99, line_total: 13.59, category: 'protein', location: 'freezer', container: 'frozen' },
]

describe('normalizeScanItems', () => {
  it('keeps the post-promotion line total as cost and strips trademark glyphs', () => {
    const { items } = normalizeScanItems(ORDER)
    expect(items).toHaveLength(4)
    expect(items[1].name).toBe('Chobani Greek Yogurt Strawberry Kiwi')
    expect(items[1].cost).toBe(1.78)
    expect(items[1].unitPrice).toBe(2.39)
    expect(items[2].cost).toBe(5.99)
    expect(items[2].location).toBe('pantry')
    expect(items[2].container).toBe('jar')
    expect(items[3].location).toBe('freezer')
    expect(items[3].cost).toBe(13.59)
  })

  it('merges a row repeated across overlapping screenshots: max quantity, never the sum', () => {
    const { items, merged } = normalizeScanItems([...ORDER, { ...ORDER[2], name: 'HOBOKEN FARMS Basil Marinara', quantity: 1 }])
    expect(items).toHaveLength(4)
    expect(merged).toBe(1)
    const marinara = items.find((i) => dedupeKey(i.name) === dedupeKey('Hoboken Farms Basil Marinara'))!
    expect(marinara.quantity).toBe(1)
  })

  it('merged rows keep the longer name', () => {
    const { items } = normalizeScanItems([{ name: 'Raw Seafood Inc, Frozen, Shr', quantity: 1 }, { name: 'Raw Seafood Inc, Frozen, Shrimp', quantity: 1 }])
    // different keys — a truncated name is NOT the same key, so both survive (the model is told to dedupe)
    expect(items).toHaveLength(2)
    const { items: same } = normalizeScanItems([{ name: 'kimchi', quantity: 1 }, { name: 'Kimchi!', quantity: 2 }])
    expect(same).toHaveLength(1)
    expect(same[0].name).toBe('Kimchi!')
    expect(same[0].quantity).toBe(2)
  })

  it('drops nameless rows and non-objects, coerces bad fields to safe defaults', () => {
    const { items, dropped } = normalizeScanItems([null, 'x', { quantity: 2 }, { name: '  ', cost: 1 },
      { name: 'Thing', quantity: '67', unit_price: '$3.99', line_total: 'abc', category: 'DAIRY', location: 'attic', container: 'tub' }])
    expect(dropped).toBe(4)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Thing', quantity: 67, unitPrice: 3.99, cost: 267.33, category: 'dairy', location: 'fridge', container: 'other' })
  })

  it('quantity: non-finite or < 1 → 1, capped at 99; cost derived as unit × qty when total missing', () => {
    const { items } = normalizeScanItems([{ name: 'A', quantity: 0, unit_price: 2 }, { name: 'B', quantity: 500, unit_price: 1 }, { name: 'C', quantity: 3, unit_price: 2.5 }])
    expect(items.map((i) => [i.quantity, i.cost])).toEqual([[1, 2], [99, 99], [3, 7.5]])
  })

  it('a total above the undiscounted amount is a misread → unit × qty', () => {
    const { items } = normalizeScanItems([{ name: 'A', quantity: 1, unit_price: 2.39, line_total: 23.9 }])
    expect(items[0].cost).toBe(2.39)
  })

  it('legacy single-field shape {cost} still maps', () => {
    const { items } = normalizeScanItems([{ name: 'A', quantity: 1, cost: 3.5, category: 'snack' }])
    expect(items[0]).toMatchObject({ cost: 3.5, unitPrice: null, category: 'snack', location: 'fridge' })
  })

  it('non-array input → empty', () => {
    expect(normalizeScanItems({ items: [] })).toEqual({ items: [], dropped: 0, merged: 0 })
    expect(normalizeScanItems('[]').items).toEqual([])
  })
})
