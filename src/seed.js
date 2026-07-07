// Fyller databasen med eksempeldata slik at du raskt kan teste appen.
// Kjør: npm run seed

import { save } from './store.js';
import { createTechnician, createRepair } from './repository.js';

save((s) => {
  s.technicians = [];
  s.repairs = [];
  s.counters = { technician: 0, repair: 0, ticket: 1000 };
  return s;
});

createTechnician({ name: 'Ola Hansen', specialties: ['iPhone', 'iPad'], capacity: 6, workStart: '08:00', workEnd: '15:00' });
createTechnician({ name: 'Kari Nordmann', specialties: ['Samsung', 'Android'], capacity: 5, workStart: '10:00', workEnd: '18:00' });
createTechnician({ name: 'Per Olsen', specialties: [], capacity: 8, workStart: '09:00', workEnd: '16:00' }); // generalist

const samples = [
  { customerName: 'Marte Berg', phone: '90011223', device: 'iPhone 13', problem: 'Knust skjerm', category: 'iPhone', priority: 'høy', price: 1490, durationMin: 45 },
  { customerName: 'Jon Dahl', phone: '91122334', device: 'Samsung S22', problem: 'Bytte batteri', category: 'Samsung', priority: 'normal', price: 890, durationMin: 30 },
  { customerName: 'Lise Vik', phone: '92233445', device: 'iPad Air', problem: 'Lader ikke', category: 'iPad', priority: 'normal', price: 790, durationMin: 60 },
  { customerName: 'Anders Lie', phone: '93344556', device: 'iPhone 11', problem: 'Vannskade', category: 'iPhone', priority: 'haster', price: 1190, durationMin: 90 },
  { customerName: 'Nina Ås', phone: '94455667', device: 'Lenovo ThinkPad', problem: 'Treg / virus', category: 'Laptop', priority: 'lav', price: 990, durationMin: 60 },
  { customerName: 'Tom Ruud', phone: '95566778', device: 'Pixel 7', problem: 'Kamera ute av fokus', category: 'Android', priority: 'normal', price: 690, durationMin: 45 },
];
samples.forEach(createRepair);

console.log('Eksempeldata lagt inn: 3 teknikere (med hver sin arbeidstid), 6 reparasjoner med pris.');
console.log('Start appen med "npm start" og trykk «Fordel automatisk».');
