# Harvest incorporation + Whole Foods specials

Date: 2026-07-27 · Status: approved architecture, phased build

Bring the strong ideas from the Harvest Trader-Joe's meal planner
(SGShuman/tjs-meal-planner) into food-at-home, then add a capstone that ingests
the user's local Whole Foods weekly specials and plans meals around what's on
sale. Delivered in five independently-shippable phases.

## Framing

food-at-home is **inventory-out** (track what you have, fight waste). Harvest is
**plan-forward** (decide what to cook/buy, ordered for the store). These are
complementary; incorporating Harvest's forward-planning closes the loop:
**specials + fridge → planned week → walk-ordered shop → cook → waste tracking.**

Stack is unchanged: React + Vite + TypeScript, Supabase (Postgres + Auth + Edge
Functions, Deno, Claude Haiku 4.5 for vision), Netlify. All schema changes are
**additive** — no existing table/column is altered destructively.

## Data model (Supabase, additive)

- **`store_zones`** (per user): ordered store sections for the walk order, seeded
  from a sensible Whole Foods default, editable. `{ id, user_id, name, sort_order }`.
- **`recipes`** (add columns): `calories, protein_g, carbs_g, fat_g, fiber_g`
  (nullable ints), `last_cooked_at timestamptz`, `heart_count int default 0`,
  `build jsonb` (`{ pro:[], base:[], veg:[], engine:[] }`, optional).
- **`preferences`** (per user, single row): `dietary_restrictions text[]`,
  `hard_nos text[]`, `macro_targets jsonb` (per-meal cal/protein/fiber guides),
  `max_cook_minutes int`, `min_protein_types_per_week int`, `cuisine_variety bool`,
  `recency_weeks int`. The source-of-truth the AI reads.
- **`meal_plans`** + **`meal_plan_meals`**: a flat weekly menu (no day grid).
  `meal_plans { id, user_id, week_range, status }`;
  `meal_plan_meals { id, meal_plan_id, recipe_id, meal_type, slot_order }`.
  Default shape 1 breakfast / 1 lunch / 2 dinners; shape is user-configurable.
- **`specials`**: `{ id, user_id, item, regular_price, sale_price, category, zone,
  week_range, source }` where `source ∈ {'scan','scrape'}`, scoped to current week.

## Phases (each: spec → plan → build → ship)

### Phase 1 — Store-ordered shopping list (foundation)
Port Harvest's three-tier zone classifier (exact-name → keyword rule → fallback
zone) as framework-agnostic TS, seeded from food-at-home's inventory `Category`
enum and a default Whole Foods walk order. Group the existing `grocery_list` by
zone in walk order; add a `store_zones` editor. Pure classifier unit-tested.

### Phase 2 — Macros + preferences profile
Add nutrition fields to recipes (fiber first-class), a macro rollup from
ingredients, and a Preferences screen writing the `preferences` row. No AI yet —
this is the shared foundation for phases 3–5.

### Phase 3 — Preference + variety rules for the AI
Upgrade `generate-recipe` (and `AiRecipeChat`) to read `preferences` and enforce
Harvest's variety rules: honor dietary restrictions/hard-nos, ≥N protein types
per week, no repeated cuisine, don't repeat a meal cooked within `recency_weeks`.
Rules live in a pure module so they're testable independent of the LLM call.

### Phase 4 — Weekly meal plan + hearts/recency rotation + 4-pillar build
The "This Week" flat menu (`meal_plans`), hearting recipes (`heart_count`),
`last_cooked_at` rotation so favorites resurface and recent meals don't repeat,
and the PRO/BASE/VEG/ENGINE `build` as a composition guide + display. Plan pulls
from inventory first (use-what-you-have), derives a grocery list for the gaps.

### Phase 5 — Whole Foods specials (capstone)
New `scan-specials` edge function mirroring `scan-receipt` (Claude-vision → JSON):
photograph the weekly flyer / Prime-deals screen → structured `specials` rows.
Those become a fourth planner input alongside inventory, preferences, and recipe
history; the meal-plan generator is instructed to **favor on-sale items and what's
already in the fridge**. Output tags which meals use specials + estimated savings;
the store-ordered list flags on-sale items. **Hybrid seam:** a future `scrape`
source writes the same `specials` rows, so nothing downstream changes.

## Testing

Pure-logic-first per phase (zone classifier, macro rollups, variety/recency
rules, savings calc) with Vitest unit tests, then UI/edge-function wiring verified
in the running app (vite dev + browser), matching how food-at-home already works.

## Explicitly out of scope / skipped

- Trader Joe's coupling (Fearless Flyer, TJ product names, hardcoded TJ order) —
  the mechanism is adopted, the data generalized to the user's store.
- Harvest's Next.js/Postgres/Docker infra — concepts only; we stay on the
  existing React/Vite/Supabase stack.
- A rigid fixed 4-meal week — the flat-menu discipline is borrowed, but the shape
  is user-configurable.
