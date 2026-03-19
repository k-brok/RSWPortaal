// public/js/pages/admin/verenigingen-modals.js — Modals voor verenigingen + groepen

import { escapeHtml } from '../../utils/escape.js';

// ── Modal HTML templates ──────────────────────────────────────────

export function buildModals() {
  return `
    <!-- Vereniging modal -->
    <div class="modal-backdrop hidden" id="ver-modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ver-modal-titel">
        <div class="modal-header">
          <div class="modal-title" id="ver-modal-titel">Vereniging</div>
          <button class="btn-icon" id="ver-modal-sluiten" aria-label="Sluiten">&#10005;</button>
        </div>
        <div class="modal-body">
          <div id="ver-modal-error" class="alert alert-error mb-16" style="display:none">
            <span class="alert-icon">❌</span><span id="ver-modal-error-tekst"></span>
          </div>
          <form id="ver-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="ver-naam">Naam <span style="color:var(--color-primary)">*</span></label>
              <input class="form-input" type="text" id="ver-naam" placeholder="Bijv. Scouting Regio De Langstraat" maxlength="255" />
              <div class="form-hint error" id="err-ver-naam" style="display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="ver-afkorting">
                Afkorting <span style="color:var(--color-primary)">*</span>
                <span class="form-label-link">max. 10 tekens</span>
              </label>
              <input class="form-input" type="text" id="ver-afkorting" placeholder="Bijv. SRL" maxlength="10"
                     style="text-transform:uppercase" />
              <div class="form-hint">Wordt automatisch in hoofdletters opgeslagen</div>
              <div class="form-hint error" id="err-ver-afkorting" style="display:none"></div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="ver-modal-annuleer">Annuleren</button>
          <button class="btn btn-primary" id="ver-modal-opslaan">Opslaan</button>
        </div>
      </div>
    </div>

    <!-- Groep modal -->
    <div class="modal-backdrop hidden" id="groep-modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="groep-modal-titel">
        <div class="modal-header">
          <div class="modal-title" id="groep-modal-titel">Groep</div>
          <button class="btn-icon" id="groep-modal-sluiten" aria-label="Sluiten">&#10005;</button>
        </div>
        <div class="modal-body">
          <div id="groep-modal-info" class="alert alert-info mb-16" style="display:none">
            <span class="alert-icon">&#8505;&#65039;</span>
            <span>Vereniging: <strong id="groep-ver-naam"></strong></span>
          </div>
          <div id="groep-modal-error" class="alert alert-error mb-16" style="display:none">
            <span class="alert-icon">❌</span><span id="groep-modal-error-tekst"></span>
          </div>
          <form id="groep-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="groep-naam">Naam <span style="color:var(--color-primary)">*</span></label>
              <input class="form-input" type="text" id="groep-naam" placeholder="Bijv. Scouting De Langstraat" maxlength="255" />
              <div class="form-hint error" id="err-groep-naam" style="display:none"></div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="groep-modal-annuleer">Annuleren</button>
          <button class="btn btn-primary" id="groep-modal-opslaan">Opslaan</button>
        </div>
      </div>
    </div>

    <!-- Bevestigingsdialoog -->
    <div class="modal-backdrop hidden" id="confirm-backdrop">
      <div class="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-titel">
        <div class="modal-header">
          <div class="modal-title" id="confirm-titel">Bevestigen</div>
        </div>
        <div class="modal-body">
          <p id="confirm-tekst"></p>
          <div id="confirm-error" class="alert alert-error mt-16" style="display:none">
            <span class="alert-icon">❌</span><span id="confirm-error-tekst"></span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="confirm-annuleer">Annuleren</button>
          <button class="btn btn-danger" id="confirm-ok">Verwijderen</button>
        </div>
      </div>
    </div>`;
}

// ── Vereniging modal ──────────────────────────────────────────────

export function openVerenigingModal(ver, onOpslaan) {
  const backdrop = document.getElementById('ver-modal-backdrop');
  document.getElementById('ver-modal-titel').textContent = ver ? 'Vereniging bewerken' : 'Vereniging toevoegen';
  document.getElementById('ver-naam').value      = ver?.naam      ?? '';
  document.getElementById('ver-afkorting').value = ver?.afkorting ?? '';
  document.getElementById('ver-modal-error').style.display = 'none';
  ['err-ver-naam','err-ver-afkorting'].forEach(id => { document.getElementById(id).style.display='none'; });

  backdrop.classList.remove('hidden');
  document.getElementById('ver-naam').focus();

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('ver-modal-sluiten').onclick  = sluit;
  document.getElementById('ver-modal-annuleer').onclick = sluit;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) sluit(); }, { once: true });

  document.getElementById('ver-modal-opslaan').onclick = async () => {
    const naam      = document.getElementById('ver-naam').value.trim();
    const afkorting = document.getElementById('ver-afkorting').value.trim();

    ['err-ver-naam','err-ver-afkorting'].forEach(id => { document.getElementById(id).style.display='none'; });
    let ok = true;
    if (!naam)      { toonFout('err-ver-naam', 'Naam is verplicht'); ok=false; }
    if (!afkorting) { toonFout('err-ver-afkorting', 'Afkorting is verplicht'); ok=false; }
    if (!ok) return;

    const btn = document.getElementById('ver-modal-opslaan');
    btn.disabled = true; btn.textContent = 'Opslaan…';

    try {
      await onOpslaan({ naam, afkorting }, ver?.id ?? null);
      sluit();
    } catch (e) {
      document.getElementById('ver-modal-error-tekst').textContent = e.message;
      document.getElementById('ver-modal-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Opslaan';
  };
}

// ── Groep modal ───────────────────────────────────────────────────

export function openGroepModal(groep, verenigingId, verenigingNaam, onOpslaan) {
  const backdrop = document.getElementById('groep-modal-backdrop');
  document.getElementById('groep-modal-titel').textContent = groep ? 'Groep bewerken' : 'Groep toevoegen';
  document.getElementById('groep-naam').value = groep?.naam ?? '';
  document.getElementById('groep-ver-naam').textContent = verenigingNaam;
  document.getElementById('groep-modal-info').style.display  = 'flex';
  document.getElementById('groep-modal-error').style.display = 'none';
  document.getElementById('err-groep-naam').style.display    = 'none';

  backdrop.classList.remove('hidden');
  document.getElementById('groep-naam').focus();

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('groep-modal-sluiten').onclick  = sluit;
  document.getElementById('groep-modal-annuleer').onclick = sluit;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) sluit(); }, { once: true });

  document.getElementById('groep-modal-opslaan').onclick = async () => {
    const naam = document.getElementById('groep-naam').value.trim();
    document.getElementById('err-groep-naam').style.display = 'none';
    if (!naam) { toonFout('err-groep-naam', 'Naam is verplicht'); return; }

    const btn = document.getElementById('groep-modal-opslaan');
    btn.disabled = true; btn.textContent = 'Opslaan…';
    try {
      await onOpslaan({ naam }, groep?.id ?? null, verenigingId);
      sluit();
    } catch (e) {
      document.getElementById('groep-modal-error-tekst').textContent = e.message;
      document.getElementById('groep-modal-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Opslaan';
  };
}

// ── Confirm dialog ────────────────────────────────────────────────

export function openConfirm(titel, html, onBevestig) {
  const backdrop = document.getElementById('confirm-backdrop');
  document.getElementById('confirm-titel').textContent    = titel;
  document.getElementById('confirm-tekst').innerHTML      = html;
  document.getElementById('confirm-error').style.display = 'none';

  backdrop.classList.remove('hidden');

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('confirm-annuleer').onclick = sluit;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) sluit(); }, { once: true });

  document.getElementById('confirm-ok').onclick = async () => {
    const btn = document.getElementById('confirm-ok');
    btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      await onBevestig();
      sluit();
    } catch (e) {
      document.getElementById('confirm-error-tekst').textContent = e.message;
      document.getElementById('confirm-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Verwijderen';
  };
}

function toonFout(id, tekst) {
  const el = document.getElementById(id);
  if (el) { el.textContent = tekst; el.style.display = 'block'; }
}
