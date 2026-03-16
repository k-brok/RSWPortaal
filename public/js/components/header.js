// header.js — Header component

import { isLoggedIn, getUser, logout } from '../services/auth.js';
import { navigate } from '../app.js';

export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;
  el.innerHTML = buildHeader();
  bindHeaderEvents(el);
}

function buildHeader() {
  const user = getUser();
  const loggedIn = isLoggedIn();

  return `
    <div class="header-inner">
      <div class="header-left">
        <button class="btn-icon" id="sidebar-toggle" title="Menu in-/uitklappen" aria-label="Menu toggle">
          &#9776;
        </button>
        <a href="#/" class="header-logo">
          <span class="header-logo-icon">&#127956;</span>
          <span>RSW Portaal</span>
        </a>
      </div>

      <div class="header-right">
        ${loggedIn ? buildUserMenu(user) : buildGuestMenu()}
      </div>
    </div>
  `;
}

function buildUserMenu(user) {
  const initialen = userInitialen(user.naam);
  const rolLabel = rolNaam(user.rol);
  return `
    <div class="user-menu" id="user-menu-btn" title="Gebruikersmenu" tabindex="0" role="button">
      <div class="user-avatar">${initialen}</div>
      <div>
        <div class="user-name">${escapeHtml(user.naam)}</div>
        <div class="role-badge-header">${rolLabel}</div>
      </div>
      <span style="color:var(--color-text-muted);font-size:0.75rem;">&#9660;</span>
    </div>
    <div id="user-dropdown" class="user-dropdown hidden">
      <a href="#/profiel" class="dropdown-item">&#128100; Mijn profiel</a>
      <hr class="dropdown-divider" />
      <button class="dropdown-item dropdown-item-danger" id="logout-btn">&#128682; Uitloggen</button>
    </div>
  `;
}

function buildGuestMenu() {
  return `
    <a href="#/login" class="btn btn-ghost btn-sm">Inloggen</a>
    <a href="#/registreren" class="btn btn-primary btn-sm">Registreren</a>
  `;
}

function bindHeaderEvents(el) {
  // Sidebar toggle
  el.querySelector('#sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('collapsed');
    document.querySelector('.content-area')?.classList.toggle('sidebar-collapsed');
    document.getElementById('footer')?.classList.toggle('sidebar-collapsed');
  });

  // User dropdown toggle
  const menuBtn = el.querySelector('#user-menu-btn');
  const dropdown = el.querySelector('#user-dropdown');
  if (menuBtn && dropdown) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    // Sluit dropdown bij klik buiten
    document.addEventListener('click', () => dropdown.classList.add('hidden'), { once: false });
  }

  // Uitloggen
  el.querySelector('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    navigate('#/');
  });
}

// ── Helpers ──────────────────────────────────────────────────────

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
