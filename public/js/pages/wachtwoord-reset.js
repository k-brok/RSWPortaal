// public/js/pages/wachtwoord-reset.js — Nieuw wachtwoord instellen via reset-token

import { post }       from '../services/api.js';
import { escapeHtml } from '../utils/escape.js';

function getToken() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  return params.get('token') ?? '';
}

export function render() {
  const token = getToken();
  document.getElementById('content').innerHTML = !token
    ? `<div style="display:flex;justify-content:center;padding:40px 16px">
         <div class="auth-wrapper"><div class="auth-card">
           <div class="alert alert-error"><span class="alert-icon">❌</span>
             <span>Ongeldige of verlopen resetlink. Vraag een nieuwe aan via
               <a href="#/wachtwoord-vergeten">wachtwoord vergeten</a>.</span>
           </div>
         </div></div>
       </div>`
    : `<div style="display:flex;justify-content:center;align-items:flex-start;padding:40px 16px">
        <div class="auth-wrapper">
          <div class="auth-card">
            <div class="auth-logo">
              <div style="font-size:2.5rem">🔒</div>
              <div class="auth-title">Nieuw wachtwoord</div>
              <div class="auth-subtitle">Kies een sterk wachtwoord</div>
            </div>

            <div id="wr-alert" style="display:none" class="alert alert-info">
              <span class="alert-icon">ℹ️</span>
              <span id="wr-alert-tekst"></span>
            </div>

            <form id="wr-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="wr-ww">Nieuw wachtwoord</label>
                <div class="input-with-icon">
                  <input class="form-input" type="password" id="wr-ww"
                         placeholder="Minimaal 8 tekens" autocomplete="new-password" required />
                  <button type="button" class="input-icon-btn" id="toggle-wr">👁</button>
                </div>
                <div class="form-hint error" id="err-wr-ww" style="display:none"></div>
              </div>
              <div class="form-group">
                <label class="form-label" for="wr-ww2">Herhaal wachtwoord</label>
                <input class="form-input" type="password" id="wr-ww2"
                       placeholder="Herhaal wachtwoord" autocomplete="new-password" required />
                <div class="form-hint error" id="err-wr-ww2" style="display:none"></div>
              </div>
              <button type="submit" class="btn btn-primary w-full" id="wr-btn">
                Wachtwoord opslaan
              </button>
            </form>

            <div class="auth-footer"><a href="#/login">← Terug naar inloggen</a></div>
          </div>
        </div>
      </div>`;
}

export function onMount() {
  const token = getToken();
  if (!token) return;

  document.getElementById('toggle-wr').addEventListener('click', () => {
    const inp = document.getElementById('wr-ww');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('wr-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ww  = document.getElementById('wr-ww').value;
    const ww2 = document.getElementById('wr-ww2').value;

    ['err-wr-ww','err-wr-ww2'].forEach(id => { document.getElementById(id).style.display='none'; });

    let ok = true;
    if (ww.length < 8) { document.getElementById('err-wr-ww').textContent = 'Minimaal 8 tekens'; document.getElementById('err-wr-ww').style.display='block'; ok=false; }
    if (ww !== ww2)    { document.getElementById('err-wr-ww2').textContent = 'Wachtwoorden komen niet overeen'; document.getElementById('err-wr-ww2').style.display='block'; ok=false; }
    if (!ok) return;

    const btn = document.getElementById('wr-btn');
    btn.disabled = true; btn.textContent = 'Opslaan...';

    try {
      const data = await post('/auth/wachtwoord-reset', { token, wachtwoord: ww });
      toonAlert('success', `${data.message} Je wordt doorgestuurd...`);
      document.getElementById('wr-form').style.display = 'none';
      setTimeout(() => { location.hash = '#/login'; }, 2500);
    } catch (err) {
      toonAlert('error', escapeHtml(err.message));
      btn.disabled = false; btn.textContent = 'Wachtwoord opslaan';
    }
  });
}

function toonAlert(type, tekst) {
  const el   = document.getElementById('wr-alert');
  const icon = { success: '✅', error: '❌' };
  el.className = `alert alert-${type}`;
  el.querySelector('.alert-icon').textContent = icon[type] ?? 'ℹ️';
  document.getElementById('wr-alert-tekst').textContent = tekst;
  el.style.display = 'flex';
}
