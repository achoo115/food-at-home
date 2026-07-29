import type { RecipeIngredient } from '../types/recipe'
import { normalizeIngredient, ingredientsMatch } from './ingredientMatcher'

export interface ConsolidatedItem {
  name: string
  quantity: number
  unit: string
  fromRecipes: string[]
}

/**
 * Merge every non-optional ingredient across the planned recipes into one buy
 * list. Group by (normalized name, unit) and sum quantity; any ingredient the
 * user already has in inventory (presence match) moves to `onHand` instead.
 */
export function consolidatePlan(
  plannedRecipes: { title: string; recipe_ingredients: RecipeIngredient[] }[],
  inventoryNames: string[],
): { toBuy: ConsolidatedItem[]; onHand: { name: string }[] } {
  const groups = new Map<string, ConsolidatedItem>()

  for (const r of plannedRecipes) {
    for (const ing of r.recipe_ingredients ?? []) {
      if (ing.is_optional) continue
      const name = normalizeIngredient(ing.name)
      if (!name) continue
      const key = `${name}::${ing.unit}`
      const existing = groups.get(key)
      if (existing) {
        existing.quantity += ing.quantity
        if (!existing.fromRecipes.includes(r.title)) existing.fromRecipes.push(r.title)
      } else {
        groups.set(key, { name, quantity: ing.quantity, unit: ing.unit, fromRecipes: [r.title] })
      }
    }
  }

  const toBuy: ConsolidatedItem[] = []
  const onHandNames = new Set<string>()
  for (const item of groups.values()) {
    if (inventoryNames.some((inv) => ingredientsMatch(inv, item.name))) {
      onHandNames.add(item.name)
    } else {
      toBuy.push(item)
    }
  }

  toBuy.sort((a, b) => a.name.localeCompare(b.name))
  const onHand = [...onHandNames].sort().map((name) => ({ name }))
  return { toBuy, onHand }
}
