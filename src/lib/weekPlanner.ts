import type { Preferences } from '../types/preferences'
import { buildRecipeConstraints } from './mealRules'

export interface MealSlot { meal_type: string; label: string }
export interface ChosenMeal { title: string }

// Per-slot constraints for the auto-planner: the household rules + a meal-type
// framing + an avoid-list of the meals already chosen this week, so each new slot
// is generated to be different (variety enforced at generation, not post-hoc).
export function slotConstraints(
  slot: MealSlot,
  chosen: ChosenMeal[],
  prefs: Preferences,
  recentTitles: string[],
): string[] {
  const lines = buildRecipeConstraints(prefs, recentTitles)
  lines.push(`This meal is the ${slot.label.toUpperCase()} — make it appropriate for ${slot.meal_type}.`)
  if (slot.meal_type === 'lunch') lines.push('Lunch must be assemble-only — no cooking.')
  if (chosen.length) {
    lines.push(
      `Make it clearly different — a different main protein AND a different cuisine — from these meals already in this week's plan: ${chosen.map((c) => c.title).join('; ')}.`,
    )
  }
  return lines
}

// Belt-and-suspenders allergen/hard-no check on the *generated* ingredients
// (never trust the prompt alone). Returns the offending term, or null.
export function violatesHardNo(ingredients: string[], hardNos: string[]): string | null {
  const hay = ingredients.join(' \n ').toLowerCase()
  for (const raw of hardNos) {
    const term = raw.trim().toLowerCase()
    if (term && hay.includes(term)) return raw
  }
  return null
}

// Coarse primary-protein classifier so we can enforce protein variety in CODE
// (the prompt alone lets two chicken dinners through). Maps a recipe's build.pro
// / ingredient text to a category token; 'other' when nothing recognized.
const PROTEIN_TOKENS: [string, string[]][] = [
  ['chicken', ['chicken']],
  ['turkey', ['turkey']],
  ['beef', ['beef', 'steak', 'ground beef']],
  ['pork', ['pork', 'bacon', 'sausage', 'ham']],
  ['salmon', ['salmon']],
  ['shrimp', ['shrimp', 'prawn']],
  ['fish', ['tuna', 'cod', 'tilapia', 'halibut', 'fish']],
  ['tofu', ['tofu', 'tempeh', 'edamame']],
  ['egg', ['egg']],
  ['legume', ['bean', 'lentil', 'chickpea', 'legume']],
  ['yogurt', ['yogurt', 'greek yogurt']],
]

export function mainProtein(pro: string[] | undefined, ingredients: string[] = []): string {
  const hay = [...(pro ?? []), ...ingredients].join(' ').toLowerCase()
  for (const [token, terms] of PROTEIN_TOKENS) {
    if (terms.some((t) => hay.includes(t))) return token
  }
  return 'other'
}

interface PricedSpecial { item: string; regular_price: number | null; sale_price: number | null }

/** Estimated savings: for each on-sale item that appears in a planned recipe's
 *  ingredients, credit (regular − sale). Substring match both directions. */
export function planSavings(
  recipes: { ingredients: { name: string }[] }[],
  specials: PricedSpecial[],
): number {
  const names = recipes.flatMap((r) => r.ingredients.map((i) => i.name.toLowerCase()))
  let total = 0
  for (const s of specials) {
    if (s.regular_price == null || s.sale_price == null) continue
    const item = s.item.toLowerCase()
    if (names.some((n) => n.includes(item) || item.includes(n))) {
      total += Math.max(0, s.regular_price - s.sale_price)
    }
  }
  return Math.round(total)
}

/** How many planned recipes use at least one on-sale item. */
export function countMealsUsingDeals(
  recipes: { ingredients: { name: string }[] }[],
  specials: { item: string }[],
): number {
  const items = specials.map((s) => s.item.toLowerCase())
  return recipes.filter((r) =>
    r.ingredients.some((i) => {
      const n = i.name.toLowerCase()
      return items.some((it) => n.includes(it) || it.includes(n))
    }),
  ).length
}
