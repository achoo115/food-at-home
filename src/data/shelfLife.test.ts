import { describe, expect, it } from 'vitest'
import { getShelfLifeDays, getOpenedShelfLifeDays } from './shelfLife'

// The owner's REAL inventory names (inventory_items, 2026-10-31) plus the four
// rows from his Whole Foods order screenshot. The "was" column is what the
// pre-2026-10-31 matcher returned (traced with tsx before the change), so a
// revert of any rule fails here with the old number in the message.
const PANTRY_SEALED: [string, number, number][] = [
  // name, expected pantry days, was
  ['Cento San Marzano Peeled Tomatoes (28 oz can)', 540, 5],
  ["Hunt's Tomatoes (can)", 540, 5],
  ['Mutti Passata (24.5 oz bottle)', 540, 180],
  ['HOBOKEN FARMS Basil Marinara, 25 OZ', 540, 180],
  ["Trader Joe's Organic Coconut Milk (13.5 oz can)", 730, 180],
  ['Goya Kidney Beans (can)', 730, 180],
  ['Amazon Grocery Great Northern Beans (can)', 730, 180],
  ['Bumble Bee Smoke Flavored Coho Salmon (3.75 oz tin)', 730, 180],
  ["Trader Joe's Hardwood Smoked Trout Fillets (tin)", 730, 180],
  ["Trader Joe's Lightly Smoked Mussels (tin)", 730, 180],
  ["Trader Joe's Lightly Smoked Salmon (tin)", 730, 180],
  ['365 Organic Amber Maple Syrup (jug)', 540, 180],
  ['Japanese curry roux (box)', 365, 180],
  ['Cooking white wine (bottle)', 365, 180],
  ['Cooking red wine (bottle)', 365, 180],
  ['Microwaveable cooked jasmine rice (bowl)', 365, 365],
  ['Century eggs (pack)', 120, 180],
]

describe('getShelfLifeDays — pantry, sealed goods', () => {
  it.each(PANTRY_SEALED)('%s → %i days (was %i)', (name, expected) => {
    expect(getShelfLifeDays(name, 'pantry')).toBe(expected)
  })

  it('table wins over the generic bottle rule for oil (Graza stays 365, not 540)', () => {
    expect(getShelfLifeDays('Graza Drizzle Extra Virgin Olive Oil (squeeze bottle)', 'pantry')).toBe(365)
    expect(getShelfLifeDays('oil', 'pantry')).toBe(365)
  })

  it('high-acid cans get 540, low-acid cans 730', () => {
    expect(getShelfLifeDays('canned pineapple', 'pantry')).toBe(540)
    expect(getShelfLifeDays('canned corn', 'pantry')).toBe(730)
  })

  it('fresh produce is unchanged', () => {
    expect(getShelfLifeDays('cherry tomatoes', 'pantry')).toBe(5)
    expect(getShelfLifeDays('tomatoes', 'fridge')).toBe(7)
    expect(getShelfLifeDays('bananas', 'pantry')).toBe(7)
  })
})

describe('getShelfLifeDays — refrigerate-only names never get a pantry container date', () => {
  it.each([
    ['Ning Chi Taiwanese Sesame Paste (寧記芝麻醬, jar)', 180],
    ['kimchi', 180],
    ['miso', 365],
    ['hummus', 7],
    ['fresh salsa', 7],
    ["Rao's refrigerated pasta sauce", 7],
  ])('%s: pantry ≤ 7, fridge = %i', (name, fridge) => {
    expect(getShelfLifeDays(name, 'pantry')).toBeLessThanOrEqual(7)
    expect(getShelfLifeDays(name, 'fridge')).toBe(fridge)
  })
})

describe('getShelfLifeDays — fridge: table wins, sealed fallback is 14, never 30/90', () => {
  it.each([
    ['Mutti Passata (24.5 oz bottle)', 7],
    ['HOBOKEN FARMS Basil Marinara, 25 OZ', 7],
    ["Trader Joe's Organic Coconut Milk (13.5 oz can)", 5],
    ['Goya Kidney Beans (can)', 4],
    ['Chobani 20g Protein Lowfat Greek Yogurt Strawberry Kiwi 6.7oz', 14],
    ['365 by Whole Foods Market Uncured Bacon & Cheddar Egg Bites, 4.2 OZ', 7],
    ['oat milk', 10],
    ['tofu', 7],
    ['Century eggs (pack)', 150],
    ['some unknown jar', 14],
  ])('%s → %i', (name, expected) => {
    expect(getShelfLifeDays(name, 'fridge')).toBe(expected)
  })
})

describe('getShelfLifeDays — freezer', () => {
  it('frozen-labelled goods get 180, egg bites 90 (not bacon\'s 30)', () => {
    expect(getShelfLifeDays('Raw Seafood Inc, Frozen, Shrimp Grilled Cocktail Sauce, 10 Ounce', 'freezer')).toBe(180)
    expect(getShelfLifeDays('365 by Whole Foods Market Uncured Bacon & Cheddar Egg Bites, 4.2 OZ', 'freezer')).toBe(90)
  })
})

describe('longest key wins', () => {
  it('century eggs is not eggs; coconut milk is not milk; peeled tomatoes is not tomatoes', () => {
    expect(getShelfLifeDays('Century eggs (pack)', 'fridge')).toBe(150)
    expect(getShelfLifeDays('eggs', 'fridge')).toBe(35)
    expect(getShelfLifeDays('coconut milk', 'fridge')).toBe(5)
    expect(getShelfLifeDays('milk', 'fridge')).toBe(7)
  })
})

describe('getOpenedShelfLifeDays', () => {
  it.each([
    ['Goya Kidney Beans (can)', 3],
    ["Trader Joe's Organic Coconut Milk (13.5 oz can)", 5],
    ['Mutti Passata (24.5 oz bottle)', 7],
    ['HOBOKEN FARMS Basil Marinara, 25 OZ', 7],
    ['365 Organic Amber Maple Syrup (jug)', 365],
    ['Graza Drizzle Extra Virgin Olive Oil (squeeze bottle)', 180],
    ['Cooking white wine (bottle)', 5],
    ['Japanese curry roux (box)', 90],
  ])('%s opened → %i days', (name, expected) => {
    expect(getOpenedShelfLifeDays(name, 'fridge')).toBe(expected)
  })

  it('never extends fresh food past its table value', () => {
    expect(getOpenedShelfLifeDays('spinach', 'fridge')).toBe(5)
    expect(getOpenedShelfLifeDays('unknown thing', 'pantry')).toBe(30)
  })
})
