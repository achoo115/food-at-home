import { useMemo } from 'react'
import { highlightIngredients } from '../../lib/recipeHighlight'

// Renders a cooking step with its ingredient words bolded. `terms` is the
// ingredient-stem set (compute once per recipe with ingredientTerms()).
export function StepText({ text, terms }: { text: string; terms: Set<string> }) {
  const segments = useMemo(() => highlightIngredients(text, terms), [text, terms])
  return (
    <>
      {segments.map((s, i) => (s.bold ? <strong key={i} className="font-semibold text-gray-900">{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  )
}
