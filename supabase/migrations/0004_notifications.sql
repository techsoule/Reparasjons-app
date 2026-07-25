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
