import { useState } from 'react'
import { useMealPlan } from '../../hooks/useMealPlan'
import { MEAL_SLOTS, rankForRotation } from '../../lib/mealPlan'
import { matchInventoryToRecipe } from '../../lib/ingredientMatcher'
import { MacroBadges } from './MacroBadges'
import type { RecipeWithIngredients } from '../../types/recipe'
import type { InventoryItem } from '../../types/inventory'

interface Props {
  savedRecipes: RecipeWithIngredients[]
  inventoryItems: InventoryItem[]
  onAddToGrocery: (names: string[]) => Promise<void>
}

function BuildPillars({ build }: { build: RecipeWithIngredients['build'] }) {
  if (!build) return null
  const parts = [
    build.pro?.length && `Pro: ${build.pro.join(', ')}`,
    build.base?.length && `Base: ${build.base.join(', ')}`,
    build.veg?.length && `Veg: ${build.veg.join(', ')}`,
    build.engine?.length && `Engine: ${build.engine.join(', ')}`,
  ].filter(Boolean)
  if (!parts.length) return null
  return <p className="text-xs text-gray-400 mt-1">{parts.join(' · ')}</p>
}

export function ThisWeekPlan({ savedRecipes, inventoryItems, onAddToGrocery }: Props) {
  const { meals, loading, setSlot, clearSlot } = useMealPlan()
  const [picking, setPicking] = useState<number | null>(null)
  const [listMsg, setListMsg] = useState('')

  const ranked = rankForRotation(savedRecipes)
  const inventoryNames = inventoryItems.map((i) => i.name)

  async function buildShoppingList() {
    const planned = meals.map((m) => m.recipe)
    const missing = new Set<string>()
    for (const r of planned) {
      const names = (r.recipe_ingredients ?? []).map((i) => i.name)
      const res = matchInventoryToRecipe(inventoryNames, names)
      res.missing.forEach((n) => missing.add(n))
    }
    const names = [...missing]
    if (names.length === 0) {
      setListMsg('Everything for this week is already in your kitchen 🎉')
      return
    }
    await onAddToGrocery(names)
    setListMsg(`Added ${names.length} item${names.length > 1 ? 's' : ''} to your shopping list`)
  }

  if (loading) return <p className="text-gray-400 text-center py-8">Loading this week…</p>

  return (
    <div className="space-y-3">
      {MEAL_SLOTS.map((slot, i) => {
        const meal = meals.find((m) => m.slot_order === i)
        return (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{slot.label}</p>
            {meal ? (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold">{meal.recipe.title}</p>
                  <MacroBadges macros={meal.recipe} className="mt-1" />
                  <BuildPillars build={meal.recipe.build} />
                </div>
                <button onClick={() => clearSlot(i)} className="text-gray-300 text-sm ml-2">✕</button>
              </div>
            ) : picking === i ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {ranked.length === 0 && <p className="text-sm text-gray-400">No saved recipes yet.</p>}
                {ranked.map((r) => (
                  <button
                    key={r.id}
                    onClick={async () => { await setSlot(r.id, slot.meal_type, i); setPicking(null) }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className="text-sm">{r.is_favorited ? '❤️ ' : ''}{r.title}</span>
                    <span className="text-xs text-gray-400">{r.last_cooked_at ? 'cooked' : 'new'}</span>
                  </button>
                ))}
                <button onClick={() => setPicking(null)} className="text-xs text-gray-400 px-3 py-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setPicking(i)} className="text-sm text-green-600 font-medium">+ Add {slot.label.toLowerCase()}</button>
            )}
          </div>
        )
      })}

      {meals.length > 0 && (
        <div className="pt-2">
          <button onClick={buildShoppingList} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold">
            Build shopping list from plan
          </button>
          {listMsg && <p className="text-sm text-gray-500 text-center mt-2">{listMsg}</p>}
        </div>
      )}
    </div>
  )
}
