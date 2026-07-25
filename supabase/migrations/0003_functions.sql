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
