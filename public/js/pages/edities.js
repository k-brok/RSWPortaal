// public/js/pages/edities.js — Editiebeheer (admin: volledig | organisator: bewerken)

import { get, post, put, patch, del } from '../services/api.js';
import { getUser }    from '../services/auth.js';
import { escapeHtml } from '../utils/escape.js';
import { notify }     from '../utils/notify.js';

let edities = [];

function isAdmin() {
  return getUser()?.rol === 'admin';
}

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#128197; Edities</h1>
        <p>Beheer RSW-edities, inschrijvingsfasen en deelnemersregels</p>
      </div>
      ${isAdmin() ? '<button class="btn btn-primary" id="btn-nieuwe-editie">+ Nieuwe editie</button>' : ''}
    </div>
    <div id="edities-container"><div class="text-muted">Laden…</div></div>
    ${buildModals()}
  `;
}

export async function onMount() {
  if (isAdmin()) {
    document.getElementById('btn-nieuwe-editie').addEventListener('click', () =>
      openEditieModal(null, async (data) => {
        await post('/admin/edities', data);
        await laadEdities();
      })
    );
  }
  await laadEdities();
}

// ── Data ──────────────────────────────────────────────────────────

async function laadEdities() {
  try {
    edities = await get('/admin/edities');
    renderLijst();
  } catch (e) {
    document.getElementById('edities-container').innerHTML =
      `<div class="alert alert-error"><span class="alert-icon">❌</span>${escapeHtml(e.message)}</div>`;
  }
}

// ── Lijst ─────────────────────────────────────────────────────────

function bepaalFase(e) {
  const v = new Date().toISOString().slice(0, 10);
  const viStart = e.voorinschrijving_start, viSluit = e.voorinschrijving_sluit;
  if (viStart && viStart <= v && (!viSluit || viSluit >= v)) return 'voorinschrijving';
  const iStart = e.inschrijving_start, iSluit = e.inschrijving_sluit;
  if (iStart && iStart <= v && (!iSluit || iSluit >= v)) return 'inschrijving';
  return 'gesloten';
}

function renderLijst() {
  const container = document.getElementById('edities-container');
  if (!edities.length) {
    container.innerHTML = '<p class="text-muted">Nog geen edities aangemaakt.</p>';
    return;
  }
  container.innerHTML = edities.map(buildKaart).join('');
  bindEvents(container);
}

function buildKaart(e) {
  const rsw  = e.startdatum ? new Date(e.startdatum).toLocaleDateString('nl-NL') : '—';
  const lsw  = e.lsw_datum  ? new Date(e.lsw_datum).toLocaleDateString('nl-NL')  : '—';
  const fase = bepaalFase(e);
  const admin = isAdmin();
  return `
    <div class="card mb-16" data-editie-id="${e.id}">
      <div class="card-header">
        <div class="card-title" style="flex-wrap:wrap;gap:8px">
          <span style="font-size:1.1rem;font-weight:600">${escapeHtml(e.naam)}</span>
          ${e.actief ? '<span class="badge badge-success">Systeem-actief</span>' : ''}
          ${fase === 'voorinschrijving' ? '<span class="badge badge-info">Voorinschrijving open</span>' : ''}
          ${fase === 'inschrijving'     ? '<span class="badge badge-primary">Inschrijving open</span>' : ''}
          ${e.uitslagen_gepubliceerd   ? '<span class="badge badge-warning">Uitslagen gepubliceerd</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${admin && !e.actief ? `<button class="btn btn-ghost btn-sm btn-activeer" data-id="${e.id}" title="Stel in als actieve editie">&#9654; Activeer</button>` : ''}
          ${admin && e.actief  ? `<button class="btn btn-ghost btn-sm btn-deactiveer" data-id="${e.id}">Deactiveer</button>` : ''}
          <button class="btn btn-ghost btn-sm btn-bewerk" data-id="${e.id}">&#9999;&#65039; Bewerken</button>
          ${admin && !e.actief ? `<button class="btn btn-ghost btn-sm btn-verwijder" data-id="${e.id}" data-naam="${escapeHtml(e.naam)}"
                                style="color:var(--color-error)">&#128465; Verwijderen</button>` : ''}
        </div>
      </div>
      <div class="card-body" style="padding-top:0">
        <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:.85rem;color:var(--color-text-muted);margin-bottom:12px">
          <span><span class="material-icons" style="font-size:0.9rem">event</span> RSW: <strong style="color:var(--color-text)">${rsw}</strong></span>
          <span><span class="material-icons" style="font-size:0.9rem">flag</span> LSW: <strong style="color:var(--color-text)">${lsw}</strong></span>
          <span><span class="material-icons" style="font-size:0.9rem">location_on</span> ${escapeHtml(e.locatie ?? '—')}</span>
          <span><span class="material-icons" style="font-size:0.9rem">person</span> Max ${e.max_groepen} groepen</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:.8rem;color:var(--color-text-muted)">Fase:</span>
          <span style="font-size:.78rem;color:var(--color-text-muted)">
            ${e.voorinschrijving_start ? `VI: ${e.voorinschrijving_start?.slice(0,10)} – ${e.voorinschrijving_sluit?.slice(0,10) ?? '…'}` : 'Geen voorinschrijving ingesteld'}
          </span>
          <span style="color:var(--color-text-muted)">·</span>
          <span style="font-size:.78rem;color:var(--color-text-muted)">
            ${e.inschrijving_start ? `Inschr: ${e.inschrijving_start?.slice(0,10)} – ${e.inschrijving_sluit?.slice(0,10) ?? '…'}` : 'Geen inschrijving ingesteld'}
          </span>
          <button class="btn btn-sm ${e.uitslagen_gepubliceerd ? 'btn-warning' : 'btn-ghost'} btn-toggle"
                  data-id="${e.id}" data-veld="uitslagen_gepubliceerd" data-waarde="${e.uitslagen_gepubliceerd ? 0 : 1}"
                  style="font-size:.78rem">
            ${e.uitslagen_gepubliceerd ? '✓' : '○'} Uitslagen
          </button>
        </div>
        <div style="margin-top:10px;font-size:.78rem;color:var(--color-text-muted)">
          Scouts: ${e.min_scouts}–${e.max_scouts} per patrouille &nbsp;|&nbsp;
          Leeftijd op LSW: ${e.min_leeftijd ?? '?'}–${e.max_leeftijd ?? '?'} jaar &nbsp;|&nbsp;
          ${e.bm_label}: top ${e.bm_max_positie} uitgesloten
        </div>
      </div>
    </div>
  `;
}

function bindEvents(container) {
  if (isAdmin()) {
    container.querySelectorAll('.btn-activeer').forEach(btn =>
      btn.addEventListener('click', async () => {
        try { await post(`/admin/edities/${btn.dataset.id}/activeer`, {}); await laadEdities(); }
        catch (e) { notify.error(e.message); }
      })
    );
    container.querySelectorAll('.btn-deactiveer').forEach(btn =>
      btn.addEventListener('click', async () => {
        try { await post(`/admin/edities/${btn.dataset.id}/deactiveer`, {}); await laadEdities(); }
        catch (e) { notify.error(e.message); }
      })
    );
    container.querySelectorAll('.btn-verwijder').forEach(btn =>
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        openConfirm('Editie verwijderen?',
          `Weet je zeker dat je <strong>${escapeHtml(btn.dataset.naam)}</strong> wilt verwijderen?
           Alle patrouilles en inschrijvingen worden ook verwijderd.`,
          async () => { await del(`/admin/edities/${id}`); await laadEdities(); }
        );
      })
    );
  }
  container.querySelectorAll('.btn-bewerk').forEach(btn =>
    btn.addEventListener('click', () => {
      const editie = edities.find(e => e.id === Number(btn.dataset.id));
      openEditieModal(editie, async (data, id) => {
        await put(`/admin/edities/${id}`, data);
        await laadEdities();
      });
    })
  );
  container.querySelectorAll('.btn-toggle').forEach(btn =>
    btn.addEventListener('click', async () => {
      try {
        await patch(`/admin/edities/${btn.dataset.id}`,
          { veld: btn.dataset.veld, waarde: Number(btn.dataset.waarde) }
        );
        await laadEdities();
      } catch (e) { notify.error(e.message); }
    })
  );
}

// ── Modals (inline) ───────────────────────────────────────────────

function buildModals() {
  return `
    <div class="modal-backdrop hidden" id="editie-modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="editie-modal-titel"
           style="max-width:680px;max-height:90vh;overflow-y:auto">
        <div class="modal-header" style="position:sticky;top:0;background:var(--color-surface);z-index:1">
          <div class="modal-title" id="editie-modal-titel">Editie</div>
          <button class="btn-icon" id="editie-modal-sluiten" aria-label="Sluiten"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div id="editie-modal-error" class="alert alert-error mb-16" style="display:none">
            <span class="alert-icon"><span class="material-icons">error</span></span><span id="editie-modal-error-tekst"></span>
          </div>
          <form id="editie-form" novalidate>
            <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
              <legend style="padding:0 8px;font-size:.82rem;color:var(--color-text-muted)">Basisgegevens</legend>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group" style="grid-column:1/-1">
                  <label class="form-label" for="ed-naam">Naam <span style="color:var(--color-primary)">*</span></label>
                  <input class="form-input" type="text" id="ed-naam" placeholder="bijv. RSW 2027" maxlength="100" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-jaar">Jaar <span style="color:var(--color-primary)">*</span></label>
                  <input class="form-input" type="number" id="ed-jaar" min="2020" max="2099" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-max">Max groepen</label>
                  <input class="form-input" type="number" id="ed-max" min="1" max="200" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-datum">Startdatum RSW</label>
                  <input class="form-input" type="date" id="ed-datum" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-lsw">Datum LSW</label>
                  <input class="form-input" type="date" id="ed-lsw" />
                  <div class="form-hint">Leeftijden worden berekend op deze datum</div>
                </div>
                <div class="form-group" style="grid-column:1/-1">
                  <label class="form-label" for="ed-locatie">Locatie</label>
                  <input class="form-input" type="text" id="ed-locatie" placeholder="bijv. Speelbos De Langstraat" />
                </div>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
              <legend style="padding:0 8px;font-size:.82rem;color:var(--color-text-muted)">Inschrijvingsfasen</legend>
              <div class="form-hint" style="margin-bottom:12px">De fase wordt automatisch bepaald op basis van de datums. Laat sluitdatum leeg voor geen eindgrens.</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                  <label class="form-label" for="ed-vistart">Startdatum voorinschrijving</label>
                  <input class="form-input" type="date" id="ed-vistart" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-visluit">Sluitdatum voorinschrijving</label>
                  <input class="form-input" type="date" id="ed-visluit" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-istart">Startdatum inschrijving</label>
                  <input class="form-input" type="date" id="ed-istart" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-isluit">Sluitdatum inschrijving</label>
                  <input class="form-input" type="date" id="ed-isluit" />
                </div>
                <div class="form-group" style="grid-column:1/-1">
                  <label class="form-label" style="cursor:pointer">
                    <input type="checkbox" id="ed-uitslagen" style="margin-right:6px" />
                    Uitslagen gepubliceerd
                  </label>
                </div>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px">
              <legend style="padding:0 8px;font-size:.82rem;color:var(--color-text-muted)">Deelnemers instellingen</legend>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                  <label class="form-label" for="ed-minsc">Min scouts / patrouille</label>
                  <input class="form-input" type="number" id="ed-minsc" min="1" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-maxsc">Max scouts / patrouille</label>
                  <input class="form-input" type="number" id="ed-maxsc" min="1" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-minl">Min leeftijd op LSW</label>
                  <input class="form-input" type="number" id="ed-minl" min="1" placeholder="bijv. 11" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-maxl">Max leeftijd op LSW</label>
                  <input class="form-input" type="number" id="ed-maxl" min="1" placeholder="bijv. 15" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-oudl">Leeftijd "oudere scouts"</label>
                  <input class="form-input" type="number" id="ed-oudl" min="1" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-grens">Grote patrouille vanaf (scouts)</label>
                  <input class="form-input" type="number" id="ed-grens" min="1" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-oudkl">Max oudere scouts (kleine patr.)</label>
                  <input class="form-input" type="number" id="ed-oudkl" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-oudgr">Max oudere scouts (grote patr.)</label>
                  <input class="form-input" type="number" id="ed-oudgr" min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-bmlabel">Label "buiten mededinging"</label>
                  <input class="form-input" type="text" id="ed-bmlabel" placeholder="Buiten mededinging" maxlength="100" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="ed-bmpos">Kan niet in top X eindigen</label>
                  <input class="form-input" type="number" id="ed-bmpos" min="1" />
                  <div class="form-hint">bijv. 2 = mogen niet 1e of 2e worden</div>
                </div>
              </div>
            </fieldset>
          </form>
        </div>
        <div class="modal-footer" style="position:sticky;bottom:0;background:var(--color-surface)">
          <button class="btn btn-ghost" id="editie-modal-annuleer">Annuleren</button>
          <button class="btn btn-primary" id="editie-modal-opslaan">Opslaan</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop hidden" id="editie-confirm-backdrop">
      <div class="modal confirm-dialog" role="alertdialog">
        <div class="modal-header">
          <div class="modal-title" id="editie-confirm-titel">Bevestigen</div>
        </div>
        <div class="modal-body">
          <p id="editie-confirm-tekst"></p>
          <div id="editie-confirm-error" class="alert alert-error mt-16" style="display:none">
            <span class="alert-icon"><span class="material-icons">error</span></span><span id="editie-confirm-error-tekst"></span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost"   id="editie-confirm-annuleer">Annuleren</button>
          <button class="btn btn-danger" id="editie-confirm-ok">Verwijderen</button>
        </div>
      </div>
    </div>
  `;
}

function openEditieModal(editie, onOpslaan) {
  const backdrop = document.getElementById('editie-modal-backdrop');
  document.getElementById('editie-modal-titel').textContent = editie ? 'Editie bewerken' : 'Nieuwe editie';
  document.getElementById('editie-modal-error').style.display = 'none';

  const v = editie ?? {};
  document.getElementById('ed-naam').value    = v.naam     ?? '';
  document.getElementById('ed-jaar').value    = v.jaar     ?? (new Date().getFullYear() + 1);
  document.getElementById('ed-max').value     = v.max_groepen ?? 36;
  document.getElementById('ed-datum').value   = v.startdatum?.slice(0,10) ?? '';
  document.getElementById('ed-lsw').value     = v.lsw_datum?.slice(0,10)  ?? '';
  document.getElementById('ed-locatie').value = v.locatie  ?? '';
  document.getElementById('ed-vistart').value = v.voorinschrijving_start?.slice(0,10) ?? '';
  document.getElementById('ed-visluit').value = v.voorinschrijving_sluit?.slice(0,10) ?? '';
  document.getElementById('ed-istart').value  = v.inschrijving_start?.slice(0,10) ?? '';
  document.getElementById('ed-isluit').value  = v.inschrijving_sluit?.slice(0,10) ?? '';
  document.getElementById('ed-uitslagen').checked  = !!v.uitslagen_gepubliceerd;
  document.getElementById('ed-minsc').value  = v.min_scouts ?? 5;
  document.getElementById('ed-maxsc').value  = v.max_scouts ?? 7;
  document.getElementById('ed-minl').value   = v.min_leeftijd  ?? '';
  document.getElementById('ed-maxl').value   = v.max_leeftijd  ?? '';
  document.getElementById('ed-oudl').value   = v.ouderen_leeftijd  ?? 15;
  document.getElementById('ed-grens').value  = v.ouderen_grens     ?? 6;
  document.getElementById('ed-oudkl').value  = v.max_ouderen_klein ?? 1;
  document.getElementById('ed-oudgr').value  = v.max_ouderen_groot ?? 2;
  document.getElementById('ed-bmlabel').value = v.bm_label       ?? 'Buiten mededinging';
  document.getElementById('ed-bmpos').value   = v.bm_max_positie ?? 2;

  backdrop.classList.remove('hidden');
  document.getElementById('ed-naam').focus();

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('editie-modal-sluiten').onclick  = sluit;
  document.getElementById('editie-modal-annuleer').onclick = sluit;
  backdrop.onclick = e => { if (e.target === backdrop) sluit(); };

  document.getElementById('editie-modal-opslaan').onclick = async () => {
    const naam = document.getElementById('ed-naam').value.trim();
    const jaar = Number(document.getElementById('ed-jaar').value);
    document.getElementById('editie-modal-error').style.display = 'none';
    if (!naam || !jaar) {
      document.getElementById('editie-modal-error-tekst').textContent = 'Naam en jaar zijn verplicht';
      document.getElementById('editie-modal-error').style.display = 'flex';
      return;
    }
    const data = {
      naam, jaar,
      max_groepen:            Number(document.getElementById('ed-max').value)   || 36,
      startdatum:             document.getElementById('ed-datum').value   || null,
      lsw_datum:              document.getElementById('ed-lsw').value     || null,
      locatie:                document.getElementById('ed-locatie').value  || null,
      voorinschrijving_start: document.getElementById('ed-vistart').value || null,
      voorinschrijving_sluit: document.getElementById('ed-visluit').value || null,
      inschrijving_start:     document.getElementById('ed-istart').value  || null,
      inschrijving_sluit:     document.getElementById('ed-isluit').value  || null,
      uitslagen_gepubliceerd: document.getElementById('ed-uitslagen').checked,
      min_scouts:    Number(document.getElementById('ed-minsc').value) || 5,
      max_scouts:    Number(document.getElementById('ed-maxsc').value) || 7,
      min_leeftijd:  Number(document.getElementById('ed-minl').value)  || null,
      max_leeftijd:  Number(document.getElementById('ed-maxl').value)  || null,
      ouderen_leeftijd:   Number(document.getElementById('ed-oudl').value)  || 15,
      ouderen_grens:      Number(document.getElementById('ed-grens').value) || 6,
      max_ouderen_klein:  Number(document.getElementById('ed-oudkl').value) ?? 1,
      max_ouderen_groot:  Number(document.getElementById('ed-oudgr').value) ?? 2,
      bm_label:           document.getElementById('ed-bmlabel').value || 'Buiten mededinging',
      bm_max_positie:     Number(document.getElementById('ed-bmpos').value) || 2,
    };
    const btn = document.getElementById('editie-modal-opslaan');
    btn.disabled = true; btn.textContent = 'Opslaan…';
    try {
      await onOpslaan(data, editie?.id ?? null);
      sluit();
    } catch (e) {
      document.getElementById('editie-modal-error-tekst').textContent = e.message;
      document.getElementById('editie-modal-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Opslaan';
  };
}

function openConfirm(titel, html, onBevestig) {
  const backdrop = document.getElementById('editie-confirm-backdrop');
  document.getElementById('editie-confirm-titel').textContent = titel;
  document.getElementById('editie-confirm-tekst').innerHTML   = html;
  document.getElementById('editie-confirm-error').style.display = 'none';
  backdrop.classList.remove('hidden');

  const sluit = () => backdrop.classList.add('hidden');
  document.getElementById('editie-confirm-annuleer').onclick = sluit;
  backdrop.onclick = e => { if (e.target === backdrop) sluit(); };

  document.getElementById('editie-confirm-ok').onclick = async () => {
    const btn = document.getElementById('editie-confirm-ok');
    btn.disabled = true; btn.textContent = 'Bezig…';
    try { await onBevestig(); sluit(); }
    catch (e) {
      document.getElementById('editie-confirm-error-tekst').textContent = e.message;
      document.getElementById('editie-confirm-error').style.display = 'flex';
    }
    btn.disabled = false; btn.textContent = 'Verwijderen';
  };
}
