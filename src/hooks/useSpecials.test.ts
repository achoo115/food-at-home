// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The REAL supabase-js client over a stub network that behaves like the
// `specials` table: filters are read from the request the client serialised.
type Row = { id: string; item: string; week_range: string; source: string }
const db = vi.hoisted(() => ({
  rows: [] as { id: string; item: string; week_range: string; source: string }[],
  fail: {} as Record<string, boolean>, // 'GET' | 'POST' | 'DELETE'
  sent: [] as string[],
  seq: 0,
  signedIn: true,
}))
vi.mock('../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const net = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    db.sent.push(`${method} ${url.pathname}${url.search}`)
    if (db.fail[method]) return json({ message: 'TypeError: Failed to fetch' }, 500)
    const matches = (r: Row) => {
      for (const [k, v] of url.searchParams) {
        if (k === 'select' || k === 'columns') continue
        const cell = String((r as Record<string, unknown>)[k])
        if (v.startsWith('eq.')) { if (cell !== v.slice(3)) return false }
        else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').map((s) => s.replace(/"/g, '')).includes(cell)) return false }
        else throw new Error(`unhandled filter ${k}=${v}`)
      }
      return true
    }
    if (method === 'GET') return json(db.rows.filter(matches))
    if (method === 'POST') {
      for (const r of JSON.parse(String(init?.body)) as Omit<Row, 'id'>[]) db.rows.push({ ...r, id: `new-${++db.seq}` })
      return json(null, 201)
    }
    if (method === 'DELETE') {
      if (![...url.searchParams.keys()].some((k) => k !== 'select')) throw new Error('unfiltered delete')
      db.rows = db.rows.filter((r) => !matches(r))
      return new Response(null, { status: 204 })
    }
    throw new Error(`unhandled ${method}`)
  }
  const supabase = createClient('http://localhost:54321', 'test-key', { global: { fetch: net as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } })
  supabase.auth.getUser = (async () => ({ data: { user: db.signedIn ? { id: 'u1' } : null }, error: null })) as unknown as typeof supabase.auth.getUser
  return { supabase }
})
import { useSpecials } from './useSpecials'
import { weekStart } from '../lib/mealPlan'

const WEEK = weekStart()
const items = () => db.rows.map((r) => `${r.item}/${r.source}/${r.week_range === WEEK ? 'this' : 'other'}`).sort()

async function mount() {
  const hook = renderHook(() => useSpecials())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

beforeEach(() => {
  db.rows = [
    { id: 'old-1', item: 'Salmon', week_range: WEEK, source: 'scan' },
    { id: 'old-2', item: 'Avocados', week_range: WEEK, source: 'scan' },
    { id: 'scr-1', item: 'Eggs', week_range: WEEK, source: 'scrape' },
    { id: 'lw-1', item: 'Butter', week_range: '2020-01-06', source: 'scan' },
  ]
  db.fail = {}
  db.sent = []
  db.seq = 0
  db.signedIn = true
})

describe('useSpecials.saveScanned', () => {
  it('a new scan replaces this week\'s scanned deals and leaves other sources and other weeks alone', async () => {
    const { result } = await mount()
    await act(async () => { await result.current.saveScanned([{ item: ' Chicken thighs ', sale_price: 1.99 }, { item: '  ' }]) })
    expect(items()).toEqual(['Butter/scan/other', 'Chicken thighs/scan/this', 'Eggs/scrape/this'])
    expect(result.current.specials.map((s) => s.item).sort()).toEqual(['Chicken thighs', 'Eggs'])
  })

  it('when the new deals cannot be written, last scan\'s deals are still there and the save reports the failure', async () => {
    const { result } = await mount()
    db.fail.POST = true
    let thrown: unknown
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]).catch((e) => { thrown = e }) })
    expect((thrown as Error)?.message).toMatch(/last scan's deals are unchanged/)
    expect(items()).toEqual(['Avocados/scan/this', 'Butter/scan/other', 'Eggs/scrape/this', 'Salmon/scan/this'])
  })

  it('when the old deals cannot be looked up, nothing is written and the save reports the failure', async () => {
    const { result } = await mount()
    db.fail.GET = true
    db.sent = []
    let thrown: unknown
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]).catch((e) => { thrown = e }) })
    expect((thrown as Error)?.message).toMatch(/last scan's deals are unchanged/)
    expect(db.sent.filter((s) => !s.startsWith('GET'))).toEqual([])
  })

  it('when the old deals cannot be removed, the save says so instead of reporting success', async () => {
    const { result } = await mount()
    db.fail.DELETE = true
    let thrown: unknown
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]).catch((e) => { thrown = e }) })
    expect((thrown as Error)?.message).toMatch(/old ones could not be removed/)
    // A second scan once the network is back clears both the leftovers and the first attempt.
    db.fail = {}
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]) })
    expect(items()).toEqual(['Butter/scan/other', 'Chicken thighs/scan/this', 'Eggs/scrape/this'])
  })

  it('with the session gone, nothing is written and the save reports the failure', async () => {
    const { result } = await mount()
    db.signedIn = false
    db.sent = []
    let thrown: unknown
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]).catch((e) => { thrown = e }) })
    expect(thrown).toBeInstanceOf(Error)
    expect(db.sent).toEqual([])
  })

  it('a scan with no named items changes nothing', async () => {
    const { result } = await mount()
    let thrown: unknown
    await act(async () => { await result.current.saveScanned([{ item: '   ' }]).catch((e) => { thrown = e }) })
    expect(thrown).toBeInstanceOf(Error)
    expect(items()).toEqual(['Avocados/scan/this', 'Butter/scan/other', 'Eggs/scrape/this', 'Salmon/scan/this'])
  })
})
