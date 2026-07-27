-- Phase 2 (Harvest incorporation): macros on recipes + a per-user preferences
-- profile. Additive only — existing rows/columns are untouched.

-- Fiber is first-class alongside the standard macros (Harvest's insight).
alter table recipes
  add column if not exists calories integer,
  add column if not exists protein_g integer,
  add column if not exists carbs_g integer,
  add column if not exists fat_g integer,
  add column if not exists fiber_g integer,
  add column if not exists last_cooked_at timestamptz,
  add column if not exists heart_count integer not null default 0,
  add column if not exists build jsonb; -- { pro:[], base:[], veg:[], engine:[] }

-- Single per-user household preferences row; source of truth the AI planner reads.
create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  dietary_restrictions text[] not null default '{}',
  hard_nos text[] not null default '{}',
  macro_targets jsonb not null default '{}'::jsonb, -- per-meal guides: { calories, protein_g, fiber_g }
  max_cook_minutes integer,
  min_protein_types_per_week integer not null default 3,
  cuisine_variety boolean not null default true,
  recency_weeks integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table preferences enable row level security;
create policy "Users manage own preferences" on preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
