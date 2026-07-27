import { describe, it, expect } from 'vitest'
import { splitSteps } from './recipeSteps'

describe('splitSteps', () => {
  it('returns [] for empty', () => {
    expect(splitSteps('')).toEqual([])
    expect(splitSteps(null)).toEqual([])
    expect(splitSteps(undefined)).toEqual([])
  })

  it('splits HTML <li> lists', () => {
    const html = '<ol><li>Preheat oven to 350 degrees.</li><li>Mix flour and butter.</li></ol>'
    expect(splitSteps(html)).toEqual(['Preheat oven to 350 degrees.', 'Mix flour and butter.'])
  })

  it('splits HTML <p> paragraphs when no list', () => {
    const html = '<p>Chop the onion.</p><p>Sauté until soft.</p>'
    expect(splitSteps(html)).toEqual(['Chop the onion.', 'Sauté until soft.'])
  })

  it('splits newline-separated steps and strips leading numbers', () => {
    const txt = '1. Boil water.\n2. Add pasta.\n3. Drain.'
    expect(splitSteps(txt)).toEqual(['Boil water.', 'Add pasta.', 'Drain.'])
  })

  it('splits single-line numbered prose', () => {
    const txt = '1. Heat oil in a pan. 2. Add garlic and cook 2 to 4 minutes. 3. Serve.'
    expect(splitSteps(txt)).toEqual([
      'Heat oil in a pan.',
      'Add garlic and cook 2 to 4 minutes.',
      'Serve.',
    ])
  })

  it('does NOT split on decimals or temperatures inside a step', () => {
    const txt = 'Bake at 350 degrees for 1.5 hours until golden.'
    expect(splitSteps(txt)).toEqual(['Bake at 350 degrees for 1.5 hours until golden.'])
  })

  it('keeps an unstructured blob as a single step', () => {
    const txt = 'Combine everything in a bowl and bake until done, then let it rest before serving.'
    expect(splitSteps(txt)).toEqual([txt])
  })

  it('handles a single numbered step without over-splitting', () => {
    expect(splitSteps('1. Just do the one thing.')).toEqual(['Just do the one thing.'])
  })
})
