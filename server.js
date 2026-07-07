// HTTP-server: REST-API + statiske filer for Reparasjons-app.

import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as repo from './src/repository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Liten hjelper som fanger feil fra repository og sender riktig statuskode.
const wrap = (fn) => (req, res) => {
  try {
    res.json(fn(req));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Serverfeil' });
  }
};

// ---- Metadata ----
app.get('/api/meta', wrap(() => ({
  statuses: repo.STATUSES,
  categories: repo.CATEGORIES,
  priorities: ['lav', 'normal', 'høy', 'haster'],
})));

// ---- Teknikere ----
app.get('/api/technicians', wrap(() => repo.listTechnicians()));
app.post('/api/technicians', wrap((req) => repo.createTechnician(req.body)));
app.patch('/api/technicians/:id', wrap((req) => repo.updateTechnician(req.params.id, req.body)));
app.delete('/api/technicians/:id', wrap((req) => repo.deleteTechnician(req.params.id)));

// ---- Reparasjoner ----
app.get('/api/repairs', wrap(() => repo.listRepairs()));
app.post('/api/repairs', wrap((req) => repo.createRepair(req.body)));
app.patch('/api/repairs/:id', wrap((req) => repo.updateRepair(req.params.id, req.body)));
app.delete('/api/repairs/:id', wrap((req) => repo.deleteRepair(req.params.id)));

// ---- Fordeling & statistikk ----
app.post('/api/distribute', wrap(() => repo.distributeUnassigned()));
app.get('/api/stats', wrap(() => repo.stats()));

app.listen(PORT, () => {
  console.log(`Reparasjons-app kjører på http://localhost:${PORT}`);
});
