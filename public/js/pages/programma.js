// pages/programma.js — Publiek programma-overzicht

import { get } from '../services/api.js';
import { escapeHtml as esc } from '../utils/escape.js';
import { formatTijd } from '../utils/datum.js';

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left"><h1><span class="material-icons">event</span> Programma</h1></div>
    </div>
    <div id="programma-inhoud"><p class="text-muted">Laden…</p></div>
  `;

  try {
    const editie = await get('/publiek/editie/actief');
    if (!editie) {
      document.getElementById('programma-inhoud').innerHTML =
        '<p class="text-muted">Geen actieve editie gevonden.</p>';
      return;
    }

    const items = await get(`/publiek/edities/${editie.id}/programma`);
    renderProgramma(items, editie);
  } catch (e) {
    document.getElementById('programma-inhoud').innerHTML =
      `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

function renderProgramma(items, editie) {
  const el = document.getElementById('programma-inhoud');

  if (!items?.length) {
    el.innerHTML = '<p class="text-muted">Het programma is nog niet beschikbaar.</p>';
    return;
  }

  // Inschrijvingsitems → vooraf; rest → RSW-dagen
  const vooraf    = items.filter(i => i.type === 'inschrijving');
  const rswItems  = items.filter(i => i.type !== 'inschrijving');

  let html = `<div style="max-width:680px">`;

  if (vooraf.length)   html += renderVooraf(vooraf);
  if (rswItems.length) html += renderRswDagen(rswItems, editie);

  html += `</div>`;
  el.innerHTML = html;
}

// ── Voorafgaand (inschrijvingen als datumbereik) ───────────────────

function renderVooraf(items) {
  const rijen = items.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:11px 16px;border-bottom:1px solid var(--color-border)">
      <span style="font-weight:600;font-size:0.9rem"><span class="material-icons" style="font-size:0.9rem">assignment</span> ${esc(item.naam)}</span>
      <span style="font-size:0.83rem;color:var(--color-text-muted);white-space:nowrap">
        ${datumBereik(item.start_tijd, item.eind_tijd)}
      </span>
    </div>`).join('');

  return `
    <div style="margin-bottom:28px">
      ${sectieHeader('Voorafgaand')}
      <div class="card" style="padding:0;overflow:hidden">${rijen}</div>
    </div>`;
}

// ── RSW-dagen (gegroepeerd per dag, tijdlijn) ─────────────────────

function renderRswDagen(items, editie) {
  const perDag = new Map();
  for (const item of items) {
    const key = dateOf(item.start_tijd);
    if (!perDag.has(key)) perDag.set(key, []);
    perDag.get(key).push(item);
  }

  const titel = [editie.naam, editie.jaar].filter(Boolean).join(' ');

  let html = `
    <div>
      ${sectieHeader(titel || 'RSW')}
      <div class="card" style="padding:0;overflow:hidden">`;

  let firstDag = true;
  for (const [dagKey, dagItems] of perDag) {
    const dagLabel = new Date(dagKey + 'T12:00:00').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    html += `
      ${firstDag ? '' : '<div style="height:1px;background:var(--color-border)"></div>'}
      <div style="padding:8px 16px;background:var(--color-surface-alt);
        font-size:0.78rem;font-weight:700;text-transform:capitalize;
        color:var(--color-text-muted);letter-spacing:0.03em">
        ${esc(dagLabel)}
      </div>
      <div style="display:flex;flex-direction:column">
        ${dagItems.map((item, i) => renderRij(item, i, dagItems.length)).join('')}
      </div>`;

    firstDag = false;
  }

  html += `</div></div>`;
  return html;
}

function renderRij(item, idx, total) {
  const isJury   = item.type === 'jurymoment';
  const accent   = isJury ? 'var(--color-primary)' : 'var(--color-info)';
  const tijdStr  = formatTijd(item.start_tijd);
  const eindStr  = item.eind_tijd ? formatTijd(item.eind_tijd) : null;
  const borderB  = idx < total - 1 ? 'border-bottom:1px solid var(--color-border)' : '';

  return `
    <div style="display:flex;gap:0;align-items:stretch;${borderB}">
      <div style="display:flex;flex-direction:column;align-items:center;width:48px;flex-shrink:0;padding:14px 0">
        <div style="width:10px;height:10px;border-radius:50%;background:${accent};flex-shrink:0;margin-top:3px"></div>
        ${idx < total - 1 ? `<div style="width:2px;flex:1;background:var(--color-border);margin-top:4px"></div>` : ''}
      </div>
      <div style="padding:12px 0 12px 4px;flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:0.8rem;font-weight:600;color:var(--color-text-muted);white-space:nowrap">
            ${esc(tijdStr)}${eindStr ? ` – ${esc(eindStr)}` : ''}
          </span>
          ${isJury ? `<span style="font-size:0.72rem;padding:1px 6px;border-radius:10px;
            background:var(--color-surface-alt);color:var(--color-text-muted)"><span class="material-icons" style="font-size:0.72rem">hourglass_empty</span> Jurering</span>` : ''}
        </div>
        <div style="font-weight:600;font-size:0.95rem;margin-top:2px">${esc(item.naam)}</div>
        ${item.omschrijving
          ? `<div style="font-size:0.82rem;color:var(--color-text-muted);margin-top:2px">${esc(item.omschrijving)}</div>`
          : ''}
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────

function sectieHeader(label) {
  return `
    <div style="font-weight:700;font-size:0.85rem;text-transform:uppercase;
      letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:10px">
      ${esc(label)}
    </div>`;
}

function dateOf(dt) {
  return new Date(dt).toISOString().slice(0, 10);
}


function formatDatum(dt) {
  return new Date(dt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function datumBereik(start, eind) {
  const s = formatDatum(start);
  const e = eind ? formatDatum(eind) : null;
  return e && e !== s ? `${s} – ${e}` : s;
}
