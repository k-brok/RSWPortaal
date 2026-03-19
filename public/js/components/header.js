// header.js — Header component met editie-switcher

import { isLoggedIn, getUser, logout } from '../services/auth.js';
import { navigate } from '../utils/router.js';
import { get } from '../services/api.js';
import { getGeselecteerdeEditie, setGeselecteerdeEditie } from '../services/editie.js';

let alleEdities = null; // lazy geladen bij eerste gebruik

export function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;
  el.innerHTML = buildHeader();
  bindHeaderEvents(el);
}

function buildHeader() {
  const user     = getUser();
  const loggedIn = isLoggedIn();
  const geselecteerd = getGeselecteerdeEditie();

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

      ${loggedIn ? `
        <div class="header-center">
          <div class="editie-switcher" id="editie-switcher-btn" title="Schakel tussen edities" tabindex="0" role="button">
            <span class="editie-switcher-naam" id="editie-switcher-label">
              ${geselecteerd ? escapeHtml(geselecteerd.naam) : 'Editie laden…'}
            </span>
            <span style="color:var(--color-text-muted);font-size:0.7rem;">&#9660;</span>
          </div>
          <div id="editie-dropdown" class="user-dropdown hidden editie-dropdown">
            <div class="dropdown-item text-muted" style="font-size:.75rem;cursor:default;">Schakel van editie</div>
            <hr class="dropdown-divider" />
            <div id="editie-dropdown-items">Laden…</div>
          </div>
        </div>
      ` : ''}

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

// ── Events ────────────────────────────────────────────────────────

function bindHeaderEvents(el) {
  // Sidebar toggle
  el.querySelector('#sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('collapsed');
    document.querySelector('.content-area')?.classList.toggle('sidebar-collapsed');
    document.getElementById('footer')?.classList.toggle('sidebar-collapsed');
  });

  // User dropdown
  const menuBtn    = el.querySelector('#user-menu-btn');
  const userDrop   = el.querySelector('#user-dropdown');
  if (menuBtn && userDrop) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDrop.classList.toggle('hidden');
      el.querySelector('#editie-dropdown')?.classList.add('hidden');
    });
  }

  // Editie switcher dropdown
  const editieBtn  = el.querySelector('#editie-switcher-btn');
  const editieDrop = el.querySelector('#editie-dropdown');
  if (editieBtn && editieDrop) {
    editieBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      editieDrop.classList.toggle('hidden');
      userDrop?.classList.add('hidden');
      if (!editieDrop.classList.contains('hidden')) {
        await vulEditieDropdown(editieDrop);
      }
    });
  }

  // Sluit dropdowns bij klik buiten
  document.addEventListener('click', () => {
    userDrop?.classList.add('hidden');
    editieDrop?.classList.add('hidden');
  });

  // Uitloggen
  el.querySelector('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    navigate('#/');
  });

  // Init: laad actieve editie als er nog niets geselecteerd is
  initEditieLabel();
}

async function initEditieLabel() {
  if (getGeselecteerdeEditie()) return; // al een keuze opgeslagen
  try {
    const actief = await get('/publiek/editie/actief');
    document.getElementById('editie-switcher-label').textContent = actief.naam;
    // Sla systeem-actieve op als standaard (zodat label klopt)
    setGeselecteerdeEditie(actief);
  } catch {
    const lbl = document.getElementById('editie-switcher-label');
    if (lbl) lbl.textContent = 'Geen editie';
  }
}

async function vulEditieDropdown(drop) {
  const itemsEl = drop.querySelector('#editie-dropdown-items');
  if (!alleEdities) {
    try {
      alleEdities = await get('/publiek/edities');
    } catch {
      itemsEl.innerHTML = '<span class="dropdown-item text-muted">Fout bij laden</span>';
      return;
    }
  }
  const geselecteerd = getGeselecteerdeEditie();
  itemsEl.innerHTML = alleEdities.map(e => `
    <button class="dropdown-item${geselecteerd?.id === e.id ? ' dropdown-item-active' : ''}"
            data-editie-id="${e.id}" data-editie-naam="${escapeHtml(e.naam)}">
      ${escapeHtml(e.naam)}
      ${e.actief ? ' <span class="badge badge-success" style="font-size:.65rem;">Actief</span>' : ''}
    </button>
  `).join('');

  itemsEl.querySelectorAll('[data-editie-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const editie = { id: Number(btn.dataset.editieId), naam: btn.dataset.editieNaam };
      setGeselecteerdeEditie(editie);
      document.getElementById('editie-switcher-label').textContent = editie.naam;
      drop.classList.add('hidden');
      alleEdities = null; // invalideer cache zodat actief-badge bijgewerkt wordt
    });
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
