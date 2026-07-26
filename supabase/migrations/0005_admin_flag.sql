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
