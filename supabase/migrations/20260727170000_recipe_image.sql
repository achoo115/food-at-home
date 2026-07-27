-- Capture the recipe photo on import (schema.org Recipe.image).
alter table recipes add column if not exists image_url text;
