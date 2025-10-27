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
  );
  return new;
end;
$$ language plpgsql security definer;

update public.profiles
set username = coalesce(username, 'user_' || substring(replace(uuid_generate_v4()::text,'-',''),1,8))
where username is null or username = '';
