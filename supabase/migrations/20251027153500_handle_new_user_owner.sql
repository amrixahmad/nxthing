-- Ensure the signup trigger function runs as supabase_admin
alter function public.handle_new_user() owner to supabase_admin;
