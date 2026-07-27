import { Modal } from '../ui/Modal'
import { MacroBadges } from './MacroBadges'
import type { RecipeWithIngredients } from '../../types/recipe'

interface Props {
  recipe: RecipeWithIngredients | null
  onClose: () => void
  onCook: (recipe: RecipeWithIngredients) => void
}

// Full view of a saved recipe: photo, macros, ingredients, and the STEPS.
export function SavedRecipeModal({ recipe, onClose, onCook }: Props) {
  if (!recipe) return null
  return (
    <Modal open={!!recipe} onClose={onClose} title={recipe.title}>
      <div className="p-4 space-y-4">
        {recipe.image_url && (
          <img src={recipe.image_url} alt={recipe.title} className="w-full h-48 object-cover rounded-lg" />
        )}
        {recipe.description && <p className="text-sm text-gray-600">{recipe.description}</p>}
        <p className="text-xs text-gray-500">
          Prep {recipe.prep_time}m · Cook {recipe.cook_time}m
          {recipe.times_cooked > 0 ? ` · Cooked ${recipe.times_cooked}×` : ''}
        </p>
        <MacroBadges macros={recipe} />

        <div>
          <h4 className="font-semibold text-sm mb-1">Ingredients</h4>
          <ul className="text-sm text-gray-700 space-y-0.5 list-disc pl-5">
            {recipe.recipe_ingredients.map((i) => (
              <li key={i.id}>{[i.quantity > 1 ? i.quantity : '', i.unit, i.name].filter(Boolean).join(' ')}</li>
            ))}
          </ul>
        </div>

        {recipe.instructions?.trim() ? (
          <div>
            <h4 className="font-semibold text-sm mb-1">Instructions</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{recipe.instructions}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No instructions saved for this recipe.</p>
        )}

        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-block text-xs text-green-600 underline">
            View original recipe ↗
          </a>
        )}

        <button onClick={() => onCook(recipe)} className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold">
          Cook this
        </button>
      </div>
    </Modal>
  )
}
