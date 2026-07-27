import type { RecipeWithIngredients } from '../../types/recipe'
import type { InventoryItem } from '../../types/inventory'
import { matchInventoryToRecipe } from '../../lib/ingredientMatcher'
import { MacroBadges } from './MacroBadges'

interface Props {
  recipes: RecipeWithIngredients[]
  inventoryItems: InventoryItem[]
  onSelect: (recipe: RecipeWithIngredients) => void
  onToggleFavorite: (id: string) => void
}

export function RecipeList({ recipes, inventoryItems, onSelect, onToggleFavorite }: Props) {
  const inventoryNames = inventoryItems.map((i) => i.name)

  if (recipes.length === 0) {
    return <p className="text-gray-400 text-center py-8">No saved recipes yet</p>
  }

  return (
    <div className="space-y-3">
      {recipes.map((recipe) => {
        const ingredientNames = recipe.recipe_ingredients.map((i) => i.name)
        const { matched, missing } = matchInventoryToRecipe(inventoryNames, ingredientNames)
        const canMake = missing.length === 0 && matched.length > 0

        return (
          <button key={recipe.id} onClick={() => onSelect(recipe)} className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left">
            {recipe.image_url && (
              <img src={recipe.image_url} alt={recipe.title} className="w-full h-32 object-cover rounded-lg mb-3" />
            )}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold">{recipe.title}</p>
                <p className="text-xs text-gray-500 mt-1">{recipe.prep_time + recipe.cook_time}m · Cooked {recipe.times_cooked}x</p>
                <MacroBadges macros={recipe} className="mt-2" />
                <div className="mt-2">
                  {canMake ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ready to cook</span>
                  ) : missing.length > 0 ? (
                    <span className="text-xs text-gray-400">Need: {missing.slice(0, 3).join(', ')}{missing.length > 3 ? ` +${missing.length - 3}` : ''}</span>
                  ) : null}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(recipe.id) }} className="text-xl ml-2">
                {recipe.is_favorited ? '❤️' : '🤍'}
              </button>
            </div>
          </button>
        )
      })}
    </div>
  )
}
