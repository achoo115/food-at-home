# Archive Meal Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Plan from my recipes" flow that fills the week's meal slots from the user's saved archive, produces a consolidated grocery list, and shows an estimated cost per serving per recipe.

**Architecture:** Pure selection/consolidation logic in tested `src/lib/*.ts` modules; a new Supabase edge function estimates servings + cost via Claude and the result is cached on the `recipes` row; the existing `ThisWeekPlan` component gains a second planning button and a shopping-list preview. The existing "Plan my week from deals" flow is untouched.

**Tech Stack:** React + TypeScript, Vite, Vitest, Supabase (Postgres + Edge Functions on Deno), Anthropic API (`claude-haiku-4-5-20251001`), Tailwind CSS.

## Global Constraints

- Test runner: `npm test` (`vitest run`); watch: `npm run test:watch`. Type/lint gate: `npm run build` (runs `tsc -b`) and `npm run lint`.
- Money stored as `numeric(6,2)`, matching `specials.regular_price`. Round costs to 2 decimals in JS.
- New DB columns are nullable; existing recipes must keep working with `null` cost/servings (lazy backfill).
- Reuse existing helpers — do NOT reimplement: `rankForRotation` (`src/lib/mealPlan.ts`), `mainProtein` + `violatesHardNo` (`src/lib/weekPlanner.ts`), `normalizeIngredient` + `ingredientsMatch` (`src/lib/ingredientMatcher.ts`).
- Edge functions follow the `generate-recipe` shape exactly: CORS headers, `OPTIONS` handling, `ANTHROPIC_API_KEY` from env, strip ```` ```json ```` fences, JSON-only response, graceful error bodies.
- Grocery "on hand" rule is presence-based: an inventory match excludes the item from the buy list entirely (no partial-quantity math).
- Do NOT modify the "Plan my week from deals" generation path.

---

### Task 1: Schema + type for servings and cost

**Files:**
- Create: `supabase/migrations/20260729120000_recipe_servings_cost.sql`
- Modify: `src/types/recipe.ts:3-26` (add three fields to `Recipe`)

**Interfaces:**
- Produces: `Recipe.servings: number | null`, `Recipe.cost_per_serving: number | null`, `Recipe.cost_estimated_at: string | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260729120000_recipe_servings_cost.sql`:

```sql
alter table recipes add column if not exists servings int;
alter table recipes add column if not exists cost_per_serving numeric(6,2);
alter table recipes add column if not exists cost_estimated_at timestamptz;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: reports the new migration applied (no error). If the CLI is not linked in this environment, apply the same SQL via the Supabase SQL editor / MCP and note it in the commit message.

- [ ] **Step 3: Add the fields to the Recipe type**

In `src/types/recipe.ts`, inside `interface Recipe`, after the `build: {...} | null` line (currently line 25), add:

```ts
  servings: number | null
  cost_per_serving: number | null
  cost_estimated_at: string | null
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: PASS (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729120000_recipe_servings_cost.sql src/types/recipe.ts
git commit -m "feat: recipes gain servings + cost_per_serving columns"
```

---

### Task 2: Archive planner (pure selection logic)

**Files:**
- Create: `src/lib/archivePlanner.ts`
- Test: `src/lib/archivePlanner.test.ts`

**Interfaces:**
- Consumes: `rankForRotation` from `./mealPlan`, `mainProtein` + `violatesHardNo` from `./weekPlanner`, `MealSlot` from `./mealPlan` (`{ meal_type: string; label: string }`), `RecipeWithIngredients` from `../types/recipe`, `Preferences` from `../types/preferences`.
- Produces:
  ```ts
  pickWeekFromArchive(
    savedRecipes: RecipeWithIngredients[],
    prefs: Preferences,
    slots: MealSlot[],
  ): { picks: { slotIndex: number; recipe: RecipeWithIngredients }[]; unfilledSlots: number[] }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/archivePlanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickWeekFromArchive } from './archivePlanner'
import { MEAL_SLOTS } from './mealPlan'
import { DEFAULT_PREFERENCES } from './preferences'
import type { Preferences } from '../types/preferences'
import type { RecipeWithIngredients } from '../types/recipe'

const prefs = (o: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...o })

function recipe(id: string, title: string, ingredients: string[], extra: Partial<RecipeWithIngredients> = {}): RecipeWithIngredients {
  return {
    id, user_id: 'u', title, description: '', instructions: '', prep_time: 0, cook_time: 0,
    source: 'manual', external_id: null, is_favorited: false, times_cooked: 0,
    calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null,
    last_cooked_at: null, heart_count: 0, image_url: null, source_url: null, steps: null, build: null,
    servings: null, cost_per_serving: null, cost_estimated_at: null,
    recipe_ingredients: ingredients.map((name, i) => ({ id: `${id}-${i}`, recipe_id: id, name, quantity: 1, unit: '', is_optional: false })),
    ...extra,
  }
}

describe('pickWeekFromArchive', () => {
  it('enforces main-protein variety across slots', () => {
    const recipes = [
      recipe('a', 'Chicken A', ['chicken breast', 'rice']),
      recipe('b', 'Chicken B', ['chicken thigh', 'pasta']),
      recipe('c', 'Beef Bowl', ['ground beef', 'beans']),
      recipe('d', 'Salmon Plate', ['salmon', 'potatoes']),
      recipe('e', 'Tofu Stir Fry', ['tofu', 'broccoli']),
    ]
    const { picks } = pickWeekFromArchive(recipes, prefs(), MEAL_SLOTS)
    const proteins = picks.map((p) => p.recipe.recipe_ingredients[0].name.split(' ')[0])
    // no two picks share a main protein token (chicken should appear at most once)
    const chickenPicks = picks.filter((p) => p.recipe.title.startsWith('Chicken'))
    expect(chickenPicks.length).toBeLessThanOrEqual(1)
    expect(proteins.length).toBe(picks.length)
  })

  it('excludes recipes containing a hard-no ingredient', () => {
    const recipes = [
      recipe('a', 'Shrimp Scampi', ['shrimp', 'garlic']),
      recipe('b', 'Chicken Rice', ['chicken', 'rice']),
      recipe('c', 'Beef Stew', ['beef', 'carrot']),
      recipe('d', 'Tofu Curry', ['tofu', 'coconut']),
    ]
    const { picks } = pickWeekFromArchive(recipes, prefs({ hard_nos: ['shrimp'] }), MEAL_SLOTS)
    expect(picks.some((p) => p.recipe.id === 'a')).toBe(false)
  })

  it('reports unfilled slots when the archive is too small', () => {
    const { picks, unfilledSlots } = pickWeekFromArchive([recipe('a', 'Chicken', ['chicken'])], prefs(), MEAL_SLOTS)
    expect(picks.length).toBe(1)
    expect(unfilledSlots.length).toBe(MEAL_SLOTS.length - 1)
  })

  it('returns nothing but does not throw on an empty archive', () => {
    const { picks, unfilledSlots } = pickWeekFromArchive([], prefs(), MEAL_SLOTS)
    expect(picks).toEqual([])
    expect(unfilledSlots).toEqual(MEAL_SLOTS.map((_, i) => i))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- archivePlanner`
Expected: FAIL ("pickWeekFromArchive is not a function" / module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/archivePlanner.ts`:

```ts
import type { RecipeWithIngredients } from '../types/recipe'
import type { Preferences } from '../types/preferences'
import type { MealSlot } from './weekPlanner'
import { rankForRotation } from './mealPlan'
import { mainProtein, violatesHardNo } from './weekPlanner'

const MEAL_TYPE_KEYWORDS: Record<string, string[]> = {
  breakfast: ['oatmeal', 'oats', 'egg', 'pancake', 'waffle', 'yogurt', 'smoothie', 'granola', 'toast', 'breakfast'],
  lunch: ['salad', 'sandwich', 'wrap', 'bowl', 'soup', 'lunch'],
}

function ingredientNames(r: RecipeWithIngredients): string[] {
  return (r.recipe_ingredients ?? []).map((i) => i.name)
}

// Light, advisory meal-type fit. Dinners accept anything; breakfast/lunch prefer
// a keyword match in the title. Never blocks filling — callers relax it.
function fitsMealType(r: RecipeWithIngredients, mealType: string): boolean {
  const keywords = MEAL_TYPE_KEYWORDS[mealType]
  if (!keywords) return true
  const title = r.title.toLowerCase()
  return keywords.some((k) => title.includes(k))
}

/**
 * Fill each slot from the saved archive: rotation-ranked, hard-no-filtered, with
 * no two slots sharing a main protein. Meal-type fit is preferred but relaxed
 * before variety. A slot that cannot be filled is reported in `unfilledSlots`.
 */
export function pickWeekFromArchive(
  savedRecipes: RecipeWithIngredients[],
  prefs: Preferences,
  slots: MealSlot[],
): { picks: { slotIndex: number; recipe: RecipeWithIngredients }[]; unfilledSlots: number[] } {
  const safe = savedRecipes.filter((r) => !violatesHardNo(ingredientNames(r), prefs.hard_nos))
  const ranked = rankForRotation(safe)

  const usedIds = new Set<string>()
  const usedProteins: string[] = []
  const picks: { slotIndex: number; recipe: RecipeWithIngredients }[] = []
  const unfilledSlots: number[] = []

  for (let i = 0; i < slots.length; i++) {
    const available = ranked.filter((r) => !usedIds.has(r.id))
    const proteinOk = (r: RecipeWithIngredients) => {
      const p = mainProtein(r.build?.pro, ingredientNames(r))
      return p === 'other' || !usedProteins.includes(p)
    }
    // Preference order: fits meal type AND distinct protein → distinct protein →
    // fits meal type → anything left.
    const chosen =
      available.find((r) => fitsMealType(r, slots[i].meal_type) && proteinOk(r)) ??
      available.find((r) => proteinOk(r)) ??
      available.find((r) => fitsMealType(r, slots[i].meal_type)) ??
      available[0]

    if (!chosen) { unfilledSlots.push(i); continue }
    usedIds.add(chosen.id)
    const p = mainProtein(chosen.build?.pro, ingredientNames(chosen))
    if (p !== 'other') usedProteins.push(p)
    picks.push({ slotIndex: i, recipe: chosen })
  }

  return { picks, unfilledSlots }
}
```

Note: `MealSlot` is already exported from `src/lib/weekPlanner.ts` (`export interface MealSlot`). Import it from there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- archivePlanner`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/archivePlanner.ts src/lib/archivePlanner.test.ts
git commit -m "feat: archivePlanner picks a varied week from the saved archive"
```

---

### Task 3: Grocery consolidation (pure merge logic)

**Files:**
- Create: `src/lib/groceryConsolidation.ts`
- Test: `src/lib/groceryConsolidation.test.ts`

**Interfaces:**
- Consumes: `normalizeIngredient` + `ingredientsMatch` from `./ingredientMatcher`, `RecipeIngredient` from `../types/recipe`.
- Produces:
  ```ts
  interface ConsolidatedItem { name: string; quantity: number; unit: string; fromRecipes: string[] }
  consolidatePlan(
    plannedRecipes: { title: string; recipe_ingredients: RecipeIngredient[] }[],
    inventoryNames: string[],
  ): { toBuy: ConsolidatedItem[]; onHand: { name: string }[] }
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/groceryConsolidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { consolidatePlan } from './groceryConsolidation'
import type { RecipeIngredient } from '../types/recipe'

function ing(name: string, quantity = 1, unit = '', is_optional = false): RecipeIngredient {
  return { id: `${name}-${unit}`, recipe_id: 'r', name, quantity, unit, is_optional }
}

describe('consolidatePlan', () => {
  it('merges the same ingredient across recipes and sums quantity', () => {
    const { toBuy } = consolidatePlan(
      [
        { title: 'Stir Fry', recipe_ingredients: [ing('chicken breast', 1, 'lb')] },
        { title: 'Soup', recipe_ingredients: [ing('chicken', 2, 'lb')] },
      ],
      [],
    )
    const chicken = toBuy.find((i) => i.name === 'chicken')
    expect(chicken).toBeDefined()
    expect(chicken!.quantity).toBe(3)
    expect(chicken!.fromRecipes.sort()).toEqual(['Soup', 'Stir Fry'])
  })

  it('keeps different units as separate lines', () => {
    const { toBuy } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('milk', 1, 'cup'), ing('milk', 1, 'tbsp')] }],
      [],
    )
    expect(toBuy.filter((i) => i.name === 'milk').length).toBe(2)
  })

  it('moves inventory matches to onHand and out of toBuy', () => {
    const { toBuy, onHand } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('rice', 1, 'cup'), ing('salmon', 1, 'lb')] }],
      ['brown rice'],
    )
    expect(onHand.some((i) => i.name === 'rice')).toBe(true)
    expect(toBuy.some((i) => i.name === 'rice')).toBe(false)
    expect(toBuy.some((i) => i.name === 'salmon')).toBe(true)
  })

  it('excludes optional ingredients', () => {
    const { toBuy } = consolidatePlan(
      [{ title: 'A', recipe_ingredients: [ing('parsley', 1, '', true), ing('beef', 1, 'lb')] }],
      [],
    )
    expect(toBuy.some((i) => i.name === 'parsley')).toBe(false)
    expect(toBuy.some((i) => i.name === 'beef')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- groceryConsolidation`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/groceryConsolidation.ts`:

```ts
import type { RecipeIngredient } from '../types/recipe'
import { normalizeIngredient, ingredientsMatch } from './ingredientMatcher'

export interface ConsolidatedItem {
  name: string
  quantity: number
  unit: string
  fromRecipes: string[]
}

/**
 * Merge every non-optional ingredient across the planned recipes into one buy
 * list. Group by (normalized name, unit) and sum quantity; any ingredient the
 * user already has in inventory (presence match) moves to `onHand` instead.
 */
export function consolidatePlan(
  plannedRecipes: { title: string; recipe_ingredients: RecipeIngredient[] }[],
  inventoryNames: string[],
): { toBuy: ConsolidatedItem[]; onHand: { name: string }[] } {
  const groups = new Map<string, ConsolidatedItem>()

  for (const r of plannedRecipes) {
    for (const ing of r.recipe_ingredients ?? []) {
      if (ing.is_optional) continue
      const name = normalizeIngredient(ing.name)
      if (!name) continue
      const key = `${name}::${ing.unit}`
      const existing = groups.get(key)
      if (existing) {
        existing.quantity += ing.quantity
        if (!existing.fromRecipes.includes(r.title)) existing.fromRecipes.push(r.title)
      } else {
        groups.set(key, { name, quantity: ing.quantity, unit: ing.unit, fromRecipes: [r.title] })
      }
    }
  }

  const toBuy: ConsolidatedItem[] = []
  const onHandNames = new Set<string>()
  for (const item of groups.values()) {
    if (inventoryNames.some((inv) => ingredientsMatch(inv, item.name))) {
      onHandNames.add(item.name)
    } else {
      toBuy.push(item)
    }
  }

  toBuy.sort((a, b) => a.name.localeCompare(b.name))
  const onHand = [...onHandNames].sort().map((name) => ({ name }))
  return { toBuy, onHand }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- groceryConsolidation`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/groceryConsolidation.ts src/lib/groceryConsolidation.test.ts
git commit -m "feat: consolidatePlan merges plan ingredients into one buy list"
```

---

### Task 4: Cost/servings edge function + client wrapper

**Files:**
- Create: `supabase/functions/estimate-recipe-economics/index.ts`
- Create: `src/lib/recipeEconomics.ts`

**Interfaces:**
- Produces:
  ```ts
  interface RecipeEconomics { servings: number; cost_total: number; cost_per_serving: number }
  estimateEconomics(input: {
    title: string
    ingredients: { name: string; quantity: number; unit: string }[]
    servings?: number
  }): Promise<RecipeEconomics>
  ```

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/estimate-recipe-economics/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { title, ingredients, servings } = await req.json()

    const systemPrompt = `You estimate the grocery cost of a home recipe using typical average US supermarket prices. Return JSON only, no markdown.

Return format:
{ "servings": 4, "cost_total": 11.20, "cost_per_serving": 2.80 }

Rules:
- cost_total is the estimated total ingredient cost in US dollars for the whole recipe.
- If a servings count is given, use it exactly. Otherwise estimate a realistic servings count.
- cost_per_serving = cost_total / servings, rounded to 2 decimals.
- All three values are numbers (no currency symbols).`

    const lines = (ingredients ?? []).map((i: { quantity: number; unit: string; name: string }) =>
      `- ${[i.quantity, i.unit, i.name].filter(Boolean).join(' ')}`).join('\n')
    let userPrompt = `Recipe: ${title}\nIngredients:\n${lines}`
    if (typeof servings === 'number' && servings > 0) userPrompt += `\n\nServings (use exactly): ${servings}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const result = await response.json()
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let text = result.content?.[0]?.text || '{}'
    text = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()

    let parsed: { servings?: number; cost_total?: number; cost_per_serving?: number }
    try {
      parsed = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse economics JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (typeof parsed.cost_total !== 'number' || typeof parsed.servings !== 'number') {
      return new Response(JSON.stringify({ error: 'Model response missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const s = servings && servings > 0 ? servings : parsed.servings
    const perServing = Math.round((parsed.cost_total / s) * 100) / 100
    return new Response(JSON.stringify({ servings: s, cost_total: parsed.cost_total, cost_per_serving: perServing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy the edge function**

Run: `npx supabase functions deploy estimate-recipe-economics`
Expected: deploy succeeds. (If CLI is unlinked here, deploy via the same path the other functions use and note it in the commit.)

- [ ] **Step 3: Write the client wrapper**

Create `src/lib/recipeEconomics.ts`:

```ts
import { supabase } from './supabase'

export interface RecipeEconomics {
  servings: number
  cost_total: number
  cost_per_serving: number
}

export async function estimateEconomics(input: {
  title: string
  ingredients: { name: string; quantity: number; unit: string }[]
  servings?: number
}): Promise<RecipeEconomics> {
  const { data, error } = await supabase.functions.invoke('estimate-recipe-economics', { body: input })
  if (error) throw new Error(`Cost estimate failed: ${error.message}`)
  return data as RecipeEconomics
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/estimate-recipe-economics/index.ts src/lib/recipeEconomics.ts
git commit -m "feat: estimate-recipe-economics edge function + client wrapper"
```

---

### Task 5: `useRecipes` — ensureEconomics + setServings

**Files:**
- Modify: `src/hooks/useRecipes.ts` (add import, two functions, extend the returned object)

**Interfaces:**
- Consumes: `estimateEconomics` from `../lib/recipeEconomics`.
- Produces on the `useRecipes()` return value:
  ```ts
  ensureEconomics(recipe: RecipeWithIngredients): Promise<{ servings: number | null; cost_per_serving: number | null }>
  setServings(recipeId: string, servings: number): Promise<void>
  ```

- [ ] **Step 1: Add the import**

At the top of `src/hooks/useRecipes.ts`, after the `generateRecipe` import (line 6), add:

```ts
import { estimateEconomics } from '../lib/recipeEconomics'
```

- [ ] **Step 2: Add the two functions**

In `src/hooks/useRecipes.ts`, immediately before the final `return {` block, add:

```ts
  // Fill + cache servings and cost_per_serving on a recipe the first time it is
  // needed (e.g. when it enters a plan). Cache hit returns immediately. On any
  // failure, returns the current (possibly null) values without throwing.
  async function ensureEconomics(recipe: RecipeWithIngredients) {
    if (recipe.cost_per_serving != null && recipe.servings != null) {
      return { servings: recipe.servings, cost_per_serving: recipe.cost_per_serving }
    }
    try {
      const econ = await estimateEconomics({
        title: recipe.title,
        ingredients: (recipe.recipe_ingredients ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
        servings: recipe.servings ?? undefined,
      })
      const nowIso = new Date().toISOString()
      await supabase.from('recipes').update({
        servings: econ.servings, cost_per_serving: econ.cost_per_serving, cost_estimated_at: nowIso,
      }).eq('id', recipe.id)
      setSavedRecipes((prev) => prev.map((r) => r.id === recipe.id
        ? { ...r, servings: econ.servings, cost_per_serving: econ.cost_per_serving, cost_estimated_at: nowIso } : r))
      return { servings: econ.servings, cost_per_serving: econ.cost_per_serving }
    } catch (e) {
      console.error('ensureEconomics failed:', e)
      return { servings: recipe.servings, cost_per_serving: recipe.cost_per_serving }
    }
  }

  // Manual servings edit: rescale the cached per-serving cost from the implied
  // total (cost_per_serving * old_servings) so no extra API call is needed.
  async function setServings(recipeId: string, servings: number) {
    const recipe = savedRecipes.find((r) => r.id === recipeId)
    if (!recipe || servings <= 0) return
    const newCps = recipe.cost_per_serving != null && recipe.servings
      ? Math.round((recipe.cost_per_serving * recipe.servings / servings) * 100) / 100
      : recipe.cost_per_serving
    await supabase.from('recipes').update({ servings, cost_per_serving: newCps }).eq('id', recipeId)
    setSavedRecipes((prev) => prev.map((r) => r.id === recipeId ? { ...r, servings, cost_per_serving: newCps } : r))
  }
```

- [ ] **Step 3: Export them**

In the final `return { ... }` of `useRecipes`, add `ensureEconomics` and `setServings` to the returned object (append to the last line before the closing brace):

```ts
    toggleFavorite, incrementCookCount, getRecipeDetail, ensureEconomics, setServings, refetch: fetchSaved,
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecipes.ts
git commit -m "feat: useRecipes.ensureEconomics + setServings"
```

---

### Task 6: PlanShoppingPreview component

**Files:**
- Create: `src/components/recipes/PlanShoppingPreview.tsx`

**Interfaces:**
- Consumes: `ConsolidatedItem` from `../../lib/groceryConsolidation`.
- Produces:
  ```ts
  interface Props {
    toBuy: ConsolidatedItem[]
    onHand: { name: string }[]
    onAdd: () => void
    onCancel: () => void
    adding: boolean
  }
  export function PlanShoppingPreview(props: Props): JSX.Element
  ```

- [ ] **Step 1: Write the component**

Create `src/components/recipes/PlanShoppingPreview.tsx`:

```tsx
import type { ConsolidatedItem } from '../../lib/groceryConsolidation'

interface Props {
  toBuy: ConsolidatedItem[]
  onHand: { name: string }[]
  onAdd: () => void
  onCancel: () => void
  adding: boolean
}

function label(item: ConsolidatedItem): string {
  return [item.quantity > 1 ? item.quantity : '', item.unit, item.name].filter(Boolean).join(' ')
}

export function PlanShoppingPreview({ toBuy, onHand, onAdd, onCancel, adding }: Props) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Shopping list — {toBuy.length} to buy</h3>
        <button onClick={onCancel} className="text-gray-300 text-sm">✕</button>
      </div>

      {toBuy.length === 0 ? (
        <p className="text-sm text-gray-500">Everything for this week is already in your kitchen 🎉</p>
      ) : (
        <ul className="space-y-1">
          {toBuy.map((item) => (
            <li key={`${item.name}-${item.unit}`} className="flex items-start justify-between text-sm">
              <span className="text-gray-700 capitalize">{label(item)}</span>
              <span className="text-xs text-gray-400 ml-2 text-right">{item.fromRecipes.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      {onHand.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Already have</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {onHand.map((i) => (
              <li key={i.name} className="text-sm text-gray-400 line-through capitalize">{i.name}</li>
            ))}
          </ul>
        </div>
      )}

      {toBuy.length > 0 && (
        <button onClick={onAdd} disabled={adding} className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-50">
          {adding ? 'Adding…' : `Add ${toBuy.length} item${toBuy.length > 1 ? 's' : ''} to shopping list`}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/recipes/PlanShoppingPreview.tsx
git commit -m "feat: PlanShoppingPreview shows the consolidated buy list"
```

---

### Task 7: Wire archive planning + cost + preview into ThisWeekPlan

**Files:**
- Modify: `src/components/recipes/ThisWeekPlan.tsx`
- Modify: `src/pages/RecipesPage.tsx:94-113` (props passed to `ThisWeekPlan`)

**Interfaces:**
- Consumes: `pickWeekFromArchive` (Task 2), `consolidatePlan` + `ConsolidatedItem` (Task 3), `PlanShoppingPreview` (Task 6), `ensureEconomics` (Task 5).
- Changes the `ThisWeekPlan` Props: adds `onEnsureEconomics`; changes `onAddToGrocery` to take items.

- [ ] **Step 1: Update ThisWeekPlan imports and Props**

In `src/components/recipes/ThisWeekPlan.tsx`, add to the imports block (after line 5):

```tsx
import { pickWeekFromArchive } from '../../lib/archivePlanner'
import { consolidatePlan } from '../../lib/groceryConsolidation'
import { PlanShoppingPreview } from './PlanShoppingPreview'
```

Change the `Props` interface (lines 19-27): replace the `onAddToGrocery` line and add `onEnsureEconomics`:

```tsx
  onGenerateForSlot: (args: { mealType: string; constraints: string[]; onSaleItems: string[] }) => Promise<GeneratedSlotRecipe | null>
  onEnsureEconomics: (recipe: RecipeWithIngredients) => Promise<{ servings: number | null; cost_per_serving: number | null }>
  onAddToGrocery: (items: { name: string; quantity: number; unit: string }[]) => Promise<void>
  onViewRecipe: (recipe: RecipeWithIngredients) => void
```

Update the destructure on line 41 to include `onEnsureEconomics`:

```tsx
export function ThisWeekPlan({ savedRecipes, inventoryItems, preferences, specials, onGenerateForSlot, onEnsureEconomics, onAddToGrocery, onViewRecipe }: Props) {
```

- [ ] **Step 2: Add state, archive-plan handler, cost map, and preview state**

In `ThisWeekPlan`, after the existing `const cancelRef = useRef(false)` (line 50), add:

```tsx
  const [costByRecipe, setCostByRecipe] = useState<Record<string, number | null>>({})
  const [preview, setPreview] = useState<{ toBuy: ReturnType<typeof consolidatePlan>['toBuy']; onHand: { name: string }[] } | null>(null)
  const [adding, setAdding] = useState(false)
  const [archiveNote, setArchiveNote] = useState('')

  async function planFromArchive() {
    if (filledCount > 0 && !window.confirm('Replace this week’s planned meals with picks from your saved recipes?')) return
    setSummary(null); setArchiveNote(''); setListMsg('')
    const { picks, unfilledSlots } = pickWeekFromArchive(savedRecipes, preferences, MEAL_SLOTS)
    // clear slots we won't fill so a re-plan doesn't leave stale meals
    for (const i of unfilledSlots) await clearSlot(i)
    for (const p of picks) await setSlot(p.recipe.id, MEAL_SLOTS[p.slotIndex].meal_type, p.slotIndex)
    if (unfilledSlots.length) {
      const labels = unfilledSlots.map((i) => MEAL_SLOTS[i].label.toLowerCase()).join(', ')
      setArchiveNote(`Couldn’t fill ${labels} from your saved recipes — add one manually or import more.`)
    }
    // fire cost estimates in the background; update as they resolve
    for (const p of picks) {
      onEnsureEconomics(p.recipe).then((e) => setCostByRecipe((prev) => ({ ...prev, [p.recipe.id]: e.cost_per_serving })))
    }
  }

  function costFor(recipeId: string, fallback: number | null): number | null {
    return recipeId in costByRecipe ? costByRecipe[recipeId] : fallback
  }

  const weekCost = meals.reduce((sum, m) => sum + (costFor(m.recipe.id, m.recipe.cost_per_serving) ?? 0), 0)

  async function openPreview() {
    const { toBuy, onHand } = consolidatePlan(meals.map((m) => ({ title: m.recipe.title, recipe_ingredients: m.recipe.recipe_ingredients ?? [] })), inventoryNames)
    setPreview({ toBuy, onHand })
  }

  async function confirmAddToList() {
    if (!preview) return
    setAdding(true)
    await onAddToGrocery(preview.toBuy.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })))
    setAdding(false)
    setPreview(null)
    setListMsg(`Added ${preview.toBuy.length} item${preview.toBuy.length !== 1 ? 's' : ''} to your shopping list`)
  }
```

- [ ] **Step 3: Add the "Plan from my recipes" button**

In the returned JSX, immediately after the opening `<div className="space-y-3">` (line 134) and before the `{/* Auto-plan control */}` block, insert:

```tsx
      {!planning && (
        <button onClick={planFromArchive} className="w-full py-3 bg-green-700 text-white rounded-xl font-semibold shadow-sm">
          {filledCount > 0 ? 'Replan from my recipes' : 'Plan from my recipes'}
          <span className="block text-xs font-normal text-green-100 mt-0.5">Picks from your {savedRecipes.length} saved recipes</span>
        </button>
      )}
      {archiveNote && <p className="text-sm text-center text-amber-600">{archiveNote}</p>}
      {weekCost > 0 && (
        <p className="text-sm text-center text-gray-500">≈ ${weekCost.toFixed(2)} for the week · one serving of each meal</p>
      )}
```

- [ ] **Step 4: Show per-slot cost**

In the filled-meal branch, right after the `<MacroBadges ... />` line (currently line 167), add:

```tsx
                  {(() => {
                    const cps = costFor(meal.recipe.id, meal.recipe.cost_per_serving)
                    return cps != null
                      ? <p className="text-xs text-gray-400 mt-1">~${cps.toFixed(2)}/serving</p>
                      : (meal.recipe.id in costByRecipe ? null : <p className="text-xs text-gray-300 mt-1">estimating cost…</p>)
                  })()}
```

- [ ] **Step 5: Replace the shopping-list button with the preview flow**

Replace the entire trailing block (currently lines 194-201, the `{meals.length > 0 && !planning && (...)}` block) with:

```tsx
      {meals.length > 0 && !planning && (
        <div className="pt-2 space-y-2">
          {preview ? (
            <PlanShoppingPreview
              toBuy={preview.toBuy}
              onHand={preview.onHand}
              onAdd={confirmAddToList}
              onCancel={() => setPreview(null)}
              adding={adding}
            />
          ) : (
            <button onClick={openPreview} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold">
              Build shopping list from plan
            </button>
          )}
          {listMsg && <p className="text-sm text-gray-500 text-center mt-2">{listMsg}</p>}
        </div>
      )}
```

Then delete the now-unused `buildShoppingList` function (lines 119-129) and its imports if unused: `matchInventoryToRecipe` is no longer used — remove it from the import on line 5. Run `npm run lint` to confirm no unused symbols remain.

- [ ] **Step 6: Update RecipesPage props**

In `src/pages/RecipesPage.tsx`, in the `<ThisWeekPlan ... />` element (lines 94-113), add the `onEnsureEconomics` prop and change `onAddToGrocery`:

```tsx
            onEnsureEconomics={(r) => recipes.ensureEconomics(r)}
            onAddToGrocery={async (items) => { for (const it of items) await grocery.addItem(it.name, it.quantity, it.unit) }}
```

(Leave `onGenerateForSlot`, `onViewRecipe`, and the other props as they are.)

- [ ] **Step 7: Verify build, lint, and tests**

Run: `npm run build && npm run lint && npm test`
Expected: all PASS, no unused-symbol lint errors.

- [ ] **Step 8: Manually verify in the app**

Run: `npm run dev`, open the app, go to Recipes → This Week. Tap "Plan from my recipes": slots fill from saved recipes, "estimating cost…" resolves to "~$X/serving", the week total appears, and "Build shopping list from plan" opens the consolidated preview with merged quantities and on-hand items crossed out. Confirm "Add N items" writes to the grocery list.

- [ ] **Step 9: Commit**

```bash
git add src/components/recipes/ThisWeekPlan.tsx src/pages/RecipesPage.tsx
git commit -m "feat: Plan from my recipes — archive plan, cost/serving, consolidated list"
```

---

### Task 8: Servings + cost on the recipe detail page

**Files:**
- Modify: `src/pages/RecipeDetailPage.tsx`

**Interfaces:**
- Consumes: `setServings` from `useRecipes` (Task 5).

- [ ] **Step 1: Pull setServings from the hook**

In `src/pages/RecipeDetailPage.tsx`, change the `useRecipes()` destructure (line 18) to:

```tsx
  const { savedRecipes, loading, setServings } = useRecipes()
```

- [ ] **Step 2: Show servings + cost, with an inline servings editor**

In the metadata paragraph area, right after the `<MacroBadges macros={recipe} className="mt-2" />` line, add:

```tsx
      <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
        <label className="flex items-center gap-1">
          Serves
          <input
            type="number"
            min={1}
            defaultValue={recipe.servings ?? ''}
            onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v !== recipe.servings) setServings(recipe.id, v) }}
            className="w-14 px-2 py-1 rounded border border-gray-200"
            placeholder="?"
          />
        </label>
        {recipe.cost_per_serving != null && (
          <span className="text-gray-500">~${recipe.cost_per_serving.toFixed(2)}/serving</span>
        )}
      </div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manually verify**

In `npm run dev`, open a recipe that has been planned (so it has cost data). Confirm "Serves N" shows and is editable, and "~$X/serving" appears. Change the servings number and confirm the per-serving cost rescales on the next load.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RecipeDetailPage.tsx
git commit -m "feat: show + edit servings and cost/serving on recipe detail"
```

---

## Self-Review

**Spec coverage:**
- Migration (servings, cost_per_serving, cost_estimated_at) → Task 1 ✓
- `estimate-recipe-economics` edge function + client → Task 4 ✓
- `ensureEconomics` lazy cache + `setServings` rescale → Task 5 ✓
- `archivePlanner` (rotation, hard-no, protein variety, meal-type heuristic, unfilled reporting) → Task 2 ✓
- `groceryConsolidation` (merge, unit grouping, on-hand exclusion, optional exclusion) → Task 3 ✓
- UI: plan button, per-slot cost, week total, consolidated preview → Tasks 6 + 7 ✓
- Recipe detail servings + cost + edit → Task 8 ✓
- Error handling (economics failure leaves null / shows "—", empty archive, all-on-hand) → Tasks 5, 2, 6 ✓
- Testing (both pure modules) → Tasks 2, 3 ✓

**Type consistency:** `pickWeekFromArchive` return `{picks, unfilledSlots}` used identically in Task 7. `ConsolidatedItem` shape (`name/quantity/unit/fromRecipes`) consistent across Tasks 3, 6, 7. `estimateEconomics` / `ensureEconomics` return shapes match their consumers. `onAddToGrocery` items shape `{name, quantity, unit}` consistent between ThisWeekPlan (Task 7) and RecipesPage (Task 7 step 6) and `grocery.addItem(name, quantity, unit)`.

**Out of scope confirmed absent:** no multi-week, no aisle routing, no quantity-aware inventory subtraction, no `meal_type` column, no change to the deals generation path.
