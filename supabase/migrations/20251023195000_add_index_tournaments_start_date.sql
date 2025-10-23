-- Improve calendar queries on month ranges
create index if not exists tournaments_start_date_idx on public.tournaments(start_date);
