-- Add display_name to entry_members for public-safe name rendering
alter table public.entry_members
  add column if not exists display_name text;

-- Backfill from profiles (server-side migration runs with elevated privileges)
update public.entry_members em
set display_name = coalesce(p.full_name, p.username)
from public.profiles p
where em.profile_id = p.id and (em.display_name is null or em.display_name = '');

-- If still null, fallback to email local-part (may be null for some users)
update public.entry_members em
set display_name = coalesce(em.display_name, split_part(u.email, '@', 1))
from auth.users u
where em.profile_id = u.id and (em.display_name is null or em.display_name = '');

-- Final fallback
update public.entry_members em
set display_name = coalesce(em.display_name, 'Player ' || left(em.profile_id::text, 8))
where em.display_name is null or em.display_name = '';
