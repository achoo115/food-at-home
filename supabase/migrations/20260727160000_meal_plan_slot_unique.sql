-- Guard against duplicate slot rows from a double-tap/race: one recipe per
-- (plan, slot). setSlot already deletes-then-inserts, but this makes it safe.
delete from meal_plan_meals a using meal_plan_meals b
  where a.ctid < b.ctid and a.meal_plan_id = b.meal_plan_id and a.slot_order = b.slot_order;

create unique index if not exists uq_meal_plan_meals_slot
  on meal_plan_meals (meal_plan_id, slot_order);
