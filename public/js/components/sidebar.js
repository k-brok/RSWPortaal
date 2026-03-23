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
        <a href="#/" class="nav-item" data-route="/">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/inschrijvingen" class="nav-item" data-route="/inschrijvingen">
          <span class="nav-item-icon">&#128221;</span>
          <span class="nav-item-label">Inschrijving</span>
        </a>
        <a href="#/catering" class="nav-item" data-route="/catering">
          <span class="nav-item-icon">&#127859;</span>
          <span class="nav-item-label">Catering</span>
        </a>
      </div>
    `);
  }

  if (hasRole('vrijwilliger')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Vrijwilliger</div>
        <a href="#/" class="nav-item" data-route="/">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/vrijwilliger/inschrijving" class="nav-item" data-route="/vrijwilliger/inschrijving">
          <span class="nav-item-icon">&#128170;</span>
          <span class="nav-item-label">Mijn inschrijving</span>
        </a>
        <a href="#/catering" class="nav-item" data-route="/catering">
          <span class="nav-item-icon">&#127859;</span>
          <span class="nav-item-label">Catering</span>
        </a>
      </div>
    `);
  }

  if (hasRole('jury')) {
    sections.push(`
      <div class="nav-group">
        <div class="nav-group-label">Jury</div>
        <a href="#/" class="nav-item" data-route="/">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/scoreformulier" class="nav-item" data-route="/scoreformulier">
          <span class="nav-item-icon">&#128394;&#65039;</span>
          <span class="nav-item-label">Scoreformulier</span>
        </a>
        <a href="#/scores" class="nav-item" data-route="/scores">
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
        <a href="#/" class="nav-item" data-route="/">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/scoreformulier" class="nav-item" data-route="/scoreformulier">
          <span class="nav-item-icon">&#128101;</span>
          <span class="nav-item-label">Mijn categorie</span>
        </a>
        <a href="#/scores" class="nav-item" data-route="/scores">
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
        <a href="#/" class="nav-item" data-route="/">
          <span class="nav-item-icon">&#9699;</span>
          <span class="nav-item-label">Dashboard</span>
        </a>
        <a href="#/edities" class="nav-item" data-route="/edities">
          <span class="nav-item-icon">&#127937;</span>
          <span class="nav-item-label">Edities</span>
        </a>
        <a href="#/inschrijvingen" class="nav-item" data-route="/inschrijvingen">
          <span class="nav-item-icon">&#128221;</span>
          <span class="nav-item-label">Inschrijvingen</span>
        </a>
        <a href="#/organisator/subkampen" class="nav-item" data-route="/organisator/subkampen">
          <span class="nav-item-icon">&#127979;</span>
          <span class="nav-item-label">Subkampen</span>
        </a>
        <a href="#/organisator/plattegrond" class="nav-item" data-route="/organisator/plattegrond">
          <span class="nav-item-icon">&#128205;</span>
          <span class="nav-item-label">Plattegrond</span>
        </a>
        <a href="#/organisator/categorieen" class="nav-item" data-route="/organisator/categorieen">
          <span class="nav-item-icon">&#127381;</span>
          <span class="nav-item-label">Categorieën</span>
        </a>
        <a href="#/organisator/programma" class="nav-item" data-route="/organisator/programma">
          <span class="nav-item-icon">&#128197;</span>
          <span class="nav-item-label">Programma</span>
        </a>
        <a href="#/organisator/jury" class="nav-item" data-route="/organisator/jury">
          <span class="nav-item-icon">&#128203;</span>
          <span class="nav-item-label">Jury</span>
        </a>
        <a href="#/organisator/vrijwilligers" class="nav-item" data-route="/organisator/vrijwilligers">
          <span class="nav-item-icon">&#128170;</span>
          <span class="nav-item-label">Vrijwilligers</span>
        </a>
        <a href="#/organisator/aanvragen" class="nav-item" data-route="/organisator/aanvragen">
          <span class="nav-item-icon">&#128203;</span>
          <span class="nav-item-label">Aanvragen</span>
        </a>
        <a href="#/organisator/catering" class="nav-item" data-route="/organisator/catering">
          <span class="nav-item-icon">&#127859;</span>
          <span class="nav-item-label">Catering</span>
        </a>
        <a href="#/organisator/rally-beheer" class="nav-item" data-route="/organisator/rally-beheer">
          <span class="nav-item-icon">&#128204;</span>
          <span class="nav-item-label">Rally beheer</span>
        </a>
        <a href="#/organisator/rally-tracking" class="nav-item" data-route="/organisator/rally-tracking">
          <span class="nav-item-icon">&#128200;</span>
          <span class="nav-item-label">Rally tracking</span>
        </a>
        <a href="#/scores" class="nav-item" data-route="/scores">
          <span class="nav-item-icon">&#128200;</span>
          <span class="nav-item-label">Scorebeheer</span>
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
        <a href="#/edities" class="nav-item" data-route="/edities">
          <span class="nav-item-icon">&#128197;</span>
          <span class="nav-item-label">Edities</span>
        </a>
        <a href="#/admin/versie" class="nav-item" data-route="/admin/versie">
          <span class="nav-item-icon">&#128260;</span>
          <span class="nav-item-label">Versie &amp; Updates</span>
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
