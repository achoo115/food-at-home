import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RecipeWithIngredients } from '../types/recipe'
import type { SpoonacularRecipe } from '../lib/spoonacular'
import { searchByIngredients, getRecipeDetail } from '../lib/spoonacular'
import { generateRecipe } from '../lib/claude'
import type { InventoryItem } from '../types/inventory'

export function useRecipes() {
  const [savedRecipes, setSavedRecipes] = useState<RecipeWithIngredients[]>([])
  const [searchResults, setSearchResults] = useState<SpoonacularRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  const fetchSaved = useCallback(async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*)')
      .order('times_cooked', { ascending: false })
    if (!error && data) setSavedRecipes(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSaved() }, [fetchSaved])

  async function searchByInventory(items: InventoryItem[]) {
    setSearching(true)
    try {
      const ingredientNames = items.map((i) => i.name)
      const results = await searchByIngredients(ingredientNames)
      setSearchResults(results)
    } catch (e) {
      console.error('Spoonacular search failed:', e)
      setSearchResults([])
    }
    setSearching(false)
  }

  async function generateAiRecipe(
    items: InventoryItem[],
    options: { mood?: string; maxTime?: number; cuisine?: string; constraints?: string[]; onSaleItems?: string[] } = {}
  ) {
    const ingredients = items.map((i) => i.name)
    const expiring = items
      .filter((i) => {
        if (!i.expiry_date) return false
        const days = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        return days <= 3
      })
      .map((i) => i.name)

    const generated = await generateRecipe({
      ingredients,
      expiringItems: expiring.length > 0 ? expiring : undefined,
      ...options,
    })

    return generated
  }

  async function saveRecipe(recipe: {
    title: string
    description: string
    instructions: string
    prep_time: number
    cook_time: number
    source: 'api' | 'ai_generated' | 'manual' | 'imported'
    external_id?: string
    source_url?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    fiber_g?: number | null
    build?: { pro?: string[]; base?: string[]; veg?: string[]; engine?: string[] } | null
    ingredients: { name: string; quantity: number; unit: string; is_optional?: boolean }[]
  }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        user_id: user.id,
        title: recipe.title,
        description: recipe.description,
        instructions: recipe.instructions,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        source: recipe.source,
        external_id: recipe.external_id ?? null,
        source_url: recipe.source_url ?? null,
        calories: recipe.calories ?? null,
        protein_g: recipe.protein_g ?? null,
        carbs_g: recipe.carbs_g ?? null,
        fat_g: recipe.fat_g ?? null,
        fiber_g: recipe.fiber_g ?? null,
        build: recipe.build ?? null,
      })
      .select()
      .single()

    if (recipeError || !recipeData) return

    if (recipe.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map((ing) => ({
          recipe_id: recipeData.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          is_optional: ing.is_optional ?? false,
        }))
      )
    }

    await fetchSaved()
    return recipeData
  }

  async function toggleFavorite(id: string) {
    const recipe = savedRecipes.find((r) => r.id === id)
    if (!recipe) return

    const { error } = await supabase
      .from('recipes')
      .update({ is_favorited: !recipe.is_favorited })
      .eq('id', id)

    if (!error) {
      setSavedRecipes((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_favorited: !r.is_favorited } : r))
      )
    }
  }

  async function incrementCookCount(id: string) {
    const recipe = savedRecipes.find((r) => r.id === id)
    if (!recipe) return

    const nowIso = new Date().toISOString()
    await supabase
      .from('recipes')
      .update({ times_cooked: recipe.times_cooked + 1, last_cooked_at: nowIso })
      .eq('id', id)

    setSavedRecipes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, times_cooked: r.times_cooked + 1, last_cooked_at: nowIso } : r))
    )
  }

  return {
    savedRecipes, searchResults, loading, searching,
    searchByInventory, generateAiRecipe, saveRecipe,
    toggleFavorite, incrementCookCount, getRecipeDetail, refetch: fetchSaved,
  }
}
