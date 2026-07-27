import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STORE_ZONES,
  classifyZone,
  groupByStoreOrder,
} from './storeOrder'

describe('classifyZone', () => {
  it('classifies common items by keyword into the right zone', () => {
    expect(classifyZone('bananas').zone).toBe('Produce')
    expect(classifyZone('boneless chicken breast').zone).toBe('Meat & Seafood')
    expect(classifyZone('whole milk').zone).toBe('Dairy & Eggs')
    expect(classifyZone('frozen peas').zone).toBe('Frozen')
    expect(classifyZone('tortilla chips').zone).toBe('Snacks')
    expect(classifyZone('sparkling water').zone).toBe('Beverages')
  })

  it('is case- and punctuation-insensitive', () => {
    expect(classifyZone('  Organic  BANANAS!! ').zone).toBe('Produce')
  })

  it('prefers a more specific keyword over a generic one (frozen wins)', () => {
    // "frozen" should route to Frozen even though "berries" is Produce
    expect(classifyZone('frozen mixed berries').zone).toBe('Frozen')
  })

  it('falls back to Pantry with low confidence when nothing matches', () => {
    const r = classifyZone('zzxq widget')
    expect(r.zone).toBe('Pantry')
    expect(r.confidence).toBe('fallback')
  })

  it('classifies wine by varietal, not just the word "wine"', () => {
    expect(classifyZone('pinot noir').zone).toBe('Wine & Beer')
    expect(classifyZone('cabernet sauvignon').zone).toBe('Wine & Beer')
    expect(classifyZone('chardonnay').zone).toBe('Wine & Beer')
  })

  it('reports keyword confidence and the matched term', () => {
    const r = classifyZone('sharp cheddar cheese')
    expect(r.zone).toBe('Dairy & Eggs')
    expect(r.confidence).toBe('keyword')
    expect(r.matchedTerm).toBeTruthy()
  })
})

describe('groupByStoreOrder', () => {
  const items = [
    { id: '1', name: 'tortilla chips' },
    { id: '2', name: 'bananas' },
    { id: '3', name: 'chicken thighs' },
    { id: '4', name: 'greek yogurt' },
    { id: '5', name: 'spinach' },
  ]

  it('returns zones in walk order, each with its items', () => {
    const groups = groupByStoreOrder(items, (i) => i.name)
    const zones = groups.map((g) => g.zone)
    // Produce (bananas, spinach) comes before Dairy before Meat before Snacks
    expect(zones.indexOf('Produce')).toBeLessThan(zones.indexOf('Dairy & Eggs'))
    expect(zones.indexOf('Dairy & Eggs')).toBeLessThan(zones.indexOf('Meat & Seafood'))
    expect(zones.indexOf('Meat & Seafood')).toBeLessThan(zones.indexOf('Snacks'))
  })

  it('groups multiple items into the same zone', () => {
    const groups = groupByStoreOrder(items, (i) => i.name)
    const produce = groups.find((g) => g.zone === 'Produce')!
    expect(produce.items.map((i) => i.name).sort()).toEqual(['bananas', 'spinach'])
  })

  it('omits zones with no items', () => {
    const groups = groupByStoreOrder([{ id: '1', name: 'bananas' }], (i) => i.name)
    expect(groups).toHaveLength(1)
    expect(groups[0].zone).toBe('Produce')
  })

  it('respects a custom zone order when provided', () => {
    const custom = ['Snacks', 'Produce']
    const groups = groupByStoreOrder(items, (i) => i.name, custom)
    expect(groups[0].zone).toBe('Snacks') // Snacks first per custom order
  })

  it('places unknown-zone items last (fallback → Pantry) without dropping them', () => {
    const groups = groupByStoreOrder([{ id: '1', name: 'zzxq widget' }, { id: '2', name: 'bananas' }], (i) => i.name)
    const all = groups.flatMap((g) => g.items.map((i) => i.id))
    expect(all.sort()).toEqual(['1', '2'])
  })
})

describe('DEFAULT_STORE_ZONES', () => {
  it('is a non-empty ordered list of unique zone names', () => {
    expect(DEFAULT_STORE_ZONES.length).toBeGreaterThan(5)
    expect(new Set(DEFAULT_STORE_ZONES).size).toBe(DEFAULT_STORE_ZONES.length)
  })
})
