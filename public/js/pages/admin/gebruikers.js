// admin/gebruikers.js — Gebruikersbeheer (admin only)

import { api } from '../../services/api.js';
import { hasRole } from '../../services/auth.js';
import { openGebruikerModal } from './gebruikers-modal.js';

// Lokale state
let gebruikers = [];
let groepen    = [];
let zoekterm   = '';
let rolFilter  = '';

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
  // Modal callback: herlaad de lijst na opslaan
  window.__gebruikerOpgeslagen = async (bijgewerkt, isNieuw) => {
    if (isNieuw) gebruikers.push(bijgewerkt);
    else {
      const idx = gebruikers.findIndex(g => g.id === bijgewerkt.id);
      if (idx !== -1) gebruikers[idx] = bijgewerkt;
    }
    toonPagina();
  };
}

export function onDestroy() {
  delete window.__gebruikerOpgeslagen;
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

  const rijen = lijst.map(g => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${initialen(g.naam)}</div>
          <div class="user-cell-info">
            <div class="name">${escapeHtml(g.naam)}</div>
            <div class="email">${escapeHtml(g.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${rolBadgeKleur(g.rol)}">${g.rol}</span></td>
      <td class="muted">${g.groep ? escapeHtml(g.groep) : '—'}</td>
      <td>
        ${g.geverifieerd
          ? '<span class="badge badge-success">&#10003; Geverifieerd</span>'
          : '<span class="badge badge-warning">Niet geverifieerd</span>'}
      </td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" title="Bewerken" data-actie="bewerken" data-id="${g.id}">&#9998;</button>
          <button class="btn-icon" title="Verwijderen" data-actie="verwijderen" data-id="${g.id}" style="color:var(--color-error);">&#128465;</button>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Gebruiker</th>
          <th>Rol</th>
          <th>Groep</th>
          <th>Status</th>
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
    const btn   = e.target.closest('[data-actie]');
    if (!btn) return;
    const id    = Number(btn.dataset.id);
    const actie = btn.dataset.actie;

    if (actie === 'bewerken') {
      const gebruiker = gebruikers.find(g => g.id === id);
      openGebruikerModal(gebruiker, groepen);
    }

    if (actie === 'verwijderen') {
      const gebruiker = gebruikers.find(g => g.id === id);
      if (confirm(`Gebruiker "${gebruiker?.naam}" verwijderen?`)) {
        await api.delete(`/admin/gebruikers/${id}`);
        gebruikers = gebruikers.filter(g => g.id !== id);
        toonPagina();
      }
    }
  });
}

function herlaadTabel() {
  const wrapper = document.querySelector('.table-wrapper');
  if (wrapper) wrapper.innerHTML = buildTabel(filterGebruikers());
  bindEvents();
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
