const API_KEY = import.meta.env.VITE_SPOONACULAR_API_KEY
const BASE = 'https://api.spoonacular.com'

export interface SpoonacularRecipe {
  id: number
  title: string
  image: string
  usedIngredientCount: number
  missedIngredientCount: number
  missedIngredients: { name: string }[]
  usedIngredients: { name: string }[]
}

export interface SpoonacularDetail {
  id: number
  title: string
  summary: string
  instructions: string
  readyInMinutes: number
  preparationMinutes: number
  cookingMinutes: number
  extendedIngredients: {
    name: string
    amount: number
    unit: string
  }[]
}

export async function searchByIngredients(ingredients: string[], count = 10): Promise<SpoonacularRecipe[]> {
  if (!API_KEY) throw new Error('Spoonacular API key not configured')
  const params = new URLSearchParams({
    apiKey: API_KEY,
    ingredients: ingredients.join(','),
    number: String(count),
    ranking: '1',
    ignorePantry: 'true',
  })
  const res = await fetch(`${BASE}/recipes/findByIngredients?${params}`)
  if (!res.ok) throw new Error(`Spoonacular error: ${res.status}`)
  return res.json()
}

export async function getRecipeDetail(id: number): Promise<SpoonacularDetail> {
  const params = new URLSearchParams({ apiKey: API_KEY })
  const res = await fetch(`${BASE}/recipes/${id}/information?${params}`)
  if (!res.ok) throw new Error(`Spoonacular error: ${res.status}`)
  return res.json()
}
