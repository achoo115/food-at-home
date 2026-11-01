import { describe, expect, it } from 'vitest'
import { inferContainer, isRefrigerateOnly } from './container'

describe('inferContainer', () => {
  it.each([
    ['Goya Kidney Beans (can)', 'can'],
    ["Trader Joe's Lightly Smoked Mussels (tin)", 'can'],
    ['Cento San Marzano Peeled Tomatoes (28 oz can)', 'can'],
    ['HOBOKEN FARMS Basil Marinara, 25 OZ', 'jar'],
    ['Mutti Passata (24.5 oz bottle)', 'bottle'],
    ['365 Organic Amber Maple Syrup (jug)', 'bottle'],
    ['Graza Drizzle Extra Virgin Olive Oil (squeeze bottle)', 'bottle'],
    ['Japanese curry roux (box)', 'box'],
    ['Raw Seafood Inc, Frozen, Shrimp Grilled Cocktail Sauce, 10 Ounce', 'frozen'],
    ['chicken broth', 'carton'],
    ['cherry tomatoes', null],
    ['Chobani Greek Yogurt', null],
  ])('%s → %s', (name, expected) => {
    expect(inferContainer(name)).toBe(expected)
  })

  it('explicit packaging word beats the product class (frozen marinara is frozen)', () => {
    expect(inferContainer('frozen marinara meatballs')).toBe('frozen')
  })

  it('uses word boundaries: "cannellini" is a can by class, not by the word "can"', () => {
    expect(inferContainer('cannellini')).toBe('can')
    expect(inferContainer('scandinavian crackers')).toBe('box')
  })
})

describe('isRefrigerateOnly', () => {
  it.each([
    ['Ning Chi Taiwanese Sesame Paste (寧記芝麻醬, jar)', true],
    ['kimchi', true],
    ['miso', true],
    ['Chobani Greek Yogurt', true],
    ['whole milk', true],
    ['coconut milk', false],
    ['oat milk', false],
    ['Century eggs (pack)', false],
    ['eggs', true],
    ['tahini', false],
    ['HOBOKEN FARMS Basil Marinara, 25 OZ', false],
  ])('%s → %s', (name, expected) => {
    expect(isRefrigerateOnly(name)).toBe(expected)
  })
})
