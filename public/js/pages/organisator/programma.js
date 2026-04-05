// pages/organisator/programma.js — Programma beheer

import { get, post, put, del, patch } from '../../services/api.js';
import { escapeHtml as esc } from '../../utils/escape.js';
import { naarUTC, naarLocalDT } from '../../utils/datum.js';

let editieId  = null;
let editie    = null;
let items     = [];
let momenten  = [];
let alleEdities = [];

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1><span class="material-icons">event</span> Programma beheer</h1></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-kopieer"><span class="material-icons">content_paste</span> Kopieer van editie</button>
        <button class="btn btn-primary" id="btn-nieuw-item">+ Item toevoegen</button>
      </div>
    </div>
    <div id="prog-berichten"></div>
    <div id="prog-content"><p class="text-muted">Laden…</p></div>

    <!-- Item modal -->
    <div id="item-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 id="modal-titel">Programma-item</h2>
          <button type="button" id="modal-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer">&#10005;</button>
        </div>
        <form id="item-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Naam *</label>
              <input type="text" id="f-naam" class="form-input" required placeholder="bijv. Opening ceremonie">
            </div>
            <div class="form-group">
              <label class="form-label">Omschrijving</label>
              <input type="text" id="f-omschrijving" class="form-input" placeholder="Optionele toelichting">
            </div>
            <div style="display:flex;gap:10px">
              <div class="form-group" style="flex:1;margin:0">
                <label class="form-label">Starttijd *</label>
                <input type="datetime-local" id="f-start" class="form-input" required>
              </div>
              <div class="form-group" style="flex:1;margin:0">
                <label class="form-label">Eindtijd</label>
                <input type="datetime-local" id="f-eind" class="form-input">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="modal-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Kopieer modal -->
    <div id="kopieer-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2>Kopieer programma van editie</h2>
          <button type="button" id="kopieer-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer">&#10005;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <p style="font-size:0.88rem;color:var(--color-text-muted);margin:0">
            Alle programma-items worden gekopieerd. De datums worden automatisch verschoven op basis van
            het verschil in startdatum van de twee edities.
          </p>
          <div class="form-group" style="margin:0">
            <label class="form-label">Kopieer van</label>
            <select id="kopieer-bron" class="form-input">
              <option value="">— Selecteer editie —</option>
            </select>
          </div>
          <div id="kopieer-info" style="font-size:0.83rem;color:var(--color-text-muted)"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="kopieer-annuleer">Annuleren</button>
          <button type="button" class="btn btn-primary" id="kopieer-bevestig" disabled>Kopieer items</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-nieuw-item').addEventListener('click', () => openModal(null));
  document.getElementById('btn-kopieer').addEventListener('click', openKopieerModal);
  await laadData();
}

async function laadData() {
  try {
    [editie, alleEdities] = await Promise.all([
      get('/publiek/editie/actief'),
      get('/admin/edities'),
    ]);
    if (!editie) {
      document.getElementById('prog-content').innerHTML = '<p class="text-muted">Geen actieve editie.</p>';
      return;
    }
    editieId = editie.id;

    [items, momenten] = await Promise.all([
      get(`/admin/programma?editie_id=${editieId}`),
      get(`/admin/jury/momenten?editie_id=${editieId}`),
    ]);

    renderContent();
  } catch (e) {
    toonBericht('error', e.message);
  }
}

function renderContent() {
  document.getElementById('prog-content').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      ${renderInschrijvingsdata()}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        ${renderCustomItems()}
        ${renderJurymomenten()}
      </div>
      ${renderVooruitblik()}
    </div>
  `;
  bindActies();
}

// ── Inschrijvingsdata ──────────────────────────────────────────────

function renderInschrijvingsdata() {
  const fmt = d => d ? d.slice(0, 10) : '';  // DATE → YYYY-MM-DD voor <input type="date">
  return `
    <div class="card" style="padding:0">
      <div style="padding:12px 16px;font-weight:700;font-size:0.95rem;border-bottom:2px solid var(--color-border);
        display:flex;align-items:center;justify-content:space-between">
        <span>&#128221; Inschrijvingsfasen</span>
        <span style="font-size:0.78rem;font-weight:400;color:var(--color-text-muted)">
          Datums verschijnen automatisch in het publieke programma
        </span>
      </div>
      <form id="inschrijving-form" style="padding:14px 16px">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:grid;grid-template-columns:140px 1fr 1fr;align-items:end;gap:12px">
            <span style="font-size:0.85rem;font-weight:600;padding-bottom:6px">Voorinschrijving</span>
            ${datumVeld('voorinschrijving_start', 'Start', fmt(editie.voorinschrijving_start))}
            ${datumVeld('voorinschrijving_sluit', 'Einde', fmt(editie.voorinschrijving_sluit))}
          </div>
          <div style="display:grid;grid-template-columns:140px 1fr 1fr;align-items:end;gap:12px">
            <span style="font-size:0.85rem;font-weight:600;padding-bottom:6px">Inschrijving</span>
            ${datumVeld('inschrijving_start', 'Start', fmt(editie.inschrijving_start))}
            ${datumVeld('inschrijving_sluit', 'Einde', fmt(editie.inschrijving_sluit))}
          </div>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
          <button type="submit" class="btn btn-sm btn-primary">Opslaan</button>
          <span id="inschrijving-status" style="font-size:0.8rem;color:var(--color-text-muted)"></span>
        </div>
      </form>
    </div>`;
}

function datumVeld(id, label, waarde) {
  return `
    <div class="form-group" style="margin:0">
      <label class="form-label" style="font-size:0.78rem">${esc(label)}</label>
      <input type="date" id="${id}" class="form-input" value="${esc(waarde)}"
        style="font-size:0.85rem;padding:5px 8px">
    </div>`;
}

// ── Custom items ───────────────────────────────────────────────────

function renderCustomItems() {
  const rijen = items.length
    ? items.map(item => `
      <tr style="border-bottom:1px solid var(--color-border)">
        <td style="padding:8px 12px">
          <div style="font-weight:600;font-size:0.9rem">${esc(item.naam)}</div>
          ${item.omschrijving ? `<div style="font-size:0.78rem;color:var(--color-text-muted)">${esc(item.omschrijving)}</div>` : ''}
        </td>
        <td style="padding:8px 10px;white-space:nowrap;font-size:0.82rem;color:var(--color-text-muted)">
          ${formatTijd(item.start_tijd)}${item.eind_tijd ? `–${formatTijd(item.eind_tijd)}` : ''}
        </td>
        <td style="padding:8px 10px;white-space:nowrap">
          <button class="btn btn-sm btn-ghost" data-actie="bewerk-item" data-id="${item.id}">Bewerk</button>
          <button class="btn btn-sm btn-ghost" data-actie="verwijder-item" data-id="${item.id}"
            style="color:var(--color-error)">Verwijder</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:14px;text-align:center" class="text-muted">Nog geen items.</td></tr>`;

  return `
    <div class="card" style="padding:0">
      <div style="padding:12px 16px;font-weight:700;font-size:0.95rem;border-bottom:2px solid var(--color-border)">
        &#127362; Programma-items
      </div>
      <table class="data-table"><tbody>${rijen}</tbody></table>
    </div>`;
}

// ── Jurymomenten ───────────────────────────────────────────────────

function renderJurymomenten() {
  const rijen = momenten.length
    ? momenten.map(m => `
      <tr style="border-bottom:1px solid var(--color-border)">
        <td style="padding:8px 12px">
          <div style="font-weight:600;font-size:0.9rem">${esc(m.categorie_naam || '—')}</div>
          <div style="font-size:0.78rem;color:var(--color-text-muted)">
            ${formatDag(m.start_tijd)} ${formatTijd(m.start_tijd)}–${formatTijd(m.eind_tijd)}
          </div>
        </td>
        <td style="padding:8px 14px;text-align:center">
          <button class="btn btn-sm ${m.in_programma ? 'btn-primary' : 'btn-ghost'}"
            data-actie="toggle-programma" data-id="${m.id}">
            ${m.in_programma ? '&#9679; Zichtbaar' : '&#9675; Verborgen'}
          </button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:14px;text-align:center" class="text-muted">Geen jurymomenten.</td></tr>`;

  return `
    <div class="card" style="padding:0">
      <div style="padding:12px 16px;font-weight:700;font-size:0.95rem;border-bottom:2px solid var(--color-border)">
        &#9203; Jurymomenten
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Moment</th>
            <th style="text-align:center">Zichtbaar</th>
          </tr>
        </thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>`;
}

// ── Vooruitblik ────────────────────────────────────────────────────

function renderVooruitblik() {
  const vooraf = [];
  if (editie.voorinschrijving_start || editie.voorinschrijving_sluit) {
    vooraf.push({
      naam: 'Voorinschrijving',
      start_tijd: editie.voorinschrijving_start || editie.voorinschrijving_sluit,
      eind_tijd:  editie.voorinschrijving_sluit || null,
    });
  }
  if (editie.inschrijving_start || editie.inschrijving_sluit) {
    vooraf.push({
      naam: 'Inschrijving',
      start_tijd: editie.inschrijving_start || editie.inschrijving_sluit,
      eind_tijd:  editie.inschrijving_sluit || null,
    });
  }

  const rswItems = [
    ...items.map(i  => ({ ...i, _type: 'custom' })),
    ...momenten.filter(m => m.in_programma).map(m => ({
      naam: m.categorie_naam || '—', start_tijd: m.start_tijd, eind_tijd: m.eind_tijd, _type: 'jury',
    })),
  ].sort((a, b) => new Date(a.start_tijd) - new Date(b.start_tijd));

  if (!vooraf.length && !rswItems.length) return '';

  const typeIcoon = { custom: '&#127362;', jury: '&#9203;' };

  let html = `
    <div class="card" style="padding:0">
      <div style="padding:12px 16px;font-weight:700;font-size:0.95rem;border-bottom:2px solid var(--color-border)">
        &#128065;&#65039; Vooruitblik publiek programma
      </div>
      <table class="data-table">
        <tbody>`;

  if (vooraf.length) {
    html += `<tr><td colspan="2" style="padding:6px 12px 4px;font-size:0.72rem;font-weight:700;
      text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);
      background:var(--color-surface-alt)">Voorafgaand</td></tr>`;
    html += vooraf.map(item => `
      <tr style="border-bottom:1px solid var(--color-border)">
        <td style="padding:7px 12px;font-size:0.85rem;font-weight:600">&#128221; ${esc(item.naam)}</td>
        <td style="padding:7px 12px;font-size:0.8rem;color:var(--color-text-muted);text-align:right;white-space:nowrap">
          ${datumBereikKort(item.start_tijd, item.eind_tijd)}
        </td>
      </tr>`).join('');
  }

  if (rswItems.length) {
    // Groepeer per dag
    const perDag = new Map();
    for (const item of rswItems) {
      const key = new Date(item.start_tijd).toISOString().slice(0, 10);
      if (!perDag.has(key)) perDag.set(key, []);
      perDag.get(key).push(item);
    }

    const editieLabel = [editie.naam, editie.jaar].filter(Boolean).join(' ') || 'RSW';
    html += `<tr><td colspan="2" style="padding:6px 12px 4px;font-size:0.72rem;font-weight:700;
      text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);
      background:var(--color-surface-alt)">${esc(editieLabel)}</td></tr>`;

    for (const [dagKey, dagItems] of perDag) {
      const dagLabel = new Date(dagKey + 'T12:00:00').toLocaleDateString('nl-NL', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      html += `<tr style="background:color-mix(in srgb,var(--color-surface-alt) 50%,transparent)">
        <td colspan="2" style="padding:4px 12px;font-size:0.75rem;font-style:italic;
          color:var(--color-text-muted)">${esc(dagLabel)}</td></tr>`;
      html += dagItems.map(item => `
        <tr style="border-bottom:1px solid var(--color-border)">
          <td style="padding:6px 12px;font-size:0.85rem">
            ${typeIcoon[item._type] || ''} ${esc(item.naam)}
          </td>
          <td style="padding:6px 12px;font-size:0.8rem;color:var(--color-text-muted);text-align:right;white-space:nowrap">
            ${formatTijd(item.start_tijd)}${item.eind_tijd ? `–${formatTijd(item.eind_tijd)}` : ''}
          </td>
        </tr>`).join('');
    }
  }

  html += `</tbody></table></div>`;
  return html;
}

function datumBereikKort(start, eind) {
  const fmt = d => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const s = fmt(start);
  const e = eind ? fmt(eind) : null;
  return e && e !== s ? `${s} – ${e}` : s;
}

// ── Event bindings ─────────────────────────────────────────────────

function bindActies() {
  // Inschrijvingsfasen opslaan
  document.getElementById('inschrijving-form').addEventListener('submit', async e => {
    e.preventDefault();
    const velden = ['voorinschrijving_start', 'voorinschrijving_sluit', 'inschrijving_start', 'inschrijving_sluit'];
    const status = document.getElementById('inschrijving-status');
    status.textContent = 'Opslaan…';
    try {
      for (const veld of velden) {
        const waarde = document.getElementById(veld).value || null;
        await patch(`/admin/edities/${editieId}`, { veld, waarde });
      }
      status.textContent = '✓ Opgeslagen';
      status.style.color = 'var(--color-success)';
      await laadData();
    } catch (err) {
      status.textContent = '⚠ ' + err.message;
      status.style.color = 'var(--color-error)';
    }
  });

  document.querySelectorAll('[data-actie="bewerk-item"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(i => i.id === Number(btn.dataset.id));
      if (item) openModal(item);
    });
  });

  document.querySelectorAll('[data-actie="verwijder-item"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = items.find(i => i.id === Number(btn.dataset.id));
      if (!item || !confirm(`"${item.naam}" verwijderen?`)) return;
      try {
        await del(`/admin/programma/${item.id}`);
        await laadData();
      } catch (err) { toonBericht('error', err.message); }
    });
  });

  document.querySelectorAll('[data-actie="toggle-programma"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await put(`/admin/jury/momenten/${btn.dataset.id}/programma`);
        await laadData();
      } catch (err) { toonBericht('error', err.message); }
    });
  });
}

// ── Item modal ─────────────────────────────────────────────────────

let bewerkId = null;

function openModal(item) {
  bewerkId = item?.id ?? null;
  document.getElementById('modal-titel').textContent = item ? 'Item bewerken' : 'Nieuw programma-item';
  document.getElementById('f-naam').value         = item?.naam         ?? '';
  document.getElementById('f-omschrijving').value = item?.omschrijving ?? '';
  document.getElementById('f-start').value        = item?.start_tijd ? naarLocalDT(item.start_tijd) : '';
  document.getElementById('f-eind').value         = item?.eind_tijd  ? naarLocalDT(item.eind_tijd)  : '';

  const modal = document.getElementById('item-modal');
  modal.style.display = 'flex';
  document.getElementById('modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('item-form').onsubmit     = submitForm;
}

async function submitForm(e) {
  e.preventDefault();
  const body = {
    editie_id:    editieId,
    naam:         document.getElementById('f-naam').value,
    omschrijving: document.getElementById('f-omschrijving').value || null,
    start_tijd:   naarUTC(document.getElementById('f-start').value),
    eind_tijd:    naarUTC(document.getElementById('f-eind').value) || null,
  };
  try {
    if (bewerkId) await put(`/admin/programma/${bewerkId}`, body);
    else          await post('/admin/programma', body);
    document.getElementById('item-modal').style.display = 'none';
    await laadData();
  } catch (err) { toonBericht('error', err.message); }
}

// ── Kopieer modal ──────────────────────────────────────────────────

function openKopieerModal() {
  const andereEdities = alleEdities.filter(e => e.id !== editieId);
  const select = document.getElementById('kopieer-bron');
  select.innerHTML = '<option value="">— Selecteer editie —</option>'
    + andereEdities.map(e => {
        const datum = e.startdatum ? ` (${e.startdatum.slice(0, 10)})` : '';
        return `<option value="${e.id}">${esc(e.naam)} ${e.jaar}${datum}</option>`;
      }).join('');

  document.getElementById('kopieer-info').textContent = '';
  document.getElementById('kopieer-bevestig').disabled = true;

  select.onchange = () => {
    const bronId = Number(select.value);
    const bron   = andereEdities.find(e => e.id === bronId);
    const info   = document.getElementById('kopieer-info');
    const knop   = document.getElementById('kopieer-bevestig');

    if (!bron) { info.textContent = ''; knop.disabled = true; return; }

    const bronDatum = bron.startdatum?.slice(0, 10);
    const doelDatum = editie.startdatum?.slice(0, 10);

    if (!bronDatum || !doelDatum) {
      info.textContent = '⚠ Zorg dat beide edities een startdatum hebben voor correcte datumverschuiving.';
      info.style.color = 'var(--color-warning)';
      knop.disabled = true;
      return;
    }

    const offsetDagen = Math.round((new Date(doelDatum) - new Date(bronDatum)) / 86400000);
    const richting    = offsetDagen >= 0 ? `+${offsetDagen}` : `${offsetDagen}`;
    info.textContent  = `Datums worden verschoven met ${richting} dagen (${bronDatum} → ${doelDatum}).`;
    info.style.color  = 'var(--color-text-muted)';
    knop.disabled = false;
  };

  const modal = document.getElementById('kopieer-modal');
  modal.style.display = 'flex';
  document.getElementById('kopieer-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('kopieer-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('kopieer-bevestig').onclick = uitvoerenKopieer;
}

async function uitvoerenKopieer() {
  const bronId = Number(document.getElementById('kopieer-bron').value);
  if (!bronId) return;
  try {
    const result = await post('/admin/programma/kopieer', {
      bron_editie_id: bronId,
      doel_editie_id: editieId,
    });
    document.getElementById('kopieer-modal').style.display = 'none';
    toonBericht('success', `${result.gekopieerd} items gekopieerd.`);
    await laadData();
  } catch (err) { toonBericht('error', err.message); }
}

// ── Helpers ────────────────────────────────────────────────────────

function formatTijd(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function formatDag(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}


function toonBericht(type, msg) {
  const el = document.getElementById('prog-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${esc(msg)}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

export function onDestroy() {}
