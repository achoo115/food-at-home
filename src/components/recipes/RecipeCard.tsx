import type { SpoonacularRecipe } from '../../lib/spoonacular'

interface Props {
  recipe: SpoonacularRecipe
  onClick: (id: number) => void
}

export function RecipeCard({ recipe, onClick }: Props) {
  const total = recipe.usedIngredientCount + recipe.missedIngredientCount
  const matchPercent = total > 0 ? Math.round((recipe.usedIngredientCount / total) * 100) : 0
  return (
    <button onClick={() => onClick(recipe.id)} className="w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-left">
      {recipe.image && <img src={recipe.image} alt={recipe.title} className="w-full h-36 object-cover" />}
      <div className="p-3">
        <p className="font-semibold text-gray-900 line-clamp-2">{recipe.title}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{matchPercent}% match</span>
          {recipe.missedIngredientCount > 0 && (
            <span className="text-xs text-gray-500">Need {recipe.missedIngredientCount} more</span>
          )}
        </div>
      </div>
    </button>
  )
}
