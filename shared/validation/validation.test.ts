import { describe, it, expect } from 'vitest';
import {
  normaliserTelefon,
  validerTelefon,
  formaterTelefon,
  validerEpost,
  harInnhold,
} from './validation';

describe('telefon', () => {
  it('godtar 8-sifret mobilnummer', () => {
    expect(validerTelefon('40404040')).toBe(true);
    expect(validerTelefon('91234567')).toBe(true);
  });

  it('godtar mellomrom og bindestrek', () => {
    expect(normaliserTelefon('404 04 040')).toBe('40404040');
    expect(normaliserTelefon('40-40-40-40')).toBe('40404040');
  });

  it('godtar landskode +47, 0047 og 47', () => {
    expect(normaliserTelefon('+47 404 04 040')).toBe('40404040');
    expect(normaliserTelefon('004740404040')).toBe('40404040');
    expect(normaliserTelefon('4740404040')).toBe('40404040');
  });

  it('avviser for korte/lange og ugyldige numre', () => {
    expect(validerTelefon('1234567')).toBe(false); // 7 sifre
    expect(validerTelefon('123456789')).toBe(false); // 9 sifre
    expect(validerTelefon('12345678')).toBe(false); // starter på 1
    expect(validerTelefon('abcdefgh')).toBe(false);
    expect(validerTelefon('')).toBe(false);
  });

  it('formaterer for visning', () => {
    expect(formaterTelefon('40404040')).toBe('404 04 040');
  });
});

describe('e-post', () => {
  it('godtar vanlige adresser', () => {
    expect(validerEpost('kari@example.no')).toBe(true);
    expect(validerEpost('per.ole+tag@fixiphone.no')).toBe(true);
  });

  it('avviser ugyldige', () => {
    expect(validerEpost('kari@')).toBe(false);
    expect(validerEpost('kari.example.no')).toBe(false);
    expect(validerEpost('@example.no')).toBe(false);
    expect(validerEpost('kari@example')).toBe(false);
    expect(validerEpost('')).toBe(false);
  });
});

describe('harInnhold', () => {
  it('true kun for ikke-tom streng', () => {
    expect(harInnhold('x')).toBe(true);
    expect(harInnhold('  ')).toBe(false);
    expect(harInnhold('')).toBe(false);
    expect(harInnhold(null)).toBe(false);
    expect(harInnhold(123)).toBe(false);
  });
});
