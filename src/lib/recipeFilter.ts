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
// terms; a term starting with one or more "-" goes to exclude (all leading
// dashes stripped, then trimmed; a bare run of dashes like "-" or "--" is
// dropped). Include and exclude each dedupe, keeping the first occurrence.
export function parseQuery(query: string): ParsedQuery {
  const include: string[] = []
  const exclude: string[] = []
  for (const raw of query.split(',')) {
    const term = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (term.startsWith('-')) {
      const stripped = term.replace(/^-+/, '').trim()
      if (stripped && !exclude.includes(stripped)) exclude.push(stripped)
    } else if (term && !include.includes(term)) {
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

// A term matches a text when it appears as a whole word, or as the ENDING of
// a longer word (walnuts, strawberry, chickpeas), with an optional plural on
// the last word; case-insensitive. Prefixes never match (corn ≠
// cornstarch/cornmeal, salt ≠ unsalted, egg ≠ eggplant, oil ≠ boiling).
// Accepted: corn DOES match peppercorns (measured 2026-10-17: 11 rows of 395),
// nut matches coconut/butternut — the price of matching walnuts/strawberries.
//
// Deviation from the literal `(e?s)?` suffix handed down for this fix round:
// that suffix alone does not match "berry" against "strawberries" (plural
// of a word ending in "y" is "-ies", not "-s"/"-es" — "strawberries" has no
// "berry" substring, only "berri"+"es"), so the required test (berry ∈
// "1 pound strawberries, hulled") fails against it (verified by running the
// literal regex: `/berry(e?s)?/.test('strawberries')` → false). Extended the
// last-word suffix to also accept the standard y→ies plural; every other
// required case (nut/walnuts, pea/chickpeas, corn/peppercorns, salt, egg,
// oil, leek, sweet potato, red pepper) is unaffected — see the mismatch
// check run against all of them before this was committed.
export function termMatches(term: string, text: string): boolean {
  const normTerm = normalizeForMatch(term).trim().replace(/\s+/g, ' ')
  if (!normTerm) return false
  const words = normTerm.split(' ')
  const last = words[words.length - 1]
  const rest = words.slice(0, -1).map(escapeRegExp)
  const lastFrag =
    last.length > 1 && last.endsWith('y')
      ? `${escapeRegExp(last.slice(0, -1))}(y(e?s)?|ies)`
      : `${escapeRegExp(last)}(e?s)?`
  const body = [...rest, lastFrag].join('[\\s]+')
  const pattern = new RegExp(`(^|[^a-z0-9])[a-z]*${body}(?=$|[^a-z0-9])`)
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
