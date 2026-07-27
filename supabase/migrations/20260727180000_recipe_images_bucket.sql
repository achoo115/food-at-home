-- Public bucket to permanently store imported recipe photos (uploaded by the
-- save-image edge function via the service role; served via public object URLs).
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;
