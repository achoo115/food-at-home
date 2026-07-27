-- Phase 5 (Harvest incorporation): the user's local Whole Foods weekly specials.
-- Ingested by scanning the flyer (source='scan'); a future scraper writes the
-- same rows with source='scrape'. The planner favors items on sale this week.

create table if not exists specials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  item text not null,
  regular_price numeric,
  sale_price numeric,
  category text,
  zone text,
  week_range text not null,
  source text not null default 'scan', -- 'scan' | 'scrape'
  created_at timestamptz not null default now()
);

alter table specials enable row level security;
create policy "Users manage own specials" on specials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_specials_user_week on specials (user_id, week_range);
