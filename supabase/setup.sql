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

-- ==================== 0008_fortjeneste_og_neste ====================
-- =====================================================================
-- 1) Ny fortjeneste-modell: reparatøren beholder HELE arbeidsmarginen
--    (kunden betaler − delen koster = arbeidspris). earnings.belop = arbeidspris.
-- 2) gi_til_neste_i_ko: den jobben er tildelt kan sende den videre til
--    nestemann i køen hvis det ikke passer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Omregn EKSISTERENDE earnings til full arbeidsmargin
-- ---------------------------------------------------------------------
update earnings e
set belop = round(coalesce(j.arbeidspris, 0), 2)
from jobs j
where e.job_id = j.id;

-- ---------------------------------------------------------------------
-- opprett_og_fordel_jobb — belop = arbeidspris (hele marginen)
-- ---------------------------------------------------------------------
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
  v_snapshot   jsonb;
  v_begrunnelse text;
  v_ordre      text;
  v_job_id     uuid;
begin
  select navn into v_innlegger from technicians where id = v_uid and aktiv = true;
  if v_innlegger is null then
    raise exception 'Kun aktive reparatører kan legge inn jobber';
  end if;

  if coalesce(trim(p_kunde_navn), '') = '' then raise exception 'Kundenavn mangler'; end if;
  if coalesce(trim(p_modell), '') = '' then raise exception 'Modell mangler'; end if;
  if p_feiltyper is null or array_length(p_feiltyper, 1) is null then
    raise exception 'Velg minst én feiltype';
  end if;

  select id into v_device_id from devices where lower(modellnavn) = lower(trim(p_modell));
  if v_device_id is null then raise exception 'Ukjent modell: %', p_modell; end if;

  select array_agg(id) into v_rt_ids from repair_types where navn = any(p_feiltyper);
  if v_rt_ids is null or array_length(v_rt_ids, 1) <> array_length(p_feiltyper, 1) then
    raise exception 'Ukjent feiltype';
  end if;

  select coalesce(sum(delekost), 0), coalesce(sum(arbeidspris), 0), coalesce(sum(estimert_tid_min), 0)
    into v_delekost, v_arbeidspris, v_tid
  from prices where device_id = v_device_id and repair_type_id = any(v_rt_ids);

  if p_onsket is not null and trim(p_onsket) <> '' then
    begin
      v_onsket_ts := p_onsket::timestamptz;
    exception when others then
      v_onsket_ts := null;
      v_kommentar := nullif(concat_ws(E'\n', v_kommentar, 'Ønsket tid: ' || p_onsket), '');
    end;
  end if;
  v_jobbdato := coalesce(v_onsket_ts::date, current_date);

  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (select max(total_kroner) mk, max(total_minutter) mm from fd where utilgjengelig = false)
  select fd.id, fd.navn into v_valgt, v_valgt_navn
  from fd, m
  where fd.utilgjengelig = false
  order by
    (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
    + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4 asc,
    fd.sist_tildelt asc nulls first, fd.id asc
  limit 1;

  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (select max(total_kroner) mk, max(total_minutter) mm from fd where utilgjengelig = false)
  select jsonb_agg(jsonb_build_object(
    'technician_id', fd.id, 'navn', fd.navn, 'total_kroner', fd.total_kroner,
    'total_minutter', fd.total_minutter, 'utilgjengelig', fd.utilgjengelig,
    'score', (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
           + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4))
  into v_snapshot from fd, m;

  if v_valgt is not null then
    v_begrunnelse := 'Tildelt ' || v_valgt_navn || ' (lavest score). Lagt inn manuelt av ' || v_innlegger || '.';
  else
    v_begrunnelse := 'Ingen kvalifiserte reparatører – må fordeles manuelt. Lagt inn av ' || v_innlegger || '.';
  end if;

  insert into jobs (kunde_navn, telefon, epost, device_id, repair_type_ids, onsket_tidspunkt,
                    delekost, arbeidspris, estimert_tid_min, status, kommentar, technician_id)
  values (trim(p_kunde_navn), coalesce(p_telefon, ''), coalesce(p_epost, ''), v_device_id, v_rt_ids,
          v_onsket_ts, v_delekost, v_arbeidspris, v_tid, 'mottatt', v_kommentar, v_valgt)
  returning id, jobs.ordrenummer into v_job_id, v_ordre;

  insert into assignment_log (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values (v_job_id, v_valgt, v_begrunnelse, coalesce(v_snapshot, '[]'::jsonb), false, v_uid);

  if v_valgt is not null then
    insert into earnings (job_id, technician_id, belop, periode)
    values (v_job_id, v_valgt, round(v_arbeidspris, 2), to_char(now(), 'YYYY-MM'));   -- HELE marginen

    insert into notifications (technician_id, type, tittel, melding, job_id)
    values (v_valgt, 'ny_jobb', 'Ny jobb tildelt',
            'Ordre ' || v_ordre || ' – ' || trim(p_kunde_navn) || ' (' || trim(p_modell) || ')', v_job_id);
  end if;

  return query select v_ordre, v_valgt_navn;
end;
$$;

-- ---------------------------------------------------------------------
-- omfordel_jobb — belop = arbeidspris (hele marginen)
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
  v_job         jobs%rowtype;
  v_ny_navn     text;
  v_belop       numeric;
  v_snapshot    jsonb;
  v_begrunnelse text;
begin
  if not (is_admin() or auth.uid() = p_ny_technician) then
    raise exception 'Omfordeling krever admin, eller godkjenning fra mottaker';
  end if;

  select * into v_job from jobs where id = p_job_id;
  if not found then raise exception 'Fant ikke jobb %', p_job_id; end if;

  select navn into v_ny_navn from technicians where id = p_ny_technician and aktiv = true;
  if not found then raise exception 'Mottaker er ikke en aktiv reparatør'; end if;

  perform set_config('app.omfordeling', '1', true);
  update jobs set technician_id = p_ny_technician where id = p_job_id;

  v_belop := round(coalesce(v_job.arbeidspris, 0), 2);   -- HELE marginen
  delete from earnings where job_id = p_job_id;
  insert into earnings (job_id, technician_id, belop, periode)
  values (p_job_id, p_ny_technician, v_belop, to_char(coalesce(v_job.opprettet, now()), 'YYYY-MM'));

  select coalesce(jsonb_agg(jsonb_build_object(
           'technician_id', d.id, 'navn', d.navn, 'total_kroner', d.total_kroner,
           'total_minutter', d.total_minutter, 'utilgjengelig', d.utilgjengelig)), '[]'::jsonb)
  into v_snapshot
  from hent_fordelingsdata(coalesce(v_job.onsket_tidspunkt::date, current_date)) d;

  v_begrunnelse := coalesce(nullif(p_begrunnelse, ''), 'Manuell omfordeling til ' || v_ny_navn);

  insert into assignment_log (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values (p_job_id, p_ny_technician, v_begrunnelse, v_snapshot, true, auth.uid());

  insert into notifications (technician_id, type, tittel, melding, job_id)
  values (p_ny_technician, 'jobb_omfordelt', 'Jobb omfordelt til deg',
          'Ordre ' || v_job.ordrenummer || ' (' || v_job.kunde_navn || ') er nå din.', p_job_id);
end;
$$;

-- ---------------------------------------------------------------------
-- gi_til_neste_i_ko — send jobben videre til nestemann i køen
--  Tilgang: den jobben er tildelt, eller admin.
--  Velger laveste score BLANT DE ANDRE (ekskl. nåværende), hopper over
--  utilgjengelige. Flytter earnings, logger og varsler.
-- ---------------------------------------------------------------------
create or replace function gi_til_neste_i_ko(p_job_id uuid)
returns table (tildelt text)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_job     jobs%rowtype;
  v_gammel  uuid;
  v_jobbdato date;
  v_ny      uuid;
  v_ny_navn text;
  v_belop   numeric;
  v_snapshot jsonb;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then raise exception 'Fant ikke jobb %', p_job_id; end if;
  v_gammel := v_job.technician_id;

  if not (is_admin() or v_gammel = v_uid) then
    raise exception 'Bare den jobben er tildelt (eller admin) kan gi den videre';
  end if;

  v_jobbdato := coalesce(v_job.onsket_tidspunkt::date, current_date);

  -- Nestemann: laveste score blant de andre tilgjengelige
  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (
    select max(total_kroner) mk, max(total_minutter) mm
    from fd where utilgjengelig = false and (v_gammel is null or id <> v_gammel)
  )
  select fd.id, fd.navn into v_ny, v_ny_navn
  from fd, m
  where fd.utilgjengelig = false and (v_gammel is null or fd.id <> v_gammel)
  order by
    (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
    + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4 asc,
    fd.sist_tildelt asc nulls first, fd.id asc
  limit 1;

  if v_ny is null then
    raise exception 'Ingen annen tilgjengelig reparatør å gi jobben til';
  end if;

  perform set_config('app.omfordeling', '1', true);
  update jobs set technician_id = v_ny where id = p_job_id;

  v_belop := round(coalesce(v_job.arbeidspris, 0), 2);
  delete from earnings where job_id = p_job_id;
  insert into earnings (job_id, technician_id, belop, periode)
  values (p_job_id, v_ny, v_belop, to_char(coalesce(v_job.opprettet, now()), 'YYYY-MM'));

  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (select max(total_kroner) mk, max(total_minutter) mm from fd where utilgjengelig = false)
  select jsonb_agg(jsonb_build_object(
    'technician_id', fd.id, 'navn', fd.navn, 'total_kroner', fd.total_kroner,
    'total_minutter', fd.total_minutter, 'utilgjengelig', fd.utilgjengelig,
    'score', (case when coalesce(m.mk, 0) = 0 then 0 else fd.total_kroner / m.mk end) * 0.6
           + (case when coalesce(m.mm, 0) = 0 then 0 else fd.total_minutter / m.mm end) * 0.4))
  into v_snapshot from fd, m;

  insert into assignment_log (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values (p_job_id, v_ny,
          'Gitt videre til nestemann i køen (' || v_ny_navn || ') fordi det ikke passet.',
          coalesce(v_snapshot, '[]'::jsonb), true, v_uid);

  insert into notifications (technician_id, type, tittel, melding, job_id)
  values (v_ny, 'jobb_omfordelt', 'Jobb omfordelt til deg',
          'Ordre ' || v_job.ordrenummer || ' (' || v_job.kunde_navn || ') er nå din.', p_job_id);

  return query select v_ny_navn;
end;
$$;

-- ==================== 0009_priser_kvalitet ====================
-- =====================================================================
-- Priser fra Fixiphone-prislista:
--  * To kvalitetsnivåer (original / aftermarket) — kunden velger
--  * Tre uavhengige tall pga. mva: delekost (innkjøp),
--    arbeidspris (= «Vi tjener», reparatørens fortjeneste),
--    totalpris (= «Kunden betaler»). Disse summerer IKKE lenger.
-- =====================================================================

-- Kvalitetsnivå
do $$ begin
  create type pris_kvalitet as enum ('original', 'aftermarket');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- prices: legg til kvalitet + totalpris, ny primærnøkkel
-- ---------------------------------------------------------------------
alter table prices add column if not exists kvalitet pris_kvalitet not null default 'original';
alter table prices add column if not exists totalpris numeric(10,2) not null default 0;

do $$ begin
  alter table prices drop constraint prices_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table prices add primary key (device_id, repair_type_id, kvalitet);
exception when invalid_table_definition then null; end $$;

-- ---------------------------------------------------------------------
-- jobs: hvilken kvalitet ble valgt
-- ---------------------------------------------------------------------
alter table jobs add column if not exists kvalitet pris_kvalitet not null default 'original';

-- ---------------------------------------------------------------------
-- Trigger: IKKE lenger regne totalpris = delekost + arbeidspris.
-- totalpris settes eksplisitt (kunden betaler fra prislista).
-- Behold kun fullført-tidsstempel.
-- ---------------------------------------------------------------------
create or replace function jobs_beregn_totalpris()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'hentet' and old.status is distinct from 'hentet' then
    new.fullfort := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- opprett_og_fordel_jobb — med kvalitetsvalg + uavhengig totalpris
-- ---------------------------------------------------------------------
create or replace function opprett_og_fordel_jobb(
  p_kunde_navn text,
  p_modell     text,
  p_feiltyper  text[],
  p_telefon    text default '',
  p_epost      text default '',
  p_onsket     text default null,
  p_kommentar  text default null,
  p_kvalitet   text default 'original'
)
returns table (ordrenummer text, tildelt text)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_innlegger  text;
  v_device_id  uuid;
  v_rt_ids     uuid[];
  v_kval       pris_kvalitet := coalesce(nullif(p_kvalitet,''),'original')::pris_kvalitet;
  v_delekost   numeric := 0;
  v_arbeidspris numeric := 0;
  v_totalpris  numeric := 0;
  v_tid        int := 0;
  v_onsket_ts  timestamptz;
  v_jobbdato   date;
  v_kommentar  text := nullif(trim(coalesce(p_kommentar, '')), '');
  v_valgt      uuid;
  v_valgt_navn text;
  v_snapshot   jsonb;
  v_begrunnelse text;
  v_ordre      text;
  v_job_id     uuid;
begin
  select navn into v_innlegger from technicians where id = v_uid and aktiv = true;
  if v_innlegger is null then raise exception 'Kun aktive reparatører kan legge inn jobber'; end if;

  if coalesce(trim(p_kunde_navn), '') = '' then raise exception 'Kundenavn mangler'; end if;
  if coalesce(trim(p_modell), '') = '' then raise exception 'Modell mangler'; end if;
  if p_feiltyper is null or array_length(p_feiltyper, 1) is null then
    raise exception 'Velg minst én feiltype';
  end if;

  select id into v_device_id from devices where lower(modellnavn) = lower(trim(p_modell));
  if v_device_id is null then raise exception 'Ukjent modell: %', p_modell; end if;

  select array_agg(id) into v_rt_ids from repair_types where navn = any(p_feiltyper);
  if v_rt_ids is null or array_length(v_rt_ids, 1) <> array_length(p_feiltyper, 1) then
    raise exception 'Ukjent feiltype';
  end if;

  -- Priser ved valgt kvalitet, med fallback til 'original' der aftermarket mangler
  select coalesce(sum(delekost), 0), coalesce(sum(arbeidspris), 0),
         coalesce(sum(totalpris), 0), coalesce(sum(estimert_tid_min), 0)
    into v_delekost, v_arbeidspris, v_totalpris, v_tid
  from (
    select distinct on (repair_type_id)
           delekost, arbeidspris, totalpris, estimert_tid_min
    from prices
    where device_id = v_device_id
      and repair_type_id = any(v_rt_ids)
      and kvalitet in (v_kval, 'original')
    order by repair_type_id, (kvalitet = v_kval) desc
  ) p;

  if p_onsket is not null and trim(p_onsket) <> '' then
    begin v_onsket_ts := p_onsket::timestamptz;
    exception when others then
      v_onsket_ts := null;
      v_kommentar := nullif(concat_ws(E'\n', v_kommentar, 'Ønsket tid: ' || p_onsket), '');
    end;
  end if;
  v_jobbdato := coalesce(v_onsket_ts::date, current_date);

  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (select max(total_kroner) mk, max(total_minutter) mm from fd where utilgjengelig = false)
  select fd.id, fd.navn into v_valgt, v_valgt_navn
  from fd, m where fd.utilgjengelig = false
  order by
    (case when coalesce(m.mk,0)=0 then 0 else fd.total_kroner/m.mk end)*0.6
    + (case when coalesce(m.mm,0)=0 then 0 else fd.total_minutter/m.mm end)*0.4 asc,
    fd.sist_tildelt asc nulls first, fd.id asc
  limit 1;

  with fd as (select * from hent_fordelingsdata(v_jobbdato)),
  m as (select max(total_kroner) mk, max(total_minutter) mm from fd where utilgjengelig = false)
  select jsonb_agg(jsonb_build_object(
    'technician_id', fd.id, 'navn', fd.navn, 'total_kroner', fd.total_kroner,
    'total_minutter', fd.total_minutter, 'utilgjengelig', fd.utilgjengelig,
    'score', (case when coalesce(m.mk,0)=0 then 0 else fd.total_kroner/m.mk end)*0.6
           + (case when coalesce(m.mm,0)=0 then 0 else fd.total_minutter/m.mm end)*0.4))
  into v_snapshot from fd, m;

  if v_valgt is not null then
    v_begrunnelse := 'Tildelt ' || v_valgt_navn || ' (lavest score). Lagt inn manuelt av ' || v_innlegger || '.';
  else
    v_begrunnelse := 'Ingen kvalifiserte reparatører – må fordeles manuelt. Lagt inn av ' || v_innlegger || '.';
  end if;

  insert into jobs (kunde_navn, telefon, epost, device_id, repair_type_ids, onsket_tidspunkt,
                    delekost, arbeidspris, totalpris, estimert_tid_min, status, kommentar,
                    kvalitet, technician_id)
  values (trim(p_kunde_navn), coalesce(p_telefon,''), coalesce(p_epost,''), v_device_id, v_rt_ids,
          v_onsket_ts, v_delekost, v_arbeidspris, v_totalpris, v_tid, 'mottatt', v_kommentar,
          v_kval, v_valgt)
  returning id, jobs.ordrenummer into v_job_id, v_ordre;

  insert into assignment_log (job_id, technician_id, begrunnelse, score_snapshot, er_omfordeling, utfort_av)
  values (v_job_id, v_valgt, v_begrunnelse, coalesce(v_snapshot,'[]'::jsonb), false, v_uid);

  if v_valgt is not null then
    insert into earnings (job_id, technician_id, belop, periode)
    values (v_job_id, v_valgt, round(v_arbeidspris, 2), to_char(now(),'YYYY-MM'));

    insert into notifications (technician_id, type, tittel, melding, job_id)
    values (v_valgt, 'ny_jobb', 'Ny jobb tildelt',
            'Ordre ' || v_ordre || ' – ' || trim(p_kunde_navn) || ' (' || trim(p_modell) || ')', v_job_id);
  end if;

  return query select v_ordre, v_valgt_navn;
end;
$$;


-- ============================================================
-- Priser fra Fixiphone-prislista (generert fra Excel-arket)
-- Forutsetter at migrasjon 0009 er kjørt (kvalitet + totalpris).
-- ============================================================

-- Rydd gamle priser og reparasjonstyper som ikke er i prislista
delete from prices;
delete from repair_types where navn not in
  ('Skjermbytte','Batteribytte','Bak kamera','Front kamera','Ladeport','Bakglass','Loud speaker','Samtalehøytaler');

-- Modeller fra prislista (nyeste først)
insert into devices (modellnavn, sortering) values
  ('iPhone 17 Pro Max', 1),
  ('iPhone 17 Pro', 2),
  ('iPhone 17 Air', 3),
  ('iPhone 17', 4),
  ('iPhone 17e', 5),
  ('iPhone 16 Pro Max', 6),
  ('iPhone 16 Pro', 7),
  ('iPhone 16 Plus', 8),
  ('iPhone 16', 9),
  ('iPhone 16e', 10),
  ('iPhone 15 Pro Max', 11),
  ('iPhone 15 Pro', 12),
  ('iPhone 15 Plus', 13),
  ('iPhone 15', 14),
  ('iPhone 14 Pro Max', 15),
  ('iPhone 14 Pro', 16),
  ('iPhone 14 Plus', 17),
  ('iPhone 14', 18),
  ('iPhone 13 Pro Max', 19),
  ('iPhone 13 Pro', 20),
  ('iPhone 13 mini', 21),
  ('iPhone 13', 22),
  ('iPhone 12 Pro Max', 23),
  ('iPhone 12 Pro', 24),
  ('iPhone 12 mini', 25),
  ('iPhone 12', 26)
on conflict (modellnavn) do update set sortering = excluded.sortering;

-- Reparasjonstyper fra prislista
insert into repair_types (navn) values
  ('Skjermbytte'),
  ('Batteribytte'),
  ('Bak kamera'),
  ('Front kamera'),
  ('Ladeport'),
  ('Bakglass'),
  ('Loud speaker'),
  ('Samtalehøytaler')
on conflict (navn) do nothing;

-- Priser per modell + reparasjon + kvalitet (innkjøp / vi tjener / kunden betaler)
insert into prices (device_id, repair_type_id, kvalitet, delekost, arbeidspris, totalpris, estimert_tid_min)
select d.id, rt.id, v.kvalitet::pris_kvalitet, v.delekost, v.arbeidspris, v.totalpris, v.tid
from (values
  ('iPhone 12','Skjermbytte','original',644,606,1450,45),
  ('iPhone 12','Skjermbytte','aftermarket',281,619,1090,45),
  ('iPhone 12 mini','Skjermbytte','original',691,559,1450,45),
  ('iPhone 12 mini','Skjermbytte','aftermarket',481,509,1290,45),
  ('iPhone 12 Pro','Skjermbytte','original',644,606,1450,45),
  ('iPhone 12 Pro','Skjermbytte','aftermarket',281,619,1290,45),
  ('iPhone 12 Pro Max','Skjermbytte','original',1599,391,2290,45),
  ('iPhone 12 Pro Max','Skjermbytte','aftermarket',446,804,1250,45),
  ('iPhone 13','Skjermbytte','original',676,574,1450,45),
  ('iPhone 13','Skjermbytte','aftermarket',446,504,1250,45),
  ('iPhone 13 mini','Skjermbytte','original',1304,446,1950,45),
  ('iPhone 13 mini','Skjermbytte','aftermarket',500,690,1390,45),
  ('iPhone 13 Pro','Skjermbytte','original',1088,412,1700,45),
  ('iPhone 13 Pro','Skjermbytte','aftermarket',488,502,1290,45),
  ('iPhone 13 Pro Max','Skjermbytte','original',1300,600,2090,45),
  ('iPhone 13 Pro Max','Skjermbytte','aftermarket',438,752,1390,45),
  ('iPhone 14','Skjermbytte','original',754,446,1400,45),
  ('iPhone 14','Skjermbytte','aftermarket',448,452,1090,45),
  ('iPhone 14 Plus','Skjermbytte','original',1303,447,1950,45),
  ('iPhone 14 Plus','Skjermbytte','aftermarket',428,762,1390,45),
  ('iPhone 14 Pro','Skjermbytte','original',1555,435,2290,45),
  ('iPhone 14 Pro','Skjermbytte','aftermarket',454,796,1450,45),
  ('iPhone 14 Pro Max','Skjermbytte','original',2411,489,3090,45),
  ('iPhone 14 Pro Max','Skjermbytte','aftermarket',513,937,1650,45),
  ('iPhone 15','Skjermbytte','original',1570,420,2290,45),
  ('iPhone 15','Skjermbytte','aftermarket',498,692,1390,45),
  ('iPhone 15 Plus','Skjermbytte','original',1444,456,2200,45),
  ('iPhone 15 Plus','Skjermbytte','aftermarket',690,560,1450,45),
  ('iPhone 15 Pro','Skjermbytte','original',2338,412,2950,45),
  ('iPhone 15 Pro','Skjermbytte','aftermarket',489,961,1650,45),
  ('iPhone 15 Pro Max','Skjermbytte','original',2541,449,3290,45),
  ('iPhone 15 Pro Max','Skjermbytte','aftermarket',513,1037,1750,45),
  ('iPhone 16','Skjermbytte','original',1711,539,2450,45),
  ('iPhone 16','Skjermbytte','aftermarket',494,696,1390,45),
  ('iPhone 16 Plus','Skjermbytte','original',1473,517,2290,45),
  ('iPhone 16 Plus','Skjermbytte','aftermarket',563,627,1390,45),
  ('iPhone 16 Pro','Skjermbytte','original',2418,482,3090,45),
  ('iPhone 16 Pro','Skjermbytte','aftermarket',786,964,1950,45),
  ('iPhone 16 Pro Max','Skjermbytte','original',3004,496,3700,45),
  ('iPhone 16 Pro Max','Skjermbytte','aftermarket',1040,950,2290,45),
  ('iPhone 16e','Skjermbytte','original',1169,581,1950,45),
  ('iPhone 16e','Skjermbytte','aftermarket',446,744,1390,45),
  ('iPhone 17','Skjermbytte','original',2908,542,3650,45),
  ('iPhone 17','Skjermbytte','aftermarket',963,787,1950,45),
  ('iPhone 17 Air','Skjermbytte','original',3588,402,4290,45),
  ('iPhone 17 Air','Skjermbytte','aftermarket',2336,763,3290,45),
  ('iPhone 17 Pro','Skjermbytte','original',3259,491,3950,45),
  ('iPhone 17 Pro','Skjermbytte','aftermarket',1223,767,2290,45),
  ('iPhone 17 Pro Max','Skjermbytte','original',3704,446,4350,45),
  ('iPhone 17 Pro Max','Skjermbytte','aftermarket',1641,809,2650,45),
  ('iPhone 17e','Skjermbytte','original',1169,581,1950,45),
  ('iPhone 17e','Skjermbytte','aftermarket',446,744,1390,45),
  ('iPhone 12','Bak kamera','original',1683,807,2690,45),
  ('iPhone 12','Bak kamera','aftermarket',128,522,850,45),
  ('iPhone 12 mini','Bak kamera','original',1683,807,2690,45),
  ('iPhone 12 mini','Bak kamera','aftermarket',303,496,999,45),
  ('iPhone 12 Pro','Bak kamera','original',1991,659,2850,45),
  ('iPhone 12 Pro','Bak kamera','aftermarket',697,493,1390,45),
  ('iPhone 12 Pro Max','Bak kamera','original',1991,659,2850,45),
  ('iPhone 12 Pro Max','Bak kamera','aftermarket',568,522,1290,45),
  ('iPhone 13','Bak kamera','original',1683,807,2690,45),
  ('iPhone 13','Bak kamera','aftermarket',79,811,1090,45),
  ('iPhone 13 mini','Bak kamera','original',1683,807,2690,45),
  ('iPhone 13 mini','Bak kamera','aftermarket',79,811,1090,45),
  ('iPhone 13 Pro','Bak kamera','original',1991,659,2850,45),
  ('iPhone 13 Pro','Bak kamera','aftermarket',694,496,1390,45),
  ('iPhone 13 Pro Max','Bak kamera','original',1991,659,2850,45),
  ('iPhone 13 Pro Max','Bak kamera','aftermarket',694,496,1390,45),
  ('iPhone 14','Bak kamera','original',1683,807,2690,45),
  ('iPhone 14','Bak kamera','aftermarket',318,531,1049,45),
  ('iPhone 14 Plus','Bak kamera','original',1683,807,2690,45),
  ('iPhone 14 Plus','Bak kamera','aftermarket',454,545,1199,45),
  ('iPhone 14 Pro','Bak kamera','original',2198,792,3190,45),
  ('iPhone 14 Pro','Bak kamera','aftermarket',589,601,1390,45),
  ('iPhone 14 Pro Max','Bak kamera','original',2198,792,3190,45),
  ('iPhone 14 Pro Max','Bak kamera','aftermarket',481,709,1390,45),
  ('iPhone 15','Bak kamera','original',1683,807,2690,45),
  ('iPhone 15','Bak kamera','aftermarket',300,549,1049,45),
  ('iPhone 15 Plus','Bak kamera','original',1683,807,2690,45),
  ('iPhone 15 Plus','Bak kamera','aftermarket',298,551,1049,45),
  ('iPhone 15 Pro','Bak kamera','original',2198,792,3190,45),
  ('iPhone 15 Pro','Bak kamera','aftermarket',689,601,1490,45),
  ('iPhone 15 Pro Max','Bak kamera','original',2505,685,3390,45),
  ('iPhone 15 Pro Max','Bak kamera','aftermarket',589,601,1390,45),
  ('iPhone 16','Bak kamera','original',1683,807,2690,45),
  ('iPhone 16','Bak kamera','aftermarket',501,589,1290,45),
  ('iPhone 16 Plus','Bak kamera','original',1683,807,2690,45),
  ('iPhone 16 Plus','Bak kamera','aftermarket',635,655,1490,45),
  ('iPhone 16 Pro','Bak kamera','original',2505,685,3390,45),
  ('iPhone 16 Pro','Bak kamera','aftermarket',529,661,1390,45),
  ('iPhone 16 Pro Max','Bak kamera','original',2505,685,3390,45),
  ('iPhone 16 Pro Max','Bak kamera','aftermarket',528,662,1390,45),
  ('iPhone 16e','Bak kamera','original',1273,717,2190,45),
  ('iPhone 16e','Bak kamera','aftermarket',394,605,1199,45),
  ('iPhone 17','Bak kamera','original',1683,807,2690,45),
  ('iPhone 17','Bak kamera','aftermarket',808,682,1690,45),
  ('iPhone 17 Air','Bak kamera','original',1683,807,2690,45),
  ('iPhone 17 Air','Bak kamera','aftermarket',1103,787,2090,45),
  ('iPhone 17 Pro','Bak kamera','original',2505,685,3390,45),
  ('iPhone 17 Pro','Bak kamera','aftermarket',680,710,1590,45),
  ('iPhone 17 Pro Max','Bak kamera','original',3296,894,4390,45),
  ('iPhone 17 Pro Max','Bak kamera','aftermarket',680,710,1590,45),
  ('iPhone 17e','Bak kamera','aftermarket',394,605,1199,45),
  ('iPhone 12','Front kamera','original',1683,807,2690,45),
  ('iPhone 12','Front kamera','aftermarket',24,575,799,45),
  ('iPhone 12 mini','Front kamera','original',1683,807,2690,45),
  ('iPhone 12 mini','Front kamera','aftermarket',24,575,799,45),
  ('iPhone 12 Pro','Front kamera','original',1683,807,2690,45),
  ('iPhone 12 Pro','Front kamera','aftermarket',24,575,799,45),
  ('iPhone 12 Pro Max','Front kamera','original',1683,807,2690,45),
  ('iPhone 12 Pro Max','Front kamera','aftermarket',36,563,799,45),
  ('iPhone 13','Front kamera','original',1991,659,2850,45),
  ('iPhone 13','Front kamera','aftermarket',31,568,799,45),
  ('iPhone 13 mini','Front kamera','original',1991,659,2850,45),
  ('iPhone 13 mini','Front kamera','aftermarket',50,649,899,45),
  ('iPhone 13 Pro','Front kamera','original',1991,659,2850,45),
  ('iPhone 13 Pro','Front kamera','aftermarket',34,615,849,45),
  ('iPhone 13 Pro Max','Front kamera','original',1991,659,2850,45),
  ('iPhone 13 Pro Max','Front kamera','aftermarket',35,614,849,45),
  ('iPhone 14','Front kamera','original',1991,659,2850,45),
  ('iPhone 14','Front kamera','aftermarket',189,610,999,45),
  ('iPhone 14 Plus','Front kamera','original',1991,659,2850,45),
  ('iPhone 14 Plus','Front kamera','aftermarket',243,656,1099,45),
  ('iPhone 14 Pro','Front kamera','original',1991,659,2850,45),
  ('iPhone 14 Pro','Front kamera','aftermarket',203,696,1099,45),
  ('iPhone 14 Pro Max','Front kamera','original',1991,659,2850,45),
  ('iPhone 14 Pro Max','Front kamera','aftermarket',211,688,1099,45),
  ('iPhone 15','Front kamera','original',1991,659,2850,45),
  ('iPhone 15','Front kamera','aftermarket',216,683,1099,45),
  ('iPhone 15 Plus','Front kamera','original',1991,659,2850,45),
  ('iPhone 15 Plus','Front kamera','aftermarket',264,635,1099,45),
  ('iPhone 15 Pro','Front kamera','original',1991,659,2850,45),
  ('iPhone 15 Pro','Front kamera','aftermarket',285,714,1199,45),
  ('iPhone 15 Pro Max','Front kamera','original',1991,659,2850,45),
  ('iPhone 15 Pro Max','Front kamera','aftermarket',285,714,1199,45),
  ('iPhone 16','Front kamera','original',1991,659,2850,45),
  ('iPhone 16','Front kamera','aftermarket',336,763,1299,45),
  ('iPhone 16 Plus','Front kamera','original',1991,659,2850,45),
  ('iPhone 16 Plus','Front kamera','aftermarket',335,764,1299,45),
  ('iPhone 16 Pro','Front kamera','original',1991,659,2850,45),
  ('iPhone 16 Pro','Front kamera','aftermarket',909,690,1799,45),
  ('iPhone 16 Pro Max','Front kamera','original',1991,659,2850,45),
  ('iPhone 16 Pro Max','Front kamera','aftermarket',706,693,1599,45),
  ('iPhone 16e','Front kamera','original',1991,659,2850,45),
  ('iPhone 16e','Front kamera','aftermarket',298,701,1199,45),
  ('iPhone 17','Front kamera','original',1991,659,2850,45),
  ('iPhone 17','Front kamera','aftermarket',536,763,1499,45),
  ('iPhone 17 Air','Front kamera','original',1991,659,2850,45),
  ('iPhone 17 Air','Front kamera','aftermarket',734,765,1699,45),
  ('iPhone 17 Pro','Front kamera','original',1991,659,2850,45),
  ('iPhone 17 Pro','Front kamera','aftermarket',744,755,1699,45),
  ('iPhone 17 Pro Max','Front kamera','original',1991,659,2850,45),
  ('iPhone 17 Pro Max','Front kamera','aftermarket',744,755,1699,45),
  ('iPhone 12','Batteribytte','original',432,667,1299,40),
  ('iPhone 12','Batteribytte','aftermarket',211,488,899,40),
  ('iPhone 12 mini','Batteribytte','original',432,667,1299,40),
  ('iPhone 12 mini','Batteribytte','aftermarket',163,536,899,40),
  ('iPhone 12 Pro','Batteribytte','original',432,667,1299,40),
  ('iPhone 12 Pro','Batteribytte','aftermarket',211,488,899,40),
  ('iPhone 12 Pro Max','Batteribytte','original',432,667,1299,40),
  ('iPhone 12 Pro Max','Batteribytte','aftermarket',244,555,999,40),
  ('iPhone 13','Batteribytte','original',432,667,1299,40),
  ('iPhone 13','Batteribytte','aftermarket',203,496,899,40),
  ('iPhone 13 mini','Batteribytte','original',432,667,1299,40),
  ('iPhone 13 mini','Batteribytte','aftermarket',172,527,899,40),
  ('iPhone 13 Pro','Batteribytte','original',432,667,1299,40),
  ('iPhone 13 Pro','Batteribytte','aftermarket',287,512,999,40),
  ('iPhone 13 Pro Max','Batteribytte','original',432,667,1299,40),
  ('iPhone 13 Pro Max','Batteribytte','aftermarket',312,487,999,40),
  ('iPhone 14','Batteribytte','original',485,714,1399,40),
  ('iPhone 14','Batteribytte','aftermarket',183,516,899,40),
  ('iPhone 14 Plus','Batteribytte','original',485,714,1399,40),
  ('iPhone 14 Plus','Batteribytte','aftermarket',378,521,1099,40),
  ('iPhone 14 Pro','Batteribytte','original',485,714,1399,40),
  ('iPhone 14 Pro','Batteribytte','aftermarket',283,516,999,40),
  ('iPhone 14 Pro Max','Batteribytte','original',485,714,1399,40),
  ('iPhone 14 Pro Max','Batteribytte','aftermarket',416,583,1199,40),
  ('iPhone 15','Batteribytte','original',485,714,1399,40),
  ('iPhone 15','Batteribytte','aftermarket',207,492,899,40),
  ('iPhone 15 Plus','Batteribytte','original',485,714,1399,40),
  ('iPhone 15 Plus','Batteribytte','aftermarket',323,576,1099,40),
  ('iPhone 15 Pro','Batteribytte','original',485,714,1399,40),
  ('iPhone 15 Pro','Batteribytte','aftermarket',233,566,999,40),
  ('iPhone 15 Pro Max','Batteribytte','original',485,714,1399,40),
  ('iPhone 15 Pro Max','Batteribytte','aftermarket',248,551,999,40),
  ('iPhone 16','Batteribytte','original',485,714,1399,40),
  ('iPhone 16','Batteribytte','aftermarket',342,557,1099,40),
  ('iPhone 16 Plus','Batteribytte','original',485,714,1399,40),
  ('iPhone 16 Plus','Batteribytte','aftermarket',482,517,1199,40),
  ('iPhone 16 Pro','Batteribytte','original',591,808,1599,40),
  ('iPhone 16 Pro','Batteribytte','aftermarket',342,557,1099,40),
  ('iPhone 16 Pro Max','Batteribytte','original',591,808,1599,40),
  ('iPhone 16 Pro Max','Batteribytte','aftermarket',520,579,1299,40),
  ('iPhone 16e','Batteribytte','original',485,714,1399,40),
  ('iPhone 17','Batteribytte','original',485,714,1399,40),
  ('iPhone 17 Air','Batteribytte','original',591,808,1599,40),
  ('iPhone 17 Pro','Batteribytte','original',591,808,1599,40),
  ('iPhone 17 Pro Max','Batteribytte','original',591,808,1599,40),
  ('iPhone 12','Ladeport','original',101,699,1000,50),
  ('iPhone 12 mini','Ladeport','original',94,706,1000,50),
  ('iPhone 12 Pro','Ladeport','original',101,699,1000,50),
  ('iPhone 12 Pro Max','Ladeport','original',160,690,1050,50),
  ('iPhone 13','Ladeport','original',115,735,1050,50),
  ('iPhone 13 mini','Ladeport','original',130,720,1050,50),
  ('iPhone 13 Pro','Ladeport','original',169,731,1100,50),
  ('iPhone 13 Pro Max','Ladeport','original',153,697,1050,50),
  ('iPhone 14','Ladeport','original',118,732,1050,50),
  ('iPhone 14 Plus','Ladeport','original',119,731,1050,50),
  ('iPhone 14 Pro','Ladeport','original',221,729,1150,50),
  ('iPhone 14 Pro Max','Ladeport','original',264,736,1200,50),
  ('iPhone 15','Ladeport','original',124,726,1050,50),
  ('iPhone 15 Plus','Ladeport','original',175,725,1100,50),
  ('iPhone 15 Pro','Ladeport','original',166,734,1100,50),
  ('iPhone 15 Pro Max','Ladeport','original',175,725,1100,50),
  ('iPhone 16','Ladeport','original',211,739,1150,50),
  ('iPhone 16 Plus','Ladeport','original',198,702,1100,50),
  ('iPhone 16 Pro','Ladeport','original',174,726,1100,50),
  ('iPhone 16 Pro Max','Ladeport','original',186,714,1100,50),
  ('iPhone 17','Ladeport','original',261,739,1200,50),
  ('iPhone 17 Air','Ladeport','original',324,726,1250,50),
  ('iPhone 17 Pro','Ladeport','original',286,714,1200,50),
  ('iPhone 17 Pro Max','Ladeport','original',566,734,1500,50),
  ('iPhone 12','Loud speaker','original',28,572,800,40),
  ('iPhone 12 mini','Loud speaker','original',184,516,900,40),
  ('iPhone 12 Pro','Loud speaker','original',28,572,800,40),
  ('iPhone 12 Pro Max','Loud speaker','original',90,560,850,40),
  ('iPhone 13','Loud speaker','original',58,592,850,40),
  ('iPhone 13 mini','Loud speaker','original',39,611,850,40),
  ('iPhone 13 Pro','Loud speaker','original',50,650,900,40),
  ('iPhone 13 Pro Max','Loud speaker','original',46,604,850,40),
  ('iPhone 14','Loud speaker','original',49,601,850,40),
  ('iPhone 14 Plus','Loud speaker','original',55,645,900,40),
  ('iPhone 14 Pro','Loud speaker','original',90,660,950,40),
  ('iPhone 14 Pro Max','Loud speaker','original',61,689,950,40),
  ('iPhone 15','Loud speaker','original',75,625,900,40),
  ('iPhone 15 Plus','Loud speaker','original',65,635,900,40),
  ('iPhone 15 Pro','Loud speaker','original',54,646,900,40),
  ('iPhone 15 Pro Max','Loud speaker','original',85,665,950,40),
  ('iPhone 16','Loud speaker','original',149,601,950,40),
  ('iPhone 16 Plus','Loud speaker','original',148,552,900,40),
  ('iPhone 16 Pro','Loud speaker','original',185,615,1000,40),
  ('iPhone 16 Pro Max','Loud speaker','original',201,599,1000,40),
  ('iPhone 16e','Loud speaker','original',64,636,900,40),
  ('iPhone 17','Loud speaker','original',93,607,900,40),
  ('iPhone 17 Air','Loud speaker','original',139,611,950,40),
  ('iPhone 17 Pro','Loud speaker','original',139,611,950,40),
  ('iPhone 17 Pro Max','Loud speaker','original',139,611,950,40),
  ('iPhone 17e','Loud speaker','original',64,636,900,40),
  ('iPhone 14','Bakglass','original',265,585,1050,90),
  ('iPhone 14 Plus','Bakglass','original',260,590,1050,90),
  ('iPhone 15','Bakglass','original',370,630,1200,90),
  ('iPhone 15 Plus','Bakglass','original',500,600,1300,90),
  ('iPhone 15 Pro','Bakglass','original',720,580,1500,90),
  ('iPhone 15 Pro Max','Bakglass','original',725,575,1500,90),
  ('iPhone 16','Bakglass','original',495,605,1300,90),
  ('iPhone 16 Plus','Bakglass','original',633,617,1450,90),
  ('iPhone 16 Pro','Bakglass','original',800,600,1600,90),
  ('iPhone 16 Pro Max','Bakglass','original',848,652,1700,90),
  ('iPhone 16e','Bakglass','original',634,616,1450,90),
  ('iPhone 17','Bakglass','original',923,677,1800,90),
  ('iPhone 17 Air','Bakglass','original',2058,742,3000,90),
  ('iPhone 17 Pro','Bakglass','original',749,601,1550,90),
  ('iPhone 17 Pro Max','Bakglass','original',803,597,1600,90),
  ('iPhone 12','Samtalehøytaler','original',28,572,800,40),
  ('iPhone 12 mini','Samtalehøytaler','original',185,515,900,40),
  ('iPhone 12 Pro','Samtalehøytaler','original',28,572,800,40),
  ('iPhone 12 Pro Max','Samtalehøytaler','original',66,634,900,40),
  ('iPhone 13','Samtalehøytaler','original',65,635,900,40),
  ('iPhone 13 mini','Samtalehøytaler','original',100,600,900,40),
  ('iPhone 13 Pro','Samtalehøytaler','original',88,612,900,40),
  ('iPhone 13 Pro Max','Samtalehøytaler','original',103,597,900,40),
  ('iPhone 14','Samtalehøytaler','original',75,625,900,40),
  ('iPhone 14 Plus','Samtalehøytaler','original',75,625,900,40),
  ('iPhone 14 Pro','Samtalehøytaler','original',38,662,900,40),
  ('iPhone 14 Pro Max','Samtalehøytaler','original',34,666,900,40),
  ('iPhone 15','Samtalehøytaler','original',115,635,950,40),
  ('iPhone 15 Plus','Samtalehøytaler','original',189,611,1000,40),
  ('iPhone 15 Pro','Samtalehøytaler','original',69,631,900,40),
  ('iPhone 15 Pro Max','Samtalehøytaler','original',49,651,900,40),
  ('iPhone 16','Samtalehøytaler','original',144,606,950,40),
  ('iPhone 16 Plus','Samtalehøytaler','original',190,610,1000,40),
  ('iPhone 16 Pro','Samtalehøytaler','original',201,599,1000,40),
  ('iPhone 16 Pro Max','Samtalehøytaler','original',184,616,1000,40),
  ('iPhone 16e','Samtalehøytaler','original',229,621,1050,40),
  ('iPhone 17','Samtalehøytaler','original',93,607,900,40),
  ('iPhone 17 Air','Samtalehøytaler','original',139,611,950,40),
  ('iPhone 17 Pro','Samtalehøytaler','original',124,626,950,40),
  ('iPhone 17 Pro Max','Samtalehøytaler','original',119,631,950,40),
  ('iPhone 17e','Samtalehøytaler','original',229,621,1050,40)
) as v(modell, typ, kvalitet, delekost, arbeidspris, totalpris, tid)
join devices d on d.modellnavn = v.modell
join repair_types rt on rt.navn = v.typ
on conflict (device_id, repair_type_id, kvalitet) do update
  set delekost=excluded.delekost, arbeidspris=excluded.arbeidspris,
      totalpris=excluded.totalpris, estimert_tid_min=excluded.estimert_tid_min;