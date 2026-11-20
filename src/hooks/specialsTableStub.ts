// Test helper: a stub network that behaves like the `specials` table behind
// PostgREST, for driving the REAL supabase-js client. Filters are read from
// the request the client serialised; anything unexpected throws.
export type Row = { id: string; item: string; week_range: string; source: string; created_at: string; [k: string]: unknown }

export const db = {
  rows: [] as Row[],
  /** 'GET' | 'POST' | 'DELETE' → answer 500. */
  fail: {} as Record<string, boolean>,
  /** The insert lands but its answer is lost. */
  loseInsertReply: false,
  /** Longest request URL the "server" accepts. */
  maxUrl: 8000,
  /** What the scan function answers, when set. */
  scanned: undefined as unknown,
  sent: [] as string[],
  seq: 0,
  signedIn: true,
  reset(rows: Omit<Row, 'created_at'>[]) {
    db.seq = 0
    db.rows = rows.map((r) => ({ ...r, created_at: stamp(++db.seq) }) as Row)
    db.fail = {}
    db.loseInsertReply = false
    db.maxUrl = 8000
    db.scanned = undefined
    db.sent = []
    db.signedIn = true
  },
}

// Postgres-style timestamps, one per statement, offset included so a client
// that fails to encode the "+" is caught.
function stamp(n: number) { return `2026-11-20T10:00:00.${String(n).padStart(6, '0')}+00:00` }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function matcher(url: URL) {
  return (r: Row) => {
    for (const [k, v] of url.searchParams) {
      if (k === 'select' || k === 'columns') continue
      const cell = String(r[k])
      if (v.startsWith('eq.')) { if (cell !== v.slice(3)) return false }
      else if (v.startsWith('lt.')) {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00$/.test(v.slice(3))) throw new Error(`bad timestamp ${v}`)
        if (!(cell < v.slice(3))) return false
      } else throw new Error(`unhandled filter ${k}=${v}`)
    }
    return true
  }
}

/** Answers the scan function with `scanned`, and /rest/v1/specials from `db`. */
export function makeNet(scanned: unknown = []) {
  return async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.pathname.includes('/functions/')) return json(db.scanned ?? scanned)
    db.sent.push(`${method} ${url.pathname}${url.search}`)
    if (String(input).length > db.maxUrl) return json({ message: 'URI too long' }, 414)
    if (db.fail[method]) return json({ message: 'TypeError: Failed to fetch' }, 500)
    if (method === 'GET') return json(db.rows.filter(matcher(url)))
    if (method === 'POST') {
      const at = stamp(++db.seq) // one statement, one timestamp
      const made = (JSON.parse(String(init?.body)) as Omit<Row, 'id' | 'created_at'>[]).map((r) => ({ ...r, id: `new-${++db.seq}`, created_at: at }) as Row)
      db.rows.push(...made)
      if (db.loseInsertReply) return json({ message: 'TypeError: Load failed' }, 500)
      return json(made.map((r) => ({ created_at: r.created_at })), 201)
    }
    if (method === 'DELETE') {
      if (![...url.searchParams.keys()].some((k) => k !== 'select')) throw new Error('unfiltered delete')
      const hit = matcher(url)
      db.rows = db.rows.filter((r) => !hit(r))
      return new Response(null, { status: 204 })
    }
    throw new Error(`unhandled ${method}`)
  }
}
