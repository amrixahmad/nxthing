-- Allow free tournaments (registration_fee = 0)
-- Drop the old minimum fee constraint (RM1)
ALTER TABLE public.tournament_categories DROP CONSTRAINT IF EXISTS tournament_categories_min_fee;

-- Add new constraint: fee must be 0 (free) or >= 1 (paid)
ALTER TABLE public.tournament_categories
  ADD CONSTRAINT tournament_categories_min_fee
  CHECK (registration_fee = 0 OR registration_fee >= 1);
