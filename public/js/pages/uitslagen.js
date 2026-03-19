// pages/uitslagen.js — Uitslag & ranglijst (live via Socket.io voor admin/organisator)

import { get } from '../services/api.js';
import { escapeHtml as esc } from '../utils/escape.js';
import { getUser } from '../services/auth.js';
import { laadSocketScript, maakSocket } from '../services/socket.js';
import { laadPdfMake } from '../services/pdf.js';

let socket       = null;
let editieId     = null;
let editie       = null;
let refreshTimer = null;
let isAdmin      = false;
let isLeiding    = false;
let huidigData   = null;

export async function render() {
  const user = getUser();
  isAdmin   = ['admin', 'organisator'].includes(user?.rol);
  isLeiding = user?.rol === 'leiding';

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1>&#127942; Uitslagen</h1></div>
      <div style="display:flex;align-items:center;gap:10px">
        ${isAdmin ? `<button id="btn-afdruk" class="btn btn-ghost" style="display:none">&#128438; Afdrukken</button>` : ''}
        ${isAdmin ? `
        <span id="live-dot" style="width:8px;height:8px;border-radius:50%;background:var(--color-text-muted);display:inline-block"></span>
        <span id="live-label" style="font-size:0.8rem;color:var(--color-text-muted)">Verbinden…</span>
        ` : ''}
      </div>
    </div>
    <div id="uitslagen-inhoud"><p class="text-muted">Laden…</p></div>
  `;

  if (isAdmin) {
    document.getElementById('btn-afdruk')?.addEventListener('click', afdrukken);
  }

  try {
    editie = await get('/publiek/editie/actief');
    editieId = editie?.id ?? null;
    await laadEnRender();
    if (isAdmin) verbindSocket();
  } catch (e) {
    document.getElementById('uitslagen-inhoud').innerHTML =
      `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

async function laadEnRender() {
  try {
    const data = isAdmin && editieId
      ? await get(`/admin/jury/uitslagen?editie_id=${editieId}`)
      : await get('/publiek/uitslagen/actief');
    huidigData = data;
    renderUitslagen(data);
    if (isAdmin && data?.resultaten?.length) {
      const btn = document.getElementById('btn-afdruk');
      if (btn) btn.style.display = 'inline-flex';
    }
  } catch (e) {
    document.getElementById('uitslagen-inhoud').innerHTML =
      `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

async function verbindSocket() {
  if (!editieId) return;
  try { await laadSocketScript(); } catch { return; }

  socket = maakSocket();

  socket.on('connect', () => {
    socket.emit('uitslagen:join', { editieId });
    setLiveStatus(true);
  });

  socket.on('disconnect', () => setLiveStatus(false));

  socket.on('uitslagen:updated', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(laadEnRender, 1500);
  });
}

function setLiveStatus(online) {
  const dot   = document.getElementById('live-dot');
  const label = document.getElementById('live-label');
  if (!dot || !label) return;
  dot.style.background = online ? 'var(--color-success)' : 'var(--color-text-muted)';
  label.textContent    = online ? 'Live' : 'Offline';
  label.style.color    = online ? 'var(--color-success)' : 'var(--color-text-muted)';
}

export function onDestroy() {
  clearTimeout(refreshTimer);
  socket?.disconnect();
  socket = null;
}

// ── Render uitslagen ──────────────────────────────────────────────

function renderUitslagen({ resultaten, categorieen }) {
  if (!resultaten?.length) {
    document.getElementById('uitslagen-inhoud').innerHTML =
      '<p class="text-muted">Nog geen uitslagen beschikbaar.</p>';
    return;
  }

  const jongste = resultaten.filter(r => r.jongste);

  document.getElementById('uitslagen-inhoud').innerHTML = `
    ${ranglijstKaart('Algemene ranglijst', resultaten, categorieen, false)}
    ${jongste.length ? ranglijstKaart('Jongste patrouilles', jongste, categorieen, true) : ''}
  `;
}

function ranglijstKaart(titel, rijen, categorieen, isJongste) {
  const toonCategorieen = !isLeiding;

  const catCols = toonCategorieen ? categorieen.map(c =>
    `<th style="text-align:center;padding:8px 6px;font-size:0.75rem;white-space:nowrap;min-width:80px">
      ${esc(c.naam)}<br>
      <span style="font-weight:400;color:var(--color-text-muted)">${c.wegingspercentage}%</span>
    </th>`
  ).join('') : '';

  const gesorteerd = [...rijen].sort((a, b) => {
    const pA = (isJongste ? a.jongste_positie : a.positie) ?? 9999;
    const pB = (isJongste ? b.jongste_positie : b.positie) ?? 9999;
    if (pA !== pB) return pA - pB;
    return String(a.nummer ?? '').localeCompare(String(b.nummer ?? ''), 'nl', { numeric: true });
  });

  const rows = gesorteerd.map(r => {
    const pos      = isJongste ? r.jongste_positie : r.positie;
    const posBadge = posBadgeHtml(pos);
    const kleur    = r.subkamp?.kleur || '#888';

    const catCells = toonCategorieen ? categorieen.map(c => {
      const cs = r.categorieScores?.find(s => s.naam === c.naam);
      return `<td style="text-align:center;padding:8px 6px;font-size:0.85rem">
        ${cs ? cs.score.toFixed(1) + '%' : '<span style="color:var(--color-text-muted)">—</span>'}
      </td>`;
    }).join('') : '';

    return `<tr style="border-bottom:1px solid var(--color-border)">
      <td style="padding:10px 14px;font-size:1rem;font-weight:700;white-space:nowrap">${posBadge}</td>
      <td style="padding:10px 8px;font-weight:700;font-size:0.95rem;white-space:nowrap">
        ${r.jongste ? '<span title="Jongste patrouille" style="color:#e8a020">&#9733;</span> ' : ''}${esc(String(r.nummer ?? '—'))}
      </td>
      <td style="padding:10px 8px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:10px;height:10px;border-radius:50%;background:${esc(kleur)};flex-shrink:0"></div>
          <span style="font-size:0.85rem">${esc(r.subkamp?.naam || '—')}</span>
        </div>
      </td>
      ${catCells}
      <td style="padding:10px 12px;font-weight:700;font-size:0.95rem;text-align:right;white-space:nowrap;color:var(--color-primary)">
        ${r.eindscore.toFixed(1)}%
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:20px;overflow-x:auto;padding:0">
      <div style="padding:14px 18px;font-weight:700;font-size:1rem;border-bottom:2px solid var(--color-border)">
        ${esc(titel)}
      </div>
      <table class="data-table" style="min-width:max-content">
        <thead>
          <tr>
            <th>#</th>
            <th>Patrouille</th>
            <th>Subkamp</th>
            ${catCols}
            <th style="text-align:right">Eindscore</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function posBadgeHtml(pos) {
  if (pos == null) return '<span style="color:var(--color-text-muted)">—</span>';
  return `<span style="font-weight:700">${pos}</span>`;
}

// ── Afdrukken via pdfMake ────────────────────────────────────────

async function afdrukken() {
  if (!huidigData?.resultaten?.length) return;

  const btn = document.getElementById('btn-afdruk');
  if (btn) { btn.disabled = true; btn.textContent = 'PDF maken…'; }

  try {
    await laadPdfMake();
  } catch {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#128438; Afdrukken'; }
    return;
  }

  const { resultaten } = huidigData;
  const bmLabel  = editie?.bm_label  || 'Buiten mededinging';
  const editieNm = [editie?.naam, editie?.jaar].filter(Boolean).join(' — ');
  const jongste  = resultaten.filter(r => r.jongste);
  const datumStr = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const dd = {
    info:        { title: `Uitslagen ${editieNm}` },
    pageSize:    'A4',
    pageMargins: [40, 50, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      koptekst:    { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      meta:        { fontSize: 9, color: '#666', margin: [0, 0, 0, 16] },
      sectietitel: { fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
      kolomhdr:    { bold: true, fontSize: 9, fillColor: '#eeeeee' },
      jongste:     { bold: true, color: '#b45309', fontSize: 9 },
      bm:          { italics: true, color: '#777777', fontSize: 8 },
    },
    content: [
      { text: 'Uitslagen RSW', style: 'koptekst' },
      { text: `${editieNm}  ·  Gegenereerd op ${datumStr}`, style: 'meta' },
      ...pdfTabel('Algemene ranglijst', resultaten, false, bmLabel),
      ...(jongste.length ? pdfTabel('Jongste patrouilles', jongste, true, bmLabel) : []),
    ],
  };

  const bestandsnaam = `uitslagen-${(editie?.naam || 'rsw').toLowerCase().replace(/\s+/g, '-')}-${editie?.jaar || ''}.pdf`;
  pdfMake.createPdf(dd).download(bestandsnaam);

  if (btn) { btn.disabled = false; btn.innerHTML = '&#128438; Afdrukken'; }
}

function pdfTabel(titel, rijen, isJongste, bmLabel) {
  const header = ['#', 'Patrouille', 'Groep', 'Vereniging', 'Score', ''].map(t => ({
    text: t, style: 'kolomhdr',
  }));

  const gesorteerd = [...rijen].sort((a, b) => {
    const pA = (isJongste ? a.jongste_positie : a.positie) ?? 9999;
    const pB = (isJongste ? b.jongste_positie : b.positie) ?? 9999;
    if (pA !== pB) return pA - pB;
    return String(a.nummer ?? '').localeCompare(String(b.nummer ?? ''), 'nl', { numeric: true });
  });

  const body = gesorteerd.map(r => {
    const pos = isJongste ? (r.jongste_positie ?? r.positie) : r.positie;

    const badgeStack = [];
    if (r.jongste)            badgeStack.push({ text: '\u2605 Jongste', style: 'jongste' });
    if (r.buiten_mededinging) badgeStack.push({ text: bmLabel, style: 'bm' });

    return [
      { text: pos != null ? String(pos) : '—', alignment: 'center' },
      `${r.nummer ?? '—'}  ${r.naam || '—'}`,
      r.groep_naam || '—',
      r.vereniging_naam || '—',
      { text: `${r.eindscore.toFixed(1)}%`, alignment: 'right', bold: true },
      badgeStack.length ? { stack: badgeStack } : '',
    ];
  });

  return [
    { text: titel, style: 'sectietitel' },
    {
      table: {
        headerRows: 1,
        widths: [18, '*', '*', '*', 42, 80],
        body: [header, ...body],
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        hLineColor: i => i === 1 ? '#333333' : '#dddddd',
        vLineWidth: () => 0,
        fillColor:  i => (i > 0 && i % 2 === 0) ? '#fafafa' : null,
      },
      margin: [0, 0, 0, 10],
    },
  ];
}
