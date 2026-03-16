// public/js/pages/admin/verenigingen.js — Verenigingen & groepen beheer

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml }          from '../../utils/escape.js';
import { buildModals, openVerenigingModal, openGroepModal, openConfirm } from './verenigingen-modals.js';

let verenigingen = [];
const expandedIds = new Set(); // bijhoudt welke kaarten open zijn
const geladen     = new Set(); // bijhoudt welke groepen al geladen zijn

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#127960;&#65039; Verenigingen</h1>
        <p>Beheer verenigingen en hun scouting-groepen</p>
      </div>
      <button class="btn btn-primary" id="btn-nieuwe-ver">+ Vereniging toevoegen</button>
    </div>

    <div class="filter-bar">
      <input class="form-input" type="search" id="zoek-ver" placeholder="Zoeken op naam of afkorting…" />
    </div>

    <div id="stats-row" class="stats-row"></div>
    <div id="ver-lijst"></div>

    ${buildModals()}`;
}

export async function onMount() {
  document.getElementById('btn-nieuwe-ver').addEventListener('click', () =>
    openVerenigingModal(null, opslaan)
  );
  document.getElementById('zoek-ver').addEventListener('input', e => renderLijst(e.target.value));

  await laadVerenigingen();
}

async function laadVerenigingen() {
  try {
    verenigingen = await get('/admin/verenigingen');
    renderStats();
    renderLijst();
  } catch (e) {
    document.getElementById('ver-lijst').innerHTML =
      `<div class="alert alert-error"><span class="alert-icon">❌</span>${escapeHtml(e.message)}</div>`;
  }
}

function renderStats() {
  const aantalGroepen = verenigingen.reduce((s, v) => s + Number(v.aantal_groepen), 0);
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-chip"><strong>${verenigingen.length}</strong> verenigingen</div>
    <div class="stat-chip"><strong>${aantalGroepen}</strong> groepen totaal</div>`;
}

function renderLijst(zoek = '') {
  const q = zoek.toLowerCase();
  const gefilterd = q
    ? verenigingen.filter(v => v.naam.toLowerCase().includes(q) || v.afkorting.toLowerCase().includes(q))
    : verenigingen;

  const container = document.getElementById('ver-lijst');

  if (!gefilterd.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#127960;&#65039;</div>
      <div class="empty-state-text">${q ? 'Geen resultaten gevonden' : 'Nog geen verenigingen aangemaakt'}</div></div>`;
    return;
  }

  container.innerHTML = gefilterd.map(v => buildVerenigingKaart(v)).join('');
  bindKaartEvents(container);
}

function buildVerenigingKaart(v) {
  const open = expandedIds.has(v.id);
  return `
    <div class="card mb-16" data-ver-id="${v.id}">
      <div class="card-header" style="cursor:pointer" data-toggle="${v.id}">
        <div class="card-title">
          <span style="font-size:1rem;transition:transform 0.2s;display:inline-block;transform:rotate(${open ? 90 : 0}deg)" id="chevron-${v.id}">&#9654;</span>
          <span class="badge badge-primary" style="font-size:0.85rem;padding:4px 10px">${escapeHtml(v.afkorting)}</span>
          <span>${escapeHtml(v.naam)}</span>
          <span class="badge badge-muted">${v.aantal_groepen} ${Number(v.aantal_groepen) === 1 ? 'groep' : 'groepen'}</span>
        </div>
        <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm btn-edit-ver" data-id="${v.id}" title="Bewerken">&#9999;&#65039; Bewerken</button>
          <button class="btn btn-ghost btn-sm btn-del-ver" data-id="${v.id}" style="color:var(--color-error)" title="Verwijderen">&#128465; Verwijderen</button>
        </div>
      </div>
      <div class="card-body" id="body-${v.id}" style="display:${open ? 'block' : 'none'}">
        <div id="groepen-${v.id}">
          <div class="text-muted text-sm" style="padding:8px 0">Laden…</div>
        </div>
      </div>
    </div>`;
}

function bindKaartEvents(container) {
  // Bewerk vereniging
  container.querySelectorAll('.btn-edit-ver').forEach(btn =>
    btn.addEventListener('click', () => {
      const ver = verenigingen.find(v => v.id === Number(btn.dataset.id));
      openVerenigingModal(ver, opslaan);
    })
  );

  // Verwijder vereniging
  container.querySelectorAll('.btn-del-ver').forEach(btn =>
    btn.addEventListener('click', () => {
      const ver = verenigingen.find(v => v.id === Number(btn.dataset.id));
      openConfirm(
        `Vereniging verwijderen`,
        `Weet je zeker dat je <strong>${escapeHtml(ver.naam)}</strong> wil verwijderen? Dit verwijdert ook alle gekoppelde groepen.`,
        async () => {
          await del(`/admin/verenigingen/${ver.id}`);
          await laadVerenigingen();
        }
      );
    })
  );

  // Toggle inklapbaar gedrag
  container.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', () => toggleKaart(Number(header.dataset.toggle)));
  });

  // Laad groepen voor al openstaande kaarten
  container.querySelectorAll('[data-ver-id]').forEach(kaart => {
    const id = Number(kaart.dataset.verId);
    if (expandedIds.has(id)) laadGroepenIndienNodig(id);
  });
}

function toggleKaart(id) {
  const body    = document.getElementById(`body-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  if (!body) return;

  if (expandedIds.has(id)) {
    expandedIds.delete(id);
    body.style.display    = 'none';
    chevron.style.transform = 'rotate(0deg)';
  } else {
    expandedIds.add(id);
    body.style.display    = 'block';
    chevron.style.transform = 'rotate(90deg)';
    laadGroepenIndienNodig(id);
  }
}

function laadGroepenIndienNodig(id) {
  if (!geladen.has(id)) {
    geladen.add(id);
    laadGroepen(id);
  }
}

async function laadGroepen(verenigingId) {
  const container = document.getElementById(`groepen-${verenigingId}`);
  if (!container) return;
  try {
    const ver = await get(`/admin/verenigingen/${verenigingId}`);
    renderGroepen(container, ver);
  } catch { container.innerHTML = '<span class="text-muted text-sm">Fout bij laden</span>'; }
}

function renderGroepen(container, ver) {
  const groepen = ver.groepen ?? [];
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px" id="groep-lijst-${ver.id}">
      ${groepen.map(g => buildGroepRij(g, ver.id)).join('') || '<span class="text-muted text-sm">Geen groepen</span>'}
    </div>
    <button class="btn btn-ghost btn-sm mt-8 btn-add-groep" data-ver-id="${ver.id}"
            style="color:var(--color-success)">+ Groep toevoegen</button>`;

  container.querySelector('.btn-add-groep').addEventListener('click', () =>
    openGroepModal(null, ver.id, ver.naam, opslaanGroep)
  );

  container.querySelectorAll('.btn-edit-groep').forEach(btn =>
    btn.addEventListener('click', () => {
      const groep = groepen.find(g => g.id === Number(btn.dataset.id));
      openGroepModal(groep, ver.id, ver.naam, opslaanGroep);
    })
  );

  container.querySelectorAll('.btn-del-groep').forEach(btn =>
    btn.addEventListener('click', () => {
      const groep = groepen.find(g => g.id === Number(btn.dataset.id));
      openConfirm('Groep verwijderen',
        `Weet je zeker dat je <strong>${escapeHtml(groep.naam)}</strong> wil verwijderen?`,
        async () => {
          await del(`/admin/verenigingen/groepen/${groep.id}`);
          await laadGroepen(ver.id);
          // Bijwerken groepstelling in kaart
          const verObj = verenigingen.find(v => v.id === ver.id);
          if (verObj) { verObj.aantal_groepen = Math.max(0, Number(verObj.aantal_groepen) - 1); renderStats(); }
        }
      );
    })
  );
}

function buildGroepRij(g, _verId) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:8px 12px;background:var(--color-bg);border-radius:var(--radius-md);
                border:1px solid var(--color-border)">
      <span style="font-size:0.875rem">&#128100; ${escapeHtml(g.naam)}</span>
      <div style="display:flex;gap:4px">
        <button class="btn-icon btn-edit-groep" data-id="${g.id}" title="Bewerken">&#9999;&#65039;</button>
        <button class="btn-icon btn-del-groep" data-id="${g.id}" title="Verwijderen" style="color:var(--color-error)">&#128465;</button>
      </div>
    </div>`;
}

// ── Opslaan handlers ──────────────────────────────────────────────

async function opslaan(data, id) {
  if (id) {
    const bijgewerkt = await put(`/admin/verenigingen/${id}`, data);
    const idx = verenigingen.findIndex(v => v.id === id);
    if (idx !== -1) verenigingen[idx] = { ...verenigingen[idx], ...bijgewerkt };
  } else {
    const nieuw = await post('/admin/verenigingen', data);
    nieuw.aantal_groepen = 0;
    verenigingen.push(nieuw);
  }
  renderStats();
  renderLijst(document.getElementById('zoek-ver')?.value ?? '');
}

async function opslaanGroep(data, groepId, verenigingId) {
  if (groepId) {
    await put(`/admin/verenigingen/groepen/${groepId}`, data);
  } else {
    await post(`/admin/verenigingen/${verenigingId}/groepen`, data);
    const ver = verenigingen.find(v => v.id === verenigingId);
    if (ver) { ver.aantal_groepen = Number(ver.aantal_groepen) + 1; renderStats(); }
  }
  geladen.delete(verenigingId); // forceer herlaad
  await laadGroepen(verenigingId);
  geladen.add(verenigingId);
}
