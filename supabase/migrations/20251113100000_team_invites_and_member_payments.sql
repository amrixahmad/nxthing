alter table public.entries add column if not exists invite_code text;
create unique index if not exists entries_invite_code_unique on public.entries(invite_code) where invite_code is not null;

alter table public.entry_members add column if not exists payment_status payment_status default 'unpaid';
alter table public.entry_members add column if not exists payment_reference text;
alter table public.entry_members add column if not exists payment_amount numeric(10,2);
alter table public.entry_members add column if not exists payment_currency text default 'usd';
alter table public.entry_members add column if not exists paid_at timestamptz;

create index if not exists entry_members_entry_idx on public.entry_members(entry_id);
