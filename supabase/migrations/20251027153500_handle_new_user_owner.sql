-- Ensure the signup trigger function runs as supabase_admin (best-effort)
-- In local dev, we may not have permission to set owner; don't fail the migration.
do $$
begin
  begin
    alter function public.handle_new_user() owner to supabase_admin;
  exception
    when insufficient_privilege then
      raise notice 'Skipping owner change: insufficient privilege';
    when undefined_function then
      raise notice 'Skipping owner change: function not found';
    when others then
      raise notice 'Skipping owner change due to: %', SQLERRM;
  end;
end $$;
