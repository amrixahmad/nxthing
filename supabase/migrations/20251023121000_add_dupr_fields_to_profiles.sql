-- Add DUPR fields to profiles
alter table public.profiles
  add column if not exists dupr_id text,
  add column if not exists dupr_rating numeric(3,2);
