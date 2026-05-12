import { FormEvent, useState } from 'react'
import { InventoryItem } from '../../types/inventory'

interface GeneratedRecipe {
  title: string
  description: string
  prep_time: number
  cook_time: number
  instructions: string
  ingredients: { name: string; quantity: number; unit: string; base_ingredient: string }[]
}

interface Props {
  inventoryItems: InventoryItem[]
  onGenerate: (items: InventoryItem[], options: { mood?: string; maxTime?: number; cuisine?: string }) => Promise<GeneratedRecipe>
  onSave: (recipe: GeneratedRecipe) => void
  onCook: (recipe: GeneratedRecipe) => void
}

export function AiRecipeChat({ inventoryItems, onGenerate, onSave, onCook }: Props) {
  const [mood, setMood] = useState('')
  const [maxTime, setMaxTime] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [result, setResult] = useState<GeneratedRecipe | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const recipe = await onGenerate(inventoryItems, {
        mood: mood || undefined,
        maxTime: maxTime ? parseInt(maxTime) : undefined,
        cuisine: cuisine || undefined,
      })
      setResult(recipe)
    } catch {
      setError('Failed to generate recipe. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleGenerate} className="space-y-3">
        <input type="text" placeholder="What are you in the mood for? (optional)" value={mood} onChange={(e) => setMood(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" placeholder="Max minutes" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Cuisine (optional)" value={cuisine} onChange={(e) => setCuisine(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <button type="submit" disabled={loading || inventoryItems.length === 0} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
          {loading ? 'Generating...' : 'Generate Recipe'}
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {result && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-bold text-lg">{result.title}</h3>
          <p className="text-sm text-gray-600">{result.description}</p>
          <p className="text-xs text-gray-500">Prep: {result.prep_time}m · Cook: {result.cook_time}m</p>
          <div>
            <h4 className="font-semibold text-sm mb-1">Ingredients</h4>
            <ul className="text-sm text-gray-700 space-y-0.5">
              {result.ingredients.map((ing, i) => (<li key={i}>{ing.quantity} {ing.unit} {ing.name}</li>))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-1">Instructions</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line">{result.instructions}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onCook(result)} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold">Cook This</button>
            <button onClick={() => onSave(result)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
