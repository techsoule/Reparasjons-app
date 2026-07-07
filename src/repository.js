// Forretningslogikk oppå datalageret: teknikere, reparasjoner og fordeling.

import { getState, save, nextId, nextTicket } from './store.js';
import { distribute, PRIORITIES } from './distribution.js';

export const STATUSES = ['mottatt', 'tildelt', 'under_arbeid', 'ferdig', 'levert'];
export const CATEGORIES = ['iPhone', 'Samsung', 'iPad', 'Android', 'Laptop', 'Nettbrett', 'Annet'];

// Statuser som teller som "aktiv arbeidsmengde" for en tekniker.
const ACTIVE_STATUSES = new Set(['tildelt', 'under_arbeid']);

// ---------- Teknikere ----------

export function listTechnicians() {
  return getState().technicians;
}

export function createTechnician({ name, specialties = [], capacity = 5, active = true }) {
  if (!name || !name.trim()) throw badRequest('Navn er påkrevd');
  return save((s) => {
    const tech = {
      id: nextId('technician'),
      name: name.trim(),
      specialties: Array.isArray(specialties) ? specialties : [],
      capacity: Number(capacity) > 0 ? Number(capacity) : 5,
      active: Boolean(active),
      createdAt: new Date().toISOString(),
    };
    s.technicians.push(tech);
    return tech;
  });
}

export function updateTechnician(id, patch) {
  return save((s) => {
    const tech = s.technicians.find((t) => t.id === Number(id));
    if (!tech) throw notFound('Tekniker finnes ikke');
    if (patch.name != null) tech.name = String(patch.name).trim() || tech.name;
    if (patch.specialties != null) tech.specialties = Array.isArray(patch.specialties) ? patch.specialties : tech.specialties;
    if (patch.capacity != null && Number(patch.capacity) > 0) tech.capacity = Number(patch.capacity);
    if (patch.active != null) tech.active = Boolean(patch.active);
    return tech;
  });
}

export function deleteTechnician(id) {
  return save((s) => {
    const idx = s.technicians.findIndex((t) => t.id === Number(id));
    if (idx === -1) throw notFound('Tekniker finnes ikke');
    // Løsne evt. tildelte reparasjoner og sett dem tilbake til "mottatt".
    for (const r of s.repairs) {
      if (r.technicianId === Number(id) && ACTIVE_STATUSES.has(r.status)) {
        r.technicianId = null;
        r.status = 'mottatt';
        r.updatedAt = new Date().toISOString();
      } else if (r.technicianId === Number(id)) {
        r.technicianId = null;
      }
    }
    s.technicians.splice(idx, 1);
    return { ok: true };
  });
}

// ---------- Reparasjoner ----------

export function listRepairs() {
  return getState().repairs;
}

export function createRepair(data) {
  const { customerName, phone = '', device = '', problem = '', category = 'Annet', priority = 'normal' } = data;
  if (!customerName || !customerName.trim()) throw badRequest('Kundenavn er påkrevd');
  if (!PRIORITIES.includes(priority)) throw badRequest('Ugyldig prioritet');
  if (!CATEGORIES.includes(category)) throw badRequest('Ugyldig kategori');
  return save((s) => {
    const now = new Date().toISOString();
    const repair = {
      id: nextId('repair'),
      ticket: nextTicket(),
      customerName: customerName.trim(),
      phone: String(phone).trim(),
      device: String(device).trim(),
      problem: String(problem).trim(),
      category,
      priority,
      status: 'mottatt',
      technicianId: null,
      createdAt: now,
      updatedAt: now,
    };
    s.repairs.push(repair);
    return repair;
  });
}

export function updateRepair(id, patch) {
  return save((s) => {
    const r = s.repairs.find((x) => x.id === Number(id));
    if (!r) throw notFound('Reparasjon finnes ikke');
    if (patch.status != null) {
      if (!STATUSES.includes(patch.status)) throw badRequest('Ugyldig status');
      r.status = patch.status;
    }
    if (patch.technicianId !== undefined) {
      const tid = patch.technicianId == null ? null : Number(patch.technicianId);
      if (tid != null && !s.technicians.some((t) => t.id === tid)) throw badRequest('Ukjent tekniker');
      r.technicianId = tid;
      if (tid != null && r.status === 'mottatt') r.status = 'tildelt';
    }
    for (const f of ['customerName', 'phone', 'device', 'problem']) {
      if (patch[f] != null) r[f] = String(patch[f]).trim();
    }
    if (patch.category != null && CATEGORIES.includes(patch.category)) r.category = patch.category;
    if (patch.priority != null && PRIORITIES.includes(patch.priority)) r.priority = patch.priority;
    r.updatedAt = new Date().toISOString();
    return r;
  });
}

export function deleteRepair(id) {
  return save((s) => {
    const idx = s.repairs.findIndex((x) => x.id === Number(id));
    if (idx === -1) throw notFound('Reparasjon finnes ikke');
    s.repairs.splice(idx, 1);
    return { ok: true };
  });
}

// ---------- Fordeling ----------

export function currentLoads(state = getState()) {
  const loads = {};
  for (const r of state.repairs) {
    if (r.technicianId != null && ACTIVE_STATUSES.has(r.status)) {
      loads[r.technicianId] = (loads[r.technicianId] || 0) + 1;
    }
  }
  return loads;
}

/** Fordel alle ufordelte reparasjoner (status "mottatt", uten tekniker). */
export function distributeUnassigned() {
  return save((s) => {
    const pending = s.repairs.filter((r) => r.status === 'mottatt' && r.technicianId == null);
    const { assignments, unassigned } = distribute(pending, s.technicians, currentLoads(s));
    const now = new Date().toISOString();
    for (const { repairId, technicianId } of assignments) {
      const r = s.repairs.find((x) => x.id === repairId);
      r.technicianId = technicianId;
      r.status = 'tildelt';
      r.updatedAt = now;
    }
    return { assigned: assignments.length, unassigned: unassigned.length };
  });
}

// ---------- Statistikk ----------

export function stats() {
  const s = getState();
  const byStatus = Object.fromEntries(STATUSES.map((st) => [st, 0]));
  for (const r of s.repairs) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const loads = currentLoads(s);
  return {
    total: s.repairs.length,
    byStatus,
    technicians: s.technicians.length,
    activeTechnicians: s.technicians.filter((t) => t.active).length,
    unassigned: s.repairs.filter((r) => r.status === 'mottatt' && r.technicianId == null).length,
    loads,
  };
}

// ---------- Feilhjelpere ----------

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
function notFound(message) {
  const e = new Error(message);
  e.status = 404;
  return e;
}
