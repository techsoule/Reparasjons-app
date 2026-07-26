-- ============================================================
-- Fixiphone — komplett databaseoppsett for Supabase
-- Lim inn ALT dette i Supabase → SQL Editor → New query → Run
-- Kjør én gang. Trygt å kjøre på nytt (idempotent).
-- ============================================================

-- ==================== 0001_schema ====================
-- =====================================================================
-- Fixiphone reparasjons-app — databaseskjema
-- Steg 1 av byggerekkefølgen: tabeller, enums, sekvenser, triggere
-- =====================================================================

-- Nødvendige extensions
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------

-- Roller for innloggede brukere
do $$ begin
  create type user_rolle as enum ('reparatør', 'admin');
exception when duplicate_object then null; end $$;

-- Statusflyt for en jobb:
-- Mottatt → Bekreftet → Under arbeid → Venter på deler → Ferdig → Hentet
do $$ begin
  create type job_status as enum (
    'mottatt',
    'bekreftet',
    'under_arbeid',
    'venter_pa_deler',
    'ferdig',
    'hentet'
  );
exception when duplicate_object then null; end $$;

-- Type utilgjengelighet
do $$ begin
  create type availability_type as enum ('fri', 'ferie', 'sykdom');
exception when duplicate_object then null; end $$;

-- Type varsel
do $$ begin
  create type notification_type as enum (
    'ny_jobb',
    'jobb_omfordelt',
    'status_endret',
    'omfordeling_foresporsel'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- TECHNICIANS (reparatører + admin)
--  id kobles 1:1 mot auth.users(id)
-- ---------------------------------------------------------------------
create table if not exists technicians (
  id                uuid primary key references auth.users(id) on delete cascade,
  navn              text        not null,
  epost             text        not null unique,
  provisjon_prosent numeric(5,2) not null default 40.00
                        check (provisjon_prosent >= 0 and provisjon_prosent <= 100),
  rolle             user_rolle  not null default 'reparatør',
  -- En reparatør kan I TILLEGG ha admin-rettigheter (styre priser/brukere)
  -- uten å miste sin plass i jobbfordelingen.
  er_admin          boolean     not null default false,
  aktiv             boolean     not null default true,
  push_token        text,                       -- Expo push token
  opprettet         timestamptz not null default now()
);

comment on table technicians is 'Reparatører og admin. id = auth.users.id';

-- ---------------------------------------------------------------------
-- AVAILABILITY (fri / ferie / sykdom)
-- ---------------------------------------------------------------------
create table if not exists availability (
  id            uuid primary key default gen_random_uuid(),
  technician_id uuid not null references technicians(id) on delete cascade,
  dato_fra      date not null,
  dato_til      date not null,
  type          availability_type not null,
  notat         text,
  opprettet     timestamptz not null default now(),
  check (dato_til >= dato_fra)
);

create index if not exists idx_availability_tech  on availability(technician_id);
create index if not exists idx_availability_dato  on availability(dato_fra, dato_til);

-- ---------------------------------------------------------------------
-- DEVICES (iPhone-modeller)
-- ---------------------------------------------------------------------
create table if not exists devices (
  id         uuid primary key default gen_random_uuid(),
  modellnavn text not null unique,
  sortering  int  not null default 0
);

create index if not exists idx_devices_sortering on devices(sortering);

-- ---------------------------------------------------------------------
-- REPAIR_TYPES (feiltyper)
-- ---------------------------------------------------------------------
create table if not exists repair_types (
  id   uuid primary key default gen_random_uuid(),
  navn text not null unique
);

-- ---------------------------------------------------------------------
-- PRICES (per modell + feiltype)
-- ---------------------------------------------------------------------
create table if not exists prices (
  device_id        uuid not null references devices(id)      on delete cascade,
  repair_type_id   uuid not null references repair_types(id) on delete cascade,
  delekost         numeric(10,2) not null default 0 check (delekost >= 0),
  arbeidspris      numeric(10,2) not null default 0 check (arbeidspris >= 0),
  estimert_tid_min int           not null default 30 check (estimert_tid_min >= 0),
  primary key (device_id, repair_type_id)
);

-- ---------------------------------------------------------------------
-- ORDRENUMMER — sekvens + generator (FIX-<år>-<løpenr>)
-- ---------------------------------------------------------------------
create sequence if not exists ordrenummer_seq start with 1;

create or replace function generer_ordrenummer()
returns text
language plpgsql
as $$
declare
  nr bigint;
begin
  nr := nextval('ordrenummer_seq');
  return 'FIX-' || to_char(now(), 'YYYY') || '-' || lpad(nr::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- JOBS
-- ---------------------------------------------------------------------
create table if not exists jobs (
  id                  uuid primary key default gen_random_uuid(),
  ordrenummer         text not null unique default generer_ordrenummer(),
  kunde_navn          text not null,
  telefon             text not null,
  epost               text not null,
  device_id           uuid references devices(id),
  repair_type_ids     uuid[] not null default '{}',
  onsket_tidspunkt    timestamptz,
  bekreftet_tidspunkt timestamptz,
  delekost            numeric(10,2) not null default 0,
  arbeidspris         numeric(10,2) not null default 0,
  totalpris           numeric(10,2) not null default 0,
  estimert_tid_min    int           not null default 0,
  technician_id       uuid references technicians(id),
  status              job_status not null default 'mottatt',
  notat               text,
  kommentar           text,                      -- fritekst fra kunde ved booking
  opprettet           timestamptz not null default now(),
  fullfort            timestamptz
);

create index if not exists idx_jobs_technician on jobs(technician_id);
create index if not exists idx_jobs_status     on jobs(status);
create index if not exists idx_jobs_opprettet  on jobs(opprettet);
create index if not exists idx_jobs_onsket     on jobs(onsket_tidspunkt);

-- ---------------------------------------------------------------------
-- ASSIGNMENT_LOG — full sporbarhet på hver tildeling
-- score_snapshot lagrer scoren for ALLE reparatører på tidspunktet
-- ---------------------------------------------------------------------
create table if not exists assignment_log (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs(id) on delete cascade,
  technician_id  uuid references technicians(id),  -- hvem jobben gikk til
  begrunnelse    text not null,
  score_snapshot jsonb not null default '[]',      -- [{technician_id, navn, score, kroner, minutter, ...}]
  er_omfordeling boolean not null default false,
  utfort_av      uuid references technicians(id),  -- hvem som utløste (system=null / admin / reparatør)
  tidspunkt      timestamptz not null default now()
);

create index if not exists idx_assignlog_job  on assignment_log(job_id);
create index if not exists idx_assignlog_tech on assignment_log(technician_id);
create index if not exists idx_assignlog_tid  on assignment_log(tidspunkt);

-- ---------------------------------------------------------------------
-- EARNINGS — provisjon per jobb
-- ---------------------------------------------------------------------
create table if not exists earnings (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references jobs(id) on delete cascade,
  technician_id uuid not null references technicians(id),
  belop         numeric(10,2) not null default 0,
  utbetalt      boolean not null default false,
  periode       text,                             -- f.eks. '2026-07'
  opprettet     timestamptz not null default now(),
  unique (job_id, technician_id)
);

create index if not exists idx_earnings_tech    on earnings(technician_id);
create index if not exists idx_earnings_periode on earnings(periode);
create index if not exists idx_earnings_utbetalt on earnings(utbetalt);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — in-app varsler
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  technician_id uuid not null references technicians(id) on delete cascade,
  type          notification_type not null,
  tittel        text not null,
  melding       text not null,
  job_id        uuid references jobs(id) on delete cascade,
  lest          boolean not null default false,
  opprettet     timestamptz not null default now()
);

create index if not exists idx_notif_tech on notifications(technician_id, lest);

-- ---------------------------------------------------------------------
-- RATE LIMIT — for booking-intake spam-beskyttelse (per IP)
-- ---------------------------------------------------------------------
create table if not exists booking_rate_limit (
  ip        text not null,
  tidspunkt timestamptz not null default now()
);

create index if not exists idx_rate_ip_tid on booking_rate_limit(ip, tidspunkt);

-- ---------------------------------------------------------------------
-- TRIGGERE
-- ---------------------------------------------------------------------

-- Hold totalpris i synk (delekost + arbeidspris)
create or replace function jobs_beregn_totalpris()
returns trigger
language plpgsql
as $$
begin
  new.totalpris := coalesce(new.delekost, 0) + coalesce(new.arbeidspris, 0);
  -- sett fullfort-tidsstempel når status går til 'hentet'
  if new.status = 'hentet' and old.status is distinct from 'hentet' then
    new.fullfort := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_totalpris on jobs;
create trigger trg_jobs_totalpris
  before insert or update on jobs
  for each row execute function jobs_beregn_totalpris();

-- ==================== 0002_rls ====================
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
    where t.id = auth.uid()
      and t.aktiv = true
      and (t.rolle = 'admin' or t.er_admin = true)
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

-- ==================== 0003_functions ====================
-- =====================================================================
-- Fordelings- og omfordelings-funksjoner
--  * hent_fordelingsdata(jobbdato) — mater fordelingsalgoritmen
--  * omfordel_jobb(...)            — manuell omfordeling med godkjenning
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rullerende 30-dagers tall + tilgjengelighet + sist tildelt, per
-- aktiv reparatør. Edge function kaller denne og kjører algoritmen.
--
--  total_kroner   = sum(earnings.belop) siste 30 dager  (reell inntjening)
--  total_minutter = sum(jobs.estimert_tid_min) siste 30 dager (belastning)
--  sist_tildelt   = siste tidspunkt i assignment_log
--  utilgjengelig  = finnes availability-rad som dekker jobbdato
-- ---------------------------------------------------------------------
create or replace function hent_fordelingsdata(jobbdato date default current_date)
returns table (
  id             uuid,
  navn           text,
  aktiv          boolean,
  total_kroner   numeric,
  total_minutter numeric,
  sist_tildelt   timestamptz,
  utilgjengelig  boolean
)
language sql stable security definer set search_path = public
as $$
  select
    t.id,
    t.navn,
    t.aktiv,
    coalesce((
      select sum(e.belop)
      from earnings e
      join jobs j on j.id = e.job_id
      where e.technician_id = t.id
        and j.opprettet >= now() - interval '30 days'
    ), 0) as total_kroner,
    coalesce((
      select sum(j.estimert_tid_min)
      from jobs j
      where j.technician_id = t.id
        and j.opprettet >= now() - interval '30 days'
    ), 0) as total_minutter,
    (
      select max(al.tidspunkt)
      from assignment_log al
      where al.technician_id = t.id
    ) as sist_tildelt,
    exists (
      select 1 from availability a
      where a.technician_id = t.id
        and jobbdato between a.dato_fra and a.dato_til
    ) as utilgjengelig
  from technicians t
  where t.aktiv = true
    and t.rolle = 'reparatør';   -- fordeling gjelder reparatørene, ikke admin
$$;

-- ---------------------------------------------------------------------
-- Manuell omfordeling.
--  Krav: admin, ELLER at den innloggede er mottakeren (godkjenner selv
--  at jobben overføres til dem).
--  Oppdaterer technician_id, flytter earnings-raden, og logger ALLTID
--  til assignment_log med begrunnelse + snapshot av dagens tall.
-- ---------------------------------------------------------------------
create or replace function omfordel_jobb(
  p_job_id        uuid,
  p_ny_technician uuid,
  p_begrunnelse   text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_job        jobs%rowtype;
  v_ny_navn    text;
  v_ny_prov    numeric;
  v_belop      numeric;
  v_snapshot   jsonb;
  v_begrunnelse text;
begin
  -- Tilgangskontroll
  if not (is_admin() or auth.uid() = p_ny_technician) then
    raise exception 'Omfordeling krever admin, eller godkjenning fra mottaker';
  end if;

  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'Fant ikke jobb %', p_job_id;
  end if;

  select navn, provisjon_prosent into v_ny_navn, v_ny_prov
  from technicians where id = p_ny_technician and aktiv = true;
  if not found then
    raise exception 'Mottaker er ikke en aktiv reparatør';
  end if;

  -- Signaliser til vakt-triggeren at dette er en godkjent omfordeling
  perform set_config('app.omfordeling', '1', true);

  -- Oppdater jobben
  update jobs set technician_id = p_ny_technician where id = p_job_id;

  -- Flytt/oppdater earnings (provisjon = arbeidspris * prosent, delekost utenfor)
  v_belop := round(coalesce(v_job.arbeidspris, 0) * v_ny_prov / 100.0, 2);
  delete from earnings where job_id = p_job_id;
  insert into earnings (job_id, technician_id, belop, periode)
  values (
    p_job_id, p_ny_technician, v_belop,
    to_char(coalesce(v_job.opprettet, now()), 'YYYY-MM')
  );

  -- Snapshot av dagens tall for alle aktive (sporbarhet)
  select coalesce(jsonb_agg(jsonb_build_object(
           'technician_id', d.id,
           'navn',          d.navn,
           'total_kroner',  d.total_kroner,
           'total_minutter',d.total_minutter,
           'utilgjengelig', d.utilgjengelig
         )), '[]'::jsonb)
  into v_snapshot
  from hent_fordelingsdata(coalesce(v_job.onsket_tidspunkt::date, current_date)) d;

  v_begrunnelse := coalesce(
    nullif(p_begrunnelse, ''),
    'Manuell omfordeling til ' || v_ny_navn
  );

  insert into assignment_log
    (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values
    (p_job_id, p_ny_technician, v_begrunnelse, v_snapshot, true, auth.uid());

  -- Varsel til ny reparatør
  insert into notifications (technician_id, type, tittel, melding, job_id)
  values (
    p_ny_technician, 'jobb_omfordelt', 'Jobb omfordelt til deg',
    'Ordre ' || v_job.ordrenummer || ' (' || v_job.kunde_navn || ') er nå din.',
    p_job_id
  );
end;
$$;

-- ==================== 0004_notifications ====================
-- =====================================================================
-- Varseltriggere + «be om omfordeling»-RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- Varsle tildelt reparatør når status endres av NOEN ANDRE (f.eks. admin)
-- ---------------------------------------------------------------------
create or replace function jobs_varsle_statusendring()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.technician_id is not null
     and (auth.uid() is null or auth.uid() <> new.technician_id)
  then
    insert into notifications (technician_id, type, tittel, melding, job_id)
    values (
      new.technician_id, 'status_endret', 'Status endret',
      'Ordre ' || new.ordrenummer || ' er nå «' || new.status || '».',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_status_varsel on jobs;
create trigger trg_jobs_status_varsel
  after update on jobs
  for each row execute function jobs_varsle_statusendring();

-- ---------------------------------------------------------------------
-- Reparatør ber om at EGEN jobb blir omfordelt (varsler alle admin).
-- Selve omfordelingen gjøres av admin (eller mottaker via omfordel_jobb).
-- ---------------------------------------------------------------------
create or replace function be_om_omfordeling(
  p_job_id      uuid,
  p_begrunnelse text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_navn text;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'Fant ikke jobb %', p_job_id;
  end if;
  if v_job.technician_id <> auth.uid() then
    raise exception 'Du kan bare be om omfordeling av dine egne jobber';
  end if;

  select navn into v_navn from technicians where id = auth.uid();

  insert into notifications (technician_id, type, tittel, melding, job_id)
  select
    t.id, 'omfordeling_foresporsel', 'Forespørsel om omfordeling',
    v_navn || ' ber om omfordeling av ordre ' || v_job.ordrenummer ||
      coalesce(': ' || nullif(p_begrunnelse, ''), '') || '.',
    p_job_id
  from technicians t
  where t.rolle = 'admin' and t.aktiv = true;
end;
$$;

-- ==================== 0005_admin_flag ====================
-- =====================================================================
-- er_admin: la en reparatør ha admin-rettigheter uten å miste sin
-- plass i jobbfordelingen. (Inkrementell — for allerede satt opp DB.)
-- =====================================================================

alter table technicians
  add column if not exists er_admin boolean not null default false;

-- Admin-rettighet = enten rolle 'admin', eller en reparatør merket er_admin
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from technicians t
    where t.id = auth.uid()
      and t.aktiv = true
      and (t.rolle = 'admin' or t.er_admin = true)
  );
$$;

-- Backfill: eksisterende rene admin-brukere får også flagget
update technicians set er_admin = true where rolle = 'admin';

-- ==================== 0006_manuell_jobb ====================
-- =====================================================================
-- opprett_og_fordel_jobb — manuell booking fra appen.
-- Enhver AKTIV reparatør kan legge inn en jobb (walk-in/telefon).
-- Jobben fordeles med SAMME regler som automatiske bookinger, og
-- havner IKKE nødvendigvis hos den som la den inn.
-- =====================================================================
create or replace function opprett_og_fordel_jobb(
  p_kunde_navn text,
  p_modell     text,
  p_feiltyper  text[],
  p_telefon    text default '',
  p_epost      text default '',
  p_onsket     text default null,
  p_kommentar  text default null
)
returns table (ordrenummer text, tildelt text)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_innlegger  text;
  v_device_id  uuid;
  v_rt_ids     uuid[];
  v_delekost   numeric := 0;
  v_arbeidspris numeric := 0;
  v_tid        int := 0;
  v_onsket_ts  timestamptz;
  v_jobbdato   date;
  v_kommentar  text := nullif(trim(coalesce(p_kommentar, '')), '');
  v_valgt      uuid;
  v_valgt_navn text;
  v_prov       numeric;
  v_belop      numeric;
  v_snapshot   jsonb;
  v_begrunnelse text;
  v_ordre      text;
  v_job_id     uuid;
begin
  -- Tilgang: kun aktiv reparatør
  select navn into v_innlegger from technicians where id = v_uid and aktiv = true;
  if v_innlegger is null then
    raise exception 'Kun aktive reparatører kan legge inn jobber';
  end if;

  -- Validering
  if coalesce(trim(p_kunde_navn), '') = '' then raise exception 'Kundenavn mangler'; end if;
  if coalesce(trim(p_modell), '') = '' then raise exception 'Modell mangler'; end if;
  if p_feiltyper is null or array_length(p_feiltyper, 1) is null then
    raise exception 'Velg minst én feiltype';
  end if;

  -- Modell
  select id into v_device_id from devices where lower(modellnavn) = lower(trim(p_modell));
  if v_device_id is null then raise exception 'Ukjent modell: %', p_modell; end if;

  -- Feiltyper → id-er (alle må finnes)
  select array_agg(id) into v_rt_ids from repair_types where navn = any(p_feiltyper);
  if v_rt_ids is null or array_length(v_rt_ids, 1) <> array_length(p_feiltyper, 1) then
    raise exception 'Ukjent feiltype';
  end if;

  -- Priser
  select coalesce(sum(delekost), 0), coalesce(sum(arbeidspris), 0), coalesce(sum(estimert_tid_min), 0)
    into v_delekost, v_arbeidspris, v_tid
  from prices where device_id = v_device_id and repair_type_id = any(v_rt_ids);

  -- Ønsket tidspunkt: tolk som dato hvis mulig, ellers legg i kommentar
  if p_onsket is not null and trim(p_onsket) <> '' then
    begin
      v_onsket_ts := p_onsket::timestamptz;
    exception when others then
      v_onsket_ts := null;
      v_kommentar := nullif(concat_ws(E'\n', v_kommentar, 'Ønsket tid: ' || p_onsket), '');
    end;
  end if;
  v_jobbdato := coalesce(v_onsket_ts::date, current_date);

  -- Fordeling: finn vinner FØR innsetting (samme formel som algoritmen)
  with fd as (
    select * from hent_fordelingsdata(v_jobbdato)
  ),
  m as (
    select max(total_kroner) mk, max(total_minutter) mm
    from fd where utilgjengelig = false
  )
  select fd.id, fd.navn into v_valgt, v_valgt_navn
  from fd, m
  where fd.utilgjengelig = false
  order by
    (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
    + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4 asc,
    fd.sist_tildelt asc nulls first,
    fd.id asc
  limit 1;

  -- Snapshot for ALLE (tillitsmekanisme)
  with fd as (
    select * from hent_fordelingsdata(v_jobbdato)
  ),
  m as (
    select max(total_kroner) mk, max(total_minutter) mm
    from fd where utilgjengelig = false
  )
  select jsonb_agg(jsonb_build_object(
    'technician_id', fd.id,
    'navn', fd.navn,
    'total_kroner', fd.total_kroner,
    'total_minutter', fd.total_minutter,
    'utilgjengelig', fd.utilgjengelig,
    'score', (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
           + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4
  ))
  into v_snapshot
  from fd, m;

  if v_valgt is not null then
    v_begrunnelse := 'Tildelt ' || v_valgt_navn || ' (lavest score). Lagt inn manuelt av ' || v_innlegger || '.';
  else
    v_begrunnelse := 'Ingen kvalifiserte reparatører – må fordeles manuelt. Lagt inn av ' || v_innlegger || '.';
  end if;

  -- Opprett jobb MED tildelt reparatør (unngår vakt-triggeren på update)
  insert into jobs (kunde_navn, telefon, epost, device_id, repair_type_ids, onsket_tidspunkt,
                    delekost, arbeidspris, estimert_tid_min, status, kommentar, technician_id)
  values (trim(p_kunde_navn), coalesce(p_telefon, ''), coalesce(p_epost, ''), v_device_id, v_rt_ids,
          v_onsket_ts, v_delekost, v_arbeidspris, v_tid, 'mottatt', v_kommentar, v_valgt)
  returning id, jobs.ordrenummer into v_job_id, v_ordre;

  -- Logg tildelingen
  insert into assignment_log (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values (v_job_id, v_valgt, v_begrunnelse, coalesce(v_snapshot, '[]'::jsonb), false, v_uid);

  -- Earnings + varsel til tildelt reparatør
  if v_valgt is not null then
    select provisjon_prosent into v_prov from technicians where id = v_valgt;
    v_belop := round(v_arbeidspris * v_prov / 100.0, 2);
    insert into earnings (job_id, technician_id, belop, periode)
    values (v_job_id, v_valgt, v_belop, to_char(now(), 'YYYY-MM'));

    insert into notifications (technician_id, type, tittel, melding, job_id)
    values (v_valgt, 'ny_jobb', 'Ny jobb tildelt',
            'Ordre ' || v_ordre || ' – ' || trim(p_kunde_navn) || ' (' || trim(p_modell) || ')', v_job_id);
  end if;

  return query select v_ordre, v_valgt_navn;
end;
$$;

-- ==================== 0007_realtime ====================
-- =====================================================================
-- Aktiver Supabase Realtime for tabellene appen abonnerer på, slik at
-- alle ser oppdateringer umiddelbart.
-- =====================================================================

-- Publikasjonen finnes normalt i Supabase; lag den hvis den mangler.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Legg til tabellene (idempotent)
do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'earnings', 'notifications', 'assignment_log', 'availability', 'technicians']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Full gammel-verdi ved UPDATE/DELETE (så realtime-nyttelasten er komplett)
alter table jobs          replica identity full;
alter table earnings      replica identity full;
alter table notifications replica identity full;
alter table availability  replica identity full;

-- ==================== seed: modeller, feiltyper, priser ====================
-- =====================================================================
-- Seed — iPhone-modeller, reparasjonstyper, priser og reparatører
-- =====================================================================
-- Kjør etter migrasjonene. Idempotent (on conflict do nothing/update).

-- ---------------------------------------------------------------------
-- DEVICES (iPhone-modeller, nyeste først via sortering)
-- ---------------------------------------------------------------------
insert into devices (modellnavn, sortering) values
  ('iPhone 15 Pro Max', 1),
  ('iPhone 15 Pro',     2),
  ('iPhone 15 Plus',    3),
  ('iPhone 15',         4),
  ('iPhone 14 Pro Max', 5),
  ('iPhone 14 Pro',     6),
  ('iPhone 14 Plus',    7),
  ('iPhone 14',         8),
  ('iPhone 13 Pro Max', 9),
  ('iPhone 13 Pro',     10),
  ('iPhone 13',         11),
  ('iPhone 13 mini',    12),
  ('iPhone 12 Pro Max', 13),
  ('iPhone 12 Pro',     14),
  ('iPhone 12',         15),
  ('iPhone 12 mini',    16),
  ('iPhone 11 Pro Max', 17),
  ('iPhone 11 Pro',     18),
  ('iPhone 11',         19),
  ('iPhone SE (2022)',  20),
  ('iPhone SE (2020)',  21),
  ('iPhone XR',         22),
  ('iPhone XS Max',     23),
  ('iPhone XS',         24),
  ('iPhone X',          25),
  ('iPhone 8 Plus',     26),
  ('iPhone 8',          27),
  ('iPhone 7 Plus',     28),
  ('iPhone 7',          29)
on conflict (modellnavn) do update set sortering = excluded.sortering;

-- ---------------------------------------------------------------------
-- REPAIR_TYPES (feiltyper)
-- ---------------------------------------------------------------------
insert into repair_types (navn) values
  ('Skjermbytte'),
  ('Batteribytte'),
  ('Ladeport'),
  ('Bakglass'),
  ('Kamera'),
  ('Høyttaler'),
  ('Mikrofon'),
  ('Vannskade'),
  ('Diagnose')
on conflict (navn) do nothing;

-- ---------------------------------------------------------------------
-- PRICES — genereres for alle kombinasjoner modell × feiltype.
--  Nyere modell (lavere sortering) = høyere delekost.
--  Verdiene er representative, ikke fasit — juster i admin.
-- ---------------------------------------------------------------------
with base as (
  select
    rt.id   as repair_type_id,
    rt.navn as rt_navn,
    -- basis delekost, arbeidspris og tid per feiltype
    case rt.navn
      when 'Skjermbytte'  then 1400
      when 'Batteribytte' then 450
      when 'Ladeport'     then 350
      when 'Bakglass'     then 700
      when 'Kamera'       then 600
      when 'Høyttaler'    then 300
      when 'Mikrofon'     then 300
      when 'Vannskade'    then 200
      when 'Diagnose'     then 0
    end as base_delekost,
    case rt.navn
      when 'Skjermbytte'  then 500
      when 'Batteribytte' then 400
      when 'Ladeport'     then 500
      when 'Bakglass'     then 700
      when 'Kamera'       then 500
      when 'Høyttaler'    then 400
      when 'Mikrofon'     then 400
      when 'Vannskade'    then 900
      when 'Diagnose'     then 200
    end as base_arbeidspris,
    case rt.navn
      when 'Skjermbytte'  then 45
      when 'Batteribytte' then 40
      when 'Ladeport'     then 50
      when 'Bakglass'     then 60
      when 'Kamera'       then 45
      when 'Høyttaler'    then 40
      when 'Mikrofon'     then 40
      when 'Vannskade'    then 120
      when 'Diagnose'     then 30
    end as base_tid
  from repair_types rt
),
modell as (
  select id as device_id, sortering,
    -- faktor 1.0 for eldste, opp mot ~1.9 for nyeste
    round((1.0 + greatest(0, (30 - sortering)) * 0.03)::numeric, 2) as faktor
  from devices
)
insert into prices (device_id, repair_type_id, delekost, arbeidspris, estimert_tid_min)
select
  m.device_id,
  b.repair_type_id,
  round(b.base_delekost * m.faktor / 10.0) * 10,   -- rund til nærmeste tier
  b.base_arbeidspris,                              -- arbeidspris lik uansett modell
  b.base_tid
from modell m
cross join base b
on conflict (device_id, repair_type_id) do update
  set delekost = excluded.delekost,
      arbeidspris = excluded.arbeidspris,
      estimert_tid_min = excluded.estimert_tid_min;

