// sidebar.js — Sidebar navigatie component

import { isLoggedIn, hasRole } from '../services/auth.js';

export function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.innerHTML = buildSidebar();
  bindSidebarEvents(el);
  setActiveNavItem();
}

function buildSidebar() {
  const loggedIn = isLoggedIn();

  return `
    <nav class="sidebar-inner" aria-label="Hoofdnavigatie">
      ${buildPubliekNav()}
      ${loggedIn ? buildRolNav() : ''}
    </nav>
  `;
}

// Altijd zichtbaar (bezoeker + ingelogd)
function buildPubliekNav() {
  return `
    <div class="nav-group">
      <div class="nav-group-label">Algemeen</div>
      <a href="#/" class="nav-item" data-route="/">
        <span class="nav-item-icon">&#127968;</span>
        <span class="nav-item-label">Home</span>
      </a>
      <a href="#/programma" class="nav-item" data-route="/programma">
        <span class="nav-item-icon">&#128197;</span>
        <span class="nav-item-label">Programma</span>
      </a>
      <a href="#/uitslagen" class="nav-item" data-route="/uitslagen">
        <span class="nav-item-icon">&#127942;</span>
        <span class="nav-item-label">Uitslagen</span>
      </a>
      <a href="#/over" class="nav-item" data-route="/over">
        <span class="nav-item-icon">&#8505;&#65039;</span>
        <span class="nav-item-label">Over de RSW</span>
      </a>
    </div>
  `;
}

// Role-specifieke navigatie
function buildRolNav() {
  const sections = [];

  if (hasRole('leiding')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Mijn groep</div>
        <a href="#/dashboard" class="nav-item" data-route="/dashboard">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/inschrijving" class="nav-item" data-route="/inschrijving">
          <span class="nav-item-icon">&#128221;</span>
          <span class="nav-item-label">Inschrijving</span>
        </a>
        <a href="#/mijn-inschrijvingen" class="nav-item" data-route="/mijn-inschrijvingen">
          <span class="nav-item-icon">&#128203;</span>
          <span class="nav-item-label">Mijn inschrijvingen</span>
        </a>
      </div>
    `);
  }

  if (hasRole('vrijwilliger')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Vrijwilliger</div>
        <a href="#/dashboard" class="nav-item" data-route="/dashboard">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/vrijwilliger/inschrijving" class="nav-item" data-route="/vrijwilliger/inschrijving">
          <span class="nav-item-icon">&#128170;</span>
          <span class="nav-item-label">Mijn inschrijving</span>
        </a>
      </div>
    `);
  }

  if (hasRole('jury')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Jury</div>
        <a href="#/dashboard" class="nav-item" data-route="/dashboard">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/jury/scoreformulier" class="nav-item" data-route="/jury/scoreformulier">
          <span class="nav-item-icon">&#128394;&#65039;</span>
          <span class="nav-item-label">Scoreformulier</span>
        </a>
        <a href="#/jury/scores" class="nav-item" data-route="/jury/scores">
          <span class="nav-item-icon">&#128200;</span>
          <span class="nav-item-label">Live scores</span>
        </a>
      </div>
    `);
  }

  if (hasRole('spelbegeleider')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Spelbegeleider</div>
        <a href="#/dashboard" class="nav-item" data-route="/dashboard">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/spelbegeleider/categorie" class="nav-item" data-route="/spelbegeleider/categorie">
          <span class="nav-item-icon">&#128101;</span>
          <span class="nav-item-label">Mijn categorie</span>
        </a>
        <a href="#/spelbegeleider/scores" class="nav-item" data-route="/spelbegeleider/scores">
          <span class="nav-item-icon">&#128200;</span>
          <span class="nav-item-label">Live scoretabel</span>
        </a>
      </div>
    `);
  }

  if (hasRole('organisator', 'admin')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Organisatie</div>
        <a href="#/dashboard" class="nav-item" data-route="/dashboard">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/organisator/editie" class="nav-item" data-route="/organisator/editie">
          <span class="nav-item-icon">&#127937;</span>
          <span class="nav-item-label">Editiebeheer</span>
        </a>
        <a href="#/organisator/plattegrond" class="nav-item" data-route="/organisator/plattegrond">
          <span class="nav-item-icon">&#128205;</span>
          <span class="nav-item-label">Plattegrond</span>
        </a>
        <a href="#/organisator/inschrijvingen" class="nav-item" data-route="/organisator/inschrijvingen">
          <span class="nav-item-icon">&#128203;</span>
          <span class="nav-item-label">Inschrijvingen</span>
        </a>
        <a href="#/organisator/scores" class="nav-item" data-route="/organisator/scores">
          <span class="nav-item-icon">&#128200;</span>
          <span class="nav-item-label">Scorebeheer</span>
        </a>
        <a href="#/organisator/qr" class="nav-item" data-route="/organisator/qr">
          <span class="nav-item-icon">&#9638;</span>
          <span class="nav-item-label">QR-codes</span>
        </a>
      </div>
    `);
  }

  if (hasRole('admin')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Beheer</div>
        <a href="#/admin/gebruikers" class="nav-item" data-route="/admin/gebruikers">
          <span class="nav-item-icon">&#128100;</span>
          <span class="nav-item-label">Gebruikers</span>
        </a>
        <a href="#/admin/verenigingen" class="nav-item" data-route="/admin/verenigingen">
          <span class="nav-item-icon">&#127960;&#65039;</span>
          <span class="nav-item-label">Verenigingen</span>
        </a>
        <a href="#/admin/categorieen" class="nav-item" data-route="/admin/categorieen">
          <span class="nav-item-icon">&#127381;</span>
          <span class="nav-item-label">Categorie-templates</span>
        </a>
      </div>
    `);
  }

  // Profiel — altijd zichtbaar als ingelogd
  sections.push(`
    <div class="nav-group">
      <div class="nav-group-label">Account</div>
      <a href="#/profiel" class="nav-item" data-route="/profiel">
        <span class="nav-item-icon">&#128100;</span>
        <span class="nav-item-label">Mijn profiel</span>
      </a>
    </div>
  `);

  return sections.join('');
}

function bindSidebarEvents(el) {
  el.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

export function setActiveNavItem() {
  const route = '/' + (location.hash.slice(2) || '');
  document.querySelectorAll('.nav-item[data-route]').forEach(item => {
    const match = route === item.dataset.route
      || (item.dataset.route !== '/' && route.startsWith(item.dataset.route));
    item.classList.toggle('active', match);
  });
}
