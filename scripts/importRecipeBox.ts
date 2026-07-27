/**
 * Local, one-pass NYT Cooking Recipe Box importer.
 *
 * Runs on YOUR machine with YOUR NyT session cookie — so the fetch comes from your
 * own residential IP + logged-in session (the fetch a hosted server can't do). It
 * pages through your saved Recipe Box, parses each recipe's schema.org JSON-LD with
 * the same tested parser the app uses, and by default writes a reviewable
 * `imported-recipes.json`. Optionally inserts straight into your app DB if you
 * provide a Supabase service key.
 *
 * USAGE (from the repo root):
 *   1. In a logged-in NYT Cooking browser tab, open DevTools → Application →
 *      Cookies, copy the value of the `NYT-S` cookie (and `nyt-a` if present).
 *   2. Run:
 *        NYT_COOKIE='NYT-S=...; nyt-a=...' npm run import:recipebox
 *      This writes imported-recipes.json — open it, sanity-check, done.
 *   3. (Optional) To insert directly into the app instead of a file, also set:
 *        SUPABASE_URL=... SUPABASE_SERVICE_KEY=... APP_USER_ID=<your auth user id>
 *      then re-run. Existing recipes with the same source_url are updated, not duped.
 *
 * Env:
 *   NYT_COOKIE            (required) full cookie header string
 *   MAX_PAGES            (default 25) Recipe Box pages to walk
 *   OUTPUT               (default imported-recipes.json)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, APP_USER_ID  (optional) direct insert
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { extractRecipeUrls, extractLdJsonBlocks, parseLdJsonBlocks } from '../src/lib/recipeImport.ts'

// Load .env.import.local (Supabase creds staged for you + your NYT_COOKIE line)
// without a dependency. Existing shell env wins.
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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const RECIPE_BOX = 'https://cooking.nytimes.com/recipes/recipe-box'

const cookie = process.env.NYT_COOKIE
if (!cookie) {
  console.error('Missing NYT_COOKIE. See usage at the top of this script.')
  process.exit(1)
}
const MAX_PAGES = Number(process.env.MAX_PAGES || 25)
const OUTPUT = process.env.OUTPUT || 'imported-recipes.json'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', Cookie: cookie! } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

async function collectRecipeUrls(): Promise<string[]> {
  const all = new Set<string>()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? RECIPE_BOX : `${RECIPE_BOX}?page=${page}`
    let html: string
    try {
      html = await fetchHtml(url)
    } catch (e) {
      console.warn(`  page ${page}: ${(e as Error).message} — stopping pagination`)
      break
    }
    const before = all.size
    for (const u of extractRecipeUrls(html)) all.add(u)
    const added = all.size - before
    console.log(`  page ${page}: +${added} recipes (total ${all.size})`)
    if (added === 0) break // no new recipes → end of box
    await sleep(600)
  }
  return [...all]
}

async function main() {
  console.log('Reading your NYT Recipe Box…')
  const urls = await collectRecipeUrls()
  console.log(`Found ${urls.length} saved recipes. Fetching + parsing…`)

  const recipes: Record<string, unknown>[] = []
  let ok = 0, fail = 0
  for (const [i, url] of urls.entries()) {
    try {
      const html = await fetchHtml(url)
      const parsed = parseLdJsonBlocks(extractLdJsonBlocks(html))
      if (!parsed) { fail++; console.warn(`  [${i + 1}/${urls.length}] no recipe data: ${url}`); continue }
      recipes.push({
        title: parsed.title,
        description: parsed.description,
        instructions: parsed.instructions,
        prep_time: parsed.prep_time,
        cook_time: parsed.cook_time,
        source: 'imported',
        source_url: url,
        image_url: parsed.image_url,
        calories: parsed.macros.calories,
        protein_g: parsed.macros.protein_g,
        carbs_g: parsed.macros.carbs_g,
        fat_g: parsed.macros.fat_g,
        fiber_g: parsed.macros.fiber_g,
        ingredients: parsed.ingredients,
      })
      ok++
      if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${urls.length}`)
    } catch (e) {
      fail++; console.warn(`  [${i + 1}/${urls.length}] ${(e as Error).message}`)
    }
    await sleep(500)
  }
  console.log(`Parsed ${ok} recipes (${fail} skipped).`)

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, APP_USER_ID } = process.env
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY && APP_USER_ID) {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    let inserted = 0
    for (const r of recipes) {
      const { ingredients, ...rest } = r as { ingredients: string[] } & Record<string, unknown>
      // Dedupe on (user, source_url): delete any existing then insert fresh.
      await db.from('recipes').delete().eq('user_id', APP_USER_ID).eq('source_url', rest.source_url as string)
      const { data, error } = await db.from('recipes').insert({ ...rest, user_id: APP_USER_ID }).select('id').single()
      if (error || !data) { console.warn(`  insert failed: ${rest.title} — ${error?.message}`); continue }
      if (ingredients.length) {
        await db.from('recipe_ingredients').insert(ingredients.map((name) => ({ recipe_id: data.id, name, quantity: 1, unit: '' })))
      }
      inserted++
    }
    console.log(`Inserted ${inserted} recipes into your app.`)
  } else {
    writeFileSync(OUTPUT, JSON.stringify(recipes, null, 2))
    console.log(`Wrote ${recipes.length} recipes to ${OUTPUT}. Review it; set SUPABASE_* + APP_USER_ID to insert.`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
