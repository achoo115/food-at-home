// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// A recording PostgREST stub: every chained call returns the builder, and the
// terminal await resolves with whatever `next` holds for that table+op.
type Result = { data: unknown; error: { message: string } | null }
type Pending = Result | (() => Promise<Result>) // a function lets a test hold an answer back
const calls: { table: string; op: string; args: unknown[] }[] = []
const results: Record<string, Pending> = {}
function builder(table: string, op: string) {
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => { calls.push({ table, op: `${op}.${name}`, args }); return b }
  for (const n of ['eq', 'order', 'select', 'single', 'maybeSingle']) b[n] = chain(n)
  b.then = (res: (r: Result) => void) => {
    const r = results[`${table}.${op}`] ?? { data: null, error: null }
    return typeof r === 'function' ? r().then(res) : res(r)
  }
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

// 2026-11-15 is a Sunday (week of Monday 11-09); 2026-11-16 is the next Monday.
describe('useMealPlan — the week rolls over while the app stays open', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 22, 0))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => { vi.useRealTimers() })

  async function openOnSundayThenMonday() {
    const hook = renderHook(() => useMealPlan())
    await waitFor(() => expect(hook.result.current.meals).toHaveLength(1))
    expect(hook.result.current.week).toBe('2026-11-09')
    vi.setSystemTime(new Date(2026, 10, 16, 8, 0))
    results['meal_plans.select'] = { data: null, error: null } // the new week has no plan yet
    results['meal_plans.upsert'] = { data: { id: 'plan2' }, error: null }
    results['meal_plan_meals.select'] = { data: [], error: null }
    calls.length = 0
    return hook
  }

  it('a meal added on Monday goes into the new week’s plan, not last week’s', async () => {
    const { result } = await openOnSundayThenMonday()
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setSlot('r9', 'dinner', 2) })
    expect(ok).toBe(true)
    const planWrite = calls.find((c) => c.table === 'meal_plans' && c.op === 'upsert')
    expect(planWrite?.args[0]).toEqual({ user_id: 'u1', week_range: '2026-11-16' })
    const slotWrite = calls.find((c) => c.table === 'meal_plan_meals' && c.op === 'upsert')
    expect(slotWrite?.args[0]).toEqual({ meal_plan_id: 'plan2', recipe_id: 'r9', meal_type: 'dinner', slot_order: 2 })
    expect(result.current.week).toBe('2026-11-16')
  })

  it('coming back to the app on Monday shows the new, empty week', async () => {
    const { result } = await openOnSundayThenMonday()
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.week).toBe('2026-11-16')
    expect(result.current.meals).toEqual([])
    const asked = calls.find((c) => c.table === 'meal_plans' && c.op === 'select.eq')
    expect(asked?.args).toEqual(['week_range', '2026-11-16'])
  })

  it('clearing a slot on Monday never deletes from last week’s plan (the new week’s slot is already empty)', async () => {
    const { result } = await openOnSundayThenMonday()
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.clearSlot(0) })
    expect(ok).toBe(true)
    expect(calls.filter((c) => c.op === 'delete')).toEqual([])
    expect(result.current.week).toBe('2026-11-16')
  })

  it('a desktop window that was never hidden moves weeks when it gets focus', async () => {
    const { result } = await openOnSundayThenMonday()
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.week).toBe('2026-11-16')
  })

  it('an answer that arrives for the week just left is dropped', async () => {
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    // a write on Sunday whose re-read is still in flight…
    let answer!: (r: Result) => void
    results['meal_plan_meals.select'] = () => new Promise<Result>((r) => { answer = r })
    let write!: Promise<boolean>
    await act(async () => { write = result.current.setSlot('r9', 'dinner', 2); await Promise.resolve() })
    await waitFor(() => expect(answer).toBeTypeOf('function'))
    // …Monday arrives and the app comes back to the foreground…
    vi.setSystemTime(new Date(2026, 10, 16, 8, 0))
    results['meal_plans.select'] = { data: null, error: null }
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // …then Sunday's answer lands.
    await act(async () => { answer({ data: [OATS], error: null }); await write })
    expect(result.current.week).toBe('2026-11-16')
    expect(result.current.loading).toBe(false)
    expect(result.current.meals).toEqual([])
  })

  it('a new week whose meals fail to load shows a failed load, not last week’s meals', async () => {
    const { result } = await openOnSundayThenMonday()
    results['meal_plans.select'] = { data: { id: 'plan2' }, error: null }
    results['meal_plan_meals.select'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.meals).toEqual([])
    expect(result.current.loadFailed).toBe(true)
  })

  it('a write pinned to the week it started in is refused once the week has changed', async () => {
    const { result } = await openOnSundayThenMonday()
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setSlot('r9', 'dinner', 2, '2026-11-09') })
    expect(ok).toBe(false)
    expect(calls.filter((c) => c.op === 'upsert')).toEqual([])
  })

  it('a hidden app does not move weeks until it is visible again', async () => {
    const { result } = await openOnSundayThenMonday()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.week).toBe('2026-11-09')
    expect(result.current.meals).toHaveLength(1)
  })
})

describe('useMealPlan — loading', () => {
  it('a plan lookup that fails is a failed load, not an empty week; Try again recovers', async () => {
    results['meal_plans.select'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadFailed).toBe(true)
    expect(result.current.meals).toEqual([])
    results['meal_plans.select'] = { data: { id: 'plan1' }, error: null }
    await act(async () => { result.current.reload() })
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    expect(result.current.loadFailed).toBe(false)
  })

  it('a week with no plan yet is empty, not failed', async () => {
    results['meal_plans.select'] = { data: null, error: null }
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadFailed).toBe(false)
  })

  it('a run holding the setSlot it started with creates the week’s plan once, not once per slot', async () => {
    results['meal_plans.select'] = { data: null, error: null }
    results['meal_plans.upsert'] = { data: { id: 'plan1' }, error: null }
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const held = result.current.setSlot // what the planner's loop keeps for the whole run
    calls.length = 0
    await act(async () => { await held('r1', 'breakfast', 0) })
    await act(async () => { await held('r2', 'lunch', 1) })
    expect(calls.filter((c) => c.table === 'meal_plans' && c.op === 'upsert')).toHaveLength(1)
    const slots = calls.filter((c) => c.table === 'meal_plan_meals' && c.op === 'upsert').map((c) => (c.args[0] as { meal_plan_id: string }).meal_plan_id)
    expect(slots).toEqual(['plan1', 'plan1'])
  })

  it('clearing a slot in a week with no plan yet is not a failure', async () => {
    results['meal_plans.select'] = { data: null, error: null }
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.clearSlot(1) })
    expect(ok).toBe(true)
  })

  it('Try again after a failed lookup, in a week with no plan yet, clears the failure', async () => {
    results['meal_plans.select'] = { data: null, error: { message: 'TypeError: Failed to fetch' } }
    const { result } = renderHook(() => useMealPlan())
    await waitFor(() => expect(result.current.loadFailed).toBe(true))
    results['meal_plans.select'] = { data: null, error: null }
    const before = calls.length
    await act(async () => { result.current.reload() })
    await waitFor(() => expect(calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(result.current.loadFailed).toBe(false))
    expect(result.current.meals).toEqual([])
  })
})
