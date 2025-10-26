-- Enforce minimum registration fee of $20.00 for tournament categories
ALTER TABLE public.tournament_categories
  ADD CONSTRAINT tournament_categories_min_fee
  CHECK (registration_fee >= 20);
