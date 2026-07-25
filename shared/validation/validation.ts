// =====================================================================
// Validering — norsk telefonnummer + e-post. Ren modul, deles mellom
// edge function og app.
// =====================================================================

/**
 * Normaliser norsk telefonnummer: fjern mellomrom, bindestrek og
 * landskode (+47 / 0047). Returnerer kun de 8 sifrene, eller null hvis
 * det ikke ser ut som et gyldig norsk nummer.
 */
export function normaliserTelefon(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[\s\-()]/g, '');
  // landskode
  if (s.startsWith('+47')) s = s.slice(3);
  else if (s.startsWith('0047')) s = s.slice(4);
  else if (s.startsWith('47') && s.length === 10) s = s.slice(2);
  // norske nummer: 8 sifre, starter 2–9 (ikke 0 eller 1)
  if (/^[2-9]\d{7}$/.test(s)) return s;
  return null;
}

/** True hvis input er et gyldig norsk telefonnummer. */
export function validerTelefon(input: string): boolean {
  return normaliserTelefon(input) !== null;
}

/** Formater 8-sifret nummer som «xxx xx xxx» for visning. */
export function formaterTelefon(input: string): string {
  const n = normaliserTelefon(input);
  if (!n) return input;
  return `${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5)}`;
}

// Pragmatisk e-postregex — dekker vanlige tilfeller uten å være for streng.
const EPOST_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True hvis input er en gyldig e-postadresse. */
export function validerEpost(input: string): boolean {
  if (typeof input !== 'string') return false;
  const s = input.trim();
  if (s.length > 254) return false;
  return EPOST_RE.test(s);
}

/** True hvis feltet har innhold etter trimming. */
export function harInnhold(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}
