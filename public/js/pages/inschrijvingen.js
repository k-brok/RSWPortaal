// public/js/pages/inschrijvingen.js — Patrouille-inschrijving (leiding / organisator / admin)

import { get, post, put, del, patch } from '../services/api.js';
import { escapeHtml } from '../utils/escape.js';
import { getUser }    from '../services/auth.js';
import { notify }     from '../utils/notify.js';
import { drukScorekaartAf, drukAlleScorekaarten } from '../services/scorekaart-pdf.js';

// ── State ──────────────────────────────────────────────────────────
let leidingStatus = null;  // { editie, fase, patrouilles }
let orgData       = null;  // { editie, fase, patrouilles }
let groepen       = [];
let openRijen     = new Set();
let dragInfo      = null;

// Filter state (org-view) — bewaard tussen her-renders
let filterZoek     = '';
let filterAanwezig = 'alle'; // 'alle' | 'aanwezig' | 'niet'
let filterStatus   = 'alle'; // 'alle' | 'ok' | 'bm'

function isOrg() {
  return ['admin', 'organisator'].includes(getUser()?.rol);
}

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div id="inschrijv-berichten"></div>
    <div id="inschrijv-inhoud"><div class="text-muted">Laden…</div></div>
    ${isOrg() ? modalPatrouilleHtml() : leidingModalsHtml()}
  `;
}

export async function onMount() {
  if (isOrg()) {
    await Promise.all([laadOrgData(), laadGroepen()]);
  } else {
    await laadLeidingStatus();
  }
}

export function onDestroy() {}

// ══════════════════════════════════════════════════════════════════
// LEIDING VIEW
// ══════════════════════════════════════════════════════════════════

async function laadLeidingStatus() {
  try {
    leidingStatus = await get('/inschrijving/status');
    renderLeidingPagina();
    laadHistorisch(); // asynchroon laden, geen await
  } catch (e) {
    document.getElementById('inschrijv-inhoud').innerHTML =
      `<div class="alert alert-error"><span class="alert-icon">❌</span>${escapeHtml(e.message)}</div>`;
  }
}

function renderLeidingPagina() {
  const { editie, fase, patrouilles, melding } = leidingStatus;
  const el = document.getElementById('inschrijv-inhoud');

  if (!editie) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><span class="material-icons">event</span></div>
      <div class="empty-state-text">Er is momenteel geen actieve editie</div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1><span class="material-icons">assignment</span> Inschrijving ${escapeHtml(editie.naam)}</h1>
        <p>${faseBadge(fase, editie)}</p>
      </div>
      ${fase === 'voorinschrijving' && !melding
        ? `<button class="btn btn-primary" id="btn-nieuwe-pat">+ Patrouille aanmaken</button>` : ''}
    </div>
    ${melding ? `<div class="alert alert-warning mb-16" style="flex-direction:column;align-items:flex-start;gap:4px">
      <div style="display:flex;align-items:center;gap:8px"><span class="material-icons">warning</span><strong>Geen groep gekoppeld</strong></div>
      <div style="font-size:.9rem">${escapeHtml(melding)}</div></div>` : ''}
    ${faseInfo(fase, editie)}
    <div id="patrouille-lijst">
      ${patrouilles.length ? patrouilles.map(p => leidingKaart(p, fase, editie)).join('') : legeStatus(fase)}
    </div>`;

  if (fase === 'voorinschrijving') {
    document.getElementById('btn-nieuwe-pat')?.addEventListener('click', () =>
      openPatModal(null, true, async (data) => {
        await post('/inschrijving/patrouilles', data);
        await laadLeidingStatus();
      })
    );
  }
  bindLeidingEvents(fase, editie);
}

function faseBadge(fase, editie) {
  if (fase === 'voorinschrijving') {
    const sluit = editie.voorinschrijving_sluit ? ` — sluit ${new Date(editie.voorinschrijving_sluit).toLocaleDateString('nl-NL')}` : '';
    return `<span class="badge badge-info">Voorinschrijving open${sluit}</span>`;
  }
  if (fase === 'inschrijving') {
    const sluit = editie.inschrijving_sluit ? ` — sluit ${new Date(editie.inschrijving_sluit).toLocaleDateString('nl-NL')}` : '';
    return `<span class="badge badge-primary">Inschrijving open${sluit}</span>`;
  }
  return `<span class="badge">Inschrijving gesloten</span>`;
}

function faseInfo(fase, editie) {
  if (fase === 'voorinschrijving') return `<div class="alert alert-info mb-16" style="background:var(--color-surface-alt)">
    <span class="alert-icon"><span class="material-icons">info</span></span>
    <span>Meld je patrouilles aan. Je kunt in de inschrijvingsfase namen wijzigen en scouts toevoegen.</span></div>`;
  if (fase === 'inschrijving') return `<div class="alert alert-info mb-16" style="background:var(--color-surface-alt)">
    <span class="alert-icon"><span class="material-icons">info</span></span>
    <span>Scouts toevoegen en namen wijzigen. Scouts: ${editie.min_scouts}–${editie.max_scouts} per patrouille,
    leeftijd ${editie.min_leeftijd ?? '?'}–${editie.max_leeftijd ?? '?'} jaar op LSW.</span></div>`;
  return '';
}

function legeStatus(fase) {
  const tekst = fase === 'gesloten' ? 'Inschrijving is momenteel gesloten'
    : `Nog geen patrouilles aangemeld${fase === 'voorinschrijving' ? ' — klik op "+ Patrouille aanmaken"' : ''}`;
  return `<div class="empty-state"><div class="empty-state-icon"><span class="material-icons">person</span></div><div class="empty-state-text">${tekst}</div></div>`;
}

function leidingKaart(p, fase, editie) {
  const bmBadge = p.buiten_mededinging
    ? `<span class="badge badge-warning" title="${escapeHtml(p.bm_reden ?? '')}">${escapeHtml(editie.bm_label ?? 'Buiten mededinging')}</span>` : '';
  const jongsteBadge = p.jongste ? '<span class="badge badge-muted">Jongste</span>' : '';
  const aantalBadge  = `<span class="badge badge-muted">${p.aantal_deelnemers ?? 0} scouts</span>`;
  return `
    <div class="card mb-16 patrouille-kaart" data-pat-id="${p.id}">
      <div class="card-header">
        <div class="card-title">
          <span style="font-weight:600">${escapeHtml(p.naam)}</span>
          ${jongsteBadge} ${aantalBadge} ${bmBadge}
        </div>
        <div style="display:flex;gap:6px">
          ${editie.uitslagen_gepubliceerd ? `<button class="btn btn-ghost btn-sm btn-scorekaart-pat" data-id="${p.id}"><span class="material-icons">print</span> Scorekaart</button>` : ''}
          ${fase !== 'gesloten' ? `<button class="btn btn-ghost btn-sm btn-edit-pat" data-id="${p.id}"><span class="material-icons">edit</span> Naam wijzigen</button>` : ''}
          ${fase === 'voorinschrijving' ? `<button class="btn btn-ghost btn-sm btn-del-pat" data-id="${p.id}" data-naam="${escapeHtml(p.naam)}"
            style="color:var(--color-error)"><span class="material-icons">delete</span> Verwijderen</button>` : ''}
        </div>
      </div>
      <div class="card-body" style="padding-top:0">
        ${fase === 'inschrijving' ? `<div id="scouts-detail-${p.id}" class="text-muted text-sm">Laden…</div>`
          : fase === 'voorinschrijving' ? '<p class="text-muted text-sm">Scouts toevoegen kan tijdens de inschrijvingsperiode.</p>'
          : ''}
      </div>
    </div>`;
}

function bindLeidingEvents(fase, editie) {
  document.querySelectorAll('.btn-scorekaart-pat').forEach(btn =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Laden…';
      try { await drukScorekaartAf(Number(btn.dataset.id)); }
      catch (e) { notify.error('Fout bij genereren scorekaart: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<span class="material-icons">print</span> Scorekaart'; }
    })
  );
  document.querySelectorAll('.btn-edit-pat').forEach(btn =>
    btn.addEventListener('click', () => {
      const p = leidingStatus.patrouilles.find(x => x.id === Number(btn.dataset.id));
      openPatModal(p, fase === 'voorinschrijving', async (data, id) => {
        await put(`/inschrijving/patrouilles/${id}`, data);
        await laadLeidingStatus();
      });
    })
  );
  document.querySelectorAll('.btn-del-pat').forEach(btn =>
    btn.addEventListener('click', () =>
      openConfirmDialog('Patrouille verwijderen',
        `Weet je zeker dat je <strong>${escapeHtml(btn.dataset.naam)}</strong> wilt verwijderen?`,
        async () => { await del(`/inschrijving/patrouilles/${btn.dataset.id}`); await laadLeidingStatus(); }
      )
    )
  );
  if (fase === 'inschrijving') {
    leidingStatus.patrouilles.forEach(p => laadDeelnemers(p.id, editie));
  }
}

// ── Deelnemers (inline) ────────────────────────────────────────────

async function laadDeelnemers(patId, editie) {
  const el = document.getElementById(`scouts-detail-${patId}`);
  if (!el) return;
  try {
    const p = await get(`/inschrijving/patrouilles/${patId}`);
    el.innerHTML = renderDeelnemersTabl(p, editie);
    bindDeelnemerActies(patId, editie);
    inlineNieuw(patId, editie);
  } catch (e) { el.innerHTML = `<span class="text-muted">${escapeHtml(e.message)}</span>`; }
}

function renderDeelnemersTabl(p, editie) {
  const lsw = editie.lsw_datum;
  return `<table class="data-table" style="font-size:.83rem;margin-bottom:4px;">
    <thead><tr><th>Naam</th><th>Geboortedatum</th>${lsw ? '<th>Leeftijd LSW</th>' : ''}<th></th></tr></thead>
    <tbody>${p.deelnemers.map(d => {
      const leeftijd = lsw ? berekenLeeftijd(d.geboortedatum, lsw) : null;
      return `<tr data-d-id="${d.id}">
        <td>${escapeHtml(d.achternaam)}, ${escapeHtml(d.voornaam)}</td>
        <td>${d.geboortedatum ? new Date(d.geboortedatum).toLocaleDateString('nl-NL') : '—'}</td>
        ${lsw ? `<td>${leeftijd ?? '—'} j</td>` : ''}
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-outline" data-actie-d="bewerk" data-d-id="${d.id}"
            data-voornaam="${escapeHtml(d.voornaam)}" data-achternaam="${escapeHtml(d.achternaam)}"
            data-geb="${d.geboortedatum ? d.geboortedatum.split('T')[0] : ''}" data-pat-id="${p.id}">Bewerk</button>
          <button class="btn btn-sm btn-danger" data-actie-d="verwijder" data-d-id="${d.id}"
            data-naam="${escapeHtml(d.voornaam + ' ' + d.achternaam)}">Verwijder</button>
        </div></td></tr>`;
    }).join('')}</tbody></table>`;
}

function bindDeelnemerActies(patId, editie) {
  document.getElementById(`scouts-detail-${patId}`)?.querySelectorAll('[data-actie-d]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.actieD === 'bewerk') {
        inlineBewerk({ id: Number(btn.dataset.dId), voornaam: btn.dataset.voornaam,
          achternaam: btn.dataset.achternaam, geboortedatum: btn.dataset.geb }, Number(btn.dataset.patId), editie);
      } else if (btn.dataset.actieD === 'verwijder') {
        if (!confirm(`Scout "${btn.dataset.naam}" verwijderen?`)) return;
        try { await del(`/inschrijving/deelnemers/${btn.dataset.dId}`); await laadDeelnemers(patId, editie); await herlaadBadge(patId); }
        catch (e) { notify.error(e.message); }
      }
    });
  });
}

function inlineBewerk(d, patId, editie) {
  const tr = document.querySelector(`#scouts-detail-${patId} tr[data-d-id="${d.id}"]`);
  if (!tr || tr.dataset.editing) return;
  tr.dataset.editing = '1';
  const lsw = editie.lsw_datum;
  tr.innerHTML = `
    <td style="padding:4px 6px"><div style="display:flex;gap:4px">
      <input id="ib-vn-${d.id}" type="text" class="form-input" style="width:88px;padding:3px 6px;font-size:.83rem" value="${escapeHtml(d.voornaam)}" placeholder="Voornaam">
      <input id="ib-an-${d.id}" type="text" class="form-input" style="width:108px;padding:3px 6px;font-size:.83rem" value="${escapeHtml(d.achternaam)}" placeholder="Achternaam">
    </div></td>
    <td style="padding:4px 6px"><input id="ib-gb-${d.id}" type="date" class="form-input" style="padding:3px 6px;font-size:.83rem" value="${d.geboortedatum ?? ''}"></td>
    ${lsw ? '<td></td>' : ''}
    <td style="padding:4px 6px"><button id="ib-cancel-${d.id}" class="btn btn-sm btn-ghost">Annuleer</button></td>`;
  document.getElementById(`ib-vn-${d.id}`).focus();
  let bezig = false;
  async function slaOp() {
    if (bezig) return;
    const body = { voornaam: document.getElementById(`ib-vn-${d.id}`)?.value.trim(),
      achternaam: document.getElementById(`ib-an-${d.id}`)?.value.trim(),
      geboortedatum: document.getElementById(`ib-gb-${d.id}`)?.value };
    if (!body.voornaam || !body.achternaam || !body.geboortedatum) return;
    bezig = true;
    try { await put(`/inschrijving/deelnemers/${d.id}`, body); await laadDeelnemers(patId, editie); await herlaadBadge(patId); }
    catch (e) { bezig = false; notify.error(e.message); }
  }
  [`ib-vn-${d.id}`,`ib-an-${d.id}`,`ib-gb-${d.id}`].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('blur', slaOp);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); slaOp(); } });
  });
  document.getElementById(`ib-cancel-${d.id}`).addEventListener('click', () => laadDeelnemers(patId, editie));
}

function inlineNieuw(patId, editie) {
  const detailEl = document.getElementById(`scouts-detail-${patId}`);
  if (!detailEl || detailEl.querySelector('.nieuw-rij')) return;
  const lsw = editie.lsw_datum;
  let tbody = detailEl.querySelector('tbody');
  if (!tbody) {
    detailEl.insertAdjacentHTML('beforeend', `<table class="data-table" style="font-size:.83rem;margin-bottom:4px;">
      <thead><tr><th>Naam</th><th>Geboortedatum</th>${lsw ? '<th>Leeftijd LSW</th>' : ''}<th></th></tr></thead><tbody></tbody></table>`);
    tbody = detailEl.querySelector('tbody');
  }
  tbody.insertAdjacentHTML('beforeend', `<tr class="nieuw-rij" style="background:var(--color-surface-alt)">
    <td style="padding:6px 8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <input id="nb-vn-${patId}" type="text" class="form-input" style="flex:1;min-width:100px;padding:4px 8px;font-size:.83rem" placeholder="Voornaam">
        <input id="nb-an-${patId}" type="text" class="form-input" style="flex:1;min-width:120px;padding:4px 8px;font-size:.83rem" placeholder="Achternaam">
      </div>
    </td>
    <td style="padding:6px 8px"><input id="nb-gb-${patId}" type="date" class="form-input" style="padding:4px 8px;font-size:.83rem"></td>
    ${lsw ? '<td></td>' : ''}
    <td style="padding:6px 8px;white-space:nowrap">
      <button id="nb-opslaan-${patId}" class="btn btn-sm btn-primary">+ Toevoegen</button>
      <button id="nb-cancel-${patId}" class="btn btn-sm btn-ghost">Annuleer</button>
    </td>
  </tr>`);
  document.getElementById(`nb-vn-${patId}`).focus();
  let bezig = false;
  async function slaOp() {
    if (bezig) return;
    const body = { voornaam: document.getElementById(`nb-vn-${patId}`)?.value.trim(),
      achternaam: document.getElementById(`nb-an-${patId}`)?.value.trim(),
      geboortedatum: document.getElementById(`nb-gb-${patId}`)?.value };
    if (!body.voornaam || !body.achternaam || !body.geboortedatum) return;
    bezig = true;
    try { await post(`/inschrijving/patrouilles/${patId}/deelnemers`, body); await laadDeelnemers(patId, editie); await herlaadBadge(patId); }
    catch (e) { bezig = false; notify.error(e.message); }
  }
  [`nb-vn-${patId}`,`nb-an-${patId}`,`nb-gb-${patId}`].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); slaOp(); } });
  });
  document.getElementById(`nb-opslaan-${patId}`).addEventListener('click', slaOp);
  document.getElementById(`nb-cancel-${patId}`).addEventListener('click', () => detailEl.querySelector('.nieuw-rij')?.remove());
}

async function herlaadBadge(patId) {
  try {
    const vers = await get('/inschrijving/status');
    const p = vers.patrouilles.find(x => x.id === patId);
    if (!p) return;
    leidingStatus.patrouilles = vers.patrouilles;
    const kaart = document.querySelector(`.patrouille-kaart[data-pat-id="${patId}"]`);
    if (!kaart) return;
    const editie = leidingStatus.editie;
    const titleEl = kaart.querySelector('.card-title');
    if (titleEl) titleEl.innerHTML = `<span style="font-weight:600">${escapeHtml(p.naam)}</span>
      ${p.jongste ? '<span class="badge badge-muted">Jongste</span>' : ''}
      <span class="badge badge-muted">${p.aantal_deelnemers ?? 0} scouts</span>
      ${p.buiten_mededinging ? `<span class="badge badge-warning">${escapeHtml(editie.bm_label ?? 'BM')}</span>` : ''}`;
  } catch (_) {}
}

// ── Historische edities ────────────────────────────────────────────

async function laadHistorisch() {
  const container = document.getElementById('inschrijv-inhoud');
  if (!container) return;

  // Voeg placeholder toe
  container.insertAdjacentHTML('beforeend',
    '<div id="historisch-sectie"><div class="text-muted text-sm" style="padding:8px 0">Eerdere edities laden…</div></div>');

  try {
    const historisch = await get('/inschrijving/historisch');
    const el = document.getElementById('historisch-sectie');
    if (!el) return;

    if (!historisch.length) {
      el.remove();
      return;
    }

    el.innerHTML = `
      <div style="margin-top:24px;border-top:1px solid var(--color-border);padding-top:20px">
        <h2 style="font-size:1rem;font-weight:600;margin-bottom:12px;color:var(--color-text-muted)">
          <span class="material-icons">content_paste</span> Eerdere edities
        </h2>
        ${historisch.map(({ editie, patrouilles }) => `
          <div class="card mb-16">
            <div class="card-header" style="cursor:pointer" data-hist-toggle="${editie.id}">
              <div class="card-title">
                <span style="font-weight:600">${escapeHtml(editie.naam)}</span>
                <span class="badge badge-muted">${patrouilles.length} patrouille${patrouilles.length !== 1 ? 's' : ''}</span>
                ${editie.uitslagen_gepubliceerd ? '<span class="badge badge-warning">Uitslagen gepubliceerd</span>' : ''}
              </div>
              <span style="color:var(--color-text-muted);font-size:.85rem">
                ${editie.lsw_datum ? new Date(editie.lsw_datum).toLocaleDateString('nl-NL') : ''}
                ${editie.locatie ? '· ' + escapeHtml(editie.locatie) : ''}
                <span class="material-icons" style="font-size:0.9rem">chevron_right</span>
              </span>
            </div>
            <div id="hist-detail-${editie.id}" style="display:none;padding:0 16px 16px">
              <table class="data-table" style="font-size:.85rem">
                <thead><tr><th>Patrouille</th><th style="text-align:center">Scouts</th><th>Status</th></tr></thead>
                <tbody>
                  ${patrouilles.map(p => `
                    <tr>
                      <td>${escapeHtml(p.naam)}${p.jongste ? ' <span class="badge badge-muted" style="font-size:.72rem">Jongste</span>' : ''}</td>
                      <td style="text-align:center">${p.aantal_deelnemers ?? 0}</td>
                      <td>${p.buiten_mededinging
                        ? `<span class="badge badge-warning">${escapeHtml(p.bm_label ?? 'BM')}</span>`
                        : '<span class="badge badge-success" style="font-size:.75rem">Meegedaan</span>'}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      </div>`;

    el.querySelectorAll('[data-hist-toggle]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const id    = hdr.dataset.histToggle;
        const detail = document.getElementById(`hist-detail-${id}`);
        const pijl  = hdr.querySelector('span:last-child');
        if (!detail) return;
        const open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : '';
        if (pijl) pijl.innerHTML = open ? '<span class="material-icons" style="font-size:0.9rem">chevron_right</span>' : '<span class="material-icons" style="font-size:0.9rem">expand_more</span>';
      });
    });
  } catch (_) {
    document.getElementById('historisch-sectie')?.remove();
  }
}

function berekenLeeftijd(geboortedatum, refDatum) {
  const geb = new Date(geboortedatum), ref = new Date(refDatum);
  let l = ref.getFullYear() - geb.getFullYear();
  const m = ref.getMonth() - geb.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < geb.getDate())) l--;
  return l;
}

// ══════════════════════════════════════════════════════════════════
// ORGANISATOR / ADMIN VIEW
// ══════════════════════════════════════════════════════════════════

async function laadOrgData() {
  try { orgData = await get('/admin/inschrijvingen'); renderOrgPagina(); }
  catch (e) { toonBericht('error', e.message); }
}

async function laadGroepen() {
  try { groepen = await get('/admin/inschrijvingen/groepen'); }
  catch (_) { groepen = []; }
}

function renderOrgPagina() {
  const { editie, fase, patrouilles } = orgData;
  const el = document.getElementById('inschrijv-inhoud');
  if (!editie) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><span class="material-icons">event</span></div>
      <div class="empty-state-text">Geen actieve editie</div></div>`;
    return;
  }
  const totScouts      = patrouilles.reduce((s, p) => s + Number(p.aantal_deelnemers), 0);
  const bmCount        = patrouilles.filter(p => p.buiten_mededinging).length;
  const aangemeldCount = patrouilles.filter(p => p.aangemeld_bij_start).length;
  el.innerHTML = `
    <div class="page-header">
      <h1>Inschrijvingen ${escapeHtml(editie.naam)}</h1>
      <div style="display:flex;gap:8px">
        ${patrouilles.length ? `<button class="btn btn-outline" id="btn-alle-scorekaarten"><span class="material-icons">print</span> Alle scorekaarten</button>` : ''}
        <button class="btn btn-primary" id="btn-nieuw-pat">+ Patrouille</button>
      </div>
    </div>
    <div class="stats-row" style="margin-bottom:12px">
      <div class="stat-chip"><strong>${patrouilles.length}</strong> patrouilles</div>
      <div class="stat-chip"><strong>${totScouts}</strong> scouts</div>
      <div class="stat-chip"><strong>${patrouilles.filter(p=>p.jongste).length}</strong> jongste</div>
      ${bmCount ? `<div class="stat-chip" style="border-color:var(--color-warning)">
        <strong style="color:var(--color-warning)">${bmCount}</strong> ${escapeHtml(editie.bm_label ?? 'BM')}</div>` : ''}
      <div class="stat-chip stat-chip-aanwezig" style="border-color:var(--color-success)">
        <strong style="color:var(--color-success)">${aangemeldCount}</strong> / ${patrouilles.length} aanwezig</div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="padding:12px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="text-muted" style="font-size:.85rem">Fase:</span>
        <span class="badge ${fase === 'voorinschrijving' ? 'badge-info' : fase === 'inschrijving' ? 'badge-primary' : ''}">
          ${fase === 'voorinschrijving' ? 'Voorinschrijving open' : fase === 'inschrijving' ? 'Inschrijving open' : 'Gesloten'}
        </span>
        <span class="text-muted" style="font-size:.78rem;margin-left:8px">
          VI: ${editie.voorinschrijving_start?.slice(0,10) ?? '—'} – ${editie.voorinschrijving_sluit?.slice(0,10) ?? '…'} &nbsp;|&nbsp;
          Inschr: ${editie.inschrijving_start?.slice(0,10) ?? '—'} – ${editie.inschrijving_sluit?.slice(0,10) ?? '…'} &nbsp;|&nbsp;
          Scouts: ${editie.min_scouts}–${editie.max_scouts} &nbsp;|&nbsp;
          Leeftijd: ${editie.min_leeftijd ?? '?'}–${editie.max_leeftijd ?? '?'}j
        </span>
      </div>
    </div>
    ${patrouilles.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon"><span class="material-icons">person</span></div><div class="empty-state-text">Nog geen inschrijvingen</div></div>`
      : `<div class="card filter-card filter-card--open" id="pat-filter-card" style="margin-bottom:12px">
          <div class="filter-card-header" id="pat-filter-toggle">
            <span style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:.9rem">
              <span class="material-icons" style="font-size:1.1rem">filter_list</span> Filters
            </span>
            <span class="filter-card-pijl material-icons">expand_more</span>
          </div>
          <div class="filter-card-body">
            <input type="search" id="filt-zoek" class="form-input" placeholder="Zoeken op patrouille of groep…" value="${escapeHtml(filterZoek)}">
            <select id="filt-aanwezig" class="form-input">
              <option value="alle"     ${filterAanwezig === 'alle'     ? 'selected' : ''}>Alle patrouilles</option>
              <option value="aanwezig" ${filterAanwezig === 'aanwezig' ? 'selected' : ''}>Aanwezig</option>
              <option value="niet"     ${filterAanwezig === 'niet'     ? 'selected' : ''}>Niet aanwezig</option>
            </select>
            <select id="filt-status" class="form-input">
              <option value="alle" ${filterStatus === 'alle' ? 'selected' : ''}>Alle statussen</option>
              <option value="ok"   ${filterStatus === 'ok'   ? 'selected' : ''}>OK</option>
              <option value="bm"   ${filterStatus === 'bm'   ? 'selected' : ''}>Buiten mededinging</option>
            </select>
          </div>
        </div>
        <div class="card" style="overflow-x:auto"><table class="data-table" id="pat-tabel">
          <thead><tr>
            <th></th>
            <th>Groep</th>
            <th>Patrouille</th>
            <th class="col-mobile-hide" style="text-align:center" title="Jongste patrouille">J</th>
            <th style="text-align:center">Scouts</th>
            <th>Status</th>
            <th style="text-align:center" title="Aangemeld bij start RSW">Aanwezig</th>
            <th></th>
          </tr></thead>
          <tbody id="pat-tbody">${patrouilles.map(p => orgRijHtml(p, editie)).join('')}
            <tr id="pat-geen-resultaten" style="display:none">
              <td colspan="8" style="text-align:center;padding:24px;color:var(--color-text-muted)">Geen patrouilles gevonden voor dit filter</td>
            </tr>
          </tbody>
        </table></div>`}`;
  bindOrgPagina(editie);
}

function orgRijHtml(p, editie) {
  const bm = p.buiten_mededinging
    ? `<span class="badge badge-warning" title="${escapeHtml(p.bm_reden ?? '')}">${escapeHtml(editie.bm_label ?? 'BM')}</span>`
    : '<span class="badge badge-success" style="font-size:.75rem">OK</span>';
  const open = openRijen.has(p.id);
  const zoekTekst = `${p.naam} ${p.groep_naam}`.toLowerCase();
  return `
    <tr class="pat-rij" data-pat-id="${p.id}" style="cursor:pointer"
        data-zoek="${escapeHtml(zoekTekst)}"
        data-aangemeld="${p.aangemeld_bij_start ? '1' : '0'}"
        data-bm="${p.buiten_mededinging ? '1' : '0'}">
      <td style="width:28px;text-align:center;color:var(--color-primary)">${open ? '<span class="material-icons" style="font-size:1rem">expand_more</span>' : '<span class="material-icons" style="font-size:1rem">chevron_right</span>'}</td>
      <td>${escapeHtml(p.groep_naam)}</td>
      <td data-groep="${escapeHtml(p.groep_naam)}"><strong>${escapeHtml(p.naam)}</strong></td>
      <td class="col-mobile-hide" style="text-align:center">${p.jongste ? '✓' : ''}</td>
      <td style="text-align:center">${p.aantal_deelnemers}</td>
      <td>${bm}${p.bm_reden ? `<br><small class="text-muted">${escapeHtml(p.bm_reden)}</small>` : ''}</td>
      <td style="text-align:center" onclick="event.stopPropagation()">
        <input type="checkbox" class="chk-aangemeld" data-id="${p.id}"
          ${p.aangemeld_bij_start ? 'checked' : ''}
          title="Aangemeld bij start RSW"
          style="width:18px;height:18px;cursor:pointer;accent-color:var(--color-primary)">
      </td>
      <td><div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-ghost" data-actie="scorekaart" data-id="${p.id}" title="Scorekaart printen"><span class="material-icons">print</span></button>
        <button class="btn btn-sm btn-ghost" data-actie="bewerk" data-id="${p.id}" title="Bewerken"><span class="material-icons">edit</span></button>
        <button class="btn btn-sm btn-danger" data-actie="verwijder" data-id="${p.id}" title="Verwijderen"><span class="material-icons">delete</span></button>
      </div></td>
    </tr>
    <tr class="detail-rij" data-pat-id="${p.id}" style="${open ? '' : 'display:none'}">
      <td colspan="8" style="padding:0 0 0 40px;background:var(--color-surface-alt)">
        <div id="detail-${p.id}" style="padding:12px 12px 12px 0">${open ? '<em class="text-muted">Laden…</em>' : ''}</div>
      </td>
    </tr>`;
}

function bindOrgPagina(editie) {
  bindFilters();
  pasFilterToe();

  document.getElementById('btn-nieuw-pat')?.addEventListener('click', () => openOrgPatModal(null, editie.id));

  const btnAlle = document.getElementById('btn-alle-scorekaarten');
  if (btnAlle) {
    btnAlle.addEventListener('click', async () => {
      const ids = orgData.patrouilles.map(p => p.id);
      btnAlle.disabled = true;
      btnAlle.textContent = `Laden… (0/${ids.length})`;
      try { await drukAlleScorekaarten(ids, (n) => { btnAlle.textContent = `Laden… (${n}/${ids.length})`; }); }
      catch (e) { toonBericht('error', 'Fout bij genereren: ' + e.message); }
      finally { btnAlle.disabled = false; btnAlle.innerHTML = '&#128438; Alle scorekaarten'; }
    });
  }

  document.querySelectorAll('.pat-rij').forEach(rij => {
    rij.addEventListener('click', () => toggleDetail(Number(rij.dataset.patId), editie));
    rij.addEventListener('dragover', e => {
      if (!dragInfo || dragInfo.sourcePatId === Number(rij.dataset.patId)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      rij.style.outline = '2px dashed var(--color-primary)'; rij.style.outlineOffset = '-2px';
    });
    rij.addEventListener('dragleave', e => { if (!rij.contains(e.relatedTarget)) rij.style.outline = ''; });
    rij.addEventListener('drop', async e => {
      e.preventDefault(); rij.style.outline = '';
      if (!dragInfo) return;
      const targetPatId = Number(rij.dataset.patId);
      if (targetPatId !== dragInfo.sourcePatId) await doeVerplaats(dragInfo.deelnemerId, dragInfo.sourcePatId, targetPatId, editie);
    });
  });

  document.querySelectorAll('.detail-rij').forEach(detRij => {
    const targetPatId = Number(detRij.dataset.patId);
    detRij.addEventListener('dragover', e => {
      if (!dragInfo || dragInfo.sourcePatId === targetPatId) return;
      e.preventDefault(); detRij.style.outline = '2px dashed var(--color-primary)'; detRij.style.outlineOffset = '-2px';
    });
    detRij.addEventListener('dragleave', e => { if (!detRij.contains(e.relatedTarget)) detRij.style.outline = ''; });
    detRij.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation(); detRij.style.outline = '';
      if (!dragInfo || dragInfo.sourcePatId === targetPatId) return;
      await doeVerplaats(dragInfo.deelnemerId, dragInfo.sourcePatId, targetPatId, editie);
    });
  });

  document.querySelectorAll('.chk-aangemeld').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id = Number(chk.dataset.id);
      const waarde = chk.checked;
      chk.disabled = true;
      try {
        await patch(`/admin/inschrijvingen/patrouilles/${id}/aangemeld`, { aangemeld_bij_start: waarde });
        const p = orgData.patrouilles.find(x => x.id === id);
        if (p) p.aangemeld_bij_start = waarde ? 1 : 0;
        // Data-attribuut bijwerken voor filter
        chk.closest('.pat-rij')?.setAttribute('data-aangemeld', waarde ? '1' : '0');
        updateAangemeldChip();
        pasFilterToe();
      } catch (e) {
        chk.checked = !waarde;
        toonBericht('error', e.message);
      }
      chk.disabled = false;
    });
  });

  document.querySelectorAll('[data-actie]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.actie === 'scorekaart') {
        btn.disabled = true;
        try { await drukScorekaartAf(id); }
        catch (e) { toonBericht('error', 'Fout bij genereren scorekaart: ' + e.message); }
        finally { btn.disabled = false; }
      } else if (btn.dataset.actie === 'bewerk') {
        const p = orgData.patrouilles.find(x => x.id === id);
        if (p) openOrgPatModal(p, editie.id);
      } else if (btn.dataset.actie === 'verwijder') {
        const p = orgData.patrouilles.find(x => x.id === id);
        if (!confirm(`Patrouille "${p?.naam}" en alle scouts verwijderen?`)) return;
        try { await del(`/admin/inschrijvingen/patrouilles/${id}`); openRijen.delete(id); await laadOrgData(); }
        catch (e) { toonBericht('error', e.message); }
      }
    });
  });
}

async function toggleDetail(patId, editie) {
  const detailRij = document.querySelector(`.detail-rij[data-pat-id="${patId}"]`);
  const patRij    = document.querySelector(`.pat-rij[data-pat-id="${patId}"]`);
  if (!detailRij) return;
  if (openRijen.has(patId)) {
    openRijen.delete(patId); detailRij.style.display = 'none';
    patRij.querySelector('td:first-child').innerHTML = '<span class="material-icons" style="font-size:1rem">chevron_right</span>';
  } else {
    openRijen.add(patId); detailRij.style.display = '';
    patRij.querySelector('td:first-child').innerHTML = '<span class="material-icons" style="font-size:1rem">expand_more</span>';
    await laadOrgDetail(patId, editie);
  }
}

async function laadOrgDetail(patId, editie) {
  const el = document.getElementById(`detail-${patId}`);
  if (!el) return;
  try {
    const p = await get(`/admin/inschrijvingen/patrouilles/${patId}`);
    el.innerHTML = renderOrgDeelnemers(p, editie);
    bindOrgDeelnemerActies(patId, editie);
    orgInlineNieuw(patId, editie);
  } catch (e) { el.innerHTML = `<span class="text-muted">${escapeHtml(e.message)}</span>`; }
}

function renderOrgDeelnemers(p, editie) {
  const lsw = editie.lsw_datum;
  return `<div style="margin-bottom:8px"><strong style="font-size:.88rem">Scouts (${p.deelnemers.length})</strong></div>
    <table class="data-table" style="font-size:.83rem;margin-bottom:4px">
      <thead><tr>
        <th style="width:20px"></th>
        <th>Naam</th><th>Geboortedatum</th>${lsw ? '<th>Leeftijd LSW</th>' : ''}
        <th style="width:80px;text-align:center">Rol</th><th></th>
      </tr></thead>
      <tbody>${p.deelnemers.map(d => {
        const isPL = d.functie === 'PL', isAPL = d.functie === 'APL';
        return `<tr data-d-id="${d.id}" data-source-pat="${p.id}" data-functie="${d.functie ?? ''}" draggable="true" style="cursor:grab">
          <td style="text-align:center;color:var(--color-text-muted);user-select:none;padding:4px 6px"><span class="material-icons" style="font-size:1rem">drag_indicator</span></td>
          <td>${escapeHtml(d.achternaam)}, ${escapeHtml(d.voornaam)}</td>
          <td>${d.geboortedatum ? new Date(d.geboortedatum).toLocaleDateString('nl-NL') : '—'}</td>
          ${lsw ? `<td>${d.leeftijd_lsw ?? '—'} j</td>` : ''}
          <td style="padding:4px 6px;text-align:center;white-space:nowrap">
            <button class="btn btn-sm ${isPL ? 'btn-primary' : 'btn-ghost'}" data-actie-d="set-functie"
              data-d-id="${d.id}" data-pat-id="${p.id}" data-functie-doel="PL" style="padding:2px 7px;font-size:.75rem">PL</button>
            <button class="btn btn-sm ${isAPL ? 'btn-primary' : 'btn-ghost'}" data-actie-d="set-functie"
              data-d-id="${d.id}" data-pat-id="${p.id}" data-functie-doel="APL" style="padding:2px 7px;font-size:.75rem">APL</button>
          </td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-outline" data-actie-d="bewerk" data-d-id="${d.id}"
              data-voornaam="${escapeHtml(d.voornaam)}" data-achternaam="${escapeHtml(d.achternaam)}"
              data-geb="${d.geboortedatum ? d.geboortedatum.split('T')[0] : ''}" data-pat-id="${p.id}">Bewerk</button>
            <button class="btn btn-sm btn-danger" data-actie-d="verwijder" data-d-id="${d.id}" data-pat-id="${p.id}"
              data-naam="${escapeHtml(d.voornaam + ' ' + d.achternaam)}">Verwijder</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table>`;
}

function bindOrgDeelnemerActies(patId, editie) {
  const el = document.getElementById(`detail-${patId}`);
  if (!el) return;
  el.querySelectorAll('[data-actie-d]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const actie = btn.dataset.actieD;
      if (actie === 'bewerk') {
        orgInlineBewerk({ id: Number(btn.dataset.dId), voornaam: btn.dataset.voornaam,
          achternaam: btn.dataset.achternaam, geboortedatum: btn.dataset.geb }, Number(btn.dataset.patId), editie);
      } else if (actie === 'set-functie') {
        const tr = document.querySelector(`tr[data-d-id="${btn.dataset.dId}"]`);
        const huidig = tr?.dataset.functie ?? '';
        const nieuw  = huidig === btn.dataset.functieDoel ? null : btn.dataset.functieDoel;
        try { await patch(`/admin/inschrijvingen/deelnemers/${btn.dataset.dId}/functie`, { functie: nieuw }); await laadOrgDetail(Number(btn.dataset.patId), editie); }
        catch (e) { toonBericht('error', e.message); }
      } else if (actie === 'verwijder') {
        if (!confirm(`Scout "${btn.dataset.naam}" verwijderen?`)) return;
        try { await del(`/admin/inschrijvingen/deelnemers/${btn.dataset.dId}`); await laadOrgDetail(patId, editie); await herlaadOrgTeller(patId); }
        catch (e) { toonBericht('error', e.message); }
      }
    });
  });
  el.querySelectorAll('tr[data-d-id]').forEach(tr => {
    tr.addEventListener('dragstart', e => {
      dragInfo = { deelnemerId: Number(tr.dataset.dId), sourcePatId: Number(tr.dataset.sourcePat) };
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => { tr.style.opacity = '0.35'; }, 0);
    });
    tr.addEventListener('dragend', () => { tr.style.opacity = ''; dragInfo = null; });
  });
}

function orgInlineBewerk(d, patId, editie) {
  const tr = document.querySelector(`#detail-${patId} tr[data-d-id="${d.id}"]`);
  if (!tr || tr.dataset.editing) return;
  tr.dataset.editing = '1'; tr.draggable = false; tr.style.cursor = '';
  const lsw = editie.lsw_datum;
  tr.innerHTML = `<td></td>
    <td style="padding:4px 6px"><div style="display:flex;gap:4px">
      <input id="ib-vn-${d.id}" type="text" class="form-input" style="width:88px;padding:3px 6px;font-size:.83rem" value="${escapeHtml(d.voornaam)}" placeholder="Voornaam">
      <input id="ib-an-${d.id}" type="text" class="form-input" style="width:108px;padding:3px 6px;font-size:.83rem" value="${escapeHtml(d.achternaam)}" placeholder="Achternaam">
    </div></td>
    <td style="padding:4px 6px"><input id="ib-gb-${d.id}" type="date" class="form-input" style="padding:3px 6px;font-size:.83rem" value="${d.geboortedatum ?? ''}"></td>
    ${lsw ? '<td></td>' : ''}<td></td>
    <td style="padding:4px 6px"><button id="ib-cancel-${d.id}" class="btn btn-sm btn-ghost">Annuleer</button></td>`;
  document.getElementById(`ib-vn-${d.id}`).focus();
  let bezig = false;
  async function slaOp() {
    if (bezig) return;
    const body = { voornaam: document.getElementById(`ib-vn-${d.id}`)?.value.trim(),
      achternaam: document.getElementById(`ib-an-${d.id}`)?.value.trim(),
      geboortedatum: document.getElementById(`ib-gb-${d.id}`)?.value };
    if (!body.voornaam || !body.achternaam || !body.geboortedatum) return;
    bezig = true;
    try { await put(`/admin/inschrijvingen/deelnemers/${d.id}`, body); await laadOrgDetail(patId, editie); }
    catch (e) { bezig = false; toonBericht('error', e.message); }
  }
  [`ib-vn-${d.id}`,`ib-an-${d.id}`,`ib-gb-${d.id}`].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('blur', slaOp);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); slaOp(); } });
  });
  document.getElementById(`ib-cancel-${d.id}`).addEventListener('click', () => laadOrgDetail(patId, editie));
}

function orgInlineNieuw(patId, editie) {
  const detailEl = document.getElementById(`detail-${patId}`);
  if (!detailEl || detailEl.querySelector('.nieuw-rij')) return;
  const lsw = editie.lsw_datum;
  let tbody = detailEl.querySelector('tbody');
  if (!tbody) {
    detailEl.querySelector('p.text-muted')?.insertAdjacentHTML('afterend', `
      <table class="data-table" style="font-size:.83rem;margin-bottom:4px">
        <thead><tr><th style="width:20px"></th><th>Naam</th><th>Geboortedatum</th>
          ${lsw ? '<th>Leeftijd LSW</th>' : ''}<th style="width:80px;text-align:center">Rol</th><th></th></tr></thead>
        <tbody></tbody></table>`);
    detailEl.querySelector('p.text-muted')?.remove();
    tbody = detailEl.querySelector('tbody');
  }
  tbody.insertAdjacentHTML('beforeend', `<tr class="nieuw-rij" style="background:var(--color-surface-alt)">
    <td></td>
    <td style="padding:6px 8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <input id="nb-vn-${patId}" type="text" class="form-input" style="flex:1;min-width:100px;padding:4px 8px;font-size:.83rem" placeholder="Voornaam">
        <input id="nb-an-${patId}" type="text" class="form-input" style="flex:1;min-width:120px;padding:4px 8px;font-size:.83rem" placeholder="Achternaam">
      </div>
    </td>
    <td style="padding:6px 8px"><input id="nb-gb-${patId}" type="date" class="form-input" style="padding:4px 8px;font-size:.83rem"></td>
    ${lsw ? '<td></td>' : ''}<td></td>
    <td style="padding:6px 8px;white-space:nowrap">
      <button id="nb-opslaan-${patId}" class="btn btn-sm btn-primary">+ Toevoegen</button>
      <button id="nb-cancel-${patId}" class="btn btn-sm btn-ghost">Annuleer</button>
    </td>
  </tr>`);
  document.getElementById(`nb-vn-${patId}`).focus();
  let bezig = false;
  async function slaOp() {
    if (bezig) return;
    const body = { voornaam: document.getElementById(`nb-vn-${patId}`)?.value.trim(),
      achternaam: document.getElementById(`nb-an-${patId}`)?.value.trim(),
      geboortedatum: document.getElementById(`nb-gb-${patId}`)?.value };
    if (!body.voornaam || !body.achternaam || !body.geboortedatum) return;
    bezig = true;
    try { await post(`/admin/inschrijvingen/patrouilles/${patId}/deelnemers`, body); await laadOrgDetail(patId, editie); await herlaadOrgTeller(patId); }
    catch (e) { bezig = false; toonBericht('error', e.message); }
  }
  [`nb-vn-${patId}`,`nb-an-${patId}`,`nb-gb-${patId}`].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); slaOp(); } });
  });
  document.getElementById(`nb-opslaan-${patId}`).addEventListener('click', slaOp);
  document.getElementById(`nb-cancel-${patId}`).addEventListener('click', () => {
    detailEl.querySelector('.nieuw-rij')?.remove();
    if (!detailEl.querySelector('tbody tr')) laadOrgDetail(patId, editie);
  });
}

function bindFilters() {
  document.getElementById('filt-zoek')?.addEventListener('input', e => {
    filterZoek = e.target.value;
    pasFilterToe();
  });
  document.getElementById('filt-aanwezig')?.addEventListener('change', e => {
    filterAanwezig = e.target.value;
    pasFilterToe();
  });
  document.getElementById('filt-status')?.addEventListener('change', e => {
    filterStatus = e.target.value;
    pasFilterToe();
  });

  // Inklapbaar op mobiel
  document.getElementById('pat-filter-toggle')?.addEventListener('click', () => {
    document.getElementById('pat-filter-card')?.classList.toggle('filter-card--open');
  });
}

function pasFilterToe() {
  const zoekLower = filterZoek.toLowerCase();
  let zichtbaar = 0;
  document.querySelectorAll('.pat-rij').forEach(rij => {
    const zoekMatch   = !zoekLower || (rij.dataset.zoek ?? '').includes(zoekLower);
    const aangemeld   = rij.dataset.aangemeld === '1';
    const isBm        = rij.dataset.bm === '1';
    const aanwezigOk  = filterAanwezig === 'alle'
      || (filterAanwezig === 'aanwezig' && aangemeld)
      || (filterAanwezig === 'niet' && !aangemeld);
    const statusOk    = filterStatus === 'alle'
      || (filterStatus === 'ok' && !isBm)
      || (filterStatus === 'bm' && isBm);
    const toon = zoekMatch && aanwezigOk && statusOk;

    rij.style.display = toon ? '' : 'none';
    const patId = Number(rij.dataset.patId);
    const detailRij = document.querySelector(`.detail-rij[data-pat-id="${patId}"]`);
    if (detailRij) detailRij.style.display = toon && openRijen.has(patId) ? '' : 'none';
    if (toon) zichtbaar++;
  });

  const geenResultaten = document.getElementById('pat-geen-resultaten');
  if (geenResultaten) geenResultaten.style.display = zichtbaar === 0 ? '' : 'none';
}

function updateAangemeldChip() {
  const chip = document.querySelector('.stat-chip-aanwezig');
  if (!chip || !orgData) return;
  const aangemeldCount = orgData.patrouilles.filter(p => p.aangemeld_bij_start).length;
  chip.innerHTML = `<strong style="color:var(--color-success)">${aangemeldCount}</strong> / ${orgData.patrouilles.length} aanwezig`;
}

async function herlaadOrgTeller(patId) {
  try {
    const vers = await get('/admin/inschrijvingen');
    const p = vers.patrouilles.find(x => x.id === patId);
    if (!p) return;
    orgData.patrouilles = vers.patrouilles;
    const rij = document.querySelector(`.pat-rij[data-pat-id="${patId}"]`);
    if (!rij) return;
    const tdScouts = rij.querySelector('td:nth-child(5)');
    if (tdScouts) tdScouts.textContent = p.aantal_deelnemers;
    const editie = orgData.editie;
    const bmBadge = p.buiten_mededinging
      ? `<span class="badge badge-warning" title="${escapeHtml(p.bm_reden ?? '')}">${escapeHtml(editie.bm_label ?? 'BM')}</span>`
      : '<span class="badge badge-success" style="font-size:.75rem">OK</span>';
    const tdStatus = rij.querySelector('td:nth-child(6)');
    if (tdStatus) tdStatus.innerHTML = bmBadge + (p.bm_reden ? `<br><small class="text-muted">${escapeHtml(p.bm_reden)}</small>` : '');
  } catch (_) {}
}

async function doeVerplaats(deelnemerId, vanPatId, naarPatId, editie) {
  try {
    await patch(`/admin/inschrijvingen/deelnemers/${deelnemerId}/verplaats`, { patrouille_id: naarPatId });
    await herlaadOrgTeller(vanPatId);
    if (openRijen.has(vanPatId)) await laadOrgDetail(vanPatId, editie);
    await herlaadOrgTeller(naarPatId);
    if (!openRijen.has(naarPatId)) {
      openRijen.add(naarPatId);
      document.querySelector(`.detail-rij[data-pat-id="${naarPatId}"]`)?.style.setProperty('display', '');
      const pRij = document.querySelector(`.pat-rij[data-pat-id="${naarPatId}"]`);
      if (pRij) pRij.querySelector('td:first-child').innerHTML = '<span class="material-icons" style="font-size:1rem">expand_more</span>';
    }
    await laadOrgDetail(naarPatId, editie);
  } catch (e) { toonBericht('error', e.message); }
}

// ── Organisator patrouille modal ──────────────────────────────────

let bewerkPatId = null, patEditieId = null;

function openOrgPatModal(pat, editieId) {
  bewerkPatId = pat?.id ?? null; patEditieId = editieId;
  document.getElementById('pat-modal-titel').textContent = pat ? 'Patrouille bewerken' : 'Nieuwe patrouille';
  const groepSel = document.getElementById('pat-f-groep');
  groepSel.innerHTML = groepen.map(g => `<option value="${g.id}" ${pat?.groep_id === g.id ? 'selected' : ''}>${escapeHtml(g.groep_naam)} (${escapeHtml(g.afkorting)})</option>`).join('');
  groepSel.disabled = !!pat;
  document.getElementById('pat-f-naam').value = pat?.naam ?? '';
  document.getElementById('pat-f-jongste').checked = !!pat?.jongste;
  const modal = document.getElementById('pat-modal');
  modal.style.display = 'flex';
  document.getElementById('pat-modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('pat-modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('pat-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = { editie_id: patEditieId, groep_id: Number(groepSel.value),
      naam: document.getElementById('pat-f-naam').value.trim(),
      jongste: document.getElementById('pat-f-jongste').checked };
    try {
      if (bewerkPatId) { await put(`/admin/inschrijvingen/patrouilles/${bewerkPatId}`, body); }
      else { const nieuw = await post('/admin/inschrijvingen/patrouilles', body); openRijen.add(nieuw.id); }
      modal.style.display = 'none'; await laadOrgData();
    } catch (err) { toonBericht('error', err.message); }
  };
}

// ══════════════════════════════════════════════════════════════════
// GEDEELDE MODALS
// ══════════════════════════════════════════════════════════════════

function modalPatrouilleHtml() {
  return `<div id="pat-modal" class="modal-backdrop" style="display:none">
    <div class="modal">
      <div class="modal-header">
        <h2 id="pat-modal-titel">Patrouille</h2>
        <button type="button" id="pat-modal-sluiten" style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer"><span class="material-icons">close</span></button>
      </div>
      <form id="pat-form">
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-group"><label class="form-label">Groep *</label><select id="pat-f-groep" class="form-input" required></select></div>
          <div class="form-group"><label class="form-label">Naam patrouille *</label><input type="text" id="pat-f-naam" class="form-input" required></div>
          <div class="form-group" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pat-f-jongste">
            <label for="pat-f-jongste" class="form-label" style="margin:0">Jongste patrouille</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="pat-modal-annuleer">Annuleren</button>
          <button type="submit" class="btn btn-primary">Opslaan</button>
        </div>
      </form>
    </div>
  </div>`;
}

function leidingModalsHtml() {
  return `
    <div class="modal-backdrop hidden" id="pat-modal-backdrop">
      <div class="modal" role="dialog">
        <div class="modal-header">
          <div class="modal-title" id="pat-modal-titel">Patrouille</div>
          <button class="btn-icon" id="pat-modal-sluiten"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div id="pat-modal-error" class="alert alert-error mb-16" style="display:none">
            <span class="alert-icon"><span class="material-icons">error</span></span><span id="pat-modal-error-tekst"></span>
          </div>
          <div class="form-group">
            <label class="form-label" for="pat-naam">Naam patrouille <span style="color:var(--color-primary)">*</span></label>
            <input class="form-input" type="text" id="pat-naam" maxlength="100" placeholder="bijv. Vliegende Vossen" />
          </div>
          <div class="form-group" id="pat-jongste-groep">
            <label class="form-label" style="cursor:pointer;display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="pat-jongste" /> Dit is een jongste-patrouille
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pat-modal-annuleer">Annuleren</button>
          <button class="btn btn-primary" id="pat-modal-opslaan">Opslaan</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop hidden" id="inschrijving-confirm-backdrop">
      <div class="modal confirm-dialog" role="alertdialog">
        <div class="modal-header"><div class="modal-title" id="inschrijving-confirm-titel">Bevestigen</div></div>
        <div class="modal-body"><p id="inschrijving-confirm-tekst"></p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="inschrijving-confirm-annuleer">Annuleren</button>
          <button class="btn btn-danger" id="inschrijving-confirm-ok">Verwijderen</button>
        </div>
      </div>
    </div>`;
}

function openPatModal(patrouille, toonJongste, onOpslaan) {
  const backdrop = document.getElementById('pat-modal-backdrop');
  document.getElementById('pat-modal-titel').textContent = patrouille ? 'Patrouille bewerken' : 'Patrouille aanmaken';
  document.getElementById('pat-naam').value = patrouille?.naam ?? '';
  document.getElementById('pat-jongste').checked = !!patrouille?.jongste;
  document.getElementById('pat-jongste-groep').style.display = toonJongste ? 'block' : 'none';
  document.getElementById('pat-modal-error').style.display = 'none';
  backdrop.classList.remove('hidden');
  document.getElementById('pat-naam').focus();
  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('pat-modal-sluiten').onclick = sluit;
  document.getElementById('pat-modal-annuleer').onclick = sluit;
  backdrop.onclick = e => { if (e.target === backdrop) sluit(); };
  document.getElementById('pat-modal-opslaan').onclick = async () => {
    const naam = document.getElementById('pat-naam').value.trim();
    if (!naam) {
      document.getElementById('pat-modal-error-tekst').textContent = 'Naam is verplicht';
      document.getElementById('pat-modal-error').style.display = 'flex'; return;
    }
    const btn = document.getElementById('pat-modal-opslaan');
    btn.disabled = true; btn.textContent = 'Opslaan…';
    try { await onOpslaan({ naam, jongste: document.getElementById('pat-jongste').checked }, patrouille?.id ?? null); sluit(); }
    catch (e) { document.getElementById('pat-modal-error-tekst').textContent = e.message; document.getElementById('pat-modal-error').style.display = 'flex'; }
    btn.disabled = false; btn.textContent = 'Opslaan';
  };
}

function openConfirmDialog(titel, html, onBevestig) {
  const backdrop = document.getElementById('inschrijving-confirm-backdrop');
  document.getElementById('inschrijving-confirm-titel').textContent = titel;
  document.getElementById('inschrijving-confirm-tekst').innerHTML = html;
  backdrop.classList.remove('hidden');
  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('inschrijving-confirm-annuleer').onclick = sluit;
  backdrop.onclick = e => { if (e.target === backdrop) sluit(); };
  document.getElementById('inschrijving-confirm-ok').onclick = async () => {
    const btn = document.getElementById('inschrijving-confirm-ok');
    btn.disabled = true;
    try { await onBevestig(); sluit(); }
    catch (e) { notify.error(e.message); }
    btn.disabled = false;
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function toonBericht(type, msg) {
  const el = document.getElementById('inschrijv-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}
