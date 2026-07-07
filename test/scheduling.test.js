import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSlot, toMinutes } from '../src/scheduling.js';

// 2026-07-06 er en mandag.
const monday7am = new Date('2026-07-06T07:00:00');

test('toMinutes konverterer TT:MM til minutter', () => {
  assert.equal(toMinutes('09:00'), 540);
  assert.equal(toMinutes('16:30'), 990);
});

test('første ledige tid er ved arbeidsstart', () => {
  const slot = findSlot({ durationMin: 45, workStart: '09:00', workEnd: '16:00', busy: [], from: monday7am });
  assert.equal(slot.getHours(), 9);
  assert.equal(slot.getMinutes(), 0);
  assert.equal(slot.getDate(), 6);
});

test('starter ikke før nå-tidspunktet (rundet opp til kvarter)', () => {
  const from = new Date('2026-07-06T10:20:00');
  const slot = findSlot({ durationMin: 30, workStart: '09:00', workEnd: '16:00', busy: [], from });
  assert.equal(slot.getHours(), 10);
  assert.equal(slot.getMinutes(), 30);
});

test('legger jobben etter en opptatt blokk', () => {
  const busy = [{ start: new Date('2026-07-06T09:00:00'), end: new Date('2026-07-06T10:30:00') }];
  const slot = findSlot({ durationMin: 45, workStart: '09:00', workEnd: '16:00', busy, from: monday7am });
  assert.equal(slot.getHours(), 10);
  assert.equal(slot.getMinutes(), 30);
});

test('bruker et hull mellom to blokker hvis jobben får plass', () => {
  const busy = [
    { start: new Date('2026-07-06T09:00:00'), end: new Date('2026-07-06T10:00:00') },
    { start: new Date('2026-07-06T11:00:00'), end: new Date('2026-07-06T12:00:00') },
  ];
  const slot = findSlot({ durationMin: 45, workStart: '09:00', workEnd: '16:00', busy, from: monday7am });
  assert.equal(slot.getHours(), 10, 'skal bruke hullet 10:00–11:00');
});

test('full dag ruller til neste dag ved arbeidsstart', () => {
  const busy = [{ start: new Date('2026-07-06T09:00:00'), end: new Date('2026-07-06T16:00:00') }];
  const slot = findSlot({ durationMin: 45, workStart: '09:00', workEnd: '16:00', busy, from: monday7am });
  assert.equal(slot.getDate(), 7, 'neste dag (tirsdag)');
  assert.equal(slot.getHours(), 9);
});

test('søndager hoppes over', () => {
  // 2026-07-12 er en søndag → jobben skal havne mandag 13.
  const sunday = new Date('2026-07-12T08:00:00');
  const slot = findSlot({ durationMin: 45, workStart: '09:00', workEnd: '16:00', busy: [], from: sunday });
  assert.equal(slot.getDate(), 13);
  assert.equal(slot.getDay(), 1);
});

test('jobb som ikke får plass innen arbeidsslutt flyttes til neste dag', () => {
  const from = new Date('2026-07-06T15:30:00');
  const slot = findSlot({ durationMin: 60, workStart: '09:00', workEnd: '16:00', busy: [], from });
  assert.equal(slot.getDate(), 7);
  assert.equal(slot.getHours(), 9);
});

test('returnerer null hvis ingen dager har plass', () => {
  const slot = findSlot({ durationMin: 600, workStart: '09:00', workEnd: '16:00', busy: [], from: monday7am, maxDays: 5 });
  assert.equal(slot, null, '10 timers jobb får aldri plass i 7-timers vindu');
});
