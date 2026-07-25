// =====================================================================
// Fordelingsalgoritme — ren, frittstående modul (ingen avhengigheter)
// Deles mellom Supabase Edge Function (Deno) og appen (React Native).
//
// Mål: jevn fordeling av BÅDE inntjening og arbeidsbelastning.
//  - Rullerende sum siste 30 dager: total_kroner og total_minutter
//  - Normaliser begge til 0–1, score = kroner*0.6 + minutter*0.4
//  - Ny jobb → LAVEST score
//  - Hopp over reparatører markert utilgjengelig på jobbdatoen
//  - Ved lik score: den som lengst tid siden sist fikk jobb
//  - Produser ALLTID en score_snapshot for alle tre (tillitsmekanisme)
// =====================================================================

/** Vekter for scoreberegning (kroner teller mest). */
export const VEKT_KRONER = 0.6;
export const VEKT_MINUTTER = 0.4;

/** Inndata per reparatør ved en tildeling. */
export interface TechnicianInput {
  id: string;
  navn: string;
  /** Aktiv reparatør (inaktive utelates helt). */
  aktiv: boolean;
  /** Rullerende sum kroner (arbeidspris) siste 30 dager. */
  total_kroner: number;
  /** Rullerende sum minutter (estimert tid) siste 30 dager. */
  total_minutter: number;
  /**
   * Tidspunkt reparatøren sist fikk tildelt en jobb (ISO-streng eller ms).
   * Brukes som tie-break: eldst (lengst siden) vinner. `null` = aldri.
   */
  sist_tildelt: string | number | null;
  /** Utilgjengelig på jobbdatoen (fri/ferie/sykdom). */
  utilgjengelig: boolean;
}

/** Én rad i score_snapshot — forklarer tildelingen i ettertid. */
export interface ScoreSnapshotRad {
  technician_id: string;
  navn: string;
  total_kroner: number;
  total_minutter: number;
  norm_kroner: number;
  norm_minutter: number;
  score: number;
  utilgjengelig: boolean;
  aktiv: boolean;
  /** Kvalifisert kandidat for denne jobben (aktiv + tilgjengelig). */
  kvalifisert: boolean;
  sist_tildelt: string | number | null;
}

/** Resultat av en tildeling. */
export interface AllocationResult {
  /** Valgt reparatør, eller null hvis ingen kvalifiserer. */
  valgt_technician_id: string | null;
  /** Menneskelig begrunnelse (norsk) — lagres i assignment_log. */
  begrunnelse: string;
  /** Score for ALLE reparatører på tildelingstidspunktet. */
  score_snapshot: ScoreSnapshotRad[];
}

/** Normaliser en verdi til 0–1 gitt maksverdien i utvalget. */
function normaliser(verdi: number, maks: number): number {
  if (maks <= 0) return 0; // alle like (f.eks. alle uten historikk) → 0
  return verdi / maks;
}

function tilMs(t: string | number | null): number | null {
  if (t === null || t === undefined) return null;
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Kjør fordelingsalgoritmen.
 *
 * @param technicians  Alle reparatører med rullerende tall og tilgjengelighet.
 * @returns Valgt reparatør + full score_snapshot + begrunnelse.
 *
 * Merk: normaliseringen baseres på maks blant de KVALIFISERTE kandidatene,
 * slik at en utilgjengelig reparatør med høye tall ikke forskyver skalaen.
 */
export function fordelJobb(technicians: TechnicianInput[]): AllocationResult {
  const aktive = technicians.filter((t) => t.aktiv);
  const kvalifiserte = aktive.filter((t) => !t.utilgjengelig);

  // Maks blant kvalifiserte (for normalisering)
  const maksKroner = kvalifiserte.reduce((m, t) => Math.max(m, t.total_kroner), 0);
  const maksMinutter = kvalifiserte.reduce((m, t) => Math.max(m, t.total_minutter), 0);

  // Bygg snapshot for ALLE (også inaktive/utilgjengelige — full åpenhet)
  const snapshot: ScoreSnapshotRad[] = technicians.map((t) => {
    const kvalifisert = t.aktiv && !t.utilgjengelig;
    const normK = normaliser(t.total_kroner, maksKroner);
    const normM = normaliser(t.total_minutter, maksMinutter);
    const score = normK * VEKT_KRONER + normM * VEKT_MINUTTER;
    return {
      technician_id: t.id,
      navn: t.navn,
      total_kroner: t.total_kroner,
      total_minutter: t.total_minutter,
      norm_kroner: normK,
      norm_minutter: normM,
      score,
      utilgjengelig: t.utilgjengelig,
      aktiv: t.aktiv,
      kvalifisert,
      sist_tildelt: t.sist_tildelt,
    };
  });

  const kandidater = snapshot.filter((s) => s.kvalifisert);

  if (kandidater.length === 0) {
    return {
      valgt_technician_id: null,
      begrunnelse:
        'Ingen kvalifiserte reparatører: alle er enten inaktive eller ' +
        'utilgjengelige på jobbdatoen. Jobben må tildeles manuelt.',
      score_snapshot: snapshot,
    };
  }

  // Sorter: lavest score først; ved lik score eldst sist_tildelt først;
  // deterministisk fallback på id for full forutsigbarhet.
  const EPS = 1e-9;
  const sortert = [...kandidater].sort((a, b) => {
    if (Math.abs(a.score - b.score) > EPS) return a.score - b.score;

    const am = tilMs(a.sist_tildelt);
    const bm = tilMs(b.sist_tildelt);
    // null (aldri fått jobb) regnes som "lengst siden" → høyest prioritet
    if (am === null && bm !== null) return -1;
    if (bm === null && am !== null) return 1;
    if (am !== null && bm !== null && am !== bm) return am - bm;

    return a.technician_id < b.technician_id ? -1 : 1;
  });

  const vinner = sortert[0];

  // Bygg begrunnelse
  const scoreListe = [...kandidater]
    .sort((a, b) => a.score - b.score)
    .map((s) => `${s.navn}: ${s.score.toFixed(3)}`)
    .join(', ');

  let begrunnelse =
    `Tildelt ${vinner.navn} (lavest score ${vinner.score.toFixed(3)}). ` +
    `Score for kvalifiserte: ${scoreListe}.`;

  // Nevn tie-break hvis relevant
  const likeScorer = kandidater.filter(
    (s) => Math.abs(s.score - vinner.score) <= EPS
  );
  if (likeScorer.length > 1) {
    begrunnelse +=
      ` Lik score mellom ${likeScorer.map((s) => s.navn).join(', ')} — ` +
      `valgte den som lengst tid siden sist fikk jobb.`;
  }

  return {
    valgt_technician_id: vinner.technician_id,
    begrunnelse,
    score_snapshot: snapshot,
  };
}

/**
 * Hvem står for tur på NESTE innkommende booking (uten å tildele).
 * Brukes i Fordeling-skjermen. Antar ingen utilgjengelighet med mindre
 * `utilgjengelig` er satt.
 */
export function nesteForTur(technicians: TechnicianInput[]): ScoreSnapshotRad | null {
  const res = fordelJobb(technicians);
  if (!res.valgt_technician_id) return null;
  return (
    res.score_snapshot.find((s) => s.technician_id === res.valgt_technician_id) ??
    null
  );
}
