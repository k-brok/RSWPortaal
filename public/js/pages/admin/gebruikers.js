// admin/gebruikers.js — Gebruikersbeheer (admin only)

import { api } from '../../services/api.js';
import { hasRole } from '../../services/auth.js';
import { openGebruikerModal } from './gebruikers-modal.js';

// Lokale state
let gebruikers = [];
let groepen    = [];
let zoekterm   = '';
let rolFilter  = '';

// Document-niveau click handler (voor sluiten dropdown bij klik buiten)
let _docClickHandler = null;

export async function render() {
  if (!hasRole('admin')) {
    document.getElementById('content').innerHTML = buildGeenToegang();
    return;
  }

  document.getElementById('content').innerHTML = buildSkeleton();

  [gebruikers, groepen] = await Promise.all([
    api.get('/admin/gebruikers'),
    api.get('/admin/groepen'),
  ]);

  toonPagina();
}

export function onMount() {
  window.__gebruikerOpgeslagen = async (bijgewerkt, isNieuw) => {
    if (isNieuw) gebruikers.push(bijgewerkt);
    else {
      const idx = gebruikers.findIndex(g => g.id === bijgewerkt.id);
      if (idx !== -1) gebruikers[idx] = bijgewerkt;
    }
    toonPagina();
  };

  // Sluit open dropdowns bij klik buiten
  _docClickHandler = () => sluitDropdowns();
  document.addEventListener('click', _docClickHandler);
}

export function onDestroy() {
  delete window.__gebruikerOpgeslagen;
  if (_docClickHandler) {
    document.removeEventListener('click', _docClickHandler);
    _docClickHandler = null;
  }
}

// ── Pagina tonen / herrenderen ────────────────────────────────────

function toonPagina() {
  document.getElementById('content').innerHTML = buildPagina();
  bindEvents();
}

function buildPagina() {
  const gefilterd = filterGebruikers();
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#128100; Gebruikersbeheer</h1>
        <p>Beheer alle gebruikers, rollen en groepskoppelingen.</p>
      </div>
      <button class="btn btn-primary" id="btn-toevoegen">&#43; Gebruiker toevoegen</button>
    </div>

    ${buildStatsRij()}

    <div class="card" style="padding:0; overflow:hidden;">
      <div style="padding:16px 20px; border-bottom:1px solid var(--color-border);">
        <div class="filter-bar">
          <input
            class="form-input"
            type="search"
            id="zoek-input"
            placeholder="Zoeken op naam of e-mail…"
            value="${escapeHtml(zoekterm)}"
          />
          <select class="form-input" id="rol-filter">
            <option value="">Alle rollen</option>
            ${rolOpties()}
          </select>
        </div>
      </div>

      <div class="table-wrapper" style="border:none; border-radius:0;">
        ${buildTabel(gefilterd)}
      </div>
    </div>

    <div id="modal-container"></div>
    <div id="confirm-container"></div>
  `;
}

function buildStatsRij() {
  const teller = (rol) => gebruikers.filter(g => g.rol === rol).length;
  const chips = [
    { label: 'Admin',          n: teller('admin'),          kleur: 'var(--color-primary)' },
    { label: 'Organisator',    n: teller('organisator'),    kleur: 'var(--color-info)'    },
    { label: 'Leiding',        n: teller('leiding'),        kleur: 'var(--color-success)' },
    { label: 'Vrijwilliger',   n: teller('vrijwilliger'),   kleur: 'var(--color-warning)' },
    { label: 'Jury',           n: teller('jury'),           kleur: 'var(--color-text-muted)' },
    { label: 'Spelbegeleider', n: teller('spelbegeleider'), kleur: 'var(--color-text-muted)' },
  ];
  return `
    <div class="stats-row">
      <div class="stat-chip"><strong>${gebruikers.length}</strong> totaal</div>
      ${chips.map(c => `
        <div class="stat-chip">
          <span style="width:8px;height:8px;border-radius:50%;background:${c.kleur};display:inline-block;"></span>
          <strong>${c.n}</strong> ${c.label}
        </div>
      `).join('')}
    </div>
  `;
}

function buildTabel(lijst) {
  if (!lijst.length) {
    return `<div class="empty-state" style="padding:48px 20px;">
      <div class="empty-state-icon">&#128100;</div>
      <p class="empty-state-text">Geen gebruikers gevonden.</p>
    </div>`;
  }

  const statusBadge = (g) => g.geverifieerd
    ? '<span class="badge badge-success">&#10003; Geverifieerd</span>'
    : '<span class="badge badge-warning">Niet geverifieerd</span>';

  const rijen = lijst.map(g => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${initialen(g.naam)}</div>
          <div class="user-cell-info">
            <div class="name">${escapeHtml(g.naam)}</div>
            <div class="email">${escapeHtml(g.email)}</div>
            <span class="badge ${rolBadgeKleur(g.rol)} mob-rol-badge">${g.rol}</span>
          </div>
        </div>
      </td>
      <td class="col-mobile-hide"><span class="badge ${rolBadgeKleur(g.rol)}">${g.rol}</span></td>
      <td class="col-tablet-hide muted">${g.groep ? escapeHtml(g.groep) : '—'}</td>
      <td class="col-tablet-hide">${statusBadge(g)}</td>
      <td style="text-align:right;">
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
          <button class="btn-icon uitklap-toggle" data-uitklap="${g.id}" title="Details tonen" aria-expanded="false">&#9660;</button>
          <div class="actie-dropdown" data-id="${g.id}">
            <button class="btn-icon actie-toggle" title="Acties" aria-label="Acties voor ${escapeHtml(g.naam)}">&#8942;</button>
            <div class="actie-menu">
              <button class="dropdown-item" data-actie="bewerken" data-id="${g.id}">
                &#9998;&#xFE0E; Bewerken
              </button>
              ${g.geverifieerd ? `
              <button class="dropdown-item" data-actie="wachtwoord-reset" data-id="${g.id}">
                &#128273; Wachtwoord resetten
              </button>
              ` : `
              <button class="dropdown-item" data-actie="uitnodigen" data-id="${g.id}">
                &#9993;&#xFE0E; Uitnodiging opnieuw versturen
              </button>
              `}
              <button class="dropdown-item" data-actie="sessies-beeindigen" data-id="${g.id}">
                &#128274; Sessies be&#235;indigen
              </button>
              <hr class="dropdown-divider">
              <button class="dropdown-item dropdown-item-danger" data-actie="verwijderen" data-id="${g.id}">
                &#128465; Verwijderen
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
    <tr class="uitklap-rij" id="uitklap-${g.id}">
      <td colspan="5" style="padding:0;">
        <div class="uitklap-content">
          <div class="uitklap-item uitklap-alleen-mobiel">
            <span class="uitklap-label">Rol</span>
            <span class="badge ${rolBadgeKleur(g.rol)}">${g.rol}</span>
          </div>
          <div class="uitklap-item">
            <span class="uitklap-label">Groep</span>
            <span>${g.groep ? escapeHtml(g.groep) : '—'}</span>
          </div>
          <div class="uitklap-item">
            <span class="uitklap-label">Status</span>
            ${statusBadge(g)}
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Gebruiker</th>
          <th class="col-mobile-hide">Rol</th>
          <th class="col-tablet-hide">Groep</th>
          <th class="col-tablet-hide">Status</th>
          <th style="text-align:right;">Acties</th>
        </tr>
      </thead>
      <tbody>${rijen}</tbody>
    </table>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('btn-toevoegen')?.addEventListener('click', () => {
    openGebruikerModal(null, groepen);
  });

  document.getElementById('zoek-input')?.addEventListener('input', (e) => {
    zoekterm = e.target.value;
    herlaadTabel();
  });

  document.getElementById('rol-filter')?.addEventListener('change', (e) => {
    rolFilter = e.target.value;
    herlaadTabel();
  });

  document.querySelector('.data-table tbody')?.addEventListener('click', async (e) => {
    // Uitklap-toggle
    const uitklapKnop = e.target.closest('.uitklap-toggle');
    if (uitklapKnop) {
      const id  = uitklapKnop.dataset.uitklap;
      const rij = document.getElementById(`uitklap-${id}`);
      if (!rij) return;
      const isOpen = rij.classList.toggle('open');
      uitklapKnop.classList.toggle('open', isOpen);
      uitklapKnop.setAttribute('aria-expanded', String(isOpen));
      return;
    }

    // Toggle actie-dropdown
    const toggle = e.target.closest('.actie-toggle');
    if (toggle) {
      e.stopPropagation(); // Voorkomt dat de document-listener hem direct weer sluit
      const dropdown = toggle.closest('.actie-dropdown');
      const wasOpen = dropdown.classList.contains('open');
      sluitDropdowns();
      if (!wasOpen) dropdown.classList.add('open');
      return;
    }

    // Actie-knop in dropdown
    const btn = e.target.closest('[data-actie]');
    if (!btn) return;

    sluitDropdowns();

    const id       = Number(btn.dataset.id);
    const actie    = btn.dataset.actie;
    const gebruiker = gebruikers.find(g => g.id === id);

    if (actie === 'bewerken') {
      openGebruikerModal(gebruiker, groepen);
    }

    if (actie === 'wachtwoord-reset') {
      if (!confirm(`Wachtwoord-reset e-mail sturen naar "${gebruiker?.naam}" (${gebruiker?.email})?\n\nDe link is 1 uur geldig.`)) return;
      try {
        const res = await api.post(`/admin/gebruikers/${id}/wachtwoord-reset`);
        toonToast(res.message ?? 'Wachtwoord-reset verstuurd.', 'success');
      } catch (err) {
        toonToast(err.message || 'Verzenden mislukt.', 'error');
      }
    }

    if (actie === 'uitnodigen') {
      if (!confirm(`Activatie-uitnodiging opnieuw sturen naar "${gebruiker?.naam}" (${gebruiker?.email})?\n\nDe link is 7 dagen geldig en vervangt een eventuele eerdere link.`)) return;
      try {
        const res = await api.post(`/admin/gebruikers/${id}/uitnodigen`);
        toonToast(res.message ?? 'Uitnodiging verstuurd.', 'success');
      } catch (err) {
        toonToast(err.message || 'Verzenden mislukt.', 'error');
      }
    }

    if (actie === 'sessies-beeindigen') {
      if (!confirm(`Alle actieve sessies van "${gebruiker?.naam}" beëindigen?\n\nDe gebruiker wordt direct uitgelogd op alle apparaten.`)) return;
      try {
        const res = await api.post(`/admin/gebruikers/${id}/sessies-beeindigen`);
        toonToast(res.message ?? 'Sessies beëindigd.', 'success');
      } catch (err) {
        toonToast(err.message || 'Actie mislukt.', 'error');
      }
    }

    if (actie === 'verwijderen') {
      if (!confirm(`Gebruiker "${gebruiker?.naam}" definitief verwijderen?\n\nDeze actie kan niet ongedaan worden gemaakt.`)) return;
      try {
        await api.delete(`/admin/gebruikers/${id}`);
        gebruikers = gebruikers.filter(g => g.id !== id);
        toonPagina();
        toonToast(`${gebruiker?.naam} is verwijderd.`, 'success');
      } catch (err) {
        toonToast(err.message || 'Verwijderen mislukt.', 'error');
      }
    }
  });
}

function herlaadTabel() {
  const wrapper = document.querySelector('.table-wrapper');
  if (wrapper) wrapper.innerHTML = buildTabel(filterGebruikers());
  bindEvents();
}

// ── Dropdown helpers ──────────────────────────────────────────────

function sluitDropdowns() {
  document.querySelectorAll('.actie-dropdown.open').forEach(d => d.classList.remove('open'));
}

// ── Toast ─────────────────────────────────────────────────────────

function toonToast(tekst, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = tekst;
  document.body.appendChild(toast);
  // Kleine timeout zodat de browser de initiële staat registreert voor de transitie
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast-zichtbaar'));
  });
  setTimeout(() => {
    toast.classList.remove('toast-zichtbaar');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────────

function filterGebruikers() {
  return gebruikers.filter(g => {
    const matchZoek = !zoekterm
      || g.naam.toLowerCase().includes(zoekterm.toLowerCase())
      || g.email.toLowerCase().includes(zoekterm.toLowerCase());
    const matchRol = !rolFilter || g.rol === rolFilter;
    return matchZoek && matchRol;
  });
}

function rolOpties() {
  const rollen = ['admin','organisator','leiding','vrijwilliger','jury','spelbegeleider'];
  return rollen.map(r =>
    `<option value="${r}" ${rolFilter === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
  ).join('');
}

function rolBadgeKleur(rol) {
  return { admin:'badge-primary', organisator:'badge-info', leiding:'badge-success',
           vrijwilliger:'badge-warning', jury:'badge-muted', spelbegeleider:'badge-muted' }[rol] ?? 'badge-muted';
}

function initialen(naam = '') {
  return naam.trim().split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildSkeleton() {
  return `<div class="page-loading"><div class="spinner"></div></div>`;
}

function buildGeenToegang() {
  return `<div class="empty-state" style="padding:80px 20px;">
    <div class="empty-state-icon">&#128274;</div>
    <p class="empty-state-text">Je hebt geen toegang tot deze pagina.</p>
  </div>`;
}
