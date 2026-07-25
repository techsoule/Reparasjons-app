// =====================================================================
// Formatering — norsk (bokmål). Deles mellom app og backend.
// =====================================================================

/** Formater kroner: 1234.5 → «1 235 kr» (norsk tusenskille, avrundet). */
export function kr(belop: number | null | undefined): string {
  const n = Math.round(Number(belop ?? 0));
  const medSkille = n
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // tusenskille (vanlig mellomrom)
  return `${medSkille} kr`;
}

/** Formater minutter: 90 → «1 t 30 min», 45 → «45 min». */
export function tid(minutter: number | null | undefined): string {
  const m = Math.round(Number(minutter ?? 0));
  if (m < 60) return `${m} min`;
  const t = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${t} t` : `${t} t ${rest} min`;
}

const MANEDER = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

/** Kort dato/tid: «12. mar 14:30». Tom streng hvis null/ugyldig. */
export function datoTid(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dag = d.getDate();
  const man = MANEDER[d.getMonth()];
  const t = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dag}. ${man} ${t}:${min}`;
}

/** Kun dato: «12. mar 2026». */
export function dato(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}. ${MANEDER[d.getMonth()]} ${d.getFullYear()}`;
}

/** True hvis ISO-tidspunktet er på dagens dato (lokal tid). */
export function erIDag(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/** True hvis ISO-tidspunktet er frem i tid (etter nå). */
export function erKommende(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}
