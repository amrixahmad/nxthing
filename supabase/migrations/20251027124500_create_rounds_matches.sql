create table if not exists public.rounds (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  category_id bigint not null references public.tournament_categories(id) on delete cascade,
  round_number integer not null,
  name text,
  created_at timestamptz not null default now(),
  unique(category_id, round_number)
);

create table if not exists public.matches (
  id bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  category_id bigint not null references public.tournament_categories(id) on delete cascade,
  round_number integer not null,
  index_in_round integer not null,
  entry1_id bigint references public.entries(id) on delete set null,
  entry2_id bigint references public.entries(id) on delete set null,
  winner_entry_id bigint references public.entries(id) on delete set null,
  next_match_id bigint references public.matches(id) on delete set null,
  next_match_slot smallint check (next_match_slot in (1,2)),
  status text not null default 'pending',
  scheduled_at timestamptz,
  court text,
  score_json jsonb,
  created_at timestamptz not null default now(),
  unique(category_id, round_number, index_in_round)
);

alter table public.rounds enable row level security;
alter table public.matches enable row level security;

create index if not exists idx_matches_category_round on public.matches(category_id, round_number);
create index if not exists idx_matches_next_match on public.matches(next_match_id);
create index if not exists idx_matches_tournament on public.matches(tournament_id);

create policy matches_read_all on public.matches for select using (true);
create policy rounds_read_all on public.rounds for select using (true);
