import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Preferences } from '../types/preferences'
import { DEFAULT_PREFERENCES, normalizePreferences } from '../lib/preferences'

// One preferences row per user (unique user_id). Reads the row if present, else
// exposes defaults; save() upserts on user_id so there's always exactly one.
export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)

  const fetchPreferences = useCallback(async () => {
    const { data, error } = await supabase.from('preferences').select('*').maybeSingle()
    if (!error && data) setPreferences(normalizePreferences(data))
    setLoading(false)
  }, [])

  useEffect(() => { fetchPreferences() }, [fetchPreferences])

  const save = useCallback(async (next: Partial<Preferences>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const clean = normalizePreferences({ ...preferences, ...next })
    const row = {
      user_id: user.id,
      dietary_restrictions: clean.dietary_restrictions,
      hard_nos: clean.hard_nos,
      macro_targets: clean.macro_targets,
      max_cook_minutes: clean.max_cook_minutes,
      min_protein_types_per_week: clean.min_protein_types_per_week,
      cuisine_variety: clean.cuisine_variety,
      recency_weeks: clean.recency_weeks,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('preferences')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single()
    if (!error && data) setPreferences(normalizePreferences(data))
  }, [preferences])

  return { preferences, loading, save }
}
