// home.js — Landing / dashboard pagina
// Zichtbaar voor iedereen; toont role-specifieke cards voor ingelogde gebruikers.

import { isLoggedIn, getUser, hasRole } from '../services/auth.js';
import { getActieveEditie, getTop10, getProgramma } from '../services/api.js';

// Wordt bijgehouden zodat onDestroy() de interval kan stoppen
let refreshInterval = null;

export async function render() {
  const content = document.getElementById('content');
  // Skeleton tonen terwijl data geladen wordt
  content.innerHTML = buildSkeleton();

  const [editie, user, loggedIn] = [await getActieveEditie(), getUser(), isLoggedIn()];

  let top10 = [];
  let programma = [];

  if (editie) {
    [top10, programma] = await Promise.all([
      getTop10(editie.id),
      getProgramma(editie.id),
    ]);
  }

  content.innerHTML = buildPage(editie, top10, programma, user, loggedIn);
}

export function onMount() {
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

function buildPage(editie, top10, programma, user, loggedIn) {
  return `
    ${loggedIn ? buildWelcomeCard(user) : ''}
    ${buildHero(editie, loggedIn)}
    ${loggedIn ? buildSnelleActies(user) : ''}

    <div class="dashboard-grid">
      ${buildTop10Card(top10, editie)}
      ${buildProgrammaCard(programma, editie)}
      ${loggedIn ? buildRolCards(user) : ''}
      ${buildInfoCard()}
    </div>
  `;
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

  return `
    <div class="hero mb-24">
      <div class="badge badge-primary mb-8">
        ${editie ? 'Actieve editie' : 'Regionale Scouting Wedstrijden'}
      </div>
      <h1 class="hero-title mt-8">
        Welkom bij het<br><span>${titel}</span>
      </h1>
      <p class="hero-subtitle">
        Het portaal voor deelnemers, vrijwilligers, jury en organisatoren van
        de Regionale Scouting Wedstrijden in regio De Langstraat.
      </p>

      ${!loggedIn ? `
        <div class="hero-actions">
          <a href="#/registreren" class="btn btn-primary">Inschrijven als leiding</a>
          <a href="#/login" class="btn btn-ghost">Inloggen</a>
        </div>
      ` : ''}

      ${datum || locatie ? `
        <div class="hero-meta">
          ${datum ? `<div class="hero-meta-item">&#128197; <strong>${datum}</strong></div>` : ''}
          ${locatie ? `<div class="hero-meta-item">&#128205; <strong>${escapeHtml(locatie)}</strong></div>` : ''}
          ${editie?.inschrijving_open ? `<div class="hero-meta-item"><span class="badge badge-success">Inschrijving open</span></div>` : ''}
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
    <div class="mb-24">
      <div class="section-header mb-16">
        <h2 class="section-title">&#9889; Snelle acties</h2>
      </div>
      <div class="quick-actions">
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
      { href: '#/inschrijving',         icoon: '&#128221;', label: 'Patrouille inschrijven' },
      { href: '#/mijn-inschrijvingen',  icoon: '&#128203;', label: 'Mijn inschrijvingen' },
      { href: '#/uitslagen',            icoon: '&#127942;', label: 'Uitslagen bekijken' },
    ],
    vrijwilliger: [
      { href: '#/vrijwilliger/inschrijving', icoon: '&#128170;', label: 'Mijn inschrijving' },
      { href: '#/programma',                 icoon: '&#128197;', label: 'Programma' },
    ],
    jury: [
      { href: '#/jury/scoreformulier', icoon: '&#128394;&#65039;', label: 'Scores invoeren' },
      { href: '#/jury/scores',         icoon: '&#128200;',         label: 'Live scores' },
    ],
    spelbegeleider: [
      { href: '#/spelbegeleider/categorie', icoon: '&#128101;', label: 'Mijn categorie' },
      { href: '#/spelbegeleider/scores',    icoon: '&#128200;', label: 'Live scoretabel' },
    ],
    organisator: [
      { href: '#/organisator/editie',         icoon: '&#127937;',       label: 'Editiebeheer' },
      { href: '#/organisator/inschrijvingen', icoon: '&#128203;',       label: 'Inschrijvingen' },
      { href: '#/organisator/plattegrond',    icoon: '&#128205;',       label: 'Plattegrond' },
      { href: '#/organisator/scores',         icoon: '&#128200;',       label: 'Scorebeheer' },
      { href: '#/organisator/qr',             icoon: '&#9638;',         label: 'QR-codes' },
    ],
    admin: [
      { href: '#/organisator/editie',  icoon: '&#127937;', label: 'Editiebeheer' },
      { href: '#/admin/gebruikers',    icoon: '&#128100;', label: 'Gebruikers' },
      { href: '#/admin/verenigingen',  icoon: '&#127960;&#65039;', label: 'Verenigingen' },
      { href: '#/admin/categorieen',   icoon: '&#127381;', label: 'Categorie-templates' },
      { href: '#/organisator/scores',  icoon: '&#128200;', label: 'Scorebeheer' },
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
  return `
    <div class="card card-accent-info">
      <div class="card-header">
        <div class="card-title">
          <span class="card-icon">&#128197;</span>
          Programma &mdash; ${editie ? escapeHtml(editie.naam ?? String(editie.jaar)) : 'Actieve editie'}
        </div>
      </div>
      <div class="card-body">
        ${programma.length
          ? `<div class="schedule-list">${buildProgrammaItems(programma)}</div>`
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

function buildProgrammaItems(programma) {
  return programma.map(item => `
    <div class="schedule-item">
      <div class="schedule-time">${formatTijd(item.starttijd)}</div>
      <div class="schedule-content">
        <div class="schedule-title">${escapeHtml(item.naam)}</div>
        ${item.omschrijving ? `<div class="schedule-desc">${escapeHtml(item.omschrijving)}</div>` : ''}
      </div>
    </div>
  `).join('');
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
          <a href="#/inschrijving" class="btn btn-primary btn-sm">&#43; Patrouille inschrijven</a>
          <a href="#/mijn-inschrijvingen" class="btn btn-ghost btn-sm">Bekijken</a>
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
          <a href="#/jury/scoreformulier" class="btn btn-primary btn-sm">Scoreformulier openen</a>
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
          <a href="#/spelbegeleider/categorie" class="btn btn-primary btn-sm">Naar mijn categorie</a>
          <a href="#/spelbegeleider/scores" class="btn btn-ghost btn-sm">Live scores</a>
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
          <a href="#/organisator/editie" class="btn btn-primary btn-sm">&#127937; Editiebeheer</a>
          <a href="#/organisator/inschrijvingen" class="btn btn-ghost btn-sm">Inschrijvingen</a>
          <a href="#/organisator/scores" class="btn btn-ghost btn-sm">Scorebeheer</a>
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

function formatTijd(tijdStr) {
  if (!tijdStr) return '';
  // Verwacht 'HH:MM:SS' of 'HH:MM'
  const delen = String(tijdStr).split(':');
  return `${delen[0]}:${delen[1]}`;
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
