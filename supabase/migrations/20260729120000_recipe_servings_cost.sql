alter table recipes add column if not exists servings int;
alter table recipes add column if not exists cost_per_serving numeric(6,2);
alter table recipes add column if not exists cost_estimated_at timestamptz;
