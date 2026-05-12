import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Achievement, AchievementType, CookingLog } from '../types/gamification'
import type { InventoryItem } from '../types/inventory'

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAchievements = useCallback(async () => {
    const { data, error } = await supabase.from('achievements').select('*')
    if (!error && data) setAchievements(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAchievements() }, [fetchAchievements])

  function hasAchievement(type: AchievementType): boolean {
    return achievements.some((a) => a.type === type)
  }

  async function award(type: AchievementType, metadata: Record<string, unknown> = {}) {
    if (hasAchievement(type)) return null
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('achievements')
      .insert({ user_id: user.id, type, metadata })
      .select()
      .single()

    if (!error && data) {
      setAchievements((prev) => [...prev, data])
      return data
    }
    return null
  }

  async function checkAndAward(logs: CookingLog[], items: InventoryItem[], allIngredientsMatched?: boolean) {
    const newAchievements: Achievement[] = []

    // First Cook
    if (!hasAchievement('first_cook') && logs.length > 0) {
      const a = await award('first_cook')
      if (a) newAchievements.push(a)
    }

    // Week Warrior — 7-day streak
    if (!hasAchievement('week_warrior')) {
      const days = new Set(logs.map((l) => l.cooked_at.split('T')[0]))
      const sorted = [...days].sort().reverse()
      let streak = 0
      const today = new Date()
      for (let i = 0; i < sorted.length && i < 30; i++) {
        const checkDate = new Date(today)
        checkDate.setDate(checkDate.getDate() - i)
        if (days.has(checkDate.toISOString().split('T')[0])) streak++
        else if (i === 0) continue
        else break
      }
      if (streak >= 7) {
        const a = await award('week_warrior', { streak })
        if (a) newAchievements.push(a)
      }
    }

    // Zero Waste Week
    if (!hasAchievement('zero_waste_week')) {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const recentExpired = items.filter(
        (i) => i.status === 'expired' && new Date(i.expiry_date) >= weekAgo
      )
      const hasActiveItems = items.some((i) => i.status === 'active')
      if (recentExpired.length === 0 && hasActiveItems) {
        const a = await award('zero_waste_week')
        if (a) newAchievements.push(a)
      }
    }

    // Freezer Archaeologist
    if (!hasAchievement('freezer_archaeologist')) {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const oldFreezerUsed = items.some(
        (i) => i.status === 'consumed' && i.location === 'freezer' && new Date(i.added_at) <= threeMonthsAgo
      )
      if (oldFreezerUsed) {
        const a = await award('freezer_archaeologist')
        if (a) newAchievements.push(a)
      }
    }

    // Pantry Chef
    if (!hasAchievement('pantry_chef') && allIngredientsMatched) {
      const a = await award('pantry_chef')
      if (a) newAchievements.push(a)
    }

    // Budget Boss
    if (!hasAchievement('budget_boss')) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthlySaved = logs
        .filter((l) => new Date(l.cooked_at) >= monthStart)
        .reduce((sum, l) => sum + (l.estimated_cost_saved || 0), 0)
      if (monthlySaved >= 100) {
        const a = await award('budget_boss', { saved: monthlySaved })
        if (a) newAchievements.push(a)
      }
    }

    return newAchievements
  }

  return { achievements, loading, hasAchievement, award, checkAndAward, refetch: fetchAchievements }
}
