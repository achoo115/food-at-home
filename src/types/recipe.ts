export type RecipeSource = 'api' | 'ai_generated' | 'manual'

export interface Recipe {
  id: string
  user_id: string
  title: string
  description: string
  instructions: string
  prep_time: number
  cook_time: number
  source: RecipeSource
  external_id: string | null
  is_favorited: boolean
  times_cooked: number
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  last_cooked_at: string | null
  heart_count: number
  image_url: string | null
  source_url: string | null
  build: { pro?: string[]; base?: string[]; veg?: string[]; engine?: string[] } | null
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  name: string
  quantity: number
  unit: string
  is_optional: boolean
}

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: RecipeIngredient[]
}
