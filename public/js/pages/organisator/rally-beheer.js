// pages/organisator/rally-beheer.js — Rally momenten & station beheer

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml } from '../../utils/escape.js';
import { naarUTC, naarLocalDT } from '../../utils/datum.js';
import { laadPdfMake } from '../../services/pdf.js';
import { laadJSZip }   from '../../services/zip.js';
import { getGeselecteerdeEditie } from '../../services/editie.js';

const JURY_BASE  = '/admin/jury';
const CAT_BASE   = '/admin/editie-categorieen';
const RALLY_BASE = '/admin/rally';

let editieId             = null;
let momenten             = [];
let categorieen          = [];
let geselecteerdMomentId = null;
let stationsCache        = {};   // momentId → stations[]
let routesCache          = {};   // momentId → routes[]
let aankomstPuntenCache  = {};   // momentId → [{positie, punten}]
let voortgangPuntenCache = {};   // momentId → [{bezoek_nr, punten}]
let patrouillesEditie    = [];   // [{id, nummer}] voor patrol-route toewijzing

let pdfDialogData = null;

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
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <label class="form-label" style="margin:0;white-space:nowrap;">Rally moment:</label>
      <select id="rally-moment-sel" class="form-input" style="flex:1;max-width:360px;"><option value="">— laden… —</option></select>
    </div>
    <div id="rally-content"><p class="text-muted">Laden…</p></div>

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
              <div id="mm-rally-type-hint" class="form-hint" style="margin-top:4px"></div>
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
            <div id="mm-tocht-opties" style="display:none;flex-direction:column;gap:12px">
              <div class="form-group">
                <label class="form-label">Aankomstpunten modus</label>
                <select id="mm-punten-modus" class="form-input">
                  <option value="geen">Geen aankomstpunten</option>
                  <option value="per_station">Per station (vaste punten per post)</option>
                  <option value="per_bezoek">Per bezoek (1e, 2e, 3e post…)</option>
                  <option value="per_positie">Per positie (1e, 2e aankomst bij een post)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Maximale tijdsduur (minuten)</label>
                <input type="number" id="mm-max-duur" class="form-input" min="1" max="999"
                       placeholder="Leeg = geen tijdslimiet" style="max-width:220px">
                <div class="form-hint">Timer start bij de eerste scan (startpost). Na afloop worden scans geweigerd.</div>
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
            <div class="form-group" style="max-width:180px;">
              <label class="form-label">Punten bij aankomst</label>
              <input type="number" id="sm-punten" class="form-input" min="0" step="0.5" placeholder="0"
                title="Voor 'per station' puntmodus.">
            </div>
            <div>
              <label class="form-label" style="margin-bottom:6px;">Criteria — selecteer wat dit station beoordeelt</label>
              <div class="form-hint" style="margin-bottom:8px;">
                <strong>Scoreformulier</strong>: jury vult score in op het station. &nbsp;
                <strong>Aankomst</strong>: criterium waarop de aankomst-volgorde-punten worden geboekt (auto bij scan).
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

    <!-- Modal: route aanmaken/bewerken + stationvolgorde instellen -->
    <div id="route-modal" class="modal-backdrop" style="display:none">
      <div class="modal" style="max-width:520px;width:100%">
        <div class="modal-header">
          <h2 id="rm-titel">Route</h2>
          <button type="button" id="rm-sluiten" class="modal-sluit">&#10005;</button>
        </div>
        <form id="route-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
            <div class="form-group">
              <label class="form-label">Naam route *</label>
              <input type="text" id="rm-naam" class="form-input" required placeholder="bijv. Route A — linksom">
            </div>
            <div>
              <label class="form-label" style="margin-bottom:6px;">Volgorde stations</label>
              <div class="form-hint" style="margin-bottom:8px;">
                Sleep of gebruik de pijlen om de volgorde in te stellen.
                Alleen stations in deze lijst worden gevalideerd bij scannen.
              </div>
              <div id="rm-stations-beschikbaar" style="margin-bottom:8px;"></div>
              <div id="rm-stations-volgorde"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="rm-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: patrouilles koppelen aan routes -->
    <div id="patrol-route-modal" class="modal-backdrop" style="display:none">
      <div class="modal" style="max-width:540px;width:100%">
        <div class="modal-header">
          <h2>Patrouilles &#8594; routes</h2>
          <button type="button" id="prm-sluiten" class="modal-sluit">&#10005;</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <div class="form-hint" style="margin-bottom:12px;">
            Wijs elke patrouille toe aan een route. Patrouilles zonder route kunnen niet scannen bij een tocht.
          </div>
          <div id="prm-tabel"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="prm-sluiten-btn">Sluiten</button>
        </div>
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
          </div>
          <div>
            <div class="form-label" style="margin-bottom:8px">Pagina-marges (mm)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Begin (links)</label>
                <input type="number" id="pdf-marge-links" class="form-input" min="0" max="100" step="0.5" value="7">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Eind (rechts)</label>
                <input type="number" id="pdf-marge-rechts" class="form-input" min="0" max="100" step="0.5" value="7">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Boven</label>
                <input type="number" id="pdf-marge-boven" class="form-input" min="0" max="100" step="0.5" value="7">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Bodem</label>
                <input type="number" id="pdf-marge-onder" class="form-input" min="0" max="100" step="0.5" value="7">
              </div>
            </div>
          </div>
          <div>
            <div class="form-label" style="margin-bottom:8px">Tussenmarge (mm)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Horizontaal (tussen kolommen)</label>
                <input type="number" id="pdf-tus-h" class="form-input" min="0" max="50" step="0.5" value="0">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:.8rem">Verticaal (tussen rijen)</label>
                <input type="number" id="pdf-tus-v" class="form-input" min="0" max="50" step="0.5" value="0">
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

  document.getElementById('btn-nieuw-moment').addEventListener('click', () => {
    if (!editieId) { toon('error', 'Geen editie geselecteerd'); return; }
    openMomentModal(null);
  });
  document.getElementById('btn-patrouille-qr').addEventListener('click', genereerPatrouilleQrs);

  await wisselEditie();
}

export function onMount() {
  window.addEventListener('rsw:editie-changed', _onEditieChanged);
}

export function onDestroy() {
  window.removeEventListener('rsw:editie-changed', _onEditieChanged);
}

function _onEditieChanged() {
  wisselEditie();
}

// ── Edities & momenten ─────────────────────────────────────────────

async function wisselEditie() {
  const editie = getGeselecteerdeEditie();
  const id     = editie?.id ?? null;

  editieId             = id;
  geselecteerdMomentId = null;
  stationsCache        = {};
  routesCache          = {};
  aankomstPuntenCache  = {};
  voortgangPuntenCache = {};
  momenten             = [];
  categorieen          = [];
  patrouillesEditie    = [];

  if (!id) {
    document.getElementById('rally-content').innerHTML = '<p class="text-muted">Geen editie geselecteerd in de header.</p>';
    vulMomentDropdown();
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

    await Promise.all(momenten.map(async m => {
      const cat = categorieen.find(c => c.id === m.categorie_id);
      m.rally_type = cat?.rally_type ?? null;

      try { stationsCache[m.id] = await get(`${RALLY_BASE}/stations?moment_id=${m.id}`); }
      catch { stationsCache[m.id] = []; }

      if (m.rally_type === 'tocht') {
        try { routesCache[m.id]          = await get(`${RALLY_BASE}/routes?moment_id=${m.id}`); }
        catch { routesCache[m.id] = []; }
        try { aankomstPuntenCache[m.id]  = await get(`${RALLY_BASE}/aankomst-punten?moment_id=${m.id}`); }
        catch { aankomstPuntenCache[m.id] = []; }
        try { voortgangPuntenCache[m.id] = await get(`${RALLY_BASE}/voortgang-punten?moment_id=${m.id}`); }
        catch { voortgangPuntenCache[m.id] = []; }
      }
    }));

    vulMomentDropdown();
    renderMomenten();
  } catch (e) { toon('error', e.message); }
}

function vulMomentDropdown() {
  const sel = document.getElementById('rally-moment-sel');
  if (!sel) return;

  if (!momenten.length) {
    sel.innerHTML = '<option value="">— geen rally momenten —</option>';
    geselecteerdMomentId = null;
    return;
  }

  sel.innerHTML = momenten.map(m => {
    const label = [m.naam, m.categorie_naam].filter(Boolean).join(' — ');
    const type  = m.rally_type === 'tocht' ? '🗺 Tocht' : m.rally_type === 'spelmiddag' ? '🎯 Spelmiddag' : '';
    return `<option value="${m.id}">${escapeHtml(label)}${type ? ' (' + type + ')' : ''}</option>`;
  }).join('');

  // Behoud selectie als die nog bestaat, anders kies het eerste moment
  if (!geselecteerdMomentId || !momenten.find(m => m.id === geselecteerdMomentId)) {
    geselecteerdMomentId = momenten[0].id;
  }
  sel.value = geselecteerdMomentId;

  sel.onchange = () => {
    geselecteerdMomentId = Number(sel.value) || null;
    renderMomenten();
  };
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
  const m = momenten.find(x => x.id === geselecteerdMomentId);
  if (!m) {
    el.innerHTML = '<p class="text-muted">Selecteer een rally moment.</p>';
    return;
  }
  el.innerHTML = renderMomentKaart(m);
  bindActies();
}

function rallyTypeBadge(type) {
  if (type === 'tocht')     return '<span class="badge badge-info" style="font-size:.72rem;">&#128506; Tocht</span>';
  if (type === 'spelmiddag') return '<span class="badge badge-warning" style="font-size:.72rem;">&#127918; Spelmiddag</span>';
  return '<span class="badge" style="background:var(--color-surface-alt);font-size:.72rem;">Type onbekend</span>';
}

function renderMomentKaart(m) {
  const stations = stationsCache[m.id] || [];
  const open     = isOpen(m);

  return `
    <div class="card" style="margin-bottom:16px;" data-moment-id="${m.id}">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-weight:700;font-size:1rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${m.naam ? escapeHtml(m.naam) + ' &mdash; ' : ''}${escapeHtml(m.categorie_naam || '—')}
            ${rallyTypeBadge(m.rally_type)}
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

      <!-- Stations -->
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

      ${m.rally_type === 'tocht' ? renderTochtSecties(m) : ''}
    </div>
  `;
}

function renderTochtSecties(m) {
  const modus = m.aankomst_punten_modus || 'geen';
  return `
    <!-- Puntmodus -->
    <div style="padding:0 16px 14px;border-top:1px solid var(--color-border);">
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0 10px;flex-wrap:wrap;">
        <strong style="font-size:.9rem;">&#127942; Aankomstpunten</strong>
        <select class="form-input modus-sel" data-moment-id="${m.id}"
          style="max-width:260px;font-size:.85rem;">
          <option value="geen"       ${modus==='geen'        ? 'selected':''}>Geen aankomstpunten</option>
          <option value="per_station" ${modus==='per_station' ? 'selected':''}>Per station (vaste punten per post)</option>
          <option value="per_bezoek"  ${modus==='per_bezoek'  ? 'selected':''}>Per bezoek (punten voor 1e, 2e, 3e post…)</option>
          <option value="per_positie" ${modus==='per_positie' ? 'selected':''}>Per positie (1e, 2e aankomst bij een post)</option>
        </select>
      </div>

      ${modus === 'per_station' ? `
        <div class="form-hint" style="margin-bottom:8px;">
          Stel per station een vaste puntwaarde in. Patrouilles krijgen die punten bij aankomst.
          De startpost scoort alleen bij terugkomst (rondje).
        </div>
        <p class="text-muted" style="font-size:.82rem;">&#8593; Stel punten in via het station bewerken (veld "Punten bij aankomst").</p>
      ` : ''}

      ${modus === 'per_bezoek' ? `
        <div class="form-hint" style="margin-bottom:10px;">
          Punten op basis van hoeveel posten een patrouille al bezocht heeft.
          1e post = rij 1, 2e post = rij 2, etc. De startpost telt niet mee.
        </div>
        ${renderVoortgangPuntenVelden(m.id)}
        <button class="btn btn-sm btn-primary" style="margin-top:10px;"
          data-actie="sla-voortgang-punten" data-id="${m.id}">Opslaan</button>
      ` : ''}

      ${modus === 'per_positie' ? `
        <div class="form-hint" style="margin-bottom:10px;">
          Punten op basis van wie als 1e, 2e, 3e aankomt bij een post (of bij de start bij terugkomst).
        </div>
        ${renderAankomstPuntenVelden(m.id)}
        <button class="btn btn-sm btn-primary" style="margin-top:10px;"
          data-actie="sla-aankomst-punten" data-id="${m.id}">Opslaan</button>
      ` : ''}
    </div>

    <!-- Routes -->
    <div style="padding:0 16px 16px;border-top:1px solid var(--color-border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 8px;flex-wrap:wrap;gap:8px;">
        <strong style="font-size:.9rem;">&#128506; Routes</strong>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" data-actie="patrouille-routes" data-id="${m.id}">
            &#128101; Patrouilles toewijzen
          </button>
          <button class="btn btn-sm btn-primary" data-actie="nieuw-route" data-id="${m.id}">+ Route toevoegen</button>
        </div>
      </div>
      ${renderRoutesLijst(m.id)}
    </div>
  `;
}

function renderAankomstPuntenVelden(momentId) {
  const punten = aankomstPuntenCache[momentId] || [];
  const posities = Math.max(3, punten.length + 1);
  let html = '<div style="display:flex;flex-wrap:wrap;gap:10px;" id="aankomst-punten-' + momentId + '">';
  for (let i = 1; i <= posities; i++) {
    const rij    = punten.find(p => p.positie === i);
    const waarde = rij ? Number(rij.punten) : 0;
    html += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;">
        <label style="font-size:.75rem;color:var(--color-text-muted);">${ordinal(i)}</label>
        <input type="number" class="form-input aankomst-punt-invoer" min="0" step="0.5"
          data-positie="${i}" data-moment-id="${momentId}"
          value="${waarde}" style="width:64px;padding:4px 6px;text-align:center;">
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function renderVoortgangPuntenVelden(momentId) {
  const punten   = voortgangPuntenCache[momentId] || [];
  const stations = stationsCache[momentId] || [];
  const aantalPosten = Math.max(3, stations.length);
  let html = '<div style="display:flex;flex-wrap:wrap;gap:10px;" id="voortgang-punten-' + momentId + '">';
  for (let i = 1; i <= aantalPosten; i++) {
    const rij    = punten.find(p => p.bezoek_nr === i);
    const waarde = rij ? Number(rij.punten) : 0;
    html += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;">
        <label style="font-size:.75rem;color:var(--color-text-muted);">${i}e post</label>
        <input type="number" class="form-input voortgang-punt-invoer" min="0" step="0.5"
          data-bezoek-nr="${i}" data-moment-id="${momentId}"
          value="${waarde}" style="width:64px;padding:4px 6px;text-align:center;">
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function renderRoutesLijst(momentId) {
  const routes = routesCache[momentId] || [];
  if (!routes.length) {
    return '<p class="text-muted" style="font-size:.85rem;">Nog geen routes. Voeg een route toe om te beginnen.</p>';
  }
  return routes.map(r => `
    <div style="background:var(--color-surface-alt);border-radius:var(--radius-sm);
      padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;"
      data-route-id="${r.id}">
      <div style="flex:1;min-width:180px;">
        <div style="font-weight:600;margin-bottom:4px;">
          ${escapeHtml(r.naam)}
          <span class="badge" style="background:var(--color-surface);font-size:.7rem;margin-left:4px;">
            ${r.patrouille_count} patrouille(s)
          </span>
        </div>
        <div style="font-size:.8rem;color:var(--color-text-muted);">
          ${r.stations.length
            ? r.stations.map(s => (s.is_start ? '<strong title="Startpost">&#9654; ' : '') + escapeHtml(s.naam) + (s.is_start ? '</strong>' : '')).join(' &rarr; ')
            : '<em>Geen stations ingesteld</em>'}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm btn-outline" data-actie="bewerk-route"
          data-id="${r.id}" data-moment-id="${momentId}">Bewerk</button>
        <button class="btn btn-sm btn-danger"  data-actie="verwijder-route"
          data-id="${r.id}" data-moment-id="${momentId}">Verwijder</button>
      </div>
    </div>
  `).join('');
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
    `<span class="badge badge-success" style="font-size:.72rem;margin:1px;" title="Aankomst-criterium: punten worden hier geboekt">
      &#9654; ${escapeHtml(c.criterium_naam)}
    </span>`
  ).join('');

  return `
    <div style="background:var(--color-surface-alt);border-radius:var(--radius-sm);
      padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;"
      data-station-id="${s.id}">
      <div style="flex:1;min-width:180px;">
        <div style="font-weight:600;margin-bottom:4px;">
          ${escapeHtml(s.naam)}
          ${s.punten != null && s.punten > 0 ? `<span class="badge" style="background:var(--color-surface);font-size:.7rem;margin-left:4px;">${s.punten} pts</span>` : ''}
          ${s.criteria.length === 0 ? '<span class="badge badge-warning" style="font-size:.7rem;margin-left:4px;">Geen criteria</span>' : ''}
        </div>
        ${juryLabels     ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:3px;">${juryLabels}</div>` : ''}
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
  // Puntmodus dropdown — change event (niet click, want dat re-rendert te vroeg)
  document.getElementById('rally-content').querySelectorAll('.modus-sel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id    = Number(sel.dataset.momentId);
      const modus = sel.value;
      const m2    = momenten.find(x => x.id === id);
      if (!m2) return;
      try {
        await put(`${JURY_BASE}/momenten/${id}`, {
          categorie_id:          m2.categorie_id,
          naam:                  m2.naam,
          start_tijd:            m2.start_tijd,
          eind_tijd:             m2.eind_tijd,
          jureer_modus:          m2.jureer_modus || 'numeriek',
          rally_modus:           true,
          score_niveau:          m2.score_niveau || 'criterium',
          aankomst_punten:       m2.aankomst_punten ?? 0,
          aankomst_punten_modus: modus,
        });
        m2.aankomst_punten_modus = modus;
        renderMomenten();
      } catch (err) { toon('error', err.message); }
    });
  });

  document.getElementById('rally-content').querySelectorAll('[data-actie]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const actie    = btn.dataset.actie;
      const id       = Number(btn.dataset.id);
      const momentId = Number(btn.dataset.momentId || btn.dataset.id);

      switch (actie) {
        case 'bewerk-moment':
          openMomentModal(momenten.find(x => x.id === id)); break;

        case 'verwijder-moment': {
          const m = momenten.find(x => x.id === id);
          if (!confirm(`Rally moment "${m?.naam || m?.categorie_naam}" verwijderen?`)) return;
          try { await del(`${JURY_BASE}/momenten/${id}`); await laadMomenten(); }
          catch (err) { toon('error', err.message); }
          break;
        }

        case 'toggle-open':
          try { await put(`${JURY_BASE}/momenten/${id}/open`, {}); await laadMomenten(); }
          catch (err) { toon('error', err.message); }
          break;

        case 'nieuw-station':
          openStationModal(null, id); break;

        case 'bewerk-station': {
          const station = (stationsCache[momentId] || []).find(s => s.id === id);
          if (station) openStationModal(station, momentId);
          break;
        }

        case 'verwijder-station':
          if (!confirm('Station verwijderen?')) return;
          try {
            await del(`${RALLY_BASE}/stations/${id}`);
            stationsCache[momentId] = await get(`${RALLY_BASE}/stations?moment_id=${momentId}`);
            renderMomenten();
            toon('success', 'Station verwijderd.');
          } catch (err) { toon('error', err.message); }
          break;

        case 'print-qr': {
          const moment   = momenten.find(x => x.id === id);
          const stations = (stationsCache[id] || []).filter(s => s.qr_dataurl);
          if (!stations.length) { toon('error', 'Geen QR codes beschikbaar.'); return; }
          openPdfDialog('stations', stations.map(s => ({ ...s, categorie_naam: moment?.categorie_naam || '' })), moment?.naam || moment?.categorie_naam || 'Stations');
          break;
        }

        // ── Aankomstpunten per positie opslaan ─────────────────
        case 'sla-aankomst-punten': {
          const invoerVelden = document.querySelectorAll(
            `.aankomst-punt-invoer[data-moment-id="${id}"]`
          );
          const punten = [];
          invoerVelden.forEach(inp => {
            const pos = Number(inp.dataset.positie);
            const pts = Number(inp.value) || 0;
            punten.push({ positie: pos, punten: pts });
          });
          try {
            await put(`${RALLY_BASE}/aankomst-punten`, { moment_id: id, punten });
            aankomstPuntenCache[id] = await get(`${RALLY_BASE}/aankomst-punten?moment_id=${id}`);
            toon('success', 'Aankomstpunten opgeslagen.');
          } catch (err) { toon('error', err.message); }
          break;
        }

        // ── Voortgang punten per bezoek opslaan ───────────────
        case 'sla-voortgang-punten': {
          const invoerVelden = document.querySelectorAll(
            `.voortgang-punt-invoer[data-moment-id="${id}"]`
          );
          const punten = [];
          invoerVelden.forEach(inp => {
            const nr  = Number(inp.dataset.bezoekNr);
            const pts = Number(inp.value) || 0;
            punten.push({ bezoek_nr: nr, punten: pts });
          });
          try {
            await put(`${RALLY_BASE}/voortgang-punten`, { moment_id: id, punten });
            voortgangPuntenCache[id] = await get(`${RALLY_BASE}/voortgang-punten?moment_id=${id}`);
            toon('success', 'Voortgangspunten opgeslagen.');
          } catch (err) { toon('error', err.message); }
          break;
        }

        // ── Route CRUD ─────────────────────────────────────────
        case 'nieuw-route':
          openRouteModal(null, id); break;

        case 'bewerk-route': {
          const route = (routesCache[momentId] || []).find(r => r.id === id);
          if (route) openRouteModal(route, momentId);
          break;
        }

        case 'verwijder-route':
          if (!confirm('Route verwijderen?')) return;
          try {
            await del(`${RALLY_BASE}/routes/${id}`);
            routesCache[momentId] = await get(`${RALLY_BASE}/routes?moment_id=${momentId}`);
            renderMomenten();
            toon('success', 'Route verwijderd.');
          } catch (err) { toon('error', err.message); }
          break;

        // ── Patrouille-routes toewijzen ────────────────────────
        case 'patrouille-routes':
          openPatrolRouteModal(id); break;
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

  const toonTypeHint = () => {
    const cat       = categorieen.find(c => c.id === Number(catSel.value));
    const hint      = document.getElementById('mm-rally-type-hint');
    const tochtOpts = document.getElementById('mm-tocht-opties');
    if (!hint) return;
    if (!cat) { hint.textContent = ''; if (tochtOpts) tochtOpts.style.display = 'none'; return; }
    if (cat.rally_type === 'tocht') {
      hint.innerHTML = '&#128506; <strong>Tocht</strong> — vaste route per patrouille, volgorde-punten.';
      if (tochtOpts) tochtOpts.style.display = 'flex';
    } else if (cat.rally_type === 'spelmiddag') {
      hint.innerHTML = '&#127918; <strong>Spelmiddag</strong> — vrij scannen, geen volgorde-validatie.';
      if (tochtOpts) tochtOpts.style.display = 'none';
    } else {
      hint.innerHTML = '<span class="text-muted">Stel rally_type in op de categorieënpagina.</span>';
      if (tochtOpts) tochtOpts.style.display = 'none';
    }
  };
  catSel.addEventListener('change', toonTypeHint);
  toonTypeHint();

  document.getElementById('mm-naam').value  = m?.naam || '';
  document.getElementById('mm-start').value = naarLocalDT(m?.start_tijd);
  document.getElementById('mm-eind').value  = naarLocalDT(m?.eind_tijd);
  const modusEl = document.getElementById('mm-punten-modus');
  if (modusEl) modusEl.value = m?.aankomst_punten_modus || 'geen';
  const duurEl = document.getElementById('mm-max-duur');
  if (duurEl) duurEl.value = m?.max_duur_minuten ?? '';

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
      jureer_modus:          'numeriek',
      rally_modus:           true,
      score_niveau:          'criterium',
      aankomst_punten:       0,
      aankomst_punten_modus: document.getElementById('mm-punten-modus')?.value || 'geen',
      max_duur_minuten:      Number(document.getElementById('mm-max-duur')?.value) || null,
    };
    try {
      if (bewerkMomentId) await put(`${JURY_BASE}/momenten/${bewerkMomentId}`, body);
      else await post(`${JURY_BASE}/momenten`, body);
      modal.style.display = 'none';
      await laadMomenten();
    } catch (err) { toon('error', err.message); }
  };
}

// ── Station modal ──────────────────────────────────────────────────

let bewerkStationId = null;
let stationMomentId = null;

async function openStationModal(station, momentId) {
  bewerkStationId = station?.id ?? null;
  stationMomentId = momentId;

  document.getElementById('sm-titel').textContent = station ? 'Station bewerken' : 'Nieuw station';
  document.getElementById('sm-naam').value   = station?.naam || '';
  document.getElementById('sm-punten').value = station?.punten ?? '';

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

  const huidigeCriteria = station?.criteria || [];
  const huidigeIds  = new Set(huidigeCriteria.map(c => c.criterium_id));
  const huidigeType = Object.fromEntries(huidigeCriteria.map(c => [c.criterium_id, c.is_aankomst ? 'aankomst' : 'jury']));

  const isTocht    = moment?.rally_type === 'tocht';
  const container  = document.getElementById('sm-criteria-lijst');

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
          ${isTocht ? `
          <div class="crit-type-sectie" style="margin-top:6px;margin-left:26px;display:${checked ? 'flex' : 'none'};
            align-items:center;gap:16px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;">
              <input type="radio" name="crit-type-${cr.id}" class="crit-type" value="jury"
                data-crit-id="${cr.id}" ${!isAankomst ? 'checked' : ''}>
              Scoreformulier
            </label>
            <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;">
              <input type="radio" name="crit-type-${cr.id}" class="crit-type" value="aankomst"
                data-crit-id="${cr.id}" ${isAankomst ? 'checked' : ''}>
              Aankomst <span class="text-muted" style="font-size:.75rem;">(volgorde-punten worden hier geboekt)</span>
            </label>
          </div>` : ''}
        </div>
      `;
    }
    container.innerHTML = html;

    container.querySelectorAll('.crit-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const rij     = cb.closest('.crit-rij');
        const typeSec = rij?.querySelector('.crit-type-sectie');
        if (typeSec) typeSec.style.display = cb.checked ? 'flex' : 'none';
      });
    });
  }

  const modal = document.getElementById('station-modal');
  modal.style.display = 'flex';
  document.getElementById('sm-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('sm-annuleer').onclick = () => { modal.style.display = 'none'; };

  document.getElementById('station-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const naam   = document.getElementById('sm-naam').value.trim();
    const punten = document.getElementById('sm-punten').value !== '' ? Number(document.getElementById('sm-punten').value) : null;
    const criteria = [];
    document.querySelectorAll('.crit-check:checked').forEach((cb, i) => {
      const critId     = Number(cb.dataset.critId);
      const typeRadio  = document.querySelector(`.crit-type[data-crit-id="${critId}"]:checked`);
      const isAankomst = typeRadio?.value === 'aankomst';
      criteria.push({ criterium_id: critId, aankomst_punten: 0, is_aankomst: isAankomst, volgorde: i });
    });
    try {
      if (bewerkStationId) {
        await put(`${RALLY_BASE}/stations/${bewerkStationId}`, { naam, punten });
        await put(`${RALLY_BASE}/stations/${bewerkStationId}/criteria`, { criteria });
      } else {
        const r = await post(`${RALLY_BASE}/stations`, { jurymoment_id: stationMomentId, naam });
        await put(`${RALLY_BASE}/stations/${r.id}`, { naam, punten });
        if (criteria.length) await put(`${RALLY_BASE}/stations/${r.id}/criteria`, { criteria });
      }
      modal.style.display = 'none';
      stationsCache[stationMomentId] = await get(`${RALLY_BASE}/stations?moment_id=${stationMomentId}`);
      renderMomenten();
    } catch (err) { toon('error', err.message); }
  };
}

// ── Route modal ────────────────────────────────────────────────────

let bewerkRouteId  = null;
let routeMomentId  = null;

// Geselecteerde stations in volgorde (array van {station_id, naam})
let routeStationsGekozen = [];

function openRouteModal(route, momentId) {
  bewerkRouteId   = route?.id ?? null;
  routeMomentId   = momentId;
  routeStationsGekozen = route?.stations ? [...route.stations] : [];

  document.getElementById('rm-titel').textContent = route ? 'Route bewerken' : 'Nieuwe route';
  document.getElementById('rm-naam').value         = route?.naam || '';

  renderRouteBeschikbaarEnVolgorde(momentId);

  const modal = document.getElementById('route-modal');
  modal.style.display = 'flex';
  document.getElementById('rm-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('rm-annuleer').onclick = () => { modal.style.display = 'none'; };

  document.getElementById('route-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const naam = document.getElementById('rm-naam').value.trim();
    try {
      let routeId = bewerkRouteId;
      if (routeId) {
        await put(`${RALLY_BASE}/routes/${routeId}`, { naam });
      } else {
        const r = await post(`${RALLY_BASE}/routes`, { jurymoment_id: routeMomentId, naam });
        routeId = r.id;
      }
      const stations = routeStationsGekozen.map(s => ({ station_id: s.station_id, is_start: !!s.is_start }));
      await put(`${RALLY_BASE}/routes/${routeId}/stations`, { stations });
      modal.style.display = 'none';
      routesCache[routeMomentId] = await get(`${RALLY_BASE}/routes?moment_id=${routeMomentId}`);
      renderMomenten();
    } catch (err) { toon('error', err.message); }
  };
}

function renderRouteBeschikbaarEnVolgorde(momentId) {
  const alleStations = stationsCache[momentId] || [];

  // Beschikbare stations — alle stations tonen (een post mag meerdere keren in de route)
  const elBesch = document.getElementById('rm-stations-beschikbaar');
  if (elBesch) {
    elBesch.innerHTML = alleStations.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${alleStations.map(s =>
          `<button type="button" class="btn btn-sm btn-outline rm-add-station"
            data-station-id="${s.id}" data-station-naam="${escapeHtml(s.naam)}">
            + ${escapeHtml(s.naam)}
          </button>`
        ).join('')}</div>`
      : '<p class="text-muted" style="font-size:.82rem;">Geen stations beschikbaar. Voeg eerst stations toe.</p>';

    elBesch.querySelectorAll('.rm-add-station').forEach(btn => {
      btn.addEventListener('click', () => {
        routeStationsGekozen.push({
          station_id: Number(btn.dataset.stationId),
          naam:       btn.dataset.stationNaam,
          is_start:   false,
        });
        renderRouteBeschikbaarEnVolgorde(momentId);
      });
    });
  }

  // Gekozen stations in volgorde
  const elVolgorde = document.getElementById('rm-stations-volgorde');
  if (!elVolgorde) return;

  if (!routeStationsGekozen.length) {
    elVolgorde.innerHTML = '<p class="text-muted" style="font-size:.82rem;">Nog geen stations geselecteerd.</p>';
    return;
  }

  elVolgorde.innerHTML = routeStationsGekozen.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;
      border-bottom:1px solid var(--color-border);" data-idx="${i}">
      <span style="font-size:.8rem;color:var(--color-text-muted);min-width:20px;">${i + 1}.</span>
      <span style="flex:1;font-size:.88rem;">${escapeHtml(s.naam)}</span>
      <label style="display:flex;align-items:center;gap:4px;font-size:.78rem;white-space:nowrap;cursor:pointer;"
        title="Markeer deze positie als startpost. Eerste scan registreert maar scoort niet.">
        <input type="checkbox" class="rm-is-start" data-idx="${i}"
          ${s.is_start ? 'checked' : ''}
          style="width:14px;height:14px;accent-color:var(--color-primary);">
        Start
      </label>
      <div style="display:flex;gap:4px;">
        <button type="button" class="btn btn-sm btn-ghost rm-omhoog" data-idx="${i}"
          ${i === 0 ? 'disabled' : ''} style="padding:2px 6px;">&#8593;</button>
        <button type="button" class="btn btn-sm btn-ghost rm-omlaag" data-idx="${i}"
          ${i === routeStationsGekozen.length - 1 ? 'disabled' : ''} style="padding:2px 6px;">&#8595;</button>
        <button type="button" class="btn btn-sm btn-danger rm-verwijder" data-idx="${i}"
          style="padding:2px 6px;">&#10005;</button>
      </div>
    </div>
  `).join('');

  elVolgorde.querySelectorAll('.rm-is-start').forEach(cb => {
    cb.addEventListener('change', () => {
      routeStationsGekozen[Number(cb.dataset.idx)].is_start = cb.checked;
    });
  });
  elVolgorde.querySelectorAll('.rm-omhoog').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      [routeStationsGekozen[i - 1], routeStationsGekozen[i]] =
        [routeStationsGekozen[i], routeStationsGekozen[i - 1]];
      renderRouteBeschikbaarEnVolgorde(momentId);
    });
  });
  elVolgorde.querySelectorAll('.rm-omlaag').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      [routeStationsGekozen[i], routeStationsGekozen[i + 1]] =
        [routeStationsGekozen[i + 1], routeStationsGekozen[i]];
      renderRouteBeschikbaarEnVolgorde(momentId);
    });
  });
  elVolgorde.querySelectorAll('.rm-verwijder').forEach(btn => {
    btn.addEventListener('click', () => {
      routeStationsGekozen.splice(Number(btn.dataset.idx), 1);
      renderRouteBeschikbaarEnVolgorde(momentId);
    });
  });
}

// ── Patrol-route modal ─────────────────────────────────────────────

let patrolRouteMomentId = null;

async function openPatrolRouteModal(momentId) {
  patrolRouteMomentId = momentId;

  const modal = document.getElementById('patrol-route-modal');
  modal.style.display = 'flex';
  document.getElementById('prm-sluiten').onclick     = () => { modal.style.display = 'none'; };
  document.getElementById('prm-sluiten-btn').onclick = () => { modal.style.display = 'none'; };

  const tabel = document.getElementById('prm-tabel');
  tabel.innerHTML = '<div class="loading-spinner"></div>';

  try {
    // Laad patrouilles als nog niet geladen
    if (!patrouillesEditie.length) {
      const tokens = await get(`${RALLY_BASE}/tokens?editie_id=${editieId}`);
      patrouillesEditie = (tokens.tokens || [])
        .filter(t => t.nummer !== null)
        .sort((a, b) => (a.nummer ?? 9999) - (b.nummer ?? 9999));
    }

    const routes          = routesCache[momentId] || [];
    const toewijzingen    = await get(`${RALLY_BASE}/patrouille-routes?moment_id=${momentId}`);
    const toewijzingMap   = Object.fromEntries(toewijzingen.map(t => [t.patrouille_id, t.route_id]));

    if (!routes.length) {
      tabel.innerHTML = '<p class="text-muted">Eerst routes aanmaken voor je patrouilles kunt koppelen.</p>';
      return;
    }
    if (!patrouillesEditie.length) {
      tabel.innerHTML = '<p class="text-muted">Geen patrouilles gevonden. Genereer eerst QR-codes.</p>';
      return;
    }

    const routeOpties = '<option value="">— geen route —</option>' +
      routes.map(r => `<option value="${r.id}">${escapeHtml(r.naam)}</option>`).join('');

    tabel.innerHTML = `
      <table class="data-table" style="width:100%">
        <thead><tr>
          <th>Patrouille</th>
          <th>Route</th>
        </tr></thead>
        <tbody>
          ${patrouillesEditie.map(p => `
            <tr>
              <td><strong>#${p.nummer ?? '?'}</strong></td>
              <td>
                <select class="form-input prm-route-sel" style="padding:4px 8px;"
                  data-patrouille-id="${p.patrouille_id}">
                  ${routeOpties}
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Vul bestaande toewijzingen in
    tabel.querySelectorAll('.prm-route-sel').forEach(sel => {
      const patId = Number(sel.dataset.patrouilleId);
      if (toewijzingMap[patId]) sel.value = toewijzingMap[patId];

      sel.addEventListener('change', async () => {
        const routeId = Number(sel.value) || null;
        try {
          if (routeId) {
            await post(`${RALLY_BASE}/patrouille-routes`, {
              patrouille_id: patId, route_id: routeId,
            });
          } else {
            await del(`${RALLY_BASE}/patrouille-routes?patrouille_id=${patId}&moment_id=${momentId}`);
          }
        } catch (err) {
          toon('error', err.message);
          sel.value = toewijzingMap[patId] || '';
        }
      });
    });

    // Herlaad routes (patrouille_count bijwerken)
    routesCache[momentId] = await get(`${RALLY_BASE}/routes?moment_id=${momentId}`);
  } catch (e) {
    tabel.innerHTML = `<p class="text-muted">Fout: ${escapeHtml(e.message)}</p>`;
  }
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
    patrouillesEditie = tokens.filter(t => t.nummer !== null)
      .sort((a, b) => (a.nummer ?? 9999) - (b.nummer ?? 9999));
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
  document.getElementById('pdf-kolommen').oninput    = updatePdfPreview;
  document.getElementById('pdf-rijen').oninput       = updatePdfPreview;
  document.getElementById('pdf-marge-links').oninput  = updatePdfPreview;
  document.getElementById('pdf-marge-rechts').oninput = updatePdfPreview;
  document.getElementById('pdf-marge-boven').oninput  = updatePdfPreview;
  document.getElementById('pdf-marge-onder').oninput  = updatePdfPreview;
  document.getElementById('pdf-tus-h').oninput        = updatePdfPreview;
  document.getElementById('pdf-tus-v').oninput        = updatePdfPreview;
}

function sluitPdfDialog() {
  document.getElementById('pdf-modal').style.display = 'none';
  pdfDialogData = null;
}

function leesMarges() {
  const MM_TO_PT = 72 / 25.4;
  return {
    links:  (Number(document.getElementById('pdf-marge-links').value)  || 0) * MM_TO_PT,
    rechts: (Number(document.getElementById('pdf-marge-rechts').value) || 0) * MM_TO_PT,
    boven:  (Number(document.getElementById('pdf-marge-boven').value)  || 0) * MM_TO_PT,
    onder:  (Number(document.getElementById('pdf-marge-onder').value)  || 0) * MM_TO_PT,
    tusH:   (Number(document.getElementById('pdf-tus-h').value)        || 0) * MM_TO_PT,
    tusV:   (Number(document.getElementById('pdf-tus-v').value)        || 0) * MM_TO_PT,
  };
}

function updatePdfPreview() {
  const k         = Math.max(1, Number(document.getElementById('pdf-kolommen').value) || 3);
  const r         = Math.max(1, Number(document.getElementById('pdf-rijen').value) || 4);
  const perPagina = k * r;
  const totaal    = pdfDialogData?.items.length ?? 0;
  const paginas   = totaal ? Math.ceil(totaal / perPagina) : 0;
  const m         = leesMarges();
  const PT_MM     = 25.4 / 72;
  const pageW     = 595 - m.links - m.rechts;
  const pageH     = 842 - m.boven - m.onder;
  const celW      = (pageW - (k - 1) * m.tusH) / k;
  const celH      = (pageH - (r - 1) * m.tusV) / r;
  document.getElementById('pdf-preview').textContent =
    `${perPagina} per pagina · ${paginas} pagina${paginas !== 1 ? "'s" : ''} · sticker ~${Math.round(celW * PT_MM)} × ${Math.round(celH * PT_MM)} mm`;
}

async function genereerPdf() {
  if (!pdfDialogData) return;
  const btn = document.getElementById('pdf-download');
  btn.disabled = true; btn.textContent = 'Bezig…';
  try {
    const k = Math.max(1, Number(document.getElementById('pdf-kolommen').value) || 3);
    const r = Math.max(1, Number(document.getElementById('pdf-rijen').value) || 4);
    await maakStickerPdf(pdfDialogData.type, pdfDialogData.items, k, r, leesMarges());
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
      const item = pdfDialogData.items[i];
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
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
    };
    img.onerror  = () => reject(new Error('QR afbeelding kon niet worden geladen.'));
    img.src      = dataUrl;
  });
}

async function maakStickerPdf(type, items, kolommen, rijen, marges = {}) {
  await laadPdfMake();
  const m        = marges;
  const BORDER   = 0.5;
  const INNER    = 4; // vaste interne padding (pt) zodat QR niet tegen rand zit
  const AVAIL_W  = 595 - (m.links || 0) - (m.rechts || 0);
  const AVAIL_H  = 842 - (m.boven || 0) - (m.onder  || 0);
  const GUTTER_H = m.tusH || 0; // tussenmarge horizontaal (pt)
  const GUTTER_V = m.tusV || 0; // tussenmarge verticaal (pt)
  // Stikker-cel afmeting: beschikbare ruimte minus tussenmarges, gedeeld door aantal
  const CEL_W    = (AVAIL_W - (kolommen - 1) * GUTTER_H) / kolommen;
  const CEL_H    = (AVAIL_H - (rijen    - 1) * GUTTER_V) / rijen;
  const perPagina = kolommen * rijen;
  const tekstH    = type === 'patrouilles' ? 28 : 42;
  const qrMaat    = Math.max(20, Math.min(CEL_W - INNER * 2, CEL_H - INNER * 2 - tekstH));

  // Kolom-breedtes: stikker-kolommen afgewisseld met gutter-kolommen
  const colWidths = [];
  for (let c = 0; c < kolommen; c++) {
    colWidths.push(CEL_W);
    if (c < kolommen - 1 && GUTTER_H > 0) colWidths.push(GUTTER_H);
  }

  const tabelLayout = {
    hLineWidth: () => BORDER, vLineWidth: () => BORDER,
    hLineColor: () => '#cccccc', vLineColor: () => '#cccccc',
    paddingLeft: () => 0, paddingRight: () => 0,
    paddingTop:  () => 0, paddingBottom: () => 0,
  };
  const leeg = () => ({ text: '', border: [false, false, false, false] });

  function bouwStickerCel(item) {
    if (!item) return { text: '', border: [true, true, true, true] };
    if (type === 'patrouilles') {
      return {
        stack: [
          { text: `#${item.nummer ?? '?'}`, fontSize: 12, bold: true, color: '#e94560', alignment: 'center', margin: [0, 0, 0, 2] },
          { image: item.qr_dataurl, width: qrMaat, height: qrMaat, alignment: 'center' },
          { text: 'RSW Rally', fontSize: 7, color: '#888888', alignment: 'center', margin: [0, 2, 0, 0] },
        ],
        margin: [INNER, INNER, INNER, INNER], border: [true, true, true, true],
      };
    }
    const juryCrit = (item.criteria || []).filter(c => !c.is_aankomst).map(c => c.criterium_naam).join(', ');
    const stack = [
      { text: item.naam, fontSize: 9, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      { image: item.qr_dataurl, width: qrMaat, height: qrMaat, alignment: 'center' },
    ];
    if (item.categorie_naam) stack.push({ text: item.categorie_naam, fontSize: 7, color: '#555555', alignment: 'center', margin: [0, 2, 0, 0] });
    if (juryCrit)            stack.push({ text: juryCrit, fontSize: 7, color: '#333333', alignment: 'center' });
    return { stack, margin: [INNER, INNER, INNER, INNER], border: [true, true, true, true] };
  }

  // Bouw een inhoudsrij: stikker-cellen afgewisseld met lege gutter-cellen
  function bouwInhoudsRij(rijItems) {
    const row = [];
    for (let c = 0; c < kolommen; c++) {
      row.push(bouwStickerCel(rijItems[c] ?? null));
      if (c < kolommen - 1 && GUTTER_H > 0) row.push(leeg());
    }
    return row;
  }

  // Gutter-rij: louter lege cellen zonder border
  function bouwGutterRij() {
    const totalCols = GUTTER_H > 0 ? kolommen * 2 - 1 : kolommen;
    return Array.from({ length: totalCols }, leeg);
  }

  const content = [];
  for (let p = 0; p * perPagina < items.length; p++) {
    const pageItems = items.slice(p * perPagina, (p + 1) * perPagina);
    while (pageItems.length < perPagina) pageItems.push(null);

    const body    = [];
    const heights = [];
    for (let r = 0; r < rijen; r++) {
      body.push(bouwInhoudsRij(pageItems.slice(r * kolommen, (r + 1) * kolommen)));
      heights.push(CEL_H);
      if (r < rijen - 1 && GUTTER_V > 0) {
        body.push(bouwGutterRij());
        heights.push(GUTTER_V);
      }
    }

    const tabel = {
      table: { widths: colWidths, heights, body },
      layout: tabelLayout,
    };
    if (p > 0) tabel.pageBreak = 'before';
    content.push(tabel);
  }

  pdfMake.createPdf({
    pageSize: 'A4',
    pageMargins: [m.links || 0, m.boven || 0, m.rechts || 0, m.onder || 0],
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
  return new Date(dt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ordinal(n) {
  const s = ['1e', '2e', '3e', '4e', '5e'];
  return s[n - 1] ?? `${n}e`;
}

function toon(type, msg) {
  const el = document.getElementById('rally-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

