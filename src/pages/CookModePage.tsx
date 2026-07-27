import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecipes } from '../hooks/useRecipes'
import { useInventory } from '../hooks/useInventory'
import { useCookingLog } from '../hooks/useCookingLog'
import { useWakeLock } from '../hooks/useWakeLock'
import { CookModal } from '../components/recipes/CookModal'
import { splitSteps } from '../lib/recipeSteps'

// Full-screen, one-step-at-a-time guided cooking. Screen stays awake (the thing
// NYT's own app lacks). No inventory logic lives here — finishing the last step
// hands off to the existing deduct/rate modal (the "log it" job).
export function CookModePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { savedRecipes, loading, incrementCookCount } = useRecipes()
  const { items: inventoryItems, deductQuantity } = useInventory()
  const cookingLog = useCookingLog()

  const [step, setStep] = useState(0)
  const [showIngredients, setShowIngredients] = useState(false)
  const [logging, setLogging] = useState(false)

  const held = useWakeLock(true)

  const recipe = savedRecipes.find((r) => r.id === id)

  if (loading) return <div className="fixed inset-0 flex items-center justify-center text-gray-400">Loading…</div>
  if (!recipe) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-400">Recipe not found.</p>
        <button onClick={() => navigate('/recipes')} className="text-green-600 font-medium">← Back</button>
      </div>
    )
  }

  const steps = recipe.steps?.length ? recipe.steps : splitSteps(recipe.instructions)
  const total = steps.length
  const isLast = step >= total - 1

  async function handleCookConfirm(deductions: { itemId: string; amount: number }[], rating?: number, notes?: string) {
    for (const d of deductions) await deductQuantity(d.itemId, d.amount)
    await cookingLog.logCook(recipe!.id, rating, notes)
    await incrementCookCount(recipe!.id)
    setLogging(false)
    navigate('/recipes')
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-50">
      {/* Top rail */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <button onClick={() => navigate(`/recipes/${recipe.id}`)} className="text-gray-400 text-xl w-10 h-10 -ml-2">×</button>
        <div className="flex-1 mx-2">
          <p className="text-xs text-gray-500 text-center mb-1">Step {Math.min(step + 1, total)} of {total}</p>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${total ? ((step + 1) / total) * 100 : 0}%` }} />
          </div>
        </div>
        <span title={held ? 'Screen staying on' : 'Screen may sleep'} className={`text-lg w-10 h-10 flex items-center justify-center ${held ? '' : 'opacity-30'}`}>
          {held ? '☀️' : '💤'}
        </span>
      </div>

      {/* Current step */}
      <div className="flex-1 overflow-y-auto px-6 flex items-center">
        <p className="text-2xl leading-relaxed text-gray-900 py-8">{steps[step] || 'No steps for this recipe.'}</p>
      </div>

      {/* Controls */}
      <div className="px-4 pb-6 pt-2 space-y-3">
        <button onClick={() => setShowIngredients(true)} className="w-full text-sm text-gray-500 py-2">
          View ingredients ({recipe.recipe_ingredients.length})
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-6 py-4 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-lg disabled:opacity-30"
          >
            Back
          </button>
          {isLast ? (
            <button onClick={() => setLogging(true)} className="flex-1 py-4 rounded-2xl bg-green-600 text-white font-bold text-lg">
              Finish & log
            </button>
          ) : (
            <button onClick={() => setStep((s) => Math.min(total - 1, s + 1))} className="flex-1 py-4 rounded-2xl bg-green-600 text-white font-bold text-lg">
              Next
            </button>
          )}
        </div>
      </div>

      {/* Ingredients overlay */}
      {showIngredients && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowIngredients(false)} />
          <div className="relative bg-white rounded-t-2xl max-h-[70vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Ingredients</h2>
              <button onClick={() => setShowIngredients(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <ul className="space-y-1.5">
              {recipe.recipe_ingredients.map((ing) => (
                <li key={ing.id} className="text-sm text-gray-700">
                  {[ing.quantity > 1 ? ing.quantity : '', ing.unit, ing.name].filter(Boolean).join(' ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {logging && (
        <CookModal
          open={logging}
          onClose={() => setLogging(false)}
          recipeName={recipe.title}
          ingredients={recipe.recipe_ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))}
          inventoryItems={inventoryItems}
          onConfirm={handleCookConfirm}
        />
      )}
    </div>
  )
}
