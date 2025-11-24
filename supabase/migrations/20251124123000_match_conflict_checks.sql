-- Enforce per-team and per-player scheduling conflicts
-- A team or any of its players cannot be in two different matches at the same scheduled time.
-- Sub-matches that belong to the same fixture are exempt (they are intentionally concurrent).

create or replace function public.check_match_conflicts()
returns trigger as $$
declare
  same_ts constant timestamptz := NEW.scheduled_at;
  conflict_match_id bigint;
begin
  -- Only apply on insert/update when scheduled_at is set
  if TG_OP not in ('INSERT','UPDATE') then
    return NEW;
  end if;

  if NEW.scheduled_at is null then
    return NEW;
  end if;

  -- If this is an UPDATE and schedule/participants/fixture didn't change, skip re-check
  if TG_OP = 'UPDATE' then
    if coalesce(NEW.scheduled_at, timestamp 'epoch') = coalesce(OLD.scheduled_at, timestamp 'epoch')
       and NEW.entry1_id is not distinct from OLD.entry1_id
       and NEW.entry2_id is not distinct from OLD.entry2_id
       and NEW.fixture_id is not distinct from OLD.fixture_id then
      return NEW;
    end if;
  end if;

  -- TEAM-LEVEL CONFLICT ------------------------------------------------------
  -- Any other match at the same time in this tournament that involves the same
  -- entry (team) on either side, excluding sub-matches of the same fixture.

  if NEW.entry1_id is not null or NEW.entry2_id is not null then
    select m.id
    into conflict_match_id
    from public.matches m
    where m.id <> coalesce(NEW.id, 0)
      and m.tournament_id = NEW.tournament_id
      and m.scheduled_at = same_ts
      and not (NEW.fixture_id is not null and m.fixture_id = NEW.fixture_id)
      and (
        (NEW.entry1_id is not null and (m.entry1_id = NEW.entry1_id or m.entry2_id = NEW.entry1_id))
        or
        (NEW.entry2_id is not null and (m.entry1_id = NEW.entry2_id or m.entry2_id = NEW.entry2_id))
      )
    limit 1;

    if conflict_match_id is not null then
      raise exception 'Scheduling conflict: this team is already in another match at the same time.';
    end if;
  end if;

  -- PLAYER-LEVEL CONFLICT ----------------------------------------------------
  -- Any player associated with NEW.entry1_id/NEW.entry2_id (from either
  -- entry_members or entry_roster_slots) also appears in another match at the
  -- same time in this tournament, excluding sub-matches of the same fixture.

  if NEW.entry1_id is not null or NEW.entry2_id is not null then
    if exists (
      with new_entries as (
        select unnest(array[NEW.entry1_id, NEW.entry2_id]) as entry_id
      ),
      new_players as (
        select em.profile_id
        from public.entry_members em
        where em.entry_id in (select entry_id from new_entries where entry_id is not null)
        union
        select rs.profile_id
        from public.entry_roster_slots rs
        where rs.entry_id in (select entry_id from new_entries where entry_id is not null)
      ),
      other_matches as (
        select m.id, unnest(array[m.entry1_id, m.entry2_id]) as entry_id
        from public.matches m
        where m.id <> coalesce(NEW.id, 0)
          and m.tournament_id = NEW.tournament_id
          and m.scheduled_at = same_ts
          and not (NEW.fixture_id is not null and m.fixture_id = NEW.fixture_id)
      ),
      other_entries as (
        select distinct entry_id from other_matches where entry_id is not null
      ),
      other_players as (
        select em.profile_id
        from public.entry_members em
        where em.entry_id in (select entry_id from other_entries)
        union
        select rs.profile_id
        from public.entry_roster_slots rs
        where rs.entry_id in (select entry_id from other_entries)
      )
      select 1
      from new_players np
      join other_players op on op.profile_id = np.profile_id
      limit 1
    ) then
      raise exception 'Scheduling conflict: one or more players are already in another match at the same time.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger trg_check_match_conflicts
before insert or update of scheduled_at, entry1_id, entry2_id, fixture_id
on public.matches
for each row execute function public.check_match_conflicts();
