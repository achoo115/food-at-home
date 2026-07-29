# Archive Meal Planner — Plan from My Recipes

**Date:** 2026-07-29
**Status:** Approved (design)

## Summary

Add a **"Plan from my recipes"** flow to the *This Week* tab that auto-fills the
week's meal slots by *selecting* recipes from the user's saved archive (no AI
generation). From the filled plan the user gets:

1. A **consolidated grocery list** — ingredients merged across all planned
   recipes, deduped, with anything already in the kitchen removed.
2. An **estimated cost per serving** per recipe, plus a week total.

This sits alongside the existing "Plan my week from deals" button (which
AI-generates a fresh recipe per slot). Both remain; neither is changed.

## Motivation

The existing planner generates brand-new recipes and never draws on the user's
saved archive except through manual per-slot picking. The user wants to plan the
week *from recipes they already keep*, see what they'd actually need to buy as one
merged list, and know roughly what each meal costs per serving. None of cost,
servings, or ingredient consolidation exists today.

## Current state (relevant facts)

- **Meal slots:** `MEAL_SLOTS` in `src/lib/mealPlan.ts` — fixed 4: breakfast,
  lunch, dinner, dinner. Plan is per-week (`weekStart()` Monday key), stored in
  `meal_plans` / `meal_plan_meals` via `useMealPlan`.
- **Recipes:** `recipes` + `recipe_ingredients(name, quantity, unit, is_optional)`.
  No `servings`, no cost, no `meal_type` tag.
- **Rotation ranking:** `rankForRotation()` already orders recipes so favorites
  resurface and recently-cooked sink.
- **Variety + safety helpers:** `mainProtein()` and `violatesHardNo()` in
  `src/lib/weekPlanner.ts`.
- **Ingredient matching:** `normalizeIngredient()` / `ingredientsMatch()` /
  `matchInventoryToRecipe()` in `src/lib/ingredientMatcher.ts`.
- **Pricing signals today:** only weekly `specials` (regular/sale price) and an
  optional `cost` on inventory items. No per-ingredient price table.
- **AI calls:** Supabase edge functions (e.g. `generate-recipe`) call Anthropic
  (`claude-haiku-4-5-20251001`), return JSON, CORS-enabled; invoked from the
  client via `supabase.functions.invoke(...)`.
- **Existing shortcut:** `ThisWeekPlan.buildShoppingList()` already adds *missing
  ingredient names* to the grocery list, but with no quantity merging and no cost.
- **Import** parses `recipeYield` (e.g. "4 servings") — currently discarded.

## Design decisions (resolved)

| Question | Decision |
|---|---|
| Relationship to deals planner | **Add alongside.** New "Plan from my recipes" button above the existing deals button. Deals planner untouched. |
| Cost-per-serving source | **AI estimate at plan time**, cached on the recipe row (US grocery averages). |
| Servings | **New `servings` column**, AI-filled (using parsed `recipeYield` when available), editable in recipe detail. |
| Unfillable slot (e.g. dinner-heavy archive) | **Leave slot empty and report it** — never force a bad pick. |
| Grocery "on hand" rule | **Presence-based:** any inventory match → excluded from buy list. No partial-quantity subtraction. |

## Data model

One migration: `supabase/migrations/20260729xxxxxx_recipe_servings_cost.sql`

```sql
alter table recipes add column if not exists servings int;
alter table recipes add column if not exists cost_per_serving numeric(6,2);
alter table recipes add column if not exists cost_estimated_at timestamptz;
```

All nullable; existing recipes are unaffected until they enter a plan (lazy
backfill). `numeric(6,2)` matches the `specials.regular_price` style already in
the schema.

Add the three fields to the `Recipe` interface in `src/types/recipe.ts`.

## Components

### 1. `estimate-recipe-economics` edge function

New Supabase function mirroring `generate-recipe` (Haiku, JSON-only, CORS,
graceful error bodies).

- **Input:** `{ title, ingredients: [{name, quantity, unit}], servings?: number }`
- **Output:** `{ servings: number, cost_total: number, cost_per_serving: number }`
- **Prompt:** estimate total ingredient cost with typical US grocery prices; if
  `servings` is provided, use it verbatim and only compute cost; otherwise also
  estimate a reasonable servings count. Return `cost_per_serving = cost_total /
  servings` rounded to cents.

Client wrapper `src/lib/recipeEconomics.ts`:
`estimateEconomics(input): Promise<{servings, cost_total, cost_per_serving}>`.

### 2. `useRecipes` extension — `ensureEconomics(recipe)`

- If `recipe.cost_per_serving != null && recipe.servings != null` → return as-is
  (cache hit).
- Else call `estimateEconomics` with `{title, ingredients, servings:
  recipe.servings ?? undefined}`, then `update` the row with `servings`,
  `cost_per_serving`, `cost_estimated_at = now()`, update local state, return the
  filled recipe.
- A separate `setServings(recipeId, servings)` recomputes `cost_per_serving`
  from the cached total (`cost_per_serving * old_servings / new_servings`) so
  manual edits stay consistent without another API call.

### 3. `src/lib/archivePlanner.ts` (pure)

```ts
pickWeekFromArchive(
  savedRecipes: RecipeWithIngredients[],
  prefs: Preferences,
  slots: MealSlot[],
): { picks: { slotIndex: number; recipe: RecipeWithIngredients }[];
     unfilledSlots: number[] }
```

Algorithm:
1. Drop recipes whose ingredient names hit a `hard_no` (`violatesHardNo`).
2. Rank the survivors with `rankForRotation`.
3. Greedily fill slots in order. For each slot, pick the highest-ranked
   remaining recipe that (a) fits the slot's meal type by a light title/build
   heuristic, and (b) does not reuse a main protein already chosen this week
   (`mainProtein`). Relax the meal-type constraint before the variety
   constraint if needed.
4. If no candidate fits a slot, record it in `unfilledSlots` and continue.

Meal-type heuristic: a small keyword map (e.g. breakfast ← oatmeal/eggs/pancake/
yogurt/smoothie; lunch ← salad/sandwich/wrap/bowl). Dinners accept anything.
Purely advisory — never blocks filling when the archive is thin.

### 4. `src/lib/groceryConsolidation.ts` (pure)

```ts
consolidatePlan(
  plannedRecipes: { title: string; recipe_ingredients: RecipeIngredient[] }[],
  inventoryNames: string[],
): {
  toBuy: { name: string; quantity: number; unit: string; fromRecipes: string[] }[];
  onHand: { name: string }[];
}
```

- Group every non-optional ingredient by `(normalizeIngredient(name), unit)`.
- Sum `quantity` within a group; collect the source recipe titles.
- If any group name matches inventory (`ingredientsMatch`), move it to `onHand`
  and exclude it from `toBuy`.
- `toBuy` sorted by name for a stable display.

### 5. UI

- **`ThisWeekPlan.tsx`:**
  - New primary button **"Plan from my recipes"** above the deals button.
    Clicking runs `pickWeekFromArchive`, writes each pick via `setSlot`
    (instant, no network), then fires `ensureEconomics` for each picked recipe,
    updating the display as estimates resolve.
  - If `unfilledSlots` is non-empty, show a note ("Couldn't fill breakfast from
    your saved recipes — add one manually or import more").
  - Each filled slot shows `~$X/serving` (or a subtle "estimating…" until it
    resolves).
  - Week summary line: `~$NN for the week · M items to buy`.
  - "Build shopping list from plan" opens a **consolidated preview** (to-buy
    lines with merged quantities + est. cost, on-hand crossed out) with an
    "Add N items" confirm that writes real merged quantities to `grocery_list`.
- **`RecipeDetail` / recipe detail page:** show `servings` (editable) and
  `~$X/serving`.

## Data flow

```
Plan from my recipes
  → pickWeekFromArchive(savedRecipes, prefs, MEAL_SLOTS)   [pure, instant]
  → setSlot(...) per pick                                   [meal_plan_meals]
  → ensureEconomics(recipe) per pick                        [edge fn, cached on recipes]
  → UI shows cost/serving + week total

Build shopping list from plan
  → consolidatePlan(plannedRecipes, inventoryNames)         [pure]
  → preview panel (toBuy + onHand)
  → confirm → grocery.addItem(name, qty, unit) per toBuy    [grocery_list]
```

## Error handling

- Edge function failure (network / parse / model): `ensureEconomics` leaves
  `cost_per_serving` null; UI shows "—" instead of a price; planning still
  succeeds. No throw propagates to break the plan.
- Empty archive: `pickWeekFromArchive` returns no picks and all slots unfilled;
  UI shows the existing empty-state guidance.
- All-slots-on-hand: consolidated preview shows the existing "Everything for
  this week is already in your kitchen" message.

## Testing

Vitest unit tests (matching existing `src/lib/*.test.ts`):

- `archivePlanner.test.ts`: protein variety across slots; hard-no filtering;
  rotation order respected; unfilled-slot reporting when the archive is too
  small; meal-type heuristic relaxes gracefully.
- `groceryConsolidation.test.ts`: same ingredient across two recipes merges and
  sums; different units stay separate; inventory match moves an item to on-hand
  and out of to-buy; optional ingredients excluded.

Edge function, `ensureEconomics` persistence, and UI wiring verified manually
against the live app after deploy.

## Out of scope (YAGNI)

- Multi-week planning.
- Store-aisle / zone routing of the grocery list.
- Quantity-aware inventory subtraction (partial "have some, need more").
- A real `meal_type` column on recipes (light heuristic only).
- Any change to the existing "Plan my week from deals" flow.
