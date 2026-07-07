// HTTP-server: REST-API, sanntidsvarsler (SSE), kalender-feed og statiske filer.

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
app.get('/api/earnings', wrap(() => repo.monthlyEarnings()));

// ---- Sanntidsvarsler (Server-Sent Events) ----
// Teknikeren åpner appen og abonnerer med sin id; når en jobb tildeles i
// hens tidsrom, dyttes et varsel som frontenden viser som push-notifikasjon.
app.get('/api/events', (req, res) => {
  const techId = Number(req.query.technicianId) || null;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const onAssigned = (payload) => {
    if (!techId || payload.technicianId === techId) {
      res.write(`event: assigned\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };
  repo.events.on('assigned', onAssigned);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    repo.events.off('assigned', onAssigned);
  });
});

// ---- Kalender-feed (iCalendar) ----
// Hver tekniker kan abonnere på sin egen kalender fra Google/Apple/Outlook:
//   http://<server>/api/technicians/1/calendar.ics
app.get('/api/technicians/:id/calendar.ics', (req, res) => {
  const techId = Number(req.params.id);
  const tech = repo.listTechnicians().find((t) => t.id === techId);
  if (!tech) return res.status(404).send('Tekniker finnes ikke');

  const fmt = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  };
  const escape = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

  const events = repo.listRepairs()
    .filter((r) => r.technicianId === techId && r.scheduledAt)
    .map((r) => [
      'BEGIN:VEVENT',
      `UID:repair-${r.id}@reparasjons-app`,
      `DTSTAMP:${fmt(r.updatedAt)}`,
      `DTSTART:${fmt(r.scheduledAt)}`,
      `DTEND:${fmt(r.scheduledEnd)}`,
      `SUMMARY:${escape(`${r.ticket} · ${r.category} – ${r.customerName}`)}`,
      `DESCRIPTION:${escape(`${r.device}${r.problem ? ' – ' + r.problem : ''} (${r.priority}, kr ${r.price})`)}`,
      'END:VEVENT',
    ].join('\r\n'))
    .join('\r\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reparasjons-app//NO',
    `X-WR-CALNAME:Reparasjoner – ${escape(tech.name)}`,
    events,
    'END:VCALENDAR',
  ].join('\r\n');

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.send(ics);
});

app.listen(PORT, () => {
  console.log(`Reparasjons-app kjører på http://localhost:${PORT}`);
});
