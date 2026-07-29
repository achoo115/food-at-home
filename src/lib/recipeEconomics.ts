import { supabase } from './supabase'

export interface RecipeEconomics {
  servings: number
  cost_total: number
  cost_per_serving: number
}

export async function estimateEconomics(input: {
  title: string
  ingredients: { name: string; quantity: number; unit: string }[]
  servings?: number
}): Promise<RecipeEconomics> {
  const { data, error } = await supabase.functions.invoke('estimate-recipe-economics', { body: input })
  if (error) throw new Error(`Cost estimate failed: ${error.message}`)
  return data as RecipeEconomics
}
