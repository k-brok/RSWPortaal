// formulier.js — Jury invulformulier (standalone, geen SPA layout)
// Werkt via Socket.io + QR-token

const token = new URLSearchParams(location.search).get('token');
const root  = document.getElementById('formulier-root');

let socket = null;
let data   = null;   // { moment, subkamp, categorie, patrouilles, scores }
let huidigPatrouilleId = null;
let retryTimer = null;
let statusDot   = null;
let statusLabel = null;
const openSubcategorieen = new Set(); // bijhoudt welke sub-kaarten open zijn
// scores lokaal: Map `${patrouilleId}_${criteriumId}` → score
const lokaleScores = new Map();

// ── Init ───────────────────────────────────────────────────────────

function init() {
  if (!token) {
    toonFout('Geen token opgegeven', 'Open deze pagina via een geldige QR-code.');
    return;
  }

  const baseUrl   = window.location.href.split('/formulier')[0];
  const urlObj    = new URL(baseUrl);
  const basePath  = urlObj.pathname.replace(/\/?$/, '/');
  socket = io(urlObj.origin, {
    path: basePath + 'socket.io',
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    setStatus('verbonden');
    socket.emit('jury:join', { token });
  });

  socket.on('connect_error', (err) => {
    toonFout('Kan geen verbinding maken', `Controleer je netwerk en probeer opnieuw.<br><small style="opacity:.6">${err.message}</small>`);
  });

  socket.on('disconnect', () => setStatus('verbroken'));

  socket.on('jury:ready', (d) => {
    data = d;
    (d.scores || []).forEach(s => {
      lokaleScores.set(`${s.patrouille_id}_${s.criterium_id}`, Number(s.score));
    });
    // Alle subcategorieën standaard open
    (d.categorie?.subcategorieen || []).forEach(s => openSubcategorieen.add(s.id));
    huidigPatrouilleId = d.patrouilles[0]?.id ?? null;
    renderAlles();
  });

  socket.on('jury:error', ({ message }) => {
    if (message === 'Dit jureermoment is gesloten') {
      toonWachten();
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => socket.emit('jury:join', { token }), 30_000);
    } else {
      toonFout('Fout', message);
    }
  });

  socket.on('jury:score:updated', ({ patrouille_id, criterium_id, score }) => {
    // Update van andere client — bijwerken zonder opnieuw te emiten
    lokaleScores.set(`${patrouille_id}_${criterium_id}`, Number(score));
    updateScoreWeergave(patrouille_id, criterium_id, score, false);
    updateVoortgangBadges();
  });

  socket.on('jury:moment:closed', () => toonGesloten());
}

// ── Score ophalen / opslaan ────────────────────────────────────────

function getScore(patrouilleId, criteriumId) {
  return lokaleScores.get(`${patrouilleId}_${criteriumId}`) ?? null;
}

function setScore(patrouilleId, criteriumId, score) {
  lokaleScores.set(`${patrouilleId}_${criteriumId}`, Number(score));
  setStatus('opslaan');

  socket.emit('jury:score', { token, patrouille_id: patrouilleId, criterium_id: criteriumId, score }, (ack) => {
    setStatus(ack?.ok === false ? 'verbroken' : 'verbonden');
  });

  updateVoortgangBadges();
}

// ── Render functies ────────────────────────────────────────────────

function renderAlles() {
  root.innerHTML = `
    <div class="jury-sticky-top">
      ${renderHeader()}
      ${renderPatrouilleTabs()}
    </div>
    <div class="jury-cards" id="jury-cards"></div>
  `;
  statusDot   = root.querySelector('.jury-status-dot');
  statusLabel = root.querySelector('.jury-status-label');
  setStatus('verbonden');
  bindTabEvents();
  renderScoreForm(huidigPatrouilleId);
  updateVoortgangBadges();
}

function renderHeader() {
  const sub  = data.subkamp;
  const cat  = data.categorie;
  return `
    <div class="jury-header">
      <div class="subkamp-kleur-dot" style="background:${escapeAttr(sub.kleur || '#888')}"></div>
      <div class="jury-header-info">
        <div class="jury-header-titel">${esc(sub.naam)}</div>
        <div class="jury-header-sub">${esc(cat?.naam || '')} &mdash; ${esc(data.moment.naam || 'Jureermoment')}</div>
      </div>
      <div class="jury-status-wrapper" title="Verbindingsstatus">
        <div class="jury-status-dot"></div>
        <span class="jury-status-label"></span>
      </div>
    </div>
  `;
}

function renderPatrouilleTabs() {
  const tabs = (data.patrouilles || []).map(p => `
    <button class="patrouille-tab" data-patrouille-id="${p.id}">
      ${esc(String(p.nummer ?? p.naam))}
    </button>
  `).join('');
  return `<div class="patrouille-tabs" id="patrouille-tabs">${tabs}</div>`;
}

function bindTabEvents() {
  root.querySelectorAll('.patrouille-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      huidigPatrouilleId = Number(btn.dataset.patrouilleId);
      renderScoreForm(huidigPatrouilleId);
      updateActiveTab();
    });
  });
  updateActiveTab();
}

function updateActiveTab() {
  root.querySelectorAll('.patrouille-tab').forEach(btn => {
    btn.classList.toggle('actief', Number(btn.dataset.patrouilleId) === huidigPatrouilleId);
  });
}

function renderScoreForm(patrouilleId) {
  const kaarten = document.getElementById('jury-cards');
  if (!kaarten || !data.categorie) return;

  const subs = data.categorie.subcategorieen || [];
  if (!subs.length) {
    kaarten.innerHTML = '<p style="color:var(--color-text-muted);padding:16px;">Geen criteria gevonden.</p>';
    return;
  }

  kaarten.innerHTML = subs.map((sub) => `
    <div class="subcategorie-card ${openSubcategorieen.has(sub.id) ? 'open' : ''}" data-sub-id="${sub.id}">
      <div class="subcategorie-header">
        <span class="subcategorie-titel">${esc(sub.naam)}</span>
        <span class="subcategorie-chevron">&#9660;</span>
      </div>
      <div class="subcategorie-inhoud">
        ${(sub.criteria || []).map(cr => renderCriteriumRow(cr, patrouilleId)).join('')}
      </div>
    </div>
  `).join('');

  // Toggle subcategorie kaart — onthoud staat in openSubcategorieen
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

function renderCriteriumRow(cr, patrouilleId) {
  const modus   = data.moment.jureer_modus;
  const maxScore = Number(cr.max_score);
  const crN = { ...cr, max_score: maxScore };
  let widget;
  if (modus === 'binair') {
    widget = renderBinary(crN, patrouilleId);
  } else if (maxScore <= 3) {
    widget = renderSwitches(crN, patrouilleId);
  } else if (maxScore <= 8) {
    widget = renderCounter(crN, patrouilleId);
  } else {
    widget = renderNumberInput(crN, patrouilleId);
  }

  return `
    <div class="criterium-row" data-criterium-id="${cr.id}" data-patrouille-id="${patrouilleId}">
      <div class="criterium-tekst">
        <div class="criterium-naam">${esc(cr.naam)}</div>
        ${cr.omschrijving ? `<div class="criterium-omschrijving">${esc(cr.omschrijving)}</div>` : ''}
      </div>
      <div class="criterium-widget">${widget}</div>
    </div>
  `;
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
      <button class="counter-btn" data-actie="min" ${huidige <= 0 ? 'disabled' : ''}>&#8722;</button>
      <span class="counter-waarde">${huidige}</span>
      <button class="counter-btn" data-actie="plus" ${huidige >= cr.max_score ? 'disabled' : ''}>+</button>
    </div>
  `;
}

function renderNumberInput(cr, patrouilleId) {
  const huidige = getScore(patrouilleId, cr.id) ?? '';
  return `<input type="number" class="score-input" min="0" max="${cr.max_score}"
    value="${huidige}" data-criterium="${cr.id}" data-patrouille="${patrouilleId}"
    placeholder="0–${cr.max_score}">`;
}

function renderBinary(cr, patrouilleId) {
  const huidige = getScore(patrouilleId, cr.id);
  const goedActief     = huidige === cr.max_score ? 'actief' : '';
  const afkActief      = huidige === 0 && huidige !== null ? 'actief' : '';
  return `
    <div class="binary-knoppen">
      <button class="binary-knop goed ${goedActief}" title="Goed"
        data-waarde="${cr.max_score}" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,8 6,12 14,4"/></svg>
      </button>
      <button class="binary-knop afgekeurd ${afkActief}" title="Afgekeurd"
        data-waarde="0" data-criterium="${cr.id}" data-patrouille="${patrouilleId}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
      </button>
    </div>
  `;
}

function bindScoreInputs(_patrouilleId) {
  const kaarten = document.getElementById('jury-cards');
  if (!kaarten) return;

  // Switches
  kaarten.querySelectorAll('.score-switch').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.waarde);
      const cid = Number(btn.dataset.criterium);
      const pid = Number(btn.dataset.patrouille);
      setScore(pid, cid, val);
      updateScoreWeergave(pid, cid, val, true);
    });
  });

  // Counter
  kaarten.querySelectorAll('.score-counter .counter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.score-counter');
      const cid   = Number(container.dataset.criterium);
      const pid   = Number(container.dataset.patrouille);
      const cr    = vindCriterium(cid);
      const huidig = getScore(pid, cid) ?? 0;
      const nieuw  = btn.dataset.actie === 'min'
        ? Math.max(0, huidig - 1)
        : Math.min(cr?.max_score ?? 99, huidig + 1);
      setScore(pid, cid, nieuw);
      updateScoreWeergave(pid, cid, nieuw, true);
    });
  });

  // Number input
  kaarten.querySelectorAll('.score-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const cid = Number(inp.dataset.criterium);
      const pid = Number(inp.dataset.patrouille);
      const cr  = vindCriterium(cid);
      let val = Number(inp.value);
      val = Math.max(0, Math.min(cr?.max_score ?? 99, val));
      inp.value = val;
      setScore(pid, cid, val);
    });
  });

  // Binary knoppen
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

  // Switch actief
  rij.querySelectorAll('.score-switch').forEach(btn => {
    btn.classList.toggle('actief', Number(btn.dataset.waarde) === score);
  });
  // Counter
  const counter = rij.querySelector('.score-counter');
  if (counter) {
    const waarde = rij.querySelector('.counter-waarde');
    if (waarde) waarde.textContent = score;
    const cr = vindCriterium(criteriumId);
    rij.querySelector('[data-actie="min"]')?.toggleAttribute('disabled', score <= 0);
    rij.querySelector('[data-actie="plus"]')?.toggleAttribute('disabled', score >= (cr?.max_score ?? 99));
  }
  // Input
  const inp = rij.querySelector('.score-input');
  if (inp) inp.value = score;
  // Binary
  const goed = rij.querySelector('.binary-knop.goed');
  const afk  = rij.querySelector('.binary-knop.afgekeurd');
  const cr   = vindCriterium(criteriumId);
  if (goed) goed.classList.toggle('actief', score === Number(cr?.max_score));
  if (afk)  afk.classList.toggle('actief', score === 0);

  if (flashEffect) {
    rij.classList.remove('saved-flash');
    void rij.offsetWidth; // reflow
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

    const tab = root.querySelector(`.patrouille-tab[data-patrouille-id="${p.id}"]`);
    if (!tab) return;

    tab.classList.remove('voortgang-compleet', 'voortgang-gedeeltelijk');
    if (ingevuld === totalCriteria && totalCriteria > 0) {
      tab.classList.add('voortgang-compleet');
    } else if (ingevuld > 0) {
      tab.classList.add('voortgang-gedeeltelijk');
    }

    let voortgangSpan = tab.querySelector('.tab-voortgang');
    if (!voortgangSpan) {
      voortgangSpan = document.createElement('span');
      voortgangSpan.className = 'tab-voortgang';
      tab.appendChild(voortgangSpan);
    }
    voortgangSpan.textContent = `${ingevuld}/${totalCriteria}`;
  });
}

// ── Status dot ─────────────────────────────────────────────────────

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

function toonWachten() {
  root.innerHTML = `
    <div class="formulier-fout">
      <div class="formulier-fout-icon">&#9200;</div>
      <div class="formulier-fout-titel">Jureermoment nog niet gestart</div>
      <div class="formulier-fout-bericht">De jureringsperiode is nog niet begonnen. De pagina verbindt automatisch zodra het moment open gaat.</div>
    </div>
  `;
}

function toonFout(titel, bericht) {
  root.innerHTML = `
    <div class="formulier-fout">
      <div class="formulier-fout-icon">&#128683;</div>
      <div class="formulier-fout-titel">${esc(titel)}</div>
      <div class="formulier-fout-bericht">${esc(bericht)}</div>
    </div>
  `;
}

function toonGesloten() {
  const bestaand = document.querySelector('.gesloten-overlay');
  if (bestaand) return;
  const overlay = document.createElement('div');
  overlay.className = 'gesloten-overlay';
  overlay.innerHTML = `
    <div class="gesloten-overlay-icon">&#128274;</div>
    <div class="gesloten-overlay-titel">Jureermoment gesloten</div>
    <div class="gesloten-overlay-sub">De jureringsperiode is afgelopen. Bedankt voor je inzet!</div>
  `;
  document.body.appendChild(overlay);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Start ──────────────────────────────────────────────────────────
init();
