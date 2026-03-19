// public/js/pages/organisator/subkampen.js — Subkampen beheer (CRUD + volgorde)

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml } from '../../utils/escape.js';
import { buildModals, vulGroepenEnVerenigingen, openSubkampModal, openConfirm }
  from './subkampen-modals.js';

let subkampen   = [];
let editieId    = null;
let isDragging  = null;

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#127979; Subkampen</h1>
        <p>Beheer subkampen voor de actieve editie. Volgorde bepaalt de nummering.</p>
      </div>
      <button class="btn btn-primary" id="btn-nieuw-sub">+ Subkamp toevoegen</button>
    </div>
    <div id="stats-row" class="stats-row"></div>
    <div id="sub-lijst"></div>
    ${buildModals()}
  `;
}

export async function onMount() {
  // Laad actieve editie
  try {
    const editie = await get('/publiek/editie/actief');
    editieId = editie?.id ?? null;
  } catch { editieId = null; }

  if (!editieId) {
    document.getElementById('sub-lijst').innerHTML =
      `<div class="alert alert-warning"><span class="alert-icon">⚠️</span>Geen actieve editie gevonden.</div>`;
    return;
  }

  document.getElementById('btn-nieuw-sub').addEventListener('click', async () => {
    await laadKeuzes();
    openSubkampModal(null, opslaan);
  });

  await laadSubkampen();
}

// ── Data ──────────────────────────────────────────────────────────

async function laadSubkampen() {
  try {
    subkampen = await get(`/subkampen?editie_id=${editieId}`);
    renderStats();
    renderLijst();
  } catch (e) {
    document.getElementById('sub-lijst').innerHTML =
      `<div class="alert alert-error"><span class="alert-icon">❌</span>${escapeHtml(e.message)}</div>`;
  }
}

async function laadKeuzes() {
  try {
    const [groepen, verenigingen] = await Promise.all([
      get('/admin/groepen'),          // geeft { id, naam } met afkorting al verwerkt
      get('/admin/verenigingen'),
    ]);
    vulGroepenEnVerenigingen(groepen, verenigingen);
  } catch { /* stil */ }
}

// ── Render ────────────────────────────────────────────────────────

function renderStats() {
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-chip"><strong>${subkampen.length}</strong> subkamp${subkampen.length !== 1 ? 'en' : ''}</div>
    <div class="stat-chip">Volgorde = nummering patrouilles</div>
  `;
}

function renderLijst() {
  const container = document.getElementById('sub-lijst');
  if (!subkampen.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">&#127979;</div>
      <div class="empty-state-text">Nog geen subkampen aangemaakt</div></div>`;
    return;
  }
  container.innerHTML = `
    <div id="sub-drag-lijst" style="display:flex;flex-direction:column;gap:8px">
      ${subkampen.map((s, i) => buildRij(s, i)).join('')}
    </div>
    <p class="text-muted text-sm mt-8">&#9660; Sleep rijen om de volgorde (= nummering) aan te passen</p>
  `;
  bindEvents(container);
}

function buildRij(s, _i) {
  const koppeling = s.groep_naam
    ? `<span class="badge badge-muted" style="font-size:.75rem">&#128100; ${escapeHtml(s.groep_naam)}</span>`
    : s.vereniging_naam
      ? `<span class="badge badge-muted" style="font-size:.75rem">&#127960;&#65039; ${escapeHtml(s.vereniging_naam)}</span>`
      : '';
  const jongstelabel = s.is_jongste
    ? `<span class="badge" style="font-size:.75rem;background:var(--color-warning);color:#000">&#11088; Jongste subkamp</span>`
    : '';
  return `
    <div class="card" draggable="true" data-sub-id="${s.id}" data-volgorde="${s.volgorde}"
         style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:grab">
      <span style="color:var(--color-muted);font-size:1.1rem;cursor:grab" title="Slepen">&#9783;</span>
      <span style="width:20px;height:20px;border-radius:50%;background:${escapeHtml(s.kleur)};
                   flex-shrink:0;border:2px solid rgba(255,255,255,0.2)"></span>
      <div style="flex:1">
        <strong>${escapeHtml(s.naam)}</strong>
        ${s.omschrijving ? `<span class="text-muted text-sm" style="margin-left:8px">${escapeHtml(s.omschrijving)}</span>` : ''}
        <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${koppeling}${jongstelabel}</div>
      </div>
      <span class="badge badge-muted" style="font-size:.75rem">#${s.volgorde}</span>
      <div style="display:flex;gap:4px">
        <button class="btn-icon btn-jongste-sub" data-id="${s.id}"
                title="${s.is_jongste ? 'Jongste subkamp uitschakelen' : 'Instellen als jongste subkamp'}"
                style="${s.is_jongste ? 'color:var(--color-warning)' : 'opacity:.45'}">&#11088;</button>
        <button class="btn-icon btn-edit-sub" data-id="${s.id}" title="Bewerken">&#9999;&#65039;</button>
        <button class="btn-icon btn-del-sub"  data-id="${s.id}" data-naam="${escapeHtml(s.naam)}"
                title="Verwijderen" style="color:var(--color-error)">&#128465;</button>
      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents(container) {
  container.querySelectorAll('.btn-jongste-sub').forEach(btn =>
    btn.addEventListener('click', async () => {
      try {
        await put(`/subkampen/${btn.dataset.id}/jongste`, {});
        await laadSubkampen();
      } catch (e) { alert('Fout: ' + e.message); }
    })
  );

  container.querySelectorAll('.btn-edit-sub').forEach(btn =>
    btn.addEventListener('click', async () => {
      const sub = subkampen.find(s => s.id === Number(btn.dataset.id));
      await laadKeuzes();
      openSubkampModal(sub, opslaan);
    })
  );

  container.querySelectorAll('.btn-del-sub').forEach(btn =>
    btn.addEventListener('click', () =>
      openConfirm('Subkamp verwijderen',
        `Weet je zeker dat je <strong>${escapeHtml(btn.dataset.naam)}</strong> wil verwijderen?`,
        async () => { await del(`/subkampen/${btn.dataset.id}`); await laadSubkampen(); }
      )
    )
  );

  // Drag-and-drop volgorde
  const lijst = document.getElementById('sub-drag-lijst');
  lijst.querySelectorAll('[draggable]').forEach(rij => {
    rij.addEventListener('dragstart', e => {
      isDragging = rij;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => rij.style.opacity = '0.4', 0);
    });
    rij.addEventListener('dragend', () => {
      rij.style.opacity = '';
      isDragging = null;
      slaVolgordeOp();
    });
    rij.addEventListener('dragover', e => {
      e.preventDefault();
      if (isDragging && isDragging !== rij) {
        const rect = rij.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        if (e.clientY < mid) lijst.insertBefore(isDragging, rij);
        else rij.after(isDragging);
      }
    });
  });
}

async function slaVolgordeOp() {
  const rijen = document.getElementById('sub-drag-lijst')?.querySelectorAll('[data-sub-id]');
  if (!rijen?.length) return;
  const items = [...rijen].map((r, i) => ({ id: Number(r.dataset.subId), volgorde: i + 1 }));
  try {
    await put('/subkampen/volgorde', { items });
    await laadSubkampen();
  } catch { /* stil */ }
}

// ── Opslaan ───────────────────────────────────────────────────────

async function opslaan(data, id) {
  if (id) {
    await put(`/subkampen/${id}`, data);
  } else {
    await post('/subkampen', { ...data, editie_id: editieId });
  }
  await laadSubkampen();
}
