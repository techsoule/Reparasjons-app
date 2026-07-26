// =====================================================================
// Inntjening + aggregeringer for Fordeling-skjermen. Ren, testbar logikk.
// =====================================================================

/**
 * Reparatørens fortjeneste = hele arbeidsmarginen (det kunden betaler minus
 * det delen koster). Siden totalpris = delekost + arbeidspris, er marginen
 * lik arbeidspris. Delekost holdes utenfor.
 */
export function fortjeneste(arbeidspris: number): number {
  return Math.round(Number(arbeidspris ?? 0) * 100) / 100;
}

export interface JobbForStat {
  technician_id: string | null;
  arbeidspris: number;
  estimert_tid_min: number;
}

export interface TeknikerStat {
  technician_id: string;
  navn: string;
  antall_jobber: number;
  minutter: number;
  kroner: number; // fortjeneste (arbeidsmargin)
}

/** Aggreger jobber per reparatør for søylevisningen. */
export function aggregerStatistikk(
  teknikere: { id: string; navn: string }[],
  jobber: JobbForStat[],
): TeknikerStat[] {
  const stat = new Map<string, TeknikerStat>();
  for (const t of teknikere) {
    stat.set(t.id, {
      technician_id: t.id,
      navn: t.navn,
      antall_jobber: 0,
      minutter: 0,
      kroner: 0,
    });
  }
  for (const j of jobber) {
    if (!j.technician_id) continue;
    const s = stat.get(j.technician_id);
    if (!s) continue;
    s.antall_jobber += 1;
    s.minutter += Number(j.estimert_tid_min ?? 0);
    s.kroner += fortjeneste(Number(j.arbeidspris ?? 0));
  }
  return teknikere.map((t) => stat.get(t.id)!);
}

/** Sum utbetalt/ubetalt fra earnings-rader. */
export function summerInntjening(
  earnings: { belop: number; utbetalt: boolean }[],
): { utbetalt: number; ubetalt: number; total: number } {
  let utbetalt = 0;
  let ubetalt = 0;
  for (const e of earnings) {
    if (e.utbetalt) utbetalt += Number(e.belop);
    else ubetalt += Number(e.belop);
  }
  return {
    utbetalt: Math.round(utbetalt * 100) / 100,
    ubetalt: Math.round(ubetalt * 100) / 100,
    total: Math.round((utbetalt + ubetalt) * 100) / 100,
  };
}
