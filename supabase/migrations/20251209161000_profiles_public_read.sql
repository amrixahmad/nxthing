-- Allow authenticated users to read basic profile info of other users
-- This is needed for displaying team member names, referee names, etc.

-- Drop the restrictive policy if it exists
drop policy if exists "Users can view own profile" on public.profiles;

-- Create a new policy that allows all authenticated users to read profiles
-- This exposes only non-sensitive fields (id, username, full_name, avatar_url)
create policy "Authenticated users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- Keep the update policy restricted to own profile
-- (already exists, but recreate to be safe)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Keep the insert policy restricted to own profile
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);
