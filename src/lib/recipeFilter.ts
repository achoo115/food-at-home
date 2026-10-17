import type { RecipeWithIngredients } from '../types/recipe'
import { matchInventoryToRecipe } from './ingredientMatcher'

// Client-side search + filtering over the (already-loaded) saved recipes. No
// Supabase round-trip — 385 rows filter instantly in memory.

export type MatchMode = 'all' | 'any'

export interface ParsedQuery {
  include: string[]
  exclude: string[]
}

// Split on commas; trim; lowercase; collapse inner whitespace; drop empty
// terms; a term starting with "-" goes to exclude (minus stripped, then
// trimmed; a bare "-" or "- " is dropped).
export function parseQuery(query: string): ParsedQuery {
  const include: string[] = []
  const exclude: string[] = []
  for (const raw of query.split(',')) {
    const term = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (term.startsWith('-')) {
      const stripped = term.slice(1).trim()
      if (stripped) exclude.push(stripped)
    } else if (term) {
      include.push(term)
    }
  }
  return { include, exclude }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/-/g, ' ')
}

// A term matches a text when the term appears as a whole-word phrase,
// case-insensitive, with an optional plural on its last word. Known,
// accepted miss: "nut" does not match "walnuts"/"peanuts".
export function termMatches(term: string, text: string): boolean {
  const normTerm = normalizeForMatch(term).trim().replace(/\s+/g, ' ')
  if (!normTerm) return false
  const words = normTerm.split(' ').map(escapeRegExp)
  const pattern = new RegExp(`(^|[^a-z0-9])${words.join('[\\s]+')}(e?s)?(?=$|[^a-z0-9])`)
  return pattern.test(normalizeForMatch(text))
}

export function filterRecipes<T extends RecipeWithIngredients>(
  recipes: T[],
  query: string,
  mode: MatchMode = 'all'
): T[] {
  const { include, exclude } = parseQuery(query)
  return recipes.filter((r) => {
    const texts = [r.title, ...r.recipe_ingredients.map((i) => i.name)]
    const hits = (term: string) => texts.some((t) => termMatches(term, t))
    const includeOk = include.length === 0 ? true : mode === 'any' ? include.some(hits) : include.every(hits)
    return includeOk && !exclude.some(hits)
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
