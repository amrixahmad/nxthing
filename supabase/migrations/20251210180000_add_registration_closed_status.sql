-- Add 'registration_closed' to tournament_status enum
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'registration_closed' AFTER 'registration_open';
