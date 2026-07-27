import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { weekStart } from '../lib/mealPlan'
import { classifyZone } from '../lib/storeOrder'

export interface Special {
  id: string
  item: string
  regular_price: number | null
  sale_price: number | null
  category: string | null
  zone: string | null
  week_range: string
  source: string
}

export interface ScannedSpecial {
  item: string
  regular_price?: number | null
  sale_price?: number | null
  category?: string | null
}

// Current-week specials (source of the "plan around what's on sale" loop).
export function useSpecials() {
  const week = weekStart()
  const [specials, setSpecials] = useState<Special[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSpecials = useCallback(async () => {
    const { data } = await supabase.from('specials').select('*').eq('week_range', week)
    setSpecials((data ?? []) as Special[])
    setLoading(false)
  }, [week])

  useEffect(() => { fetchSpecials() }, [fetchSpecials])

  // Replace this week's scanned specials with a fresh scan (idempotent per week).
  const saveScanned = useCallback(async (items: ScannedSpecial[], source = 'scan') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('specials').delete().eq('week_range', week).eq('source', source)
    const rows = items
      .filter((it) => it.item && it.item.trim())
      .map((it) => ({
        user_id: user.id,
        item: it.item.trim(),
        regular_price: it.regular_price ?? null,
        sale_price: it.sale_price ?? null,
        category: it.category ?? null,
        zone: classifyZone(it.item).zone,
        week_range: week,
        source,
      }))
    if (rows.length) await supabase.from('specials').insert(rows)
    await fetchSpecials()
  }, [week, fetchSpecials])

  const clearWeek = useCallback(async () => {
    await supabase.from('specials').delete().eq('week_range', week)
    await fetchSpecials()
  }, [week, fetchSpecials])

  const totalSavings = specials.reduce((s, x) => {
    if (x.regular_price != null && x.sale_price != null) return s + Math.max(0, x.regular_price - x.sale_price)
    return s
  }, 0)

  return { week, specials, loading, saveScanned, clearWeek, totalSavings, refetch: fetchSpecials }
}
