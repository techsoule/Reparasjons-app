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

-- ---------------------------------------------------------------------
-- REPARATØRER (utviklings-seed)
-- ---------------------------------------------------------------------
-- MERK: I ekte Supabase opprettes brukere via Auth (dashboard eller
-- admin-API) slik at passord h-ashes riktig. Under er en LOKAL dev-seed
-- som oppretter tre reparatører + admin med faste UUID-er. auth.users-
-- innsettingen fungerer lokalt; i sky opprettes brukeren først, deretter
-- kobles technicians-raden med samme id.

do $$
declare
  has_auth boolean;
begin
  select exists(select 1 from information_schema.tables
                where table_schema='auth' and table_name='users') into has_auth;
  if has_auth then
    insert into auth.users (id, email)
    values
      ('a0000000-0000-0000-0000-000000000001', 'admin@fixiphone.no'),
      ('a0000000-0000-0000-0000-000000000002', 'jonas@fixiphone.no'),
      ('a0000000-0000-0000-0000-000000000003', 'sara@fixiphone.no'),
      ('a0000000-0000-0000-0000-000000000004', 'mikkel@fixiphone.no')
    on conflict (id) do nothing;
  end if;
end $$;

insert into technicians (id, navn, epost, provisjon_prosent, rolle, aktiv) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin',  'admin@fixiphone.no',  40, 'admin',     true),
  ('a0000000-0000-0000-0000-000000000002', 'Jonas',  'jonas@fixiphone.no',  40, 'reparatør', true),
  ('a0000000-0000-0000-0000-000000000003', 'Sara',   'sara@fixiphone.no',   40, 'reparatør', true),
  ('a0000000-0000-0000-0000-000000000004', 'Mikkel', 'mikkel@fixiphone.no', 40, 'reparatør', true)
on conflict (id) do update set navn = excluded.navn;
