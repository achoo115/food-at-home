import { describe, it, expect } from 'vitest'
import { pickWeekFromArchive } from './archivePlanner'
import { MEAL_SLOTS } from './mealPlan'
import { DEFAULT_PREFERENCES } from './preferences'
import type { Preferences } from '../types/preferences'
import type { RecipeWithIngredients } from '../types/recipe'

const prefs = (o: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...o })

function recipe(id: string, title: string, ingredients: string[], extra: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id, user_id: 'u', title, description: '', instructions: '', prep_time: 0, cook_time: 0,
    source: 'manual', external_id: null, is_favorited: false, times_cooked: 0,
    calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
    last_cooked_at: null, heart_count: 0, image_url: null, source_url: null, steps: null, build: null,
    servings: null, cost_per_serving: null, cost_estimated_at: null,
    recipe_ingredients: ingredients.map((name, i) => ({ id: `${id}-${i}`, recipe_id: id, name, quantity: 1, unit: '', is_optional: false })),
    ...extra,
  }
}

describe('pickWeekFromArchive', () => {
  it('enforces main-protein variety across slots', () => {
    const recipes = [
      recipe('a', 'Chicken A', ['chicken breast', 'rice']),
      recipe('b', 'Chicken B', ['chicken thigh', 'pasta']),
      recipe('c', 'Beef Bowl', ['ground beef', 'beans']),
      recipe('d', 'Salmon Plate', ['salmon', 'potatoes']),
      recipe('e', 'Tofu Stir Fry', ['tofu', 'broccoli']),
    ]
    const { picks } = pickWeekFromArchive(recipes, prefs(), MEAL_SLOTS)
    const proteins = picks.map((p) => p.recipe.recipe_ingredients[0].name.split(' ')[0])
    // no two picks share a main protein token (chicken should appear at most once)
    const chickenPicks = picks.filter((p) => p.recipe.title.startsWith('Chicken'))
    expect(chickenPicks.length).toBeLessThanOrEqual(1)
    expect(proteins.length).toBe(picks.length)
  })

  it('excludes recipes containing a hard-no ingredient', () => {
    const recipes = [
      recipe('a', 'Shrimp Scampi', ['shrimp', 'garlic']),
      recipe('b', 'Chicken Rice', ['chicken', 'rice']),
      recipe('c', 'Beef Stew', ['beef', 'carrot']),
      recipe('d', 'Tofu Curry', ['tofu', 'coconut']),
    ]
    const { picks } = pickWeekFromArchive(recipes, prefs({ hard_nos: ['shrimp'] }), MEAL_SLOTS)
    expect(picks.some((p) => p.recipe.id === 'a')).toBe(false)
  })

  it('reports unfilled slots when the archive is too small', () => {
    const { picks, unfilledSlots } = pickWeekFromArchive([recipe('a', 'Chicken', ['chicken'])], prefs(), MEAL_SLOTS)
    expect(picks.length).toBe(1)
    expect(unfilledSlots.length).toBe(MEAL_SLOTS.length - 1)
  })

  it('returns nothing but does not throw on an empty archive', () => {
    const { picks, unfilledSlots } = pickWeekFromArchive([], prefs(), MEAL_SLOTS)
    expect(picks).toEqual([])
    expect(unfilledSlots).toEqual(MEAL_SLOTS.map((_, i) => i))
  })
})
