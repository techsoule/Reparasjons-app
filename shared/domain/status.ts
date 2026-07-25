// =====================================================================
// Statusflyt for en jobb — delt mellom app og backend.
// Mottatt → Bekreftet → Under arbeid → Venter på deler → Ferdig → Hentet
// =====================================================================

export type JobStatus =
  | 'mottatt'
  | 'bekreftet'
  | 'under_arbeid'
  | 'venter_pa_deler'
  | 'ferdig'
  | 'hentet';

/** Rekkefølgen i statusflyten. */
export const STATUS_FLYT: JobStatus[] = [
  'mottatt',
  'bekreftet',
  'under_arbeid',
  'venter_pa_deler',
  'ferdig',
  'hentet',
];

/** Norsk visningstekst per status. */
export const STATUS_TEKST: Record<JobStatus, string> = {
  mottatt: 'Mottatt',
  bekreftet: 'Bekreftet',
  under_arbeid: 'Under arbeid',
  venter_pa_deler: 'Venter på deler',
  ferdig: 'Ferdig',
  hentet: 'Hentet',
};

/** Farge per status (til badges). */
export const STATUS_FARGE: Record<JobStatus, string> = {
  mottatt: '#8a8a8a',
  bekreftet: '#2b7de9',
  under_arbeid: '#e98b2b',
  venter_pa_deler: '#c9a227',
  ferdig: '#2e9e5b',
  hentet: '#1a1a1a',
};

/** True hvis jobben regnes som fullført (Ferdig eller Hentet). */
export function erFullfort(status: JobStatus): boolean {
  return status === 'ferdig' || status === 'hentet';
}

/** Neste status i flyten, eller null hvis siste. */
export function nesteStatus(status: JobStatus): JobStatus | null {
  const i = STATUS_FLYT.indexOf(status);
  if (i < 0 || i >= STATUS_FLYT.length - 1) return null;
  return STATUS_FLYT[i + 1];
}

/** Forrige status i flyten, eller null hvis første. */
export function forrigeStatus(status: JobStatus): JobStatus | null {
  const i = STATUS_FLYT.indexOf(status);
  if (i <= 0) return null;
  return STATUS_FLYT[i - 1];
}
