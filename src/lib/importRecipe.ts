import { supabase } from './supabase'
import { parseLdJsonBlocks, type NormalizedRecipe } from './recipeImport'

// Common shape for the import preview + save, from either source path.
export interface ImportedRecipe {
  title: string
  description: string
  prep_time: number
  cook_time: number
  ingredients: string[]
  instructions: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  build: { pro?: string[]; base?: string[]; veg?: string[]; engine?: string[] } | null
  source_url: string | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

function fromNormalized(n: NormalizedRecipe, url: string): ImportedRecipe {
  return {
    title: n.title, description: n.description, prep_time: n.prep_time, cook_time: n.cook_time,
    ingredients: n.ingredients, instructions: n.instructions,
    calories: n.macros.calories, protein_g: n.macros.protein_g, carbs_g: n.macros.carbs_g,
    fat_g: n.macros.fat_g, fiber_g: n.macros.fiber_g, build: null, source_url: url,
  }
}

function fromParsed(p: Record<string, unknown>, url: string | null): ImportedRecipe {
  return {
    title: String(p.title ?? ''), description: String(p.description ?? ''),
    prep_time: num(p.prep_time) ?? 0, cook_time: num(p.cook_time) ?? 0,
    ingredients: Array.isArray(p.ingredients) ? (p.ingredients as unknown[]).map(String) : [],
    instructions: String(p.instructions ?? ''),
    calories: num(p.calories), protein_g: num(p.protein_g), carbs_g: num(p.carbs_g),
    fat_g: num(p.fat_g), fiber_g: num(p.fiber_g),
    build: (p.build && typeof p.build === 'object' ? p.build as ImportedRecipe['build'] : null),
    source_url: url,
  }
}

/** URL path: fetch the page (server proxy) and parse its schema.org JSON-LD.
 *  Returns null when the page is blocked/gated or has no usable recipe data. */
export async function importFromUrl(url: string): Promise<ImportedRecipe | null> {
  const { data, error } = await supabase.functions.invoke('import-recipe', { body: { url } })
  if (error || !data || data.error) return null
  const blocks: string[] = Array.isArray(data.blocks) ? data.blocks : []
  const parsed = parseLdJsonBlocks(blocks)
  return parsed ? fromNormalized(parsed, data.finalUrl || url) : null
}

/** Fallback: parse pasted recipe text via the LLM. */
export async function importFromText(text: string, url: string | null = null): Promise<ImportedRecipe> {
  const { data, error } = await supabase.functions.invoke('parse-recipe', { body: { text } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return fromParsed(data, url)
}

/** Fallback: parse a screenshot of a recipe via the LLM (vision). */
export async function importFromImage(imageBase64: string, mediaType: string): Promise<ImportedRecipe> {
  const { data, error } = await supabase.functions.invoke('parse-recipe', { body: { imageBase64, mediaType } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return fromParsed(data, null)
}
