import { describe, it, expect } from 'vitest'
import { filterRecipes, recipeInventoryStatus, applyQuickFilter } from './recipeFilter'
import type { RecipeWithIngredients } from '../types/recipe'

function recipe(over: Partial<RecipeWithIngredients> & { title: string; ingredients: string[] }): RecipeWithIngredients {
  return {
    id: over.title, user_id: 'u', title: over.title, description: '', instructions: '',
    prep_time: over.prep_time ?? 10, cook_time: over.cook_time ?? 20, source: 'manual',
    external_id: null, is_favorited: false, times_cooked: 0,
    calories: null, protein_g: over.protein_g ?? null, carbs_g: null, fat_g: null, fiber_g: null,
    last_cooked_at: null, heart_count: 0, image_url: null, source_url: null, steps: null, build: null,
    recipe_ingredients: over.ingredients.map((name, i) => ({
      id: `${over.title}-${i}`, recipe_id: over.title, name, quantity: 1, unit: '', is_optional: false,
    })),
  }
}

const pasta = recipe({ title: 'Garlic Pasta', ingredients: ['pasta', 'garlic', 'olive oil'] })
const chicken = recipe({ title: 'Roast Chicken', ingredients: ['chicken', 'salt', 'thyme'], prep_time: 15, cook_time: 60, protein_g: 40 })

describe('filterRecipes', () => {
  it('returns all when query empty', () => {
    expect(filterRecipes([pasta, chicken], '  ')).toHaveLength(2)
  })
  it('matches on title', () => {
    expect(filterRecipes([pasta, chicken], 'roast').map((r) => r.title)).toEqual(['Roast Chicken'])
  })
  it('matches on ingredient', () => {
    expect(filterRecipes([pasta, chicken], 'garlic').map((r) => r.title)).toEqual(['Garlic Pasta'])
  })
})

describe('recipeInventoryStatus', () => {
  it('reports have/total and ready', () => {
    const s = recipeInventoryStatus(pasta, ['pasta', 'garlic', 'olive oil'])
    expect(s).toMatchObject({ have: 3, total: 3, ready: true })
    expect(s.missing).toHaveLength(0)
  })
  it('reports missing items', () => {
    const s = recipeInventoryStatus(pasta, ['pasta'])
    expect(s.have).toBe(1)
    expect(s.missing).toEqual(['garlic', 'olive oil'])
    expect(s.ready).toBe(false)
  })
})

describe('applyQuickFilter', () => {
  it('onhand sorts by fewest missing', () => {
    const out = applyQuickFilter([chicken, pasta], 'onhand', ['pasta', 'garlic', 'olive oil'])
    expect(out[0].title).toBe('Garlic Pasta')
  })
  it('quick keeps <=30 min total', () => {
    expect(applyQuickFilter([chicken, pasta], 'quick', []).map((r) => r.title)).toEqual(['Garlic Pasta'])
  })
  it('protein keeps >=25g', () => {
    expect(applyQuickFilter([chicken, pasta], 'protein', []).map((r) => r.title)).toEqual(['Roast Chicken'])
  })
})
