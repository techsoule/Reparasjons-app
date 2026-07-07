import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTechnician, distribute } from '../src/distribution.js';

const techs = [
  { id: 1, specialties: ['iPhone'], capacity: 3, active: true },
  { id: 2, specialties: ['Samsung'], capacity: 3, active: true },
  { id: 3, specialties: [], capacity: 5, active: true }, // generalist
];

test('velger spesialist for riktig kategori', () => {
  const id = chooseTechnician({ category: 'iPhone', priority: 'normal' }, techs, {});
  assert.equal(id, 1);
});

test('faller tilbake til generalist når ingen spesialist matcher', () => {
  const id = chooseTechnician({ category: 'Laptop', priority: 'normal' }, techs, {});
  assert.equal(id, 3);
});

test('velger minst belastede tekniker', () => {
  const twoGeneralists = [
    { id: 1, specialties: [], capacity: 5, active: true },
    { id: 2, specialties: [], capacity: 5, active: true },
  ];
  const id = chooseTechnician({ category: 'Annet', priority: 'normal' }, twoGeneralists, { 1: 3, 2: 1 });
  assert.equal(id, 2);
});

test('unngår teknikere over kapasitet når mulig', () => {
  const t = [
    { id: 1, specialties: [], capacity: 2, active: true },
    { id: 2, specialties: [], capacity: 5, active: true },
  ];
  const id = chooseTechnician({ category: 'Annet', priority: 'normal' }, t, { 1: 2, 2: 4 });
  assert.equal(id, 2, 'tekniker 1 er full, velg 2 selv om den har flere jobber');
});

test('returnerer null når ingen er aktive', () => {
  const t = [{ id: 1, specialties: [], capacity: 5, active: false }];
  assert.equal(chooseTechnician({ category: 'Annet', priority: 'normal' }, t, {}), null);
});

test('distribute fordeler haster først og balanserer last', () => {
  const t = [
    { id: 1, specialties: [], capacity: 10, active: true },
    { id: 2, specialties: [], capacity: 10, active: true },
  ];
  const repairs = [
    { id: 10, category: 'Annet', priority: 'lav' },
    { id: 11, category: 'Annet', priority: 'haster' },
    { id: 12, category: 'Annet', priority: 'normal' },
  ];
  const { assignments, unassigned } = distribute(repairs, t, {});
  assert.equal(assignments.length, 3);
  assert.equal(unassigned.length, 0);
  // Haster (id 11) skal fordeles først, til tekniker 1.
  assert.deepEqual(assignments[0], { repairId: 11, technicianId: 1 });
  // Lasten skal fordeles jevnt mellom de to teknikerne.
  const perTech = assignments.reduce((m, a) => ((m[a.technicianId] = (m[a.technicianId] || 0) + 1), m), {});
  assert.deepEqual(perTech, { 1: 2, 2: 1 });
});

test('distribute markerer som ufordelt når ingen tekniker finnes', () => {
  const { assignments, unassigned } = distribute(
    [{ id: 1, category: 'Annet', priority: 'normal' }], [], {}
  );
  assert.equal(assignments.length, 0);
  assert.deepEqual(unassigned, [1]);
});
