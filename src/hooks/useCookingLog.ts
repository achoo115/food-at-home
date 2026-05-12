import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CookingLog } from '../types/gamification'

const DEFAULT_TAKEOUT_COST = 18

export function useCookingLog() {
  const [logs, setLogs] = useState<CookingLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('cooking_log')
      .select('*')
      .order('cooked_at', { ascending: false })
    if (!error && data) setLogs(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  async function logCook(recipeId: string | null, rating?: number, notes?: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('cooking_log')
      .insert({
        user_id: user.id,
        recipe_id: recipeId,
        estimated_cost_saved: DEFAULT_TAKEOUT_COST,
        rating: rating ?? null,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (!error && data) setLogs((prev) => [data, ...prev])
    return { data, error }
  }

  function getCurrentStreak(): number {
    if (logs.length === 0) return 0
    const days = new Set(logs.map((l) => l.cooked_at.split('T')[0]))
    const sorted = [...days].sort().reverse()
    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i <= sorted.length; i++) {
      const checkDate = new Date(today)
      checkDate.setDate(checkDate.getDate() - i)
      const dateStr = checkDate.toISOString().split('T')[0]
      if (days.has(dateStr)) {
        streak++
      } else if (i === 0) {
        continue
      } else {
        break
      }
    }
    return streak
  }

  function getMonthlySavings(): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return logs
      .filter((l) => new Date(l.cooked_at) >= monthStart)
      .reduce((sum, l) => sum + (l.estimated_cost_saved || 0), 0)
  }

  function getWeeklyCookCount(): number {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return new Set(
      logs
        .filter((l) => new Date(l.cooked_at) >= weekAgo)
        .map((l) => l.cooked_at.split('T')[0])
    ).size
  }

  function getCookedDates(): Set<string> {
    return new Set(logs.map((l) => l.cooked_at.split('T')[0]))
  }

  return { logs, loading, logCook, getCurrentStreak, getMonthlySavings, getWeeklyCookCount, getCookedDates, refetch: fetchLogs }
}
