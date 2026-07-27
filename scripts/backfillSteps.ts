/**
 * One-time backfill: parse every recipe's free-text `instructions` into a stored
 * `steps` array (jsonb) for Cook Mode. Runs the SAME tested `splitSteps` the app
 * uses as a live fallback — but persisting it lets you hand-correct the handful
 * that don't split cleanly (see the "REVIEW" list it prints).
 *
 * USAGE (from repo root), with your service key staged in .env.import.local:
 *   npm run backfill:steps            # dry run — prints what it WOULD write
 *   WRITE=1 npm run backfill:steps    # actually write the steps column
 *
 * Env (loaded from .env.import.local; shell env wins):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY   (required)
 *   APP_USER_ID                          (optional) limit to one user's recipes
 *   WRITE=1                              (optional) perform writes
 */
import { readFileSync, existsSync } from 'node:fs'
import { splitSteps } from '../src/lib/recipeSteps.ts'

if (existsSync('.env.import.local')) {
  for (const line of readFileSync('.env.import.local', 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
}

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, APP_USER_ID, WRITE } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. See usage at top of this script.')
  process.exit(1)
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)

  let q = db.from('recipes').select('id, title, instructions')
  if (APP_USER_ID) q = q.eq('user_id', APP_USER_ID)
  const { data, error } = await q
  if (error || !data) { console.error('fetch failed:', error?.message); process.exit(1) }

  console.log(`${data.length} recipes. Parsing steps${WRITE ? '' : ' (dry run)'}…\n`)
  const review: { title: string; id: string }[] = []
  let wrote = 0

  for (const r of data as { id: string; title: string; instructions: string }[]) {
    const steps = splitSteps(r.instructions)
    if (steps.length <= 1) review.push({ title: r.title, id: r.id })
    if (WRITE) {
      const { error: upErr } = await db.from('recipes').update({ steps }).eq('id', r.id)
      if (upErr) { console.warn(`  update failed: ${r.title} — ${upErr.message}`); continue }
      wrote++
    }
  }

  console.log(WRITE ? `Wrote steps for ${wrote} recipes.` : `Would write steps for ${data.length} recipes.`)
  if (review.length) {
    console.log(`\n${review.length} recipe(s) parsed to a SINGLE step — review/hand-fix these in the DB:`)
    for (const r of review) console.log(`  - ${r.title}  (${r.id})`)
  } else {
    console.log('\nEvery recipe split into 2+ steps. 🎉')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
