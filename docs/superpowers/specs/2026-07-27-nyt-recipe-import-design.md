# NYT Cooking (and any-site) recipe import

Date: 2026-07-27 · Status: approved, phased build

Let the user bring recipes into food-at-home — primarily from NYT Cooking (a
paywalled subscription, no public recipe API) but from any recipe site — as saved
recipes that flow into everything already built (macros/4-pillar, hearts/recency
rotation, the weekly plan, the store-ordered shopping list).

## Framing & constraints

There is no legitimate bulk dump of NYT Cooking. This is a **personal, not-for-sale,
single-user tool** and the user is a **paying NYT subscriber**, so importing recipes
they have legitimate access to — for their own reference, never redistributed — is
personal use. Scope is deliberately limited to **recipes the user chose** (their
Recipe Box + one-off URLs), NOT the whole ~25K catalog: whole-catalog automated
harvest is the ToS gray area and is useless bulk. Every path uses the user's own
access.

The near-universal mechanism is **schema.org/Recipe JSON-LD** embedded in recipe
pages. Parsing it per-recipe is a solved, robust technique (cf. hhursev/recipe-
scrapers) and works far beyond NYT.

## The reusable heart — pure JSON-LD parser

`src/lib/recipeImport.ts`, no network/React:
- `parseRecipeJsonLd(html: string): NormalizedRecipe | null` — find the `Recipe`
  node (handle `@graph`, arrays, `@type` as string or array), extract title,
  description, ingredients (`recipeIngredient`), instructions (`recipeInstructions`
  as string | `HowToStep[]` | `HowToSection[]` → single numbered string), times
  (`prepTime`/`cookTime`/`totalTime` ISO-8601 → minutes), yield, and `nutrition`
  → macros (`calories`, `proteinContent` "34 g" → 34, etc.). Returns `null` when
  no usable Recipe JSON-LD is present.
- `normalizeToRecipe(n): SaveRecipeInput` — map to the app's saveRecipe shape,
  `source: 'imported'`, `source_url` set.
- Helpers `iso8601ToMinutes`, `parseNutritionGrams` are individually tested.

This is the correctness core; unit-tested with fixtures including an NYT-shaped
payload, a `@graph` wrapper, `HowToSection` instructions, and a no-JSON-LD → null.

## Per-recipe import

- Edge function `import-recipe`: fetch the pasted URL server-side, run
  `parseRecipeJsonLd`, return the normalized recipe or `{ needsFallback: true }`
  when no usable JSON-LD is found (gated page).
- Recipes tab **Import** flow: paste URL → preview → save. On `needsFallback`,
  drop to a **paste-text / screenshot → Claude parse** path (reuse the scan-*
  vision pattern) so a paywalled recipe the subscriber is viewing still imports.
- Macros: use JSON-LD `nutrition` when present; else optional LLM macro/4-pillar
  enrichment (same model call family as generate-recipe). Never blocks the save.

## Recipe Box (the user's saved recipes) — both use the user's own access

- **In-app bulk-paste:** a textarea to paste many recipe URLs (e.g. copied from
  the Recipe Box page); each runs through the import pipeline with per-URL
  success/fail feedback. No cookies, no auth plumbing.
- **Local one-pass script** `scripts/importRecipeBox.ts`: run on the user's
  machine with their own NYT session cookie in an env var; pages through *their*
  Recipe Box, then imports each saved recipe via the same parser. Authenticated
  by the user, scoped to what they saved. Never hosted; never handles credentials
  server-side.

## Schema (additive migration)

- `recipes.source`: extend the CHECK to include `'imported'`.
- `recipes.source_url text` (nullable): provenance + dedupe — re-importing the
  same URL updates the existing row instead of duplicating.

## Data flow

import (URL or paste/photo or Recipe Box) → `parseRecipeJsonLd` /
Claude-parse → normalized recipe → `recipes` (+ `recipe_ingredients`) →
already-built surfaces: macro chips, rotation, weekly plan, store-ordered list.

## Build order (each independently useful)

1. Pure parser + fixtures/tests.
2. `import-recipe` edge function + per-recipe URL import UI + bulk-paste box
   (+ paste/screenshot fallback).
3. Local Recipe Box script.

## Testing

Pure-parser unit tests (fixtures: NYT-shaped, `@graph`, `HowToSection`, ISO
durations, nutrition grams, no-JSON-LD null) via Vitest; edge function + UI
verified live against real recipe URLs in the running app.

## Out of scope

- Whole-catalog / sitemap enumeration (automated bulk access — ToS gray, useless
  bulk).
- Any hosted handling of the user's NYT credentials (the Recipe Box script is
  local-only).
- Redistribution of imported content (single-user, private).
