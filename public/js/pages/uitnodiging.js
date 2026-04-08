// public/js/pages/uitnodiging.js — Account activeren via uitnodigingslink

import { post }     from '../services/api.js';
import { navigate } from '../utils/router.js';
import { notify }   from '../utils/notify.js';

function getToken() {
  const params = new URLSearchParams(location.search);
  return params.get('token') ?? '';
}

export function render() {
  const token = getToken();
  document.getElementById('content').innerHTML = !token
    ? `<div style="display:flex;justify-content:center;padding:40px 16px">
         <div class="auth-wrapper"><div class="auth-card">
           <div class="alert alert-error"><span class="alert-icon">❌</span>
             <span>Ongeldige of verlopen uitnodigingslink. Neem contact op met de beheerder.</span>
           </div>
         </div></div>
       </div>`
    : `<div style="display:flex;justify-content:center;align-items:flex-start;padding:40px 16px">
        <div class="auth-wrapper">
          <div class="auth-card">
            <div class="auth-logo">
              <div style="font-size:2.5rem">🔑</div>
              <div class="auth-title">Account activeren</div>
              <div class="auth-subtitle">Stel een eigen wachtwoord in om verder te gaan</div>
            </div>


            <form id="ui-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="ui-ww">Wachtwoord</label>
                <div class="input-with-icon">
                  <input class="form-input" type="password" id="ui-ww"
                         placeholder="Minimaal 8 tekens" autocomplete="new-password" required />
                  <button type="button" class="input-icon-btn" id="toggle-ui">👁</button>
                </div>
                <div class="form-hint error" id="err-ui-ww" style="display:none"></div>
              </div>
              <div class="form-group">
                <label class="form-label" for="ui-ww2">Herhaal wachtwoord</label>
                <input class="form-input" type="password" id="ui-ww2"
                       placeholder="Herhaal wachtwoord" autocomplete="new-password" required />
                <div class="form-hint error" id="err-ui-ww2" style="display:none"></div>
              </div>
              <button type="submit" class="btn btn-primary w-full" id="ui-btn">
                Account activeren
              </button>
            </form>
          </div>
        </div>
      </div>`;
}

export function onMount() {
  const token = getToken();
  if (!token) return;

  document.getElementById('toggle-ui').addEventListener('click', () => {
    const inp = document.getElementById('ui-ww');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('ui-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ww  = document.getElementById('ui-ww').value;
    const ww2 = document.getElementById('ui-ww2').value;

    ['err-ui-ww','err-ui-ww2'].forEach(id => { document.getElementById(id).style.display='none'; });

    let ok = true;
    if (ww.length < 8) { document.getElementById('err-ui-ww').textContent = 'Minimaal 8 tekens'; document.getElementById('err-ui-ww').style.display='block'; ok=false; }
    if (ww !== ww2)    { document.getElementById('err-ui-ww2').textContent = 'Wachtwoorden komen niet overeen'; document.getElementById('err-ui-ww2').style.display='block'; ok=false; }
    if (!ok) return;

    const btn = document.getElementById('ui-btn');
    btn.disabled = true; btn.textContent = 'Bezig...';

    try {
      const data = await post('/auth/wachtwoord-reset', { token, wachtwoord: ww });
      notify.success(`${data.message} Je wordt doorgestuurd naar de loginpagina...`, 2500);
      document.getElementById('ui-form').style.display = 'none';
      setTimeout(() => { navigate('/login'); }, 2500);
    } catch (err) {
      notify.error(err.message);
      btn.disabled = false; btn.textContent = 'Account activeren';
    }
  });
}
