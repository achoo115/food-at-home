// Pure schema.org/Recipe JSON-LD parser — the correctness core of recipe import.
// No network, no React. Given a page's HTML, extract and normalize the Recipe
// structured data that virtually every recipe site (incl. NYT Cooking) embeds.

export interface ImportedMacros {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
}

export interface NormalizedRecipe {
  title: string
  description: string
  ingredients: string[]
  instructions: string
  prep_time: number
  cook_time: number
  total_time: number
  recipe_yield: string | null
  macros: ImportedMacros
}

type Json = Record<string, unknown>

/** ISO-8601 duration (PT1H15M) → minutes. Returns 0 when absent/unparseable. */
export function iso8601ToMinutes(iso: unknown): number {
  if (typeof iso !== 'string') return 0
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return 0
  const days = Number(m[1] || 0)
  const hours = Number(m[2] || 0)
  const mins = Number(m[3] || 0)
  return days * 1440 + hours * 60 + mins
}

/** "34 g", "34g", "520 calories", 34 → 34. Returns null when no number found. */
export function parseNutritionGrams(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v !== 'string') return null
  const m = v.replace(',', '').match(/(\d+(?:\.\d+)?)/)
  return m ? Math.round(Number(m[1])) : null
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function typeMatchesRecipe(t: unknown): boolean {
  if (typeof t === 'string') return t.toLowerCase() === 'recipe'
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe')
  return false
}

// Walk every JSON-LD payload (object, array, or @graph) and return the first Recipe node.
function findRecipeNode(payload: unknown): Json | null {
  const stack: unknown[] = [payload]
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) { stack.push(...node); continue }
    if (node && typeof node === 'object') {
      const obj = node as Json
      if (typeMatchesRecipe(obj['@type'])) return obj
      if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]))
    }
  }
  return null
}

function flattenInstructions(instr: unknown): string {
  const steps: string[] = []
  const visit = (node: unknown) => {
    for (const item of asArray(node)) {
      if (typeof item === 'string') {
        const s = item.trim()
        if (s) steps.push(s)
      } else if (item && typeof item === 'object') {
        const o = item as Json
        const t = typeof o['@type'] === 'string' ? (o['@type'] as string).toLowerCase() : ''
        if (t === 'howtosection' && o.itemListElement) {
          visit(o.itemListElement)
        } else if (typeof o.text === 'string' && o.text.trim()) {
          steps.push((o.text as string).trim())
        } else if (typeof o.name === 'string' && o.name.trim()) {
          steps.push((o.name as string).trim())
        }
      }
    }
  }
  visit(instr)
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
}

function extractMacros(nutrition: unknown): ImportedMacros {
  const n = (nutrition && typeof nutrition === 'object' ? nutrition : {}) as Json
  return {
    calories: parseNutritionGrams(n.calories),
    protein_g: parseNutritionGrams(n.proteinContent),
    carbs_g: parseNutritionGrams(n.carbohydrateContent),
    fat_g: parseNutritionGrams(n.fatContent),
    fiber_g: parseNutritionGrams(n.fiberContent),
  }
}

function coerceYield(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === 'string') as string | undefined
    return s?.trim() || (v.length ? String(v[0]) : null)
  }
  return null
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

/** Extract the raw JSON-LD script contents from a page's HTML. */
export function extractLdJsonBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
}

/** Parse already-extracted JSON-LD blocks into a normalized recipe, or null. */
export function parseLdJsonBlocks(blocks: string[]): NormalizedRecipe | null {
  for (const raw of blocks) {
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      continue
    }
    const recipe = findRecipeNode(payload)
    if (!recipe) continue

    const title = typeof recipe.name === 'string' ? stripTags(recipe.name) : ''
    const ingredients = asArray(recipe.recipeIngredient as unknown)
      .filter((x): x is string => typeof x === 'string')
      .map((x) => stripTags(x))
      .filter(Boolean)
    const instructions = flattenInstructions(recipe.recipeInstructions)

    // Require enough to be a real recipe.
    if (!title || (ingredients.length === 0 && !instructions)) continue

    const total = iso8601ToMinutes(recipe.totalTime)
    const prep = iso8601ToMinutes(recipe.prepTime)
    let cook = iso8601ToMinutes(recipe.cookTime)
    if (!prep && !cook && total) cook = total // only total given → treat as cook

    return {
      title,
      description: typeof recipe.description === 'string' ? stripTags(recipe.description) : '',
      ingredients,
      instructions,
      prep_time: prep,
      cook_time: cook,
      total_time: total || prep + cook,
      recipe_yield: coerceYield(recipe.recipeYield),
      macros: extractMacros(recipe.nutrition),
    }
  }
  return null
}

/** Parse a page's HTML into a normalized recipe, or null if no usable Recipe JSON-LD. */
export function parseRecipeJsonLd(html: string): NormalizedRecipe | null {
  return parseLdJsonBlocks(extractLdJsonBlocks(html))
}

/**
 * Pull absolute NYT Cooking recipe URLs out of a Recipe Box page's HTML.
 * Matches `/recipes/<id>-<slug>` links (relative or absolute), dedupes, and
 * returns canonical `https://cooking.nytimes.com/...` URLs.
 */
export function extractRecipeUrls(html: string, origin = 'https://cooking.nytimes.com'): string[] {
  const seen = new Set<string>()
  for (const m of html.matchAll(/\/recipes\/(\d+)-[a-z0-9-]+/gi)) {
    seen.add(origin + m[0])
  }
  return [...seen]
}
