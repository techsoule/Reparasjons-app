-- =====================================================================
-- Row Level Security (RLS) + rollehjelpere
-- =====================================================================
--
-- Prinsipper (fra spec — ÅPENHET er bevisst):
--  * Alle innloggede reparatører kan LESE alle rader i jobs, earnings,
--    technicians og assignment_log — de skal se hverandres tall.
--  * Kun admin kan endre priser, provisjon_prosent og opprette/deaktivere
--    reparatører.
--  * Reparatør kan endre status og notat på EGNE jobber.
--  * Omfordeling krever admin, eller godkjenning fra mottaker (RPC i steg 3).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rollehjelpere (security definer for å unngå RLS-rekursjon)
-- ---------------------------------------------------------------------
create or replace function current_tech_id()
returns uuid
language sql stable
as $$ select auth.uid(); $$;

create or replace function is_technician()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from technicians t
    where t.id = auth.uid() and t.aktiv = true
  );
$$;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from technicians t
    where t.id = auth.uid() and t.rolle = 'admin' and t.aktiv = true
  );
$$;

-- ---------------------------------------------------------------------
-- Skru på RLS
-- ---------------------------------------------------------------------
alter table technicians    enable row level security;
alter table availability   enable row level security;
alter table devices        enable row level security;
alter table repair_types   enable row level security;
alter table prices         enable row level security;
alter table jobs           enable row level security;
alter table assignment_log enable row level security;
alter table earnings       enable row level security;
alter table notifications  enable row level security;

-- ---------------------------------------------------------------------
-- TECHNICIANS
--  Alle reparatører kan lese alle. Kun admin kan skrive.
--  (Reparatør oppdaterer eget push_token via RPC set_push_token.)
-- ---------------------------------------------------------------------
drop policy if exists technicians_select on technicians;
create policy technicians_select on technicians
  for select using (is_technician());

drop policy if exists technicians_admin_all on technicians;
create policy technicians_admin_all on technicians
  for all using (is_admin()) with check (is_admin());

-- Reparatør kan lagre sitt eget push-token uten admin-rettigheter
create or replace function set_push_token(token text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update technicians set push_token = token where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- AVAILABILITY
--  Alle kan lese (brukes til å hoppe over utilgjengelige + "hvem står
--  for tur"). Hver reparatør styrer egne rader. Admin kan alt.
-- ---------------------------------------------------------------------
drop policy if exists availability_select on availability;
create policy availability_select on availability
  for select using (is_technician());

drop policy if exists availability_own_write on availability;
create policy availability_own_write on availability
  for all
  using (technician_id = auth.uid() or is_admin())
  with check (technician_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------
-- DEVICES / REPAIR_TYPES / PRICES
--  Alle kan lese. Kun admin kan endre.
-- ---------------------------------------------------------------------
drop policy if exists devices_select on devices;
create policy devices_select on devices for select using (is_technician());
drop policy if exists devices_admin on devices;
create policy devices_admin on devices for all using (is_admin()) with check (is_admin());

drop policy if exists repair_types_select on repair_types;
create policy repair_types_select on repair_types for select using (is_technician());
drop policy if exists repair_types_admin on repair_types;
create policy repair_types_admin on repair_types for all using (is_admin()) with check (is_admin());

drop policy if exists prices_select on prices;
create policy prices_select on prices for select using (is_technician());
drop policy if exists prices_admin on prices;
create policy prices_admin on prices for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- JOBS
--  Alle kan lese alle. Reparatør kan oppdatere EGNE jobber, men
--  kolonnene begrenses av vakt-triggeren under (kun status/notat/
--  bekreftet_tidspunkt). Admin kan alt. Innsetting skjer via edge
--  function (service role) eller admin.
-- ---------------------------------------------------------------------
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs
  for select using (is_technician());

drop policy if exists jobs_admin_all on jobs;
create policy jobs_admin_all on jobs
  for all using (is_admin()) with check (is_admin());

drop policy if exists jobs_own_update on jobs;
create policy jobs_own_update on jobs
  for update
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid());

-- Vakt-trigger: reparatør (ikke admin) kan KUN endre status, notat og
-- bekreftet_tidspunkt på egen jobb. Alt annet avvises.
create or replace function jobs_guard_kolonner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Admin, service_role (edge function) og godkjent omfordeling (RPC
  -- omfordel_jobb har allerede gjort tilgangssjekken) har fri tilgang
  if is_admin()
     or auth.uid() is null
     or current_setting('app.omfordeling', true) = '1'
  then
    return new;
  end if;

  if (new.kunde_navn      is distinct from old.kunde_navn)
  or (new.telefon         is distinct from old.telefon)
  or (new.epost           is distinct from old.epost)
  or (new.device_id       is distinct from old.device_id)
  or (new.repair_type_ids is distinct from old.repair_type_ids)
  or (new.delekost        is distinct from old.delekost)
  or (new.arbeidspris     is distinct from old.arbeidspris)
  or (new.estimert_tid_min is distinct from old.estimert_tid_min)
  or (new.technician_id   is distinct from old.technician_id)
  or (new.ordrenummer     is distinct from old.ordrenummer)
  then
    raise exception 'Reparatør kan kun endre status, notat og bekreftet tidspunkt på egne jobber';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_guard on jobs;
create trigger trg_jobs_guard
  before update on jobs
  for each row execute function jobs_guard_kolonner();

-- ---------------------------------------------------------------------
-- ASSIGNMENT_LOG
--  Alle kan lese (tillitsmekanismen). Skriving kun via RPC/edge
--  function (security definer / service role).
-- ---------------------------------------------------------------------
drop policy if exists assignlog_select on assignment_log;
create policy assignlog_select on assignment_log
  for select using (is_technician());

-- ---------------------------------------------------------------------
-- EARNINGS
--  Alle kan lese alles inntjening. Admin markerer utbetalt.
--  Innsetting/oppdatering av beløp skjer via edge function/RPC.
-- ---------------------------------------------------------------------
drop policy if exists earnings_select on earnings;
create policy earnings_select on earnings
  for select using (is_technician());

drop policy if exists earnings_admin on earnings;
create policy earnings_admin on earnings
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
--  Hver reparatør ser og oppdaterer (markerer lest) egne varsler.
--  Innsetting via edge function/RPC.
-- ---------------------------------------------------------------------
drop policy if exists notif_select on notifications;
create policy notif_select on notifications
  for select using (technician_id = auth.uid());

drop policy if exists notif_update on notifications;
create policy notif_update on notifications
  for update using (technician_id = auth.uid())
  with check (technician_id = auth.uid());
