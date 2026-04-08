// public/js/pages/wachtwoord-vergeten.js

import { post }   from '../services/api.js';
import { notify } from '../utils/notify.js';

export function render() {
  document.getElementById('content').innerHTML = `
    <div style="display:flex;justify-content:center;align-items:flex-start;padding:40px 16px">
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-logo">
            <div style="font-size:2.5rem">🔑</div>
            <div class="auth-title">Wachtwoord vergeten</div>
            <div class="auth-subtitle">Vul je e-mailadres in om een resetlink te ontvangen</div>
          </div>

          <form id="wv-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="wv-email">E-mailadres</label>
              <input class="form-input" type="email" id="wv-email"
                     placeholder="jij@voorbeeld.nl" autocomplete="email" required />
            </div>
            <button type="submit" class="btn btn-primary w-full" id="wv-btn">
              Resetlink versturen
            </button>
          </form>

          <div class="auth-footer">
            <a href="/login">← Terug naar inloggen</a>
          </div>
        </div>
      </div>
    </div>`;
}

export function onMount() {
  document.getElementById('wv-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('wv-email').value.trim();
    if (!email) return;

    const btn = document.getElementById('wv-btn');
    btn.disabled = true;
    btn.textContent = 'Versturen...';

    try {
      const data = await post('/auth/wachtwoord-vergeten', { email });
      notify.success(data.message);
      document.getElementById('wv-form').style.display = 'none';
    } catch (err) {
      notify.error(err.message);
      btn.disabled = false;
      btn.textContent = 'Resetlink versturen';
    }
  });
}
