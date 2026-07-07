// Forretningslogikk oppå datalageret: teknikere, reparasjoner, fordeling,
// kalenderplanlegging og varsler.

import { EventEmitter } from 'node:events';
import { getState, save, nextId, nextTicket } from './store.js';
import { distribute, PRIORITIES } from './distribution.js';
import { findSlot } from './scheduling.js';

// Varsler: serveren lytter på 'assigned'-hendelser og dytter dem til teknikerne.
export const events = new EventEmitter();

export const STATUSES = ['mottatt', 'tildelt', 'under_arbeid', 'ferdig', 'levert'];
export const CATEGORIES = ['iPhone', 'Samsung', 'iPad', 'Android', 'Laptop', 'Nettbrett', 'Annet'];

// Statuser som teller som "aktiv arbeidsmengde" for en tekniker.
const ACTIVE_STATUSES = new Set(['tildelt', 'under_arbeid']);

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '16:00';
const DEFAULT_DURATION_MIN = 45;

// ---------- Arbeidstid: mandagsregel ----------

function isMonday(d = new Date()) {
  return d.getDay() === 1;
}

/** Førstkommende mandag kl. 00:00 (alltid frem i tid). */
export function nextMondayISO(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

/** Aktiver ventende arbeidstid-endringer som har passert sin mandag. */
function applyDueWindows() {
  const due = getState().technicians.some(
    (t) => t.nextWindow && new Date(t.nextWindow.effectiveFrom) <= new Date()
  );
  if (!due) return;
  save((s) => {
    for (const t of s.technicians) {
      if (t.nextWindow && new Date(t.nextWindow.effectiveFrom) <= new Date()) {
        t.workStart = t.nextWindow.workStart;
        t.workEnd = t.nextWindow.workEnd;
        t.nextWindow = null;
      }
    }
    return s;
  });
}

// ---------- Teknikere ----------

export function listTechnicians() {
  applyDueWindows();
  return getState().technicians;
}

export function createTechnician({ name, specialties = [], capacity = 5, active = true, workStart = DEFAULT_WORK_START, workEnd = DEFAULT_WORK_END }) {
  if (!name || !name.trim()) throw badRequest('Navn er påkrevd');
  validateWindow(workStart, workEnd);
  return save((s) => {
    const tech = {
      id: nextId('technician'),
      name: name.trim(),
      specialties: Array.isArray(specialties) ? specialties : [],
      capacity: Number(capacity) > 0 ? Number(capacity) : 5,
      active: Boolean(active),
      workStart,
      workEnd,
      nextWindow: null,
      createdAt: new Date().toISOString(),
    };
    s.technicians.push(tech);
    return tech;
  });
}

export function updateTechnician(id, patch) {
  applyDueWindows();
  return save((s) => {
    const tech = s.technicians.find((t) => t.id === Number(id));
    if (!tech) throw notFound('Tekniker finnes ikke');
    if (patch.name != null) tech.name = String(patch.name).trim() || tech.name;
    if (patch.specialties != null) tech.specialties = Array.isArray(patch.specialties) ? patch.specialties : tech.specialties;
    if (patch.capacity != null && Number(patch.capacity) > 0) tech.capacity = Number(patch.capacity);
    if (patch.active != null) tech.active = Boolean(patch.active);

    // Arbeidstid: endres fritt på mandager, ellers trer endringen i kraft
    // førstkommende mandag ("kan endres på hver mandag").
    if (patch.workStart != null || patch.workEnd != null) {
      const ws = patch.workStart ?? tech.workStart;
      const we = patch.workEnd ?? tech.workEnd;
      validateWindow(ws, we);
      if (ws !== tech.workStart || we !== tech.workEnd) {
        if (isMonday()) {
          tech.workStart = ws;
          tech.workEnd = we;
          tech.nextWindow = null;
        } else {
          tech.nextWindow = { workStart: ws, workEnd: we, effectiveFrom: nextMondayISO() };
        }
      } else {
        tech.nextWindow = null;
      }
    }
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
        unassign(r);
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

function validateWindow(ws, we) {
  if (!TIME_RE.test(ws) || !TIME_RE.test(we)) throw badRequest('Arbeidstid må være på formen TT:MM');
  if (ws >= we) throw badRequest('Arbeidstid: starttid må være før sluttid');
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
      price: Math.max(0, Number(data.price) || 0),
      durationMin: Math.max(15, Number(data.durationMin) || DEFAULT_DURATION_MIN),
      status: 'mottatt',
      technicianId: null,
      assignedAt: null,
      scheduledAt: null,
      scheduledEnd: null,
      createdAt: now,
      updatedAt: now,
    };
    s.repairs.push(repair);
    return repair;
  });
}

export function updateRepair(id, patch) {
  applyDueWindows();
  let notify = null;
  const result = save((s) => {
    const r = s.repairs.find((x) => x.id === Number(id));
    if (!r) throw notFound('Reparasjon finnes ikke');
    if (patch.status != null) {
      if (!STATUSES.includes(patch.status)) throw badRequest('Ugyldig status');
      r.status = patch.status;
      // Tilbake til "mottatt" betyr ufordelt igjen.
      if (r.status === 'mottatt') unassign(r);
    }
    if (patch.technicianId !== undefined) {
      const tid = patch.technicianId == null ? null : Number(patch.technicianId);
      if (tid == null) {
        unassign(r);
      } else {
        const tech = s.technicians.find((t) => t.id === tid);
        if (!tech) throw badRequest('Ukjent tekniker');
        if (r.technicianId !== tid) {
          r.technicianId = tid;
          r.assignedAt = new Date().toISOString();
          scheduleRepair(s, r, tech);
          if (r.status === 'mottatt') r.status = 'tildelt';
          notify = assignmentPayload(r, tech);
        }
      }
    }
    for (const f of ['customerName', 'phone', 'device', 'problem']) {
      if (patch[f] != null) r[f] = String(patch[f]).trim();
    }
    if (patch.category != null && CATEGORIES.includes(patch.category)) r.category = patch.category;
    if (patch.priority != null && PRIORITIES.includes(patch.priority)) r.priority = patch.priority;
    if (patch.price != null) r.price = Math.max(0, Number(patch.price) || 0);
    if (patch.durationMin != null) r.durationMin = Math.max(15, Number(patch.durationMin) || DEFAULT_DURATION_MIN);
    r.updatedAt = new Date().toISOString();
    return r;
  });
  if (notify) events.emit('assigned', notify);
  return result;
}

export function deleteRepair(id) {
  return save((s) => {
    const idx = s.repairs.findIndex((x) => x.id === Number(id));
    if (idx === -1) throw notFound('Reparasjon finnes ikke');
    s.repairs.splice(idx, 1);
    return { ok: true };
  });
}

function unassign(r) {
  r.technicianId = null;
  r.assignedAt = null;
  r.scheduledAt = null;
  r.scheduledEnd = null;
}

// ---------- Kalenderplanlegging ----------

/** Finn ledig tid i teknikerens arbeidsvindu og legg jobben der. */
function scheduleRepair(s, repair, tech) {
  const busy = s.repairs
    .filter((x) => x.id !== repair.id && x.technicianId === tech.id && x.scheduledAt && ACTIVE_STATUSES.has(x.status))
    .map((x) => ({ start: new Date(x.scheduledAt), end: new Date(x.scheduledEnd) }));
  const duration = repair.durationMin || DEFAULT_DURATION_MIN;
  const start = findSlot({
    durationMin: duration,
    workStart: tech.workStart || DEFAULT_WORK_START,
    workEnd: tech.workEnd || DEFAULT_WORK_END,
    busy,
    from: new Date(),
  });
  if (start) {
    repair.scheduledAt = start.toISOString();
    repair.scheduledEnd = new Date(start.getTime() + duration * 60000).toISOString();
  } else {
    repair.scheduledAt = null;
    repair.scheduledEnd = null;
  }
}

function assignmentPayload(repair, tech) {
  return {
    technicianId: tech.id,
    technicianName: tech.name,
    repair: {
      id: repair.id,
      ticket: repair.ticket,
      customerName: repair.customerName,
      device: repair.device,
      category: repair.category,
      priority: repair.priority,
      price: repair.price,
      scheduledAt: repair.scheduledAt,
      scheduledEnd: repair.scheduledEnd,
    },
  };
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

/** Inntjening per tekniker denne måneden (sum av pris på tildelte jobber). */
export function monthlyEarnings(state = getState(), when = new Date()) {
  const y = when.getFullYear();
  const m = when.getMonth();
  const map = {};
  for (const r of state.repairs) {
    if (r.technicianId == null || !r.assignedAt) continue;
    const d = new Date(r.assignedAt);
    if (d.getFullYear() === y && d.getMonth() === m) {
      map[r.technicianId] = (map[r.technicianId] || 0) + (r.price || 0);
    }
  }
  return map;
}

/**
 * Fordel alle ufordelte reparasjoner (status "mottatt", uten tekniker).
 * Balanserer på månedlig inntjening og legger hver jobb inn i teknikerens
 * kalender i deres eget arbeidsvindu.
 */
export function distributeUnassigned() {
  applyDueWindows();
  const notifications = [];
  const result = save((s) => {
    const pending = s.repairs.filter((r) => r.status === 'mottatt' && r.technicianId == null);
    const { assignments, unassigned } = distribute(pending, s.technicians, {
      loads: currentLoads(s),
      earnings: monthlyEarnings(s),
    });
    const now = new Date().toISOString();
    for (const { repairId, technicianId } of assignments) {
      const r = s.repairs.find((x) => x.id === repairId);
      const tech = s.technicians.find((t) => t.id === technicianId);
      r.technicianId = technicianId;
      r.status = 'tildelt';
      r.assignedAt = now;
      r.updatedAt = now;
      scheduleRepair(s, r, tech);
      notifications.push(assignmentPayload(r, tech));
    }
    return { assigned: assignments.length, unassigned: unassigned.length };
  });
  for (const n of notifications) events.emit('assigned', n);
  return result;
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
    earnings: monthlyEarnings(s),
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
