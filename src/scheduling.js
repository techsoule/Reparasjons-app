// Finner ledige tidspunkt i en teknikers arbeidsdag.
// Ren funksjon uten sidevirkninger, slik at den er lett å teste.

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Finn første ledige tidspunkt for en jobb innenfor teknikerens arbeidstid.
 * Søndager hoppes over. Starttid rundes opp til nærmeste kvarter.
 *
 * @param {object} opts
 * @param {number} opts.durationMin - jobbens varighet i minutter
 * @param {string} opts.workStart - "09:00"
 * @param {string} opts.workEnd - "16:00"
 * @param {Array<{start: Date, end: Date}>} opts.busy - allerede planlagte jobber
 * @param {Date} opts.from - tidligste mulige start (vanligvis nå)
 * @param {number} [opts.maxDays=30] - hvor mange dager frem det søkes
 * @returns {Date|null} starttidspunkt, eller null hvis ingen ledig tid ble funnet
 */
export function findSlot({ durationMin, workStart = '09:00', workEnd = '16:00', busy = [], from = new Date(), maxDays = 30 }) {
  const dur = durationMin * 60000;
  const ws = toMinutes(workStart);
  const we = toMinutes(workEnd);

  for (let i = 0; i < maxDays; i++) {
    const day = new Date(from);
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);
    if (day.getDay() === 0) continue; // søndag stengt

    const open = new Date(day.getTime() + ws * 60000);
    const close = new Date(day.getTime() + we * 60000);

    let cursor = open;
    if (i === 0) {
      const now = new Date(from);
      now.setSeconds(0, 0);
      now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
      if (now > cursor) cursor = now;
    }

    const dayBusy = busy
      .filter((b) => b.end > open && b.start < close)
      .sort((a, b) => a.start - b.start);

    for (const b of dayBusy) {
      if (b.start.getTime() - cursor.getTime() >= dur) break; // plass før denne blokken
      if (b.end > cursor) cursor = new Date(b.end);
    }

    if (close.getTime() - cursor.getTime() >= dur) return cursor;
  }
  return null;
}
