import { supabase } from './supabase'

interface GenerateRecipeInput {
  ingredients: string[]
  expiringItems?: string[]
  onSaleItems?: string[]
  mood?: string
  maxTime?: number
  cuisine?: string
  constraints?: string[]
}

export interface GeneratedRecipe {
  title: string
  description: string
  prep_time: number
  cook_time: number
  instructions: string
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  build?: { pro?: string[]; base?: string[]; veg?: string[]; engine?: string[] } | null
  ingredients: {
    name: string
    quantity: number
    unit: string
    base_ingredient: string
  }[]
}

// A request that never answers (a dead connection mid-plan) used to hold the
// planner on one slot forever. After this long it fails like any other error:
// the planner counts the slot as not planned and moves on.
export const GENERATE_TIMEOUT_MS = 45_000

export async function generateRecipe(input: GenerateRecipeInput): Promise<GeneratedRecipe> {
  const { data, error } = await supabase.functions.invoke('generate-recipe', {
    body: input,
    timeout: GENERATE_TIMEOUT_MS,
  })
  if (error) throw new Error(`Recipe generation failed: ${error.message}`)
  return data as GeneratedRecipe
}
