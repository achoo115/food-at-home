-- Opened state for sealed goods: opening a can/jar/bottle resets its clock.
alter table inventory_items add column if not exists opened_at date;
alter table inventory_items add column if not exists container text
  check (container is null or container in ('can','jar','bottle','carton','box','bag','fresh','frozen','other'));
