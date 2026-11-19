import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Runs the real public/sw.js against fake `self`, `caches` and `fetch`. The
// fake cache is keyed by URL like the real one, so a page that was never
// visited is a miss unless the worker stores the app under a shared key.
const source = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://food-at-home-app.netlify.app'
type Res = { tag: string; ok: boolean; headers: { get: (n: string) => string | null }; clone: () => Res }
const res = (tag: string, type = 'text/html', ok = true): Res => {
  const r: Res = { tag, ok, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? type : null) }, clone: () => r }
  return r
}
const keyOf = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href

function boot() {
  const listeners: Record<string, (e: unknown) => void> = {}
  const store = new Map<string, Res>()
  const net: { next: Promise<Res> } = { next: new Promise<Res>(() => {}) }
  const self = { addEventListener: (n: string, f: (e: unknown) => void) => { listeners[n] = f }, skipWaiting() {}, clients: { claim() {} }, location: { origin: ORIGIN } }
  const caches = {
    match: async (k: string | { url: string }) => store.get(keyOf(k)),
    open: async () => ({ put: async (k: string | { url: string }, r: Res) => { store.set(keyOf(k), r) } }),
    keys: async () => [], delete: async () => true,
  }
  new Function('self', 'caches', 'fetch', source)(self, caches, () => net.next)
  const ask = (url: string, mode: string, network: Promise<Res>) => {
    net.next = network
    let answer: Promise<Res | undefined> | undefined
    listeners.fetch({ request: { method: 'GET', url: new URL(url, ORIGIN).href, mode }, respondWith: (p: Promise<Res | undefined>) => { answer = p } })
    let got: Res | undefined | 'pending' = 'pending'
    answer?.then((r) => { got = r })
    return { answered: answer !== undefined, got: () => got, tag: () => (got as Res | undefined)?.tag }
  }
  return { ask, store }
}
const never = () => new Promise<Res>(() => {})
const tick = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('service worker', () => {
  it('a page load on a dead connection gets the cached app after 4 s, not before', async () => {
    const sw = boot()
    sw.ask('/', 'navigate', Promise.resolve(res('shell-v1'))); await tick()
    const load = sw.ask('/', 'navigate', never())
    await vi.advanceTimersByTimeAsync(3900)
    expect(load.got()).toBe('pending')
    await vi.advanceTimersByTimeAsync(200)
    expect(load.tag()).toBe('shell-v1')
  })

  it('a page that was never opened before still gets the cached app (every route is the same index.html)', async () => {
    const sw = boot()
    sw.ask('/', 'navigate', Promise.resolve(res('shell-v1'))); await tick()
    const deep = sw.ask('/recipes/abc-123', 'navigate', never())
    await vi.advanceTimersByTimeAsync(4100)
    expect(deep.tag()).toBe('shell-v1')
    const offline = sw.ask('/inventory', 'navigate', Promise.reject(new TypeError('Failed to fetch')))
    await tick()
    expect(offline.tag()).toBe('shell-v1')
  })

  it('a page load on a working connection gets the network copy', async () => {
    const sw = boot()
    sw.ask('/', 'navigate', Promise.resolve(res('shell-v1'))); await tick()
    const load = sw.ask('/', 'navigate', Promise.resolve(res('shell-v2')))
    await tick()
    expect(load.tag()).toBe('shell-v2')
  })

  it('an error page or a non-HTML navigation never replaces the cached app', async () => {
    const sw = boot()
    sw.ask('/', 'navigate', Promise.resolve(res('shell-v1'))); await tick()
    sw.ask('/', 'navigate', Promise.resolve(res('502 page', 'text/html', false))); await tick()
    sw.ask('/icon-512.png', 'navigate', Promise.resolve(res('a picture', 'image/png'))); await tick()
    const load = sw.ask('/', 'navigate', never())
    await vi.advanceTimersByTimeAsync(4100)
    expect(load.tag()).toBe('shell-v1')
  })

  it('a slow page load with nothing cached keeps waiting for the network', async () => {
    const sw = boot()
    let arrive!: (r: Res) => void
    const load = sw.ask('/', 'navigate', new Promise<Res>((r) => { arrive = r }))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load.got()).toBe('pending')
    arrive(res('late'))
    await tick()
    expect(load.tag()).toBe('late')
  })

  it('the build’s script files are stored as they are fetched, so the cached app can start without the network', async () => {
    const sw = boot()
    const first = sw.ask('/assets/index-CjlSn1LT.js', 'cors', Promise.resolve(res('bundle', 'text/javascript'))); await tick()
    expect(first.tag()).toBe('bundle')
    const offline = sw.ask('/assets/index-CjlSn1LT.js', 'cors', never())
    await tick()
    expect(offline.tag()).toBe('bundle')
  })

  it('a script the new deploy removed is not stored: the host answers it with the app page and status 200', async () => {
    const sw = boot()
    sw.ask('/assets/index-OLD.js', 'cors', Promise.resolve(res('index.html again', 'text/html; charset=UTF-8', true))); await tick()
    expect([...sw.store.keys()]).toEqual([])
  })

  it('an error answer, other static files and another site’s /assets/ are not stored', async () => {
    const sw = boot()
    sw.ask('/assets/index-gone.js', 'cors', Promise.resolve(res('500', 'text/plain', false))); await tick()
    sw.ask('/icon-192.png', 'no-cors', Promise.resolve(res('icon', 'image/png'))); await tick()
    sw.ask('https://cdn.example.com/assets/lib.js', 'cors', Promise.resolve(res('theirs', 'text/javascript'))); await tick()
    expect([...sw.store.keys()]).toEqual([])
  })

  it('a slow data request is never answered from the old cache', async () => {
    const sw = boot()
    const DATA = 'https://x.supabase.co/rest/v1/meal_plan_meals?select=*'
    sw.ask(DATA, 'cors', Promise.resolve(res('plan-as-of-earlier', 'application/json'))); await tick()
    const slow = sw.ask(DATA, 'cors', never())
    await vi.advanceTimersByTimeAsync(30_000)
    expect(slow.answered).toBe(true)
    expect(slow.got()).toBe('pending')
  })

  it('a failed data request still falls back to the cache (offline)', async () => {
    const sw = boot()
    const DATA = 'https://x.supabase.co/rest/v1/meal_plan_meals?select=*'
    sw.ask(DATA, 'cors', Promise.resolve(res('plan-as-of-earlier', 'application/json'))); await tick()
    const offline = sw.ask(DATA, 'cors', Promise.reject(new TypeError('Failed to fetch')))
    await tick()
    expect(offline.tag()).toBe('plan-as-of-earlier')
  })
})
