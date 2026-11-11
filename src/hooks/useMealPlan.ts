import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekStart } from '../lib/mealPlan'
import type { RecipeWithIngredients } from '../types/recipe'

export interface PlannedMeal {
  id: string
  meal_type: string
  slot_order: number
  recipe: RecipeWithIngredients
}

// Current-week meal plan. The plan row is created lazily on the first add, so
// merely viewing the tab writes nothing.
export function useMealPlan() {
  const week = weekStart()
  const [planId, setPlanId] = useState<string | null>(null)
  const [meals, setMeals] = useState<PlannedMeal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMeals = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('meal_plan_meals')
      .select('id, meal_type, slot_order, recipe:recipes(*, recipe_ingredients(*))')
      .eq('meal_plan_id', id)
      .order('slot_order')
    if (error) return // keep the last known plan rather than showing an empty week
    setMeals(((data ?? []) as unknown as PlannedMeal[]).filter((m) => m.recipe))
  }, [])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('meal_plans').select('id').eq('week_range', week).maybeSingle()
      if (data?.id) {
        setPlanId(data.id)
        await fetchMeals(data.id)
      }
      setLoading(false)
    })()
  }, [week, fetchMeals])

  const ensurePlan = useCallback(async (): Promise<string | null> => {
    if (planId) return planId
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('meal_plans')
      .upsert({ user_id: user.id, week_range: week }, { onConflict: 'user_id,week_range' })
      .select('id')
      .single()
    if (data?.id) setPlanId(data.id)
    return data?.id ?? null
  }, [planId, week])

  // One recipe per slot, written as a single upsert on the (plan, slot) unique
  // index — a failed write leaves the old meal in place instead of deleting it
  // first and losing it when the insert does not land. Returns whether it landed.
  const setSlot = useCallback(async (recipeId: string, mealType: string, slotOrder: number): Promise<boolean> => {
    const id = await ensurePlan()
    if (!id) return false
    const { error } = await supabase
      .from('meal_plan_meals')
      .upsert({ meal_plan_id: id, recipe_id: recipeId, meal_type: mealType, slot_order: slotOrder }, { onConflict: 'meal_plan_id,slot_order' })
    if (error) return false
    await fetchMeals(id)
    return true
  }, [ensurePlan, fetchMeals])

  const clearSlot = useCallback(async (slotOrder: number): Promise<boolean> => {
    if (!planId) return false
    const { error } = await supabase.from('meal_plan_meals').delete().eq('meal_plan_id', planId).eq('slot_order', slotOrder)
    if (error) return false
    await fetchMeals(planId)
    return true
  }, [planId, fetchMeals])

  return { week, meals, loading, setSlot, clearSlot }
}
