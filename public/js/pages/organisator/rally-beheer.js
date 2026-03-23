// pages/organisator/rally-beheer.js — Rally momenten & station beheer

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml } from '../../utils/escape.js';
import { naarUTC, naarLocalDT } from '../../utils/datum.js';
import { laadPdfMake } from '../../services/pdf.js';
import { laadJSZip }   from '../../services/zip.js';

const JURY_BASE  = '/admin/jury';
const CAT_BASE   = '/admin/editie-categorieen';
const RALLY_BASE = '/admin/rally';

let edities     = [];
let editieId    = null;
let momenten    = [];
let categorieen = [];
// stationsCache[momentId] = [{ id, naam, criteria[], qr_dataurl, ... }]
let stationsCache = {};

let pdfDialogData = null; // { type: 'patrouilles'|'stations', items: [], label: '' }

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>&#128204; Rally beheer</h1></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-patrouille-qr">&#128438; Patrouille QR's</button>
        <button class="btn btn-primary" id="btn-nieuw-moment">+ Nieuw rally moment</button>
      </div>
    </div>
    <div id="rally-berichten"></div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <label class="form-label" style="margin:0;">Editie:</label>
      <select id="rally-editie-sel" class="form-input" style="max-width:260px;"><option>Laden…</option></select>
    </div>
    <div id="rally-content"><p class="text-muted">Selecteer een editie…</p></div>

    <!-- Modal: moment aanmaken/bewerken -->
    <div id="moment-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 id="mm-titel">Rally moment</h2>
          <button type="button" id="mm-sluiten" class="modal-sluit">&#10005;</button>
        </div>
        <form id="moment-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Naam (optioneel)</label>
              <input type="text" id="mm-naam" class="form-input" placeholder="bijv. Ochtend rally">
            </div>
            <div class="form-group">
              <label class="form-label">Categorie *</label>
              <select id="mm-categorie" class="form-input" required></select>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <div class="form-group" style="flex:1;min-width:160px;">
                <label class="form-label">Starttijd *</label>
                <input type="datetime-local" id="mm-start" class="form-input" required>
              </div>
              <div class="form-group" style="flex:1;min-width:160px;">
                <label class="form-label">Eindtijd *</label>
                <input type="datetime-local" id="mm-eind" class="form-input" required>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="mm-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: station aanmaken/bewerken + criteria kiezen -->
    <div id="station-modal" class="modal-backdrop" style="display:none">
      <div class="modal" style="max-width:580px;width:100%">
        <div class="modal-header">
          <h2 id="sm-titel">Station</h2>
          <button type="button" id="sm-sluiten" class="modal-sluit">&#10005;</button>
        </div>
        <form id="station-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto;">
            <div class="form-group">
              <label class="form-label">Naam station *</label>
              <input type="text" id="sm-naam" class="form-input" required placeholder="bijv. Station 1 — Touw klimmen">
            </div>
            <div>
              <label class="form-label" style="margin-bottom:6px;">Criteria — selecteer wat dit station beoordeelt</label>
              <div class="form-hint" style="margin-bottom:8px;">
                <strong>Scoreformulier</strong>: jury vult score in op het station. &nbsp;
                <strong>Aankomst</strong>: score wordt automatisch toegekend bij scannen (niet zichtbaar voor jury).
              </div>
              <div id="sm-criteria-lijst"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="sm-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: PDF afdrukopties -->
    <div id="pdf-modal" class="modal-backdrop" style="display:none">
      <div class="modal" style="max-width:500px;width:100%">
        <div class="modal-header">
          <h2>&#128228; QR codes exporteren</h2>
          <button type="button" id="pdf-sluiten" class="modal-sluit">&#10005;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <div class="form-label" id="pdf-type-label" style="font-weight:600;margin-bottom:2px"></div>
            <div class="text-muted text-sm" id="pdf-aantal-label"></div>
          </div>
          <div>
            <div class="form-label" style="margin-bottom:8px">Stickervel indeling</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Kolommen</label>
                <input type="number" id="pdf-kolommen" class="form-input" min="1" max="8" value="3">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Rijen per pagina</label>
                <input type="number" id="pdf-rijen" class="form-input" min="1" max="12" value="4">
              </div>
            </div>
            <div class="text-muted text-sm" id="pdf-preview" style="margin-top:8px"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="pdf-annuleer">Annuleren</button>
          <button type="button" class="btn btn-ghost" id="zip-download">&#128230; JPG ZIP</button>
          <button type="button" class="btn btn-primary" id="pdf-download">&#128229; PDF downloaden</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.modal-sluit').forEach(btn => {
    btn.style.cssText = 'background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer;line-height:1';
  });

  await laadEdities();
  document.getElementById('btn-nieuw-moment').addEventListener('click', () => {
    if (!editieId) { toon('error', 'Selecteer eerst een editie'); return; }
    openMomentModal(null);
  });
  document.getElementById('btn-patrouille-qr').addEventListener('click', genereerPatrouilleQrs);
}

// ── Edities & momenten ─────────────────────────────────────────────

async function laadEdities() {
  try {
    edities = await get('/admin/edities');
    const sel = document.getElementById('rally-editie-sel');
    sel.innerHTML = '<option value="">— kies editie —</option>' +
      edities.map(e => `<option value="${e.id}">${escapeHtml(e.naam)}${e.actief ? ' (actief)' : ''}</option>`).join('');
    const actief = edities.find(e => e.actief);
    if (actief) { sel.value = actief.id; await wisselEditie(actief.id); }
    sel.addEventListener('change', () => wisselEditie(Number(sel.value) || null));
  } catch (e) { toon('error', e.message); }
}

async function wisselEditie(id) {
  editieId      = id;
  stationsCache = {};
  momenten      = [];
  categorieen   = [];
  if (!id) {
    document.getElementById('rally-content').innerHTML = '<p class="text-muted">Geen editie geselecteerd.</p>';
    return;
  }
  try {
    categorieen = await get(`${CAT_BASE}?editie_id=${id}`);
    await laadMomenten();
  } catch (e) { toon('error', e.message); }
}

async function laadMomenten() {
  try {
    const alle = await get(`${JURY_BASE}/momenten?editie_id=${editieId}`);
    momenten = alle.filter(m => m.rally_modus);

    // Laad stations voor alle momenten parallel
    await Promise.all(momenten.map(async m => {
      try {
        stationsCache[m.id] = await get(`${RALLY_BASE}/stations?moment_id=${m.id}`);
      } catch { stationsCache[m.id] = []; }
    }));

    renderMomenten();
  } catch (e) { toon('error', e.message); }
}

// ── Render ─────────────────────────────────────────────────────────

function renderMomenten() {
  const el = document.getElementById('rally-content');
  if (!momenten.length) {
    el.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px;">
      Nog geen rally momenten. Klik op "+ Nieuw rally moment" om te beginnen.
    </p></div>`;
    return;
  }
  el.innerHTML = momenten.map(m => renderMomentKaart(m)).join('');
  bindActies();
}

function renderMomentKaart(m) {
  const stations = stationsCache[m.id] || [];
  const open     = isOpen(m);

  return `
    <div class="card" style="margin-bottom:16px;" data-moment-id="${m.id}">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-weight:700;font-size:1rem;">
            ${m.naam ? escapeHtml(m.naam) + ' &mdash; ' : ''}${escapeHtml(m.categorie_naam || '—')}
          </div>
          <div class="text-muted" style="font-size:.82rem;margin-top:2px;">
            ${fmtDT(m.start_tijd)} &ndash; ${fmtDT(m.eind_tijd)}
            &nbsp;&middot;&nbsp; ${stations.length} station(s)
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${open
            ? '<span class="badge badge-success">&#9679; Open</span>'
            : m.handmatig_open
              ? '<span class="badge badge-warning">&#9679; Handmatig open</span>'
              : '<span class="badge" style="background:var(--color-surface-alt)">Gesloten</span>'}
          <button class="btn btn-sm btn-outline" data-actie="toggle-open" data-id="${m.id}">
            ${m.handmatig_open ? 'Sluiten' : 'Openen'}
          </button>
          <button class="btn btn-sm btn-outline" data-actie="bewerk-moment" data-id="${m.id}">Bewerk</button>
          <button class="btn btn-sm btn-danger"  data-actie="verwijder-moment" data-id="${m.id}">Verwijder</button>
        </div>
      </div>

      <div style="padding:0 16px 16px;border-top:1px solid var(--color-border);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 8px;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:.9rem;">Stations</strong>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" data-actie="nieuw-station" data-id="${m.id}">+ Station toevoegen</button>
            ${stations.length ? `<button class="btn btn-sm btn-outline" data-actie="print-qr" data-id="${m.id}">&#128438; Print alle QR's</button>` : ''}
          </div>
        </div>
        ${renderStationsLijst(stations, m.id)}
      </div>
    </div>
  `;
}

function renderStationsLijst(stations, momentId) {
  if (!stations.length) {
    return '<p class="text-muted" style="font-size:.85rem;">Nog geen stations. Voeg een station toe om te beginnen.</p>';
  }
  return stations.map(s => renderStationKaart(s, momentId)).join('');
}

function renderStationKaart(s, momentId) {
  const juryCriteria     = (s.criteria || []).filter(c => !c.is_aankomst);
  const aankomstCriteria = (s.criteria || []).filter(c => c.is_aankomst);

  const juryLabels = juryCriteria.map(c =>
    `<span class="badge" style="background:var(--color-surface-alt);font-size:.72rem;margin:1px;">
      ${escapeHtml(c.criterium_naam)}
    </span>`
  ).join('');

  const aankomstLabels = aankomstCriteria.map(c =>
    `<span class="badge badge-success" style="font-size:.72rem;margin:1px;" title="Automatisch ${c.aankomst_punten}p bij aankomst">
      &#9654; ${escapeHtml(c.criterium_naam)} (${c.aankomst_punten}p)
    </span>`
  ).join('');

  return `
    <div style="background:var(--color-surface-alt);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;"
         data-station-id="${s.id}">
      <div style="flex:1;min-width:180px;">
        <div style="font-weight:600;margin-bottom:4px;">
          ${escapeHtml(s.naam)}
          ${s.criteria.length === 0 ? '<span class="badge badge-warning" style="font-size:.7rem;margin-left:4px;">Geen criteria</span>' : ''}
        </div>
        ${juryLabels ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:3px;">${juryLabels}</div>` : ''}
        ${aankomstLabels ? `<div style="display:flex;flex-wrap:wrap;gap:2px;">${aankomstLabels}</div>` : ''}
        ${!juryLabels && !aankomstLabels ? '<span class="text-muted" style="font-size:.8rem;">Geen criteria ingesteld</span>' : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        ${s.qr_dataurl
          ? `<img src="${s.qr_dataurl}" width="48" height="48" style="border-radius:4px;" title="Station QR">`
          : '<span class="text-muted" style="font-size:.75rem;">Geen QR</span>'}
        <button class="btn btn-sm btn-outline" data-actie="bewerk-station" data-id="${s.id}" data-moment-id="${momentId}">Bewerk</button>
        <button class="btn btn-sm btn-danger"  data-actie="verwijder-station" data-id="${s.id}" data-moment-id="${momentId}">Verwijder</button>
      </div>
    </div>
  `;
}

// ── Event binding ──────────────────────────────────────────────────

function bindActies() {
  document.getElementById('rally-content').querySelectorAll('[data-actie]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const actie     = btn.dataset.actie;
      const id        = Number(btn.dataset.id);
      const momentId  = Number(btn.dataset.momentId || btn.dataset.id);

      if (actie === 'bewerk-moment') {
        openMomentModal(momenten.find(x => x.id === id));
        return;
      }
      if (actie === 'verwijder-moment') {
        const m = momenten.find(x => x.id === id);
        if (!confirm(`Rally moment "${m?.naam || m?.categorie_naam}" verwijderen?`)) return;
        try { await del(`${JURY_BASE}/momenten/${id}`); await laadMomenten(); }
        catch (err) { toon('error', err.message); }
        return;
      }
      if (actie === 'toggle-open') {
        try { await put(`${JURY_BASE}/momenten/${id}/open`, {}); await laadMomenten(); }
        catch (err) { toon('error', err.message); }
        return;
      }
      if (actie === 'nieuw-station') {
        openStationModal(null, id);
        return;
      }
      if (actie === 'bewerk-station') {
        const station = (stationsCache[momentId] || []).find(s => s.id === id);
        if (station) openStationModal(station, momentId);
        return;
      }
      if (actie === 'verwijder-station') {
        if (!confirm('Station verwijderen?')) return;
        try {
          await del(`${RALLY_BASE}/stations/${id}`);
          stationsCache[momentId] = await get(`${RALLY_BASE}/stations?moment_id=${momentId}`);
          renderMomenten();
          toon('success', 'Station verwijderd.');
        } catch (err) { toon('error', err.message); }
        return;
      }
      if (actie === 'print-qr') {
        const moment   = momenten.find(x => x.id === id);
        const stations = (stationsCache[id] || []).filter(s => s.qr_dataurl);
        if (!stations.length) { toon('error', 'Geen QR codes beschikbaar.'); return; }
        openPdfDialog('stations', stations.map(s => ({ ...s, categorie_naam: moment?.categorie_naam || '' })), moment?.naam || moment?.categorie_naam || 'Stations');
        return;
      }
    });
  });
}

// ── Moment modal ───────────────────────────────────────────────────

let bewerkMomentId = null;

function openMomentModal(m) {
  bewerkMomentId = m?.id ?? null;
  document.getElementById('mm-titel').textContent = m ? 'Rally moment bewerken' : 'Nieuw rally moment';

  const catSel = document.getElementById('mm-categorie');
  catSel.innerHTML = '<option value="">— kies categorie —</option>' +
    categorieen.map(c => `<option value="${c.id}">${escapeHtml(c.naam)}</option>`).join('');
  if (m?.categorie_id) catSel.value = m.categorie_id;

  document.getElementById('mm-naam').value  = m?.naam || '';
  document.getElementById('mm-start').value = naarLocalDT(m?.start_tijd);
  document.getElementById('mm-eind').value  = naarLocalDT(m?.eind_tijd);

  const modal = document.getElementById('moment-modal');
  modal.style.display = 'flex';
  document.getElementById('mm-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('mm-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('moment-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const body = {
      editie_id:    editieId,
      categorie_id: Number(catSel.value),
      naam:         document.getElementById('mm-naam').value.trim() || null,
      start_tijd:   naarUTC(document.getElementById('mm-start').value),
      eind_tijd:    naarUTC(document.getElementById('mm-eind').value),
      jureer_modus: 'numeriek',
      rally_modus:  true,
      score_niveau: 'criterium',
      aankomst_punten: 0,
    };
    try {
      if (bewerkMomentId) await put(`${JURY_BASE}/momenten/${bewerkMomentId}`, body);
      else await post(`${JURY_BASE}/momenten`, body);
      modal.style.display = 'none';
      await laadMomenten();
    } catch (err) { toon('error', err.message); }
  };
}

// ── Station modal (naam + criteria-selectie) ───────────────────────

let bewerkStationId  = null;
let stationMomentId  = null;

async function openStationModal(station, momentId) {
  bewerkStationId = station?.id ?? null;
  stationMomentId = momentId;

  document.getElementById('sm-titel').textContent = station ? 'Station bewerken' : 'Nieuw station';
  document.getElementById('sm-naam').value = station?.naam || '';

  // Laad criteria van de categorie van dit moment
  const moment = momenten.find(m => m.id === momentId);
  let critLijst = [];
  if (moment?.categorie_id) {
    try {
      const genest = await get(`${CAT_BASE}/details?editie_id=${editieId}`);
      const cat = genest.find(c => c.id === moment.categorie_id);
      if (cat) {
        for (const sub of cat.subcategorieen || []) {
          for (const cr of sub.criteria || []) {
            critLijst.push({ ...cr, subcategorie_naam: sub.naam });
          }
        }
      }
    } catch { /* geen criteria */ }
  }

  // Bestaande criteria van dit station — opgesplitst in jury en aankomst
  const huidigeCriteria = station?.criteria || [];
  const huidigeIds      = new Set(huidigeCriteria.map(c => c.criterium_id));
  const huidigeType     = Object.fromEntries(huidigeCriteria.map(c => [c.criterium_id, c.is_aankomst ? 'aankomst' : 'jury']));
  const huidigePunten   = Object.fromEntries(huidigeCriteria.map(c => [c.criterium_id, c.aankomst_punten ?? 0]));

  const container = document.getElementById('sm-criteria-lijst');
  if (!critLijst.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:.85rem;">Geen criteria gevonden voor deze categorie.</p>';
  } else {
    let huidigeSub = null;
    let html = '';
    for (const cr of critLijst) {
      if (cr.subcategorie_naam !== huidigeSub) {
        huidigeSub = cr.subcategorie_naam;
        html += `<div style="font-size:.8rem;font-weight:700;color:var(--color-text-muted);
          letter-spacing:.05em;margin:10px 0 4px;">${escapeHtml(huidigeSub)}</div>`;
      }
      const checked    = huidigeIds.has(cr.id);
      const type       = huidigeType[cr.id] ?? 'jury';
      const punten     = huidigePunten[cr.id] ?? 0;
      const isAankomst = type === 'aankomst';

      html += `
        <div style="padding:6px 0;border-bottom:1px solid var(--color-border);" class="crit-rij" data-crit-id="${cr.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" class="crit-check" id="crit-${cr.id}" data-crit-id="${cr.id}"
              ${checked ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--color-primary);flex-shrink:0;">
            <label for="crit-${cr.id}" style="flex:1;margin:0;cursor:pointer;">
              ${escapeHtml(cr.naam)}
              ${cr.invoer_type && cr.invoer_type !== 'getal'
                ? `<span class="badge badge-info" style="font-size:.68rem;">${escapeHtml(cr.invoer_type)}</span>` : ''}
              <span class="text-muted" style="font-size:.78rem;"> max ${cr.max_score}</span>
            </label>
          </div>
          <div class="crit-type-sectie" style="margin-top:6px;margin-left:26px;display:${checked ? 'flex' : 'none'};
            align-items:center;gap:16px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;">
              <input type="radio" name="crit-type-${cr.id}" class="crit-type" value="jury"
                data-crit-id="${cr.id}" ${!isAankomst ? 'checked' : ''}>
              Scoreformulier <span class="text-muted" style="font-size:.75rem;">(jury vult in)</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;">
              <input type="radio" name="crit-type-${cr.id}" class="crit-type" value="aankomst"
                data-crit-id="${cr.id}" ${isAankomst ? 'checked' : ''}>
              Aankomst <span class="text-muted" style="font-size:.75rem;">(auto bij scan)</span>
            </label>
            <div class="aankomst-score-sectie" style="display:${isAankomst ? 'flex' : 'none'};align-items:center;gap:4px;">
              <label style="font-size:.78rem;color:var(--color-text-muted);margin:0;">Score:</label>
              <input type="number" class="form-input crit-punten" data-crit-id="${cr.id}"
                value="${punten}" min="0" max="${cr.max_score}" style="width:64px;padding:4px 6px;">
            </div>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;

    // Checkbox toggle → toon/verberg type-sectie
    container.querySelectorAll('.crit-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const rij     = cb.closest('.crit-rij');
        const typeSec = rij.querySelector('.crit-type-sectie');
        typeSec.style.display = cb.checked ? 'flex' : 'none';
      });
    });

    // Radio toggle → toon/verberg aankomst-score invoer
    container.querySelectorAll('.crit-type').forEach(radio => {
      radio.addEventListener('change', () => {
        const rij      = radio.closest('.crit-rij');
        const scoreSec = rij.querySelector('.aankomst-score-sectie');
        scoreSec.style.display = radio.value === 'aankomst' ? 'flex' : 'none';
      });
    });
  }

  const modal = document.getElementById('station-modal');
  modal.style.display = 'flex';
  document.getElementById('sm-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('sm-annuleer').onclick = () => { modal.style.display = 'none'; };

  document.getElementById('station-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const naam = document.getElementById('sm-naam').value.trim();

    // Verzamel geselecteerde criteria met type (jury of aankomst)
    const criteria = [];
    document.querySelectorAll('.crit-check:checked').forEach((cb, i) => {
      const critId     = Number(cb.dataset.critId);
      const typeRadio  = document.querySelector(`.crit-type[data-crit-id="${critId}"]:checked`);
      const isAankomst = typeRadio?.value === 'aankomst';
      const punten     = isAankomst
        ? Number(document.querySelector(`.crit-punten[data-crit-id="${critId}"]`)?.value) || 0
        : 0;
      criteria.push({ criterium_id: critId, aankomst_punten: punten, is_aankomst: isAankomst, volgorde: i });
    });

    try {
      if (bewerkStationId) {
        // Update naam
        await put(`${RALLY_BASE}/stations/${bewerkStationId}`, { naam });
        // Update criteria
        await put(`${RALLY_BASE}/stations/${bewerkStationId}/criteria`, { criteria });
      } else {
        // Nieuw station aanmaken
        const r = await post(`${RALLY_BASE}/stations`, { jurymoment_id: stationMomentId, naam });
        // Criteria instellen
        if (criteria.length) {
          await put(`${RALLY_BASE}/stations/${r.id}/criteria`, { criteria });
        }
      }
      modal.style.display = 'none';
      stationsCache[stationMomentId] = await get(`${RALLY_BASE}/stations?moment_id=${stationMomentId}`);
      renderMomenten();
    } catch (err) { toon('error', err.message); }
  };
}

// ── Patrouille QR's ophalen ────────────────────────────────────────

async function genereerPatrouilleQrs() {
  if (!editieId) { toon('error', 'Selecteer eerst een editie.'); return; }
  const btn = document.getElementById('btn-patrouille-qr');
  btn.disabled = true; btn.textContent = 'Laden…';
  try {
    const result = await post(`${RALLY_BASE}/tokens/genereer`, { editie_id: editieId });
    const tokens = result.tokens || [];
    if (!tokens.length) {
      toon('error', 'Geen patrouilles met nummers gevonden. Wijs eerst nummers toe via de plattegrond.');
      return;
    }
    openPdfDialog('patrouilles', tokens, `${tokens.length} patrouilles`);
  } catch (e) {
    toon('error', 'Fout: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '&#128438; Patrouille QR\'s';
  }
}

// ── PDF dialog ─────────────────────────────────────────────────────

function openPdfDialog(type, items, label) {
  pdfDialogData = { type, items, label };

  document.getElementById('pdf-type-label').textContent =
    type === 'patrouilles' ? 'Patrouille QR-codes' : `Station QR-codes — ${label}`;
  document.getElementById('pdf-aantal-label').textContent = `${items.length} stickers`;

  updatePdfPreview();

  const modal = document.getElementById('pdf-modal');
  modal.style.display = 'flex';

  document.getElementById('pdf-sluiten').onclick  = sluitPdfDialog;
  document.getElementById('pdf-annuleer').onclick = sluitPdfDialog;
  document.getElementById('pdf-download').onclick = genereerPdf;
  document.getElementById('zip-download').onclick = exportZip;
  document.getElementById('pdf-kolommen').oninput = updatePdfPreview;
  document.getElementById('pdf-rijen').oninput    = updatePdfPreview;
}

function sluitPdfDialog() {
  document.getElementById('pdf-modal').style.display = 'none';
  pdfDialogData = null;
}

function updatePdfPreview() {
  const k         = Math.max(1, Number(document.getElementById('pdf-kolommen').value) || 3);
  const r         = Math.max(1, Number(document.getElementById('pdf-rijen').value) || 4);
  const perPagina = k * r;
  const totaal    = pdfDialogData?.items.length ?? 0;
  const paginas   = totaal ? Math.ceil(totaal / perPagina) : 0;

  // Sticker afmetingen in mm (A4 portrait, 20pt marges, 0.5pt borders)
  const PT_MM = 25.4 / 72;
  const celW  = Math.floor((555 - (k + 1) * 0.5 - 1) / k);
  const celH  = Math.floor((802 - (r + 1) * 0.5 - 1) / r);
  const bMM   = Math.round(celW * PT_MM);
  const hMM   = Math.round(celH * PT_MM);

  document.getElementById('pdf-preview').textContent =
    `${perPagina} per pagina · ${paginas} pagina${paginas !== 1 ? "'s" : ''} · sticker ~${bMM} × ${hMM} mm`;
}

async function genereerPdf() {
  if (!pdfDialogData) return;
  const btn = document.getElementById('pdf-download');
  btn.disabled = true; btn.textContent = 'Bezig…';
  try {
    const k = Math.max(1, Number(document.getElementById('pdf-kolommen').value) || 3);
    const r = Math.max(1, Number(document.getElementById('pdf-rijen').value) || 4);
    await maakStickerPdf(pdfDialogData.type, pdfDialogData.items, k, r);
    sluitPdfDialog();
  } catch (e) {
    toon('error', 'PDF genereren mislukt: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '&#128229; PDF downloaden';
  }
}

async function exportZip() {
  if (!pdfDialogData) return;
  const btn = document.getElementById('zip-download');
  btn.disabled = true; btn.textContent = 'Bezig…';
  try {
    await laadJSZip();
    const zip  = new JSZip();
    const type = pdfDialogData.type;

    for (let i = 0; i < pdfDialogData.items.length; i++) {
      const item    = pdfDialogData.items[i];
      if (!item.qr_dataurl) continue;
      const jpgB64  = await dataUrlNaarJpgB64(item.qr_dataurl);
      const bestand = type === 'patrouilles'
        ? `patrouille_${String(item.nummer ?? i + 1).padStart(3, '0')}.jpg`
        : `${String(i + 1).padStart(3, '0')}_${(item.naam ?? 'station').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.jpg`;
      zip.file(bestand, jpgB64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = type === 'patrouilles' ? 'patrouille-qr.zip' : 'station-qr.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    toon('error', 'ZIP genereren mislukt: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '&#128230; JPG ZIP';
  }
}

function dataUrlNaarJpgB64(dataUrl) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    img.onload   = () => {
      const canvas  = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx     = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // witte achtergrond (JPG heeft geen transparantie)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
    };
    img.onerror  = () => reject(new Error('QR afbeelding kon niet worden geladen.'));
    img.src      = dataUrl;
  });
}

async function maakStickerPdf(type, items, kolommen, rijen) {
  await laadPdfMake();

  // A4 portrait: 595 × 842 pt, marges 20pt → 555 × 802 bruikbaar
  // Trek borders af: (N+1) lijnen × 0.5pt per richting, plus 1pt veiligheidsbuffer
  const PAGE_W    = 555;
  const PAGE_H    = 802;
  const BORDER    = 0.5;
  const CEL_W     = Math.floor((PAGE_W - (kolommen + 1) * BORDER - 1) / kolommen);
  const CEL_H     = Math.floor((PAGE_H - (rijen    + 1) * BORDER - 1) / rijen);
  const PAD       = 5;
  const perPagina = kolommen * rijen;

  // Reserveer minimale tekstruimte; de rest gaat naar de QR
  // patrouilles: nummer (12pt) + label (8pt) + margins ≈ 30pt
  // stations:    naam (10pt) + meta (max 3 regels × 9pt) + margins ≈ 45pt
  const tekstH = type === 'patrouilles' ? 30 : 45;
  const qrMaat = Math.max(20, Math.min(CEL_W - PAD * 2, CEL_H - PAD * 2 - tekstH));

  const tabelLayout = {
    hLineWidth: () => BORDER,
    vLineWidth: () => BORDER,
    hLineColor: () => '#bbbbbb',
    vLineColor: () => '#bbbbbb',
    paddingLeft:   () => 0,
    paddingRight:  () => 0,
    paddingTop:    () => 0,
    paddingBottom: () => 0,
  };

  function bouwCel(item) {
    if (!item) return { text: '', border: [true, true, true, true] };

    if (type === 'patrouilles') {
      return {
        stack: [
          { text: `#${item.nummer ?? '?'}`, fontSize: 12, bold: true, color: '#e94560', alignment: 'center', margin: [0, 0, 0, 2] },
          { image: item.qr_dataurl, width: qrMaat, height: qrMaat, alignment: 'center' },
          { text: 'RSW Rally', fontSize: 7, color: '#888888', alignment: 'center', margin: [0, 2, 0, 0] },
        ],
        margin: [PAD, PAD, PAD, PAD],
        border: [true, true, true, true],
      };
    }

    // stations
    const juryCrit  = (item.criteria || []).filter(c => !c.is_aankomst).map(c => c.criterium_naam).join(', ');
    const bonusCrit = (item.criteria || []).filter(c => c.is_aankomst);
    const stack = [
      { text: item.naam, fontSize: 9, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      { image: item.qr_dataurl, width: qrMaat, height: qrMaat, alignment: 'center' },
    ];
    if (item.categorie_naam) stack.push({ text: item.categorie_naam, fontSize: 7, color: '#555555', alignment: 'center', margin: [0, 2, 0, 0] });
    if (juryCrit)            stack.push({ text: juryCrit, fontSize: 7, color: '#333333', alignment: 'center' });
    if (bonusCrit.length)    stack.push({
      text: bonusCrit.map(c => `\u25b6 ${c.criterium_naam} +${c.aankomst_punten}p`).join('  '),
      fontSize: 7, color: '#cc3333', bold: true, alignment: 'center',
    });

    return {
      stack,
      margin: [PAD, PAD, PAD, PAD],
      border: [true, true, true, true],
    };
  }

  // Genereer één tabel per pagina zodat elke pagina exact rijen × kolommen cellen heeft
  const content = [];
  for (let p = 0; p * perPagina < items.length; p++) {
    const chunk = items.slice(p * perPagina, (p + 1) * perPagina);
    // Vul op tot volledige pagina
    while (chunk.length < perPagina) chunk.push(null);

    const body = [];
    for (let i = 0; i < chunk.length; i += kolommen) {
      body.push(chunk.slice(i, i + kolommen).map(bouwCel));
    }

    const tabel = {
      table: {
        widths:  Array(kolommen).fill(CEL_W),
        heights: Array(rijen).fill(CEL_H),
        body,
      },
      layout: tabelLayout,
    };
    if (p > 0) tabel.pageBreak = 'before';
    content.push(tabel);
  }

  pdfMake.createPdf({
    pageSize: 'A4',
    pageMargins: [20, 20, 20, 20],
    content,
  }).download(type === 'patrouilles' ? 'patrouille-qr.pdf' : 'station-qr.pdf');
}

// ── Helpers ────────────────────────────────────────────────────────

function isOpen(m) {
  if (m.handmatig_open) return true;
  const now = new Date();
  return now >= new Date(m.start_tijd) && now <= new Date(m.eind_tijd);
}

function fmtDT(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}


function toon(type, msg) {
  const el = document.getElementById('rally-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

export function onDestroy() {}
