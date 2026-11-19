import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import type { SpoonacularDetail } from '../../lib/spoonacular'
import { getRecipeDetail } from '../../lib/spoonacular'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

interface Props {
  recipeId: number | null
  onClose: () => void
  /** Resolves with the saved row, or with nothing when it did not land. */
  onSave: (recipe: SpoonacularDetail) => Promise<unknown>
  onCook: (recipe: SpoonacularDetail) => void
}

export function RecipeDetail({ recipeId, onClose, onSave, onCook }: Props) {
  const [detail, setDetail] = useState<SpoonacularDetail | null>(null)
  const [loading, setLoading] = useState(false)
  // Tagged with the recipe it is about: a slow save that finishes after
  // another recipe was opened must not mark that one as saved.
  const [saveOf, setSaveOf] = useState<{ recipe: SpoonacularDetail; state: 'saving' | 'saved' | 'failed' } | null>(null)
  const save = saveOf && saveOf.recipe === detail ? saveOf.state : 'idle'
  async function handleSave(recipe: SpoonacularDetail) {
    setSaveOf({ recipe, state: 'saving' })
    const landed = (await onSave(recipe).catch(() => null)) != null
    setSaveOf({ recipe, state: landed ? 'saved' : 'failed' })
  }

  useEffect(() => {
    if (!recipeId) return
    setLoading(true)
    getRecipeDetail(recipeId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [recipeId])

  return (
    <Modal open={recipeId !== null} onClose={onClose} title={detail?.title || 'Recipe'}>
      {loading ? (
        <p className="text-gray-400 text-center py-8">Loading recipe...</p>
      ) : detail ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{stripHtml(detail.summary)}</p>
          <div className="flex gap-4 text-sm text-gray-500">
            {detail.preparationMinutes > 0 && <span>Prep: {detail.preparationMinutes}m</span>}
            {detail.cookingMinutes > 0 && <span>Cook: {detail.cookingMinutes}m</span>}
            <span>Total: {detail.readyInMinutes}m</span>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Ingredients</h3>
            <ul className="space-y-1">
              {detail.extendedIngredients.map((ing, i) => (
                <li key={i} className="text-sm text-gray-700">{ing.amount} {ing.unit} {ing.name}</li>
              ))}
            </ul>
          </div>
          {detail.instructions && (
            <div>
              <h3 className="font-semibold mb-2">Instructions</h3>
              <p className="text-sm text-gray-700">{stripHtml(detail.instructions)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => onCook(detail)} className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold">Cook This</button>
            <button
              onClick={() => handleSave(detail)}
              disabled={save === 'saving' || save === 'saved'}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold disabled:opacity-60"
            >
              {save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          {save === 'failed' && <p className="text-red-500 text-sm">Couldn’t save that recipe — try again.</p>}
        </div>
      ) : (
        <p className="text-gray-400 text-center py-8">Could not load recipe</p>
      )}
    </Modal>
  )
}
