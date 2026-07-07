// Kjernelogikk for å fordele reparasjoner til teknikere.
// Ren funksjon uten sidevirkninger, slik at den er lett å teste.

export const PRIORITIES = ['lav', 'normal', 'høy', 'haster'];
const PRIORITY_WEIGHT = { lav: 0, normal: 1, høy: 2, haster: 3 };

/**
 * Velg beste tekniker for én reparasjon.
 *
 * @param {object} repair - { category, priority }
 * @param {Array}  technicians - [{ id, specialties:[], capacity, active }]
 * @param {object} loads - { [technicianId]: antallAktiveReparasjoner }
 * @returns {number|null} tekniker-id, eller null hvis ingen er tilgjengelig
 */
export function chooseTechnician(repair, technicians, loads = {}) {
  const active = technicians.filter((t) => t.active);
  if (active.length === 0) return null;

  // 1. Foretrekk teknikere som har riktig spesialitet (eller ingen spesialitet = generalist).
  const specialists = active.filter(
    (t) =>
      !t.specialties ||
      t.specialties.length === 0 ||
      t.specialties.includes(repair.category)
  );
  let pool = specialists.length ? specialists : active;

  // 2. Foretrekk teknikere som har ledig kapasitet.
  const underCapacity = pool.filter((t) => (loads[t.id] || 0) < (t.capacity || Infinity));
  if (underCapacity.length) pool = underCapacity;

  // 3. Velg minst belastede tekniker; ved likhet den med lavest id (stabilt/round-robin).
  pool = [...pool].sort((a, b) => {
    const la = loads[a.id] || 0;
    const lb = loads[b.id] || 0;
    if (la !== lb) return la - lb;
    return a.id - b.id;
  });

  return pool[0].id;
}

/**
 * Fordel en hel bunke ufordelte reparasjoner.
 * Reparasjoner med høyest prioritet fordeles først.
 *
 * @param {Array} repairs - ufordelte reparasjoner [{ id, category, priority }]
 * @param {Array} technicians
 * @param {object} startLoads - eksisterende belastning per tekniker
 * @returns {{ assignments: Array<{repairId, technicianId}>, unassigned: Array<number> }}
 */
export function distribute(repairs, technicians, startLoads = {}) {
  const loads = { ...startLoads };
  const assignments = [];
  const unassigned = [];

  const queue = [...repairs].sort(
    (a, b) => (PRIORITY_WEIGHT[b.priority] ?? 1) - (PRIORITY_WEIGHT[a.priority] ?? 1)
  );

  for (const repair of queue) {
    const techId = chooseTechnician(repair, technicians, loads);
    if (techId == null) {
      unassigned.push(repair.id);
      continue;
    }
    loads[techId] = (loads[techId] || 0) + 1;
    assignments.push({ repairId: repair.id, technicianId: techId });
  }

  return { assignments, unassigned };
}
