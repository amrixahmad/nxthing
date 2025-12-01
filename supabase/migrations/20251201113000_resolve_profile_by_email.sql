-- Helper function to resolve a profile id from an auth.users email
-- Used by the Referees screen to add referees by email without exposing
-- the auth schema directly to the client.

create or replace function public.resolve_profile_by_email(p_email text)
returns table (
  profile_id uuid,
  display_name text,
  email text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    coalesce(p.full_name, p.username, u.email) as display_name,
    u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

grant execute on function public.resolve_profile_by_email(text) to anon, authenticated;
