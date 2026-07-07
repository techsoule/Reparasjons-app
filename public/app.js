// Frontend-logikk for Reparasjons-app (ren vanilla JS, ingen byggesteg).

const STATUS_LABELS = {
  mottatt: 'Mottatt',
  tildelt: 'Tildelt',
  under_arbeid: 'Under arbeid',
  ferdig: 'Ferdig',
  levert: 'Levert',
};

let meta = { statuses: [], categories: [], priorities: [] };
let technicians = [];
let repairs = [];
let earnings = {};

// ---------- API ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Noe gikk galt');
  return data;
}

async function refresh() {
  [technicians, repairs, earnings] = await Promise.all([
    api('/api/technicians'),
    api('/api/repairs'),
    api('/api/earnings'),
  ]);
  const stats = await api('/api/stats');
  renderStats(stats);
  renderBoard();
  renderCalendar();
  renderTechnicians();
  renderMeSelect();
}

// ---------- Statistikk ----------
function renderStats(s) {
  const cards = [
    { num: s.total, label: 'Reparasjoner' },
    { num: s.unassigned, label: 'Ufordelt' },
    { num: (s.byStatus.tildelt || 0) + (s.byStatus.under_arbeid || 0), label: 'Aktive' },
    { num: s.byStatus.ferdig || 0, label: 'Ferdig' },
    { num: s.byStatus.levert || 0, label: 'Levert' },
    { num: `${s.activeTechnicians}/${s.technicians}`, label: 'Teknikere aktive' },
  ];
  document.getElementById('stats').innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="num">${c.num}</div><div class="label">${c.label}</div></div>`)
    .join('');
}

// ---------- Tavle ----------
function techName(id) {
  const t = technicians.find((x) => x.id === id);
  return t ? t.name : null;
}

function fmtSched(r) {
  if (!r.scheduledAt) return '';
  const s = new Date(r.scheduledAt);
  const e = new Date(r.scheduledEnd);
  const day = s.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const t1 = s.toTimeString().slice(0, 5);
  const t2 = e.toTimeString().slice(0, 5);
  return `🕐 ${day} ${t1}–${t2}`;
}

function fmtKr(n) {
  return 'kr ' + Number(n || 0).toLocaleString('nb-NO');
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = meta.statuses
    .map((status) => {
      const items = repairs.filter((r) => r.status === status);
      return `
        <div class="column" data-status="${status}">
          <h3>${STATUS_LABELS[status] || status}<span class="count">${items.length}</span></h3>
          ${items.map(renderCard).join('') || '<div class="empty">Ingen</div>'}
        </div>`;
    })
    .join('');
  attachBoardEvents();
}

function renderCard(r) {
  const tech = techName(r.technicianId);
  const techBadge = tech
    ? `<span class="badge tech">👤 ${escapeHtml(tech)}</span>`
    : `<span class="badge none">Ufordelt</span>`;
  return `
    <div class="card prio-${r.priority}" draggable="true" data-id="${r.id}">
      <div class="ticket">${r.ticket} · ${escapeHtml(r.category)}</div>
      <div class="customer">${escapeHtml(r.customerName)}</div>
      ${r.device ? `<div class="device">${escapeHtml(r.device)}</div>` : ''}
      ${r.problem ? `<div class="device" style="color:var(--muted)">${escapeHtml(r.problem)}</div>` : ''}
      ${r.scheduledAt ? `<div class="sched">${fmtSched(r)}</div>` : ''}
      <div class="meta">
        <span class="badge">${prioLabel(r.priority)}</span>
        ${r.price ? `<span class="badge">${fmtKr(r.price)}</span>` : ''}
        ${techBadge}
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${r.id}">✏️ Rediger</button>
        <button class="icon-btn" data-del="${r.id}">🗑️ Slett</button>
      </div>
    </div>`;
}

function prioLabel(p) {
  return { lav: '● Lav', normal: '● Normal', høy: '▲ Høy', haster: '⚠ Haster' }[p] || p;
}

function attachBoardEvents() {
  document.querySelectorAll('.card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.dataset.id));
  });
  document.querySelectorAll('.column').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const status = col.dataset.status;
      try {
        await api(`/api/repairs/${id}`, { method: 'PATCH', body: { status } });
        toast('Status oppdatert', 'ok');
        await refresh();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
  document.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openRepairDialog(Number(b.dataset.edit))));
  document.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => deleteRepair(Number(b.dataset.del))));
}

// ---------- Kalender ----------
const CAL_START = 7 * 60;   // 07:00
const CAL_END = 19 * 60;    // 19:00
const PX_PER_MIN = 56 / 60; // 56px per time
let calDate = new Date();

function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function renderCalendar() {
  const el = document.getElementById('calendar');
  const label = calDate.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('cal-date').textContent = label;

  const techs = technicians.filter((t) => t.active);
  if (!techs.length) {
    el.innerHTML = '<div class="empty">Ingen aktive teknikere.</div>';
    return;
  }
  el.style.setProperty('--cols', techs.length);

  const sameDay = (iso) => new Date(iso).toDateString() === calDate.toDateString();
  const hours = [];
  for (let h = CAL_START / 60; h < CAL_END / 60; h++) hours.push(h);

  const head = `
    <div class="cal-head">
      <div></div>
      ${techs.map((t) => `<div class="cal-tech">${escapeHtml(t.name)}<span class="cal-win">${t.workStart}–${t.workEnd}</span></div>`).join('')}
    </div>`;

  const cols = techs.map((t) => {
    const winTop = (toMin(t.workStart) - CAL_START) * PX_PER_MIN;
    const winH = (toMin(t.workEnd) - toMin(t.workStart)) * PX_PER_MIN;
    const items = repairs.filter((r) => r.technicianId === t.id && r.scheduledAt && sameDay(r.scheduledAt));
    const blocks = items.map((r) => {
      const s = new Date(r.scheduledAt);
      const e = new Date(r.scheduledEnd);
      const top = (s.getHours() * 60 + s.getMinutes() - CAL_START) * PX_PER_MIN;
      const h = Math.max(22, ((e - s) / 60000) * PX_PER_MIN);
      return `<div class="cal-block prio-${r.priority}" style="top:${top}px;height:${h}px" title="${escapeHtml(r.customerName)} – ${escapeHtml(r.problem || '')}">
        <b>${r.ticket}</b>${escapeHtml(r.device || r.category)}
        <span>${s.toTimeString().slice(0, 5)}–${e.toTimeString().slice(0, 5)}</span>
      </div>`;
    }).join('');
    return `<div class="cal-col"><div class="cal-window" style="top:${winTop}px;height:${winH}px"></div>${blocks}</div>`;
  }).join('');

  el.innerHTML = `${head}
    <div class="cal-body">
      <div class="cal-axis">${hours.map((h) => `<div>${String(h).padStart(2, '0')}:00</div>`).join('')}</div>
      ${cols}
    </div>`;
}

document.getElementById('cal-prev').addEventListener('click', () => { calDate.setDate(calDate.getDate() - 1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calDate.setDate(calDate.getDate() + 1); renderCalendar(); });
document.getElementById('cal-today').addEventListener('click', () => { calDate = new Date(); renderCalendar(); });

// ---------- Teknikere ----------
function renderTechnicians() {
  const grid = document.getElementById('tech-grid');
  if (!technicians.length) {
    grid.innerHTML = '<div class="empty">Ingen teknikere ennå. Legg til én for å komme i gang.</div>';
    return;
  }
  const loads = {};
  repairs.forEach((r) => {
    if (r.technicianId != null && (r.status === 'tildelt' || r.status === 'under_arbeid')) {
      loads[r.technicianId] = (loads[r.technicianId] || 0) + 1;
    }
  });
  grid.innerHTML = technicians
    .map((t) => {
      const load = loads[t.id] || 0;
      const pct = Math.min(100, Math.round((load / t.capacity) * 100));
      const full = load >= t.capacity;
      const pending = t.nextWindow
        ? `<div class="pending">Ny arbeidstid ${t.nextWindow.workStart}–${t.nextWindow.workEnd} fra ${new Date(t.nextWindow.effectiveFrom).toLocaleDateString('nb-NO', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>`
        : '';
      return `
        <div class="tech-card">
          <h3><span class="status-dot ${t.active ? 'dot-on' : 'dot-off'}"></span>${escapeHtml(t.name)}</h3>
          <div class="win">Arbeidstid: <b>${t.workStart}–${t.workEnd}</b></div>
          ${pending}
          <div class="specs">
            ${(t.specialties.length ? t.specialties : ['Generalist'])
              .map((s) => `<span class="badge">${escapeHtml(s)}</span>`).join('')}
          </div>
          <div class="load-bar"><div class="${full ? 'full' : ''}" style="width:${pct}%"></div></div>
          <div class="load-label">Arbeidsmengde: ${load} / ${t.capacity}</div>
          <div class="earn">Tjent denne måneden: <b>${fmtKr(earnings[t.id])}</b></div>
          <a class="ics" href="/api/technicians/${t.id}/calendar.ics">📅 Kalender-abonnement (.ics)</a>
          <div class="actions">
            <button class="btn small ghost" data-tech-edit="${t.id}">Rediger</button>
            <button class="btn small danger" data-tech-del="${t.id}">Slett</button>
          </div>
        </div>`;
    })
    .join('');
  grid.querySelectorAll('[data-tech-edit]').forEach((b) =>
    b.addEventListener('click', () => openTechDialog(Number(b.dataset.techEdit))));
  grid.querySelectorAll('[data-tech-del]').forEach((b) =>
    b.addEventListener('click', () => deleteTech(Number(b.dataset.techDel))));
}

// ---------- Varsler ----------
let eventSource = null;

function renderMeSelect() {
  const sel = document.getElementById('me-select');
  const saved = Number(localStorage.getItem('meTechId')) || '';
  sel.innerHTML = '<option value="">– velg tekniker –</option>' + technicians
    .map((t) => `<option value="${t.id}" ${t.id === saved ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('');
}

document.getElementById('me-select').addEventListener('change', (e) => {
  localStorage.setItem('meTechId', e.target.value);
  if (eventSource) { eventSource.close(); eventSource = null; }
  document.getElementById('notify-btn').classList.remove('on');
  document.getElementById('notify-btn').textContent = '🔔 Aktiver varsler';
});

document.getElementById('notify-btn').addEventListener('click', async () => {
  const techId = Number(document.getElementById('me-select').value);
  if (!techId) { toast('Velg hvem du er først', 'err'); return; }
  if ('Notification' in window && Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') toast('Nettleser-varsler er blokkert – du får varsler i appen i stedet', 'err');
  }
  startEventStream(techId);
  const btn = document.getElementById('notify-btn');
  btn.classList.add('on');
  btn.textContent = '🔔 Varsler på';
  toast('Varsler aktivert for ' + (techName(techId) || 'deg'), 'ok');
});

function startEventStream(techId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/events?technicianId=' + techId);
  eventSource.addEventListener('assigned', (e) => {
    const data = JSON.parse(e.data);
    const r = data.repair;
    const when = r.scheduledAt
      ? new Date(r.scheduledAt).toLocaleString('nb-NO', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'ikke planlagt ennå';
    const body = `${r.ticket} · ${r.device || r.category} – ${r.customerName}\nPlanlagt: ${when}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔧 Ny reparasjon tildelt', { body });
    }
    toast(`🔔 Ny jobb til ${data.technicianName}: ${r.ticket} (${when})`, 'ok');
    refresh();
  });
}

// Gjenopprett varsler hvis teknikeren var valgt fra før
window.addEventListener('load', () => {
  const saved = Number(localStorage.getItem('meTechId'));
  if (saved && 'Notification' in window && Notification.permission === 'granted') {
    startEventStream(saved);
    const btn = document.getElementById('notify-btn');
    btn.classList.add('on');
    btn.textContent = '🔔 Varsler på';
  }
});

// ---------- Reparasjon-modal ----------
const repairDialog = document.getElementById('repair-dialog');
const repairForm = document.getElementById('repair-form');

function openRepairDialog(id = null) {
  repairForm.reset();
  repairForm.id.value = id || '';
  document.getElementById('repair-dialog-title').textContent = id ? 'Rediger reparasjon' : 'Ny reparasjon';
  fillSelect('repair-category', meta.categories);
  fillSelect('repair-priority', meta.priorities, prioLabel);
  if (id) {
    const r = repairs.find((x) => x.id === id);
    if (r) {
      repairForm.customerName.value = r.customerName;
      repairForm.phone.value = r.phone;
      repairForm.device.value = r.device;
      repairForm.problem.value = r.problem;
      repairForm.category.value = r.category;
      repairForm.priority.value = r.priority;
      repairForm.price.value = r.price;
      repairForm.durationMin.value = r.durationMin;
    }
  } else {
    repairForm.priority.value = 'normal';
    repairForm.price.value = 690;
    repairForm.durationMin.value = 45;
  }
  repairDialog.showModal();
}

repairForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(repairForm);
  const body = Object.fromEntries(fd.entries());
  const id = body.id;
  delete body.id;
  try {
    if (id) await api(`/api/repairs/${id}`, { method: 'PATCH', body });
    else await api('/api/repairs', { method: 'POST', body });
    repairDialog.close();
    toast('Reparasjon lagret', 'ok');
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
});

async function deleteRepair(id) {
  if (!confirm('Slette denne reparasjonen?')) return;
  try {
    await api(`/api/repairs/${id}`, { method: 'DELETE' });
    toast('Slettet', 'ok');
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
}

// ---------- Tekniker-modal ----------
const techDialog = document.getElementById('tech-dialog');
const techForm = document.getElementById('tech-form');
let selectedSpecs = new Set();

function openTechDialog(id = null) {
  techForm.reset();
  techForm.id.value = id || '';
  document.getElementById('tech-dialog-title').textContent = id ? 'Rediger tekniker' : 'Ny tekniker';
  selectedSpecs = new Set();
  if (id) {
    const tech = technicians.find((x) => x.id === id);
    if (tech) {
      techForm.name.value = tech.name;
      techForm.capacity.value = tech.capacity;
      techForm.active.checked = tech.active;
      techForm.workStart.value = tech.nextWindow ? tech.nextWindow.workStart : tech.workStart;
      techForm.workEnd.value = tech.nextWindow ? tech.nextWindow.workEnd : tech.workEnd;
      selectedSpecs = new Set(tech.specialties);
    }
  }
  renderSpecChips();
  techDialog.showModal();
}

function renderSpecChips() {
  const box = document.getElementById('specialties-box');
  box.innerHTML = meta.categories
    .map((c) => `<span class="chip ${selectedSpecs.has(c) ? 'selected' : ''}" data-spec="${c}">${c}</span>`)
    .join('');
  box.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      const s = chip.dataset.spec;
      if (selectedSpecs.has(s)) selectedSpecs.delete(s);
      else selectedSpecs.add(s);
      chip.classList.toggle('selected');
    }));
}

techForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: techForm.name.value,
    capacity: Number(techForm.capacity.value),
    active: techForm.active.checked,
    specialties: [...selectedSpecs],
    workStart: techForm.workStart.value,
    workEnd: techForm.workEnd.value,
  };
  const id = techForm.id.value;
  try {
    let saved;
    if (id) saved = await api(`/api/technicians/${id}`, { method: 'PATCH', body });
    else saved = await api('/api/technicians', { method: 'POST', body });
    techDialog.close();
    if (saved.nextWindow) {
      const from = new Date(saved.nextWindow.effectiveFrom).toLocaleDateString('nb-NO', { weekday: 'long', day: '2-digit', month: '2-digit' });
      toast(`Lagret – ny arbeidstid gjelder fra ${from}`, 'ok');
    } else {
      toast('Tekniker lagret', 'ok');
    }
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
});

async function deleteTech(id) {
  if (!confirm('Slette denne teknikeren? Aktive jobber settes tilbake til «Mottatt».')) return;
  try {
    await api(`/api/technicians/${id}`, { method: 'DELETE' });
    toast('Tekniker slettet', 'ok');
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
}

// ---------- Fordeling ----------
document.getElementById('distribute-btn').addEventListener('click', async () => {
  try {
    const res = await api('/api/distribute', { method: 'POST' });
    if (res.assigned === 0 && res.unassigned === 0) toast('Ingen ufordelte reparasjoner', 'ok');
    else toast(`Fordelte ${res.assigned} reparasjon(er) og la dem i kalenderen` + (res.unassigned ? ` – ${res.unassigned} uten ledig tekniker` : ''), 'ok');
    await refresh();
  } catch (err) { toast(err.message, 'err'); }
});

// ---------- Div hjelpere ----------
function fillSelect(id, values, labelFn = (x) => x) {
  document.getElementById(id).innerHTML = values
    .map((v) => `<option value="${v}">${labelFn(v)}</option>`).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4000);
}

// Faner
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById('view-' + tab.dataset.view).classList.remove('hidden');
    if (tab.dataset.view === 'calendar') renderCalendar();
  }));

document.getElementById('new-repair-btn').addEventListener('click', () => openRepairDialog());
document.getElementById('new-tech-btn').addEventListener('click', () => openTechDialog());
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Oppstart ----------
(async function init() {
  try {
    meta = await api('/api/meta');
    await refresh();
  } catch (err) {
    toast('Kunne ikke laste data: ' + err.message, 'err');
  }
})();
