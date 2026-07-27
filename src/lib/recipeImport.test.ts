import { describe, it, expect } from 'vitest'
import { parseRecipeJsonLd, iso8601ToMinutes, parseNutritionGrams, extractRecipeUrls } from './recipeImport'

const wrap = (jsonld: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(jsonld)}</script></head><body>page</body></html>`

describe('iso8601ToMinutes', () => {
  it('parses hours + minutes', () => {
    expect(iso8601ToMinutes('PT30M')).toBe(30)
    expect(iso8601ToMinutes('PT1H15M')).toBe(75)
    expect(iso8601ToMinutes('PT2H')).toBe(120)
    expect(iso8601ToMinutes('P1DT2H')).toBe(1560)
  })
  it('returns 0 for missing/garbage', () => {
    expect(iso8601ToMinutes(undefined)).toBe(0)
    expect(iso8601ToMinutes('soon')).toBe(0)
  })
})

describe('parseNutritionGrams', () => {
  it('pulls the number out of "34 g", "520 calories", numbers', () => {
    expect(parseNutritionGrams('34 g')).toBe(34)
    expect(parseNutritionGrams('520 calories')).toBe(520)
    expect(parseNutritionGrams('9g')).toBe(9)
    expect(parseNutritionGrams(41)).toBe(41)
    expect(parseNutritionGrams('n/a')).toBeNull()
  })
})

describe('parseRecipeJsonLd', () => {
  it('parses a flat NYT-shaped Recipe with HowToStep instructions + nutrition', () => {
    const r = parseRecipeJsonLd(wrap({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Cacio e Pepe',
      description: 'Cheese and pepper pasta.',
      recipeIngredient: ['Kosher salt', '3/4 pound pasta', '3 tablespoons butter'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Boil the pasta.' },
        { '@type': 'HowToStep', text: 'Toss with cheese and pepper.' },
      ],
      prepTime: 'PT5M',
      cookTime: 'PT20M',
      recipeYield: '4 servings',
      nutrition: { '@type': 'NutritionInformation', calories: '520 calories', proteinContent: '18 g', carbohydrateContent: '60 g', fatContent: '22 g', fiberContent: '3 g' },
    }))
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Cacio e Pepe')
    expect(r!.ingredients).toHaveLength(3)
    expect(r!.instructions).toBe('1. Boil the pasta.\n2. Toss with cheese and pepper.')
    expect(r!.prep_time).toBe(5)
    expect(r!.cook_time).toBe(20)
    expect(r!.macros).toEqual({ calories: 520, protein_g: 18, carbs_g: 60, fat_g: 22, fiber_g: 3 })
  })

  it('finds the Recipe inside an @graph and handles @type arrays', () => {
    const r = parseRecipeJsonLd(wrap({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'ignore me' },
        { '@type': ['Recipe', 'NewsArticle'], name: 'Sheet-Pan Chicken', recipeIngredient: ['chicken', 'lemon'], recipeInstructions: 'Roast everything at 425.' },
      ],
    }))
    expect(r!.title).toBe('Sheet-Pan Chicken')
    expect(r!.instructions).toBe('1. Roast everything at 425.')
  })

  it('flattens HowToSection instructions', () => {
    const r = parseRecipeJsonLd(wrap({
      '@type': 'Recipe', name: 'Two-Part Dish', recipeIngredient: ['x'],
      recipeInstructions: [
        { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Make sauce.' }] },
        { '@type': 'HowToSection', name: 'Assembly', itemListElement: [{ '@type': 'HowToStep', text: 'Combine.' }] },
      ],
    }))
    expect(r!.instructions).toBe('1. Make sauce.\n2. Combine.')
  })

  it('treats total-only time as cook time', () => {
    const r = parseRecipeJsonLd(wrap({ '@type': 'Recipe', name: 'Quick', recipeIngredient: ['x'], recipeInstructions: 'do it', totalTime: 'PT40M' }))
    expect(r!.cook_time).toBe(40)
    expect(r!.total_time).toBe(40)
  })

  it('returns null when there is no Recipe JSON-LD', () => {
    expect(parseRecipeJsonLd('<html><body>no structured data</body></html>')).toBeNull()
    expect(parseRecipeJsonLd(wrap({ '@type': 'WebPage', name: 'Not a recipe' }))).toBeNull()
  })

  it('skips a Recipe node too sparse to be usable', () => {
    expect(parseRecipeJsonLd(wrap({ '@type': 'Recipe', name: 'Empty' }))).toBeNull()
  })
})

describe('extractRecipeUrls', () => {
  it('extracts, canonicalizes, and dedupes recipe links from Recipe Box HTML', () => {
    const html = `
      <a href="/recipes/1018147-cacio-e-pepe">x</a>
      <a href="/recipes/1018147-cacio-e-pepe">dup</a>
      <a href="https://cooking.nytimes.com/recipes/1234-sheet-pan-chicken">y</a>
      <a href="/account">not a recipe</a>`
    const urls = extractRecipeUrls(html)
    expect(urls).toContain('https://cooking.nytimes.com/recipes/1018147-cacio-e-pepe')
    expect(urls).toContain('https://cooking.nytimes.com/recipes/1234-sheet-pan-chicken')
    expect(urls).toHaveLength(2) // deduped, non-recipe link ignored
  })
})
