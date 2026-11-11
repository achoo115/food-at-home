// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// A recording PostgREST stub: every chained call returns the builder, and the
// terminal await resolves with whatever `next` holds for that table+op.
type Result = { data: unknown; error: { message: string } | null }
const calls: { table: string; op: string; args: unknown[] }[] = []
const results: Record<string, Result> = {}
function builder(table: string, op: string) {
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => { calls.push({ table, op: `${op}.${name}`, args }); return b }
  for (const n of ['eq', 'order', 'select', 'single', 'maybeSingle']) b[n] = chain(n)
  b.then = (res: (r: Result) => void) => res(results[`${table}.${op}`] ?? { data: null, error: null })
  return b
}
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      select: (...a: unknown[]) => { calls.push({ table, op: 'select', args: a }); return builder(table, 'select') },
      upsert: (...a: unknown[]) => { calls.push({ table, op: 'upsert', args: a }); return builder(table, 'upsert') },
      insert: (...a: unknown[]) => { calls.push({ table, op: 'insert', args: a }); return builder(table, 'insert') },
      delete: (...a: unknown[]) => { calls.push({ table, op: 'delete', args: a }); return builder(table, 'delete') },
    }),
  },
}))
import { useMealPlan } from './useMealPlan'

const OATS = { id: 'm0', meal_type: 'breakfast', slot_order: 0, recipe: { id: 'a', title: 'Oats' } }

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(results)) delete results[k]
  results['meal_plans.select'] = { data: { id: 'plan1' }, error: null }
  results['meal_plan_meals.select'] = { data: [OATS], error: null }
})

describe('useMealPlan.setSlot', () => {
  it('writes the slot as one upsert on (meal_plan_id, slot_order) — never a delete followed by an insert', async () => {
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    calls.length = 0
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setSlot('r9', 'dinner', 2) })
    expect(ok).toBe(true)
    const writes = calls.filter((c) => c.table === 'meal_plan_meals' && c.op !== 'select' && !c.op.startsWith('select.'))
    expect(writes.map((c) => c.op)).toEqual(['upsert'])
    expect(writes[0].args[0]).toEqual({ meal_plan_id: 'plan1', recipe_id: 'r9', meal_type: 'dinner', slot_order: 2 })
    expect(writes[0].args[1]).toEqual({ onConflict: 'meal_plan_id,slot_order' })
  })

  it('reports a failed write and leaves the meal that was in the slot', async () => {
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    results['meal_plan_meals.upsert'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setSlot('r9', 'breakfast', 0) })
    expect(ok).toBe(false)
    expect(result.current.meals.map((m) => m.recipe.title)).toEqual(['Oats'])
  })

  it('clearSlot reports a delete that did not land and keeps the meal', async () => {
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    results['meal_plan_meals.delete'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.clearSlot(0) })
    expect(ok).toBe(false)
    expect(result.current.meals).toHaveLength(1)
  })

  it('a failed meals fetch keeps the last known plan instead of showing an empty week', async () => {
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    results['meal_plan_meals.select'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    await act(async () => { await result.current.clearSlot(0) })
    expect(result.current.meals).toHaveLength(1)
  })
})
