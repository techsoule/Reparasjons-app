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
