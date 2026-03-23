// app.js — SPA router, initialisatie, globale state

import { initAuth } from './services/auth.js';
import { renderHeader } from './components/header.js';
import { renderSidebar, setActiveNavItem } from './components/sidebar.js';
import { renderFooter } from './components/footer.js';
import { currentRoute } from './utils/router.js';

// Re-export zodat oude gecachede modules die navigate uit app.js importeerden blijven werken
export { navigate } from './utils/router.js';

// ── Route definities ──────────────────────────────────────────────
// V wordt bij elke server-start uniek — omzeilt proxy-caches voor nieuw aangemaakte bestanden.
const V = '__RSW_VERSION__';

const routes = {
  '/':                   () => import(`./pages/home.js?v=${V}`),
  '/login':              () => import(`./pages/login.js?v=${V}`),
  '/registreren':        () => import(`./pages/registreren.js?v=${V}`),
  '/wachtwoord-vergeten':() => import(`./pages/wachtwoord-vergeten.js?v=${V}`),
  '/wachtwoord-reset':   () => import(`./pages/wachtwoord-reset.js?v=${V}`),
  '/uitnodiging':        () => import(`./pages/uitnodiging.js?v=${V}`),
  '/programma':          () => import(`./pages/programma.js?v=${V}`),
  '/uitslagen':          () => import(`./pages/uitslagen.js?v=${V}`),
  '/over':               () => import(`./pages/over.js?v=${V}`),

  // Inschrijvingen (leiding + organisator/admin)
  '/inschrijvingen':     () => import(`./pages/inschrijvingen.js?v=${V}`),

  // Catering (leiding + vrijwilliger)
  '/catering':           () => import(`./pages/catering.js?v=${V}`),

  // Edities (admin: volledig | organisator: bewerken)
  '/edities':            () => import(`./pages/edities.js?v=${V}`),

  // Scores (admin/organisator: invoer + live overzicht)
  '/scores':             () => import(`./pages/scores.js?v=${V}`),

  // Scoreformulier (jury: token-based | spelbegeleider: categorie-overzicht)
  '/scoreformulier':     () => import(`./pages/scoreformulier.js?v=${V}`),

  // Leiding

  // Vrijwilliger
  '/vrijwilliger/inschrijving': () => import(`./pages/vrijwilliger/inschrijving.js?v=${V}`),

  // Organisator
  '/organisator/plattegrond':  () => import(`./pages/organisator/plattegrond.js?v=${V}`),
  '/organisator/subkampen':    () => import(`./pages/organisator/subkampen.js?v=${V}`),
  '/organisator/categorieen':  () => import(`./pages/organisator/categorieen.js?v=${V}`),
  '/organisator/programma':    () => import(`./pages/organisator/programma.js?v=${V}`),
  '/organisator/jury':         () => import(`./pages/organisator/jury.js?v=${V}`),
  '/organisator/vrijwilligers': () => import(`./pages/organisator/vrijwilligers.js?v=${V}`),
  '/organisator/aanvragen':    () => import(`./pages/organisator/aanvragen.js?v=${V}`),
  '/organisator/catering':     () => import(`./pages/organisator/catering.js?v=${V}`),
  '/organisator/rally-beheer':   () => import(`./pages/organisator/rally-beheer.js?v=${V}`),
  '/organisator/rally-tracking': () => import(`./pages/organisator/rally-tracking.js?v=${V}`),

  // Admin
  '/admin/gebruikers':   () => import(`./pages/admin/gebruikers.js?v=${V}`),
  '/admin/verenigingen': () => import(`./pages/admin/verenigingen.js?v=${V}`),
  '/admin/versie':       () => import(`./pages/admin/versie.js?v=${V}`),

  '/profiel': () => import(`./pages/profiel.js?v=${V}`),
};

// Actieve pagina-module bijhouden voor cleanup
let activePage = null;

// ── Router ────────────────────────────────────────────────────────

async function handleRoute() {
  const pad = currentRoute();

  // Opruimen van vorige pagina
  if (activePage?.onDestroy) activePage.onDestroy();

  const loader = routes[pad] ?? routes['/'];

  try {
    const module = await loader();
    activePage = module;
    await module.render();
    if (module.onMount) module.onMount();
  } catch (err) {
    console.error(`Fout bij laden pagina '${pad}':`, err);
    document.getElementById('content').innerHTML = buildNietBeschikbaar(pad, err);
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

function buildNietBeschikbaar(pad, err) {
  const isOngebouwd = err?.message?.includes('fetch') || err instanceof TypeError;
  const titel = isOngebouwd ? 'Pagina in aanbouw' : 'Fout bij laden pagina';
  const detail = err ? `<pre style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:12px 16px;font-size:0.72rem;text-align:left;overflow:auto;max-width:560px;white-space:pre-wrap;color:var(--color-error);">${err.message}\n${err.stack ?? ''}</pre>` : '';
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:400px; text-align:center; gap:16px; padding:24px;">
      <div style="font-size:3.5rem; opacity:0.4;">&#128679;</div>
      <h2 style="font-size:1.25rem; color:var(--color-text);">${titel}</h2>
      <p style="color:var(--color-text-muted); font-size:0.9rem; max-width:360px;">
        Route: <code style="background:var(--color-surface-alt); padding:2px 6px; border-radius:4px;">${pad}</code>
      </p>
      ${detail}
      <a href="#/" class="btn btn-primary">Terug naar home</a>
    </div>
  `;
}
