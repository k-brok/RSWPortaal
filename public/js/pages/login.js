// login.js — Inlogpagina (afwijkende layout: geen sidebar, gecentreerd)

import { login } from '../services/auth.js';
import { navigate } from '../utils/router.js';

export function render() {
  document.getElementById('content').innerHTML = buildLogin();
}

export function onMount() {
  document.getElementById('login-form').addEventListener('submit', handleSubmit);
  document.getElementById('toggle-wachtwoord').addEventListener('click', toggleWachtwoord);
}

// ── HTML ──────────────────────────────────────────────────────────

function buildLogin() {
  return `
    <div class="auth-wrapper" style="max-width:420px; margin:40px auto;">
      <div class="auth-card">

        <div class="auth-logo">
          <span class="material-icons" style="font-size:2.5rem;">landscape</span>
          <h1 class="auth-title">RSW Portaal</h1>
          <p class="auth-subtitle">Regio De Langstraat</p>
        </div>

        <h2 style="font-size:1.15rem; margin-bottom:24px;">Inloggen</h2>

        <div id="login-error" class="alert alert-error" style="display:none;">
          <span class="alert-icon"><span class="material-icons">warning</span></span>
          <span id="login-error-msg"></span>
        </div>

        <form id="login-form" novalidate>

          <div class="form-group">
            <label class="form-label" for="email">E-mailadres</label>
            <input
              class="form-input"
              type="email"
              id="email"
              name="email"
              placeholder="naam@voorbeeld.nl"
              autocomplete="email"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="wachtwoord">
              Wachtwoord
              <a href="#/wachtwoord-vergeten" class="form-label-link">Vergeten?</a>
            </label>
            <div class="input-with-icon">
              <input
                class="form-input"
                type="password"
                id="wachtwoord"
                name="wachtwoord"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
              <button type="button" class="input-icon-btn" id="toggle-wachtwoord" title="Wachtwoord tonen/verbergen">
                <span class="material-icons">visibility</span>
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary w-full" id="login-btn" style="margin-top:8px;">
            Inloggen
          </button>

        </form>

        <div class="auth-footer">
          Nog geen account?
          <a href="#/registreren">Registreren</a>
        </div>

      </div>
    </div>
  `;
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();
  setError(null);

  const email      = document.getElementById('email').value.trim();
  const wachtwoord = document.getElementById('wachtwoord').value;
  const btn        = document.getElementById('login-btn');

  if (!email || !wachtwoord) {
    setError('Vul je e-mailadres en wachtwoord in.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig met inloggen…';

  try {
    await login(email, wachtwoord);
    navigate('#/');
  } catch (err) {
    setError(err.message || 'Inloggen mislukt. Controleer je gegevens.');
    btn.disabled = false;
    btn.textContent = 'Inloggen';
  }
}

function toggleWachtwoord() {
  const input = document.getElementById('wachtwoord');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function setError(msg) {
  const box = document.getElementById('login-error');
  const txt = document.getElementById('login-error-msg');
  if (msg) {
    txt.textContent = msg;
    box.style.display = 'flex';
  } else {
    box.style.display = 'none';
  }
}
