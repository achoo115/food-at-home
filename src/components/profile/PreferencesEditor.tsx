import { useEffect, useState } from 'react'
import { usePreferences } from '../../hooks/usePreferences'

const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const fromList = (a: string[]) => a.join(', ')
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))

// Household preferences editor — the source of truth the AI planner reads.
export function PreferencesEditor() {
  const { preferences, loading, save } = usePreferences()
  const [restrictions, setRestrictions] = useState('')
  const [hardNos, setHardNos] = useState('')
  const [maxCook, setMaxCook] = useState('')
  const [minProtein, setMinProtein] = useState('3')
  const [variety, setVariety] = useState(true)
  const [recency, setRecency] = useState('2')
  const [cal, setCal] = useState('')
  const [protein, setProtein] = useState('')
  const [fiber, setFiber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (loading) return
    setRestrictions(fromList(preferences.dietary_restrictions))
    setHardNos(fromList(preferences.hard_nos))
    setMaxCook(preferences.max_cook_minutes == null ? '' : String(preferences.max_cook_minutes))
    setMinProtein(String(preferences.min_protein_types_per_week))
    setVariety(preferences.cuisine_variety)
    setRecency(String(preferences.recency_weeks))
    setCal(preferences.macro_targets.calories ? String(preferences.macro_targets.calories) : '')
    setProtein(preferences.macro_targets.protein_g ? String(preferences.macro_targets.protein_g) : '')
    setFiber(preferences.macro_targets.fiber_g ? String(preferences.macro_targets.fiber_g) : '')
  }, [loading, preferences])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await save({
      dietary_restrictions: toList(restrictions),
      hard_nos: toList(hardNos),
      max_cook_minutes: numOrNull(maxCook),
      min_protein_types_per_week: Number(minProtein),
      cuisine_variety: variety,
      recency_weeks: Number(recency),
      macro_targets: {
        calories: cal ? Number(cal) : undefined,
        protein_g: protein ? Number(protein) : undefined,
        fiber_g: fiber ? Number(fiber) : undefined,
      },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'
  const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

  if (loading) return <p className="text-gray-400 text-sm">Loading preferences…</p>

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Dietary restrictions</label>
        <input className={field} placeholder="vegetarian, gluten-free…" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} />
        <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
      </div>
      <div>
        <label className={label}>Hard no's</label>
        <input className={field} placeholder="pineapple, cilantro…" value={hardNos} onChange={(e) => setHardNos(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Max cook (min)</label>
          <input className={field} type="number" inputMode="numeric" placeholder="no limit" value={maxCook} onChange={(e) => setMaxCook(e.target.value)} />
        </div>
        <div>
          <label className={label}>Protein types / week</label>
          <input className={field} type="number" inputMode="numeric" value={minProtein} onChange={(e) => setMinProtein(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={label}>Per-meal targets (optional)</label>
        <div className="grid grid-cols-3 gap-2">
          <input className={field} type="number" placeholder="cal" value={cal} onChange={(e) => setCal(e.target.value)} />
          <input className={field} type="number" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <input className={field} type="number" placeholder="fiber g" value={fiber} onChange={(e) => setFiber(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className={label + ' mb-0'}>No repeats within (weeks)</label>
          <input className={field + ' w-20 mt-1'} type="number" inputMode="numeric" value={recency} onChange={(e) => setRecency(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={variety} onChange={(e) => setVariety(e.target.checked)} />
          Vary cuisines
        </label>
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save preferences'}
      </button>
    </div>
  )
}
