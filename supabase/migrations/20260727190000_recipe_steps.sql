-- Discrete cooking steps for Cook Mode. Parsed once from the free-text
-- `instructions` by scripts/backfillSteps.ts (and hand-corrected for the few that
-- don't split cleanly). NULL means "not backfilled yet" — the app falls back to
-- splitting `instructions` at render time.
alter table recipes add column if not exists steps jsonb;
