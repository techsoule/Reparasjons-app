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
