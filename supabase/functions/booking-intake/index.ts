// =====================================================================
// Edge Function: booking-intake
// Tar imot bookinger fra fixiphone-skjemaet, validerer, fordeler jobb,
// logger, varsler og sender e-post. Returnerer ordrenummer.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendKundeBekreftelse, sendVerkstedVarsel } from '../_shared/email.ts';
import { sendPush } from '../_shared/push.ts';
import {
  fordelJobb,
  type TechnicianInput,
} from '../../../shared/allocation/allocation.ts';
import {
  validerEpost,
  validerTelefon,
  normaliserTelefon,
  harInnhold,
} from '../../../shared/validation/validation.ts';

// Spam-beskyttelse: maks innsendinger per IP innenfor vinduet
const RATE_MAKS = 8;
const RATE_VINDU_MIN = 60;

interface BookingBody {
  navn?: string;
  telefon?: string;
  epost?: string;
  modell?: string;
  feiltype?: string | string[];
  feiltyper?: string[];
  onsket_tidspunkt?: string;
  kommentar?: string;
  firma?: string; // honeypot — skal alltid være tom
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, feil: 'Kun POST er tillatt' }, 405, origin);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let body: BookingBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, feil: 'Ugyldig JSON' }, 400, origin);
    }

    // --- Honeypot: fylt ut = bot. Later som alt gikk bra. ---
    if (harInnhold(body.firma)) {
      return jsonResponse({ ok: true, ordrenummer: null }, 200, origin);
    }

    // --- Rate limit per IP ---
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'ukjent';
    const siden = new Date(Date.now() - RATE_VINDU_MIN * 60_000).toISOString();
    await admin.from('booking_rate_limit').delete().lt('tidspunkt', siden);
    const { count } = await admin
      .from('booking_rate_limit')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('tidspunkt', siden);
    if ((count ?? 0) >= RATE_MAKS) {
      return jsonResponse(
        { ok: false, feil: 'For mange forsøk. Prøv igjen om litt.' },
        429,
        origin,
      );
    }
    await admin.from('booking_rate_limit').insert({ ip });

    // --- Normaliser feiltyper til array ---
    const feiltyper: string[] = Array.isArray(body.feiltyper)
      ? body.feiltyper
      : Array.isArray(body.feiltype)
        ? body.feiltype
        : harInnhold(body.feiltype)
          ? [body.feiltype as string]
          : [];

    // --- Validering ---
    const feil: string[] = [];
    if (!harInnhold(body.navn)) feil.push('Navn mangler');
    if (!harInnhold(body.telefon)) feil.push('Telefonnummer mangler');
    else if (!validerTelefon(body.telefon!)) feil.push('Ugyldig norsk telefonnummer');
    if (!harInnhold(body.epost)) feil.push('E-post mangler');
    else if (!validerEpost(body.epost!)) feil.push('Ugyldig e-postadresse');
    if (!harInnhold(body.modell)) feil.push('Modell mangler');
    if (feiltyper.length === 0) feil.push('Velg minst én feiltype');
    if (!harInnhold(body.onsket_tidspunkt)) feil.push('Ønsket tidspunkt mangler');

    if (feil.length > 0) {
      return jsonResponse(
        { ok: false, feil: 'Ufullstendig innsending', detaljer: feil },
        400,
        origin,
      );
    }

    const navn = body.navn!.trim();
    const telefon = normaliserTelefon(body.telefon!)!;
    const epost = body.epost!.trim();
    const modell = body.modell!.trim();
    const kommentarInn = harInnhold(body.kommentar) ? body.kommentar!.trim() : null;

    // Ønsket tidspunkt: forsøk å tolke som dato/tid, ellers behold som tekst
    let onsketISO: string | null = null;
    let onsketTekst = body.onsket_tidspunkt!.trim();
    const parsed = Date.parse(onsketTekst);
    if (!Number.isNaN(parsed)) onsketISO = new Date(parsed).toISOString();

    // --- Slå opp modell ---
    const { data: device } = await admin
      .from('devices')
      .select('id, modellnavn')
      .ilike('modellnavn', modell)
      .maybeSingle();
    if (!device) {
      return jsonResponse(
        { ok: false, feil: `Ukjent modell: ${modell}` },
        400,
        origin,
      );
    }

    // --- Slå opp feiltyper + priser ---
    const { data: rtRows } = await admin
      .from('repair_types')
      .select('id, navn')
      .in('navn', feiltyper);
    const funnetNavn = new Set((rtRows ?? []).map((r) => r.navn));
    const mangler = feiltyper.filter((f) => !funnetNavn.has(f));
    if (mangler.length > 0) {
      return jsonResponse(
        { ok: false, feil: `Ukjent feiltype: ${mangler.join(', ')}` },
        400,
        origin,
      );
    }
    const repairTypeIds = (rtRows ?? []).map((r) => r.id);

    const { data: prisRows } = await admin
      .from('prices')
      .select('delekost, arbeidspris, estimert_tid_min, repair_type_id')
      .eq('device_id', device.id)
      .in('repair_type_id', repairTypeIds);

    let delekost = 0;
    let arbeidspris = 0;
    let estimertTid = 0;
    for (const p of prisRows ?? []) {
      delekost += Number(p.delekost);
      arbeidspris += Number(p.arbeidspris);
      estimertTid += Number(p.estimert_tid_min);
    }

    // --- Opprett jobb ---
    const { data: job, error: jobErr } = await admin
      .from('jobs')
      .insert({
        kunde_navn: navn,
        telefon,
        epost,
        device_id: device.id,
        repair_type_ids: repairTypeIds,
        onsket_tidspunkt: onsketISO,
        delekost,
        arbeidspris,
        estimert_tid_min: estimertTid,
        status: 'mottatt',
        kommentar: onsketISO ? kommentarInn : joinKommentar(kommentarInn, onsketTekst),
      })
      .select('id, ordrenummer, totalpris')
      .single();
    if (jobErr || !job) {
      console.error('Feil ved opprettelse av jobb', jobErr);
      return jsonResponse(
        { ok: false, feil: 'Kunne ikke opprette bestilling' },
        500,
        origin,
      );
    }

    // --- Fordeling ---
    const jobbdato = (onsketISO ?? new Date().toISOString()).slice(0, 10);
    const { data: fordelingsdata } = await admin.rpc('hent_fordelingsdata', {
      jobbdato,
    });

    const techInput: TechnicianInput[] = (fordelingsdata ?? []).map(
      (t: Record<string, unknown>) => ({
        id: t.id as string,
        navn: t.navn as string,
        aktiv: t.aktiv as boolean,
        total_kroner: Number(t.total_kroner),
        total_minutter: Number(t.total_minutter),
        sist_tildelt: (t.sist_tildelt as string) ?? null,
        utilgjengelig: t.utilgjengelig as boolean,
      }),
    );

    const resultat = fordelJobb(techInput);
    const valgtId = resultat.valgt_technician_id;

    // Oppdater jobb med tildelt reparatør
    if (valgtId) {
      await admin.from('jobs').update({ technician_id: valgtId }).eq('id', job.id);
    }

    // Logg ALLTID til assignment_log (også når ingen ble valgt)
    await admin.from('assignment_log').insert({
      job_id: job.id,
      technician_id: valgtId,
      begrunnelse: resultat.begrunnelse,
      score_snapshot: resultat.score_snapshot,
      er_omfordeling: false,
      utfort_av: null,
    });

    // Opprett earnings for tildelt reparatør
    let tildeltNavn: string | null = null;
    let pushToken: string | null = null;
    if (valgtId) {
      const { data: tech } = await admin
        .from('technicians')
        .select('navn, provisjon_prosent, push_token')
        .eq('id', valgtId)
        .single();
      tildeltNavn = tech?.navn ?? null;
      pushToken = tech?.push_token ?? null;
      // Reparatøren beholder hele arbeidsmarginen (arbeidspris)
      const belop = Math.round(arbeidspris * 100) / 100;
      await admin.from('earnings').insert({
        job_id: job.id,
        technician_id: valgtId,
        belop,
        periode: new Date().toISOString().slice(0, 7),
      });

      // In-app varsel
      await admin.from('notifications').insert({
        technician_id: valgtId,
        type: 'ny_jobb',
        tittel: 'Ny jobb tildelt',
        melding: `Ordre ${job.ordrenummer} – ${navn} (${modell})`,
        job_id: job.id,
      });
    }

    // --- Push (ikke-fatal) ---
    await sendPush(
      pushToken,
      'Ny jobb tildelt',
      `Ordre ${job.ordrenummer} – ${navn} (${modell})`,
      { job_id: job.id, ordrenummer: job.ordrenummer },
    );

    // --- E-post (ikke-fatal) ---
    const kvittering = {
      ordrenummer: job.ordrenummer,
      kunde_navn: navn,
      modell,
      feiltyper,
      onsket_tidspunkt: onsketTekst,
      totalpris: Number(job.totalpris),
      telefon,
      epost,
      kommentar: kommentarInn,
    };
    try {
      await Promise.all([
        sendKundeBekreftelse(kvittering),
        sendVerkstedVarsel(kvittering, tildeltNavn),
      ]);
    } catch (e) {
      console.error('E-post feilet (bookingen er lagret)', e);
    }

    return jsonResponse(
      { ok: true, ordrenummer: job.ordrenummer },
      200,
      origin,
    );
  } catch (e) {
    console.error('Uventet feil i booking-intake', e);
    return jsonResponse(
      { ok: false, feil: 'Noe gikk galt. Prøv igjen senere.' },
      500,
      origin,
    );
  }
});

function joinKommentar(kommentar: string | null, ekstra: string): string {
  const deler = [];
  if (kommentar) deler.push(kommentar);
  deler.push(`Ønsket tidspunkt (fritekst): ${ekstra}`);
  return deler.join('\n');
}
