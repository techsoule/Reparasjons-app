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
