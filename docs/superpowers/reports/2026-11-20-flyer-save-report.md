# Flyer save — gate report (2026-11-20)

## What changed
- `useSpecials.saveScanned` wrote nothing safely: it deleted this week's scanned deals, then inserted the new ones, and checked neither result. It now inserts first (`.select('created_at')`), then deletes this week's rows of the same source older than the new rows' timestamp, and throws a message for the scanner on every failure.
- The deals card saves through the page's own `useSpecials()` store (`SpecialsCard store=…`), so a scan reaches the planner without a reload. Before, the page and the card each held their own copy.
- The scanner keeps the deals it read when a save fails and offers "Try saving again".

## Measured on the real database
Service key, throwaway week `1999-01-04`, source `probe`, rows removed after: a 3-row insert returned one `created_at`; a later 2-row insert returned one later `created_at`; the delete with `lt('created_at', <that>)` answered 204 and left exactly the two new rows.

## Review
- SME panel ×3 (data integrity, React/async, mobile PWA), read-only on 90e6e45: no data-loss path. Taken from it: the id-list delete could outgrow a URL; the service worker can answer the old-rows lookup from cache; a failed save cost a full rescan; the planner never saw a new scan (pre-existing).
- Auditor round 1 (FIX-FIRST): two unpinned guards (refetch before the delete-failure throw; the card's wiring). Round 2 (FIX-FIRST): the page's shared store was unpinned; stale retry button; untested read-failure return; no refetch after a lost insert reply. All fixed. Round 3 was the final pass; no third audit was run on the last commit.

## Gate (final tree)
- vitest: `Test Files 29 passed (29)` / `Tests 289 passed (289)`, exit 0 (main: 27 / 275).
- `npm run build` (tsc -b + vite build) exit 0.
- eslint: the pre-existing `react-hooks/set-state-in-effect` error on the fetch effect in `useSpecials.ts`, as on main; nothing new in the touched files.

## Mutations (mutate.sh, each RED then restored, tree clean after)
- Hook: missing-timestamp throw; `lt` → `neq`; delete-error throw; week filter dropped; source filter dropped; empty-scan guard; signed-out throw; refetch before the delete-failure throw; refetch after a lost insert reply.
- Card and scanner: card swallowing the rejection; unsaved deals not kept; save error not shown; stale unsaved deals not cleared on a new scan; read-failure `return`.
- Page: `SpecialsCard` handed a second `useSpecials()`.
Two mutants stayed GREEN in my own run and showed redundant code (an `insertError ||` half; two `setUnsaved(null)` lines); the code was deleted, and one `setUnsaved(null)` came back with a test when the auditor showed the path that needs it.

## Not done
- Writes have no timeout: a stalled save sits on "Saving N deals…".
- `clearWeek` ignores a failed delete; `fetchSpecials` shows a failed load as an empty list.
- Two saves at once (two devices) can leave both sets until the next save.
- The stub table always prints six fractional digits; Postgres trims trailing zeros (the app passes the string back unchanged).
- Nothing checked on the phone.
