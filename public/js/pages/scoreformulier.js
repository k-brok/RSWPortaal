// public/js/pages/scoreformulier.js — Scoreformulier (jury) & categorie-overzicht (spelbegeleider)
// ?token=XXX  → jury invulformulier via socket
// (geen token) → rol-specifieke weergave

import { getUser } from '../services/auth.js';
import { get } from '../services/api.js';
import { escapeHtml as esc } from '../utils/escape.js';
import { laadSocketScript, maakSocket } from '../services/socket.js';

let socket = null;
let data   = null;
let huidigPatrouilleId = null;
const openSubcategorieen = new Set();
const lokaleScores = new Map();
let statusDot   = null;
let statusLabel = null;
let retryTimer  = null;

function getToken() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  return params.get('token') || null;
}

function getRol() {
  return getUser()?.rol;
}

// ── Render & mount ─────────────────────────────────────────────────

export async function render() {
  const token = getToken();
  const rol   = getRol();
  const inhoud = token
    ? `<div id="sf-root">
        <div class="text-muted" style="padding:24px">Verbinding maken…</div>
       </div>`
    : bouwPlaceholder(rol);

  document.getElementById('content').innerHTML = inhoud;
}

export async function onMount() {
  const token = getToken();
  if (token) {
    await verbindJurySocket(token);
  }
}

export function onDestroy() {
  clearTimeout(retryTimer);
  socket?.disconnect();
  socket = null;
  data   = null;
  lokaleScores.clear();
  openSubcategorieen.clear();
}

// ── Placeholder (geen token) ───────────────────────────────────────

function bouwPlaceholder(rol) {
  if (rol === 'spelbegeleider') {
    return `
      <div class="page-header">
        <div class="page-header-left">
          <h1><span class="material-icons">emoji_events</span> Mijn categorie</h1>
          <p>Overzicht van je toegewezen categorie en live scores</p>
        </div>
      </div>
      <div id="sf-root">
        <div class="card" style="padding:24px;text-align:center">
          <p class="text-muted" style="font-size:1rem">
            Categorie-overzicht voor spelbegeleiders is in aanbouw.<br>
            Neem contact op met de organisator voor je scoreformulieren.
          </p>
        </div>
      </div>`;
  }

  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1><span class="material-icons">bar_chart</span> Scoreformulier</h1>
        <p>Scan de QR-code of open de link die je van de organisator hebt ontvangen</p>
      </div>
    </div>
    <div id="sf-root">
      <div class="card" style="padding:24px;text-align:center">
        <div style="font-size:3rem;margin-bottom:16px"><span class="material-icons" style="font-size:3rem">photo_camera</span></div>
        <h3>QR-code scannen</h3>
        <p class="text-muted">
          Scan de QR-code bij je subkamp of open de link die je van de organisator hebt ontvangen
          om het scoreformulier te openen.
        </p>
        <p class="text-muted" style="font-size:0.82rem;margin-top:16px">
          Het formulier opent op het apparaat waarmee je de QR-code scant.
        </p>
      </div>
    </div>`;
}

// ── Jury socket formulier ──────────────────────────────────────────

async function verbindJurySocket(token) {
  const root = document.getElementById('sf-root');
  if (!root) return;

  try { await laadSocketScript(); } catch {
    root.innerHTML = toonFoutHtml('Socket niet beschikbaar', 'Kon socket.io niet laden.');
    return;
  }

  socket = maakSocket();

  socket.on('connect', () => {
    socket.emit('jury:join', { token });
  });
  socket.on('connect_error', (err) => {
    if (root) root.innerHTML = toonFoutHtml('Verbinding mislukt', err.message);
  });
  socket.on('disconnect', () => setStatus('verbroken'));

  socket.on('jury:ready', (d) => {
    data = d;
    (d.scores || []).forEach(s => {
      lokaleScores.set(`${s.patrouille_id}_${s.criterium_id}`, Number(s.score));
    });
    (d.categorie?.subcategorieen || []).forEach(s => openSubcategorieen.add(s.id));
    huidigPatrouilleId = d.patrouilles[0]?.id ?? null;
    renderFormulier();
  });

  socket.on('jury:error', ({ message }) => {
    if (message === 'Dit jureermoment is gesloten') {
      if (root) root.innerHTML = toonWachtenHtml();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => socket.emit('jury:join', { token }), 30_000);
    } else {
      if (root) root.innerHTML = toonFoutHtml('Fout', message);
    }
  });

  socket.on('jury:score:updated', ({ patrouille_id, criterium_id, score }) => {
    lokaleScores.set(`${patrouille_id}_${criterium_id}`, Number(score));
    updateScoreWeergave(patrouille_id, criterium_id, score, false);
    updateVoortgangBadges();
  });

  socket.on('jury:moment:closed', () => {
    const overlay = document.createElement('div');
    overlay.className = 'gesloten-overlay';
    overlay.innerHTML = `
      <div class="gesloten-overlay-icon"><span class="material-icons">lock</span></div>
      <div class="gesloten-overlay-titel">Jureermoment gesloten</div>
      <div class="gesloten-overlay-sub">De jureringsperiode is afgelopen. Bedankt!</div>`;
    document.body.appendChild(overlay);
  });
}

function setScore(patrouilleId, criteriumId, score) {
  lokaleScores.set(`${patrouilleId}_${criteriumId}`, Number(score));
  setStatus('opslaan');
  const token = getToken();
  socket.emit('jury:score', { token, patrouille_id: patrouilleId, criterium_id: criteriumId, score }, (ack) => {
    setStatus(ack?.ok === false ? 'verbroken' : 'verbonden');
  });
  updateVoortgangBadges();
}

function getScore(patrouilleId, criteriumId) {
  return lokaleScores.get(`${patrouilleId}_${criteriumId}`) ?? null;
}

// ── Formulier render ───────────────────────────────────────────────

function renderFormulier() {
  const root = document.getElementById('sf-root');
  if (!root || !data) return;

  root.innerHTML = `
    <div class="jury-sticky-top">
      ${renderJuryHeader()}
      ${renderPatrouilleTabs()}
    </div>
    <div class="jury-cards" id="jury-cards"></div>`;

  statusDot   = root.querySelector('.jury-status-dot');
  statusLabel = root.querySelector('.jury-status-label');
  setStatus('verbonden');
  bindTabEvents();
  renderScoreKaarten(huidigPatrouilleId);
  updateVoortgangBadges();
}

function renderJuryHeader() {
  const sub = data.subkamp;
  const cat = data.categorie;
  return `
    <div class="jury-header">
      <div class="subkamp-kleur-dot" style="background:${escAttr(sub.kleur || '#888')}"></div>
      <div class="jury-header-info">
        <div class="jury-header-titel">${esc(sub.naam)}</div>
        <div class="jury-header-sub">${esc(cat?.naam || '')} &mdash; ${esc(data.moment.naam || 'Jureermoment')}</div>
      </div>
      <div class="jury-status-wrapper" title="Verbindingsstatus">
        <div class="jury-status-dot"></div>
        <span class="jury-status-label"></span>
      </div>
    </div>`;
}

function renderPatrouilleTabs() {
  const tabs = (data.patrouilles || []).map(p => `
    <button class="patrouille-tab" data-patrouille-id="${p.id}">
      ${esc(String(p.nummer ?? p.naam))}
    </button>`).join('');
  return `<div class="patrouille-tabs" id="patrouille-tabs">${tabs}</div>`;
}

function bindTabEvents() {
  document.querySelectorAll('.patrouille-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      huidigPatrouilleId = Number(btn.dataset.patrouilleId);
      renderScoreKaarten(huidigPatrouilleId);
      updateActiveTab();
    });
  });
  updateActiveTab();
}

function updateActiveTab() {
  document.querySelectorAll('.patrouille-tab').forEach(btn => {
    btn.classList.toggle('actief', Number(btn.dataset.patrouilleId) === huidigPatrouilleId);
  });
}

function renderScoreKaarten(patrouilleId) {
  const kaarten = document.getElementById('jury-cards');
  if (!kaarten || !data?.categorie) return;

  const subs = data.categorie.subcategorieen || [];
  if (!subs.length) {
    kaarten.innerHTML = '<p class="text-muted" style="padding:16px">Geen criteria gevonden.</p>';
    return;
  }

  kaarten.innerHTML = subs.map(sub => `
    <div class="subcategorie-card ${openSubcategorieen.has(sub.id) ? 'open' : ''}" data-sub-id="${sub.id}">
      <div class="subcategorie-header">
        <span class="subcategorie-titel">${esc(sub.naam)}</span>
        <span class="subcategorie-chevron"><span class="material-icons">expand_more</span></span>
      </div>
      <div class="subcategorie-inhoud">
        ${(sub.criteria || []).map(cr => renderCriteriumRij(cr, patrouilleId)).join('')}
      </div>
    </div>`).join('');

  kaarten.querySelectorAll('.subcategorie-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const card  = hdr.closest('.subcategorie-card');
      const subId = Number(card.dataset.subId);
      card.classList.toggle('open');
      if (card.classList.contains('open')) openSubcategorieen.add(subId);
      else openSubcategorieen.delete(subId);
    });
  });

  bindScoreInputs(patrouilleId);
}

function renderCriteriumRij(cr, patrouilleId) {
  const modus    = data.moment.jureer_modus;
  const maxScore = Number(cr.max_score);
  const crN      = { ...cr, max_score: maxScore };
  let widget;
  if (modus === 'binair')  widget = renderBinary(crN, patrouilleId);
  else if (maxScore <= 3)  widget = renderSwitches(crN, patrouilleId);
  else if (maxScore <= 8)  widget = renderCounter(crN, patrouilleId);
  else                     widget = renderNumberInput(crN, patrouilleId);

  return `
    <div class="criterium-row" data-criterium-id="${cr.id}" data-patrouille-id="${patrouilleId}">
      <div class="criterium-tekst">
        <div class="criterium-naam">${esc(cr.naam)}</div>
        ${cr.omschrijving ? `<div class="criterium-omschrijving">${esc(cr.omschrijving)}</div>` : ''}
      </div>
      <div class="criterium-widget">${widget}</div>
    </div>`;
}

function renderSwitches(cr, patrouilleId) {
  const huidige = getScore(patrouilleId, cr.id);
  const knoppen = [];
  for (let i = 0; i <= cr.max_score; i++) {
    knoppen.push(`<button class="score-switch ${huidige === i ? 'actief' : ''}"
      data-waarde="${i}" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">${i}</button>`);
  }
  return `<div class="score-switches">${knoppen.join('')}</div>`;
}

function renderCounter(cr, patrouilleId) {
  const huidige = getScore(patrouilleId, cr.id) ?? 0;
  return `
    <div class="score-counter" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">
      <button class="counter-btn" data-actie="min" ${huidige <= 0 ? 'disabled' : ''}><span class="material-icons">remove</span></button>
      <span class="counter-waarde">${huidige}</span>
      <button class="counter-btn" data-actie="plus" ${huidige >= cr.max_score ? 'disabled' : ''}><span class="material-icons">add</span></button>
    </div>`;
}

function renderNumberInput(cr, patrouilleId) {
  const huidige = getScore(patrouilleId, cr.id) ?? '';
  return `<input type="number" class="score-input" min="0" max="${cr.max_score}"
    value="${huidige}" data-criterium="${cr.id}" data-patrouille="${patrouilleId}"
    placeholder="0–${cr.max_score}">`;
}

function renderBinary(cr, patrouilleId) {
  const huidige    = getScore(patrouilleId, cr.id);
  const goedActief = huidige === cr.max_score ? 'actief' : '';
  const afkActief  = huidige === 0 && huidige !== null ? 'actief' : '';
  return `
    <div class="binary-knoppen">
      <button class="binary-knop goed ${goedActief}" data-waarde="${cr.max_score}" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,8 6,12 14,4"/></svg>
      </button>
      <button class="binary-knop afgekeurd ${afkActief}" data-waarde="0" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
      </button>
    </div>`;
}

function bindScoreInputs() {
  const kaarten = document.getElementById('jury-cards');
  if (!kaarten) return;

  kaarten.querySelectorAll('.score-switch').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.waarde);
      const cid = Number(btn.dataset.criterium);
      const pid = Number(btn.dataset.patrouille);
      setScore(pid, cid, val);
      updateScoreWeergave(pid, cid, val, true);
    });
  });

  kaarten.querySelectorAll('.score-counter .counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.score-counter');
      const cid    = Number(container.dataset.criterium);
      const pid    = Number(container.dataset.patrouille);
      const cr     = vindCriterium(cid);
      const huidig = getScore(pid, cid) ?? 0;
      const nieuw  = btn.dataset.actie === 'min'
        ? Math.max(0, huidig - 1)
        : Math.min(cr?.max_score ?? 99, huidig + 1);
      setScore(pid, cid, nieuw);
      updateScoreWeergave(pid, cid, nieuw, true);
    });
  });

  kaarten.querySelectorAll('.score-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const cid = Number(inp.dataset.criterium);
      const pid = Number(inp.dataset.patrouille);
      const cr  = vindCriterium(cid);
      let val = Math.max(0, Math.min(cr?.max_score ?? 99, Number(inp.value)));
      inp.value = val;
      setScore(pid, cid, val);
    });
  });

  kaarten.querySelectorAll('.binary-knop').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.waarde);
      const cid = Number(btn.dataset.criterium);
      const pid = Number(btn.dataset.patrouille);
      setScore(pid, cid, val);
      updateScoreWeergave(pid, cid, val, true);
    });
  });
}

// ── UI updates ─────────────────────────────────────────────────────

function updateScoreWeergave(patrouilleId, criteriumId, score, flashEffect) {
  if (patrouilleId !== huidigPatrouilleId) return;
  const rij = document.querySelector(`.criterium-row[data-criterium-id="${criteriumId}"]`);
  if (!rij) return;

  rij.querySelectorAll('.score-switch').forEach(btn => {
    btn.classList.toggle('actief', Number(btn.dataset.waarde) === score);
  });
  const counter = rij.querySelector('.score-counter');
  if (counter) {
    const waarde = rij.querySelector('.counter-waarde');
    if (waarde) waarde.textContent = score;
    const cr = vindCriterium(criteriumId);
    rij.querySelector('[data-actie="min"]')?.toggleAttribute('disabled', score <= 0);
    rij.querySelector('[data-actie="plus"]')?.toggleAttribute('disabled', score >= (cr?.max_score ?? 99));
  }
  const inp = rij.querySelector('.score-input');
  if (inp) inp.value = score;
  const cr   = vindCriterium(criteriumId);
  const goed = rij.querySelector('.binary-knop.goed');
  const afk  = rij.querySelector('.binary-knop.afgekeurd');
  if (goed) goed.classList.toggle('actief', score === Number(cr?.max_score));
  if (afk)  afk.classList.toggle('actief', score === 0);

  if (flashEffect) {
    rij.classList.remove('saved-flash');
    void rij.offsetWidth;
    rij.classList.add('saved-flash');
  }
}

function updateVoortgangBadges() {
  if (!data) return;
  const totalCriteria = (data.categorie?.subcategorieen || [])
    .flatMap(s => s.criteria || []).length;

  data.patrouilles.forEach(p => {
    const ingevuld = (data.categorie?.subcategorieen || [])
      .flatMap(s => s.criteria || [])
      .filter(cr => getScore(p.id, cr.id) !== null).length;

    const tab = document.querySelector(`.patrouille-tab[data-patrouille-id="${p.id}"]`);
    if (!tab) return;
    tab.classList.remove('voortgang-compleet', 'voortgang-gedeeltelijk');
    if (ingevuld === totalCriteria && totalCriteria > 0) tab.classList.add('voortgang-compleet');
    else if (ingevuld > 0) tab.classList.add('voortgang-gedeeltelijk');

    let span = tab.querySelector('.tab-voortgang');
    if (!span) { span = document.createElement('span'); span.className = 'tab-voortgang'; tab.appendChild(span); }
    span.textContent = `${ingevuld}/${totalCriteria}`;
  });
}

function setStatus(status) {
  if (!statusDot) return;
  statusDot.className = 'jury-status-dot ' + status;
  if (statusLabel) {
    statusLabel.textContent = { verbonden: 'Live', opslaan: 'Opslaan…', verbroken: 'Offline' }[status] ?? '';
    statusLabel.className   = 'jury-status-label ' + status;
  }
}

// ── Hulpfuncties ───────────────────────────────────────────────────

function vindCriterium(criteriumId) {
  if (!data?.categorie) return null;
  for (const sub of data.categorie.subcategorieen || []) {
    const cr = (sub.criteria || []).find(c => c.id === criteriumId);
    if (cr) return { ...cr, max_score: Number(cr.max_score) };
  }
  return null;
}

function toonFoutHtml(titel, bericht) {
  return `<div class="card" style="padding:32px;text-align:center">
    <div style="font-size:3rem;margin-bottom:8px"><span class="material-icons" style="font-size:3rem">block</span></div>
    <h3>${esc(titel)}</h3>
    <p class="text-muted">${esc(bericht)}</p>
  </div>`;
}

function toonWachtenHtml() {
  return `<div class="card" style="padding:32px;text-align:center">
    <div style="font-size:3rem;margin-bottom:8px"><span class="material-icons" style="font-size:3rem">alarm</span></div>
    <h3>Jureermoment nog niet gestart</h3>
    <p class="text-muted">De jureringsperiode is nog niet begonnen. De pagina verbindt automatisch zodra het moment open gaat.</p>
  </div>`;
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
