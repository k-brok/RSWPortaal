// sidebar.js — Sidebar navigatie component

import { isLoggedIn, hasRole } from '../services/auth.js';
import { get } from '../services/api.js';
import { getGeselecteerdeEditie, setGeselecteerdeEditie } from '../services/editie.js';

let alleEdities = null; // lazy cache

const STORAGE_KEY = 'sidebar_groups';

function getGroupState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveGroupState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function renderSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.innerHTML = buildSidebar();
  bindSidebarEvents(el);
  setActiveNavItem();
  if (isLoggedIn()) initEditieSwitcher(el);
}

function buildSidebar() {
  const loggedIn = isLoggedIn();
  const groups = [];

  // Editie-switcher — alleen als ingelogd
  if (loggedIn) {
    const geselecteerd = getGeselecteerdeEditie();
    groups.push(`
      <div class="nav-group" id="sidebar-editie-blok">
        <div class="nav-group-header" id="sidebar-editie-wissel-btn" role="button" tabindex="0" style="cursor:pointer;">
          <span class="nav-group-header-left">
            <span class="nav-group-icon"><span class="material-icons">event</span></span>
            <span class="nav-group-label">Editie: <span id="sidebar-editie-naam">${geselecteerd ? escapeHtml(geselecteerd.naam) : 'Laden\u2026'}</span></span>
          </span>
          <span style="display:flex;align-items:center;gap:6px;">
            <button class="nav-group-chevron" id="sidebar-editie-info-btn" title="Wat is de editie-selectie?" aria-label="Info over edities" style="width:24px;height:24px;">
              <span class="material-icons" aria-hidden="true">info</span>
            </button>
            <span class="nav-group-chevron" id="sidebar-editie-chevron">
              <span class="material-icons" aria-hidden="true">expand_more</span>
            </span>
          </span>
        </div>
        <div class="nav-group-items hidden" id="sidebar-editie-info-panel">
          <div class="sidebar-editie-info-tekst">
            De <strong>geselecteerde editie</strong> bepaalt welke data je ziet — inschrijvingen, scores en uitslagen zijn per editie gescheiden. De <strong>actieve editie</strong> is de officieel lopende editie.
          </div>
        </div>
        <div class="nav-group-items hidden" id="sidebar-editie-dropdown">
          <div id="sidebar-editie-items"><span class="sidebar-editie-laden">Laden\u2026</span></div>
        </div>
      </div>
    `);
  }

  // Algemeen — altijd zichtbaar
  groups.push(navGroup('algemeen', 'public', 'Algemeen', [
    navItem('/', 'home', 'Home'),
    navItem('/programma', 'event', 'Programma'),
    navItem('/uitslagen', 'emoji_events', 'Uitslagen'),
    navItem('/over', 'info', 'Over de RSW'),
  ]));

  // Mijn deelname — leiding of vrijwilliger
  if (loggedIn && hasRole('leiding', 'vrijwilliger')) {
    const items = [];
    if (hasRole('leiding')) {
      items.push(navItem('/inschrijvingen', 'assignment', 'Inschrijving patrouilles'));
    }
    if (hasRole('vrijwilliger')) {
      items.push(navItem('/vrijwilliger/inschrijving', 'volunteer_activism', 'Mijn inschrijving'));
    }
    items.push(navItem('/catering', 'restaurant', 'Catering'));
    groups.push(navGroup('deelname', 'assignment', 'Mijn deelname', items));
  }

  // Jury & Scores — jury of spelbegeleider
  if (loggedIn && hasRole('jury', 'spelbegeleider')) {
    const items = [];
    if (hasRole('jury')) {
      items.push(navItem('/scoreformulier', 'rate_review', 'Scoreformulier'));
    }
    if (hasRole('spelbegeleider')) {
      items.push(navItem('/scoreformulier', 'groups', 'Mijn categorie'));
    }
    items.push(navItem('/scores', 'leaderboard', hasRole('spelbegeleider') ? 'Live scoretabel' : 'Live scores'));
    groups.push(navGroup('jury', 'edit_note', 'Jury & Scores', items));
  }

  // Organisatie — organisator of admin
  if (loggedIn && hasRole('organisator', 'admin')) {
    groups.push(navGroup('organisatie', 'settings', 'Organisatie', [
      navSubGroup('org-inschrijvingen', 'content_paste', 'Inschrijvingen', [
        navItem('/edities', 'flag', 'Edities'),
        navItem('/inschrijvingen', 'assignment', 'Inschrijvingen'),
        navItem('/organisator/aanvragen', 'inbox', 'Aanvragen'),
        navItem('/organisator/vrijwilligers', 'volunteer_activism', 'Vrijwilligers'),
        navItem('/organisator/catering', 'restaurant', 'Catering'),
      ]),
      navSubGroup('org-locatie', 'location_on', 'Locatie', [
        navItem('/organisator/subkampen', 'holiday_village', 'Subkampen'),
        navItem('/organisator/plattegrond', 'map', 'Plattegrond'),
      ]),
      navSubGroup('org-wedstrijd', 'category', 'Wedstrijd', [
        navItem('/organisator/categorieen', 'category', 'Categorieën'),
        navItem('/organisator/programma', 'event', 'Programma'),
        navItem('/organisator/jury', 'content_paste', 'Jury-indeling'),
        navItem('/scores', 'leaderboard', 'Scorebeheer'),
      ]),
      navSubGroup('org-rally', 'directions_bike', 'Rally', [
        navItem('/organisator/rally-beheer', 'push_pin', 'Rally beheer'),
        navItem('/organisator/rally-tracking', 'leaderboard', 'Rally tracking'),
      ]),
    ]));
  }

  // Beheer — admin only
  if (loggedIn && hasRole('admin')) {
    groups.push(navGroup('beheer', 'build', 'Beheer', [
      navItem('/admin/gebruikers', 'person', 'Gebruikers'),
      navItem('/admin/verenigingen', 'location_city', 'Verenigingen'),
      navItem('/admin/versie', 'update', 'Versie & Updates'),
    ]));
  }

  // Account — altijd als ingelogd
  if (loggedIn) {
    groups.push(navGroup('account', 'account_circle', 'Account', [
      navItem('/profiel', 'manage_accounts', 'Mijn profiel'),
    ]));
  }

  return `<nav class="sidebar-inner" aria-label="Hoofdnavigatie">${groups.join('')}</nav>`;
}

function navItem(route, icon, label) {
  return `
    <a href="${route}" class="nav-item" data-route="${route}">
      <span class="nav-item-icon"><span class="material-icons">${icon}</span></span>
      <span class="nav-item-label">${label}</span>
    </a>
  `;
}

function navGroup(id, icon, label, children) {
  const state = getGroupState();
  // Standaard open, tenzij gebruiker het gesloten heeft
  const isCollapsed = state[id] === false;
  return `
    <div class="nav-group" data-group-id="${id}">
      <button class="nav-group-header ${isCollapsed ? 'collapsed' : ''}" aria-expanded="${!isCollapsed}">
        <span class="nav-group-header-left">
          <span class="nav-group-icon"><span class="material-icons">${icon}</span></span>
          <span class="nav-group-label">${label}</span>
        </span>
        <span class="nav-group-chevron"><span class="material-icons" aria-hidden="true">expand_more</span></span>
      </button>
      <div class="nav-group-items ${isCollapsed ? 'hidden' : ''}">
        ${Array.isArray(children) ? children.join('') : children}
      </div>
    </div>
  `;
}

function navSubGroup(id, icon, label, items) {
  const state = getGroupState();
  const isCollapsed = state[id] === false;
  return `
    <div class="nav-subgroup" data-group-id="${id}">
      <button class="nav-subgroup-header ${isCollapsed ? 'collapsed' : ''}" aria-expanded="${!isCollapsed}">
        <span class="nav-subgroup-header-left">
          <span class="nav-subgroup-icon"><span class="material-icons">${icon}</span></span>
          <span class="nav-subgroup-label">${label}</span>
        </span>
        <span class="nav-group-chevron"><span class="material-icons" aria-hidden="true">expand_more</span></span>
      </button>
      <div class="nav-subgroup-items ${isCollapsed ? 'hidden' : ''}">
        ${items.join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function initEditieSwitcher(el) {
  // Laad actieve editie als er nog niets geselecteerd is
  if (!getGeselecteerdeEditie()) {
    try {
      const actief = await get('/publiek/editie/actief');
      setGeselecteerdeEditie(actief);
      const naamEl = el.querySelector('#sidebar-editie-naam');
      if (naamEl) naamEl.textContent = actief.naam;
    } catch {
      const naamEl = el.querySelector('#sidebar-editie-naam');
      if (naamEl) naamEl.textContent = 'Geen editie';
    }
  }

  // Info-knop: toggle info-panel (onafhankelijk van dropdown)
  el.querySelector('#sidebar-editie-info-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.querySelector('#sidebar-editie-info-panel')?.classList.toggle('hidden');
  });

  // Wissel-knop (hele header-rij): toggle dropdown (onafhankelijk van info)
  el.querySelector('#sidebar-editie-wissel-btn')?.addEventListener('click', async (e) => {
    if (e.target.closest('#sidebar-editie-info-btn')) return;
    const drop = el.querySelector('#sidebar-editie-dropdown');
    const chevron = el.querySelector('#sidebar-editie-chevron');
    const wordtGesloten = !drop.classList.toggle('hidden');
    chevron?.classList.toggle('collapsed', wordtGesloten);
    if (!drop.classList.contains('hidden')) {
      await vulSidebarEditieDropdown(el);
    }
  });
}

async function vulSidebarEditieDropdown(el) {
  const itemsEl = el.querySelector('#sidebar-editie-items');
  if (!alleEdities) {
    try {
      alleEdities = await get('/publiek/edities');
    } catch {
      itemsEl.innerHTML = '<span class="sidebar-editie-laden">Fout bij laden</span>';
      return;
    }
  }
  const geselecteerd = getGeselecteerdeEditie();
  itemsEl.innerHTML = alleEdities.map(e => `
    <button class="sidebar-editie-optie${geselecteerd?.id === e.id ? ' actief' : ''}"
            data-editie-id="${e.id}" data-editie-naam="${escapeHtml(e.naam)}">
      <span>${escapeHtml(e.naam)}</span>
      ${e.actief ? '<span class="badge badge-success">Actief</span>' : ''}
    </button>
  `).join('');

  itemsEl.querySelectorAll('[data-editie-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const editie = { id: Number(btn.dataset.editieId), naam: btn.dataset.editieNaam };
      setGeselecteerdeEditie(editie);
      el.querySelector('#sidebar-editie-naam').textContent = editie.naam;
      el.querySelector('#sidebar-editie-dropdown').classList.add('hidden');
      el.querySelector('#sidebar-editie-chevron')?.classList.add('collapsed');
      alleEdities = null;

      if (window.innerWidth <= 768 && el.classList.contains('open')) {
        el.classList.remove('open');
        document.getElementById('sidebar-overlay')?.remove();
      }
    });
  });
}

function bindSidebarEvents(el) {
  // Nav-item klik: active markeren + mobiel menu sluiten
  el.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      if (window.innerWidth <= 768 && el.classList.contains('open')) {
        el.classList.remove('open');
        document.getElementById('sidebar-overlay')?.remove();
      }
    });
  });

  // Groep uitklappen/inklappen
  el.querySelectorAll('.nav-group-header, .nav-subgroup-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('[data-group-id]');
      const id = group.dataset.groupId;
      const itemsEl = group.querySelector('.nav-group-items, .nav-subgroup-items');
      const isNowCollapsed = !header.classList.contains('collapsed');

      header.classList.toggle('collapsed', isNowCollapsed);
      header.setAttribute('aria-expanded', String(!isNowCollapsed));
      itemsEl.classList.toggle('hidden', isNowCollapsed);

      // Staat opslaan
      const state = getGroupState();
      state[id] = !isNowCollapsed; // true = open, false = gesloten
      saveGroupState(state);
    });
  });
}

export function setActiveNavItem() {
  const route = location.pathname || '/';

  document.querySelectorAll('.nav-item[data-route]').forEach(item => {
    const itemRoute = item.dataset.route;
    const match = route === itemRoute
      || (itemRoute !== '/' && route.startsWith(itemRoute));
    item.classList.toggle('active', match);
  });
}
