import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekStart } from '../lib/mealPlan'
import type { RecipeWithIngredients } from '../types/recipe'

export interface PlannedMeal {
  id: string
  meal_type: string
  slot_order: number
  recipe: RecipeWithIngredients
}

interface Loaded { week: string; planId: string | null; meals: PlannedMeal[]; failed: boolean }
const NO_MEALS: PlannedMeal[] = []

// Current-week meal plan. The plan row is created lazily on the first add, so
// merely viewing the tab writes nothing.
//
// The week is state, and the plan id and meals are tagged with the week they
// belong to. An app left open across Monday used to keep last week's plan id
// and write the new week's meals into it; now the week is re-read whenever the
// app comes back to the foreground and before every write, and anything loaded
// for another week is ignored.
export function useMealPlan() {
  const [week, setWeek] = useState(() => weekStart())
  const weekRef = useRef(week)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // The same value in a ref: the planner's loop holds setSlot from the render
  // it started in for a minute or more, and must still see the plan id that
  // its own first write created.
  const loadedRef = useRef<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const apply = useCallback((next: (prev: Loaded | null) => Loaded | null) => {
    loadedRef.current = next(loadedRef.current)
    setLoaded(loadedRef.current)
  }, [])
  const current = loaded?.week === week ? loaded : null
  const meals = current?.meals ?? NO_MEALS
  const loading = current === null

  /** Today's week; moves the hook onto it if the calendar has rolled over. */
  const rollover = useCallback((): string => {
    const now = weekStart()
    if (now !== weekRef.current) { weekRef.current = now; setWeek(now) }
    return now
  }, [])

  useEffect(() => {
    // visibilitychange covers a phone coming back from the lock screen; focus
    // covers a desktop window that was never hidden.
    const onVisible = () => { if (document.visibilityState === 'visible') rollover() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [rollover])

  const fetchMeals = useCallback(async (id: string, wk: string) => {
    const { data, error } = await supabase
      .from('meal_plan_meals')
      .select('id, meal_type, slot_order, recipe:recipes(*, recipe_ingredients(*))')
      .eq('meal_plan_id', id)
      .order('slot_order')
    if (weekRef.current !== wk) return // answered for a week the app has left
    apply((prev) => {
      const sameWeek = prev?.week === wk ? prev : null
      // On an error keep the last known plan rather than showing an empty week;
      // with nothing known yet, say the load failed rather than "empty".
      if (error) return { week: wk, planId: id, meals: sameWeek?.meals ?? [], failed: sameWeek ? sameWeek.failed : true }
      return { week: wk, planId: id, meals: ((data ?? []) as unknown as PlannedMeal[]).filter((m) => m.recipe), failed: false }
    })
  }, [apply])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('meal_plans').select('id').eq('week_range', week).maybeSingle()
      if (cancelled) return
      if (error) {
        // Not "no plan": an empty-looking week would let a fresh plan overwrite
        // the real one without asking.
        apply((prev) => (prev?.week === week ? prev : { week, planId: null, meals: [], failed: true }))
      } else if (data?.id) {
        await fetchMeals(data.id, week)
      } else {
        apply((prev) => (prev?.week === week ? { ...prev, failed: false } : { week, planId: null, meals: [], failed: false }))
      }
    })()
    return () => { cancelled = true }
  }, [week, attempt, fetchMeals, apply])

  const ensurePlan = useCallback(async (wk: string): Promise<string | null> => {
    const known = loadedRef.current?.week === wk ? loadedRef.current.planId : null
    if (known) return known
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('meal_plans')
      .upsert({ user_id: user.id, week_range: wk }, { onConflict: 'user_id,week_range' })
      .select('id')
      .single()
    // setSlot's re-read records the id (fetchMeals), so the next slot finds it.
    return data?.id ?? null
  }, [])

  // One recipe per slot, written as a single upsert on the (plan, slot) unique
  // index — a failed write leaves the old meal in place instead of deleting it
  // first and losing it when the insert does not land. Returns whether it landed.
  // `onlyWeek` pins a multi-write run to the week it started in: once the
  // calendar has moved on, the write is refused rather than split across weeks.
  const setSlot = useCallback(async (recipeId: string, mealType: string, slotOrder: number, onlyWeek?: string): Promise<boolean> => {
    const wk = rollover()
    if (onlyWeek && wk !== onlyWeek) return false
    const id = await ensurePlan(wk)
    if (!id) return false
    const { error } = await supabase
      .from('meal_plan_meals')
      .upsert({ meal_plan_id: id, recipe_id: recipeId, meal_type: mealType, slot_order: slotOrder }, { onConflict: 'meal_plan_id,slot_order' })
    if (error) return false
    await fetchMeals(id, wk)
    return true
  }, [rollover, ensurePlan, fetchMeals])

  const clearSlot = useCallback(async (slotOrder: number): Promise<boolean> => {
    const wk = rollover()
    // No plan for this week means the slot is already empty. Never delete from
    // the week left behind.
    const planId = loadedRef.current?.week === wk ? loadedRef.current.planId : null
    if (!planId) return true
    const { error } = await supabase.from('meal_plan_meals').delete().eq('meal_plan_id', planId).eq('slot_order', slotOrder)
    if (error) return false
    await fetchMeals(planId, wk)
    return true
  }, [rollover, fetchMeals])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { week, meals, loading, loadFailed: current?.failed ?? false, reload, syncWeek: rollover, setSlot, clearSlot }
}
