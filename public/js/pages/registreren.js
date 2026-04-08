// public/js/pages/registreren.js — Registratieformulier met rolkeuze

import { post, getVacatures, getGroepen } from '../services/api.js';
import { escapeHtml } from '../utils/escape.js';
import { notify }     from '../utils/notify.js';

// Lees ?rol= query-param uit de URL: /registreren?rol=vrijwilliger
function getInitieleRol() {
  const params = new URLSearchParams(location.search);
  const rol = params.get('rol');
  if (rol === 'vrijwilliger') return 'vrijwilliger';
  if (rol === 'overig')       return 'overig';
  return 'leiding';
}

let vacatures = [];
let groepen   = [];

export async function render() {
  document.getElementById('content').innerHTML = `
    <div style="display:flex;justify-content:center;align-items:flex-start;padding:40px 16px">
      <div class="auth-wrapper" style="max-width:480px;width:100%;">
        <div class="auth-card">
          <div class="auth-logo">
            <div style="font-size:2.5rem">⚜️</div>
            <div class="auth-title">Account aanmaken</div>
            <div class="auth-subtitle">RSW Portaal — Regio De Langstraat</div>
          </div>


          <div id="reg-form-container">
            <div class="loading-spinner"></div>
          </div>

          <div class="auth-footer" id="reg-footer">
            Heb je al een account? <a href="/login">Inloggen</a>
          </div>
        </div>
      </div>
    </div>`;
}

export async function onMount() {
  [vacatures, groepen] = await Promise.all([
    getVacatures().catch(() => []),
    getGroepen().catch(() => []),
  ]);
  renderFormulier(getInitieleRol());
}

// ── Formulier bouwen ──────────────────────────────────────────────

function renderFormulier(rol) {
  document.getElementById('reg-form-container').innerHTML = `
    <form id="reg-form" novalidate>

      <!-- Rolkeuze tabs -->
      <div class="tabs mb-24" style="margin-bottom:1.5rem;">
        <button type="button" class="tab-btn ${rol === 'leiding' ? 'active' : ''}" data-rol="leiding">
          <span class="material-icons">content_paste</span> Ik ben leiding
        </button>
        <button type="button" class="tab-btn ${rol === 'vrijwilliger' ? 'active' : ''}" data-rol="vrijwilliger">
          <span class="material-icons">volunteer_activism</span> Ik word vrijwilliger
        </button>
        <button type="button" class="tab-btn ${rol === 'overig' ? 'active' : ''}" data-rol="overig">
          <span class="material-icons">person</span> Overig
        </button>
      </div>

      <!-- Rol-toelichting -->
      <div id="rol-toelichting" class="alert alert-info" style="margin-bottom:1.25rem;display:flex;">
        <span class="alert-icon"><span class="material-icons">info</span></span>
        <span id="rol-toelichting-tekst">${rolToelichting(rol)}</span>
      </div>

      <!-- Naam -->
      <div class="form-group">
        <label class="form-label" for="reg-naam">Volledige naam</label>
        <input class="form-input" type="text" id="reg-naam" placeholder="Jan de Vries"
          autocomplete="name" required />
        <div class="form-hint error" id="err-naam" style="display:none"></div>
      </div>

      <!-- E-mail -->
      <div class="form-group">
        <label class="form-label" for="reg-email">E-mailadres</label>
        <input class="form-input" type="email" id="reg-email" placeholder="jij@voorbeeld.nl"
          autocomplete="email" required />
        <div class="form-hint error" id="err-email" style="display:none"></div>
      </div>

      <!-- Wachtwoord -->
      <div class="form-group">
        <label class="form-label" for="reg-ww">Wachtwoord</label>
        <div class="input-with-icon">
          <input class="form-input" type="password" id="reg-ww" placeholder="Minimaal 8 tekens"
            autocomplete="new-password" required />
          <button type="button" class="input-icon-btn" id="toggle-ww" title="Toon/verberg wachtwoord">👁</button>
        </div>
        <div class="form-hint" id="ww-hint">Minimaal 8 tekens</div>
        <div class="form-hint error" id="err-ww" style="display:none"></div>
      </div>

      <!-- Wachtwoord herhalen -->
      <div class="form-group">
        <label class="form-label" for="reg-ww2">Wachtwoord herhalen</label>
        <input class="form-input" type="password" id="reg-ww2" placeholder="Herhaal wachtwoord"
          autocomplete="new-password" required />
        <div class="form-hint error" id="err-ww2" style="display:none"></div>
      </div>

      <!-- Rol-specifiek gedeelte -->
      <div id="rol-specifiek">
        ${buildRolSpecifiek(rol)}
      </div>

      <!-- Opmerking -->
      <div class="form-group">
        <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
        <textarea class="form-input" id="reg-opmerking" rows="2"
          placeholder="Eventuele opmerkingen voor de organisatie"></textarea>
      </div>

      <input type="hidden" id="reg-rol" value="${rol}">

      <button type="submit" class="btn btn-primary w-full" id="reg-btn">
        Account aanmaken
      </button>
    </form>
  `;

  bindFormEvents();
}

function buildRolSpecifiek(rol) {
  if (rol === 'leiding') {
    if (!groepen.length) {
      return `<div class="alert alert-info" style="margin-bottom:1rem;"><span class="alert-icon">ℹ️</span><span>Er zijn nog geen groepen beschikbaar. De organisatie koppelt je aan een groep na goedkeuring.</span></div>`;
    }
    const opties = groepen.map(g =>
      `<option value="${g.id}">${escapeHtml(g.naam)}</option>`
    ).join('');
    return `
      <div class="form-group">
        <label class="form-label" for="reg-groep">Gewenste groep <span class="text-error">*</span></label>
        <select class="form-input" id="reg-groep" required>
          <option value="">— Kies een groep —</option>
          ${opties}
        </select>
        <div class="form-hint">Na goedkeuring word je gekoppeld aan deze groep.</div>
        <div class="form-hint error" id="err-groep" style="display:none"></div>
      </div>
    `;
  }

  if (rol === 'overig') return ''; // Geen extra velden

  if (rol === 'vrijwilliger') {
    if (!vacatures.length) {
      return `<div class="alert alert-info" style="margin-bottom:1rem;"><span class="alert-icon">ℹ️</span><span>Er zijn nog geen vacatures. Je kunt na het aanmelden je voorkeur opgeven.</span></div>`;
    }
    const kaarten = vacatures.map(v => {
      const bezet = Number(v.aanmeldingen);
      const max   = v.max_vrijwilligers ? Number(v.max_vrijwilligers) : null;
      const vol   = max !== null && bezet >= max;
      const nog   = v.benodigd ? Math.max(0, Number(v.benodigd) - bezet) : null;

      return `
        <label class="vacature-keuze-kaart ${vol ? 'vol' : ''}" style="display:block;border:2px solid var(--color-border);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:8px;cursor:${vol ? 'not-allowed' : 'pointer'};transition:border-color .15s;" data-id="${v.id}">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="radio" name="reg-vacature" value="${v.id}" ${vol ? 'disabled' : ''}>
            <div style="flex:1;">
              <div style="font-weight:600;">${escapeHtml(v.naam)}</div>
              ${v.omschrijving ? `<div class="text-muted text-sm">${escapeHtml(v.omschrijving)}</div>` : ''}
              <div class="text-sm" style="margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
                ${vol ? '<span class="badge badge-error">Vol</span>' : '<span class="badge badge-success">Open</span>'}
                ${nog !== null && nog > 0 ? `<span class="badge badge-warning">Nog ${nog} benodigd!</span>` : ''}
                ${max ? `<span class="text-muted"><span class="material-icons" style="font-size:0.9rem">groups</span> ${bezet}/${max}</span>` : ''}
              </div>
            </div>
          </div>
        </label>
      `;
    }).join('');

    return `
      <div class="form-group">
        <label class="form-label">Vacature <span class="text-muted">(optioneel)</span></label>
        <div id="vacature-kaarten">
          <label class="vacature-keuze-kaart" style="display:block;border:2px solid var(--color-border);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:8px;cursor:pointer;" data-id="">
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="radio" name="reg-vacature" value="" checked>
              <div><div style="font-weight:600;">Geen voorkeur</div><div class="text-muted text-sm">De organisatie verdeelt de taken</div></div>
            </div>
          </label>
          ${kaarten}
        </div>
      </div>
    `;
  }

  return '';
}

function rolToelichting(rol) {
  if (rol === 'leiding')     return 'Als leiding schrijf je patrouilles in namens jouw scoutinggroep. Je aanvraag wordt goedgekeurd door de organisatie.';
  if (rol === 'vrijwilliger') return 'Als vrijwilliger help je mee op de wedstrijddag. Je aanmelding wordt bevestigd door de organisatie.';
  return 'Maak een account aan om het portaal te gebruiken. De organisatie kan je daarna een rol toewijzen.';
}

// ── Events ────────────────────────────────────────────────────────

function bindFormEvents() {
  document.getElementById('toggle-ww')?.addEventListener('click', () => {
    const inp = document.getElementById('reg-ww');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Rolwissel via tabs
  document.querySelectorAll('.tab-btn[data-rol]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('reg-rol').value = btn.dataset.rol;
      document.querySelectorAll('.tab-btn[data-rol]').forEach(b =>
        b.classList.toggle('active', b.dataset.rol === btn.dataset.rol)
      );
      document.getElementById('rol-toelichting-tekst').textContent = rolToelichting(btn.dataset.rol);
      document.getElementById('rol-specifiek').innerHTML = buildRolSpecifiek(btn.dataset.rol);
      bindKaartEvents();
    });
  });

  bindKaartEvents();

  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();

    const naam = document.getElementById('reg-naam').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const ww    = document.getElementById('reg-ww').value;
    const ww2   = document.getElementById('reg-ww2').value;
    const rol   = document.getElementById('reg-rol').value;

    let ok = true;
    if (!naam)         { toonFout('err-naam',  'Naam is verplicht'); ok = false; }
    if (!email)        { toonFout('err-email', 'E-mailadres is verplicht'); ok = false; }
    if (ww.length < 8) { toonFout('err-ww',   'Wachtwoord moet minimaal 8 tekens zijn'); ok = false; }
    if (ww !== ww2)    { toonFout('err-ww2',  'Wachtwoorden komen niet overeen'); ok = false; }

    const apiRol  = rol === 'overig' ? 'bezoeker' : rol;
    const groep_id = rol === 'leiding'
      ? document.getElementById('reg-groep')?.value || null
      : null;

    if (rol === 'leiding' && groepen.length && !groep_id) {
      toonFout('err-groep', 'Kies een groep'); ok = false;
    }

    if (!ok) return;

    const gekozenVacature = document.querySelector('input[name="reg-vacature"]:checked');
    const vacature_id = gekozenVacature?.value ? Number(gekozenVacature.value) : null;
    const opmerking   = document.getElementById('reg-opmerking')?.value.trim() || null;

    const btn = document.getElementById('reg-btn');
    btn.disabled = true;
    btn.textContent = 'Account aanmaken...';

    try {
      const data = await post('/auth/registreer', {
        naam, email, wachtwoord: ww, rol: apiRol,
        groep_id:    groep_id    ? Number(groep_id) : null,
        vacature_id: vacature_id ?? null,
        opmerking,
      });
      notify.success(data.message);
      document.getElementById('reg-form').style.display = 'none';
    } catch (err) {
      notify.error(err.message);
      btn.disabled = false;
      btn.textContent = 'Account aanmaken';
    }
  });
}

function bindKaartEvents() {
  document.querySelectorAll('.vacature-keuze-kaart').forEach(kaart => {
    kaart.addEventListener('click', () => {
      const radio = kaart.querySelector('input[type="radio"]');
      if (radio && !radio.disabled) {
        radio.checked = true;
        document.querySelectorAll('.vacature-keuze-kaart').forEach(k =>
          k.style.borderColor = 'var(--color-border)'
        );
        kaart.style.borderColor = 'var(--color-primary)';
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function toonFout(id, tekst) {
  const el = document.getElementById(id);
  if (el) { el.textContent = tekst; el.style.display = 'block'; }
}

function clearErrors() {
  ['err-naam','err-email','err-ww','err-ww2','err-groep'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

