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

test('velger teknikeren som har tjent minst denne måneden', () => {
  const generalists = [
    { id: 1, specialties: [], capacity: 10, active: true },
    { id: 2, specialties: [], capacity: 10, active: true },
    { id: 3, specialties: [], capacity: 10, active: true },
  ];
  const id = chooseTechnician(
    { category: 'Annet', priority: 'normal', price: 690 },
    generalists,
    { loads: {}, earnings: { 1: 5000, 2: 1200, 3: 3400 } }
  );
  assert.equal(id, 2, 'tekniker 2 har lavest inntjening og skal få jobben');
});

test('lik inntjening: velger minst belastede tekniker', () => {
  const twoGeneralists = [
    { id: 1, specialties: [], capacity: 5, active: true },
    { id: 2, specialties: [], capacity: 5, active: true },
  ];
  const id = chooseTechnician(
    { category: 'Annet', priority: 'normal' },
    twoGeneralists,
    { loads: { 1: 3, 2: 1 }, earnings: { 1: 1000, 2: 1000 } }
  );
  assert.equal(id, 2);
});

test('unngår teknikere over kapasitet når mulig', () => {
  const t = [
    { id: 1, specialties: [], capacity: 2, active: true },
    { id: 2, specialties: [], capacity: 5, active: true },
  ];
  const id = chooseTechnician(
    { category: 'Annet', priority: 'normal' },
    t,
    { loads: { 1: 2, 2: 4 }, earnings: { 1: 0, 2: 9000 } }
  );
  assert.equal(id, 2, 'tekniker 1 er full, velg 2 selv om den har tjent mer');
});

test('returnerer null når ingen er aktive', () => {
  const t = [{ id: 1, specialties: [], capacity: 5, active: false }];
  assert.equal(chooseTechnician({ category: 'Annet', priority: 'normal' }, t, {}), null);
});

test('distribute fordeler haster først', () => {
  const t = [
    { id: 1, specialties: [], capacity: 10, active: true },
    { id: 2, specialties: [], capacity: 10, active: true },
  ];
  const repairs = [
    { id: 10, category: 'Annet', priority: 'lav', price: 500 },
    { id: 11, category: 'Annet', priority: 'haster', price: 500 },
    { id: 12, category: 'Annet', priority: 'normal', price: 500 },
  ];
  const { assignments, unassigned } = distribute(repairs, t, {});
  assert.equal(assignments.length, 3);
  assert.equal(unassigned.length, 0);
  assert.deepEqual(assignments[0], { repairId: 11, technicianId: 1 });
});

test('distribute jevner ut inntekten mellom teknikerne', () => {
  const t = [
    { id: 1, specialties: [], capacity: 99, active: true },
    { id: 2, specialties: [], capacity: 99, active: true },
    { id: 3, specialties: [], capacity: 99, active: true },
  ];
  // 6 jobber à 1000 kr → hver tekniker skal ende på 2000 kr.
  const repairs = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, category: 'Annet', priority: 'normal', price: 1000,
  }));
  const { assignments } = distribute(repairs, t, {});
  const earned = {};
  for (const a of assignments) earned[a.technicianId] = (earned[a.technicianId] || 0) + 1000;
  assert.deepEqual(earned, { 1: 2000, 2: 2000, 3: 2000 });
});

test('distribute utligner eksisterende skjevhet i inntjening', () => {
  const t = [
    { id: 1, specialties: [], capacity: 99, active: true },
    { id: 2, specialties: [], capacity: 99, active: true },
  ];
  // Tekniker 1 har allerede tjent 2000 mer — de neste jobbene går til tekniker 2.
  const repairs = [
    { id: 1, category: 'Annet', priority: 'normal', price: 1000 },
    { id: 2, category: 'Annet', priority: 'normal', price: 1000 },
  ];
  const { assignments } = distribute(repairs, t, { earnings: { 1: 2000, 2: 0 } });
  assert.ok(assignments.every((a) => a.technicianId === 2));
});

test('distribute markerer som ufordelt når ingen tekniker finnes', () => {
  const { assignments, unassigned } = distribute(
    [{ id: 1, category: 'Annet', priority: 'normal' }], [], {}
  );
  assert.equal(assignments.length, 0);
  assert.deepEqual(unassigned, [1]);
});
