// pages/organisator/jury.js — Jury momentenbeheer voor organisator/admin

import { get, post, put, del } from '../../services/api.js';
import { escapeHtml } from '../../utils/escape.js';
import { naarUTC, naarLocalDT } from '../../utils/datum.js';

let editieId   = null;
let momenten   = [];
let categorieen = [];
const qrCache  = new Map(); // momentId → tokens[]
let statusTimer = null;

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1><span class="material-icons">timer</span> Jurymomenten</h1>
      </div>
      <button class="btn btn-primary" id="btn-nieuw-moment">+ Nieuw moment</button>
    </div>
    <div id="jury-berichten"></div>
    <div id="jury-content"><p class="text-muted">Editie laden…</p></div>

    <!-- Modal moment aanmaken/bewerken -->
    <div id="moment-modal" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <h2 id="modal-titel">Jureermoment</h2>
          <button type="button" id="modal-sluiten"
            style="background:none;border:none;color:var(--color-text);font-size:1.2rem;cursor:pointer;line-height:1"><span class="material-icons">close</span></button>
        </div>
        <form id="moment-form">
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group">
              <label class="form-label">Categorie *</label>
              <select id="f-categorie" class="form-input" required></select>
            </div>
            <div class="form-group">
              <label class="form-label">Jureermode *</label>
              <select id="f-modus" class="form-input">
                <option value="numeriek">Numeriek</option>
                <option value="binair">Binair (goed/afgekeurd)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Starttijd *</label>
              <input type="datetime-local" id="f-start" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Eindtijd *</label>
              <input type="datetime-local" id="f-eind" class="form-input" required>
            </div>
            <hr style="border-color:var(--color-border);margin:4px 0">
            <div style="font-size:.8rem;font-weight:700;color:var(--color-text-muted);letter-spacing:.05em">RALLY MODUS</div>
            <div class="form-group" style="display:flex;align-items:center;gap:10px">
              <input type="checkbox" id="f-rally" style="width:18px;height:18px;accent-color:var(--color-primary)">
              <label for="f-rally" style="margin:0;cursor:pointer">Rally modus inschakelen</label>
            </div>
            <div id="rally-opties" style="display:none;display:flex;flex-direction:column;gap:10px">
              <div class="form-group">
                <label class="form-label">Score niveau</label>
                <select id="f-score-niveau" class="form-input">
                  <option value="criterium">Per criterium (gedetailleerd)</option>
                  <option value="subcategorie">Per subcategorie (samengevat)</option>
                </select>
                <div class="form-hint">Bepaalt welke invoervelden de jury ziet bij het scannen van een patrouille.</div>
              </div>
              <div class="form-group">
                <label class="form-label">Aankomstpunten</label>
                <input type="number" id="f-aankomst-punten" class="form-input" min="0" value="0" placeholder="0">
                <div class="form-hint">Punten die automatisch worden toegekend bij aankomst (0 = geen aankomstpunten).</div>
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
  `;

  document.getElementById('btn-nieuw-moment').addEventListener('click', () => openMomentModal(null));
  await laadData();
}

async function laadData() {
  try {
    const editie = await get('/publiek/editie/actief');
    if (!editie) {
      document.getElementById('jury-content').innerHTML = '<p class="text-muted">Geen actieve editie gevonden.</p>';
      return;
    }
    editieId = editie.id;

    [momenten, categorieen] = await Promise.all([
      get(`/admin/jury/momenten?editie_id=${editieId}`),
      get(`/admin/jury/categorieen?editie_id=${editieId}`),
    ]);

    renderMomenten();

    // Herbereken status badges elke 30s (puur tijdsgebaseerd, geen netwerk)
    clearInterval(statusTimer);
    statusTimer = setInterval(() => {
      momenten.forEach(m => {
        const el = document.getElementById(`status-badge-${m.id}`);
        if (el) el.innerHTML = statusBadge(m);
      });
    }, 30_000);
  } catch (e) {
    toonBericht('error', e.message);
  }
}

function renderMomenten() {
  const el = document.getElementById('jury-content');
  if (!momenten.length) {
    el.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px;">
      Nog geen jurymomenten. Klik op "+ Nieuw moment" om er een aan te maken.
      ${!categorieen.length ? '<br><br><em>Tip: importeer eerst categorieën.</em>' : ''}
    </p></div>`;
    return;
  }

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    ${momenten.map(m => renderMomentKaart(m)).join('')}
  </div>`;

  bindMomentActies();
}

function renderMomentKaart(m) {
  const openLabel    = m.handmatig_open ? 'Sluiten' : 'Openen';
  const publLabel    = m.gepubliceerd   ? 'Depubliceer' : 'Publiceer';
  const modusLabel   = m.jureer_modus === 'binair' ? 'Binair' : 'Numeriek';
  const rallyBadge   = m.rally_modus
    ? `<span class="badge badge-info" style="font-size:.7rem"><span class="material-icons" style="font-size:.7rem">push_pin</span> Rally</span>` : '';

  return `
  <div class="card" style="padding:0;overflow:hidden" data-id="${m.id}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;flex-wrap:wrap">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:1rem">${escapeHtml(m.categorie_naam || '—')}</div>
        <div style="font-size:0.8rem;color:var(--color-text-muted);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${escapeHtml(modusLabel)} &middot; ${formatDT(m.start_tijd)} &ndash; ${formatDT(m.eind_tijd)}
          &middot; ${m.subkamp_count ?? 0} subkampen
          ${rallyBadge}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0">
        <span id="status-badge-${m.id}">${statusBadge(m)}</span>
        <button class="btn btn-sm btn-ghost" data-actie="open">${escapeHtml(openLabel)}</button>
        <button class="btn btn-sm btn-ghost" data-actie="publiceer">${escapeHtml(publLabel)}</button>
        <button class="btn btn-sm btn-secondary" data-actie="bewerk">Bewerk</button>
        <button class="btn btn-sm btn-ghost" data-actie="verwijder"
          style="color:var(--color-error);border-color:var(--color-error)">Verwijder</button>
        <button class="btn btn-sm btn-secondary" data-actie="print-alle"><span class="material-icons">print</span> Alle formulieren</button>
        <button class="btn btn-sm btn-secondary qr-toggle-btn" data-actie="qr-toggle">
          QR-codes <span class="material-icons">expand_more</span>
        </button>
      </div>
    </div>
    <div class="qr-sectie" id="qr-sectie-${m.id}" style="display:none;border-top:1px solid var(--color-border)">
      <div class="qr-sectie-inhoud" id="qr-inhoud-${m.id}" style="padding:16px">
        <p class="text-muted">Laden…</p>
      </div>
    </div>
  </div>`;
}

function bindMomentActies() {
  document.querySelectorAll('[data-actie]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-id]');
      const id   = Number(card.dataset.id);
      const actie = btn.dataset.actie;
      const m = momenten.find(x => x.id === id);
      if (!m) return;

      if (actie === 'bewerk')      return openMomentModal(m);
      if (actie === 'qr-toggle')  return toggleQrSectie(id, m);
      if (actie === 'print-alle') return printAlleFormulieren(id, btn);

      if (actie === 'open') {
        await put(`/admin/jury/momenten/${id}/open`);
      } else if (actie === 'publiceer') {
        await put(`/admin/jury/momenten/${id}/publiceer`);
      } else if (actie === 'verwijder') {
        if (!confirm(`Moment "${m.categorie_naam}" verwijderen?`)) return;
        await del(`/admin/jury/momenten/${id}`);
      }
      await laadData();
    });
  });
}

// ── QR inline sectie ───────────────────────────────────────────────

async function toggleQrSectie(id, m) {
  const sectie = document.getElementById(`qr-sectie-${id}`);
  const btn    = document.querySelector(`[data-id="${id}"] .qr-toggle-btn`);
  const open   = sectie.style.display !== 'none';

  if (open) {
    sectie.style.display = 'none';
    btn.innerHTML = 'QR-codes <span class="material-icons">expand_more</span>';
    return;
  }

  sectie.style.display = 'block';
  btn.innerHTML = 'QR-codes <span class="material-icons">expand_less</span>';

  // Alleen laden als nog niet gecached
  if (!qrCache.has(id)) {
    await laadQrSectie(id);
  } else {
    renderQrInhoud(id, m);
  }
}

async function printAlleFormulieren(id, btn) {
  const origLabel = btn.textContent;
  btn.textContent = 'Laden…';
  btn.disabled = true;

  try {
    // Zorg dat tokens geladen zijn
    if (!qrCache.has(id)) {
      let data = await get(`/admin/jury/momenten/${id}/tokens`);
      if (!(data.tokens || []).length) {
        data = await post(`/admin/jury/momenten/${id}/tokens`);
      }
      qrCache.set(id, data.tokens || []);
    }

    const tokens = qrCache.get(id) || [];
    if (!tokens.length) {
      toonBericht('error', 'Geen subkampen gevonden voor dit moment.');
      return;
    }

    // Haal printdata op voor alle subkampen parallel
    const resultaten = await Promise.all(
      tokens.map(t =>
        get(`/admin/jury/momenten/${id}/printdata/${t.subkamp_id}`)
          .then(d => ({ data: d, qr: t.qr_dataurl }))
          .catch(() => null)
      )
    );

    const geldig = resultaten.filter(Boolean);
    if (!geldig.length) {
      toonBericht('error', 'Kon geen formulierdata ophalen.');
      return;
    }

    window.pdfMake.createPdf(bouwPdfDoc(geldig)).open();
  } catch (e) {
    toonBericht('error', e.message);
  } finally {
    btn.textContent = origLabel;
    btn.disabled = false;
  }
}

async function laadQrSectie(id) {
  const m = momenten.find(x => x.id === id);
  try {
    let data = await get(`/admin/jury/momenten/${id}/tokens`);
    // Automatisch genereren als er nog geen tokens zijn
    if (!(data.tokens || []).length) {
      data = await post(`/admin/jury/momenten/${id}/tokens`);
    }
    qrCache.set(id, data.tokens || []);
  } catch {
    qrCache.set(id, []);
  }
  renderQrInhoud(id, m);
}

function renderQrInhoud(id, _m) {
  const el     = document.getElementById(`qr-inhoud-${id}`);
  const tokens = qrCache.get(id) || [];

  if (!tokens.length) {
    el.innerHTML = '<p class="text-muted" style="margin:0">Geen subkampen gevonden voor dit moment.</p>';
    return;
  }

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      ${tokens.map(t => renderQrTegel({ ...t, momentId: id })).join('')}
    </div>
  `;

  // Print formulier knoppen
  el.querySelectorAll('.btn-print-formulier').forEach(btn => {
    btn.addEventListener('click', () => printScoreformulier(
      Number(btn.dataset.momentId),
      Number(btn.dataset.subkampId),
      btn.dataset.qr
    ));
  });

  // Scores invoeren — navigeer naar scorebeheer met filters vooringevuld
  el.querySelectorAll('.btn-scores-invoer').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('sb-prefill', JSON.stringify({
        momentId:  Number(btn.dataset.momentId),
        subkampId: Number(btn.dataset.subkampId),
      }));
      location.hash = '#/scores';
    });
  });
}

function formulierUrl(token) {
  const base = window.location.origin
    + window.location.pathname.replace(/\/$/, '').replace(/#.*$/, '');
  return `${base}/formulier?token=${encodeURIComponent(token)}`;
}

function renderQrTegel(t) {
  const url = formulierUrl(t.token);
  return `
    <div style="text-align:center;background:var(--color-bg);border:1px solid var(--color-border);
      border-radius:var(--radius-md);padding:12px;min-width:130px">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${escapeHtml(t.kleur||'#888')};flex-shrink:0"></div>
        <span style="font-weight:600;font-size:0.85rem">${escapeHtml(t.subkamp_naam)}</span>
      </div>
      <img src="${t.qr_dataurl}" alt="QR" style="width:110px;height:110px;display:block;margin:0 auto 8px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener"
          style="display:block;font-size:0.75rem;padding:5px 8px;border:1px solid var(--color-border);
            border-radius:var(--radius-sm);color:var(--color-primary);text-decoration:none;
            background:var(--color-surface);font-weight:600">
          <span class="material-icons" style="font-size:0.75rem">link</span> Openen
        </a>
        <button class="btn-print-formulier" data-moment-id="${t.momentId ?? ''}"
          data-subkamp-id="${t.subkamp_id}" data-qr="${escapeHtml(t.qr_dataurl)}"
          data-naam="${escapeHtml(t.subkamp_naam)}" data-kleur="${escapeHtml(t.kleur||'#888')}"
          style="display:block;width:100%;font-size:0.75rem;padding:5px 8px;
            border:1px solid var(--color-border);border-radius:var(--radius-sm);
            background:var(--color-surface);cursor:pointer;font-family:inherit;
            color:var(--color-text);font-weight:600">
          <span class="material-icons" style="font-size:0.75rem">print</span> Scoreformulier
        </button>
        <button class="btn-scores-invoer" data-moment-id="${t.momentId ?? ''}"
          data-subkamp-id="${t.subkamp_id}"
          style="display:block;width:100%;font-size:0.75rem;padding:5px 8px;
            border:1px solid var(--color-border);border-radius:var(--radius-sm);
            background:var(--color-surface);cursor:pointer;font-family:inherit;
            color:var(--color-text);font-weight:600">
          <span class="material-icons" style="font-size:0.75rem">leaderboard</span> Scores invoeren
        </button>
      </div>
    </div>`;
}

// ── Scoreformulier print (pdfmake) ─────────────────────────────────

async function printScoreformulier(momentId, subkampId, qrDataUrl) {
  try {
    const d = await get(`/admin/jury/momenten/${momentId}/printdata/${subkampId}`);
    window.pdfMake.createPdf(bouwPdfDoc([{ data: d, qr: qrDataUrl }])).open();
  } catch (e) {
    toonBericht('error', 'Kan formulierdata niet laden: ' + e.message);
  }
}

function lightenHex(hex, amount = 0.88) {
  const h = (hex || '#555555').replace('#', '');
  if (h.length !== 6) return '#f0f0f0';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return '#' + [r, g, b].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('');
}

function bouwPdfDoc(items) {
  const content = [];
  items.forEach(({ data: d, qr }, idx) => {
    if (idx > 0) content.push({ text: '', pageBreak: 'before' });
    content.push(...bouwFormulierContent(d, qr));
  });
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [14, 14, 14, 14],
    content,
    styles: {
      label:           { fontSize: 6, color: '#888888', bold: true },
      infoWaarde:      { fontSize: 8, bold: true, color: '#1e3a5f' },
      infoWaardeKlein: { fontSize: 7, bold: true, color: '#1e3a5f' },
      subTitel:        { fontSize: 8, bold: true, color: '#ffffff' },
      legenda:         { fontSize: 7, color: '#555555', italics: true },
    },
    defaultStyle: { font: 'Roboto', fontSize: 8 },
  };
}

function bouwFormulierContent(d, qrDataUrl) {
  const { moment, editie, subkamp, categorie, patrouilles } = d;
  const kleur       = (subkamp.kleur || '#555555');
  const kleurLicht  = lightenHex(kleur);
  const subs        = categorie?.subcategorieen || [];
  const aantalCrit  = subs.reduce((s, sub) => s + (sub.criteria?.length || 0), 0);
  const aantalJ     = patrouilles.filter(p => p.jongste).length;
  const modusLabel  = moment.jureer_modus === 'binair' ? 'Binair (goed/afgekeurd)' : 'Numeriek';
  const editieLabel = editie ? `${editie.naam || ''} ${editie.jaar || ''}`.trim() : '';
  const tijdLabel   = `${formatDT(moment.start_tijd)} – ${formatDT(moment.eind_tijd)}`;

  const header = {
    table: {
      widths: [12, 100, '*', 72],
      body: [[
        { text: '', fillColor: kleur, border: [true, true, false, true] },
        {
          stack: [
            { text: 'SUBKAMP', style: 'label' },
            { text: subkamp.naam, fontSize: 14, bold: true, color: kleur, margin: [0, 2, 0, 0] },
          ],
          fillColor: kleurLicht,
          border: [false, true, true, true],
          margin: [8, 8, 8, 8],
        },
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                { stack: [{ text: 'Editie', style: 'label' }, { text: editieLabel || '—', style: 'infoWaarde' }], border: [false, false, true, true], margin: [6, 4, 6, 2] },
                { stack: [{ text: 'Categorie', style: 'label' }, { text: categorie?.naam || '—', style: 'infoWaardeKlein' }], border: [false, false, true, true], margin: [6, 4, 6, 2] },
                { stack: [{ text: 'Jureermode', style: 'label' }, { text: modusLabel, style: 'infoWaarde' }], border: [false, false, false, true], margin: [6, 4, 6, 2] },
              ],
              [
                { stack: [{ text: 'Tijdvenster', style: 'label' }, { text: tijdLabel, style: 'infoWaardeKlein' }], border: [false, false, true, false], margin: [6, 2, 6, 4] },
                { stack: [{ text: 'Patrouilles', style: 'label' }, { text: `${patrouilles.length}${aantalJ ? ` (\u2605 ${aantalJ} jongste)` : ''}`, style: 'infoWaarde' }], border: [false, false, true, false], margin: [6, 2, 6, 4] },
                { stack: [{ text: 'Criteria', style: 'label' }, { text: `${aantalCrit} (${subs.length} subcategorieën)`, style: 'infoWaardeKlein' }], border: [false, false, false, false], margin: [6, 2, 6, 4] },
              ],
            ],
          },
          layout: { hLineColor: () => '#e0e0e0', vLineColor: () => '#e0e0e0', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
          border: [false, true, true, true],
        },
        {
          stack: [
            { image: qrDataUrl, width: 56, height: 56, alignment: 'center' },
            { text: 'Digitaal formulier', fontSize: 6, color: '#888888', alignment: 'center', margin: [0, 2, 0, 0] },
          ],
          alignment: 'center',
          margin: [4, 6, 4, 4],
          border: [true, true, true, true],
        },
      ]],
    },
    layout: { hLineColor: () => '#bbbbbb', vLineColor: () => '#bbbbbb', hLineWidth: () => 1, vLineWidth: () => 1 },
    margin: [0, 0, 0, 6],
  };

  const tabellen = [...subs]
    .sort((a, b) => (a.criteria?.length || 0) - (b.criteria?.length || 0))
    .map(sub => bouwPdfSubtabel(sub, patrouilles));

  return [
    header,
    ...(aantalJ ? [{ text: '\u2605 = jongste patrouille', style: 'legenda', margin: [0, 0, 0, 4] }] : []),
    ...tabellen,
  ];
}

function bouwPdfSubtabel(sub, patrouilles) {
  const criteria = sub.criteria || [];
  if (!criteria.length) return { text: '' };

  const COL_W = 20;
  const widths = ['*', ...patrouilles.map(() => COL_W), COL_W];

  // Subcategorie naam staat in de eerste cel van de headerrij (geen aparte donkere balk)
  const headerRij = [
    { text: sub.naam, bold: true, fontSize: 7, color: '#1e3a5f', border: [true, true, true, true] },
    ...patrouilles.map(p => ({
      text: p.jongste ? `\u2605${p.nummer ?? '?'}` : String(p.nummer ?? '?'),
      alignment: 'center', fontSize: 6, bold: true,
      fillColor: p.jongste ? '#fef3c7' : '#e8eef5',
      color: p.jongste ? '#92400e' : '#1e3a5f',
    })),
    { text: 'Max', alignment: 'center', fontSize: 6, bold: true, fillColor: '#d5e0f0', color: '#1e3a5f' },
  ];

  const dataRijen = criteria.map((cr, idx) => {
    const maxScore = cr.max_score != null ? String(Number(cr.max_score)) : '—';
    const bg = idx % 2 === 1 ? '#f3f6fb' : '#fafafa';
    return [
      {
        stack: [
          { text: cr.naam, bold: true, fontSize: 7 },
          ...(cr.omschrijving ? [{ text: cr.omschrijving, fontSize: 6, color: '#555555' }] : []),
        ],
        border: [true, false, true, true],
      },
      ...patrouilles.map(() => ({ text: '', fillColor: bg, border: [true, false, true, true] })),
      { text: maxScore, alignment: 'center', bold: true, color: '#1e3a5f', fillColor: '#ecf2fb', fontSize: 7, border: [true, false, true, true] },
    ];
  });

  return {
    table: {
      widths,
      heights: COL_W,
      body: [headerRij, ...dataRijen],
    },
    layout: { hLineColor: () => '#cccccc', vLineColor: () => '#cccccc', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    unbreakable: true,
    margin: [0, 0, 0, 8],
  };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Moment modal ───────────────────────────────────────────────────

let bewerkMomentId = null;

function openMomentModal(m) {
  bewerkMomentId = m?.id ?? null;
  document.getElementById('modal-titel').textContent = m ? 'Moment bewerken' : 'Nieuw jureermoment';

  const catSel = document.getElementById('f-categorie');
  catSel.innerHTML = categorieen.map(c =>
    `<option value="${c.id}" ${m?.categorie_id === c.id ? 'selected' : ''}>${escapeHtml(c.naam)}</option>`
  ).join('');

  document.getElementById('f-modus').value = m?.jureer_modus || 'numeriek';
  document.getElementById('f-start').value = m ? naarLocalDT(m.start_tijd) : '';
  document.getElementById('f-eind').value  = m ? naarLocalDT(m.eind_tijd)  : '';

  const rallyCheck = document.getElementById('f-rally');
  rallyCheck.checked = !!m?.rally_modus;
  document.getElementById('f-score-niveau').value     = m?.score_niveau     || 'criterium';
  document.getElementById('f-aankomst-punten').value  = m?.aankomst_punten  ?? 0;
  toggleRallyOpties(!!m?.rally_modus);
  rallyCheck.addEventListener('change', () => toggleRallyOpties(rallyCheck.checked));

  const modal = document.getElementById('moment-modal');
  modal.style.display = 'flex';

  document.getElementById('modal-sluiten').onclick  = () => { modal.style.display = 'none'; };
  document.getElementById('modal-annuleer').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('moment-form').onsubmit   = submitMomentForm;
}

function toggleRallyOpties(aan) {
  const el = document.getElementById('rally-opties');
  if (el) el.style.display = aan ? 'flex' : 'none';
}

async function submitMomentForm(e) {
  e.preventDefault();
  const body = {
    editie_id:        editieId,
    categorie_id:     Number(document.getElementById('f-categorie').value),
    jureer_modus:     document.getElementById('f-modus').value,
    start_tijd:       naarUTC(document.getElementById('f-start').value),
    eind_tijd:        naarUTC(document.getElementById('f-eind').value),
    rally_modus:      document.getElementById('f-rally').checked,
    score_niveau:     document.getElementById('f-score-niveau').value,
    aankomst_punten:  Number(document.getElementById('f-aankomst-punten').value) || 0,
  };
  try {
    if (bewerkMomentId) {
      await put(`/admin/jury/momenten/${bewerkMomentId}`, body);
    } else {
      await post('/admin/jury/momenten', body);
    }
    document.getElementById('moment-modal').style.display = 'none';
    await laadData();
  } catch (e) { toonBericht('error', e.message); }
}

// ── Statusbadge ────────────────────────────────────────────────────

function statusBadge(m) {
  const now = new Date();
  if (m.gepubliceerd)  return `<span class="badge badge-warning">GEPUBLICEERD</span>`;
  if (m.handmatig_open) return `<span class="badge badge-success">HANDMATIG OPEN</span>`;
  if (now >= new Date(m.start_tijd) && now <= new Date(m.eind_tijd))
    return `<span class="badge badge-success">OPEN</span>`;
  if (now < new Date(m.start_tijd)) return `<span class="badge badge-info">GEPLAND</span>`;
  return `<span class="badge badge-muted">GESLOTEN</span>`;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDT(dt) {
  return new Date(dt).toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function pad(n) { return String(n).padStart(2, '0'); }

function toonBericht(type, msg) {
  const el = document.getElementById('jury-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

export function onDestroy() {
  clearInterval(statusTimer);
  statusTimer = null;
}
