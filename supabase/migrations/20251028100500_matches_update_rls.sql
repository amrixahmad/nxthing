-- Organizer-only update policy for matches
-- Allows the tournament organizer to update matches rows for their tournaments

drop policy if exists matches_update_organizer on public.matches;
create policy matches_update_organizer
  on public.matches
  for update
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = public.matches.tournament_id
        and t.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = public.matches.tournament_id
        and t.organizer_id = auth.uid()
    )
  );
