# Week-planner state machine fix — 2026-11-10

Branch `fix/week-planner-state` off main b9df17b. Tests aae019c (red first), fix 7c73d7a.

## Origin
Read-only census of implicit state machines (8 found). SME panel ×3 (React state/concurrency, mobile PWA reliability, data integrity) reviewed the census before any code.

## Panel corrections to the census (verified)
- supabase-js never rejects on network loss: `postgrest-js/dist/index.cjs:293` attaches `.catch` unless `throwOnError`; nothing in src calls it. The only rejection source in the planner is `generateRecipe` (`src/lib/claude.ts:37` rethrows the edge-function error).
- `meal_plan_meals (meal_plan_id, slot_order)` already has a unique index (migration 20260727160000); the data defect was delete-then-insert with neither `{error}` read, not duplicate rows.
- `RecipeImport.save()` could not get stuck; it showed "Saved ✓" for a recipe `saveRecipe` had silently failed to insert.

## Triage
Built: planner `Status` union + ref-backed `begin/end` guard; try/finally in every async handler; unmount sets the cancel ref; persist-after-checks host contract (`onGenerateForSlot` generates only, `onPersistSlotRecipe` saves once); shopping preview computed from the live plan; `setSlot` as one upsert with the error read; failed `fetchMeals` keeps the last plan; `saveRecipe` deletes the recipe row when the ingredients insert fails; import shows an error and keeps the preview.
Deferred (not data-losing, separate changes): wake lock during a plan; resumable plan from DB; timeout/abort on `generateRecipe` and SpecialsScanner; barcode re-scan; week-change reset of `planId` in `useMealPlan`; sw.js network-first timeout.

## Gate
- Red first: 12 of 15 new tests failed on b9df17b (`/tmp/fah-red.log`); cancel-before-persist and the two success-path cases are regression guards.
- Full suite on 7c73d7a: `Test Files 21 passed (21) / Tests 220 passed (220)`, vitest_exit=0. tsc_exit=0. eslint: 11 errors, identical file set to the main baseline (pre-existing react-hooks rules). vite build_exit=0.

## Mutation lines (mutate.sh, each RED then restored, tree clean after)
| id | file | flipped | failing test |
|---|---|---|---|
| A | ThisWeekPlan.tsx | `if (!gen \|\| cancelRef.current) return null` → `if (!gen) return null` | Cancel during a pending generation persists nothing |
| B | ThisWeekPlan.tsx | `const bad = violatesHardNo(...)` → `null` | hard-no candidate never persisted |
| C | ThisWeekPlan.tsx | `if (runningRef.current) return false` → `&& false` | double tap runs one fill |
| D | ThisWeekPlan.tsx | per-slot `catch { r = null }` → rethrow | failed generation does not wedge |
| E | ThisWeekPlan.tsx | unmount effect sets cancelRef `true` → `false` | unmounting mid-plan stops the loop |
| F | ThisWeekPlan.tsx | swap `finally { end() }` → `void 0` | failed swap clears the spinner |
| G | ThisWeekPlan.tsx | `previewOpen` → `previewOpen && meals.length > 1` | preview follows the plan |
| H | useMealPlan.ts | `onConflict: 'meal_plan_id,slot_order'` → `'meal_plan_id'` | slot written as one upsert |
| I | useMealPlan.ts | drop `if (error) return false` in setSlot | failed write reported |
| J | useMealPlan.ts | `if (error) return` in fetchMeals → `&& false` | failed fetch keeps the plan |
| K | useRecipes.ts | `if (ingredientError)` → `&& false` | saveRecipe fails closed |
| L | RecipeImport.tsx | `if (!(await onSave(preview)))` → `&& false` | no false "Saved ✓" |
| M | RecipeImport.tsx | catch message → constant | thrown host leaves form usable |
Logs: scratchpad `fah/mut/*.log` (each contains "RED as required").

## Auditor round 1 (bc8fbcc): FIX-FIRST — P1-1 archive fill ignored cancel/unmount and write results; P1-2 an open manual picker stayed live during a run. Auditor reproduced A, E, H, I, K red and confirmed 12/15 red on b9df17b; StrictMode 7/7.
Fix round (63286a5, 316bf1c): archive loop resets+checks the cancel ref and counts failed writes into the note; `begin()` closes the picker (single guard — the per-button busy checks masked mutation P and were removed); swap pre-request lines inside try (P2-4); clearSlot error pinned (P2-1).
P2-2 accepted as a tradeoff, stated plainly: a candidate is persisted after the hard-no/protein/cancel checks but BEFORE its slot write; a cancel landing during the save, or a failed slot write, leaves a real, reusable recipe in the library that is in no plan.

| id | file | flipped | failing test |
|---|---|---|---|
| N | ThisWeekPlan.tsx | archive `if (cancelRef.current) return` → `&& false` | unmounting during an archive fill stops the writes |
| O | ThisWeekPlan.tsx | `failed++` → `failed += 0` on a false setSlot | archive write that does not land is reported |
| P | ThisWeekPlan.tsx | `setPicking(null)` in begin() removed | open picker cannot write under the run |
| Q | useMealPlan.ts | clearSlot `if (error) return false` dropped | clearSlot reports a delete that did not land |
Full suite on 316bf1c: Test Files 21 passed (21) / Tests 224 passed (224); tsc_exit=0; build_exit=0.
