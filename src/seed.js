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

createTechnician({ name: 'Ola Hansen', specialties: ['iPhone', 'iPad'], capacity: 6 });
createTechnician({ name: 'Kari Nordmann', specialties: ['Samsung', 'Android'], capacity: 5 });
createTechnician({ name: 'Per Olsen', specialties: [], capacity: 8 }); // generalist
createTechnician({ name: 'Ingen jobber (inaktiv)', specialties: ['Laptop'], capacity: 4, active: false });

const samples = [
  { customerName: 'Marte Berg', phone: '90011223', device: 'iPhone 13', problem: 'Knust skjerm', category: 'iPhone', priority: 'høy' },
  { customerName: 'Jon Dahl', phone: '91122334', device: 'Samsung S22', problem: 'Bytte batteri', category: 'Samsung', priority: 'normal' },
  { customerName: 'Lise Vik', phone: '92233445', device: 'iPad Air', problem: 'Lader ikke', category: 'iPad', priority: 'normal' },
  { customerName: 'Anders Lie', phone: '93344556', device: 'iPhone 11', problem: 'Vannskade', category: 'iPhone', priority: 'haster' },
  { customerName: 'Nina Ås', phone: '94455667', device: 'Lenovo ThinkPad', problem: 'Treg / virus', category: 'Laptop', priority: 'lav' },
  { customerName: 'Tom Ruud', phone: '95566778', device: 'Pixel 7', problem: 'Kamera ute av fokus', category: 'Android', priority: 'normal' },
];
samples.forEach(createRepair);

console.log('Eksempeldata lagt inn: 4 teknikere, 6 reparasjoner.');
console.log('Start appen med "npm start" og trykk «Fordel automatisk».');
