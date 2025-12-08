-- Fix currency default from USD to MYR and reduce minimum fee to RM1 for beta

-- 1. Change default currency from 'usd' to 'myr' for entries table
ALTER TABLE public.entries ALTER COLUMN payment_currency SET DEFAULT 'myr';

-- 2. Change default currency from 'usd' to 'myr' for entry_members table
ALTER TABLE public.entry_members ALTER COLUMN payment_currency SET DEFAULT 'myr';

-- 3. Update existing entries with 'usd' currency to 'myr'
UPDATE public.entries SET payment_currency = 'myr' WHERE payment_currency = 'usd' OR payment_currency IS NULL;

-- 4. Update existing entry_members with 'usd' currency to 'myr'
UPDATE public.entry_members SET payment_currency = 'myr' WHERE payment_currency = 'usd' OR payment_currency IS NULL;

-- 5. Drop the old minimum fee constraint (RM20)
ALTER TABLE public.tournament_categories DROP CONSTRAINT IF EXISTS tournament_categories_min_fee;

-- 6. Add new minimum fee constraint (RM1 for beta)
ALTER TABLE public.tournament_categories
  ADD CONSTRAINT tournament_categories_min_fee
  CHECK (registration_fee >= 1);
