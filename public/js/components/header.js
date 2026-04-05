// header.js — Header component

import { isLoggedIn, getUser, logout } from '../services/auth.js';
import { navigate } from '../utils/router.js';

function isMobiel() {
  return window.innerWidth <= 768;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  if (isMobiel()) {
    // Mobiel: toggle 'open' class, toon/verberg overlay
    const wordtOpen = sidebar.classList.toggle('open');
    let overlay = document.getElementById('sidebar-overlay');
    if (wordtOpen) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', toggleSidebar);
        document.body.appendChild(overlay);
      }
    } else if (overlay) {
      overlay.remove();
    }
  } else {
    // Desktop: toggle 'collapsed' class
    sidebar.classList.toggle('collapsed');
    document.querySelector('.content-area')?.classList.toggle('sidebar-collapsed');
    document.getElementById('footer')?.classList.toggle('sidebar-collapsed');
  }
}

export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;
  el.innerHTML = buildHeader();
  bindHeaderEvents(el);
}

function buildHeader() {
  const user     = getUser();
  const loggedIn = isLoggedIn();

  return `
    <div class="header-inner">
      <div class="header-left">
        <button class="btn-icon" id="sidebar-toggle" title="Menu in-/uitklappen" aria-label="Menu toggle">
          <span class="material-icons">menu</span>
        </button>
        <a href="#/" class="header-logo">
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
  const rolLabel  = rolNaam(user.rol);
  return `
    <div class="user-menu" id="user-menu-btn" title="Gebruikersmenu" tabindex="0" role="button">
      <div class="user-avatar">${initialen}</div>
      <div>
        <div class="user-name">${escapeHtml(user.naam)}</div>
        <div class="role-badge-header">${rolLabel}</div>
      </div>
      <span style="color:var(--color-text-muted);font-size:1rem;"><span class="material-icons" style="font-size:1rem;">expand_more</span></span>
    </div>
    <div id="user-dropdown" class="user-dropdown hidden">
      <div class="dropdown-user-info">
        <div class="dropdown-user-naam">${escapeHtml(user.naam)}</div>
        <div class="dropdown-user-rol">${rolLabel}</div>
      </div>
      <hr class="dropdown-divider" />
      <a href="#/profiel" class="dropdown-item"><span class="material-icons">manage_accounts</span> Mijn profiel</a>
      <hr class="dropdown-divider" />
      <button class="dropdown-item dropdown-item-danger" id="logout-btn"><span class="material-icons">logout</span> Uitloggen</button>
    </div>
  `;
}

function buildGuestMenu() {
  return `
    <a href="#/login" class="btn btn-ghost btn-sm">Inloggen</a>
    <a href="#/registreren" class="btn btn-primary btn-sm">Registreren</a>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindHeaderEvents(el) {
  // Sidebar toggle
  el.querySelector('#sidebar-toggle')?.addEventListener('click', () => {
    toggleSidebar();
  });

  // User dropdown
  const menuBtn  = el.querySelector('#user-menu-btn');
  const userDrop = el.querySelector('#user-dropdown');
  if (menuBtn && userDrop) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDrop.classList.toggle('hidden');
    });

    // Klik op item in dropdown: sluit sidebar op mobiel
    userDrop.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        sidebar?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.remove();
      }
    });
  }

  // Sluit dropdown bij klik buiten
  document.addEventListener('click', () => {
    userDrop?.classList.add('hidden');
  });

  // Uitloggen
  el.querySelector('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    navigate('#/');
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function userInitialen(naam = '') {
  return naam.trim().split(' ')
    .filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}

function rolNaam(rol) {
  const namen = {
    admin: 'Admin', organisator: 'Organisator', leiding: 'Leiding',
    vrijwilliger: 'Vrijwilliger', jury: 'Jury', spelbegeleider: 'Spelbegeleider',
  };
  return namen[rol] ?? rol;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
