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
  [technicians, repairs] = await Promise.all([
    api('/api/technicians'),
    api('/api/repairs'),
  ]);
  const stats = await api('/api/stats');
  renderStats(stats);
  renderBoard();
  renderTechnicians();
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
      <div class="meta">
        <span class="badge">${prioLabel(r.priority)}</span>
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
      return `
        <div class="tech-card">
          <h3><span class="status-dot ${t.active ? 'dot-on' : 'dot-off'}"></span>${escapeHtml(t.name)}</h3>
          <div class="specs">
            ${(t.specialties.length ? t.specialties : ['Generalist'])
              .map((s) => `<span class="badge">${escapeHtml(s)}</span>`).join('')}
          </div>
          <div class="load-bar"><div class="${full ? 'full' : ''}" style="width:${pct}%"></div></div>
          <div class="load-label">Arbeidsmengde: ${load} / ${t.capacity}</div>
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
    }
  } else {
    repairForm.priority.value = 'normal';
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
  let tech = null;
  if (id) {
    tech = technicians.find((x) => x.id === id);
    if (tech) {
      techForm.name.value = tech.name;
      techForm.capacity.value = tech.capacity;
      techForm.active.checked = tech.active;
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
  };
  const id = techForm.id.value;
  try {
    if (id) await api(`/api/technicians/${id}`, { method: 'PATCH', body });
    else await api('/api/technicians', { method: 'POST', body });
    techDialog.close();
    toast('Tekniker lagret', 'ok');
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
    else toast(`Fordelte ${res.assigned} reparasjon(er)` + (res.unassigned ? `, ${res.unassigned} uten ledig tekniker` : ''), 'ok');
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
  toastTimer = setTimeout(() => (el.className = 'toast'), 3000);
}

// Faner
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById('view-' + tab.dataset.view).classList.remove('hidden');
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
