// public/js/pages/scores.js — Scorebeheer (admin/organisator)
// ?moment_id=X   → live score-telleroverzicht per subkamp
// (geen params)  → score-invoer per categorie/subkamp

import { get, put, getActieveEditie } from '../services/api.js';
import { escapeHtml as esc } from '../utils/escape.js';
import { getAccessToken } from '../services/auth.js';
import { laadSocketScript, maakSocket } from '../services/socket.js';

// ── Gedeelde state ─────────────────────────────────────────────────

let socket = null;

function getMomentId() {
  const params = new URLSearchParams(location.search);
  return params.get('moment_id') ? Number(params.get('moment_id')) : null;
}

export async function render() {
  const momentId = getMomentId();
  if (momentId) {
    renderLiveOvrzicht(momentId);
  } else {
    renderScoreBeheer();
  }
}

export async function onMount() {
  const momentId = getMomentId();
  if (momentId) {
    await laadLiveData(momentId);
  } else {
    await laadScoreData();
  }
}

export function onDestroy() {
  socket?.disconnect();
  socket = null;
}

// ══════════════════════════════════════════════════════════════════
// MODUS A — Score-invoer (geen moment_id in URL)
// ══════════════════════════════════════════════════════════════════

let editieId  = null;
let momenten  = [];
let subkampen = [];
let printData = null;
let scoreMap  = new Map();

function renderScoreBeheer() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1><span class="material-icons">leaderboard</span> Scorebeheer</h1></div>
    </div>
    <div id="sb-bericht"></div>
    <div class="card" style="padding:14px 16px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;flex:2;min-width:180px">
          <label class="form-label">Categorie</label>
          <select id="f-cat" class="form-input">
            <option value="">— Selecteer categorie —</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:140px">
          <label class="form-label">Subkamp</label>
          <select id="f-sub" class="form-input" disabled>
            <option value="">— Selecteer subkamp —</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;flex:2;min-width:160px">
          <label class="form-label">Subcategorie</label>
          <select id="f-subcat" class="form-input" disabled>
            <option value="">— Alle subcategorieën —</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding-bottom:2px;white-space:nowrap">
          <span id="sb-status" style="font-size:0.8rem;color:var(--color-text-muted)"></span>
          <span id="sb-live-dot" style="width:8px;height:8px;border-radius:50%;background:var(--color-text-muted);display:none"></span>
          <span id="sb-live-label" style="font-size:0.8rem;color:var(--color-text-muted);display:none"></span>
        </div>
      </div>
    </div>
    <div id="sb-tabel"><p class="text-muted">Selecteer een categorie en subkamp.</p></div>
  `;
}

async function laadScoreData() {
  try {
    const editie = await get('/publiek/editie/actief');
    if (!editie) {
      document.getElementById('sb-tabel').innerHTML = '<p class="text-muted">Geen actieve editie.</p>';
      return;
    }
    editieId = editie.id;

    [momenten, subkampen] = await Promise.all([
      get(`/admin/jury/momenten?editie_id=${editieId}`),
      get(`/subkampen?editie_id=${editieId}`),
    ]);

    const catSel = document.getElementById('f-cat');
    catSel.innerHTML = '<option value="">— Selecteer categorie —</option>'
      + momenten.map(m => `<option value="${m.id}">${esc(m.categorie_naam || '—')} · ${formatDT(m.start_tijd)}</option>`).join('');

    const subSel = document.getElementById('f-sub');
    subSel.innerHTML = '<option value="">— Selecteer subkamp —</option>'
      + subkampen.map(s => `<option value="${s.id}">${esc(s.naam)}</option>`).join('');

    bindFilters();
    toepassenPrefill();
  } catch (e) { toonBericht('error', e.message); }
}

function toepassenPrefill() {
  const raw = sessionStorage.getItem('sb-prefill');
  if (!raw) return;
  sessionStorage.removeItem('sb-prefill');
  try {
    const { momentId, subkampId } = JSON.parse(raw);
    const catSel = document.getElementById('f-cat');
    const subSel = document.getElementById('f-sub');
    if (momentId) catSel.value = String(momentId);
    if (subkampId) { subSel.disabled = false; subSel.value = String(subkampId); }
    if (momentId && subkampId) tryLaad();
  } catch { /* ongeldige prefill */ }
}

function bindFilters() {
  document.getElementById('f-cat').addEventListener('change', () => {
    const ok = !!document.getElementById('f-cat').value;
    document.getElementById('f-sub').disabled = !ok;
    resetSubcatFilter();
    document.getElementById('sb-tabel').innerHTML = ok
      ? '' : '<p class="text-muted">Selecteer een categorie en subkamp.</p>';
    tryLaad();
  });
  document.getElementById('f-sub').addEventListener('change', tryLaad);
  document.getElementById('f-subcat').addEventListener('change', renderTabel);
}

function resetSubcatFilter() {
  const sel = document.getElementById('f-subcat');
  sel.disabled = true;
  sel.innerHTML = '<option value="">— Alle subcategorieën —</option>';
  printData = null;
  scoreMap  = new Map();
}

async function tryLaad() {
  const momentId  = Number(document.getElementById('f-cat').value);
  const subkampId = Number(document.getElementById('f-sub').value);
  if (!momentId || !subkampId) return;

  document.getElementById('sb-tabel').innerHTML = '<p class="text-muted">Laden…</p>';
  try {
    const [data, scoreData] = await Promise.all([
      get(`/admin/jury/momenten/${momentId}/printdata/${subkampId}`),
      get(`/admin/jury/momenten/${momentId}/scores`),
    ]);

    printData = data;
    scoreMap  = new Map();
    scoreData
      .filter(s => Number(s.subkamp_id) === subkampId)
      .forEach(s => scoreMap.set(`${s.patrouille_id}_${s.criterium_id}`, Number(s.score)));

    const subs = printData.categorie?.subcategorieen || [];
    const subcatSel = document.getElementById('f-subcat');
    subcatSel.disabled = false;
    subcatSel.innerHTML = '<option value="">— Alle subcategorieën —</option>'
      + subs.map(s => `<option value="${s.id}">${esc(s.naam)}</option>`).join('');

    renderTabel();
    verbindOrgSocket(momentId);
  } catch (e) {
    toonBericht('error', e.message);
    document.getElementById('sb-tabel').innerHTML = '';
  }
}

async function verbindOrgSocket(momentId) {
  socket?.disconnect();
  socket = null;
  setLiveStatus(null);

  try { await laadSocketScript(); } catch { return; }

  const authToken = getAccessToken();
  if (!authToken) return;

  socket = maakSocket();

  socket.on('connect', () => {
    socket.emit('org:join', { momentId, authToken });
  });
  socket.on('org:scores', () => setLiveStatus(true));
  socket.on('org:score:updated', ({ subkamp_id, patrouille_id, criterium_id, score }) => {
    const subkampId = Number(document.getElementById('f-sub').value);
    if (Number(subkamp_id) !== subkampId) return;
    const key = `${patrouille_id}_${criterium_id}`;
    scoreMap.set(key, score);
    const inp = document.querySelector(`.score-input[data-key="${key}"]`);
    if (inp && document.activeElement !== inp) inp.value = score;
  });
  socket.on('disconnect', () => setLiveStatus(false));
  socket.on('jury:error',  () => setLiveStatus(false));
}

function setLiveStatus(online) {
  const dot   = document.getElementById('sb-live-dot');
  const label = document.getElementById('sb-live-label');
  if (!dot || !label) return;
  if (online === null) {
    dot.style.display = label.style.display = 'none';
    return;
  }
  dot.style.display = label.style.display = 'inline-block';
  dot.style.background = online ? 'var(--color-success)' : 'var(--color-text-muted)';
  label.textContent    = online ? 'Live' : 'Offline';
  label.style.color    = online ? 'var(--color-success)' : 'var(--color-text-muted)';
}

function renderTabel() {
  if (!printData) return;
  const { moment, subkamp, categorie, patrouilles } = printData;
  const subs     = categorie?.subcategorieen || [];
  const subId    = Number(document.getElementById('f-subcat').value) || null;
  const toonSubs = subId ? subs.filter(s => s.id === subId) : subs;
  const modus    = moment.jureer_modus;
  const kleur    = subkamp.kleur || 'var(--color-primary)';
  const cols     = patrouilles.length + 1;

  const infoBar = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px;
      padding:10px 14px;background:var(--color-surface);border-radius:var(--radius-md);
      border-left:4px solid ${esc(kleur)};flex-wrap:wrap">
      <span style="font-weight:700">${esc(subkamp.naam)}</span>
      <span class="text-muted" style="font-size:0.85rem">${esc(categorie?.naam || '—')}</span>
      <span class="text-muted" style="font-size:0.85rem">${modus === 'binair' ? 'Binair' : 'Numeriek'}</span>
      <span class="text-muted" style="font-size:0.85rem">${formatDT(moment.start_tijd)} – ${formatDT(moment.eind_tijd)}</span>
    </div>`;

  const patHdrs = patrouilles.map(p => {
    const label = (p.jongste ? '★' : '') + (p.nummer ?? '?');
    const bg    = p.jongste ? 'background:var(--color-warning-bg,#fef9ec);color:#92400e;' : '';
    return `<th style="text-align:center;padding:6px 4px;font-size:0.78rem;white-space:nowrap;min-width:52px;${bg}">${esc(String(label))}</th>`;
  }).join('');

  let rowIdx = 0;
  const rijen = toonSubs.flatMap(sub => {
    const criteria = sub.criteria || [];
    if (!criteria.length) return [];

    const groepRij = `<tr>
      <td colspan="${cols}" style="padding:6px 10px;font-weight:700;font-size:0.82rem;
        background:var(--color-surface-alt);color:var(--color-primary);
        border-top:2px solid var(--color-border);border-bottom:1px solid var(--color-border);
        letter-spacing:0.02em">
        ${esc(sub.naam)}
      </td>
    </tr>`;

    const criteriaRijen = criteria.map((cr, idx) => {
      const bg = idx % 2 === 1 ? 'background:var(--color-surface);' : '';
      const currentRow = rowIdx++;
      const scoreCols = patrouilles.map((p, colIdx) => {
        const val = scoreMap.get(`${p.id}_${cr.id}`) ?? null;
        return `<td style="padding:3px 2px;text-align:center;${bg}">${scoreWidget(cr, p.id, val, colIdx, currentRow)}</td>`;
      }).join('');
      return `<tr>
        <td style="padding:5px 10px;border-right:1px solid var(--color-border);${bg}min-width:160px;max-width:260px">
          <div style="font-size:0.84rem;font-weight:600">${esc(cr.naam)}</div>
          ${cr.omschrijving ? `<div style="font-size:0.73rem;color:var(--color-text-muted)">${esc(cr.omschrijving)}</div>` : ''}
        </td>
        ${scoreCols}
      </tr>`;
    });

    return [groepRij, ...criteriaRijen];
  });

  if (!rijen.length) {
    document.getElementById('sb-tabel').innerHTML = infoBar + '<p class="text-muted">Geen criteria gevonden.</p>';
    return;
  }

  document.getElementById('sb-tabel').innerHTML = infoBar + `
    <div class="card" style="overflow-x:auto;padding:0">
      <table class="data-table" style="min-width:max-content">
        <thead>
          <tr style="position:sticky;top:0;z-index:2">
            <th style="border-right:1px solid var(--color-border)">Criterium</th>
            ${patHdrs}
          </tr>
        </thead>
        <tbody>${rijen.join('')}</tbody>
      </table>
    </div>`;

  bindInputs();
}

function scoreWidget(cr, patId, val, colIdx, rowIdx) {
  const max = cr.max_score != null ? Number(cr.max_score) : null;
  const key = `${patId}_${cr.id}`;
  return `<input type="number" class="score-input form-input" data-key="${key}"
    data-col="${colIdx}" data-row="${rowIdx}"
    min="0" max="${max ?? ''}" value="${val ?? ''}"
    style="width:52px;padding:3px 4px;text-align:center;font-size:0.85rem">`;
}

function bindInputs() {
  const momentId  = Number(document.getElementById('f-cat').value);
  const subkampId = Number(document.getElementById('f-sub').value);

  const grid = [];
  document.getElementById('sb-tabel').querySelectorAll('.score-input').forEach(inp => {
    const col = Number(inp.dataset.col);
    const row = Number(inp.dataset.row);
    if (!grid[col]) grid[col] = [];
    grid[col][row] = inp;
  });
  const maxCol = grid.length - 1;
  const maxRow = grid[0] ? grid[0].length - 1 : 0;

  document.getElementById('sb-tabel').querySelectorAll('.score-input').forEach(inp => {
    inp.addEventListener('input', () => {
      if (inp.value === '' || inp.max === '') return;
      if (Number(inp.value) > Number(inp.max)) inp.value = inp.max;
    });
    inp.addEventListener('change', () => {
      if (inp.value === '') return;
      const val = Number(inp.value);
      scoreMap.set(inp.dataset.key, val);
      const [patId, crId] = inp.dataset.key.split('_').map(Number);
      slaOp(momentId, subkampId, patId, crId, val);
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (inp.value !== '') {
        const val = Number(inp.value);
        scoreMap.set(inp.dataset.key, val);
        const [patId, crId] = inp.dataset.key.split('_').map(Number);
        slaOp(momentId, subkampId, patId, crId, val);
      }
      const col = Number(inp.dataset.col);
      const row = Number(inp.dataset.row);
      const volgend = row < maxRow ? grid[col]?.[row + 1] : col < maxCol ? grid[col + 1]?.[0] : null;
      if (volgend) { volgend.focus(); volgend.select(); }
    });
  });
}

async function slaOp(momentId, subkampId, patrouilleId, criteriumId, score) {
  setStatus('saving');
  try {
    await put(`/admin/jury/momenten/${momentId}/scores`, {
      subkamp_id: subkampId, patrouille_id: patrouilleId, criterium_id: criteriumId, score,
    });
    setStatus('saved');
  } catch { setStatus('error'); }
}

function setStatus(s) {
  const el = document.getElementById('sb-status');
  if (!el) return;
  if (s === 'saving') { el.textContent = 'Opslaan…'; el.style.color = 'var(--color-text-muted)'; }
  else if (s === 'saved') { el.textContent = '✓ Opgeslagen'; el.style.color = 'var(--color-success)'; }
  else { el.textContent = '⚠ Opslaan mislukt'; el.style.color = 'var(--color-error)'; }
}

// ══════════════════════════════════════════════════════════════════
// MODUS B — Live telleroverzicht per subkamp (?moment_id=X)
// ══════════════════════════════════════════════════════════════════

function renderLiveOvrzicht(momentId) {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1><span class="material-icons">leaderboard</span> Live scores</h1>
      <a href="/organisator/jury" class="btn btn-outline"><span class="material-icons">arrow_back</span> Terug naar jury</a>
    </div>
    <div id="scores-content"><p class="text-muted">Laden…</p></div>
  `;
}

async function laadLiveData(momentId) {
  try {
    await getActieveEditie();

    const [scores, tokens] = await Promise.all([
      get(`/admin/jury/momenten/${momentId}/scores`),
      get(`/admin/jury/momenten/${momentId}/tokens`).catch(() => ({ tokens: [] })),
    ]);

    bouwLiveTabel(momentId, scores, tokens.tokens || []);
    verbindLiveSocket(momentId);
  } catch (e) {
    document.getElementById('scores-content').innerHTML =
      `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

function bouwLiveTabel(momentId, scores, tokens) {
  const subkampen = tokens.map(t => ({ id: t.subkamp_id, naam: t.subkamp_naam, kleur: t.kleur }));

  if (!subkampen.length) {
    document.getElementById('scores-content').innerHTML =
      '<p class="text-muted">Geen subkampen gevonden. Genereer eerst QR-codes.</p>';
    return;
  }

  const aantalPerSub = {};
  subkampen.forEach(s => {
    aantalPerSub[s.id] = scores.filter(sc => sc.subkamp_id === s.id).length;
  });

  document.getElementById('scores-content').innerHTML = `
    <div class="card">
      <div class="card-body" style="padding:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div id="live-dot" style="width:10px;height:10px;border-radius:50%;background:var(--color-text-muted)"></div>
          <span style="font-size:0.85rem;color:var(--color-text-muted)">Live verbinding</span>
        </div>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead><tr>
              <th>Subkamp</th>
              <th>Ingevulde scores</th>
              <th>Status</th>
            </tr></thead>
            <tbody>
              ${subkampen.map(s => `
                <tr id="sub-rij-${s.id}">
                  <td>
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                      background:${esc(s.kleur||'#888')};margin-right:8px"></span>
                    ${esc(s.naam)}
                  </td>
                  <td id="sub-score-count-${s.id}">${aantalPerSub[s.id] || 0}</td>
                  <td><span class="badge">Actief</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function verbindLiveSocket(momentId) {
  socket?.disconnect();
  socket = null;

  try { await laadSocketScript(); } catch { return; }

  const authToken = getAccessToken();
  if (!authToken) return;

  socket = maakSocket();

  socket.on('connect', () => {
    const dot = document.getElementById('live-dot');
    if (dot) dot.style.background = 'var(--color-success)';
    socket.emit('org:join', { momentId: Number(momentId), authToken });
  });
  socket.on('disconnect', () => {
    const dot = document.getElementById('live-dot');
    if (dot) dot.style.background = 'var(--color-error)';
  });
  socket.on('org:score:updated', ({ subkamp_id }) => {
    const el = document.getElementById(`sub-score-count-${subkamp_id}`);
    if (el) el.textContent = Number(el.textContent) + 1;
  });
}

// ── Gedeelde helpers ───────────────────────────────────────────────

function formatDT(dt) {
  return new Date(dt).toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toonBericht(type, msg) {
  const el = document.getElementById('sb-bericht');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${esc(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}
