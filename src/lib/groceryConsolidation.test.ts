import { describe, it, expect } from 'vitest'
import { consolidatePlan } from './groceryConsolidation'
import type { RecipeIngredient } from '../types/recipe'

function ing(name: string, quantity = 1, unit = '', is_optional = false): RecipeIngredient {
  return { id: `${name}-${unit}`, recipe_id: 'r', name, quantity, unit, is_optional }
}

describe('consolidatePlan', () => {
  it('merges the same ingredient across recipes and sums quantity', () => {
    const { toBuy } = consolidatePlan(
      [
        { title: 'Stir Fry', recipe_ingredients: [ing('chicken breast', 1, 'lb')] },
        { title: 'Soup', recipe_ingredients: [ing('chicken', 2, 'lb')] },
      ],
      [],
    )
    const chicken = toBuy.find((i) => i.name === 'chicken')
    expect(chicken).toBeDefined()
    expect(chicken!.quantity).toBe(3)
    expect(chicken!.fromRecipes.sort()).toEqual(['Soup', 'Stir Fry'])
  })

  it('keeps different units as separate lines', () => {
    const { toBuy } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('milk', 1, 'cup'), ing('milk', 1, 'tbsp')] }],
      [],
    )
    expect(toBuy.filter((i) => i.name === 'milk').length).toBe(2)
  })

  it('moves inventory matches to onHand and out of toBuy', () => {
    const { toBuy, onHand } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('rice', 1, 'cup'), ing('salmon', 1, 'lb')] }],
      ['brown rice'],
    )
    expect(onHand.some((i) => i.name === 'rice')).toBe(true)
    expect(toBuy.some((i) => i.name === 'rice')).toBe(false)
    expect(toBuy.some((i) => i.name === 'salmon')).toBe(true)
  })

  it('excludes optional ingredients', () => {
    const { toBuy } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('parsley', 1, '', true), ing('beef', 1, 'lb')] }],
      [],
    )
    expect(toBuy.some((i) => i.name === 'parsley')).toBe(false)
    expect(toBuy.some((i) => i.name === 'beef')).toBe(true)
  })
})
