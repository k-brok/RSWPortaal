// pages/uitslagen.js — Uitslag & ranglijst (live via Socket.io voor admin/organisator)

import { get } from '../services/api.js';
import { escapeHtml as esc } from '../utils/escape.js';
import { getUser } from '../services/auth.js';
import { laadSocketScript, maakSocket } from '../services/socket.js';
import { laadPdfMake } from '../services/pdf.js';

let socket              = null;
let editieId            = null;
let editie              = null;
let refreshTimer        = null;
let isAdmin             = false;
let isLeiding           = false;
let huidigData          = null;
let filterGepubliceerd  = false; // false = alle momenten, true = alleen gepubliceerd

export async function render() {
  const user = getUser();
  isAdmin   = ['admin', 'organisator'].includes(user?.rol);
  isLeiding = user?.rol === 'leiding';

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1 style="display:flex;align-items:center;gap:10px">
          <span class="material-icons">emoji_events</span> Uitslagen
          ${isAdmin ? `
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span id="live-dot" style="width:8px;height:8px;border-radius:50%;background:var(--color-text-muted);display:inline-block;flex-shrink:0"></span>
            <span id="live-label" style="font-size:0.75rem;font-weight:400;color:var(--color-text-muted)">Verbinden…</span>
          </span>` : ''}
        </h1>
      </div>
      ${isAdmin ? `
      <div style="display:flex;align-items:center;gap:10px">
        <select id="select-filter" class="form-control" style="width:auto;font-size:0.85rem">
          <option value="alle">Alle momenten</option>
          <option value="gepubliceerd">Alleen gepubliceerd</option>
        </select>
        <button id="btn-afdruk" class="btn btn-ghost" style="display:none"><span class="material-icons">print</span> Afdrukken</button>
      </div>` : ''}
    </div>
    <div id="uitslagen-inhoud"><p class="text-muted">Laden…</p></div>
  `;

  if (isAdmin) {
    document.getElementById('btn-afdruk')?.addEventListener('click', afdrukken);
    document.getElementById('select-filter')?.addEventListener('change', e => {
      filterGepubliceerd = e.target.value === 'gepubliceerd';
      laadEnRender();
    });
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
      ? await get(`/admin/jury/uitslagen?editie_id=${editieId}&gepubliceerd=${filterGepubliceerd}`)
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

  attachExpandListeners();
}

function ranglijstKaart(titel, rijen, categorieen, isJongste) {
  const toonCategorieen = !isLeiding;
  // Leiding mag namen/groepen zien; admin ook; publiek ook (na publicatie zijn resultaten openbaar)
  const toonGroep = true;

  const catCols = toonCategorieen ? categorieen.map(c =>
    `<th class="col-hide-md" style="text-align:center;padding:8px 6px;font-size:0.75rem;white-space:nowrap;min-width:80px">
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

  // Rij is klikbaar zodra er kolommen verborgen zijn (geen aparte expand-knop-kolom)
  const rowExpandClass = toonCategorieen ? 'expandable-md' : 'expandable-sm';
  const hintClass      = toonCategorieen ? 'hint-md'       : 'hint-sm';

  // Aantal kolommen voor colspan in detail-rij (geen expand-kolom meer)
  const colCount = 2 + (toonGroep ? 1 : 0) + 1 + (toonCategorieen ? categorieen.length : 0) + 1;

  const rows = gesorteerd.map((r, i) => {
    const pos      = isJongste ? r.jongste_positie : r.positie;
    const posBadge = posBadgeHtml(pos, hintClass);
    const kleur    = r.subkamp?.kleur || '#888';

    const catCells = toonCategorieen ? categorieen.map(c => {
      const cs = r.categorieScores?.find(s => s.naam === c.naam);
      return `<td class="col-hide-md" style="text-align:center;padding:8px 6px;font-size:0.85rem">
        ${cs ? cs.score.toFixed(1) + '%' : '<span style="color:var(--color-text-muted)">—</span>'}
      </td>`;
    }).join('') : '';

    // Patrouille-cel: nummer + optioneel naam voor admin
    const naamSub = isAdmin && r.naam
      ? `<br><span style="font-size:0.75rem;font-weight:400;color:var(--color-text-muted)">${esc(r.naam)}</span>`
      : '';

    // Groep-cel: groep naam + vereniging muted eronder
    const groepCel = toonGroep ? `
      <td class="col-hide-xs" style="padding:10px 8px">
        <div style="font-size:0.85rem;line-height:1.3">
          ${r.groep_naam ? `<span style="font-weight:600">${esc(r.groep_naam)}</span>` : '<span style="color:var(--color-text-muted)">—</span>'}
          ${r.vereniging_naam ? `<br><span style="font-size:0.75rem;color:var(--color-text-muted)">${esc(r.vereniging_naam)}</span>` : ''}
        </div>
      </td>` : '';

    // Detail-items krijgen een CSS-klasse die overeenkomt met wanneer hun kolom verborgen is.
    // CSS regelt automatisch welke items zichtbaar zijn — geen JS viewport-check nodig.
    const detailParts = [];

    if (toonCategorieen) {
      categorieen.forEach(c => {
        const cs = r.categorieScores?.find(s => s.naam === c.naam);
        detailParts.push({ cls: 'for-md', label: esc(c.naam),
          value: cs ? `${cs.score.toFixed(1)}%` : '<span style="color:var(--color-text-muted)">—</span>' });
      });
    }
    if (r.subkamp?.naam) {
      detailParts.push({ cls: 'for-sm', label: 'Subkamp',
        value: `<span style="display:inline-flex;align-items:center;gap:5px">
          <span style="width:9px;height:9px;border-radius:50%;background:${esc(kleur)};display:inline-block;flex-shrink:0"></span>
          ${esc(r.subkamp.naam)}</span>` });
    }
    if (toonGroep && r.groep_naam) {
      detailParts.push({ cls: 'for-xs', label: 'Groep', value: esc(r.groep_naam) });
    }
    if (toonGroep && r.vereniging_naam) {
      detailParts.push({ cls: 'for-xs', label: 'Vereniging', value: esc(r.vereniging_naam) });
    }

    const detailHtml = detailParts.map(p =>
      `<div class="detail-item ${p.cls}">
        <span class="detail-item-label">${p.label}</span>
        <span class="detail-item-value">${p.value}</span>
      </div>`
    ).join('');

    const rid = `detail-${titel.replace(/\s+/g, '')}-${i}`;

    return `
      <tr class="uitslag-row ${rowExpandClass}" data-target="${rid}">
        <td style="padding:10px 14px;font-size:1rem;font-weight:700;white-space:nowrap">${posBadge}</td>
        <td style="padding:10px 8px;font-weight:700;font-size:0.95rem;white-space:nowrap;line-height:1.3">
          ${r.jongste ? '<span title="Jongste patrouille" style="color:#e8a020"><span class="material-icons" style="font-size:1rem">star</span></span> ' : ''}${esc(String(r.nummer ?? '—'))}${naamSub}
        </td>
        ${groepCel}
        <td class="col-hide-sm" style="padding:10px 8px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:10px;height:10px;border-radius:50%;background:${esc(kleur)};flex-shrink:0"></div>
            <span style="font-size:0.85rem">${esc(r.subkamp?.naam || '—')}</span>
          </div>
        </td>
        ${catCells}
        <td style="padding:10px 12px;font-weight:700;font-size:0.95rem;text-align:right;white-space:nowrap;color:var(--color-primary)">
          ${r.eindscore.toFixed(1)}%
        </td>
      </tr>
      <tr class="detail-row" id="${rid}" style="display:none">
        <td colspan="${colCount}">
          <div class="detail-row-inner">${detailHtml}</div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:20px;padding:0">
      <div style="padding:14px 18px;font-weight:700;font-size:1rem;border-bottom:2px solid var(--color-border)">
        ${esc(titel)}
      </div>
      <div class="uitslag-tabel-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Patrouille</th>
            ${toonGroep ? '<th class="col-hide-xs">Groep</th>' : ''}
            <th class="col-hide-sm">Subkamp</th>
            ${catCols}
            <th style="text-align:right">Eindscore</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    </div>`;
}

function posBadgeHtml(pos, hintClass) {
  const tekst = pos != null ? `<span style="font-weight:700">${pos}</span>` : '<span style="color:var(--color-text-muted)">—</span>';
  const hint  = hintClass ? `<span class="row-expand-hint ${hintClass}"><span class="material-icons" style="font-size:0.9rem">chevron_right</span></span>` : '';
  return tekst + hint;
}

function attachExpandListeners() {
  document.getElementById('uitslagen-inhoud')?.querySelectorAll('.uitslag-row').forEach(row => {
    row.addEventListener('click', () => {
      const detailRow = document.getElementById(row.dataset.target);
      if (!detailRow) return;
      const open = detailRow.style.display !== 'none';
      detailRow.style.display = open ? 'none' : 'table-row';
      row.classList.toggle('expanded', !open);
    });
  });
}

// ── Afdrukken via pdfMake ────────────────────────────────────────

async function afdrukken() {
  if (!huidigData?.resultaten?.length) return;

  const btn = document.getElementById('btn-afdruk');
  if (btn) { btn.disabled = true; btn.textContent = 'PDF maken…'; }

  try {
    await laadPdfMake();
  } catch {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons">print</span> Afdrukken'; }
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

  if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons">print</span> Afdrukken'; }
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
