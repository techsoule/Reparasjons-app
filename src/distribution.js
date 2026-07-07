// Kjernelogikk for å fordele reparasjoner til teknikere.
// Ren funksjon uten sidevirkninger, slik at den er lett å teste.

export const PRIORITIES = ['lav', 'normal', 'høy', 'haster'];
const PRIORITY_WEIGHT = { lav: 0, normal: 1, høy: 2, haster: 3 };

/**
 * Velg beste tekniker for én reparasjon.
 *
 * Rekkefølgen på hensyn:
 *   1. Riktig spesialitet (generalister teller alltid med)
 *   2. Ledig kapasitet
 *   3. Lavest inntjening denne måneden — slik at alle tjener likt over tid
 *   4. Færrest aktive jobber, deretter lavest id (stabilt)
 *
 * @param {object} repair - { category, priority, price }
 * @param {Array}  technicians - [{ id, specialties:[], capacity, active }]
 * @param {object} ctx - { loads: {techId: antall}, earnings: {techId: kr denne måneden} }
 * @returns {number|null} tekniker-id, eller null hvis ingen er tilgjengelig
 */
export function chooseTechnician(repair, technicians, ctx = {}) {
  const loads = ctx.loads || {};
  const earnings = ctx.earnings || {};

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

  // 3. Lavest månedlig inntjening først, så færrest jobber, så lavest id.
  pool = [...pool].sort((a, b) => {
    const ea = earnings[a.id] || 0;
    const eb = earnings[b.id] || 0;
    if (ea !== eb) return ea - eb;
    const la = loads[a.id] || 0;
    const lb = loads[b.id] || 0;
    if (la !== lb) return la - lb;
    return a.id - b.id;
  });

  return pool[0].id;
}

/**
 * Fordel en hel bunke ufordelte reparasjoner.
 * Høyest prioritet fordeles først; ved lik prioritet fordeles dyreste jobb
 * først, som gir jevnest mulig inntektsfordeling.
 *
 * @param {Array} repairs - ufordelte reparasjoner [{ id, category, priority, price }]
 * @param {Array} technicians
 * @param {object} ctx - { loads, earnings } — eksisterende belastning/inntjening
 * @returns {{ assignments: Array<{repairId, technicianId}>, unassigned: Array<number> }}
 */
export function distribute(repairs, technicians, ctx = {}) {
  const loads = { ...(ctx.loads || {}) };
  const earnings = { ...(ctx.earnings || {}) };
  const assignments = [];
  const unassigned = [];

  const queue = [...repairs].sort((a, b) => {
    const pw = (PRIORITY_WEIGHT[b.priority] ?? 1) - (PRIORITY_WEIGHT[a.priority] ?? 1);
    if (pw !== 0) return pw;
    return (b.price || 0) - (a.price || 0);
  });

  for (const repair of queue) {
    const techId = chooseTechnician(repair, technicians, { loads, earnings });
    if (techId == null) {
      unassigned.push(repair.id);
      continue;
    }
    loads[techId] = (loads[techId] || 0) + 1;
    earnings[techId] = (earnings[techId] || 0) + (repair.price || 0);
    assignments.push({ repairId: repair.id, technicianId: techId });
  }

  return { assignments, unassigned };
}
