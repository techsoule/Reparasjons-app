import { supabase } from './supabase';
import type {
  Job,
  Technician,
  Device,
  RepairType,
  Earning,
  Notification,
  Availability,
} from './types';

export async function hentJobber(): Promise<Job[]> {
  const { data } = await supabase
    .from('jobs')
    .select('*, device:devices(*)')
    .order('opprettet', { ascending: false });
  return (data as Job[]) ?? [];
}

export async function hentJobb(id: string): Promise<Job | null> {
  const { data } = await supabase
    .from('jobs')
    .select('*, device:devices(*)')
    .eq('id', id)
    .maybeSingle();
  return (data as Job) ?? null;
}

export async function hentTeknikere(): Promise<Technician[]> {
  const { data } = await supabase
    .from('technicians')
    .select('*')
    .order('navn');
  return (data as Technician[]) ?? [];
}

export async function hentReparatorer(): Promise<Technician[]> {
  const { data } = await supabase
    .from('technicians')
    .select('*')
    .eq('rolle', 'reparatør')
    .eq('aktiv', true)
    .order('navn');
  return (data as Technician[]) ?? [];
}

export async function hentDevices(): Promise<Device[]> {
  const { data } = await supabase.from('devices').select('*').order('sortering');
  return (data as Device[]) ?? [];
}

export async function hentRepairTypes(): Promise<RepairType[]> {
  const { data } = await supabase.from('repair_types').select('*').order('navn');
  return (data as RepairType[]) ?? [];
}

export async function hentMineEarnings(techId: string): Promise<Earning[]> {
  const { data } = await supabase
    .from('earnings')
    .select('*')
    .eq('technician_id', techId)
    .order('opprettet', { ascending: false });
  return (data as Earning[]) ?? [];
}

export async function hentAlleEarnings(): Promise<Earning[]> {
  const { data } = await supabase.from('earnings').select('*');
  return (data as Earning[]) ?? [];
}

export async function hentVarsler(techId: string): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('technician_id', techId)
    .order('opprettet', { ascending: false })
    .limit(100);
  return (data as Notification[]) ?? [];
}

export async function hentTilgjengelighet(
  techId: string,
): Promise<Availability[]> {
  const { data } = await supabase
    .from('availability')
    .select('*')
    .eq('technician_id', techId)
    .order('dato_fra', { ascending: false });
  return (data as Availability[]) ?? [];
}

/** Bygg oppslag repair_type_id → navn og id → navn for teknikere. */
export function lagOppslag<T extends { id: string }>(
  rader: T[],
  felt: keyof T,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rader) m[r.id] = String(r[felt]);
  return m;
}
