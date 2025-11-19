-- Function to validate Roster constraints
-- Enforces:
-- 1. RD players must be drawn from MD or WD.
-- 2. RD players cannot be drawn from XD.
-- 3. (Optional) Max 6 players per entry is enforced by unique constraints and slot logic implicitly if we limit the number of slots.
--    But since we use slot_code (MD, WD, XD, RD), and each code likely handles 2 players.
--    Wait, the table `entry_roster_slots` has (entry_id, profile_id, slot_code).
--    Does each slot_code allow multiple players? Yes, Doubles = 2 players.
--    So we need to limit count per slot_code to 2.

create or replace function public.check_roster_constraints()
returns trigger as $$
declare
  md_count int;
  wd_count int;
  xd_count int;
  rd_count int;
  is_in_md boolean;
  is_in_wd boolean;
  is_in_xd boolean;
begin
  -- Enforce Max 2 players per slot code
  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE') then
    select count(*) into md_count from public.entry_roster_slots where entry_id = NEW.entry_id and slot_code = NEW.slot_code;
    if (md_count > 2) then
      raise exception 'Cannot have more than 2 players in % slot', NEW.slot_code;
    end if;
  end if;

  -- Specific checks for RD (Wildcard) assignments
  if (NEW.slot_code = 'RD') then
    -- Check if player is in MD
    select exists(
      select 1 from public.entry_roster_slots 
      where entry_id = NEW.entry_id 
      and slot_code = 'MD' 
      and profile_id = NEW.profile_id
    ) into is_in_md;

    -- Check if player is in WD
    select exists(
      select 1 from public.entry_roster_slots 
      where entry_id = NEW.entry_id 
      and slot_code = 'WD' 
      and profile_id = NEW.profile_id
    ) into is_in_wd;

    -- Check if player is in XD
    select exists(
      select 1 from public.entry_roster_slots 
      where entry_id = NEW.entry_id 
      and slot_code = 'XD' 
      and profile_id = NEW.profile_id
    ) into is_in_xd;

    -- Constraint: RD player must be in MD or WD
    if (not is_in_md and not is_in_wd) then
       raise exception 'Invalid Wildcard (RD) Assignment: Player must be from MD or WD pair.';
    end if;

    -- Constraint: RD player cannot be from XD
    if (is_in_xd) then
       raise exception 'Invalid Wildcard (RD) Assignment: Player cannot be from XD pair.';
    end if;
  end if;

  -- Constraint: If adding to XD, ensure player is not in RD
  if (NEW.slot_code = 'XD') then
    select exists(
      select 1 from public.entry_roster_slots 
      where entry_id = NEW.entry_id 
      and slot_code = 'RD' 
      and profile_id = NEW.profile_id
    ) into rd_count; -- reusing var
    if (rd_count) then
       raise exception 'Invalid Assignment: Player is already assigned to RD, cannot play XD.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger trg_check_roster_constraints
before insert or update on public.entry_roster_slots
for each row execute function public.check_roster_constraints();
