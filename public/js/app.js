// app.js — SPA router, initialisatie, globale state

import { initAuth } from './services/auth.js';
import { renderHeader } from './components/header.js';
import { renderSidebar, setActiveNavItem } from './components/sidebar.js';
import { renderFooter } from './components/footer.js';

// ── Route definities ──────────────────────────────────────────────
// Elke route heeft een lazy-import van de bijbehorende pagina-module.

const routes = {
  '/':              () => import('./pages/home.js'),
  '/login':         () => import('./pages/login.js'),
  '/registreren':   () => import('./pages/registreren.js'),
  '/programma':     () => import('./pages/programma.js'),
  '/uitslagen':     () => import('./pages/uitslagen.js'),
  '/over':          () => import('./pages/over.js'),

  // Leiding
  '/inschrijving':        () => import('./pages/leiding/inschrijving.js'),
  '/mijn-inschrijvingen': () => import('./pages/leiding/mijn-inschrijvingen.js'),

  // Vrijwilliger
  '/vrijwilliger/inschrijving': () => import('./pages/vrijwilliger/inschrijving.js'),

  // Jury
  '/jury/scoreformulier': () => import('./pages/jury/scoreformulier.js'),
  '/jury/scores':         () => import('./pages/jury/scores.js'),

  // Spelbegeleider
  '/spelbegeleider/categorie': () => import('./pages/spelbegeleider/categorie.js'),
  '/spelbegeleider/scores':    () => import('./pages/spelbegeleider/scores.js'),

  // Organisator
  '/organisator/editie':         () => import('./pages/organisator/editie.js'),
  '/organisator/plattegrond':    () => import('./pages/organisator/plattegrond.js'),
  '/organisator/inschrijvingen': () => import('./pages/organisator/inschrijvingen.js'),
  '/organisator/scores':         () => import('./pages/organisator/scores.js'),
  '/organisator/qr':             () => import('./pages/organisator/qr.js'),

  // Admin
  '/admin/gebruikers':   () => import('./pages/admin/gebruikers.js'),
  '/admin/verenigingen': () => import('./pages/admin/verenigingen.js'),
  '/admin/categorieen':  () => import('./pages/admin/categorieen.js'),

  // Dashboard (gedeeld)
  '/dashboard': () => import('./pages/dashboard.js'),
  '/profiel':   () => import('./pages/profiel.js'),
};

// Actieve pagina-module bijhouden voor cleanup
let activePage = null;

// ── Router ────────────────────────────────────────────────────────

export function navigate(hash) {
  location.hash = hash;
}

async function handleRoute() {
  // Hash '#/pad' → '/pad'
  const hash = location.hash || '#/';
  const pad = hash.slice(1) || '/';

  // Opruimen van vorige pagina
  if (activePage?.onDestroy) activePage.onDestroy();

  const loader = routes[pad] ?? routes['/'];

  try {
    const module = await loader();
    activePage = module;
    await module.render();
    if (module.onMount) module.onMount();
  } catch (err) {
    // Pagina nog niet aangemaakt — toon vriendelijke melding
    console.warn(`Pagina '${pad}' nog niet beschikbaar:`, err.message);
    document.getElementById('content').innerHTML = buildNietBeschikbaar(pad);
    activePage = null;
  }

  setActiveNavItem();
}

// ── Auth-event listener ───────────────────────────────────────────
// Herrender header en sidebar bij login/logout

window.addEventListener('rsw:auth-changed', () => {
  renderHeader();
  renderSidebar();
});

// ── App initialisatie ─────────────────────────────────────────────

async function init() {
  // Probeer sessie te herstellen via refresh cookie
  await initAuth();

  // Layout componenten renderen
  renderHeader();
  renderSidebar();
  renderFooter();

  // Eerste route laden
  await handleRoute();
}

// Navigatie via hashchange
window.addEventListener('hashchange', handleRoute);

// Start
init();

// ── Niet-beschikbaar pagina ───────────────────────────────────────

function buildNietBeschikbaar(pad) {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:400px; text-align:center; gap:16px;">
      <div style="font-size:3.5rem; opacity:0.4;">&#128679;</div>
      <h2 style="font-size:1.25rem; color:var(--color-text);">Pagina in aanbouw</h2>
      <p style="color:var(--color-text-muted); font-size:0.9rem; max-width:360px;">
        De pagina <code style="background:var(--color-surface-alt); padding:2px 6px; border-radius:4px;">${pad}</code>
        is nog niet beschikbaar. We werken er aan!
      </p>
      <a href="#/" class="btn btn-primary">Terug naar home</a>
    </div>
  `;
}
