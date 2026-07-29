import type { RecipeWithIngredients } from '../types/recipe'
import type { Preferences } from '../types/preferences'
import type { MealSlot } from './weekPlanner'
import { rankForRotation } from './mealPlan'
import { mainProtein, violatesHardNo } from './weekPlanner'

const MEAL_TYPE_KEYWORDS: Record<string, string[]> = {
  breakfast: ['oatmeal', 'oats', 'egg', 'pancake', 'waffle', 'yogurt', 'smoothie', 'granola', 'toast', 'breakfast'],
  lunch: ['salad', 'sandwich', 'wrap', 'bowl', 'soup', 'lunch'],
}

function ingredientNames(r: RecipeWithIngredients): string[] {
  return (r.recipe_ingredients ?? []).map((i) => i.name)
}

// Light, advisory meal-type fit. Dinners accept anything; breakfast/lunch prefer
// a keyword match in the title. Never blocks filling — callers relax it.
function fitsMealType(r: RecipeWithIngredients, mealType: string): boolean {
  const keywords = MEAL_TYPE_KEYWORDS[mealType]
  if (!keywords) return true
  const title = r.title.toLowerCase()
  return keywords.some((k) => title.includes(k))
}

/**
 * Fill each slot from the saved archive: rotation-ranked, hard-no-filtered, with
 * no two slots sharing a main protein. Meal-type fit is preferred but relaxed
 * before variety. A slot that cannot be filled is reported in `unfilledSlots`.
 */
export function pickWeekFromArchive(
  savedRecipes: RecipeWithIngredients[],
  prefs: Preferences,
  slots: MealSlot[],
): { picks: { slotIndex: number; recipe: RecipeWithIngredients }[]; unfilledSlots: number[] } {
  const safe = savedRecipes.filter((r) => !violatesHardNo(ingredientNames(r), prefs.hard_nos))
  const ranked = rankForRotation(safe)

  const usedIds = new Set<string>()
  const usedProteins: string[] = []
  const picks: { slotIndex: number; recipe: RecipeWithIngredients }[] = []
  const unfilledSlots: number[] = []

  for (let i = 0; i < slots.length; i++) {
    const available = ranked.filter((r) => !usedIds.has(r.id))
    const proteinOk = (r: RecipeWithIngredients) => {
      const p = mainProtein(r.build?.pro, ingredientNames(r))
      return p === 'other' || !usedProteins.includes(p)
    }
    // Preference order: fits meal type AND distinct protein → distinct protein →
    // fits meal type → anything left.
    const chosen =
      available.find((r) => fitsMealType(r, slots[i].meal_type) && proteinOk(r)) ??
      available.find((r) => proteinOk(r)) ??
      available.find((r) => fitsMealType(r, slots[i].meal_type)) ??
      available[0]

    if (!chosen) { unfilledSlots.push(i); continue }
    usedIds.add(chosen.id)
    const p = mainProtein(chosen.build?.pro, ingredientNames(chosen))
    if (p !== 'other') usedProteins.push(p)
    picks.push({ slotIndex: i, recipe: chosen })
  }

  return { picks, unfilledSlots }
}
