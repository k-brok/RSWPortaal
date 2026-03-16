// public/js/pages/registreren.js — Registratieformulier

import { post } from '../services/api.js';
import { escapeHtml } from '../utils/escape.js';
import { navigate }   from '../utils/router.js';

export function render() {
  document.getElementById('content').innerHTML = `
    <div style="display:flex;justify-content:center;align-items:flex-start;padding:40px 16px">
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-logo">
            <div style="font-size:2.5rem">⚜️</div>
            <div class="auth-title">Account aanmaken</div>
            <div class="auth-subtitle">RSW Portaal — Regio De Langstraat</div>
          </div>

          <div id="reg-alert" class="alert alert-info" style="display:none">
            <span class="alert-icon">ℹ️</span>
            <span id="reg-alert-tekst"></span>
          </div>

          <form id="reg-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="reg-naam">Volledige naam</label>
              <input class="form-input" type="text" id="reg-naam" placeholder="Jan de Vries" autocomplete="name" required />
              <div class="form-hint error" id="err-naam" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-email">E-mailadres</label>
              <input class="form-input" type="email" id="reg-email" placeholder="jij@voorbeeld.nl" autocomplete="email" required />
              <div class="form-hint error" id="err-email" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-ww">Wachtwoord</label>
              <div class="input-with-icon">
                <input class="form-input" type="password" id="reg-ww" placeholder="Minimaal 8 tekens" autocomplete="new-password" required />
                <button type="button" class="input-icon-btn" id="toggle-ww" title="Toon/verberg wachtwoord">👁</button>
              </div>
              <div class="form-hint" id="ww-hint">Minimaal 8 tekens</div>
              <div class="form-hint error" id="err-ww" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-ww2">Wachtwoord herhalen</label>
              <input class="form-input" type="password" id="reg-ww2" placeholder="Herhaal wachtwoord" autocomplete="new-password" required />
              <div class="form-hint error" id="err-ww2" style="display:none"></div>
            </div>
            <button type="submit" class="btn btn-primary w-full" id="reg-btn">
              Account aanmaken
            </button>
          </form>

          <div class="auth-footer">
            Heb je al een account? <a href="#/login">Inloggen</a>
          </div>
        </div>
      </div>
    </div>`;
}

export function onMount() {
  document.getElementById('toggle-ww').addEventListener('click', () => {
    const inp = document.getElementById('reg-ww');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('reg-form').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();

    const naam = document.getElementById('reg-naam').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const ww    = document.getElementById('reg-ww').value;
    const ww2   = document.getElementById('reg-ww2').value;

    let ok = true;
    if (!naam)        { toonFout('err-naam', 'Naam is verplicht'); ok = false; }
    if (!email)       { toonFout('err-email', 'E-mailadres is verplicht'); ok = false; }
    if (ww.length < 8){ toonFout('err-ww', 'Wachtwoord moet minimaal 8 tekens zijn'); ok = false; }
    if (ww !== ww2)   { toonFout('err-ww2', 'Wachtwoorden komen niet overeen'); ok = false; }
    if (!ok) return;

    const btn = document.getElementById('reg-btn');
    btn.disabled = true;
    btn.textContent = 'Account aanmaken...';

    try {
      const data = await post('/auth/registreer', { naam, email, wachtwoord: ww });
      toonAlert('success', data.message);
      document.getElementById('reg-form').style.display = 'none';
    } catch (err) {
      toonAlert('error', escapeHtml(err.message));
      btn.disabled = false;
      btn.textContent = 'Account aanmaken';
    }
  });
}

function toonFout(id, tekst) {
  const el = document.getElementById(id);
  if (el) { el.textContent = tekst; el.style.display = 'block'; }
}

function clearErrors() {
  ['err-naam','err-email','err-ww','err-ww2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function toonAlert(type, tekst) {
  const el = document.getElementById('reg-alert');
  const txt = document.getElementById('reg-alert-tekst');
  const icon = { success: '✅', error: '❌', info: 'ℹ️' };
  el.className = `alert alert-${type}`;
  el.querySelector('.alert-icon').textContent = icon[type] ?? 'ℹ️';
  txt.textContent = tekst;
  el.style.display = 'flex';
}
