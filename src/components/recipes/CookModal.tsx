import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { InventoryItem } from '../../types/inventory'
import { ingredientsMatch } from '../../lib/ingredientMatcher'

interface RecipeIngredient {
  name: string
  quantity: number
  unit: string
}

interface Props {
  open: boolean
  onClose: () => void
  recipeName: string
  ingredients: RecipeIngredient[]
  inventoryItems: InventoryItem[]
  onConfirm: (deductions: { itemId: string; amount: number }[], rating?: number, notes?: string) => void
}

export function CookModal({ open, onClose, recipeName, ingredients, inventoryItems, onConfirm }: Props) {
  const [rating, setRating] = useState<number | undefined>()
  const [notes, setNotes] = useState('')

  const matched = ingredients.map((ing) => {
    const match = inventoryItems.find((inv) => ingredientsMatch(inv.name, ing.name))
    return { ingredient: ing, inventoryItem: match }
  })

  function handleConfirm() {
    const deductions = matched
      .filter((m) => m.inventoryItem)
      .map((m) => ({ itemId: m.inventoryItem!.id, amount: m.ingredient.quantity }))
    onConfirm(deductions, rating, notes || undefined)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Cook: ${recipeName}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">These ingredients will be deducted from your inventory:</p>
        <div className="space-y-2">
          {matched.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span>{m.ingredient.quantity} {m.ingredient.unit} {m.ingredient.name}</span>
              {m.inventoryItem ? (
                <span className="text-green-600 text-xs">In stock</span>
              ) : (
                <span className="text-gray-400 text-xs">Not in inventory</span>
              )}
            </div>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Rating (optional)</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(rating === n ? undefined : n)} className={`text-2xl ${rating && n <= rating ? 'opacity-100' : 'opacity-30'}`}>★</button>
            ))}
          </div>
        </div>
        <textarea placeholder="Notes for next time (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} />
        <button onClick={handleConfirm} className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold">Log Cook</button>
      </div>
    </Modal>
  )
}
