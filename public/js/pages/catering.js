// catering.js — Catering aanmelding voor leiding en vrijwilligers

import { get, post, put, del } from '../services/api.js';
import { getUser, hasRole } from '../services/auth.js';

// ── State ─────────────────────────────────────────────────────────

let statusData = null; // { editie, aanvraag }

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">&#127859; Catering aanmelden</h1>
    </div>
    <div id="catering-inhoud">
      <div class="loading-spinner"></div>
    </div>
  `;
}

export async function onMount() {
  await laadStatus();
}

// ── Status ophalen ────────────────────────────────────────────────

async function laadStatus() {
  try {
    statusData = await get('/catering/status');
  } catch {
    statusData = { editie: null, aanvraag: null };
  }
  renderPagina();
}

// ── Hoofdpagina ───────────────────────────────────────────────────

function renderPagina() {
  const inhoud = document.getElementById('catering-inhoud');
  if (!inhoud) return;

  const { editie, aanvraag } = statusData ?? {};

  if (!editie) {
    inhoud.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;">&#127859;</div>
          <p class="text-muted">Er is momenteel geen actieve editie.</p>
        </div>
      </div>
    `;
    return;
  }

  if (!editie.catering_actief) {
    inhoud.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;">&#127859;</div>
          <p class="text-muted">Catering aanmelden is momenteel niet beschikbaar voor <strong>${esc(editie.naam)}</strong>.</p>
          <p class="text-muted text-sm">Neem contact op met de organisatie voor meer informatie.</p>
        </div>
      </div>
    `;
    return;
  }

  const isLeiding = hasRole('leiding') || hasRole('admin') || hasRole('organisator');
  const prijsPerPersoon = isLeiding
    ? editie.catering_prijs_leiding
    : editie.catering_prijs_vrijwilliger;

  if (aanvraag) {
    inhoud.innerHTML = buildAanvraagKaart(editie, aanvraag, prijsPerPersoon);
    bindAanvraagEvents();
  } else {
    inhoud.innerHTML = buildAanmeldenView(editie, prijsPerPersoon);
    bindAanmeldenEvents();
  }
}

// ── Kaart: bestaande aanvraag ─────────────────────────────────────

function buildAanvraagKaart(editie, aanvraag, prijsPerPersoon) {
  const totaalPrijs = prijsPerPersoon !== null && prijsPerPersoon !== undefined
    ? (Number(prijsPerPersoon) * aanvraag.aantal_personen).toFixed(2)
    : null;

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">&#127859; Catering aanmelding — ${esc(editie.naam)}</h2>
        <span class="badge badge-success">Aangemeld</span>
      </div>
      <div class="card-body">
        ${prijsPerPersoon !== null && prijsPerPersoon !== undefined ? `
          <div class="alert alert-info" style="margin-bottom:1.25rem;">
            <span class="alert-icon">&#8364;</span>
            <span>Prijs per persoon: <strong>&euro;&nbsp;${Number(prijsPerPersoon).toFixed(2)}</strong></span>
          </div>
        ` : ''}
        <form id="catering-form">
          <div class="form-group">
            <label class="form-label">Aantal personen <span class="text-error">*</span></label>
            <input type="number" id="aantal-personen" class="form-input"
              min="1" value="${aanvraag.aantal_personen}" style="max-width:140px;">
            ${totaalPrijs ? `<div class="form-hint" id="prijs-indicatie">Totaal: &euro;&nbsp;<span id="totaal-prijs">${totaalPrijs}</span></div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
            <textarea id="opmerking" class="form-input" rows="3"
              placeholder="Bijv. dieetwensen of allergieën">${esc(aanvraag.opmerking ?? '')}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-opslaan">Wijzigingen opslaan</button>
            <button type="button" class="btn btn-ghost btn-danger" id="btn-annuleren">Aanmelding annuleren</button>
          </div>
          <div id="catering-fout"   class="alert alert-error"   style="display:none;margin-top:1rem;"></div>
          <div id="catering-succes" class="alert alert-success" style="display:none;margin-top:1rem;"></div>
        </form>
      </div>
    </div>
  `;
}

// ── Aanmelden view ────────────────────────────────────────────────

function buildAanmeldenView(editie, prijsPerPersoon) {
  const heeftPrijs = prijsPerPersoon !== null && prijsPerPersoon !== undefined;
  const isLeiding = hasRole('leiding') || hasRole('admin') || hasRole('organisator');
  const rolLabel = isLeiding ? 'leiding' : 'vrijwilliger';

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">&#127859; Aanmelden voor catering</h2>
        <span class="badge badge-info">${esc(editie.naam)}</span>
      </div>
      <div class="card-body">
        ${heeftPrijs ? `
          <div class="alert alert-info" style="margin-bottom:1.25rem;">
            <span class="alert-icon">&#8364;</span>
            <span>Prijs per persoon (${rolLabel}): <strong>&euro;&nbsp;${Number(prijsPerPersoon).toFixed(2)}</strong></span>
          </div>
        ` : `
          <div class="alert alert-info" style="margin-bottom:1.25rem;">
            <span class="alert-icon">&#8505;</span>
            <span>Meld je aan voor catering tijdens <strong>${esc(editie.naam)}</strong>. De organisatie neemt contact op over de betaling.</span>
          </div>
        `}
        <form id="catering-form">
          <div class="form-group">
            <label class="form-label">Aantal personen <span class="text-error">*</span></label>
            <input type="number" id="aantal-personen" class="form-input"
              min="1" value="1" style="max-width:140px;">
            ${heeftPrijs ? `<div class="form-hint" id="prijs-indicatie">Totaal: &euro;&nbsp;<span id="totaal-prijs">${Number(prijsPerPersoon).toFixed(2)}</span></div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
            <textarea id="opmerking" class="form-input" rows="3"
              placeholder="Bijv. dieetwensen of allergieën"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-aanmelden">Aanmelden voor catering</button>
          </div>
          <div id="catering-fout" class="alert alert-error" style="display:none;margin-top:1rem;"></div>
        </form>
      </div>
    </div>
  `;
}

// ── Events: aanmelden ─────────────────────────────────────────────

function bindAanmeldenEvents() {
  const { editie } = statusData ?? {};
  const isLeiding = hasRole('leiding') || hasRole('admin') || hasRole('organisator');
  const prijsPerPersoon = isLeiding
    ? editie?.catering_prijs_leiding
    : editie?.catering_prijs_vrijwilliger;

  bindPrijsIndicatie(prijsPerPersoon);

  const form = document.getElementById('catering-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fout = document.getElementById('catering-fout');
    fout.style.display = 'none';

    const aantal = Number(document.getElementById('aantal-personen')?.value);
    if (!aantal || aantal < 1) {
      fout.textContent = 'Voer een geldig aantal personen in (minimaal 1).';
      fout.style.display = '';
      return;
    }

    const payload = {
      aantal_personen: aantal,
      opmerking: document.getElementById('opmerking')?.value.trim() || null,
    };

    const btn = document.getElementById('btn-aanmelden');
    btn.disabled = true;

    try {
      statusData.aanvraag = await post('/catering', payload);
      renderPagina();
    } catch (err) {
      fout.textContent = err.message ?? 'Er is een fout opgetreden.';
      fout.style.display = '';
      btn.disabled = false;
    }
  });
}

// ── Events: bestaande aanvraag bewerken/annuleren ─────────────────

function bindAanvraagEvents() {
  const { editie } = statusData ?? {};
  const isLeiding = hasRole('leiding') || hasRole('admin') || hasRole('organisator');
  const prijsPerPersoon = isLeiding
    ? editie?.catering_prijs_leiding
    : editie?.catering_prijs_vrijwilliger;

  bindPrijsIndicatie(prijsPerPersoon);

  const form   = document.getElementById('catering-form');
  const fout   = document.getElementById('catering-fout');
  const succes = document.getElementById('catering-succes');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    fout.style.display   = 'none';
    succes.style.display = 'none';

    const aantal = Number(document.getElementById('aantal-personen')?.value);
    if (!aantal || aantal < 1) {
      fout.textContent = 'Voer een geldig aantal personen in (minimaal 1).';
      fout.style.display = '';
      return;
    }

    const payload = {
      aantal_personen: aantal,
      opmerking: document.getElementById('opmerking')?.value.trim() || null,
    };

    const btn = document.getElementById('btn-opslaan');
    btn.disabled = true;

    try {
      statusData.aanvraag = await put(`/catering/${statusData.aanvraag.id}`, payload);
      succes.textContent = 'Aanmelding bijgewerkt.';
      succes.style.display = '';
    } catch (err) {
      fout.textContent = err.message ?? 'Er is een fout opgetreden.';
      fout.style.display = '';
    }
    btn.disabled = false;
  });

  document.getElementById('btn-annuleren')?.addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je je catering aanmelding wilt annuleren?')) return;
    try {
      await del(`/catering/${statusData.aanvraag.id}`);
      statusData.aanvraag = null;
      renderPagina();
    } catch (err) {
      const foutEl = document.getElementById('catering-fout');
      if (foutEl) { foutEl.textContent = err.message ?? 'Annuleren mislukt.'; foutEl.style.display = ''; }
    }
  });
}

// ── Live prijsindicatie bijwerken ─────────────────────────────────

function bindPrijsIndicatie(prijsPerPersoon) {
  if (prijsPerPersoon === null || prijsPerPersoon === undefined) return;

  const aantalInput  = document.getElementById('aantal-personen');
  const totaalSpan   = document.getElementById('totaal-prijs');
  if (!aantalInput || !totaalSpan) return;

  aantalInput.addEventListener('input', () => {
    const aantal = Math.max(0, Number(aantalInput.value) || 0);
    totaalSpan.textContent = (Number(prijsPerPersoon) * aantal).toFixed(2);
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
