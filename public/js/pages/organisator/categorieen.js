// pages/organisator/categorieen.js — Per-editie categorieënbeheer

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml } from '../../utils/escape.js';

const BASE = '/admin/editie-categorieen';

let edities       = [];
let actieveEditie = null;
let categorieen   = []; // flat list met jurering_gestart
let uitgebreid    = {}; // { catId: true } — welke categorieën zijn uitgevouwen

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1>Categorieën</h1>
    </div>
    <div id="cat-berichten"></div>
    <div id="cat-editie-balk" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <label class="form-label" style="margin:0;">Editie:</label>
      <select id="cat-editie-sel" class="form-input" style="max-width:260px;">
        <option>Laden…</option>
      </select>
      <button class="btn btn-ghost" id="btn-importeer-editie" title="Kopieer categorieën van een andere editie">&#128229; Kopieer van vorige editie</button>
      <button class="btn btn-primary" id="btn-nieuwe-cat">+ Nieuwe categorie</button>
    </div>
    <div id="cat-weging-balk" style="display:none;margin-bottom:12px;">
      <span id="cat-weging-totaal" style="font-size:0.9rem;"></span>
    </div>
    <div id="cat-content"><p class="text-muted">Selecteer een editie…</p></div>

    <!-- Modal categorie -->
    <div id="cat-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 id="cat-modal-titel">Categorie</h2>
          <button type="button" id="cat-modal-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer">&#10005;</button>
        </div>
        <form id="cat-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Naam *</label>
              <input type="text" id="cat-f-naam" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Omschrijving</label>
              <textarea id="cat-f-omschrijving" class="form-input" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="cat-modal-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal subcategorie -->
    <div id="sub-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 id="sub-modal-titel">Subcategorie</h2>
          <button type="button" id="sub-modal-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer">&#10005;</button>
        </div>
        <form id="sub-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Naam *</label>
              <input type="text" id="sub-f-naam" class="form-input" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="sub-modal-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal criterium -->
    <div id="crit-modal" class="modal-backdrop" style="display:none">
      <div class="modal" style="max-width:560px;width:100%;">
        <div class="modal-header">
          <h2 id="crit-modal-titel">Criterium</h2>
          <button type="button" id="crit-modal-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer">&#10005;</button>
        </div>
        <form id="crit-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto;">
            <div class="form-group">
              <label class="form-label">Naam *</label>
              <input type="text" id="crit-f-naam" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Omschrijving</label>
              <textarea id="crit-f-omschrijving" class="form-input" rows="2"></textarea>
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <div class="form-group" style="flex:1;min-width:140px;">
                <label class="form-label">Invoertype</label>
                <select id="crit-f-invoer-type" class="form-input">
                  <option value="getal">Getal</option>
                  <option value="tijdmeting">Tijdmeting (MM:SS)</option>
                  <option value="checkbox">Checkbox (ja/nee)</option>
                  <option value="tekst">Vrije tekst</option>
                </select>
              </div>
              <div class="form-group" style="flex:1;min-width:100px;">
                <label class="form-label">Max. score</label>
                <input type="number" id="crit-f-max" class="form-input" min="0" max="100000" step="any" value="10">
              </div>
              <div class="form-group" style="flex:1;min-width:100px;">
                <label class="form-label">Min. score</label>
                <input type="number" id="crit-f-min" class="form-input" min="0" max="100000" step="any" value="0">
              </div>
            </div>

            <div id="crit-lager-groep" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="crit-f-lager" style="width:auto;margin:0;">
              <label for="crit-f-lager" class="form-label" style="margin:0;">Lager is beter (bijv. kortste tijd wint)</label>
            </div>

            <div class="form-group">
              <label class="form-label">Scoreringsmethode</label>
              <select id="crit-f-methode" class="form-input">
                <option value="direct">Direct (genormaliseerd op min–max)</option>
                <option value="drempelwaarden">Drempelwaarden (bereiken → vaste punten)</option>
                <option value="groepen">Groepen (relatieve rangschikking)</option>
                <option value="normalisatie">Normalisatie (vaste invoer min/max)</option>
              </select>
            </div>

            <!-- Drempelwaarden config -->
            <div id="crit-cfg-drempel" style="display:none;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px;">
              <label class="form-label" style="margin-bottom:6px;">Bereiken (van – tot → punten)</label>
              <table class="data-table" style="font-size:0.82rem;margin-bottom:6px;">
                <thead><tr><th>Van</th><th>Tot</th><th>Punten</th><th></th></tr></thead>
                <tbody id="crit-drempel-rijen"></tbody>
              </table>
              <button type="button" class="btn btn-sm btn-outline" id="btn-drempel-add">+ Bereik toevoegen</button>
            </div>

            <!-- Groepen config -->
            <div id="crit-cfg-groepen" style="display:none;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px;">
              <div class="form-group">
                <label class="form-label">Aantal groepen</label>
                <input type="number" id="crit-f-groepen-n" class="form-input" min="2" max="20" value="4" style="max-width:100px;">
              </div>
              <label class="form-label" style="margin-bottom:4px;">Punten per groep (laagste → hoogste)</label>
              <div id="crit-groepen-punten"></div>
            </div>

            <!-- Normalisatie config -->
            <div id="crit-cfg-normalisatie" style="display:none;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px;">
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Laagste invoerwaarde</label>
                  <input type="number" id="crit-f-norm-min" class="form-input" step="any" value="0">
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Hoogste invoerwaarde</label>
                  <input type="number" id="crit-f-norm-max" class="form-input" step="any" value="100">
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="crit-modal-annuleer">Annuleren</button>
            <button type="submit" class="btn btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>
  `;

  await laadEdities();
  bindTopKnoppen();
}

// ── Edities laden ──────────────────────────────────────────────────

async function laadEdities() {
  try {
    edities = await get('/admin/edities');
    const sel = document.getElementById('cat-editie-sel');
    sel.innerHTML = '<option value="">— kies editie —</option>' +
      edities.map(e => `<option value="${e.id}">${escapeHtml(e.naam)}${e.actief ? ' (actief)' : ''}</option>`).join('');

    // Auto-select actieve editie
    const actief = edities.find(e => e.actief);
    if (actief) {
      sel.value = actief.id;
      actieveEditie = actief;
      await laadCategorieen();
    }

    sel.addEventListener('change', async () => {
      actieveEditie = edities.find(e => String(e.id) === sel.value) || null;
      uitgebreid = {};
      await laadCategorieen();
    });
  } catch (e) { toonBericht('error', e.message); }
}

async function laadCategorieen() {
  if (!actieveEditie) {
    document.getElementById('cat-content').innerHTML = '<p class="text-muted">Geen editie geselecteerd.</p>';
    document.getElementById('cat-weging-balk').style.display = 'none';
    return;
  }
  try {
    // Laad flat list (met jurering_gestart) én geneste structuur parallel
    const [flat, genest] = await Promise.all([
      get(`${BASE}?editie_id=${actieveEditie.id}`),
      get(`${BASE}/details?editie_id=${actieveEditie.id}`),
    ]);
    categorieen = flat;
    renderCategorieen(genest);
  } catch (e) { toonBericht('error', e.message); }
}

// ── Render ─────────────────────────────────────────────────────────

function renderCategorieen(genest) {
  const el = document.getElementById('cat-content');
  const wegingBalk = document.getElementById('cat-weging-balk');

  if (!genest.length) {
    el.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px;">
      Nog geen categorieën. Klik op "+ Nieuwe categorie" om te beginnen,
      of gebruik "Kopieer van vorige editie".
    </p></div>`;
    wegingBalk.style.display = 'none';
    return;
  }

  const totaal = categorieen.reduce((s, c) => s + Number(c.wegingspercentage), 0);
  const totaalKleur = totaal > 100.01 ? 'var(--color-error)' : totaal >= 99.99 ? 'var(--color-success)' : 'var(--color-warning)';
  document.getElementById('cat-weging-totaal').innerHTML =
    `Totaal wegingspercentage: <strong style="color:${totaalKleur}">${totaal.toFixed(1)}%</strong> / 100%`;
  wegingBalk.style.display = 'block';

  el.innerHTML = genest.map(cat => renderCatKaart(cat)).join('');
  bindCatActies();
}

function renderCatKaart(cat) {
  const flat = categorieen.find(c => c.id === cat.id) || cat;
  const gestart = flat.jurering_gestart;
  const open = uitgebreid[cat.id];
  const andereWeging = categorieen.filter(c => c.id !== cat.id).reduce((s, c) => s + Number(c.wegingspercentage), 0);
  const maxSlider = Math.max(0, 100 - andereWeging);
  const maxScore = (cat.subcategorieen || [])
    .flatMap(s => s.criteria || [])
    .reduce((s, cr) => s + Number(cr.max_score), 0);

  return `
    <div class="card" style="margin-bottom:12px;" data-cat-id="${cat.id}">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;" class="cat-header-row">
        <span style="font-size:1rem;">${open ? '&#9660;' : '&#9654;'}</span>
        <strong style="flex:1;">${escapeHtml(cat.naam)}</strong>
        ${gestart ? '<span class="badge badge-warning" title="Jurering gestart — verwijderen geblokkeerd">JURERING GESTART</span>' : ''}
        <span class="text-muted" style="font-size:0.82rem;">${flat.subcategorie_count ?? 0} subcategorieën &middot; ${flat.criterium_count ?? 0} criteria</span>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-outline" data-actie="bewerk-cat">Bewerk</button>
          ${!gestart ? `<button class="btn btn-sm btn-danger" data-actie="verwijder-cat">Verwijder</button>` : ''}
        </div>
      </div>

      <div style="padding:8px 16px 10px;border-top:1px solid var(--color-border);" onclick="event.stopPropagation()">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="text-muted" style="font-size:0.82rem;min-width:120px;">
            Weging: <strong id="weging-val-${cat.id}">${Number(cat.wegingspercentage).toFixed(1)}%</strong>
            &nbsp;&middot;&nbsp; max score: <strong>${maxScore}</strong>
          </span>
          <input type="range" id="weging-slider-${cat.id}" min="0" max="${maxSlider.toFixed(1)}" step="0.5"
            value="${Number(cat.wegingspercentage).toFixed(1)}"
            style="flex:1;min-width:120px;" data-cat-id="${cat.id}">
          <input type="number" id="weging-num-${cat.id}" min="0" max="${maxSlider.toFixed(1)}" step="0.5"
            value="${Number(cat.wegingspercentage).toFixed(1)}"
            class="form-input" style="width:76px;" data-cat-id="${cat.id}">
          <button class="btn btn-sm btn-outline" data-actie="sla-weging" data-cat-id="${cat.id}">Opslaan</button>
        </div>
      </div>

      ${open ? `
        <div style="padding:0 16px 12px;border-top:1px solid var(--color-border);">
          ${cat.omschrijving ? `<p class="text-muted" style="font-size:0.85rem;margin:8px 0;">${escapeHtml(cat.omschrijving)}</p>` : ''}
          <div style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:0.9rem;">Subcategorieën</strong>
              <button class="btn btn-sm btn-outline" data-actie="nieuw-sub" data-cat-id="${cat.id}">+ Subcategorie</button>
            </div>
            ${(cat.subcategorieen || []).map(sub => renderSubKaart(sub, gestart)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSubKaart(sub, catGestart) {
  return `
    <div class="card" style="margin-bottom:8px;background:var(--color-surface-alt);" data-sub-id="${sub.id}">
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;">
        <span style="flex:1;font-weight:500;">${escapeHtml(sub.naam)}</span>
        <span class="text-muted" style="font-size:0.8rem;">${(sub.criteria || []).length} criteria</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" data-actie="bewerk-sub" data-sub-id="${sub.id}">Bewerk</button>
          ${!catGestart ? `<button class="btn btn-sm btn-danger" data-actie="verwijder-sub" data-sub-id="${sub.id}">Verwijder</button>` : ''}
          <button class="btn btn-sm btn-outline" data-actie="nieuw-crit" data-sub-id="${sub.id}">+ Criterium</button>
        </div>
      </div>
      ${(sub.criteria || []).length ? `
        <div style="padding:0 12px 8px;">
          <table class="data-table" style="font-size:0.82rem;">
            <thead><tr><th>Criterium</th><th>Type / Methode</th><th>Max</th><th></th></tr></thead>
            <tbody>
              ${(sub.criteria || []).map(cr => renderCritRij(cr, catGestart)).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

const INVOER_TYPE_LABELS = { getal: 'Getal', tijdmeting: 'Tijd', checkbox: 'Checkbox', tekst: 'Tekst' };
const METHODE_LABELS = { direct: null, drempelwaarden: 'Drempels', groepen: 'Groepen', normalisatie: 'Norm.' };

function renderCritRij(cr, catGestart) {
  const typeTekst = INVOER_TYPE_LABELS[cr.invoer_type] || 'Getal';
  const methodeTekst = METHODE_LABELS[cr.scorerings_methode];
  const lagerBadge = cr.lager_is_beter ? ' <span title="Lager is beter" style="opacity:.7;">&#8595;</span>' : '';
  return `
    <tr data-crit-id="${cr.id}">
      <td>${escapeHtml(cr.naam)}${lagerBadge}</td>
      <td>
        <span class="badge badge-info" style="font-size:0.72rem;">${typeTekst}</span>
        ${methodeTekst ? `<span class="badge badge-warning" style="font-size:0.72rem;">${methodeTekst}</span>` : ''}
      </td>
      <td>${cr.max_score}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm btn-outline" data-actie="bewerk-crit" data-crit-id="${cr.id}">Bewerk</button>
          ${!catGestart ? `<button class="btn btn-sm btn-danger" data-actie="verwijder-crit" data-crit-id="${cr.id}">Verwijder</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

// ── Event binding ──────────────────────────────────────────────────

function bindTopKnoppen() {
  document.getElementById('btn-nieuwe-cat').addEventListener('click', () => {
    if (!actieveEditie) { toonBericht('error', 'Selecteer eerst een editie'); return; }
    openCatModal(null);
  });

  document.getElementById('btn-importeer-editie').addEventListener('click', async () => {
    if (!actieveEditie) { toonBericht('error', 'Selecteer eerst een editie'); return; }
    const vorige = edities.filter(e => e.id < actieveEditie.id).sort((a, b) => b.id - a.id)[0];
    if (!vorige) { toonBericht('error', 'Geen eerdere editie gevonden om van te kopiëren.'); return; }
    if (!confirm(`Categorieën kopiëren van "${vorige.naam}" naar "${actieveEditie.naam}"?\nDit werkt alleen als de huidige editie nog geen categorieën heeft.`)) return;
    try {
      const r = await post(`${BASE}/importeer/editie`, { bron_editie_id: vorige.id, doel_editie_id: actieveEditie.id });
      toonBericht('success', r.overgeslagen ? r.reden : `${r.geimporteerd} categorieën gekopieerd van "${vorige.naam}".`);
      await laadCategorieen();
    } catch (e) { toonBericht('error', e.message); }
  });
}

function bindCatActies() {
  const el = document.getElementById('cat-content');

  // Toggle uitvouwen via header-rij klik
  el.querySelectorAll('.cat-header-row').forEach(row => {
    row.addEventListener('click', () => {
      const catId = Number(row.closest('[data-cat-id]').dataset.catId);
      uitgebreid[catId] = !uitgebreid[catId];
      // Herlaad zonder API-call — gebruik cached data
      laadCategorieen();
    });
  });

  el.querySelectorAll('[data-actie]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const actie = btn.dataset.actie;

      if (actie === 'bewerk-cat') {
        const catId = Number(btn.closest('[data-cat-id]').dataset.catId);
        const genest = await get(`${BASE}/details?editie_id=${actieveEditie.id}`);
        const cat = genest.find(c => c.id === catId);
        if (cat) openCatModal(cat);
        return;
      }

      if (actie === 'verwijder-cat') {
        const catId = Number(btn.closest('[data-cat-id]').dataset.catId);
        const cat = categorieen.find(c => c.id === catId);
        if (!confirm(`Categorie "${cat?.naam}" verwijderen? Alle subcategorieën en criteria worden ook verwijderd.`)) return;
        try {
          await del(`${BASE}/${catId}`);
          uitgebreid[catId] = false;
          await laadCategorieen();
        } catch (e) { toonBericht('error', e.message); }
        return;
      }

      if (actie === 'sla-weging') {
        const catId = Number(btn.dataset.catId);
        const val = Number(document.getElementById(`weging-num-${catId}`).value);
        const items = categorieen.map(c => ({ id: c.id, wegingspercentage: c.id === catId ? val : Number(c.wegingspercentage) }));
        try {
          await put(`${BASE}/wegingen/batch`, { items });
          await laadCategorieen();
        } catch (e) { toonBericht('error', e.message); }
        return;
      }

      if (actie === 'nieuw-sub') {
        const catId = Number(btn.dataset.catId);
        openSubModal(null, catId);
        return;
      }

      if (actie === 'bewerk-sub') {
        const subId = Number(btn.dataset.subId);
        const genest2 = await get(`${BASE}/details?editie_id=${actieveEditie.id}`);
        let gevondenSub = null;
        for (const cat of genest2) {
          gevondenSub = (cat.subcategorieen || []).find(s => s.id === subId);
          if (gevondenSub) break;
        }
        if (gevondenSub) openSubModal(gevondenSub, gevondenSub.categorie_id);
        return;
      }

      if (actie === 'verwijder-sub') {
        const subId = Number(btn.dataset.subId);
        if (!confirm('Subcategorie verwijderen? Alle criteria worden ook verwijderd.')) return;
        try {
          await del(`${BASE}/subcategorieen/${subId}`);
          await laadCategorieen();
        } catch (e) { toonBericht('error', e.message); }
        return;
      }

      if (actie === 'nieuw-crit') {
        const subId = Number(btn.dataset.subId);
        openCritModal(null, subId);
        return;
      }

      if (actie === 'bewerk-crit') {
        const critId = Number(btn.dataset.critId);
        // Haal criterium data uit de geneste structuur
        const genest = await get(`${BASE}/details?editie_id=${actieveEditie.id}`);
        let crit = null;
        for (const cat of genest) {
          for (const sub of cat.subcategorieen || []) {
            crit = (sub.criteria || []).find(c => c.id === critId);
            if (crit) break;
          }
          if (crit) break;
        }
        if (crit) openCritModal(crit, crit.subcategorie_id);
        return;
      }

      if (actie === 'verwijder-crit') {
        const critId = Number(btn.dataset.critId);
        if (!confirm('Criterium verwijderen?')) return;
        try {
          await del(`${BASE}/criteria/${critId}`);
          await laadCategorieen();
        } catch (e) { toonBericht('error', e.message); }
        return;
      }
    });
  });

  // Weging slider sync
  el.querySelectorAll('input[type="range"][data-cat-id]').forEach(slider => {
    slider.addEventListener('input', () => {
      const catId = slider.dataset.catId;
      document.getElementById(`weging-val-${catId}`).textContent = Number(slider.value).toFixed(1) + '%';
      document.getElementById(`weging-num-${catId}`).value = slider.value;
    });
  });

  el.querySelectorAll('input[type="number"][data-cat-id]').forEach(inp => {
    inp.addEventListener('input', () => {
      const catId = inp.dataset.catId;
      const max = Number(inp.max);
      let val = Math.min(max, Math.max(0, Number(inp.value) || 0));
      document.getElementById(`weging-slider-${catId}`).value = val;
      document.getElementById(`weging-val-${catId}`).textContent = val.toFixed(1) + '%';
    });
  });
}

// ── Modals ─────────────────────────────────────────────────────────

let bewerkCatId = null;

function openCatModal(cat) {
  bewerkCatId = cat?.id ?? null;
  document.getElementById('cat-modal-titel').textContent = cat ? 'Categorie bewerken' : 'Nieuwe categorie';
  document.getElementById('cat-f-naam').value = cat?.naam || '';
  document.getElementById('cat-f-omschrijving').value = cat?.omschrijving || '';

  const modal = document.getElementById('cat-modal');
  modal.style.display = 'flex';
  document.getElementById('cat-modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('cat-modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('cat-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      editie_id:   actieveEditie.id,
      naam:        document.getElementById('cat-f-naam').value.trim(),
      omschrijving: document.getElementById('cat-f-omschrijving').value.trim(),
      volgorde:    categorieen.length,
    };
    try {
      if (bewerkCatId) {
        await put(`${BASE}/${bewerkCatId}`, body);
      } else {
        const r = await post(BASE, body);
        uitgebreid[r.id] = true;
      }
      modal.style.display = 'none';
      await laadCategorieen();
    } catch (err) { toonBericht('error', err.message); }
  };
}

let bewerkSubId = null;
let subCatId = null;

function openSubModal(sub, catId) {
  bewerkSubId = sub?.id ?? null;
  subCatId = catId ?? sub?.categorie_id ?? null;
  document.getElementById('sub-modal-titel').textContent = sub?.id ? 'Subcategorie bewerken' : 'Nieuwe subcategorie';
  document.getElementById('sub-f-naam').value = sub?.naam || '';

  const modal = document.getElementById('sub-modal');
  modal.style.display = 'flex';
  document.getElementById('sub-modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('sub-modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('sub-form').onsubmit = async (e) => {
    e.preventDefault();
    const naam = document.getElementById('sub-f-naam').value.trim();
    try {
      if (bewerkSubId) {
        await put(`${BASE}/subcategorieen/${bewerkSubId}`, { naam, volgorde: 0 });
      } else {
        await post(`${BASE}/${subCatId}/subcategorieen`, { naam, volgorde: 0 });
      }
      modal.style.display = 'none';
      await laadCategorieen();
    } catch (err) { toonBericht('error', err.message); }
  };
}

let bewerkCritId = null;
let critSubId = null;

function openCritModal(crit, subId) {
  bewerkCritId = crit?.id ?? null;
  critSubId = subId;
  document.getElementById('crit-modal-titel').textContent = crit?.id ? 'Criterium bewerken' : 'Nieuw criterium';
  document.getElementById('crit-f-naam').value = crit?.naam || '';
  document.getElementById('crit-f-omschrijving').value = crit?.omschrijving || '';
  document.getElementById('crit-f-max').value = crit?.max_score ?? 10;
  document.getElementById('crit-f-min').value = crit?.min_score ?? 0;

  const invoerType = crit?.invoer_type || 'getal';
  const methode    = crit?.scorerings_methode || 'direct';
  const config     = typeof crit?.scorerings_config === 'string'
    ? JSON.parse(crit.scorerings_config || '{}')
    : (crit?.scorerings_config || {});

  document.getElementById('crit-f-invoer-type').value = invoerType;
  document.getElementById('crit-f-lager').checked     = !!crit?.lager_is_beter;
  document.getElementById('crit-f-methode').value     = methode;

  toggleLagerIsBeter(invoerType);
  toggleCritConfigSectie(methode);
  populateCritConfig(methode, config);

  document.getElementById('crit-f-invoer-type').onchange = (e) => toggleLagerIsBeter(e.target.value);
  document.getElementById('crit-f-methode').onchange     = (e) => {
    toggleCritConfigSectie(e.target.value);
    populateCritConfig(e.target.value, {});
  };
  document.getElementById('btn-drempel-add').onclick   = () => {
    document.getElementById('crit-drempel-rijen').insertAdjacentHTML('beforeend', renderDrempelRij());
    bindDrempelVerwijder();
  };
  document.getElementById('crit-f-groepen-n').oninput  = () => {
    renderGroepenPunten(Number(document.getElementById('crit-f-groepen-n').value), null);
  };

  const modal = document.getElementById('crit-modal');
  modal.style.display = 'flex';
  document.getElementById('crit-modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('crit-modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('crit-form').onsubmit = async (e) => {
    e.preventDefault();
    const methodeVal = document.getElementById('crit-f-methode').value;
    const body = {
      naam:               document.getElementById('crit-f-naam').value.trim(),
      omschrijving:       document.getElementById('crit-f-omschrijving').value.trim() || null,
      invoer_type:        document.getElementById('crit-f-invoer-type').value,
      max_score:          Number(document.getElementById('crit-f-max').value),
      min_score:          Number(document.getElementById('crit-f-min').value),
      lager_is_beter:     document.getElementById('crit-f-lager').checked,
      scorerings_methode: methodeVal,
      scorerings_config:  bouwScoreConfig(methodeVal),
      volgorde:           0,
    };
    try {
      if (bewerkCritId) {
        await put(`${BASE}/criteria/${bewerkCritId}`, body);
      } else {
        await post(`${BASE}/subcategorieen/${critSubId}/criteria`, body);
      }
      modal.style.display = 'none';
      await laadCategorieen();
    } catch (err) { toonBericht('error', err.message); }
  };
}

// ── Scoring config helpers ──────────────────────────────────────────

function toggleCritConfigSectie(methode) {
  const map = { drempelwaarden: 'drempel', groepen: 'groepen', normalisatie: 'normalisatie' };
  ['drempel', 'groepen', 'normalisatie'].forEach(k => {
    document.getElementById(`crit-cfg-${k}`).style.display = map[methode] === k ? '' : 'none';
  });
}

function toggleLagerIsBeter(invoerType) {
  const show = invoerType === 'getal' || invoerType === 'tijdmeting';
  document.getElementById('crit-lager-groep').style.display = show ? 'flex' : 'none';
}

function populateCritConfig(methode, config) {
  if (methode === 'drempelwaarden') {
    const bereiken = config.bereiken?.length ? config.bereiken : [{ van: 0, tot: 10, punten: 1 }];
    document.getElementById('crit-drempel-rijen').innerHTML = bereiken.map(b => renderDrempelRij(b.van, b.tot, b.punten)).join('');
    bindDrempelVerwijder();
  } else if (methode === 'groepen') {
    const n = config.aantal_groepen || 4;
    document.getElementById('crit-f-groepen-n').value = n;
    renderGroepenPunten(n, config.punten_per_groep);
  } else if (methode === 'normalisatie') {
    document.getElementById('crit-f-norm-min').value = config.invoer_min ?? 0;
    document.getElementById('crit-f-norm-max').value = config.invoer_max ?? 100;
  }
}

function renderDrempelRij(van = 0, tot = 10, punten = 1) {
  return `<tr>
    <td><input type="number" class="form-input drempel-van" value="${van}" style="width:70px;" step="any"></td>
    <td><input type="number" class="form-input drempel-tot" value="${tot}" style="width:70px;" step="any"></td>
    <td><input type="number" class="form-input drempel-punten" value="${punten}" style="width:60px;" step="any"></td>
    <td><button type="button" class="btn btn-sm btn-danger drempel-verwijder">&#10005;</button></td>
  </tr>`;
}

function bindDrempelVerwijder() {
  document.querySelectorAll('.drempel-verwijder').forEach(btn => {
    btn.onclick = () => btn.closest('tr').remove();
  });
}

function renderGroepenPunten(n, puntenPerGroep) {
  let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">';
  for (let i = 0; i < n; i++) {
    const punten = puntenPerGroep?.[i] ?? (i + 1);
    html += `<div class="form-group" style="flex:0 0 auto;">
      <label class="form-label" style="font-size:0.78rem;">Groep ${i + 1}</label>
      <input type="number" class="form-input groep-punten" data-groep="${i}" value="${punten}" style="width:70px;" min="0" step="any">
    </div>`;
  }
  html += '</div>';
  document.getElementById('crit-groepen-punten').innerHTML = html;
}

function bouwScoreConfig(methode) {
  if (methode === 'drempelwaarden') {
    const bereiken = [];
    document.querySelectorAll('#crit-drempel-rijen tr').forEach(tr => {
      bereiken.push({
        van:    Number(tr.querySelector('.drempel-van').value),
        tot:    Number(tr.querySelector('.drempel-tot').value),
        punten: Number(tr.querySelector('.drempel-punten').value),
      });
    });
    return { bereiken };
  }
  if (methode === 'groepen') {
    const n = Number(document.getElementById('crit-f-groepen-n').value);
    const punten_per_groep = [...document.querySelectorAll('.groep-punten')].map(inp => Number(inp.value));
    return { aantal_groepen: n, punten_per_groep };
  }
  if (methode === 'normalisatie') {
    return {
      invoer_min: Number(document.getElementById('crit-f-norm-min').value),
      invoer_max: Number(document.getElementById('crit-f-norm-max').value),
    };
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────

function toonBericht(type, msg) {
  const el = document.getElementById('cat-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

export function onDestroy() {}
