// admin/gebruikers-modal.js — Modal voor toevoegen/bewerken gebruiker

import { api } from '../../services/api.js';

// ── Publieke API ──────────────────────────────────────────────────

export function openGebruikerModal(gebruiker, groepen) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = buildModal(gebruiker, groepen);
  bindModalEvents(gebruiker, groepen);
}

// ── HTML ──────────────────────────────────────────────────────────

function buildModal(gebruiker, groepen) {
  const isNieuw = !gebruiker;
  const g = gebruiker ?? {};

  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titel">

        <div class="modal-header">
          <h2 class="modal-title" id="modal-titel">
            ${isNieuw ? '&#43; Gebruiker toevoegen' : '&#9998; Gebruiker bewerken'}
          </h2>
          <button class="btn-icon" id="modal-sluiten" title="Sluiten">&#10005;</button>
        </div>

        <div class="modal-body">
          <div id="modal-fout" class="alert alert-error" style="display:none;">
            <span class="alert-icon">&#9888;&#65039;</span>
            <span id="modal-fout-tekst"></span>
          </div>

          <div class="form-group">
            <label class="form-label" for="f-naam">Naam</label>
            <input class="form-input" type="text" id="f-naam"
              placeholder="Volledige naam" value="${escapeHtml(g.naam ?? '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="f-email">E-mailadres</label>
            <input class="form-input" type="email" id="f-email"
              placeholder="naam@voorbeeld.nl" value="${escapeHtml(g.email ?? '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="f-rol">Rol</label>
            <select class="form-input" id="f-rol">
              ${rolOpties(g.rol)}
            </select>
          </div>

          <div class="form-group" id="groep-veld" style="${g.rol === 'leiding' ? '' : 'display:none;'}">
            <label class="form-label" for="f-groep">Groep koppeling</label>
            <select class="form-input" id="f-groep">
              <option value="">— Selecteer een groep —</option>
              ${groepen.map(gr =>
                `<option value="${gr.id}" ${Number(g.groep_id) === gr.id ? 'selected' : ''}>${escapeHtml(gr.naam)}</option>`
              ).join('')}
            </select>
            <p class="form-hint">Verplicht voor de leiding-rol.</p>
          </div>

          ${!isNieuw ? `
            <div class="form-group">
              <label class="form-label" for="f-geverifieerd">E-mail verificatie</label>
              <select class="form-input" id="f-geverifieerd">
                <option value="1" ${g.geverifieerd ? 'selected' : ''}>Geverifieerd</option>
                <option value="0" ${!g.geverifieerd ? 'selected' : ''}>Niet geverifieerd</option>
              </select>
            </div>
          ` : `
            <div class="alert alert-info" style="margin-top:4px;">
              <span class="alert-icon">&#8505;&#65039;</span>
              <span>De gebruiker ontvangt een verificatie-e-mail na aanmaken.</span>
            </div>
          `}
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="modal-annuleren">Annuleren</button>
          <button class="btn btn-primary" id="modal-opslaan">
            ${isNieuw ? 'Gebruiker aanmaken' : 'Wijzigingen opslaan'}
          </button>
        </div>

      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindModalEvents(gebruiker, groepen) {
  const isNieuw = !gebruiker;

  document.getElementById('modal-sluiten')?.addEventListener('click', sluitModal);
  document.getElementById('modal-annuleren')?.addEventListener('click', sluitModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') sluitModal();
  });

  // Groep-veld tonen/verbergen bij rolwijziging
  document.getElementById('f-rol')?.addEventListener('change', (e) => {
    document.getElementById('groep-veld').style.display =
      e.target.value === 'leiding' ? '' : 'none';
  });

  document.getElementById('modal-opslaan')?.addEventListener('click', () =>
    slaOp(gebruiker, isNieuw, groepen)
  );
}

async function slaOp(gebruiker, isNieuw, groepen) {
  const naam         = document.getElementById('f-naam').value.trim();
  const email        = document.getElementById('f-email').value.trim();
  const rol          = document.getElementById('f-rol').value;
  const groep_id     = rol === 'leiding' ? Number(document.getElementById('f-groep').value) || null : null;
  const geverifieerd = !isNieuw
    ? document.getElementById('f-geverifieerd').value === '1'
    : false;

  if (!naam || !email) return setFout('Naam en e-mailadres zijn verplicht.');
  if (rol === 'leiding' && !groep_id) return setFout('Selecteer een groep voor de leiding-rol.');

  const groep = groep_id ? groepen.find(g => g.id === groep_id)?.naam ?? null : null;
  const payload = { naam, email, rol, groep_id, groep, geverifieerd };

  const btn = document.getElementById('modal-opslaan');
  btn.disabled = true;
  btn.textContent = 'Bezig…';

  try {
    const resultaat = isNieuw
      ? await api.post('/admin/gebruikers', payload)
      : await api.put(`/admin/gebruikers/${gebruiker.id}`, payload);

    sluitModal();
    window.__gebruikerOpgeslagen?.(resultaat, isNieuw);
  } catch (err) {
    setFout(err.message || 'Opslaan mislukt.');
    btn.disabled = false;
    btn.textContent = isNieuw ? 'Gebruiker aanmaken' : 'Wijzigingen opslaan';
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function sluitModal() {
  const container = document.getElementById('modal-container');
  if (container) container.innerHTML = '';
}

function setFout(tekst) {
  const box = document.getElementById('modal-fout');
  const txt = document.getElementById('modal-fout-tekst');
  if (box && txt) { txt.textContent = tekst; box.style.display = 'flex'; }
}

function rolOpties(huidig = '') {
  const rollen = ['admin','organisator','leiding','vrijwilliger','jury','spelbegeleider'];
  return rollen.map(r =>
    `<option value="${r}" ${huidig === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
  ).join('');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
