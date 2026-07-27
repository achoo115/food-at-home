import { useState } from 'react'
import { useRecipes } from '../hooks/useRecipes'
import { useInventory } from '../hooks/useInventory'
import { useCookingLog } from '../hooks/useCookingLog'
import { usePreferences } from '../hooks/usePreferences'
import { buildRecipeConstraints } from '../lib/mealRules'
import { RecipeCard } from '../components/recipes/RecipeCard'
import { RecipeDetail } from '../components/recipes/RecipeDetail'
import { RecipeList } from '../components/recipes/RecipeList'
import { AiRecipeChat } from '../components/recipes/AiRecipeChat'
import { CookModal } from '../components/recipes/CookModal'
import { ThisWeekPlan } from '../components/recipes/ThisWeekPlan'
import { SpecialsCard } from '../components/recipes/SpecialsCard'
import { RecipeImport } from '../components/recipes/RecipeImport'
import { useGroceryList } from '../hooks/useGroceryList'
import { useSpecials } from '../hooks/useSpecials'
import type { SpoonacularDetail } from '../lib/spoonacular'

type Tab = 'week' | 'import' | 'search' | 'ai' | 'saved'

export function RecipesPage() {
  const { items: inventoryItems, deductQuantity } = useInventory()
  const recipes = useRecipes()
  const cookingLog = useCookingLog()
  const { preferences } = usePreferences()
  const grocery = useGroceryList()
  const { specials } = useSpecials()
  const [tab, setTab] = useState<Tab>('week')
  const [selectedSpoonId, setSelectedSpoonId] = useState<number | null>(null)
  const [cookRecipe, setCookRecipe] = useState<{ id?: string; name: string; ingredients: { name: string; quantity: number; unit: string }[] } | null>(null)

  async function handleSearch() {
    await recipes.searchByInventory(inventoryItems)
  }

  async function handleSaveSpoonacular(detail: SpoonacularDetail) {
    await recipes.saveRecipe({
      title: detail.title,
      description: detail.summary,
      instructions: detail.instructions,
      prep_time: detail.preparationMinutes || 0,
      cook_time: detail.cookingMinutes || detail.readyInMinutes,
      source: 'api',
      external_id: String(detail.id),
      ingredients: detail.extendedIngredients.map((i) => ({
        name: i.name, quantity: i.amount, unit: i.unit,
      })),
    })
  }

  async function handleCookConfirm(deductions: { itemId: string; amount: number }[], rating?: number, notes?: string) {
    for (const d of deductions) {
      await deductQuantity(d.itemId, d.amount)
    }
    const recipeId = cookRecipe?.id ?? null
    await cookingLog.logCook(recipeId, rating, notes)
    if (recipeId) await recipes.incrementCookCount(recipeId)
    setCookRecipe(null)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'import', label: 'Import' },
    { key: 'search', label: 'Make?' },
    { key: 'ai', label: 'AI Chef' },
    { key: 'saved', label: 'Saved' },
  ]

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-2 rounded-md text-sm font-medium ${tab === t.key ? 'bg-white shadow-sm text-green-700' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'week' && (
        <div className="space-y-3">
          <SpecialsCard />
          <ThisWeekPlan
            savedRecipes={recipes.savedRecipes}
            inventoryItems={inventoryItems}
            onAddToGrocery={async (names) => { for (const n of names) await grocery.addItem(n) }}
          />
        </div>
      )}

      {tab === 'import' && (
        <RecipeImport
          onSave={async (r) => {
            await recipes.saveRecipe({
              title: r.title,
              description: r.description,
              instructions: r.instructions,
              prep_time: r.prep_time,
              cook_time: r.cook_time,
              source: 'imported',
              source_url: r.source_url,
              calories: r.calories,
              protein_g: r.protein_g,
              carbs_g: r.carbs_g,
              fat_g: r.fat_g,
              fiber_g: r.fiber_g,
              build: r.build,
              ingredients: r.ingredients.map((name) => ({ name, quantity: 1, unit: '' })),
            })
          }}
        />
      )}

      {tab === 'search' && (
        <div className="space-y-4">
          <button onClick={handleSearch} disabled={recipes.searching || inventoryItems.length === 0} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
            {recipes.searching ? 'Searching...' : `Search with ${inventoryItems.length} ingredients`}
          </button>
          <div className="grid grid-cols-2 gap-3">
            {recipes.searchResults.map((r) => (
              <RecipeCard key={r.id} recipe={r} onClick={setSelectedSpoonId} />
            ))}
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <AiRecipeChat
          inventoryItems={inventoryItems}
          onGenerate={(items, options) => {
            const recentTitles = recipes.savedRecipes.slice(0, 8).map((r) => r.title)
            const constraints = buildRecipeConstraints(preferences, recentTitles)
            const onSaleItems = specials.map((s) => s.item)
            return recipes.generateAiRecipe(items, { ...options, constraints, onSaleItems })
          }}
          onSave={async (recipe) => {
            await recipes.saveRecipe({
              title: recipe.title,
              description: recipe.description,
              instructions: recipe.instructions,
              prep_time: recipe.prep_time,
              cook_time: recipe.cook_time,
              source: 'ai_generated',
              calories: recipe.calories ?? null,
              protein_g: recipe.protein_g ?? null,
              carbs_g: recipe.carbs_g ?? null,
              fat_g: recipe.fat_g ?? null,
              fiber_g: recipe.fiber_g ?? null,
              build: recipe.build ?? null,
              ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
            })
          }}
          onCook={(recipe) => {
            setCookRecipe({
              name: recipe.title,
              ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
            })
          }}
        />
      )}

      {tab === 'saved' && (
        <RecipeList
          recipes={recipes.savedRecipes}
          inventoryItems={inventoryItems}
          onSelect={(r) => {
            setCookRecipe({
              id: r.id,
              name: r.title,
              ingredients: r.recipe_ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
            })
          }}
          onToggleFavorite={recipes.toggleFavorite}
        />
      )}

      <RecipeDetail
        recipeId={selectedSpoonId}
        onClose={() => setSelectedSpoonId(null)}
        onSave={handleSaveSpoonacular}
        onCook={(detail) => {
          setSelectedSpoonId(null)
          setCookRecipe({
            name: detail.title,
            ingredients: detail.extendedIngredients.map((i) => ({ name: i.name, quantity: i.amount, unit: i.unit })),
          })
        }}
      />

      {cookRecipe && (
        <CookModal
          open={!!cookRecipe}
          onClose={() => setCookRecipe(null)}
          recipeName={cookRecipe.name}
          ingredients={cookRecipe.ingredients}
          inventoryItems={inventoryItems}
          onConfirm={handleCookConfirm}
        />
      )}
    </div>
  )
}
