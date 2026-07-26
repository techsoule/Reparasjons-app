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
