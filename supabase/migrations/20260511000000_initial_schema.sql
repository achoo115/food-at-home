-- Use gen_random_uuid() (built-in to Postgres 13+, no extension needed)

-- Inventory items
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null check (category in ('produce', 'protein', 'dairy', 'grain', 'condiment', 'beverage', 'snack', 'other')),
  location text not null check (location in ('fridge', 'freezer', 'pantry')),
  quantity numeric not null default 1,
  unit text not null default 'count' check (unit in ('count', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp')),
  added_at timestamptz not null default now(),
  expiry_date date,
  estimated_expiry boolean not null default true,
  status text not null default 'active' check (status in ('active', 'consumed', 'expired', 'wasted')),
  cost numeric
);

alter table inventory_items enable row level security;
create policy "Users manage own items" on inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recipes
create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  instructions text,
  prep_time integer,
  cook_time integer,
  source text not null default 'manual' check (source in ('api', 'ai_generated', 'manual')),
  external_id text,
  is_favorited boolean not null default false,
  times_cooked integer not null default 0
);

alter table recipes enable row level security;
create policy "Users manage own recipes" on recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recipe ingredients
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade not null,
  name text not null,
  quantity numeric,
  unit text,
  is_optional boolean not null default false
);

alter table recipe_ingredients enable row level security;
create policy "Users manage own recipe ingredients" on recipe_ingredients
  for all using (
    exists (select 1 from recipes where recipes.id = recipe_ingredients.recipe_id and recipes.user_id = auth.uid())
  )
  with check (
    exists (select 1 from recipes where recipes.id = recipe_ingredients.recipe_id and recipes.user_id = auth.uid())
  );

-- Cooking log
create table cooking_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete set null,
  cooked_at timestamptz not null default now(),
  estimated_cost_saved numeric not null default 18,
  rating integer check (rating >= 1 and rating <= 5),
  notes text
);

alter table cooking_log enable row level security;
create policy "Users manage own cooking log" on cooking_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Achievements
create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb,
  unique(user_id, type)
);

alter table achievements enable row level security;
create policy "Users manage own achievements" on achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grocery list
create table grocery_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  quantity numeric not null default 1,
  unit text,
  category text,
  added_at timestamptz not null default now(),
  is_checked boolean not null default false,
  checked_at timestamptz
);

alter table grocery_list enable row level security;
create policy "Users manage own grocery list" on grocery_list
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes for common queries
create index idx_inventory_user_status on inventory_items(user_id, status);
create index idx_inventory_expiry on inventory_items(user_id, expiry_date) where status = 'active';
create index idx_cooking_log_user on cooking_log(user_id, cooked_at);
create index idx_grocery_user on grocery_list(user_id, is_checked);
