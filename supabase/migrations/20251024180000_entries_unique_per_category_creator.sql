-- Enforce one entry per category per player
create unique index if not exists entries_unique_per_category_creator
  on public.entries(category_id, created_by);
