import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import type { SpoonacularDetail } from '../../lib/spoonacular'
import { getRecipeDetail } from '../../lib/spoonacular'

interface Props {
  recipeId: number | null
  onClose: () => void
  onSave: (recipe: SpoonacularDetail) => void
  onCook: (recipe: SpoonacularDetail) => void
}

export function RecipeDetail({ recipeId, onClose, onSave, onCook }: Props) {
  const [detail, setDetail] = useState<SpoonacularDetail | null>(null)
  const [loading, setLoading] = useState(false)

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
          <p className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: detail.summary }} />
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
              <div className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: detail.instructions }} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => onCook(detail)} className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold">Cook This</button>
            <button onClick={() => onSave(detail)} className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold">Save</button>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-center py-8">Could not load recipe</p>
      )}
    </Modal>
  )
}
