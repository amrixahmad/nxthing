-- Allow system/auth roles to insert into profiles during signup trigger
-- Keep the existing user self-insert policy as-is

drop policy if exists "Auth admin can insert profiles" on public.profiles;
create policy "Auth admin can insert profiles"
  on public.profiles
  for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists "Service role can insert profiles" on public.profiles;
create policy "Service role can insert profiles"
  on public.profiles
  for insert
  to service_role
  with check (true);

drop policy if exists "Supabase admin can insert profiles" on public.profiles;
create policy "Supabase admin can insert profiles"
  on public.profiles
  for insert
  to supabase_admin
  with check (true);
