// public/js/rally.js — Rally scan pagina (standalone, geen header/sidebar)
//
// Flow (geen interne camera — QR-codes worden gescand met de camera-app van het apparaat):
//
//  Jury:
//   1. Scan station-QR → /rally?station=TOKEN
//      → server maakt httpOnly sessie-cookie (1 uur geldig)
//      → station-landingspagina met lijst van patrouilles op post
//   2. Scan patrouille-QR → /rally?patrouille=TOKEN (met geldige sessie-cookie)
//      → patrouille aangemeld als 'op post'
//      → direct naar scoreformulier
//   3. Scoreformulier: 'Opslaan' of 'Vertrokken' knop
//
//  Patrouille (zelf-scan zonder sessie-cookie):
//   /rally?patrouille=TOKEN → info over huidige post + volgende post + resterende tijd

import { BASE_PATH } from './config.js';

const BASE = BASE_PATH;
const root = () => document.getElementById('rally-root');

let pollingTimer = null;

// ── Init ────────────────────────────────────────────────────────────

async function init() {
  const params          = new URLSearchParams(location.search);
  const stationToken    = params.get('station');
  const patrouilleToken = params.get('patrouille');

  // Schone URL — verwijder tokens uit de adresbalk
  if (stationToken || patrouilleToken) {
    history.replaceState({}, '', location.pathname);
  }

  if (stationToken) {
    toonLaden('Station verbinden…');
    try {
      const data = await apiGet(`/api/rally/station-scan/${encodeURIComponent(stationToken)}`);
      toonStationLanding(data);
    } catch (e) {
      toonFoutPagina(e.message);
    }

  } else if (patrouilleToken) {
    toonLaden('Patrouille ophalen…');
    try {
      const data = await apiPost('/api/rally/patrouille-aankomst', { patrouille_token: patrouilleToken });
      if (data.is_start_positie) {
        toonTochtGestart(data);
      } else {
        toonPatrouilleDetail(data);
      }
    } catch (e) {
      if (e.status === 401) {
        // Geen station-sessie → zelf-scan info tonen
        try {
          const info = await apiGet(`/api/rally/patrouille-info/${encodeURIComponent(patrouilleToken)}`);
          toonPatrouilleInfo(info);
        } catch (e2) {
          toonFoutPagina(e2.message);
        }
      } else if (e.status === 409) {
        // Al vertrokken
        toonFoutPagina(e.message, true);
      } else {
        toonFoutPagina(e.message);
      }
    }

  } else {
    // Geen params → probeer bestaande sessie te herstellen
    toonLaden('Sessie controleren…');
    try {
      const data = await apiGet('/api/rally/sessie');
      toonStationLanding(data);
    } catch (e) {
      if (e.status === 401) {
        toonGeenSessie();
      } else {
        toonFoutPagina(e.message);
      }
    }
  }
}

// ── View: laden ─────────────────────────────────────────────────────

function toonLaden(tekst = 'Laden…') {
  stopPolling();
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-laden">
        <div class="loading-spinner"></div>
        <p class="text-muted" style="font-size:.85rem">${esc(tekst)}</p>
      </div>
    </div>
  `;
}

// ── View: geen sessie ────────────────────────────────────────────────

function toonGeenSessie() {
  stopPolling();
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-content" style="text-align:center;padding:48px 16px">
        <div style="font-size:3rem;margin-bottom:16px">&#128204;</div>
        <h2 style="margin-bottom:8px">Geen station geselecteerd</h2>
        <p class="text-muted" style="margin-bottom:0">
          Scan de QR-code van een station om te beginnen.
        </p>
      </div>
    </div>
  `;
}

// ── View: tocht gestart (startpost-scan door jury) ──────────────────

function toonTochtGestart(data) {
  stopPolling();
  const { patrouille, station, start_tijd, eind_tijd_patrouille } = data;

  const startStr = start_tijd
    ? new Date(start_tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const eindStr = eind_tijd_patrouille
    ? new Date(eind_tijd_patrouille).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null;

  root().innerHTML = `
    <div class="rally-page">

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

      <div class="rally-content" style="text-align:center;padding:32px 16px">

        <div style="font-size:3.5rem;margin-bottom:16px">&#127939;</div>
        <div style="font-size:1.3rem;font-weight:700;margin-bottom:8px">Tocht gestart!</div>
        <p class="text-muted" style="font-size:.9rem;margin-bottom:24px">
          Patrouille #${patrouille.nummer ?? '?'} mag nu vertrekken.
        </p>

        <div class="rally-start-tijden">
          <div class="rally-start-tijdrij">
            <span class="rally-info-label">&#128336; Starttijd</span>
            <span class="rally-info-waarde">${startStr}</span>
          </div>
          ${eindStr ? `
          <div class="rally-start-tijdrij accent">
            <span class="rally-info-label">&#9201;&#65039; Eindtijd</span>
            <span class="rally-info-waarde">${eindStr}</span>
          </div>` : ''}
        </div>

        <button class="btn btn-primary w-full" style="margin-top:28px" id="btn-volgende">
          &#8594; Volgende patrouille
        </button>

      </div>
    </div>
  `;

  document.getElementById('btn-volgende').addEventListener('click', async () => {
    toonLaden();
    try {
      const sessieData = await apiGet('/api/rally/sessie');
      toonStationLanding(sessieData);
    } catch {
      toonGeenSessie();
    }
  });
}

// ── View: foutpagina ────────────────────────────────────────────────

function toonFoutPagina(bericht, metTerugKnop = false) {
  stopPolling();
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-content">
        <div class="alert alert-error" style="margin-top:24px">${esc(bericht)}</div>
        ${metTerugKnop ? `
          <button class="btn btn-ghost w-full" style="margin-top:12px" id="btn-naar-station">
            &#8592; Terug naar station
          </button>
        ` : ''}
      </div>
    </div>
  `;
  if (metTerugKnop) {
    document.getElementById('btn-naar-station').addEventListener('click', async () => {
      toonLaden();
      try {
        const data = await apiGet('/api/rally/sessie');
        toonStationLanding(data);
      } catch {
        toonGeenSessie();
      }
    });
  }
}

// ── View: station-landingspagina ────────────────────────────────────

function toonStationLanding(data, highlight = null) {
  stopPolling();
  const { station, moment, categorie_naam, verlopen_op, patrouilles = [] } = data;

  const verlopen = verlopen_op ? new Date(verlopen_op) : null;

  root().innerHTML = `
    <div class="rally-page">

      <!-- Header balk -->
      <div class="rally-station-bar">
        <div class="rally-station-info">
          <div class="rally-station-naam">${esc(station.naam)}</div>
          <div class="rally-station-sub">${esc(categorie_naam || moment.naam || '—')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          ${verlopen ? `<div class="rally-sessie-badge" id="sessie-timer" title="Sessie verloopt om ${verlopen.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}">&#128338; <span id="sessie-tijd"></span></div>` : ''}
          <button class="btn btn-sm" id="btn-wissel-station"
            style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3)">
            &#8635; Wissel
          </button>
        </div>
      </div>

      <div class="rally-content">

        <!-- Patrouilles op post -->
        <div class="rally-sectie-header">
          <span>&#128203; Patrouilles op post</span>
          <span id="patrouille-count" class="rally-badge">${patrouilles.length}</span>
        </div>
        <div id="patrouilles-lijst">
          ${bouwPatrouilleLijst(patrouilles, highlight)}
        </div>

        <!-- Instructie -->
        <div class="rally-instructie">
          <div class="rally-instructie-icon">&#128247;</div>
          <p>Scan een patrouille-QR met je camera-app om ze bij dit station te registreren.</p>
        </div>

      </div>
    </div>
  `;

  // Sessie-timer bijwerken
  if (verlopen) {
    function updateTimer() {
      const el = document.getElementById('sessie-tijd');
      if (!el) return;
      const resterendSec = Math.max(0, Math.round((verlopen - Date.now()) / 1000));
      const m = Math.floor(resterendSec / 60);
      const s = resterendSec % 60;
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (resterendSec === 0) {
        stopPolling();
        toonFoutPagina('Sessie verlopen — scan opnieuw een station-QR');
      }
    }
    updateTimer();
    setInterval(updateTimer, 1000);
  }

  // Klikken op patrouille uit de lijst
  document.getElementById('patrouilles-lijst').addEventListener('click', async e => {
    const btn = e.target.closest('[data-patrouille-id]');
    if (!btn) return;
    const patId     = Number(btn.dataset.patrouilleId);
    const bezoekId  = Number(btn.dataset.bezoekId);
    await openPatrouilleVanuitLijst(patId, bezoekId);
  });

  // Wissel station
  document.getElementById('btn-wissel-station').addEventListener('click', async () => {
    await apiPost('/api/rally/sessie-verlaten', {}).catch(() => {});
    toonGeenSessie();
  });

  // Polling elke 5 seconden
  startPolling(moment.id, station.id, moment.editie_id);
}

function bouwPatrouilleLijst(patrouilles, highlight) {
  if (!patrouilles.length) {
    return `<p class="text-muted text-sm" style="padding:12px 0;text-align:center">
      Nog geen patrouilles op post.
    </p>`;
  }
  return patrouilles.map(p => `
    <button class="rally-patrouille-rij ${highlight === p.patrouille_id ? 'highlight' : ''}"
      data-patrouille-id="${p.patrouille_id}"
      data-bezoek-id="${p.bezoek_id}">
      <div class="rally-patrouille-rij-nummer">#${p.nummer ?? '?'}</div>
      <div class="rally-patrouille-rij-info">
        <div class="rally-patrouille-rij-naam">Patrouille ${p.nummer ?? p.patrouille_id}</div>
        <div class="text-muted" style="font-size:.78rem">
          Aankomst: ${tijdStr(p.aankomst_tijd)}
        </div>
      </div>
      <div class="rally-patrouille-rij-pijl">&#8250;</div>
    </button>
  `).join('');
}

// ── Polling ─────────────────────────────────────────────────────────

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(async () => {
    try {
      const { patrouilles } = await apiGet('/api/rally/sessie-patrouilles');
      const lijst = document.getElementById('patrouilles-lijst');
      const count = document.getElementById('patrouille-count');
      if (lijst) lijst.innerHTML = bouwPatrouilleLijst(patrouilles, null);
      if (count) count.textContent = patrouilles.length;
    } catch (e) {
      if (e.status === 401) {
        stopPolling();
        toonFoutPagina('Sessie verlopen — scan opnieuw een station-QR');
      }
    }
  }, 5000);
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

// ── Patrouille openen vanuit de lijst ───────────────────────────────

async function openPatrouilleVanuitLijst(patrouilleId, bezoekId) {
  toonLaden('Patrouille ophalen…');
  await toonFormulierVanuitSessie(patrouilleId, bezoekId);
}

// Formulier tonen voor een bestaande patrouille op post (vanuit de lijst)
async function toonFormulierVanuitSessie(patrouilleId, bezoekId) {
  try {
    const data = await apiPost('/api/rally/bezoek-formulier', {
      bezoek_id:     bezoekId,
      patrouille_id: patrouilleId,
    });
    toonPatrouilleDetail(data);
  } catch (e) {
    toonFoutPagina(e.message, true);
  }
}

// ── View: patrouille detail (scoreformulier) ─────────────────────────

function toonPatrouilleDetail(scanData) {
  stopPolling();
  const { bezoek_id, patrouille, station, scoreFormData, al_aanwezig, aankomst_punten } = scanData;

  root().innerHTML = `
    <div class="rally-page">

      <!-- Header: station + patrouille nummer -->
      <div class="rally-station-bar">
        <div class="rally-station-info">
          <div class="rally-station-naam">${esc(station.naam)}</div>
          <div class="rally-station-sub">${esc(station.categorie_naam || '—')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div class="rally-patrouille-badge">
            <div class="rally-patrouille-nummer">#${patrouille.nummer ?? '?'}</div>
            <div class="rally-patrouille-label">Patrouille</div>
          </div>
          <button class="btn btn-sm" id="btn-terug-naar-lijst"
            style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3)">
            &#8592; Lijst
          </button>
        </div>
      </div>

      <form id="score-form">
        <div class="jury-cards" id="rally-score-cards">

          ${al_aanwezig ? `
            <div class="alert alert-info" style="margin:0">
              &#8505;&#65039; Al eerder gescand &mdash; scores worden bijgewerkt.
            </div>
          ` : ''}

          ${aankomst_punten > 0 ? `
            <div class="alert alert-success" style="margin:0">
              &#127942; Aankomstpunten: <strong>${aankomst_punten}</strong>
            </div>
          ` : ''}

          ${buildScoreVelden(scoreFormData)}

          <div id="score-fout" class="alert alert-error" style="display:none"></div>

        </div>

        <!-- Actie knoppen -->
        <div class="rally-acties">
          <button type="button" class="btn btn-ghost" id="btn-opslaan" style="flex:1">
            &#128190; Opslaan
          </button>
          <button type="button" class="btn btn-primary" id="btn-vertrokken" style="flex:1">
            &#128682; Vertrokken
          </button>
        </div>
      </form>

    </div>
  `;

  // Accordeon
  document.querySelectorAll('#rally-score-cards .subcategorie-header').forEach(hdr => {
    hdr.addEventListener('click', () => hdr.closest('.subcategorie-card').classList.toggle('open'));
  });

  // Binary knoppen (checkbox)
  document.querySelectorAll('#rally-score-cards .binary-knoppen').forEach(groep => {
    groep.querySelectorAll('.binary-knop').forEach(btn => {
      btn.addEventListener('click', () => {
        groep.querySelectorAll('.binary-knop').forEach(b => b.classList.remove('actief'));
        btn.classList.add('actief');
      });
    });
  });

  // Score switches
  document.querySelectorAll('#rally-score-cards .score-switches').forEach(groep => {
    groep.querySelectorAll('.score-switch').forEach(btn => {
      btn.addEventListener('click', () => {
        groep.querySelectorAll('.score-switch').forEach(b => b.classList.remove('actief'));
        btn.classList.add('actief');
      });
    });
  });

  // Counter knoppen
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

  document.getElementById('btn-terug-naar-lijst').addEventListener('click', async () => {
    toonLaden();
    try {
      const data = await apiGet('/api/rally/sessie');
      toonStationLanding(data);
    } catch {
      toonGeenSessie();
    }
  });

  document.getElementById('btn-opslaan').addEventListener('click', async () => {
    await slaScoresOp({ bezoek_id, patrouilleId: patrouille.id, scoreFormData, vertrekken: false });
  });

  document.getElementById('btn-vertrokken').addEventListener('click', async () => {
    await slaScoresOp({ bezoek_id, patrouilleId: patrouille.id, scoreFormData, vertrekken: true });
  });
}

// ── Scores opslaan ───────────────────────────────────────────────────

async function slaScoresOp({ bezoek_id, patrouilleId, scoreFormData, vertrekken }) {
  const opslaanBtn   = document.getElementById('btn-opslaan');
  const vertrekBtn   = document.getElementById('btn-vertrokken');
  const foutEl       = document.getElementById('score-fout');

  if (opslaanBtn)  opslaanBtn.disabled  = true;
  if (vertrekBtn) vertrekBtn.disabled = true;
  if (foutEl) foutEl.style.display = 'none';

  const scores = verzamelScores(scoreFormData);

  try {
    if (vertrekken) {
      await apiPost('/api/rally/patrouille-vertrek', {
        bezoek_id,
        patrouille_id: patrouilleId,
        scores,
      });
      // Terug naar landing + highlight de patrouille even niet (is weg)
      const data = await apiGet('/api/rally/sessie');
      toonStationLanding(data);
    } else {
      await apiPost('/api/rally/sessie-score', {
        patrouille_id: patrouilleId,
        scores,
      });
      // Succesmelding tonen, knoppen re-enablen
      if (foutEl) {
        foutEl.className = 'alert alert-success';
        foutEl.textContent = '\u2713 Opgeslagen';
        foutEl.style.display = 'block';
        setTimeout(() => { if (foutEl) foutEl.style.display = 'none'; }, 2000);
      }
    }
  } catch (e) {
    if (foutEl) {
      foutEl.className = 'alert alert-error';
      foutEl.textContent = e.message;
      foutEl.style.display = 'block';
    }
  } finally {
    if (opslaanBtn)  opslaanBtn.disabled  = false;
    if (vertrekBtn) vertrekBtn.disabled = false;
  }
}

function verzamelScores(scoreFormData) {
  return (scoreFormData || []).map(veld => {
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
      const actief = document.querySelector(`.score-switch.actief[data-id="${veld.id}"]`);
      if (actief) {
        score = Number(actief.dataset.waarde);
      } else {
        const counter = document.querySelector(`.score-counter[data-id="${veld.id}"]`);
        if (counter) {
          score = Number(counter.querySelector('.counter-waarde').textContent);
        } else {
          const inp = document.querySelector(`.score-input[data-id="${veld.id}"]`);
          if (!inp || inp.value === '') return null;
          score = Number(inp.value);
        }
      }
    }

    if (score === null || score === undefined || isNaN(score)) return null;
    return { criterium_id: veld.id, score };
  }).filter(Boolean);
}

// ── View: patrouille-info (zelf-scan) ───────────────────────────────

function toonPatrouilleInfo(info) {
  stopPolling();
  const {
    patrouille, huidig_post, laatste_vertrek_post, volgende_post,
    start_tijd, eind_tijd, tijd_resterend_sec, tijd_verstreken,
  } = info;
  const nummer = patrouille?.nummer ?? '?';

  // Timer blok
  let tijdBlok = '';
  if (tijd_verstreken) {
    tijdBlok = `<div class="alert alert-error" style="margin-top:16px">&#9203; Jullie tijd is verstreken.</div>`;
  } else if (tijd_resterend_sec != null) {
    const m = Math.floor(tijd_resterend_sec / 60);
    const s = tijd_resterend_sec % 60;
    const eindStr = eind_tijd
      ? new Date(eind_tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : null;
    tijdBlok = `
      <div class="rally-timer-blok">
        <div class="rally-timer-label">Tijd resterend</div>
        <div class="rally-timer-waarde" id="pat-timer">${m}:${String(s).padStart(2,'0')}</div>
        ${eindStr ? `<div class="rally-timer-label" style="margin-top:4px">eindig om ${eindStr}</div>` : ''}
      </div>
    `;
  }

  // Status bericht
  let statusBericht = '';
  if (huidig_post) {
    statusBericht = `<p class="text-muted" style="font-size:.9rem;margin-top:8px">Wacht op afmelding van de jury.</p>`;
  } else if (volgende_post) {
    statusBericht = `<p class="text-muted" style="font-size:.9rem;margin-top:8px">Ga naar de volgende post en wacht op de jury.</p>`;
  } else if (laatste_vertrek_post) {
    statusBericht = `<p class="text-muted" style="font-size:.9rem;margin-top:8px">Jullie tocht loopt nog.</p>`;
  }

  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-content" style="padding:24px 16px;text-align:center">

        <div class="rally-patrouille-badge" style="margin:0 auto 20px;display:inline-flex">
          <div class="rally-patrouille-nummer">#${esc(String(nummer))}</div>
          <div class="rally-patrouille-label">Patrouille</div>
        </div>

        ${huidig_post ? `
          <div class="rally-info-rij">
            <span class="rally-info-label">&#128205; Huidige post</span>
            <span class="rally-info-waarde">${esc(huidig_post)}</span>
          </div>
        ` : ''}

        ${laatste_vertrek_post && !huidig_post ? `
          <div class="rally-info-rij">
            <span class="rally-info-label">&#10003; Laatste post</span>
            <span class="rally-info-waarde">${esc(laatste_vertrek_post)}</span>
          </div>
        ` : ''}

        ${volgende_post ? `
          <div class="rally-info-rij accent">
            <span class="rally-info-label">&#8594; Volgende post</span>
            <span class="rally-info-waarde">${esc(volgende_post)}</span>
          </div>
        ` : ''}

        ${statusBericht}

        ${tijdBlok}

      </div>
    </div>
  `;

  // Live countdown
  if (tijd_resterend_sec != null && !tijd_verstreken) {
    let sec = tijd_resterend_sec;
    const timerInterval = setInterval(() => {
      sec = Math.max(0, sec - 1);
      const el = document.getElementById('pat-timer');
      if (!el) { clearInterval(timerInterval); return; }
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.textContent = `${m}:${String(s).padStart(2,'0')}`;
      if (sec === 0) {
        clearInterval(timerInterval);
        // Toon verlopen melding
        const timerBlok = el.closest('.rally-timer-blok');
        if (timerBlok) {
          timerBlok.outerHTML = `<div class="alert alert-error" style="margin-top:16px">&#9203; Jullie tijd is verstreken.</div>`;
        }
      }
    }, 1000);
  }
}

// ── Score formulier bouwen ───────────────────────────────────────────

function buildScoreVelden(scoreFormData) {
  if (!scoreFormData?.length) {
    return '<p class="text-muted" style="padding:16px;font-size:.85rem">Geen scoreformulier ingesteld voor dit station.</p>';
  }

  const groepen = [];
  let huidigeSub  = null;
  let huidigeLijst = null;
  for (const veld of scoreFormData) {
    if (veld.subcategorie !== huidigeSub) {
      huidigeSub   = veld.subcategorie;
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
        ${groep.criteria.map(buildCriteriumRij).join('')}
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
        inputmode="numeric" value="${mmss}" placeholder="m:ss"
        style="width:72px;font-size:.95rem;letter-spacing:1px">
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

// ── API helpers ──────────────────────────────────────────────────────

async function apiGet(url) {
  const res  = await fetch(BASE + url, { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({ message: 'Serverfout' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function apiPost(url, body) {
  const res = await fetch(BASE + url, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ message: 'Serverfout' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ── Hulpfuncties ─────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tijdStr(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function mmssNaarSecs(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d+):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function secsNaarMmss(secs) {
  if (secs == null || isNaN(secs)) return '';
  const s = Math.round(Math.abs(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Start ────────────────────────────────────────────────────────────
init().catch(e => {
  root().innerHTML = `
    <div class="rally-page">
      <div class="rally-content">
        <div class="alert alert-error" style="margin-top:24px">
          Fout bij laden: ${esc(e.message)}
        </div>
      </div>
    </div>`;
});
