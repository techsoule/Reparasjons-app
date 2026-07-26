-- =====================================================================
-- Koble innloggingene (auth.users) til reparatør-profiler.
-- Kjør ETTER at de tre brukerne er opprettet i Authentication → Users.
-- Alle tre gjør reparasjoner (rolle 'reparatør'); Andreas har i tillegg
-- admin-rettigheter (er_admin = true).
-- =====================================================================

insert into technicians (id, navn, epost, provisjon_prosent, rolle, er_admin, aktiv)
select u.id, v.navn, v.epost, v.provisjon, 'reparatør'::user_rolle, v.er_admin, true
from (values
  ('jonas.ostrem09@gmail.com',   'Jonas Østrem',          40, false),
  ('andreasodland09@icloud.com', 'Andreas Odland',        40, true),
  ('felix.brandsdal1@gmail.com', 'Felix Øgrey Brandsdal', 40, false)
) as v(epost, navn, provisjon, er_admin)
join auth.users u on lower(u.email) = lower(v.epost)
on conflict (id) do update
  set navn = excluded.navn,
      epost = excluded.epost,
      provisjon_prosent = excluded.provisjon_prosent,
      rolle = excluded.rolle,
      er_admin = excluded.er_admin,
      aktiv = true;
