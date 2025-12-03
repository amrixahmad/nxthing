-- Add extended profile fields for richer user profiles
alter table public.profiles
  add column if not exists gender text,
  add column if not exists paddle_brand text,
  add column if not exists address text;
