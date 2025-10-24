-- Limit two categories per player per tournament on entry insert
-- Replaces the existing player insert policy with an additional count check

drop policy if exists "Players can insert own entries during registration" on public.entries;
create policy "Players can insert own entries during registration" on public.entries
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1
      from public.tournament_categories tc
      join public.tournaments t on t.id = tc.tournament_id
      where tc.id = category_id
        and t.status = 'registration_open'
        and now() between t.registration_start_date and t.registration_end_date
    )
    and (
      select count(*)
      from public.entries e2
      join public.tournament_categories tc2 on tc2.id = e2.category_id
      where e2.created_by = auth.uid()
        and tc2.tournament_id = (
          select tc3.tournament_id from public.tournament_categories tc3 where tc3.id = category_id
        )
        and e2.status in ('pending','accepted')
    ) < 2
  );
