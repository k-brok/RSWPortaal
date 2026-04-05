// public/js/pages/organisator/subkampen-modals.js — Modals voor subkampen beheer

import { escapeHtml } from '../../utils/escape.js';

export function buildModals() {
  return `
    <div class="modal-backdrop hidden" id="sub-modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sub-modal-titel">
        <div class="modal-header">
          <div class="modal-title" id="sub-modal-titel">Subkamp</div>
          <button class="btn-icon" id="sub-modal-sluiten"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div id="sub-modal-error" class="alert alert-error mb-16" style="display:none">
            <span class="alert-icon"><span class="material-icons">error</span></span><span id="sub-modal-error-tekst"></span>
          </div>
          <form id="sub-form" novalidate>
            <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end" class="mb-16">
              <div class="form-group" style="margin:0">
                <label class="form-label" for="sub-naam">Naam <span style="color:var(--color-primary)">*</span></label>
                <input class="form-input" type="text" id="sub-naam" placeholder="bijv. Subkamp A" maxlength="100" />
                <div class="form-hint error" id="err-sub-naam" style="display:none"></div>
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label" for="sub-kleur">Kleur</label>
                <input type="color" id="sub-kleur" value="#3498db"
                       style="width:48px;height:40px;padding:2px;border:1px solid var(--color-border);
                              border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="sub-omschrijving">Omschrijving</label>
              <textarea class="form-input" id="sub-omschrijving" rows="2"
                        placeholder="Optionele notities over dit subkamp" style="resize:vertical"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="sub-groep">Gekoppelde groep (optioneel)</label>
              <select class="form-input" id="sub-groep">
                <option value="">— Geen —</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="sub-vereniging">Gekoppelde vereniging (optioneel)</label>
              <select class="form-input" id="sub-vereniging">
                <option value="">— Geen —</option>
              </select>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="sub-modal-annuleer">Annuleren</button>
          <button class="btn btn-primary" id="sub-modal-opslaan">Opslaan</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop hidden" id="sub-confirm-backdrop">
      <div class="modal confirm-dialog" role="alertdialog" aria-modal="true">
        <div class="modal-header">
          <div class="modal-title" id="sub-confirm-titel">Bevestigen</div>
        </div>
        <div class="modal-body">
          <p id="sub-confirm-tekst"></p>
          <div id="sub-confirm-error" class="alert alert-error mt-16" style="display:none">
            <span class="alert-icon"><span class="material-icons">error</span></span><span id="sub-confirm-error-tekst"></span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="sub-confirm-annuleer">Annuleren</button>
          <button class="btn btn-danger" id="sub-confirm-ok">Verwijderen</button>
        </div>
      </div>
    </div>
  `;
}

export function vulGroepenEnVerenigingen(groepen, verenigingen) {
  const groepSel = document.getElementById('sub-groep');
  const verSel   = document.getElementById('sub-vereniging');
  if (!groepSel || !verSel) return;

  groepSel.innerHTML = '<option value="">— Geen —</option>' +
    groepen.map(g => `<option value="${g.id}">${escapeHtml(g.naam)}</option>`).join('');
  verSel.innerHTML   = '<option value="">— Geen —</option>' +
    verenigingen.map(v => `<option value="${v.id}">${escapeHtml(v.naam)}</option>`).join('');
}

export function openSubkampModal(subkamp, onOpslaan) {
  const backdrop = document.getElementById('sub-modal-backdrop');
  document.getElementById('sub-modal-titel').textContent = subkamp ? 'Subkamp bewerken' : 'Subkamp toevoegen';
  document.getElementById('sub-naam').value         = subkamp?.naam ?? '';
  document.getElementById('sub-kleur').value        = subkamp?.kleur ?? '#3498db';
  document.getElementById('sub-omschrijving').value = subkamp?.omschrijving ?? '';
  document.getElementById('sub-groep').value        = subkamp?.groep_id ?? '';
  document.getElementById('sub-vereniging').value   = subkamp?.vereniging_id ?? '';
  document.getElementById('err-sub-naam').style.display  = 'none';
  document.getElementById('sub-modal-error').style.display = 'none';

  backdrop.classList.remove('hidden');
  document.getElementById('sub-naam').focus();

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('sub-modal-sluiten').onclick  = sluit;
  document.getElementById('sub-modal-annuleer').onclick = sluit;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) sluit(); }, { once: true });

  document.getElementById('sub-modal-opslaan').onclick = async () => {
    const naam = document.getElementById('sub-naam').value.trim();
    document.getElementById('err-sub-naam').style.display = 'none';
    if (!naam) {
      document.getElementById('err-sub-naam').textContent = 'Naam is verplicht';
      document.getElementById('err-sub-naam').style.display = 'block';
      return;
    }
    const data = {
      naam,
      kleur:         document.getElementById('sub-kleur').value,
      omschrijving:  document.getElementById('sub-omschrijving').value.trim() || null,
      groep_id:      Number(document.getElementById('sub-groep').value) || null,
      vereniging_id: Number(document.getElementById('sub-vereniging').value) || null,
    };
    const btn = document.getElementById('sub-modal-opslaan');
    btn.disabled = true; btn.textContent = 'Opslaan…';
    try {
      await onOpslaan(data, subkamp?.id ?? null);
      sluit();
    } catch (e) {
      document.getElementById('sub-modal-error-tekst').textContent = e.message;
      document.getElementById('sub-modal-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Opslaan';
  };
}

export function openConfirm(titel, html, onBevestig) {
  const backdrop = document.getElementById('sub-confirm-backdrop');
  document.getElementById('sub-confirm-titel').textContent = titel;
  document.getElementById('sub-confirm-tekst').innerHTML   = html;
  document.getElementById('sub-confirm-error').style.display = 'none';
  backdrop.classList.remove('hidden');

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('sub-confirm-annuleer').onclick = sluit;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) sluit(); }, { once: true });

  document.getElementById('sub-confirm-ok').onclick = async () => {
    const btn = document.getElementById('sub-confirm-ok');
    btn.disabled = true; btn.textContent = 'Bezig…';
    try { await onBevestig(); sluit(); }
    catch (e) {
      document.getElementById('sub-confirm-error-tekst').textContent = e.message;
      document.getElementById('sub-confirm-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Verwijderen';
  };
}
