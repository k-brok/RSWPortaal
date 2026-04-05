// home.js — Landing / dashboard pagina
// Zichtbaar voor iedereen; toont role-specifieke cards voor ingelogde gebruikers.

import { isLoggedIn, getUser, hasRole } from '../services/auth.js';
import { getActieveEditie, getTop10, getProgramma, getVacatures } from '../services/api.js';
import { formatTijd } from '../utils/datum.js';

// Wordt bijgehouden zodat onDestroy() de interval kan stoppen
let refreshInterval = null;

export async function render() {
  const content = document.getElementById('content');
  // Skeleton tonen terwijl data geladen wordt
  content.innerHTML = buildSkeleton();

  const [editie, user, loggedIn] = [await getActieveEditie(), getUser(), isLoggedIn()];

  let top10 = [];
  let programma = [];
  let vacatures = [];

  if (editie) {
    [top10, programma, vacatures] = await Promise.all([
      getTop10(editie.id),
      getProgramma(editie.id),
      getVacatures(),
    ]);
  }

  content.innerHTML = buildPage(editie, top10, programma, vacatures, user, loggedIn);
}

export function onMount() {
  // Snelle acties inklapbaar op mobiel
  const toggle = document.getElementById('snelle-acties-toggle');
  const items  = document.getElementById('snelle-acties-items');
  if (toggle && items) {
    toggle.addEventListener('click', () => {
      if (window.innerWidth > 768) return; // alleen op mobiel
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      toggle.querySelector('.snelle-acties-chevron')?.classList.toggle('collapsed', isOpen);
      items.classList.toggle('hidden', isOpen);
    });
  }

  // Programma dag-headers inklapbaar
  document.querySelectorAll('.prog-dag-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const dagEl   = document.getElementById(btn.dataset.dag);
      const chevron = btn.querySelector('.nav-group-chevron');
      const isOpen  = dagEl.style.display !== 'none';
      dagEl.style.display = isOpen ? 'none' : 'flex';
      dagEl.style.flexDirection = 'column';
      chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
    });
  });

  // Ververs top 10 elke 60 seconden als uitslagen gepubliceerd zijn
  refreshInterval = setInterval(async () => {
    const editie = await getActieveEditie();
    if (!editie?.uitslagen_gepubliceerd) return;
    const top10 = await getTop10(editie.id);
    const lijst = document.getElementById('top10-lijst');
    if (lijst) lijst.innerHTML = buildTop10Rows(top10);
  }, 60_000);
}

export function onDestroy() {
  clearInterval(refreshInterval);
  refreshInterval = null;
}

// ── Pagina opbouw ─────────────────────────────────────────────────

function buildPage(editie, top10, programma, vacatures, user, loggedIn) {
  return `
    ${buildHero(editie, loggedIn)}
    ${loggedIn ? buildSnelleActies(user) : ''}

    <div class="dashboard-grid">
      ${buildTop10Card(top10, editie)}
      ${buildProgrammaCard(programma, editie)}
      ${buildInfoCard()}
      ${vacatures.length ? buildVacaturesCard(vacatures, loggedIn) : ''}
      ${loggedIn ? buildRolCards(user) : ''}
    </div>
  `;
}

// ── Hulpfunctie fase ──────────────────────────────────────────────

function bepaalFase(editie) {
  if (!editie) return 'gesloten';
  const v = new Date().toISOString().slice(0, 10);
  const viStart = editie.voorinschrijving_start, viSluit = editie.voorinschrijving_sluit;
  if (viStart && viStart <= v && (!viSluit || viSluit >= v)) return 'voorinschrijving';
  const iStart = editie.inschrijving_start, iSluit = editie.inschrijving_sluit;
  if (iStart && iStart <= v && (!iSluit || iSluit >= v)) return 'inschrijving';
  return 'gesloten';
}

// ── Hero banner ───────────────────────────────────────────────────

function buildHero(editie, loggedIn) {
  const titel = editie
    ? `RSW ${editie.naam ?? editie.jaar}`
    : 'Regionale Scouting Wedstrijden';

  const datum = editie?.datum
    ? new Date(editie.datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const locatie = editie?.locatie ?? null;

  const editieNaam = editie ? escapeHtml(editie.naam ?? String(editie.jaar)) : null;
  const fase = bepaalFase(editie);

  return `
    <div class="hero mb-24">
      <h1 class="hero-title">
        Welkom op het RSW Portaal
      </h1>
      <p class="hero-subtitle">
        Het portaal voor deelnemers, vrijwilligers, jury en organisatoren van
        de Regionale Scouting Wedstrijden in regio De Langstraat.
      </p>

      ${!loggedIn ? `
        <div class="hero-actions">
          <a href="#/registreren?rol=leiding" class="btn btn-primary">Meld je aan als leiding</a>
          <a href="#/registreren?rol=vrijwilliger" class="btn btn-secondary">Meld je aan als vrijwilliger</a>
          <a href="#/login" class="btn btn-ghost">Inloggen</a>
        </div>
      ` : ''}

      ${datum || locatie || editieNaam ? `
        <div class="hero-meta">
          ${editieNaam ? `<div class="hero-meta-item">&#127937; <strong>Editie: ${editieNaam}</strong></div>` : ''}
          ${datum ? `<div class="hero-meta-item">&#128197; <strong>${datum}</strong></div>` : ''}
          ${locatie ? `<div class="hero-meta-item">&#128205; <strong>${escapeHtml(locatie)}</strong></div>` : ''}
          ${fase === 'inschrijving' ? `<div class="hero-meta-item"><span class="badge badge-success">Inschrijving open</span></div>` : ''}
          ${fase === 'voorinschrijving' ? `<div class="hero-meta-item"><span class="badge badge-info">Voorinschrijving open</span></div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Welkomst card (ingelogd) ──────────────────────────────────────

function buildWelcomeCard(user) {
  const initialen = userInitialen(user.naam);
  const rolLabel = rolNaam(user.rol);
  return `
    <div class="welcome-card mb-24">
      <div class="welcome-avatar">${initialen}</div>
      <div class="welcome-text">
        <h2>Goedendag, ${escapeHtml(user.naam.split(' ')[0])}!</h2>
        <p>Ingelogd als <strong>${rolLabel}</strong>
          ${user.groep ? ` &mdash; ${escapeHtml(user.groep)}` : ''}
        </p>
      </div>
    </div>
  `;
}

// ── Snelle acties (role-based) ────────────────────────────────────

function buildSnelleActies(user) {
  const acties = getActiesVoorRol(user.rol);
  if (!acties.length) return '';

  return `
    <div class="mb-24 snelle-acties-blok">
      <button class="snelle-acties-header" id="snelle-acties-toggle" aria-expanded="true">
        <span class="section-title">&#9889; Snelle acties</span>
        <span class="nav-group-chevron snelle-acties-chevron">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <div class="quick-actions" id="snelle-acties-items">
        ${acties.map(a => `
          <a href="${a.href}" class="quick-action-btn">
            <span class="quick-action-icon">${a.icoon}</span>
            <span class="quick-action-label">${a.label}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function getActiesVoorRol(rol) {
  const map = {
    leiding: [
      { href: '#/inschrijvingen', icoon: '&#128221;', label: 'Inschrijving & eerdere edities' },
      { href: '#/uitslagen',      icoon: '&#127942;', label: 'Uitslagen bekijken' },
    ],
    vrijwilliger: [
      { href: '#/vrijwilliger/inschrijving', icoon: '&#128170;', label: 'Mijn inschrijving' },
      { href: '#/programma',                 icoon: '&#128197;', label: 'Programma' },
    ],
    jury: [
      { href: '#/scoreformulier', icoon: '&#128394;&#65039;', label: 'Scores invoeren' },
      { href: '#/scores',         icoon: '&#128200;',         label: 'Live scores' },
    ],
    spelbegeleider: [
      { href: '#/scoreformulier', icoon: '&#128101;', label: 'Mijn categorie' },
      { href: '#/scores',         icoon: '&#128200;', label: 'Live scoretabel' },
    ],
    organisator: [
      { href: '#/edities',                 icoon: '&#127937;', label: 'Edities' },
      { href: '#/inschrijvingen',          icoon: '&#128203;', label: 'Inschrijvingen' },
      { href: '#/organisator/plattegrond', icoon: '&#128205;', label: 'Plattegrond' },
      { href: '#/scores',                  icoon: '&#128200;', label: 'Scorebeheer' },
    ],
    admin: [
      { href: '#/edities',                 icoon: '&#127937;', label: 'Edities' },
      { href: '#/admin/gebruikers',        icoon: '&#128100;', label: 'Gebruikers' },
      { href: '#/admin/verenigingen',      icoon: '&#127960;&#65039;', label: 'Verenigingen' },
      { href: '#/organisator/categorieen', icoon: '&#127381;', label: 'Categorieën' },
      { href: '#/scores',                  icoon: '&#128200;', label: 'Scorebeheer' },
    ],
  };
  return map[rol] ?? [];
}

// ── Top 10 card (publiek) ─────────────────────────────────────────

function buildTop10Card(top10, editie) {
  const gepubliceerd = editie?.uitslagen_gepubliceerd;

  return `
    <div class="card card-accent-primary">
      <div class="card-header">
        <div class="card-title">
          <span class="card-icon">&#127942;</span>
          Top 10 &mdash; ${editie ? escapeHtml(editie.naam ?? String(editie.jaar)) : 'Actieve editie'}
        </div>
        ${gepubliceerd ? '<span class="badge badge-success">Live</span>' : '<span class="badge badge-muted">Nog niet gepubliceerd</span>'}
      </div>
      <div class="card-body">
        ${gepubliceerd && top10.length
          ? `<div class="ranking-list" id="top10-lijst">${buildTop10Rows(top10)}</div>`
          : buildLegeStaat('&#128200;', gepubliceerd
              ? 'Nog geen scores beschikbaar.'
              : 'De uitslagen zijn nog niet gepubliceerd. Kom later terug!'
            )
        }
      </div>
      ${gepubliceerd ? `
        <div class="card-footer">
          <a href="#/uitslagen" class="btn btn-ghost btn-sm">Volledige uitslag &rarr;</a>
        </div>
      ` : ''}
    </div>
  `;
}

function buildTop10Rows(top10) {
  return top10.slice(0, 10).map((item, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? 'top-1' : pos === 2 ? 'top-2' : pos === 3 ? 'top-3' : '';
    const medaille = pos === 1 ? '&#129945;' : pos === 2 ? '&#129944;' : pos === 3 ? '&#129943;' : '';
    return `
      <div class="ranking-item">
        <div class="ranking-position ${posClass}">${medaille || pos}</div>
        <div>
          <div class="ranking-name">Patrouille ${escapeHtml(String(item.patrouillenummer))}</div>
          <div class="ranking-meta">${escapeHtml(item.groep ?? '')}</div>
        </div>
        <div class="ranking-score">${formatScore(item.eindscore)}%</div>
      </div>
    `;
  }).join('');
}

// ── Programma card (publiek) ──────────────────────────────────────

function buildProgrammaCard(programma, editie) {
  // Samenvatting: max 6 items, alleen RSW-dag items (geen inschrijvingsitems)
  const rswItems = programma.filter(i => i.type !== 'inschrijving').slice(0, 6);
  const totaal   = programma.filter(i => i.type !== 'inschrijving').length;
  const meer     = totaal > 6;

  return `
    <div class="card card-accent-info">
      <div class="card-header">
        <div class="card-title">
          <span class="card-icon">&#128197;</span>
          Programma
        </div>
        ${editie ? `<span class="badge badge-muted">${escapeHtml(editie.naam ?? String(editie.jaar))}</span>` : ''}
      </div>
      <div class="card-body" style="${rswItems.length ? 'padding:0;margin:-20px 0;' : ''}">
        ${rswItems.length
          ? buildProgrammaTimelijn(rswItems, meer)
          : buildLegeStaat('&#128197;', 'Het programma wordt binnenkort gepubliceerd.')
        }
      </div>
      ${programma.length ? `
        <div class="card-footer">
          <a href="#/programma" class="btn btn-ghost btn-sm">Volledig programma &rarr;</a>
        </div>
      ` : ''}
    </div>
  `;
}

function buildProgrammaTimelijn(items, meer) {
  const nu = new Date();

  // Groepeer per dag, filter afgelopen items
  const perDag = new Map();
  for (const item of items) {
    const start = item.start_tijd ?? item.starttijd;
    const eind  = item.eind_tijd ?? item.eindtijd ?? start;
    // Verberg item als eindtijd in het verleden ligt
    if (new Date(eind) < nu) continue;
    const key = new Date(start).toISOString().slice(0, 10);
    if (!perDag.has(key)) perDag.set(key, []);
    perDag.get(key).push(item);
  }

  if (perDag.size === 0) {
    return `<div style="padding:12px;font-size:0.85rem;color:var(--color-text-muted)">Geen aankomende programma-items.</div>`;
  }

  let html = `<div style="overflow:hidden">`;
  let dagIndex = 0;

  for (const [dagKey, dagItems] of perDag) {
    const isFirst  = dagIndex === 0;
    const dagId    = `prog-dag-${dagIndex}`;
    const dagLabel = new Date(dagKey + 'T12:00:00').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    html += `
      ${dagIndex > 0 ? '<div style="height:1px;background:var(--color-border)"></div>' : ''}
      <button class="prog-dag-header ${isFirst ? '' : 'collapsed'}" data-dag="${dagId}"
        style="display:flex;align-items:center;justify-content:space-between;width:100%;
          padding:7px 12px;background:var(--color-surface-alt);border:none;cursor:pointer;
          font-size:0.75rem;font-weight:700;text-transform:capitalize;
          color:var(--color-text-muted);letter-spacing:0.03em;text-align:left;">
        <span>${escapeHtml(dagLabel)}</span>
        <span class="nav-group-chevron" style="width:20px;height:20px;${isFirst ? '' : 'transform:rotate(-90deg)'}">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div id="${dagId}" style="display:flex;flex-direction:column;${isFirst ? '' : 'display:none'}">
        ${dagItems.map((item, i) => {
          const isJury  = item.type === 'jurymoment';
          const accent  = isJury ? 'var(--color-primary)' : 'var(--color-info)';
          const start   = item.start_tijd ?? item.starttijd;
          const eind    = item.eind_tijd ?? item.eindtijd ?? null;
          const tijdStr = formatTijd(start);
          const eindStr = eind ? formatTijd(eind) : null;
          const borderB = i < dagItems.length - 1 ? 'border-bottom:1px solid var(--color-border)' : '';
          return `
            <div style="display:flex;gap:0;align-items:stretch;${borderB}">
              <div style="display:flex;flex-direction:column;align-items:center;width:36px;flex-shrink:0;padding:10px 0">
                <div style="width:8px;height:8px;border-radius:50%;background:${accent};flex-shrink:0;margin-top:3px"></div>
                ${i < dagItems.length - 1 ? `<div style="width:2px;flex:1;background:var(--color-border);margin-top:3px"></div>` : ''}
              </div>
              <div style="padding:8px 0 8px 4px;flex:1;min-width:0">
                <div style="font-size:0.75rem;font-weight:600;color:var(--color-text-muted);white-space:nowrap">
                  ${escapeHtml(tijdStr)}${eindStr ? ` – ${escapeHtml(eindStr)}` : ''}
                </div>
                <div style="font-weight:600;font-size:0.88rem;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${escapeHtml(item.naam)}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>`;

    dagIndex++;
  }

  if (meer) {
    html += `<div style="padding:6px 12px;font-size:0.75rem;color:var(--color-text-muted);font-style:italic;border-top:1px solid var(--color-border)">
      + meer items op de programmapagina
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ── Vacatures card (publiek) ──────────────────────────────────────

function buildVacaturesCard(vacatures, loggedIn) {
  const rijen = vacatures.map(v => {
    const vol = v.max_vrijwilligers && Number(v.aanmeldingen) >= Number(v.max_vrijwilligers);
    const spots = v.max_vrijwilligers
      ? `${v.aanmeldingen}/${v.max_vrijwilligers}`
      : `${v.aanmeldingen} aangemeld`;
    return `
      <div class="schedule-item" style="align-items:flex-start;">
        <div class="schedule-time" style="min-width:80px;text-align:center;">
          ${vol
            ? '<span class="badge badge-error">Vol</span>'
            : '<span class="badge badge-success">Open</span>'
          }
        </div>
        <div class="schedule-content" style="flex:1;">
          <div class="schedule-title">${escapeHtml(v.naam)}</div>
          ${v.omschrijving ? `<div class="schedule-desc">${escapeHtml(v.omschrijving)}</div>` : ''}
          <div class="schedule-desc" style="margin-top:4px;">&#128101; ${spots}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card card-accent-success">
      <div class="card-header">
        <div class="card-title">
          <span class="card-icon">&#128170;</span>
          Vrijwilligers gezocht
        </div>
        <span class="badge badge-success">${vacatures.length} ${vacatures.length === 1 ? 'vacature' : 'vacatures'}</span>
      </div>
      <div class="card-body">
        <div class="schedule-list">${rijen}</div>
      </div>
      ${!loggedIn ? `
        <div class="card-footer">
          <a href="#/registreren?rol=vrijwilliger" class="btn btn-primary btn-sm">Aanmelden als vrijwilliger &rarr;</a>
        </div>
      ` : `
        <div class="card-footer">
          <a href="#/vrijwilliger/inschrijving" class="btn btn-primary btn-sm">Mijn inschrijving &rarr;</a>
        </div>
      `}
    </div>
  `;
}

// ── Role-specifieke cards (ingelogd) ─────────────────────────────

function buildRolCards(user) {
  const cards = [];

  if (hasRole('leiding')) {
    cards.push(`
      <div class="card card-accent-success">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">&#128203;</span> Mijn inschrijvingen</div>
        </div>
        <div class="card-body" id="leiding-inschrijvingen-widget">
          ${buildLegeStaat('&#128203;', 'Laden...')}
        </div>
        <div class="card-footer">
          <a href="#/inschrijvingen" class="btn btn-primary btn-sm">&#43; Inschrijving</a>
        </div>
      </div>
    `);
  }

  if (hasRole('jury')) {
    cards.push(`
      <div class="card card-accent-warning">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">&#128394;&#65039;</span> Mijn jury-toewijzing</div>
        </div>
        <div class="card-body">
          <p class="text-muted text-sm">Je bent ingedeeld als jurylid. Ga naar het scoreformulier om scores in te voeren.</p>
        </div>
        <div class="card-footer">
          <a href="#/scoreformulier" class="btn btn-primary btn-sm">Scoreformulier openen</a>
        </div>
      </div>
    `);
  }

  if (hasRole('spelbegeleider')) {
    cards.push(`
      <div class="card card-accent-info">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">&#128101;</span> Mijn categorie</div>
        </div>
        <div class="card-body">
          <p class="text-muted text-sm">Bekijk de live scores van alle patrouilles in jouw categorie.</p>
        </div>
        <div class="card-footer">
          <a href="#/scoreformulier" class="btn btn-primary btn-sm">Naar mijn categorie</a>
          <a href="#/scores" class="btn btn-ghost btn-sm">Live scores</a>
        </div>
      </div>
    `);
  }

  if (hasRole('organisator', 'admin')) {
    cards.push(`
      <div class="card card-accent-primary card-full">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">&#127937;</span> Organisator overzicht</div>
          <span class="badge badge-primary">${rolNaam(user.rol)}</span>
        </div>
        <div class="card-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:16px;">
            ${buildOrgStatWidget()}
          </div>
        </div>
        <div class="card-footer">
          <a href="#/edities" class="btn btn-primary btn-sm">&#127937; Edities</a>
          <a href="#/inschrijvingen" class="btn btn-ghost btn-sm">Inschrijvingen</a>
          <a href="#/scores" class="btn btn-ghost btn-sm">Scorebeheer</a>
        </div>
      </div>
    `);
  }

  return cards.join('');
}

function buildOrgStatWidget() {
  // Placeholder stats — worden later gevuld via API
  const stats = [
    { icoon: '&#128101;', label: 'Groepen', waarde: '&mdash;', kleur: 'var(--color-primary)' },
    { icoon: '&#128203;', label: 'Patrouilles', waarde: '&mdash;', kleur: 'var(--color-info)' },
    { icoon: '&#128170;', label: 'Vrijwilligers', waarde: '&mdash;', kleur: 'var(--color-success)' },
    { icoon: '&#128394;&#65039;', label: 'Juryleden', waarde: '&mdash;', kleur: 'var(--color-warning)' },
  ];

  return stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon" style="color:${s.kleur}">${s.icoon}</div>
      <div class="stat-info">
        <div class="stat-value">${s.waarde}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>
  `).join('');
}

// ── Info card (altijd zichtbaar) ──────────────────────────────────

function buildInfoCard() {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><span class="card-icon">&#8505;&#65039;</span> Over de RSW</div>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin-bottom:12px;">
          De Regionale Scouting Wedstrijden (RSW) is het jaarlijkse evenement waarbij
          scoutinggroepen uit regio De Langstraat het tegen elkaar opnemen in diverse
          categorieën en activiteiten.
        </p>
        <p class="text-sm text-muted">
          Patrouilles worden beoordeeld door een onafhankelijke jury. Alle scores worden
          anoniem verwerkt om eerlijkheid te garanderen.
        </p>
      </div>
      <div class="card-footer">
        <a href="#/over" class="btn btn-ghost btn-sm">Meer informatie &rarr;</a>
      </div>
    </div>
  `;
}

// ── Skeleton loader ───────────────────────────────────────────────

function buildSkeleton() {
  return `
    <div class="page-loading">
      <div class="spinner"></div>
    </div>
  `;
}

// ── Lege staat ────────────────────────────────────────────────────

function buildLegeStaat(icoon, tekst) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icoon}</div>
      <p class="empty-state-text">${tekst}</p>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScore(score) {
  if (score == null) return '—';
  return Number(score).toFixed(1);
}


function userInitialen(naam = '') {
  return naam.trim().split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function rolNaam(rol) {
  const namen = {
    admin:          'Admin',
    organisator:    'Organisator',
    leiding:        'Leiding',
    vrijwilliger:   'Vrijwilliger',
    jury:           'Jury',
    spelbegeleider: 'Spelbegeleider',
  };
  return namen[rol] ?? rol;
}
