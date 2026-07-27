import { useRef, useState } from 'react'
import { useMealPlan } from '../../hooks/useMealPlan'
import { MEAL_SLOTS, rankForRotation } from '../../lib/mealPlan'
import { slotConstraints, violatesHardNo, planSavings, countMealsUsingDeals, mainProtein } from '../../lib/weekPlanner'
import { matchInventoryToRecipe } from '../../lib/ingredientMatcher'
import { MacroBadges } from './MacroBadges'
import type { RecipeWithIngredients } from '../../types/recipe'
import type { InventoryItem } from '../../types/inventory'
import type { Preferences } from '../../types/preferences'
import type { Special } from '../../hooks/useSpecials'

// What the host returns after generating + saving a recipe for one slot.
export interface GeneratedSlotRecipe {
  id: string
  title: string
  ingredients: { name: string }[]
}

interface Props {
  savedRecipes: RecipeWithIngredients[]
  inventoryItems: InventoryItem[]
  preferences: Preferences
  specials: Special[]
  onGenerateForSlot: (args: { mealType: string; constraints: string[]; onSaleItems: string[] }) => Promise<GeneratedSlotRecipe | null>
  onAddToGrocery: (names: string[]) => Promise<void>
}

function BuildPillars({ build }: { build: RecipeWithIngredients['build'] }) {
  if (!build) return null
  const parts = [
    build.pro?.length && `Pro: ${build.pro.join(', ')}`,
    build.base?.length && `Base: ${build.base.join(', ')}`,
    build.veg?.length && `Veg: ${build.veg.join(', ')}`,
    build.engine?.length && `Engine: ${build.engine.join(', ')}`,
  ].filter(Boolean)
  if (!parts.length) return null
  return <p className="text-xs text-gray-400 mt-1">{parts.join(' · ')}</p>
}

export function ThisWeekPlan({ savedRecipes, inventoryItems, preferences, specials, onGenerateForSlot, onAddToGrocery }: Props) {
  const { meals, loading, setSlot, clearSlot } = useMealPlan()
  const [picking, setPicking] = useState<number | null>(null)
  const [listMsg, setListMsg] = useState('')
  const [planning, setPlanning] = useState(false)
  const [progress, setProgress] = useState('')
  const [swapping, setSwapping] = useState<number | null>(null)
  const [summary, setSummary] = useState<{ deals: number; savings: number } | null>(null)
  const [planNote, setPlanNote] = useState('')
  const cancelRef = useRef(false)

  const ranked = rankForRotation(savedRecipes)
  const inventoryNames = inventoryItems.map((i) => i.name)
  const recentTitles = savedRecipes.map((r) => r.title).slice(0, 10)
  const onSaleItems = specials.map((s) => s.item)
  const filledCount = meals.length

  // Generate one slot with the given avoid-context. Enforces two things the prompt
  // alone doesn't hold reliably, by regenerating with a firmer constraint:
  //   - hard-no ingredients (safety), and
  //   - protein variety (no protein already used elsewhere this week).
  async function generateSlot(slotIndex: number, chosen: { title: string }[], usedProteins: string[]) {
    const slot = MEAL_SLOTS[slotIndex]
    let constraints = slotConstraints(slot, chosen, preferences, recentTitles)
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await onGenerateForSlot({ mealType: slot.meal_type, constraints, onSaleItems })
      if (!r) return null
      const names = r.ingredients.map((i) => i.name)
      const bad = violatesHardNo(names, preferences.hard_nos)
      if (bad) { constraints = [...constraints, `Do NOT use ${bad} — it is a hard no.`]; continue }
      const protein = mainProtein(undefined, names)
      if (protein !== 'other' && usedProteins.includes(protein)) {
        constraints = [...constraints, `Do NOT use ${protein}; the rest of the week already uses it. Pick a different main protein.`]
        continue
      }
      return { ...r, protein }
    }
    return null
  }

  async function planWeek() {
    if (filledCount > 0 && !window.confirm('Replace this week’s planned meals with a fresh plan from your deals?')) return
    setPlanning(true); setPlanNote(''); setSummary(null); cancelRef.current = false
    const chosen: { title: string }[] = []
    const usedProteins: string[] = []
    const generated: GeneratedSlotRecipe[] = []
    let failures = 0
    for (let i = 0; i < MEAL_SLOTS.length; i++) {
      if (cancelRef.current) break
      setProgress(`Planning ${MEAL_SLOTS[i].label.toLowerCase()} — ${i + 1} of ${MEAL_SLOTS.length}…`)
      const r = await generateSlot(i, chosen, usedProteins)
      if (cancelRef.current) break
      if (!r) { failures++; continue }
      await setSlot(r.id, MEAL_SLOTS[i].meal_type, i)
      chosen.push({ title: r.title })
      if (r.protein !== 'other') usedProteins.push(r.protein)
      generated.push(r)
    }
    setPlanning(false); setProgress('')
    if (!cancelRef.current && generated.length) {
      setSummary({ deals: countMealsUsingDeals(generated, specials), savings: planSavings(generated, specials) })
    }
    if (failures) setPlanNote(`Couldn’t plan ${failures} slot${failures > 1 ? 's' : ''} — tap Swap to try again.`)
  }

  async function swapSlot(i: number) {
    setSwapping(i); setSummary(null)
    const others = meals.filter((m) => m.slot_order !== i)
    const otherTitles = others.map((m) => ({ title: m.recipe.title }))
    const otherProteins = others
      .map((m) => mainProtein(m.recipe.build?.pro, (m.recipe.recipe_ingredients ?? []).map((x) => x.name)))
      .filter((p) => p !== 'other')
    const r = await generateSlot(i, otherTitles, otherProteins)
    if (r) await setSlot(r.id, MEAL_SLOTS[i].meal_type, i)
    else setPlanNote('Couldn’t find a different meal for that slot — try again.')
    setSwapping(null)
  }

  async function buildShoppingList() {
    const missing = new Set<string>()
    for (const m of meals) {
      const res = matchInventoryToRecipe(inventoryNames, (m.recipe.recipe_ingredients ?? []).map((i) => i.name))
      res.missing.forEach((n) => missing.add(n))
    }
    const names = [...missing]
    if (names.length === 0) { setListMsg('Everything for this week is already in your kitchen 🎉'); return }
    await onAddToGrocery(names)
    setListMsg(`Added ${names.length} item${names.length > 1 ? 's' : ''} to your shopping list`)
  }

  if (loading) return <p className="text-gray-400 text-center py-8">Loading this week…</p>

  return (
    <div className="space-y-3">
      {/* Auto-plan control */}
      {planning ? (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{progress}</span>
          <button onClick={() => { cancelRef.current = true }} className="text-sm text-gray-400 font-medium">Cancel</button>
        </div>
      ) : (
        <button onClick={planWeek} className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold shadow-sm">
          {filledCount > 0 ? 'Replan my week from deals' : 'Plan my week from deals'}
          <span className="block text-xs font-normal text-green-100 mt-0.5">1 breakfast · 1 lunch · 2 dinners</span>
        </button>
      )}

      {summary && (
        <p className="text-sm text-center text-gray-500">
          {summary.deals > 0 ? `${summary.deals} meal${summary.deals > 1 ? 's' : ''} use this week's deals` : 'Planned from your macros & inventory'}
          {summary.savings > 0 ? ` · ~$${summary.savings} off vs regular` : ''} · macros on target
        </p>
      )}
      {planNote && <p className="text-sm text-center text-amber-600">{planNote}</p>}

      {MEAL_SLOTS.map((slot, i) => {
        const meal = meals.find((m) => m.slot_order === i)
        return (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{slot.label}</p>
            {swapping === i ? (
              <div className="animate-pulse text-sm text-gray-400 py-2">Finding a different {slot.label.toLowerCase()}…</div>
            ) : meal ? (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold">{meal.recipe.title}</p>
                  <MacroBadges macros={meal.recipe} className="mt-1" />
                  <BuildPillars build={meal.recipe.build} />
                </div>
                <div className="flex flex-col items-end gap-2 ml-2">
                  <button onClick={() => swapSlot(i)} disabled={planning} title="Swap this meal" className="text-gray-400 text-sm disabled:opacity-40">⟳</button>
                  <button onClick={() => clearSlot(i)} className="text-gray-300 text-sm">✕</button>
                </div>
              </div>
            ) : picking === i ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {ranked.length === 0 && <p className="text-sm text-gray-400">No saved recipes yet.</p>}
                {ranked.map((r) => (
                  <button key={r.id} onClick={async () => { await setSlot(r.id, slot.meal_type, i); setPicking(null) }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between">
                    <span className="text-sm">{r.is_favorited ? '❤️ ' : ''}{r.title}</span>
                    <span className="text-xs text-gray-400">{r.last_cooked_at ? 'cooked' : 'new'}</span>
                  </button>
                ))}
                <button onClick={() => setPicking(null)} className="text-xs text-gray-400 px-3 py-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setPicking(i)} disabled={planning} className="text-sm text-green-600 font-medium disabled:opacity-40">+ Add {slot.label.toLowerCase()} manually</button>
            )}
          </div>
        )
      })}

      {meals.length > 0 && !planning && (
        <div className="pt-2">
          <button onClick={buildShoppingList} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold">
            Build shopping list from plan
          </button>
          {listMsg && <p className="text-sm text-gray-500 text-center mt-2">{listMsg}</p>}
        </div>
      )}
    </div>
  )
}
