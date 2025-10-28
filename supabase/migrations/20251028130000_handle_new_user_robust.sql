-- Make handle_new_user robust and idempotent for local dev
create extension if not exists "uuid-ossp";

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substring(replace(uuid_generate_v4()::text,'-',''),1,8)),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set username = coalesce(excluded.username, public.profiles.username),
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = timezone('utc'::text, now());
  return new;
exception
  when others then
    -- Do not block signup in dev. Log as NOTICE and continue.
    raise notice 'handle_new_user error: %', SQLERRM;
    return new;
end;
$$ language plpgsql security definer;
