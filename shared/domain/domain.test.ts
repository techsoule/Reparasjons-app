import { describe, it, expect } from 'vitest';
import {
  nesteStatus,
  forrigeStatus,
  erFullfort,
  STATUS_FLYT,
} from './status';
import { kr, tid, erIDag, erKommende } from './format';
import { fortjeneste, aggregerStatistikk, summerInntjening } from './earnings';

describe('status', () => {
  it('flyten går riktig vei', () => {
    expect(nesteStatus('mottatt')).toBe('bekreftet');
    expect(nesteStatus('ferdig')).toBe('hentet');
    expect(nesteStatus('hentet')).toBeNull();
    expect(forrigeStatus('mottatt')).toBeNull();
    expect(forrigeStatus('bekreftet')).toBe('mottatt');
  });
  it('erFullfort', () => {
    expect(erFullfort('ferdig')).toBe(true);
    expect(erFullfort('hentet')).toBe(true);
    expect(erFullfort('mottatt')).toBe(false);
  });
  it('flyten har seks steg', () => {
    expect(STATUS_FLYT).toHaveLength(6);
  });
});

describe('format', () => {
  it('kr med tusenskille', () => {
    expect(kr(1235)).toBe('1 235 kr');
    expect(kr(999)).toBe('999 kr');
    expect(kr(1234567)).toBe('1 234 567 kr');
    expect(kr(null)).toBe('0 kr');
  });
  it('tid', () => {
    expect(tid(45)).toBe('45 min');
    expect(tid(60)).toBe('1 t');
    expect(tid(90)).toBe('1 t 30 min');
  });
  it('erIDag / erKommende', () => {
    const naa = new Date().toISOString();
    const iMorgen = new Date(Date.now() + 86400_000).toISOString();
    const iGaar = new Date(Date.now() - 86400_000).toISOString();
    expect(erIDag(naa)).toBe(true);
    expect(erKommende(iMorgen)).toBe(true);
    expect(erKommende(iGaar)).toBe(false);
    expect(erIDag(null)).toBe(false);
  });
});

describe('earnings', () => {
  it('fortjeneste = hele arbeidsmarginen (arbeidspris)', () => {
    expect(fortjeneste(800)).toBe(800);
    expect(fortjeneste(500)).toBe(500);
  });

  it('aggregerer statistikk per reparatør (fortjeneste = arbeidspris)', () => {
    const teknikere = [
      { id: 'a', navn: 'Jonas' },
      { id: 'b', navn: 'Sara' },
    ];
    const jobber = [
      { technician_id: 'a', arbeidspris: 500, estimert_tid_min: 45 },
      { technician_id: 'a', arbeidspris: 800, estimert_tid_min: 40 },
      { technician_id: 'b', arbeidspris: 1000, estimert_tid_min: 60 },
      { technician_id: null, arbeidspris: 300, estimert_tid_min: 30 }, // utildelt
    ];
    const res = aggregerStatistikk(teknikere, jobber);
    const a = res.find((r) => r.technician_id === 'a')!;
    const b = res.find((r) => r.technician_id === 'b')!;
    expect(a.antall_jobber).toBe(2);
    expect(a.minutter).toBe(85);
    expect(a.kroner).toBe(1300); // 500 + 800
    expect(b.antall_jobber).toBe(1);
    expect(b.kroner).toBe(1000); // hele arbeidsprisen
  });

  it('summerer utbetalt/ubetalt', () => {
    const res = summerInntjening([
      { belop: 200, utbetalt: true },
      { belop: 320, utbetalt: false },
      { belop: 500, utbetalt: false },
    ]);
    expect(res.utbetalt).toBe(200);
    expect(res.ubetalt).toBe(820);
    expect(res.total).toBe(1020);
  });
});
