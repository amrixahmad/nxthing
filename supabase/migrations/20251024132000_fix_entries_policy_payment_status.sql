-- Tighten entries update policy to prevent players from changing payment_status
-- Players can only keep payment_status as 'unpaid' through updates

drop policy if exists "Players can update own entries (safe)" on public.entries;
create policy "Players can update own entries (safe)" on public.entries
  for update using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and status in ('pending','withdrawn')
    and payment_status = 'unpaid'
  );
