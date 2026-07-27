import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRecipes } from '../hooks/useRecipes'
import { useInventory } from '../hooks/useInventory'
import { useGroceryList } from '../hooks/useGroceryList'
import { useToast } from '../components/ui/Toast'
import { MacroBadges } from '../components/recipes/MacroBadges'
import { splitSteps } from '../lib/recipeSteps'
import { ingredientTerms } from '../lib/recipeHighlight'
import { StepText } from '../components/recipes/StepText'
import { recipeInventoryStatus } from '../lib/recipeFilter'
import { ingredientsMatch } from '../lib/ingredientMatcher'

// Full-page recipe view (replaces the old bottom-sheet modal). Read job only:
// browse, see what you have, then Start cooking. Inventory is deducted later, at
// the END of Cook Mode — never on a tap here.
export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { savedRecipes, loading } = useRecipes()
  const { items: inventoryItems } = useInventory()
  const grocery = useGroceryList()
  const { showToast } = useToast()

  const [descOpen, setDescOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const recipe = savedRecipes.find((r) => r.id === id)
  const inventoryNames = useMemo(() => inventoryItems.map((i) => i.name), [inventoryItems])
  const status = useMemo(() => (recipe ? recipeInventoryStatus(recipe, inventoryNames) : null), [recipe, inventoryNames])
  const terms = useMemo(() => ingredientTerms((recipe?.recipe_ingredients ?? []).map((i) => i.name)), [recipe])

  if (loading) return <p className="text-gray-400 text-center py-12">Loading…</p>
  if (!recipe) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-400">Recipe not found.</p>
        <button onClick={() => navigate('/recipes')} className="text-green-600 font-medium">← Back to recipes</button>
      </div>
    )
  }

  const steps = recipe.steps?.length ? recipe.steps : splitSteps(recipe.instructions)

  function toggleCheck(name: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  async function addMissingToList() {
    if (!status || status.missing.length === 0) { showToast('Everything is already in your kitchen 🎉', 'info'); return }
    for (const name of status.missing) await grocery.addItem(name)
    showToast(`Added ${status.missing.length} item${status.missing.length > 1 ? 's' : ''} to your shopping list`)
  }

  return (
    <div className="pb-24">
      <button onClick={() => navigate('/recipes')} className="text-sm text-gray-500 mb-3">← Recipes</button>

      <h1 className="text-2xl font-bold leading-tight">{recipe.title}</h1>

      {recipe.image_url && (
        <img src={recipe.image_url} alt={recipe.title} className="w-full h-44 object-cover rounded-xl mt-3" />
      )}

      <p className="text-xs text-gray-500 mt-3">
        Prep {recipe.prep_time}m · Cook {recipe.cook_time}m
        {recipe.times_cooked > 0 ? ` · Cooked ${recipe.times_cooked}×` : ''}
      </p>
      <MacroBadges macros={recipe} className="mt-2" />

      {status && status.total > 0 && (
        <p className={`text-sm mt-3 font-medium ${status.ready ? 'text-green-600' : 'text-gray-600'}`}>
          {status.ready ? '✓ You have everything' : `You have ${status.have} of ${status.total} ingredients`}
        </p>
      )}

      {recipe.description && (
        <div className="mt-3">
          <p className={`text-sm text-gray-600 ${descOpen ? '' : 'line-clamp-2'}`}>{recipe.description}</p>
          {recipe.description.length > 120 && (
            <button onClick={() => setDescOpen((v) => !v)} className="text-xs text-green-600 mt-1">
              {descOpen ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Ingredients — checkable, tagged have/missing */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-sm">Ingredients ({recipe.recipe_ingredients.length})</h2>
          {status && status.missing.length > 0 && (
            <button onClick={addMissingToList} className="text-xs text-green-600 font-medium">
              + Add {status.missing.length} missing
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {recipe.recipe_ingredients.map((ing) => {
            const label = [ing.quantity > 1 ? ing.quantity : '', ing.unit, ing.name].filter(Boolean).join(' ')
            const have = inventoryNames.some((inv) => ingredientsMatch(inv, ing.name))
            const isChecked = checked.has(ing.name)
            return (
              <li key={ing.id}>
                <button onClick={() => toggleCheck(ing.name)} className="w-full flex items-center gap-2 text-left py-1">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${isChecked ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'}`}>
                    {isChecked ? '✓' : ''}
                  </span>
                  <span className={`text-sm flex-1 ${isChecked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{label}</span>
                  {have ? (
                    <span className="text-[11px] text-green-600">have</span>
                  ) : (
                    <span className="text-[11px] text-amber-500">need</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Steps — collapsed by default; full guided view is Cook Mode */}
      <div className="mt-5">
        <button onClick={() => setStepsOpen((v) => !v)} className="w-full flex items-center justify-between">
          <h2 className="font-semibold text-sm">Steps ({steps.length})</h2>
          <span className="text-gray-400 text-sm">{stepsOpen ? '−' : '+'}</span>
        </button>
        {stepsOpen && (
          steps.length > 0 ? (
            <ol className="mt-2 space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-gray-300 font-semibold">{i + 1}</span>
                  <span><StepText text={s} terms={terms} /></span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-400 mt-2">No steps saved for this recipe.</p>
          )
        )}
      </div>

      {recipe.source_url && (
        <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-block text-xs text-green-600 underline mt-4">
          View original recipe ↗
        </a>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-16 inset-x-0 px-4">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            onClick={() => navigate(`/recipes/${recipe.id}/cook`)}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold shadow-lg"
          >
            Start cooking
          </button>
          <button
            onClick={addMissingToList}
            title="Add missing ingredients to shopping list"
            className="px-4 py-3 bg-white text-gray-700 rounded-xl font-semibold shadow-lg border border-gray-100"
          >
            🛒
          </button>
        </div>
      </div>
    </div>
  )
}
