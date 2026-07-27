-- Phase 4 (Harvest incorporation): a flat weekly meal plan (no day grid). A week
-- is an ordered list of slots (default 1 breakfast, 1 lunch, 2 dinners); any saved
-- recipe can fill any slot. Additive only.

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_range text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (user_id, week_range)
);

alter table meal_plans enable row level security;
create policy "Users manage own meal plans" on meal_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid references meal_plans(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  meal_type text not null, -- 'breakfast' | 'lunch' | 'dinner'
  slot_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table meal_plan_meals enable row level security;
create policy "Users manage own meal plan meals" on meal_plan_meals
  for all using (
    exists (select 1 from meal_plans where meal_plans.id = meal_plan_meals.meal_plan_id and meal_plans.user_id = auth.uid())
  )
  with check (
    exists (select 1 from meal_plans where meal_plans.id = meal_plan_meals.meal_plan_id and meal_plans.user_id = auth.uid())
  );

create index if not exists idx_meal_plan_meals_plan on meal_plan_meals (meal_plan_id, slot_order);
