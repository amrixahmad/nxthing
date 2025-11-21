-- Enforce session sequencing per fixture: Session 2 (XD/RD) cannot start before Session 1 (MD/WD)

create or replace function public.check_fixture_session_order()
returns trigger as $$
declare
  latest_session1 timestamptz;
begin
  -- Only apply when key fields are present
  if TG_OP in ('INSERT','UPDATE') then
    if NEW.fixture_id is null or NEW.session_sequence is null or NEW.scheduled_at is null then
      return NEW;
    end if;

    -- Only guard Session 2; singles/doubles have session_sequence null and skip this
    if NEW.session_sequence = 2 then
      select max(scheduled_at)
      into latest_session1
      from public.matches
      where fixture_id = NEW.fixture_id
        and session_sequence = 1
        and scheduled_at is not null;

      -- If there is any Session 1 match scheduled, Session 2 must not start before it
      if latest_session1 is not null and NEW.scheduled_at < latest_session1 then
        raise exception 'Session 2 match cannot start before Session 1 matches for this fixture.';
      end if;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger trg_check_fixture_session_order
before insert or update of scheduled_at, session_sequence, fixture_id
on public.matches
for each row execute function public.check_fixture_session_order();
