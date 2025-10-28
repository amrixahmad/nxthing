-- Add organizer_display_name for public-safe host name rendering
alter table public.tournaments add column if not exists organizer_display_name text;

-- Backfill from profiles (full_name -> username -> short uuid)
update public.tournaments t
set organizer_display_name = coalesce(p.full_name, p.username, left(t.organizer_id::text, 8))
from public.profiles p
where (t.organizer_display_name is null or t.organizer_display_name = '')
  and t.organizer_id = p.id;
