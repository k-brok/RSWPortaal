// public/js/rally.js — Rally scan pagina (standalone, geen header/sidebar)
// Flow:
//   1. Station selectie (camera QR-scan of handmatige lijst)
//   2. Wacht op patrouille QR scan (camera, standaard actief als vorige sessie dat gebruikte)
//   3. Score formulier invullen voor die patrouille
//   4. Opslaan → terug naar wachten
//
// Opslag: localStorage (geen persoonsgegevens — enkel anonieme tokens).
// Valt onder "strikt noodzakelijke functionaliteit" → geen cookiemelding vereist.

import { BASE_PATH } from './config.js';

const BASE = BASE_PATH;
const root = () => document.getElementById('rally-root');

// ── Lokale opslag sleutels ─────────────────────────────────────────
const STATION_KEY = 'rally_station_token'; // station-token (herbruikbaar zolang moment open)
const EDITIE_KEY  = 'rally_editie_id';     // editie-ID voor de stationslijst
const CAMERA_KEY  = 'rally_camera';        // '1' als jury de camera-voorkeur heeft

function getPref(key)        { try { return localStorage.getItem(key); } catch { return null; } }
function setPref(key, val)   { try { localStorage.setItem(key, val); } catch {} }
function delPref(key)        { try { localStorage.removeItem(key); } catch {} }
function cameraVoorkeur()    { return getPref(CAMERA_KEY) === '1'; }
function setCameraVoorkeur(v){ setPref(CAMERA_KEY, v ? '1' : '0'); }

// ── Init ───────────────────────────────────────────────────────────

async function init() {
  const params       = new URLSearchParams(location.search);
  const patToken     = params.get('patrouille');
  const stationToken = params.get('station') || getPref(STATION_KEY);

  if (patToken && stationToken) {
    await schermScan(stationToken, patToken);
  } else if (patToken) {
    schermStationKeuze({ pendingPatrouilleToken: patToken });
  } else if (stationToken) {
    await valideerEnToonWachten(stationToken);
  } else {
    schermStationKeuze({});
  }
}

// ── Scherm: station kiezen ─────────────────────────────────────────

function schermStationKeuze({ pendingPatrouilleToken } = {}) {
  const editieId = getPref(EDITIE_KEY) || '';

  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-intro">
        <div class="rally-intro-icon">&#128204;</div>
        <h1 class="rally-intro-titel">RSW Rally</h1>
        <p class="rally-intro-sub">Kies je station via de camera of de lijst</p>
      </div>

      <div class="rally-content">

        <!-- Camera scanner voor station-QR -->
        <div class="subcategorie-card open">
          <div class="subcategorie-header">
            <span class="subcategorie-titel">&#127909; Scan station-QR</span>
            <button class="btn btn-primary btn-sm" id="btn-camera-station">Camera starten</button>
          </div>
          <div class="subcategorie-inhoud" style="padding:12px">
            <div id="station-camera-container" style="display:none">
              <video id="station-camera-video" class="rally-camera-preview" autoplay playsinline muted></video>
              <p class="text-muted" style="margin:8px 0 0;text-align:center;font-size:.82rem">
                Houd de station-QR voor de camera
              </p>
              <button class="btn btn-ghost btn-sm w-full" id="btn-camera-station-stop" style="margin-top:8px">
                &#9632; Camera stoppen
              </button>
            </div>
            <div id="station-fout-camera" class="alert alert-error" style="display:none;margin-top:8px"></div>
          </div>
        </div>

        <!-- Handmatige stationslijst -->
        <div class="subcategorie-card open">
          <div class="subcategorie-header">
            <span class="subcategorie-titel">&#128203; Of kies uit de lijst</span>
            <span class="subcategorie-chevron">&#9660;</span>
          </div>
          <div class="subcategorie-inhoud" style="padding:12px">
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label" style="font-size:.82rem">Editie ID</label>
              <div style="display:flex;gap:8px">
                <input class="form-input" id="editie-id-input" type="number"
                  placeholder="bijv. 1" value="${editieId}" style="flex:1" />
                <button class="btn btn-ghost btn-sm" id="btn-laad-stations">&#128260; Laden</button>
              </div>
            </div>
            <div id="stations-lijst"></div>
          </div>
        </div>

        <div id="station-fout" class="alert alert-error" style="display:none"></div>

      </div>
    </div>
  `;

  // Camera voor station-QR
  let stationCameraStream = null;
  let stationCameraActief = false;

  document.getElementById('btn-camera-station').addEventListener('click', async () => {
    if (!stationCameraActief) startStationCamera();
  });

  async function startStationCamera() {
    const container = document.getElementById('station-camera-container');
    const video     = document.getElementById('station-camera-video');
    const foutEl    = document.getElementById('station-fout-camera');
    container.style.display = 'block';
    stationCameraActief = true;
    document.getElementById('btn-camera-station').textContent = 'Camera actief…';
    document.getElementById('btn-camera-station').disabled = true;

    if (!('BarcodeDetector' in window)) {
      container.innerHTML = '<p class="text-muted text-sm">Camera QR-scan niet ondersteund in deze browser.<br>Gebruik de stationslijst hieronder.</p>';
      return;
    }

    try {
      stationCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stationCameraStream;

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!stationCameraActief) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const raw = codes[0].rawValue;
            stopStationCamera();
            setCameraVoorkeur(true);
            await kiesStation(raw, pendingPatrouilleToken);
            return;
          }
        } catch { /* detectiefout overgeslagen */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      foutEl.textContent = `Camera niet beschikbaar: ${e.message}`;
      foutEl.style.display = 'block';
      container.style.display = 'none';
      stationCameraActief = false;
    }
  }

  function stopStationCamera() {
    stationCameraActief = false;
    if (stationCameraStream) {
      stationCameraStream.getTracks().forEach(t => t.stop());
      stationCameraStream = null;
    }
    const container = document.getElementById('station-camera-container');
    if (container) container.style.display = 'none';
    const btn = document.getElementById('btn-camera-station');
    if (btn) { btn.textContent = 'Camera starten'; btn.disabled = false; }
  }

  document.getElementById('btn-camera-station-stop')?.addEventListener('click', stopStationCamera);

  document.getElementById('btn-laad-stations').addEventListener('click', async () => {
    const id = document.getElementById('editie-id-input').value.trim();
    if (!id) return;
    setPref(EDITIE_KEY, id);
    await laadOpenStations(id, pendingPatrouilleToken);
  });

  if (editieId) laadOpenStations(editieId, pendingPatrouilleToken);
}

async function laadOpenStations(editieId, pendingPatrouilleToken) {
  const el = document.getElementById('stations-lijst');
  if (!el) return;
  el.innerHTML = '<p class="text-muted text-sm">Laden…</p>';

  try {
    const stations = await apiGet(`/api/rally/stations?editie_id=${editieId}`);
    if (!stations.length) {
      el.innerHTML = '<p class="text-muted text-sm">Geen open rally-stations gevonden.</p>';
      return;
    }
    el.innerHTML = stations.map(s => `
      <button class="btn btn-ghost w-full"
        style="margin-bottom:4px;text-align:left;justify-content:flex-start;gap:8px;padding:8px 10px"
        data-token="${esc(s.token)}">
        <strong>${esc(s.station_naam)}</strong>
        <span class="text-muted" style="font-size:.8rem"> — ${esc(s.categorie_naam)}</span>
      </button>
    `).join('');
    el.querySelectorAll('button[data-token]').forEach(btn => {
      btn.addEventListener('click', () => kiesStation(btn.dataset.token, pendingPatrouilleToken));
    });
  } catch (e) {
    el.innerHTML = `<p class="text-muted text-sm">Fout: ${esc(e.message)}</p>`;
  }
}

async function kiesStation(token, pendingPatrouilleToken) {
  const pureToken = extractToken(token, 'token') || token.trim();
  toonFout('station-fout', null);
  try {
    const data = await apiGet(`/api/rally/station/${encodeURIComponent(pureToken)}`);
    setPref(STATION_KEY, pureToken);
    const editieId = data.moment?.editie_id;
    if (editieId) setPref(EDITIE_KEY, editieId);

    if (pendingPatrouilleToken) {
      await schermScan(pureToken, pendingPatrouilleToken);
    } else {
      schermWachten(data, pureToken);
    }
  } catch (e) {
    toonFout('station-fout', e.message);
  }
}

async function valideerEnToonWachten(stationToken) {
  try {
    const data = await apiGet(`/api/rally/station/${encodeURIComponent(stationToken)}`);
    if (data.gesloten) {
      delPref(STATION_KEY);
      schermStationKeuze({});
      return;
    }
    schermWachten(data, stationToken);
  } catch {
    delPref(STATION_KEY);
    schermStationKeuze({});
  }
}

// ── Scherm: wachten op patrouille ──────────────────────────────────

function schermWachten(stationData, stationToken) {
  const { station, moment, categorie_naam } = stationData;
  const gebruiksCamera = cameraVoorkeur();

  root().innerHTML = `
    <div class="rally-page">

      <!-- Sticky station header -->
      <div class="rally-station-bar">
        <div class="rally-station-info">
          <div class="rally-station-naam">${esc(station?.naam || '—')}</div>
          <div class="rally-station-sub">${esc(categorie_naam || moment?.naam || '—')}</div>
        </div>
        <button class="btn btn-sm" id="btn-wissel-station"
          style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3);flex-shrink:0">
          &#8635; Wissel
        </button>
      </div>

      <div class="rally-content">

        <!-- Camera scanner (primair) -->
        <div class="subcategorie-card open">
          <div class="subcategorie-header">
            <span class="subcategorie-titel">&#127909; Scan patrouille-QR</span>
            <button class="btn btn-sm ${gebruiksCamera ? 'btn-primary' : 'btn-ghost'}" id="btn-camera">
              ${gebruiksCamera ? 'Camera uit' : 'Camera aan'}
            </button>
          </div>
          <div class="subcategorie-inhoud" style="padding:12px">
            <div id="camera-container" style="display:${gebruiksCamera ? 'block' : 'none'}">
              <video id="camera-video" class="rally-camera-preview" autoplay playsinline muted></video>
              <p class="text-muted" style="margin:8px 0 0;text-align:center;font-size:.82rem">
                Houd de QR-code voor de camera
              </p>
            </div>
            <div id="camera-fout" class="alert alert-error" style="display:none;margin-top:8px"></div>
          </div>
        </div>

        <!-- Alternatief: tekstinvoer (hardware scanner / copy-paste) -->
        <div class="subcategorie-card">
          <div class="subcategorie-header">
            <span class="subcategorie-titel">&#9000;&#65039; Handmatige invoer</span>
            <span class="subcategorie-chevron">&#9660;</span>
          </div>
          <div class="subcategorie-inhoud" style="padding:12px">
            <input class="form-input" id="patrouille-input" type="text"
              placeholder="Scan of plak token hier…" autocomplete="off" />
            <div class="form-hint" style="margin-top:6px">
              Hardware QR-scanners "typen" de URL automatisch in dit veld.
            </div>
          </div>
        </div>

        <div id="scan-fout" class="alert alert-error" style="display:none"></div>

      </div>
    </div>
  `;

  // ── Camera logica ─────────────────────────────────────────────────

  let cameraStream = null;
  let cameraActief = false;

  async function startCamera() {
    const container = document.getElementById('camera-container');
    const video     = document.getElementById('camera-video');
    const foutEl    = document.getElementById('camera-fout');
    container.style.display = 'block';

    if (!('BarcodeDetector' in window)) {
      container.innerHTML = '<p class="text-muted text-sm">Camera QR-scan niet ondersteund in deze browser.<br>Gebruik de handmatige invoer hieronder.</p>';
      setCameraVoorkeur(false);
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      cameraActief = true;
      setCameraVoorkeur(true);
      document.getElementById('btn-camera').textContent = 'Camera uit';
      document.getElementById('btn-camera').className = 'btn btn-sm btn-primary';

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!cameraActief) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const raw      = codes[0].rawValue;
            const patToken = extractToken(raw, 'patrouille') || raw;
            stopCamera();
            await schermScan(stationToken, patToken);
            return;
          }
        } catch { /* detectiefout overgeslagen */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      foutEl.textContent = `Camera niet beschikbaar: ${e.message}`;
      foutEl.style.display = 'block';
      container.style.display = 'none';
      setCameraVoorkeur(false);
    }
  }

  function stopCamera() {
    cameraActief = false;
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    const container = document.getElementById('camera-container');
    if (container) container.style.display = 'none';
    const btn = document.getElementById('btn-camera');
    if (btn) { btn.textContent = 'Camera aan'; btn.className = 'btn btn-sm btn-ghost'; }
    setCameraVoorkeur(false);
  }

  document.getElementById('btn-camera').addEventListener('click', () => {
    if (cameraActief) stopCamera(); else startCamera();
  });

  // Auto-start camera als voorkeur gezet
  if (gebruiksCamera) startCamera();

  // ── Handmatige invoer ─────────────────────────────────────────────

  document.getElementById('btn-wissel-station').addEventListener('click', () => {
    stopCamera();
    delPref(STATION_KEY);
    schermStationKeuze({});
  });

  let scanBuffer = '';
  let scanTimer  = null;
  const patInput = document.getElementById('patrouille-input');
  if (patInput) {
    patInput.addEventListener('input', () => {
      clearTimeout(scanTimer);
      scanBuffer = patInput.value;
      scanTimer = setTimeout(async () => {
        if (!scanBuffer.trim()) return;
        const patToken = extractToken(scanBuffer, 'patrouille') || scanBuffer.trim();
        patInput.value = '';
        await schermScan(stationToken, patToken);
      }, 150);
    });
  }
}

// ── Scherm: laden (scan verwerken) ────────────────────────────────

async function schermScan(stationToken, patrouilleToken) {
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-laden">
        <div class="loading-spinner"></div>
        <p class="text-muted" style="font-size:.85rem">Patrouille ophalen…</p>
      </div>
    </div>
  `;

  try {
    const data = await apiPost('/api/rally/scan', {
      station_token:    stationToken,
      patrouille_token: patrouilleToken,
    });
    schermScoreFormulier(stationToken, data);
  } catch (e) {
    root().innerHTML = `
      <div class="rally-page">
        <div class="rally-content">
          <div class="alert alert-error">${esc(e.message)}</div>
          <button class="btn btn-ghost w-full" id="btn-terug">&#8592; Terug naar wachten</button>
        </div>
      </div>
    `;
    document.getElementById('btn-terug').addEventListener('click', () => valideerEnToonWachten(stationToken));
  }
}

// ── Scherm: score formulier ────────────────────────────────────────

function schermScoreFormulier(stationToken, scanData) {
  const { patrouille, station, scoreFormData, bezoek_status } = scanData;
  const isNieuw = bezoek_status === 'aangekomen';

  root().innerHTML = `
    <div class="rally-page">

      <!-- Sticky header: station + patrouille nummer -->
      <div class="rally-station-bar">
        <div class="rally-station-info">
          <div class="rally-station-naam">${esc(station.naam)}</div>
          <div class="rally-station-sub">${esc(station.categorie_naam || '—')}</div>
        </div>
        <div class="rally-patrouille-badge">
          <div class="rally-patrouille-nummer">#${patrouille.nummer ?? '?'}</div>
          <div class="rally-patrouille-label">Patrouille</div>
        </div>
      </div>

      <form id="score-form">
        <div class="jury-cards" id="rally-score-cards">

          ${!isNieuw ? `
            <div class="alert alert-info" style="margin:0">
              &#9888;&#65039; Al eerder gescand &mdash; scores worden bijgewerkt.
            </div>
          ` : ''}

          ${buildScoreVelden(scoreFormData)}

          <div id="score-fout" class="alert alert-error" style="display:none"></div>

        </div>

        <!-- Sticky actie balk -->
        <div class="rally-acties">
          <button type="submit" class="btn btn-primary w-full" id="btn-opslaan">
            &#128190; Opslaan
          </button>
        </div>
      </form>

    </div>
  `;

  // Accordeon voor subcategorie kaarten
  document.querySelectorAll('#rally-score-cards .subcategorie-header').forEach(hdr => {
    hdr.addEventListener('click', () => hdr.closest('.subcategorie-card').classList.toggle('open'));
  });

  // Binary knop toggle
  document.querySelectorAll('#rally-score-cards .binary-knoppen').forEach(groep => {
    groep.querySelectorAll('.binary-knop').forEach(btn => {
      btn.addEventListener('click', () => {
        groep.querySelectorAll('.binary-knop').forEach(b => b.classList.remove('actief'));
        btn.classList.add('actief');
      });
    });
  });

  // Score switch toggle
  document.querySelectorAll('#rally-score-cards .score-switches').forEach(groep => {
    groep.querySelectorAll('.score-switch').forEach(btn => {
      btn.addEventListener('click', () => {
        groep.querySelectorAll('.score-switch').forEach(b => b.classList.remove('actief'));
        btn.classList.add('actief');
      });
    });
  });

  // Counter knopen
  document.querySelectorAll('#rally-score-cards .score-counter').forEach(counter => {
    counter.querySelectorAll('.counter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const waarde = counter.querySelector('.counter-waarde');
        const min    = Number(counter.dataset.min ?? 0);
        const max    = Number(counter.dataset.max ?? 99);
        const nieuw  = btn.dataset.actie === 'min'
          ? Math.max(min, Number(waarde.textContent) - 1)
          : Math.min(max, Number(waarde.textContent) + 1);
        waarde.textContent = nieuw;
        counter.querySelector('[data-actie="min"]').disabled = nieuw <= min;
        counter.querySelector('[data-actie="plus"]').disabled = nieuw >= max;
      });
    });
  });

  document.getElementById('score-form').addEventListener('submit', async e => {
    e.preventDefault();
    await slaScoresOp(stationToken, patrouille.id, scoreFormData);
  });
}

function buildScoreVelden(scoreFormData) {
  if (!scoreFormData?.length) {
    return '<p class="text-muted" style="padding:16px;font-size:.85rem">Geen scoreformulier ingesteld voor dit station.</p>';
  }

  // Groepeer criteria per subcategorie
  const groepen = [];
  let huidigeSub = null;
  let huidigeLijst = null;
  for (const veld of scoreFormData) {
    if (veld.subcategorie !== huidigeSub) {
      huidigeSub  = veld.subcategorie;
      huidigeLijst = [];
      groepen.push({ naam: huidigeSub, criteria: huidigeLijst });
    }
    huidigeLijst.push(veld);
  }

  return groepen.map(groep => `
    <div class="subcategorie-card open">
      <div class="subcategorie-header">
        <span class="subcategorie-titel">${esc(groep.naam)}</span>
        <span class="subcategorie-chevron">&#9660;</span>
      </div>
      <div class="subcategorie-inhoud">
        ${groep.criteria.map(veld => buildCriteriumRij(veld)).join('')}
      </div>
    </div>
  `).join('');
}

function buildCriteriumRij(veld) {
  const huidige = veld.huidige_score ?? '';
  return `
    <div class="criterium-row">
      <div class="criterium-tekst">
        <div class="criterium-naam">${esc(veld.naam)}</div>
        ${veld.omschrijving ? `<div class="criterium-omschrijving">${esc(veld.omschrijving)}</div>` : ''}
      </div>
      <div class="criterium-widget">${buildScoreWidget(veld, huidige)}</div>
    </div>
  `;
}

function buildScoreWidget(veld, huidige) {
  const max = Number(veld.max_score ?? 10);
  const min = Number(veld.min_score ?? 0);

  if (veld.invoer_type === 'checkbox') {
    const isGoed = huidige !== '' && huidige !== null && Number(huidige) > 0;
    const isFout = !isGoed && huidige !== '' && huidige !== null;
    return `
      <div class="binary-knoppen">
        <button type="button" class="binary-knop goed ${isGoed ? 'actief' : ''}"
          data-id="${veld.id}" data-waarde="${max}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,8 6,12 14,4"/>
          </svg>
        </button>
        <button type="button" class="binary-knop afgekeurd ${isFout ? 'actief' : ''}"
          data-id="${veld.id}" data-waarde="0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round">
            <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
          </svg>
        </button>
      </div>
    `;
  }

  if (veld.invoer_type === 'tijdmeting') {
    const mmss = huidige !== '' ? secsNaarMmss(Number(huidige)) : '';
    return `
      <input class="score-input" type="text" data-id="${veld.id}" data-invoer-type="tijdmeting"
        inputmode="numeric" value="${mmss}" placeholder="m:ss" style="width:72px;font-size:.95rem;letter-spacing:1px">
    `;
  }

  if (max - min <= 3) {
    const knoppen = [];
    for (let i = min; i <= max; i++) {
      const actief = huidige !== '' && Number(huidige) === i;
      knoppen.push(`<button type="button" class="score-switch ${actief ? 'actief' : ''}"
        data-id="${veld.id}" data-waarde="${i}">${i}</button>`);
    }
    return `<div class="score-switches">${knoppen.join('')}</div>`;
  }

  if (max - min <= 8) {
    const val = huidige !== '' ? Number(huidige) : min;
    return `
      <div class="score-counter" data-id="${veld.id}" data-min="${min}" data-max="${max}">
        <button type="button" class="counter-btn" data-actie="min" ${val <= min ? 'disabled' : ''}>&#8722;</button>
        <span class="counter-waarde">${val}</span>
        <button type="button" class="counter-btn" data-actie="plus" ${val >= max ? 'disabled' : ''}>+</button>
      </div>
    `;
  }

  return `
    <input class="score-input" type="number" data-id="${veld.id}"
      min="${min}" max="${max}" value="${huidige !== '' ? huidige : ''}" placeholder="0–${max}">
  `;
}

async function slaScoresOp(stationToken, patrouilleId, scoreFormData) {
  const btn    = document.getElementById('btn-opslaan');
  const foutEl = document.getElementById('score-fout');
  btn.disabled = true;
  foutEl.style.display = 'none';

  const scores = (scoreFormData || []).map(veld => {
    let score;

    if (veld.invoer_type === 'checkbox') {
      const actief = document.querySelector(`.binary-knop.actief[data-id="${veld.id}"]`);
      if (!actief) return null;
      score = Number(actief.dataset.waarde);

    } else if (veld.invoer_type === 'tijdmeting') {
      const inp = document.querySelector(`.score-input[data-id="${veld.id}"][data-invoer-type="tijdmeting"]`);
      if (!inp) return null;
      score = mmssNaarSecs(inp.value.trim());
      if (score === null) return null;

    } else {
      // Score switch (actieve knop)
      const actief = document.querySelector(`.score-switch.actief[data-id="${veld.id}"]`);
      if (actief) {
        score = Number(actief.dataset.waarde);
      } else {
        // Counter
        const counter = document.querySelector(`.score-counter[data-id="${veld.id}"]`);
        if (counter) {
          score = Number(counter.querySelector('.counter-waarde').textContent);
        } else {
          // Getal invoer
          const inp = document.querySelector(`.score-input[data-id="${veld.id}"]`);
          if (!inp || inp.value === '') return null;
          score = Number(inp.value);
        }
      }
    }

    if (score === null || score === undefined || isNaN(score)) return null;
    return { criterium_id: veld.id, score };
  }).filter(Boolean);

  try {
    await apiPost('/api/rally/score', { station_token: stationToken, patrouille_id: patrouilleId, scores });
    await valideerEnToonWachten(stationToken);
  } catch (e) {
    foutEl.textContent = e.message;
    foutEl.style.display = 'block';
    btn.disabled = false;
  }
}

// ── API helpers ────────────────────────────────────────────────────

async function apiGet(url) {
  const res  = await fetch(BASE + url);
  const json = await res.json().catch(() => ({ message: 'Serverfout' }));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

async function apiPost(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ message: 'Serverfout' }));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

function extractToken(input, param) {
  try {
    const u = new URL(input.includes('://') ? input : `https://x.x${input.startsWith('/') ? '' : '/'}${input}`);
    return u.searchParams.get(param) || null;
  } catch { return null; }
}

function toonFout(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
  else      { el.style.display = 'none'; }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "1:23" → 83 (seconds). Returns null if unparseable. */
function mmssNaarSecs(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d+):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** 83 → "1:23" */
function secsNaarMmss(secs) {
  if (secs == null || isNaN(secs)) return '';
  const s = Math.round(Math.abs(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Start ──────────────────────────────────────────────────────────
init().catch(e => {
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-content">
        <div class="alert alert-error">Fout bij laden: ${esc(e.message)}</div>
      </div>
    </div>`;
});
