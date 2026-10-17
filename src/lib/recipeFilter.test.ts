import { describe, it, expect } from 'vitest'
import { filterRecipes, parseQuery, termMatches, recipeInventoryStatus, applyQuickFilter } from './recipeFilter'
import type { RecipeWithIngredients } from '../types/recipe'

function recipe(over: Partial<RecipeWithIngredients> & { title: string; ingredients: string[] }): RecipeWithIngredients {
  return {
    id: over.title, user_id: 'u', title: over.title, description: '', instructions: '',
    prep_time: over.prep_time ?? 10, cook_time: over.cook_time ?? 20, source: 'manual',
    external_id: null, is_favorited: false, times_cooked: 0,
    calories: null, protein_g: over.protein_g ?? null, carbs_g: null, fat_g: null, fiber_g: null,
    last_cooked_at: null, heart_count: 0, image_url: null, source_url: null, steps: null, build: null,
    servings: null, cost_per_serving: null, cost_estimated_at: null,
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

describe('multi-ingredient search', () => {
  // Real NYT-shaped ingredient lines, per the brief's data fact.
  const leekRecipe = recipe({
    title: 'Winter Soup',
    ingredients: ['2 leeks, trimmed, cleaned and julienned', '1 tablespoon unsalted butter, cubed'],
  })
  const russetRecipe = recipe({
    title: 'Creamy Mash',
    ingredients: ['1 pound russet potatoes', '1 cup heavy cream'],
  })

  it('parseQuery: drops empty terms from doubled/trailing commas', () => {
    expect(parseQuery('leek,,potato,')).toEqual({ include: ['leek', 'potato'], exclude: [] })
  })

  it('parseQuery: trims, lowercases, collapses whitespace, splits -terms to exclude, drops bare "-"', () => {
    expect(parseQuery(' Leek , -Cilantro , - , sweet   potato ')).toEqual({
      include: ['leek', 'sweet potato'],
      exclude: ['cilantro'],
    })
  })

  it('parseQuery: empty string is both empty', () => {
    expect(parseQuery('')).toEqual({ include: [], exclude: [] })
  })

  it('parseQuery: strips ALL leading dashes on an exclude term', () => {
    expect(parseQuery('--cilantro')).toEqual({ include: [], exclude: ['cilantro'] })
  })

  it('parseQuery: dedupes include and exclude, keeping the first occurrence', () => {
    expect(parseQuery('Leek, leek, -Cream, -cream')).toEqual({ include: ['leek'], exclude: ['cream'] })
  })

  it('termMatches: false positives on compound words', () => {
    expect(termMatches('corn', '2 teaspoons cornstarch')).toBe(false)
    expect(termMatches('salt', '1 tablespoon unsalted butter, cubed')).toBe(false)
    expect(termMatches('egg', '2 ounces finely grated Parmigiano-Reggiano')).toBe(false)
    expect(termMatches('egg', '1 small eggplant, sliced diagonally ½-inch thick')).toBe(false)
    expect(termMatches('oil', '4 cups boiling water')).toBe(false)
  })

  it('termMatches: true positives incl. plural/phrase/hyphen', () => {
    expect(termMatches('corn', '6 cups fresh corn kernels (from 6 to 7 ears fresh corn)')).toBe(true)
    expect(termMatches('leek', '2 leeks, trimmed, cleaned and julienned')).toBe(true)
    expect(termMatches('egg', '1 large egg')).toBe(true)
    expect(termMatches('egg', '4 large eggs')).toBe(true)
    expect(termMatches('tomato', '6 cups canned crushed tomatoes')).toBe(true)
    expect(termMatches('sweet potato', '2 sweet potatoes, peeled')).toBe(true)
    expect(termMatches('potato', '2 sweet potatoes, peeled')).toBe(true)
    expect(termMatches('red pepper', '½ teaspoon red-pepper flakes')).toBe(true)
    expect(termMatches('sweet potato', '1 pound russet potatoes')).toBe(false)
  })

  it('termMatches: whole-word rule allows a letter prefix (walnuts, strawberries, chickpeas) but excludes a different word that merely starts the same (peanut butter, peaches)', () => {
    expect(termMatches('nut', '¾ cup chopped walnuts')).toBe(true)
    expect(termMatches('nut', '1 cup roasted peanuts')).toBe(true)
    expect(termMatches('berry', '1 pound strawberries, hulled')).toBe(true)
    expect(termMatches('pea', '1 (15-ounce) can chickpeas, drained')).toBe(true)
    expect(termMatches('pea', '1 cup creamy peanut butter')).toBe(false)
    expect(termMatches('pea', '2 ripe peaches')).toBe(false)
  })

  it('termMatches: accepted limitation — "corn" matches "peppercorns" (measured 2026-10-17 — the price of matching walnuts/strawberries; do not "fix" by forbidding letter prefixes)', () => {
    expect(termMatches('corn', '2 teaspoons whole black peppercorns (optional)')).toBe(true)
  })

  it('filterRecipes: all vs any across two real-shaped recipes', () => {
    expect(filterRecipes([leekRecipe, russetRecipe], 'leek, potato', 'all')).toEqual([])
    expect(filterRecipes([leekRecipe, russetRecipe], 'leek, potato', 'any')).toEqual([leekRecipe, russetRecipe])
    expect(filterRecipes([leekRecipe, russetRecipe], 'leek, potato, -cream', 'any')).toEqual([leekRecipe])
  })

  it('exclusion scope: drops by ingredient, by title, and does not parse "or" alternatives (documented)', () => {
    const cilantroIngredient = recipe({
      title: 'Corn Salad',
      ingredients: ['3 tablespoons chopped fresh cilantro (optional)'],
    })
    const cilantroTitle = recipe({ title: 'Cilantro-Lime Chicken', ingredients: ['2 limes, juiced'] })
    const cilantroOr = recipe({
      title: 'Grain Bowl',
      ingredients: ['basil or cilantro leaves, for serving'],
    })
    const clean = recipe({ title: 'Plain Rice', ingredients: ['2 cups rice'] })

    expect(filterRecipes([cilantroIngredient, cilantroTitle, cilantroOr, clean], '-cilantro', 'any')).toEqual([clean])
  })

  it('title match: term hits a recipe via title even when no ingredient line says it', () => {
    const roastChicken = recipe({ title: 'Roast Chicken', ingredients: ['salt', 'thyme'] })
    const pastaOnly = recipe({ title: 'Garlic Pasta', ingredients: ['pasta', 'garlic'] })
    expect(filterRecipes([pastaOnly, roastChicken], 'chicken').map((r) => r.title)).toEqual(['Roast Chicken'])
  })

  it('default mode is "all"', () => {
    expect(filterRecipes([leekRecipe, russetRecipe], 'leek, potato')).toEqual(
      filterRecipes([leekRecipe, russetRecipe], 'leek, potato', 'all')
    )
  })

  it('single term still works on the existing bare-token fixture', () => {
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
