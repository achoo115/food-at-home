// Bold ingredient words inside a step's prose ("Add the butter and garlic…").
// Ingredient lines are raw ("3 tablespoons unsalted butter") but steps reference
// the bare noun ("butter"), so we extract meaningful words from each ingredient
// line and highlight their occurrences. Purely cosmetic — a missed or stray bold
// costs nothing — so approximate matching (drop units/prep words, loose plurals)
// is fine here.

// Words that appear in ingredient lines AND commonly in step prose — bolding them
// would be noise. Units, measurements, and prep/connective words.
const STOP = new Set([
  'cup', 'cups', 'tablespoon', 'tablespoons', 'tbsp', 'teaspoon', 'teaspoons', 'tsp',
  'pound', 'pounds', 'lb', 'lbs', 'ounce', 'ounces', 'oz', 'gram', 'grams', 'kilogram',
  'pinch', 'pinches', 'dash', 'dashes', 'can', 'cans', 'jar', 'jars', 'package', 'packages',
  'slice', 'slices', 'piece', 'pieces', 'sprig', 'sprigs', 'stick', 'sticks', 'head', 'heads',
  'bunch', 'bunches', 'handful', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'liter', 'liters',
  'and', 'or', 'of', 'to', 'for', 'the', 'with', 'plus', 'more', 'less', 'taste', 'optional',
  'about', 'into', 'large', 'small', 'medium', 'fresh', 'freshly', 'finely', 'coarsely', 'thinly',
  'roughly', 'chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded', 'ground', 'crushed',
  'peeled', 'seeded', 'cored', 'halved', 'quartered', 'cut', 'trimmed', 'room', 'temperature',
  'divided', 'packed', 'warm', 'cold', 'hot', 'ripe', 'extra', 'virgin', 'pure', 'light', 'dark',
  'reduced', 'fat', 'free', 'all', 'purpose', 'plain', 'whole', 'dry', 'dried', 'kosher', 'sea',
])

// Loose singular stem: drop a single trailing 's' (onions→onion, cloves→clove).
function stem(w: string): string {
  const l = w.toLowerCase()
  return l.length > 3 && l.endsWith('s') ? l.slice(0, -1) : l
}

// Build the set of ingredient-word stems to bold, from raw ingredient lines.
export function ingredientTerms(names: string[]): Set<string> {
  const terms = new Set<string>()
  for (const name of names) {
    for (const word of name.match(/[A-Za-z]+/g) ?? []) {
      const w = word.toLowerCase()
      if (w.length < 3 || STOP.has(w)) continue
      terms.add(stem(w))
    }
  }
  return terms
}

export interface StepSegment { text: string; bold: boolean }

// Split a step into segments, marking runs that match an ingredient term.
export function highlightIngredients(step: string, terms: Set<string>): StepSegment[] {
  if (terms.size === 0) return [{ text: step, bold: false }]
  const segments: StepSegment[] = []
  for (const chunk of step.match(/[A-Za-z]+|[^A-Za-z]+/g) ?? []) {
    const bold = /[A-Za-z]/.test(chunk) && terms.has(stem(chunk))
    const last = segments[segments.length - 1]
    if (last && last.bold === bold) last.text += chunk
    else segments.push({ text: chunk, bold })
  }
  return segments
}
