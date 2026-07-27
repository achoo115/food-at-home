import { describe, it, expect } from 'vitest'
import { ingredientTerms, highlightIngredients } from './recipeHighlight'

describe('ingredientTerms', () => {
  it('extracts core words, dropping units/quantities/prep', () => {
    const t = ingredientTerms(['3 tablespoons unsalted butter', '2 cloves garlic, minced'])
    expect(t.has('butter')).toBe(true)
    expect(t.has('garlic')).toBe(true)
    expect(t.has('tablespoon')).toBe(false)
    expect(t.has('minced')).toBe(false)
  })

  it('singularizes so plurals match', () => {
    const t = ingredientTerms(['2 onions'])
    expect(t.has('onion')).toBe(true)
  })
})

describe('highlightIngredients', () => {
  const terms = ingredientTerms(['3 tablespoons butter', '2 cloves garlic', '1 onion'])

  it('bolds ingredient words, including plurals', () => {
    const segs = highlightIngredients('Add the butter, garlic and onions.', terms)
    const bold = segs.filter((s) => s.bold).map((s) => s.text)
    expect(bold).toEqual(['butter', 'garlic', 'onions'])
  })

  it('does not bold non-ingredient words', () => {
    const segs = highlightIngredients('Cook until soft, about 5 minutes.', terms)
    expect(segs.every((s) => !s.bold)).toBe(true)
  })

  it('reassembles to the original text', () => {
    const step = 'Melt the butter and add garlic.'
    expect(highlightIngredients(step, terms).map((s) => s.text).join('')).toBe(step)
  })

  it('returns one plain segment when there are no terms', () => {
    expect(highlightIngredients('Stir well.', new Set())).toEqual([{ text: 'Stir well.', bold: false }])
  })
})
