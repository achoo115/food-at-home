-- NYT recipe import: allow an 'imported' recipe source and track provenance so a
-- re-import of the same URL updates rather than duplicates. Additive.

alter table recipes drop constraint if exists recipes_source_check;
alter table recipes add constraint recipes_source_check
  check (source in ('api', 'ai_generated', 'manual', 'imported'));

alter table recipes add column if not exists source_url text;
