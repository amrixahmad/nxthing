-- Improve handle_new_user to derive usernames from provider/email data
create extension if not exists "uuid-ossp";

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_email_prefix text;
  v_username text;
begin
  if new.email is not null then
    v_email_prefix := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'));
  end if;

  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'nickname',
    v_email_prefix,
    'user_' || substring(replace(uuid_generate_v4()::text,'-',''),1,8)
  );

  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
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
