import type { RecipeWithIngredients } from '../types/recipe'
import { matchInventoryToRecipe } from './ingredientMatcher'

// Client-side search + filtering over the (already-loaded) saved recipes. No
// Supabase round-trip — 385 rows filter instantly in memory.

export function filterRecipes<T extends RecipeWithIngredients>(recipes: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return recipes
  return recipes.filter((r) => {
    if (r.title.toLowerCase().includes(q)) return true
    return r.recipe_ingredients.some((i) => i.name.toLowerCase().includes(q))
  })
}

export interface RecipeInventoryStatus {
  have: number
  total: number
  missing: string[]
  ready: boolean
}

export function recipeInventoryStatus(
  recipe: RecipeWithIngredients,
  inventoryNames: string[]
): RecipeInventoryStatus {
  const names = recipe.recipe_ingredients.map((i) => i.name)
  const { matched, missing } = matchInventoryToRecipe(inventoryNames, names)
  return {
    have: matched.length,
    total: names.length,
    missing,
    ready: names.length > 0 && missing.length === 0,
  }
}

export type QuickFilter = 'all' | 'onhand' | 'quick' | 'protein'

export function applyQuickFilter<T extends RecipeWithIngredients>(
  recipes: T[],
  filter: QuickFilter,
  inventoryNames: string[]
): T[] {
  switch (filter) {
    case 'onhand':
      // Ready first, then fewest-missing; drop recipes with no ingredient data.
      return recipes
        .map((r) => ({ r, s: recipeInventoryStatus(r, inventoryNames) }))
        .filter((x) => x.s.total > 0)
        .sort((a, b) => a.s.missing.length - b.s.missing.length)
        .map((x) => x.r)
    case 'quick':
      return recipes.filter((r) => r.prep_time + r.cook_time > 0 && r.prep_time + r.cook_time <= 30)
    case 'protein':
      return recipes.filter((r) => (r.protein_g ?? 0) >= 25)
    default:
      return recipes
  }
}
