# Deferred week-planner items — gate report (2026-11-19)

The seven items deferred on 2026-11-10, built inline on `planner-deferred`.

## What changed
1. `useMealPlan`: the week is state; plan id and meals are tagged with their week; the week is re-read on visibilitychange, on window focus and before every write. An app open across Monday no longer writes into last week's plan. A failed load is `loadFailed` (with `reload`), not an empty week. `setSlot(..., onlyWeek)` refuses a write once the week has changed. `clearSlot` on a week with no plan is a no-op success and never deletes from the week left behind.
2. `ThisWeekPlan`: wake lock while planning/swapping; "Fill the N empty slots from deals"; a screen still on last week only moves to the new week on the first tap; every planner write is pinned to the start week; failed load screen with Try again.
3. `generateRecipe`: 45 s timeout. `SpecialsScanner`: 60 s per page, and unread pages are reported instead of dropped silently.
4. `BarcodeScanner`: "Scan again"; `safeStop` (html5-qrcode's `stop()` throws synchronously when not running — it was called in the effect cleanup after every decode).
5. `public/sw.js` (cache v4): page loads fall back to the cached app after 4 s or on failure, under one key for every route; the build's `/assets/*` files are stored as fetched; only OK responses are stored; a missing asset answered by Netlify's `/* → /index.html 200` rewrite is not stored; data requests stay network-first and are never answered from cache while merely slow.
6. Save in AI Chef and search results reports "Saved ✓" or a failure, keyed to the recipe it was for.

The 45 s, 60 s and 4 s limits are chosen, not measured.

## Review
- SME panel ×3 (React/concurrency, mobile PWA, data integrity), read-only on 49b5ff4: no wrong-week write and no data loss found. Fixed from it: scanner stop crash, stale-shell-without-assets, stale week on screen, mid-run week change, failed load shown as empty, silent dropped flyer pages, save-state race, repeated plan upsert in a run, spurious "could not be saved" from clearing a slot in a fresh week.
- Auditor round 1 (FIX-FIRST): gate numbers reproduced; 5 GREEN mutants (stale-answer guard, `sameWeek`, two RecipesPage `saved != null` lines, RecipeDetail `.catch`). All now guarded or removed.
- Auditor round 2 (FIX-FIRST): 8 GREEN mutants — RecipeDetail tag compare, load-effect `failed` clear, `onlyWeek` on archive fill and swap, RecipesPage wiring ×2, asset origin check, decode-callback `safeStop`; plus the Netlify 200-HTML asset hole (read only). All but the decode-callback `safeStop` now have a test; that one is left unpinned.
- Round 3 was the final pass (three-round cap): no third audit was run on the last commit.

## Gate (final tree)
- vitest: `Test Files 27 passed (27)` / `Tests 275 passed (275)`, exit 0 (main: 21 files / 226).
- `tsc -b` exit 0. `vite build` exit 0.
- eslint: 11 errors, the same files as main (pre-existing react-hooks rules).

## Mutations (mutate.sh, each RED then restored, tree clean after)
47 RED in three batches (14 + 25 + 8).
- Hook: rollover compare; ensurePlan week check; clearSlot week check; visible-only check; stale-answer guard; `sameWeek`; lookup-error failed flag; fetch-error failed flag; `onlyWeek` refusal; plan id read from the ref; clearSlot no-plan result; focus listener; load-effect `failed` clear.
- Planner: wake lock disabled; fill-empty skip; fill-empty kept meals; `weekMoved`; `onlyWeek` on planWeek, archive fill and swap; week-changed note; failed-load screen.
- Timeouts: generate `timeout` option; scanner `timeout` option; scanner unread note.
- Barcode: Scan again not restarting; `safeStop` try/catch; cleanup stop.
- Service worker: cached fallback; navigate-only wait; shell key; ok gate; html gate; asset store; asset path prefix; asset-is-a-page check; asset origin check.
- Save: failure shown as saved ×2; `.catch` ×2; `!= null` ×2; tag compare ×2; RecipesPage wiring ×2.
One mutation stayed GREEN in my own run (a plan-id write in `ensurePlan`): the line was redundant and was deleted.

## Not done
- Two devices on one week: last write wins, no warning.
- `saveRecipe` is not idempotent: a retry after a lost reply can duplicate a recipe; the cleanup delete is unchecked.
- `useWakeLock` can take a second lock if visibility changes while the first request is pending.
- After "Fill the empty slots" the deals/savings line counts only the new meals.
- Old hashed assets accumulate in the v4 cache until the cache name changes.
- Not verified on a device: real service worker, wake lock, camera, a real Monday boundary.
