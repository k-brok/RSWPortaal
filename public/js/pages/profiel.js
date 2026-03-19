// public/js/pages/profiel.js — Profiel inzien, wachtwoord en e-mail wijzigen

import { get, post }  from '../services/api.js';
import { getUser }    from '../services/auth.js';
import { escapeHtml } from '../utils/escape.js';
import { navigate }   from '../utils/router.js';

export async function render() {
  const user = getUser();
  if (!user) { navigate('#/login'); return; }

  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>👤 Mijn profiel</h1>
        <p>Bekijk en wijzig je accountgegevens</p>
      </div>
    </div>

    <div class="dashboard-grid">

      <!-- Profiel info card -->
      <div class="card card-accent-info">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">ℹ️</span> Accountgegevens</div>
        </div>
        <div class="card-body">
          <div id="profiel-loading" class="text-muted text-sm">Laden...</div>
          <div id="profiel-info" style="display:none">
            <dl class="profiel-dl">
              <div class="profiel-dl-rij"><dt>Naam</dt><dd id="pi-naam"></dd></div>
              <div class="profiel-dl-rij"><dt>E-mail</dt><dd id="pi-email"></dd></div>
              <div class="profiel-dl-rij"><dt>Rol</dt><dd id="pi-rol"></dd></div>
              <div class="profiel-dl-rij"><dt>Groep</dt><dd id="pi-groep"></dd></div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Wachtwoord wijzigen -->
      <div class="card card-accent-warning">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">🔒</span> Wachtwoord wijzigen</div>
        </div>
        <div class="card-body">
          <div id="ww-alert" style="display:none" class="alert alert-info mb-16">
            <span class="alert-icon">ℹ️</span><span id="ww-alert-tekst"></span>
          </div>
          <form id="ww-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="ww-huidig">Huidig wachtwoord</label>
              <input class="form-input" type="password" id="ww-huidig" autocomplete="current-password" />
              <div class="form-hint error" id="err-ww-huidig" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="ww-nieuw">Nieuw wachtwoord</label>
              <input class="form-input" type="password" id="ww-nieuw" autocomplete="new-password" placeholder="Minimaal 8 tekens" />
              <div class="form-hint error" id="err-ww-nieuw" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="ww-herhaal">Herhaal nieuw wachtwoord</label>
              <input class="form-input" type="password" id="ww-herhaal" autocomplete="new-password" />
              <div class="form-hint error" id="err-ww-herhaal" style="display:none"></div>
            </div>
            <button type="submit" class="btn btn-primary" id="ww-btn">Wachtwoord wijzigen</button>
          </form>
        </div>
      </div>

      <!-- E-mail wijzigen -->
      <div class="card card-accent-primary">
        <div class="card-header">
          <div class="card-title"><span class="card-icon">✉️</span> E-mailadres wijzigen</div>
        </div>
        <div class="card-body">
          <div id="em-alert" style="display:none" class="alert alert-info mb-16">
            <span class="alert-icon">ℹ️</span><span id="em-alert-tekst"></span>
          </div>
          <form id="em-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="em-nieuw">Nieuw e-mailadres</label>
              <input class="form-input" type="email" id="em-nieuw" autocomplete="email" placeholder="nieuw@voorbeeld.nl" />
              <div class="form-hint error" id="err-em-nieuw" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="em-ww">Bevestig met wachtwoord</label>
              <input class="form-input" type="password" id="em-ww" autocomplete="current-password" />
              <div class="form-hint error" id="err-em-ww" style="display:none"></div>
            </div>
            <button type="submit" class="btn btn-primary" id="em-btn">Bevestigingsmail versturen</button>
          </form>
        </div>
      </div>

    </div>`;
}

export async function onMount() {
  // Laad profieldata
  try {
    const profiel = await get('/profiel');
    document.getElementById('pi-naam').textContent  = profiel.naam;
    document.getElementById('pi-email').textContent = profiel.email;
    document.getElementById('pi-rol').innerHTML     = `<span class="badge badge-primary">${escapeHtml(profiel.rol)}</span>`;
    document.getElementById('pi-groep').textContent = profiel.groep ?? '—';
    document.getElementById('profiel-loading').style.display = 'none';
    document.getElementById('profiel-info').style.display    = 'block';
  } catch { /* stil falen */ }

  // Wachtwoord wijzigen
  document.getElementById('ww-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(['err-ww-huidig','err-ww-nieuw','err-ww-herhaal']);

    const huidig  = document.getElementById('ww-huidig').value;
    const nieuw   = document.getElementById('ww-nieuw').value;
    const herhaal = document.getElementById('ww-herhaal').value;

    let ok = true;
    if (!huidig)         { toonFout('err-ww-huidig', 'Verplicht'); ok=false; }
    if (nieuw.length < 8){ toonFout('err-ww-nieuw', 'Minimaal 8 tekens'); ok=false; }
    if (nieuw !== herhaal){ toonFout('err-ww-herhaal', 'Wachtwoorden komen niet overeen'); ok=false; }
    if (!ok) return;

    const btn = document.getElementById('ww-btn');
    btn.disabled = true; btn.textContent = 'Opslaan...';
    try {
      const data = await post('/profiel/wachtwoord-wijzigen', { huidig_wachtwoord: huidig, nieuw_wachtwoord: nieuw });
      toonAlert('ww', 'success', data.message);
      document.getElementById('ww-form').reset();
    } catch (err) { toonAlert('ww', 'error', escapeHtml(err.message)); }
    btn.disabled = false; btn.textContent = 'Wachtwoord wijzigen';
  });

  // E-mail wijzigen
  document.getElementById('em-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(['err-em-nieuw','err-em-ww']);

    const nieuw = document.getElementById('em-nieuw').value.trim();
    const ww    = document.getElementById('em-ww').value;

    let ok = true;
    if (!nieuw){ toonFout('err-em-nieuw', 'Verplicht'); ok=false; }
    if (!ww)   { toonFout('err-em-ww', 'Verplicht'); ok=false; }
    if (!ok) return;

    const btn = document.getElementById('em-btn');
    btn.disabled = true; btn.textContent = 'Versturen...';
    try {
      const data = await post('/profiel/email-wijzigen', { nieuw_email: nieuw, wachtwoord: ww });
      toonAlert('em', 'success', data.message);
      document.getElementById('em-form').reset();
    } catch (err) { toonAlert('em', 'error', escapeHtml(err.message)); }
    btn.disabled = false; btn.textContent = 'Bevestigingsmail versturen';
  });
}

function toonFout(id, tekst) {
  const el = document.getElementById(id);
  if (el) { el.textContent = tekst; el.style.display = 'block'; }
}

function clearErrors(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

function toonAlert(prefix, type, tekst) {
  const el   = document.getElementById(`${prefix}-alert`);
  const icon = { success: '✅', error: '❌', info: 'ℹ️' };
  el.className = `alert alert-${type} mb-16`;
  el.querySelector('.alert-icon').textContent = icon[type] ?? 'ℹ️';
  document.getElementById(`${prefix}-alert-tekst`).textContent = tekst;
  el.style.display = 'flex';
}
