-- Add stage column to fixtures to distinguish group and knockout phases
alter table public.fixtures
  add column if not exists stage text not null default 'group' check (stage in ('group','knockout'));

create index if not exists idx_fixtures_category_stage_round on public.fixtures(category_id, stage, round_number);
