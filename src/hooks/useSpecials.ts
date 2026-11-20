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
  // The new deals are written BEFORE the old ones are removed, so a failed
  // write leaves last scan's deals in place. Throws with a message to show.
  const saveScanned = useCallback(async (items: ScannedSpecial[], source = 'scan') => {
    const unchanged = "Could not save the deals — last scan's deals are unchanged. Try again."
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error(unchanged)
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
    if (!rows.length) throw new Error('No sale items to save.')
    const old = await supabase.from('specials').select('id').eq('week_range', week).eq('source', source)
    if (old.error) throw new Error(unchanged)
    const { error: insertError } = await supabase.from('specials').insert(rows)
    if (insertError) throw new Error(unchanged)
    const oldIds = (old.data ?? []).map((r) => r.id as string)
    if (oldIds.length) {
      const { error: deleteError } = await supabase.from('specials').delete().in('id', oldIds)
      if (deleteError) {
        await fetchSpecials()
        throw new Error('The new deals were saved, but the old ones could not be removed. Scan again to tidy up.')
      }
    }
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
