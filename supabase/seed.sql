-- Seed file for development
-- This file contains sample data and setup instructions
 -- NOTE: To recreate this project from scratch:
-- 1. Run: supabase init
-- 2. Run: supabase start
-- 3. Apply migrations: supabase db reset (this will apply all migrations)
-- 4. The database will be ready with:
--    - All auth tables and functions (automatically created by Supabase)
--    - profiles table with RLS policies
--    - Automatic profile creation on user signup
--    - Edge Functions support
 -- Sample data (optional - uncomment if you want test users)
/*
-- Create a test user profile (you would normally do this through the app)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"full_name": "Test User"}',
  false,
  'authenticated'
);

-- The profile will be automatically created by the trigger
*/