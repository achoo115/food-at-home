// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The REAL supabase-js client over a stub network that behaves like the table.
vi.mock('../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { db, makeNet } = await import('./specialsTableStub')
  const supabase = createClient('http://localhost:54321', 'test-key', { global: { fetch: makeNet() as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } })
  supabase.auth.getUser = (async () => ({ data: { user: db.signedIn ? { id: 'u1' } : null }, error: null })) as unknown as typeof supabase.auth.getUser
  return { supabase }
})
import { useSpecials } from './useSpecials'
import { db } from './specialsTableStub'
import { weekStart } from '../lib/mealPlan'

const WEEK = weekStart()
const items = () => db.rows.map((r) => `${r.item}/${r.source}/${r.week_range === WEEK ? 'this' : 'other'}`).sort()
const UNTOUCHED = ['Avocados/scan/this', 'Butter/scan/other', 'Eggs/scrape/this', 'Salmon/scan/this']
const REPLACED = ['Butter/scan/other', 'Chicken thighs/scan/this', 'Eggs/scrape/this']

async function mount() {
  const hook = renderHook(() => useSpecials())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}
async function failing(run: () => Promise<unknown>): Promise<Error | undefined> {
  let thrown: Error | undefined
  await act(async () => { await run().catch((e) => { thrown = e }) })
  return thrown
}

beforeEach(() => {
  db.reset([
    { id: 'old-1', item: 'Salmon', week_range: WEEK, source: 'scan' },
    { id: 'old-2', item: 'Avocados', week_range: WEEK, source: 'scan' },
    { id: 'scr-1', item: 'Eggs', week_range: WEEK, source: 'scrape' },
    { id: 'lw-1', item: 'Butter', week_range: '2020-01-06', source: 'scan' },
  ])
})

describe('useSpecials.saveScanned', () => {
  it('a new scan replaces this week\'s scanned deals and leaves other sources and other weeks alone', async () => {
    const { result } = await mount()
    await act(async () => { await result.current.saveScanned([{ item: ' Chicken thighs ', sale_price: 1.99 }, { item: '  ' }]) })
    expect(items()).toEqual(REPLACED)
    expect(result.current.specials.map((s) => s.item).sort()).toEqual(['Chicken thighs', 'Eggs'])
  })

  it('when the new deals cannot be written, last scan\'s deals are still there and the save reports the failure', async () => {
    const { result } = await mount()
    db.fail.POST = true
    const thrown = await failing(() => result.current.saveScanned([{ item: 'Chicken thighs' }]))
    expect(thrown?.message).toMatch(/last scan's deals are still here/)
    expect(items()).toEqual(UNTOUCHED)
  })

  it('the save never depends on reading the old deals first (a read can be answered from an offline cache)', async () => {
    const { result } = await mount()
    db.fail.GET = true
    db.sent = []
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]) })
    expect(items()).toEqual(REPLACED)
    expect(db.sent[0].startsWith('POST')).toBe(true)
  })

  it('when the old deals cannot be removed, the save says so, the list shows what is really stored, and saving again tidies up', async () => {
    const { result } = await mount()
    db.fail.DELETE = true
    const thrown = await failing(() => result.current.saveScanned([{ item: 'Chicken thighs' }]))
    expect(thrown?.message).toMatch(/old ones could not be removed/)
    expect(result.current.specials.map((s) => s.item).sort()).toEqual(['Avocados', 'Chicken thighs', 'Eggs', 'Salmon'])
    db.fail = {}
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]) })
    expect(items()).toEqual(REPLACED)
  })

  it('when the write lands but its answer is lost, saving again leaves one copy of the deals', async () => {
    const { result } = await mount()
    db.loseInsertReply = true
    const thrown = await failing(() => result.current.saveScanned([{ item: 'Chicken thighs' }]))
    expect(thrown).toBeInstanceOf(Error)
    expect(result.current.specials.map((s) => s.item).sort()).toEqual(['Avocados', 'Chicken thighs', 'Eggs', 'Salmon'])
    db.loseInsertReply = false
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]) })
    expect(items()).toEqual(REPLACED)
  })

  it('a week holding hundreds of old deals is still cleared (no request grows with the number of rows)', async () => {
    db.reset(Array.from({ length: 300 }, (_, i) => ({ id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`, item: `Old ${i}`, week_range: WEEK, source: 'scan' })))
    db.maxUrl = 2000
    const { result } = await mount()
    await act(async () => { await result.current.saveScanned([{ item: 'Chicken thighs' }]) })
    expect(items()).toEqual(['Chicken thighs/scan/this'])
  })

  it('with the session gone, nothing is written and the save reports the failure', async () => {
    const { result } = await mount()
    db.signedIn = false
    db.sent = []
    const thrown = await failing(() => result.current.saveScanned([{ item: 'Chicken thighs' }]))
    expect(thrown).toBeInstanceOf(Error)
    expect(db.sent).toEqual([])
  })

  it('a scan with no named items changes nothing', async () => {
    const { result } = await mount()
    db.sent = []
    const thrown = await failing(() => result.current.saveScanned([{ item: '   ' }]))
    expect(thrown).toBeInstanceOf(Error)
    expect(db.sent).toEqual([])
    expect(items()).toEqual(UNTOUCHED)
  })
})
