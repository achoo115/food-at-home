import { useEffect, useRef, useState } from 'react'
import { useMealPlan } from '../../hooks/useMealPlan'
import { MEAL_SLOTS, rankForRotation } from '../../lib/mealPlan'
import { slotConstraints, violatesHardNo, planSavings, countMealsUsingDeals, mainProtein } from '../../lib/weekPlanner'
import { pickWeekFromArchive } from '../../lib/archivePlanner'
import { consolidatePlan } from '../../lib/groceryConsolidation'
import { PlanShoppingPreview } from './PlanShoppingPreview'
import { MacroBadges } from './MacroBadges'
import type { RecipeWithIngredients } from '../../types/recipe'
import type { InventoryItem } from '../../types/inventory'
import type { Preferences } from '../../types/preferences'
import type { Special } from '../../hooks/useSpecials'
import type { GeneratedRecipe } from '../../lib/claude'

// A slot the planner has generated, checked and saved.
interface GeneratedSlotRecipe {
  id: string
  title: string
  ingredients: { name: string }[]
  protein: string
}

// One planner job at a time. Every mutating handler checks `busy` and clears
// itself in a `finally`, so a thrown generation (claude.ts rethrows the edge
// function's error) can no longer leave the card stuck on "Planning…" with the
// plan buttons hidden (2026-11-10 panel, P0).
type Status =
  | { kind: 'idle' }
  | { kind: 'planning' }
  | { kind: 'archiving' }
  | { kind: 'swapping'; slot: number }
  | { kind: 'adding' }

interface Props {
  savedRecipes: RecipeWithIngredients[]
  inventoryItems: InventoryItem[]
  preferences: Preferences
  specials: Special[]
  /** Generate a candidate for a slot. Writes nothing — the planner persists only a candidate that passed its checks. */
  onGenerateForSlot: (args: { mealType: string; constraints: string[]; onSaleItems: string[] }) => Promise<GeneratedRecipe | null>
  /** Save an accepted candidate to the library; returns its id. */
  onPersistSlotRecipe: (recipe: GeneratedRecipe) => Promise<string | null>
  onEnsureEconomics: (recipe: RecipeWithIngredients) => Promise<{ servings: number | null; cost_per_serving: number | null }>
  onAddToGrocery: (items: { name: string; quantity: number; unit: string }[]) => Promise<void>
  onViewRecipe: (recipe: RecipeWithIngredients) => void
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

export function ThisWeekPlan({ savedRecipes, inventoryItems, preferences, specials, onGenerateForSlot, onPersistSlotRecipe, onEnsureEconomics, onAddToGrocery, onViewRecipe }: Props) {
  const { meals, loading, setSlot, clearSlot } = useMealPlan()
  const [picking, setPicking] = useState<number | null>(null)
  const [listMsg, setListMsg] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [progress, setProgress] = useState('')
  const [summary, setSummary] = useState<{ deals: number; savings: number } | null>(null)
  const [planNote, setPlanNote] = useState('')
  const cancelRef = useRef(false)
  const runningRef = useRef(false)
  const busy = status.kind !== 'idle'
  // Two taps in one tick both read the pre-commit `status`; the ref closes that gap.
  function begin(next: Status): boolean {
    if (runningRef.current) return false
    runningRef.current = true
    setStatus(next)
    setPicking(null) // an open manual picker must not write a slot under the run
    return true
  }
  function end() { runningRef.current = false; setStatus({ kind: 'idle' }) }
  // Leaving the tab mid-plan must stop the loop: a fresh mount would otherwise
  // let a second plan race the orphaned one over the same slots.
  useEffect(() => () => { cancelRef.current = true }, [])

  const [costByRecipe, setCostByRecipe] = useState<Record<string, number | null>>({})
  const attemptedEconRef = useRef<Set<string>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [archiveNote, setArchiveNote] = useState('')

  async function planFromArchive() {
    if (busy) return
    if (filledCount > 0 && !window.confirm('Replace this week’s planned meals with picks from your saved recipes?')) return
    if (!begin({ kind: 'archiving' })) return
    setSummary(null); setArchiveNote(''); setListMsg(''); cancelRef.current = false
    try {
      const { picks, unfilledSlots } = pickWeekFromArchive(savedRecipes, preferences, MEAL_SLOTS)
      let failed = 0
      // clear slots we won't fill so a re-plan doesn't leave stale meals
      for (const i of unfilledSlots) {
        if (cancelRef.current) return
        if (!(await clearSlot(i))) failed++
      }
      for (const p of picks) {
        if (cancelRef.current) return
        if (!(await setSlot(p.recipe.id, MEAL_SLOTS[p.slotIndex].meal_type, p.slotIndex))) failed++
      }
      const notes: string[] = []
      if (unfilledSlots.length) {
        const labels = unfilledSlots.map((i) => MEAL_SLOTS[i].label.toLowerCase()).join(', ')
        notes.push(`Couldn’t fill ${labels} from your saved recipes — add one manually or import more.`)
      }
      if (failed) notes.push(`${failed} meal${failed > 1 ? 's' : ''} could not be saved — try again.`)
      setArchiveNote(notes.join(' '))
    } finally {
      end()
    }
  }

  function costFor(recipeId: string, fallback: number | null): number | null {
    return recipeId in costByRecipe ? costByRecipe[recipeId] : fallback
  }

  const weekCost = meals.reduce((sum, m) => sum + (costFor(m.recipe.id, m.recipe.cost_per_serving) ?? 0), 0)

  async function confirmAddToList() {
    if (!preview || busy) return
    if (!begin({ kind: 'adding' })) return
    try {
      await onAddToGrocery(preview.toBuy.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })))
      setPreviewOpen(false)
      setListMsg(`Added ${preview.toBuy.length} item${preview.toBuy.length !== 1 ? 's' : ''} to your shopping list`)
    } catch {
      setListMsg('Couldn’t add to your shopping list — try again.')
    } finally {
      end()
    }
  }

  const ranked = rankForRotation(savedRecipes)
  const inventoryNames = inventoryItems.map((i) => i.name)
  // Computed from the live plan on every render, so a slot cleared or swapped
  // while the preview is open changes the list rather than a stale snapshot.
  const preview = previewOpen
    ? consolidatePlan(meals.map((m) => ({ title: m.recipe.title, recipe_ingredients: m.recipe.recipe_ingredients ?? [] })), inventoryNames)
    : null
  const recentTitles = savedRecipes.map((r) => r.title).slice(0, 10)
  const onSaleItems = specials.map((s) => s.item)
  const filledCount = meals.length

  // Generate one slot with the given avoid-context. Enforces two things the prompt
  // alone doesn't hold reliably, by regenerating with a firmer constraint:
  //   - hard-no ingredients (safety), and
  //   - protein variety (no protein already used elsewhere this week).
  // A candidate is persisted only after both checks pass and only if the run
  // was not cancelled meanwhile — rejected attempts never reach the library.
  async function generateSlot(slotIndex: number, chosen: { title: string }[], usedProteins: string[]) {
    const slot = MEAL_SLOTS[slotIndex]
    let constraints = slotConstraints(slot, chosen, preferences, recentTitles)
    for (let attempt = 0; attempt < 3; attempt++) {
      const gen = await onGenerateForSlot({ mealType: slot.meal_type, constraints, onSaleItems })
      if (!gen || cancelRef.current) return null
      const names = gen.ingredients.map((i) => i.name)
      const bad = violatesHardNo(names, preferences.hard_nos)
      if (bad) { constraints = [...constraints, `Do NOT use ${bad} — it is a hard no.`]; continue }
      const protein = mainProtein(undefined, names)
      if (protein !== 'other' && usedProteins.includes(protein)) {
        constraints = [...constraints, `Do NOT use ${protein}; the rest of the week already uses it. Pick a different main protein.`]
        continue
      }
      const id = await onPersistSlotRecipe(gen)
      if (!id) return null
      return { id, title: gen.title, ingredients: gen.ingredients.map((i) => ({ name: i.name })), protein }
    }
    return null
  }

  async function planWeek() {
    if (busy) return
    if (filledCount > 0 && !window.confirm('Replace this week’s planned meals with a fresh plan from your deals?')) return
    if (!begin({ kind: 'planning' })) return
    setPlanNote(''); setSummary(null); cancelRef.current = false
    const chosen: { title: string }[] = []
    const usedProteins: string[] = []
    const generated: GeneratedSlotRecipe[] = []
    let failures = 0
    try {
      for (let i = 0; i < MEAL_SLOTS.length; i++) {
        if (cancelRef.current) break
        setProgress(`Planning ${MEAL_SLOTS[i].label.toLowerCase()} — ${i + 1} of ${MEAL_SLOTS.length}…`)
        let r: Awaited<ReturnType<typeof generateSlot>> = null
        try { r = await generateSlot(i, chosen, usedProteins) } catch { r = null }
        if (cancelRef.current) break
        if (!r) { failures++; continue }
        const ok = await setSlot(r.id, MEAL_SLOTS[i].meal_type, i)
        if (!ok) { failures++; continue }
        chosen.push({ title: r.title })
        if (r.protein !== 'other') usedProteins.push(r.protein)
        generated.push(r)
      }
    } finally {
      end(); setProgress('')
    }
    if (!cancelRef.current && generated.length) {
      setSummary({ deals: countMealsUsingDeals(generated, specials), savings: planSavings(generated, specials) })
    }
    if (failures) setPlanNote(`Couldn’t plan ${failures} slot${failures > 1 ? 's' : ''} — tap Swap to try again.`)
  }

  // Fill in cost/serving for any planned meal still missing it — covers manual
  // adds, deals-generated meals, and meals loaded from a prior session. Deduped
  // via a ref so a failed (null) estimate is not retried every render.
  useEffect(() => {
    for (const m of meals) {
      if (m.recipe.cost_per_serving != null) continue
      if (attemptedEconRef.current.has(m.recipe.id)) continue
      attemptedEconRef.current.add(m.recipe.id)
      onEnsureEconomics(m.recipe).then((e) =>
        setCostByRecipe((prev) => ({ ...prev, [m.recipe.id]: e.cost_per_serving })))
    }
  }, [meals, onEnsureEconomics])

  async function swapSlot(i: number) {
    if (busy) return
    if (!begin({ kind: 'swapping', slot: i })) return
    setSummary(null); cancelRef.current = false
    try {
      const others = meals.filter((m) => m.slot_order !== i)
      const otherTitles = others.map((m) => ({ title: m.recipe.title }))
      const otherProteins = others
        .map((m) => mainProtein(m.recipe.build?.pro, (m.recipe.recipe_ingredients ?? []).map((x) => x.name)))
        .filter((p) => p !== 'other')
      const r = await generateSlot(i, otherTitles, otherProteins)
      if (cancelRef.current) return
      if (!r || !(await setSlot(r.id, MEAL_SLOTS[i].meal_type, i))) setPlanNote('Couldn’t find a different meal for that slot — try again.')
    } catch {
      setPlanNote('Couldn’t find a different meal for that slot — try again.')
    } finally {
      end()
    }
  }

  if (loading) return <p className="text-gray-400 text-center py-8">Loading this week…</p>

  return (
    <div className="space-y-3">
      <button onClick={planFromArchive} disabled={busy} className="w-full py-3 bg-green-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50">
        {status.kind === 'archiving' ? 'Picking from your recipes…' : filledCount > 0 ? 'Replan from my recipes' : 'Plan from my recipes'}
        <span className="block text-xs font-normal text-green-100 mt-0.5">Picks from your {savedRecipes.length} saved recipes</span>
      </button>
      {archiveNote && <p className="text-sm text-center text-amber-600">{archiveNote}</p>}
      {weekCost > 0 && (
        <p className="text-sm text-center text-gray-500">≈ ${weekCost.toFixed(2)} for the week · one serving of each meal</p>
      )}
      {/* Auto-plan control */}
      {status.kind === 'planning' ? (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{progress}</span>
          <button onClick={() => { cancelRef.current = true }} className="text-sm text-gray-400 font-medium">Cancel</button>
        </div>
      ) : (
        <button onClick={planWeek} disabled={busy} className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50">
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
            {status.kind === 'swapping' && status.slot === i ? (
              <div className="animate-pulse text-sm text-gray-400 py-2">Finding a different {slot.label.toLowerCase()}…</div>
            ) : meal ? (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <button onClick={() => onViewRecipe(meal.recipe)} className="font-semibold text-left underline decoration-gray-200">{meal.recipe.title}</button>
                  <MacroBadges macros={meal.recipe} className="mt-1" />
                  {(() => {
                    const cps = costFor(meal.recipe.id, meal.recipe.cost_per_serving)
                    if (cps != null) return <p className="text-xs text-gray-400 mt-1">~${cps.toFixed(2)}/serving</p>
                    if (meal.recipe.id in costByRecipe) return <p className="text-xs text-gray-300 mt-1">—</p>
                    return <p className="text-xs text-gray-300 mt-1">estimating cost…</p>
                  })()}
                  <BuildPillars build={meal.recipe.build} />
                </div>
                <div className="flex flex-col items-end gap-2 ml-2">
                  <button onClick={() => swapSlot(i)} disabled={busy} title="Swap this meal" className="text-gray-400 text-sm disabled:opacity-40">⟳</button>
                  <button onClick={() => clearSlot(i)} disabled={busy} className="text-gray-300 text-sm disabled:opacity-40">✕</button>
                </div>
              </div>
            ) : picking === i ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {ranked.length === 0 && <p className="text-sm text-gray-400">No saved recipes yet.</p>}
                {ranked.map((r) => (
                  <button key={r.id} disabled={busy} onClick={async () => { if (busy) return; if (await setSlot(r.id, slot.meal_type, i)) setPicking(null); else setPlanNote('That meal could not be saved — try again.') }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between disabled:opacity-40">
                    <span className="text-sm">{r.is_favorited ? '❤️ ' : ''}{r.title}</span>
                    <span className="text-xs text-gray-400">{r.last_cooked_at ? 'cooked' : 'new'}</span>
                  </button>
                ))}
                <button onClick={() => setPicking(null)} className="text-xs text-gray-400 px-3 py-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setPicking(i)} disabled={busy} className="text-sm text-green-600 font-medium disabled:opacity-40">+ Add {slot.label.toLowerCase()} manually</button>
            )}
          </div>
        )
      })}

      {meals.length > 0 && status.kind !== 'planning' && (
        <div className="pt-2 space-y-2">
          {preview ? (
            <PlanShoppingPreview
              toBuy={preview.toBuy}
              onHand={preview.onHand}
              onAdd={confirmAddToList}
              onCancel={() => setPreviewOpen(false)}
              adding={status.kind === 'adding'}
            />
          ) : (
            <button onClick={() => setPreviewOpen(true)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold">
              Build shopping list from plan
            </button>
          )}
          {listMsg && <p className="text-sm text-gray-500 text-center mt-2">{listMsg}</p>}
        </div>
      )}
    </div>
  )
}
