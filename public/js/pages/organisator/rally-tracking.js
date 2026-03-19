// pages/organisator/rally-tracking.js — Live tracking dashboard: welke patrouilles zijn waar geweest

import { get, post } from '../../services/api.js';

let data       = null; // { stations, patrouilles, bezoekLookup }
let editieId   = null;
let pollTimer  = null;

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#128204; Rally Tracking</h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="tracking-status" class="badge badge-info">laden…</span>
        <button class="btn btn-ghost btn-sm" id="btn-ververs">&#8635; Ververs</button>
        <button class="btn btn-primary btn-sm" id="btn-genereer-qr">&#128247; Patrouille QR's genereren</button>
      </div>
    </div>

    <div id="tracking-berichten"></div>
    <div id="tracking-inhoud"><div class="loading-spinner"></div></div>

    <!-- Modal: patrouille QR codes -->
    <div id="qr-modal"></div>
  `;
}

export async function onMount() {
  document.getElementById('btn-ververs').addEventListener('click', () => laadData());
  document.getElementById('btn-genereer-qr').addEventListener('click', genereerQrCodes);

  await laadData();

  // Ververs elke 15 seconden
  pollTimer = setInterval(laadData, 15_000);
}

export function onDestroy() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// ── Data laden ────────────────────────────────────────────────────

async function laadData() {
  try {
    if (!editieId) {
      const editie = await get('/publiek/editie/actief');
      if (!editie) {
        document.getElementById('tracking-inhoud').innerHTML =
          '<div class="card"><p class="text-muted" style="padding:16px">Geen actieve editie gevonden.</p></div>';
        return;
      }
      editieId = editie.id;
    }

    data = await get(`/admin/rally/tracking?editie_id=${editieId}`);
    document.getElementById('tracking-status').textContent = `bijgewerkt ${new Date().toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`;
    document.getElementById('tracking-status').className = 'badge badge-success';
    renderTracking();
  } catch (e) {
    document.getElementById('tracking-status').textContent = 'fout';
    document.getElementById('tracking-status').className = 'badge badge-error';
    toonBericht('error', e.message);
  }
}

// ── Tracking grid ─────────────────────────────────────────────────

function renderTracking() {
  const el = document.getElementById('tracking-inhoud');
  if (!data) return;

  const { stations, patrouilles, bezoekLookup } = data;

  if (!stations.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem">&#128204;</div>
          <p class="text-muted">Geen rally-momenten actief.<br>
          <span class="text-sm">Zet "Rally modus" aan bij een jureermoment om tracking in te schakelen.</span></p>
        </div>
      </div>
    `;
    return;
  }

  if (!patrouilles.length) {
    el.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px">Geen patrouilles met nummers gevonden.</p></div>`;
    return;
  }

  // Statistieken
  let totaalBezoeken = 0;
  let volledigAfgerond = 0;

  for (const pat of patrouilles) {
    let alleVoltooid = true;
    for (const st of stations) {
      const key = `${st.station_id}_${pat.id}`;
      const b   = bezoekLookup[key];
      if (b) totaalBezoeken++;
      if (!b || b.status !== 'voltooid') alleVoltooid = false;
    }
    if (alleVoltooid && stations.length > 0) volledigAfgerond++;
  }

  // Legenda
  const legenda = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:.8rem;align-items:center">
      <span class="badge badge-muted">&#9643; Niet geweest</span>
      <span class="badge badge-warning">&#128336; Aangekomen / bezig</span>
      <span class="badge badge-success">&#10003; Voltooid</span>
    </div>
  `;

  // Statistieken balk
  const stats = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div class="card" style="padding:12px 16px;flex:1;min-width:120px">
        <div class="text-muted text-sm">Patrouilles</div>
        <div style="font-size:1.4rem;font-weight:700">${patrouilles.length}</div>
      </div>
      <div class="card" style="padding:12px 16px;flex:1;min-width:120px">
        <div class="text-muted text-sm">Stations</div>
        <div style="font-size:1.4rem;font-weight:700">${stations.length}</div>
      </div>
      <div class="card" style="padding:12px 16px;flex:1;min-width:120px">
        <div class="text-muted text-sm">Scans totaal</div>
        <div style="font-size:1.4rem;font-weight:700">${totaalBezoeken}</div>
      </div>
      <div class="card" style="padding:12px 16px;flex:1;min-width:120px">
        <div class="text-muted text-sm">Volledig klaar</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--color-success)">${volledigAfgerond}</div>
      </div>
    </div>
  `;

  // Grid tabel: rijen = patrouilles, kolommen = stations
  const thStation = stations.map(st => `
    <th style="padding:6px 8px;text-align:center;min-width:60px;font-size:.75rem;font-weight:600">
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="width:8px;height:8px;border-radius:50%;background:#888"></div>
        <div>${esc(st.station_naam)}</div>
        <div class="text-muted" style="font-weight:400;font-size:.7rem">${esc(st.categorie_naam)}</div>
      </div>
    </th>
  `).join('');

  const rijen = patrouilles.map(pat => {
    const cellen = stations.map(st => {
      const key = `${st.station_id}_${pat.id}`;
      const b   = bezoekLookup[key];

      if (!b) {
        return `<td style="text-align:center;padding:4px">
          <span style="color:var(--color-text-muted);font-size:1rem">&#9643;</span>
        </td>`;
      }
      if (b.status === 'voltooid') {
        const tijd = b.vertrek_tijd
          ? new Date(b.vertrek_tijd).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' })
          : '';
        return `<td style="text-align:center;padding:4px" title="Voltooid ${tijd}">
          <span style="color:var(--color-success);font-size:1.1rem">&#10003;</span>
          ${tijd ? `<div class="text-muted" style="font-size:.65rem">${esc(tijd)}</div>` : ''}
        </td>`;
      }
      // aangekomen of bezig
      const aankomst = new Date(b.aankomst_tijd).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' });
      return `<td style="text-align:center;padding:4px" title="Aankomst ${aankomst}">
        <span style="color:var(--color-warning);font-size:1rem">&#128336;</span>
        <div class="text-muted" style="font-size:.65rem">${esc(aankomst)}</div>
      </td>`;
    }).join('');

    // Voortgangsbalk
    const gedaan   = stations.filter(st => {
      const b = bezoekLookup[`${st.station_id}_${pat.id}`];
      return b?.status === 'voltooid';
    }).length;
    const pct      = stations.length ? Math.round(gedaan / stations.length * 100) : 0;
    const kleurBar = pct === 100 ? 'var(--color-success)' : pct > 0 ? 'var(--color-warning)' : 'var(--color-border)';

    return `
      <tr>
        <td style="padding:6px 8px;white-space:nowrap;font-weight:600">
          <span style="color:var(--color-primary);font-size:1.05rem">#${pat.nummer ?? '?'}</span>
          <div style="width:100%;height:3px;background:var(--color-border);border-radius:2px;margin-top:3px">
            <div style="width:${pct}%;height:3px;background:${kleurBar};border-radius:2px"></div>
          </div>
        </td>
        ${cellen}
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    ${stats}
    ${legenda}
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="data-table" style="min-width:100%">
        <thead>
          <tr>
            <th style="padding:6px 8px;font-size:.8rem">#</th>
            ${thStation}
          </tr>
        </thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>
  `;
}

// ── QR codes genereren ────────────────────────────────────────────

async function genereerQrCodes() {
  const btn = document.getElementById('btn-genereer-qr');
  btn.disabled = true;
  btn.textContent = 'Genereren…';

  try {
    const result = await post('/admin/rally/tokens/genereer', {});
    toonQrModal(result.tokens || []);
  } catch (e) {
    toonBericht('error', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '&#128247; Patrouille QR\'s genereren';
  }
}

function toonQrModal(tokens) {
  const container = document.getElementById('qr-modal');

  const tegels = tokens.map(t => `
    <div style="text-align:center;background:var(--color-bg);border:1px solid var(--color-border);
      border-radius:var(--radius-md);padding:12px;min-width:120px">
      <div style="font-weight:700;font-size:1.1rem;color:var(--color-primary);margin-bottom:4px">
        #${t.nummer ?? '?'}
      </div>
      <img src="${t.qr_dataurl}" alt="QR patrouille ${t.nummer ?? '?'}"
        style="width:100px;height:100px;display:block;margin:0 auto 8px">
      <div class="text-muted text-sm" style="font-size:.7rem;word-break:break-all">${esc(t.url)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" style="max-width:700px;max-height:85vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <h3>&#128247; Patrouille QR-codes</h3>
          <button class="btn-icon" id="qr-modal-sluiten">&#10005;</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;flex:1">
          <p class="text-muted text-sm" style="margin-bottom:12px">
            Één QR-code per patrouille — geldig voor alle rally-stations zolang het moment open is.
            Druk deze af en geef ze mee aan de patrouilles.
          </p>
          ${tokens.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:10px">${tegels}</div>`
            : '<p class="text-muted">Geen patrouilles gevonden met nummer. Wijs eerst nummers toe via de plattegrond.</p>'
          }
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="qr-modal-sluiten-2">Sluiten</button>
          ${tokens.length ? '<button class="btn btn-primary" id="btn-print-qr">&#128438; Afdrukken</button>' : ''}
        </div>
      </div>
    </div>
  `;

  const sluit = () => { container.innerHTML = ''; };
  document.getElementById('qr-modal-sluiten').addEventListener('click', sluit);
  document.getElementById('qr-modal-sluiten-2').addEventListener('click', sluit);

  document.getElementById('btn-print-qr')?.addEventListener('click', () => {
    printQrCodes(tokens);
  });
}

function printQrCodes(tokens) {
  const win = window.open('', '_blank');
  if (!win) return;

  const items = tokens.map(t => `
    <div class="kaart">
      <div class="nummer">#${t.nummer ?? '?'}</div>
      <img src="${t.qr_dataurl}" alt="QR #${t.nummer ?? '?'}">
      <div class="label">RSW Rally — Patrouille QR</div>
    </div>
  `).join('');

  win.document.write(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Patrouille QR codes</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #fff; color: #000; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
    .kaart { border: 1px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; width: 140px; }
    .kaart img { width: 110px; height: 110px; display: block; margin: 6px auto; }
    .nummer { font-size: 1.4rem; font-weight: 800; color: #e94560; }
    .label { font-size: .65rem; color: #666; margin-top: 4px; }
    @media print { @page { margin: 8mm; } }
  </style>
</head>
<body>
  <div class="grid">${items}</div>
  <script>window.onload=()=>window.print()<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Helpers ───────────────────────────────────────────────────────

function toonBericht(type, msg) {
  const el = document.getElementById('tracking-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}" style="margin-bottom:12px">${esc(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
