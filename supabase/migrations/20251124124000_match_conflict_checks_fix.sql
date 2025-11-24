-- Refine match conflict checks to support team fixtures
-- This version derives team entries from fixtures for both the NEW match and
-- any potentially conflicting matches, so conflicts are enforced even when
-- entry1_id/entry2_id are null on sub-matches.

create or replace function public.check_match_conflicts()
returns trigger as $$
declare
  same_ts constant timestamptz := NEW.scheduled_at;
  conflict_match_id bigint;
  new_e1 bigint;
  new_e2 bigint;
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

  -- Resolve the effective entries for NEW match, falling back to its fixture
  new_e1 := NEW.entry1_id;
  new_e2 := NEW.entry2_id;
  if NEW.fixture_id is not null then
    select
      coalesce(new_e1, f.entry1_id),
      coalesce(new_e2, f.entry2_id)
    into new_e1, new_e2
    from public.fixtures f
    where f.id = NEW.fixture_id;
  end if;

  -- TEAM-LEVEL CONFLICT ------------------------------------------------------
  -- Any other match at the same time in this tournament that involves the same
  -- team entry (from either matches.entry* or fixtures.entry*), excluding
  -- sub-matches of the same fixture.

  if new_e1 is not null or new_e2 is not null then
    select m.id
    into conflict_match_id
    from public.matches m
    left join public.fixtures f on f.id = m.fixture_id
    where m.id <> coalesce(NEW.id, 0)
      and m.tournament_id = NEW.tournament_id
      and m.scheduled_at = same_ts
      and not (NEW.fixture_id is not null and m.fixture_id = NEW.fixture_id)
      and (
        (new_e1 is not null and (
          coalesce(m.entry1_id, f.entry1_id) = new_e1 or
          coalesce(m.entry2_id, f.entry2_id) = new_e1
        ))
        or
        (new_e2 is not null and (
          coalesce(m.entry1_id, f.entry1_id) = new_e2 or
          coalesce(m.entry2_id, f.entry2_id) = new_e2
        ))
      )
    limit 1;

    if conflict_match_id is not null then
      raise exception 'Scheduling conflict: this team is already in another match at the same time.';
    end if;
  end if;

  -- PLAYER-LEVEL CONFLICT ----------------------------------------------------
  -- Any player associated with new_e1/new_e2 also appears in another match at
  -- the same time in this tournament, again resolving entries via fixtures.

  if new_e1 is not null or new_e2 is not null then
    if exists (
      with new_entries as (
        select new_e1 as entry_id
        union all
        select new_e2 as entry_id
      ),
      new_entries_clean as (
        select distinct entry_id from new_entries where entry_id is not null
      ),
      new_players as (
        select em.profile_id
        from public.entry_members em
        where em.entry_id in (select entry_id from new_entries_clean)
        union
        select rs.profile_id
        from public.entry_roster_slots rs
        where rs.entry_id in (select entry_id from new_entries_clean)
      ),
      other_matches as (
        select
          m.id,
          coalesce(m.entry1_id, f.entry1_id) as e1,
          coalesce(m.entry2_id, f.entry2_id) as e2
        from public.matches m
        left join public.fixtures f on f.id = m.fixture_id
        where m.id <> coalesce(NEW.id, 0)
          and m.tournament_id = NEW.tournament_id
          and m.scheduled_at = same_ts
          and not (NEW.fixture_id is not null and m.fixture_id = NEW.fixture_id)
      ),
      other_entries as (
        select distinct entry_id
        from (
          select e1 as entry_id from other_matches
          union all
          select e2 as entry_id from other_matches
        ) s
        where entry_id is not null
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
