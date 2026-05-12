import { supabase } from './supabase'

interface GenerateRecipeInput {
  ingredients: string[]
  expiringItems?: string[]
  mood?: string
  maxTime?: number
  cuisine?: string
}

interface GeneratedRecipe {
  title: string
  description: string
  prep_time: number
  cook_time: number
  instructions: string
  ingredients: {
    name: string
    quantity: number
    unit: string
    base_ingredient: string
  }[]
}

export async function generateRecipe(input: GenerateRecipeInput): Promise<GeneratedRecipe> {
  const { data, error } = await supabase.functions.invoke('generate-recipe', {
    body: input,
  })
  if (error) throw new Error(`Recipe generation failed: ${error.message}`)
  return data as GeneratedRecipe
}
