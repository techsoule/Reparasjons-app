import type { JobStatus } from '@shared/domain/status';

export type Rolle = 'reparatør' | 'admin';

export interface Technician {
  id: string;
  navn: string;
  epost: string;
  provisjon_prosent: number;
  rolle: Rolle;
  er_admin: boolean;
  aktiv: boolean;
  push_token: string | null;
}

export interface Device {
  id: string;
  modellnavn: string;
  sortering: number;
}

export interface RepairType {
  id: string;
  navn: string;
}

export interface Job {
  id: string;
  ordrenummer: string;
  kunde_navn: string;
  telefon: string;
  epost: string;
  device_id: string | null;
  repair_type_ids: string[];
  onsket_tidspunkt: string | null;
  bekreftet_tidspunkt: string | null;
  delekost: number;
  arbeidspris: number;
  totalpris: number;
  estimert_tid_min: number;
  technician_id: string | null;
  status: JobStatus;
  notat: string | null;
  kommentar: string | null;
  opprettet: string;
  fullfort: string | null;
  // Innebygd (join) ved henting:
  device?: Device | null;
}

export interface Earning {
  id: string;
  job_id: string;
  technician_id: string;
  belop: number;
  utbetalt: boolean;
  periode: string | null;
  opprettet: string;
}

export type VarselType =
  | 'ny_jobb'
  | 'jobb_omfordelt'
  | 'status_endret'
  | 'omfordeling_foresporsel';

export interface Notification {
  id: string;
  technician_id: string;
  type: VarselType;
  tittel: string;
  melding: string;
  job_id: string | null;
  lest: boolean;
  opprettet: string;
}

export type AvailabilityType = 'fri' | 'ferie' | 'sykdom';

export interface Availability {
  id: string;
  technician_id: string;
  dato_fra: string;
  dato_til: string;
  type: AvailabilityType;
  notat: string | null;
}

export interface AssignmentLog {
  id: string;
  job_id: string;
  technician_id: string | null;
  begrunnelse: string;
  score_snapshot: unknown;
  er_omfordeling: boolean;
  utfort_av: string | null;
  tidspunkt: string;
}
