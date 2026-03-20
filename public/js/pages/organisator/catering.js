// organisator/catering.js — Catering overzicht en instellingen voor organisator/admin

import { get, patch, del } from '../../services/api.js';

// ── State ─────────────────────────────────────────────────────────

let cateringData = null; // { editie, aanvragen, totalen }

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">&#127859; Catering overzicht</h1>
    </div>
    <div id="catering-org-inhoud">
      <div class="loading-spinner"></div>
    </div>
  `;
}

export async function onMount() {
  await laadData();
}

// ── Data ophalen ──────────────────────────────────────────────────

async function laadData() {
  try {
    cateringData = await get('/admin/catering');
  } catch (e) {
    document.getElementById('catering-org-inhoud').innerHTML =
      `<div class="alert alert-error">${esc(e.message)}</div>`;
    return;
  }
  renderPagina();
}

// ── Hoofdpagina ───────────────────────────────────────────────────

function renderPagina() {
  const el = document.getElementById('catering-org-inhoud');
  if (!el) return;

  const { editie, aanvragen, totalen } = cateringData;

  if (!editie) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;">&#127859;</div>
          <p class="text-muted">Geen actieve editie gevonden.</p>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    ${buildInstellingenKaart(editie)}
    ${buildStatistiekenRij(totalen, editie)}
    ${buildAanvragenTabel(aanvragen, editie)}
  `;

  bindEvents(editie);
}

// ── Instellingen kaart ────────────────────────────────────────────

function buildInstellingenKaart(editie) {
  return `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-header">
        <h2 class="card-title">&#9881;&#65039; Catering instellingen — ${esc(editie.naam)}</h2>
      </div>
      <div class="card-body">
        <form id="instellingen-form">
          <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Catering beschikbaar</label>
              <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 0;">
                <input type="checkbox" id="catering-actief" ${editie.catering_actief ? 'checked' : ''}
                  style="width:18px;height:18px;cursor:pointer;">
                <span>${editie.catering_actief ? 'Aanmelden mogelijk' : 'Aanmelden gesloten'}</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Prijs leiding (€ p.p.)</label>
              <input type="number" id="prijs-leiding" class="form-input"
                min="0" step="0.01" placeholder="0.00"
                value="${editie.catering_prijs_leiding ?? ''}"
                style="max-width:140px;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Prijs vrijwilliger (€ p.p.)</label>
              <input type="number" id="prijs-vrijwilliger" class="form-input"
                min="0" step="0.01" placeholder="0.00"
                value="${editie.catering_prijs_vrijwilliger ?? ''}"
                style="max-width:140px;">
            </div>
            <div style="margin-bottom:0;padding-bottom:2px;">
              <button type="submit" class="btn btn-primary" id="btn-instellingen-opslaan">Opslaan</button>
            </div>
          </div>
          <div id="instellingen-fout"   class="alert alert-error"   style="display:none;margin-top:1rem;"></div>
          <div id="instellingen-succes" class="alert alert-success" style="display:none;margin-top:1rem;"></div>
        </form>
      </div>
    </div>
  `;
}

// ── Statistieken rij ──────────────────────────────────────────────

function buildStatistiekenRij(totalen, editie) {
  const leidingRij    = totalen.find(t => t.rol === 'leiding')      ?? { aanvragen: 0, totaal_personen: 0 };
  const vrijwRij      = totalen.find(t => t.rol === 'vrijwilliger') ?? { aanvragen: 0, totaal_personen: 0 };
  const totaalAanvragen = Number(leidingRij.aanvragen) + Number(vrijwRij.aanvragen);
  const totaalPersonen  = Number(leidingRij.totaal_personen) + Number(vrijwRij.totaal_personen);

  const prijsLeiding = editie.catering_prijs_leiding;
  const prijsVrijw   = editie.catering_prijs_vrijwilliger;

  const omzetLeiding = prijsLeiding !== null && prijsLeiding !== undefined
    ? (Number(prijsLeiding) * Number(leidingRij.totaal_personen)).toFixed(2)
    : null;
  const omzetVrijw = prijsVrijw !== null && prijsVrijw !== undefined
    ? (Number(prijsVrijw) * Number(vrijwRij.totaal_personen)).toFixed(2)
    : null;
  const totaalOmzet = omzetLeiding !== null && omzetVrijw !== null
    ? (Number(omzetLeiding) + Number(omzetVrijw)).toFixed(2)
    : null;

  return `
    <div class="stats-row" style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <div class="stat-card">
        <span class="stat-value">${totaalAanvragen}</span>
        <span class="stat-label">Aanmeldingen</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${totaalPersonen}</span>
        <span class="stat-label">Totaal personen</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${leidingRij.totaal_personen ?? 0}</span>
        <span class="stat-label">Personen leiding</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${vrijwRij.totaal_personen ?? 0}</span>
        <span class="stat-label">Personen vrijwilliger</span>
      </div>
      ${totaalOmzet !== null ? `
        <div class="stat-card">
          <span class="stat-value" style="color:var(--color-success);">&euro;&nbsp;${totaalOmzet}</span>
          <span class="stat-label">Verwachte omzet</span>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Aanvragen tabel ───────────────────────────────────────────────

function buildAanvragenTabel(aanvragen, editie) {
  if (!aanvragen.length) {
    return `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;">&#127859;</div>
          <p class="text-muted">Nog niemand aangemeld voor catering voor <strong>${esc(editie.naam)}</strong>.</p>
        </div>
      </div>
    `;
  }

  const prijsLeiding = editie.catering_prijs_leiding;
  const prijsVrijw   = editie.catering_prijs_vrijwilliger;

  const rijen = aanvragen.map(a => {
    const prijs = a.rol === 'leiding' ? prijsLeiding : prijsVrijw;
    const totaal = prijs !== null && prijs !== undefined
      ? `&euro;&nbsp;${(Number(prijs) * a.aantal_personen).toFixed(2)}`
      : '—';
    const rolBadge = a.rol === 'leiding'
      ? '<span class="badge badge-info">Leiding</span>'
      : '<span class="badge badge-warning">Vrijwilliger</span>';

    return `
      <tr>
        <td>${esc(a.gebruiker_naam)}</td>
        <td><a href="mailto:${esc(a.gebruiker_email)}" class="link-muted">${esc(a.gebruiker_email)}</a></td>
        <td>${a.groep_naam ? esc(a.groep_naam) : '<span class="text-muted">—</span>'}</td>
        <td>${rolBadge}</td>
        <td style="text-align:center;"><strong>${a.aantal_personen}</strong></td>
        <td>${totaal}</td>
        <td>${a.opmerking ? `<span title="${esc(a.opmerking)}" style="cursor:help;">&#128196; ${esc(a.opmerking.slice(0, 30))}${a.opmerking.length > 30 ? '…' : ''}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>
          <button class="btn btn-ghost btn-sm btn-danger btn-verwijder" data-id="${a.id}"
            title="Aanmelding verwijderen">&#128465;</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">&#127859; Aanmeldingen — ${esc(editie.naam)}</h2>
        <span class="text-muted text-sm">${aanvragen.length} aanmelding${aanvragen.length !== 1 ? 'en' : ''}</span>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Naam</th><th>E-mail</th><th>Groep</th><th>Rol</th>
              <th style="text-align:center;">Personen</th><th>Totaal</th><th>Opmerking</th><th></th>
            </tr>
          </thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents(editie) {
  // Instellingen opslaan
  const instellingenForm = document.getElementById('instellingen-form');
  if (instellingenForm) {
    const actieCheckbox = document.getElementById('catering-actief');

    // Label live bijwerken bij wijzigen checkbox
    actieCheckbox?.addEventListener('change', () => {
      const label = actieCheckbox.closest('label')?.querySelector('span');
      if (label) label.textContent = actieCheckbox.checked ? 'Aanmelden mogelijk' : 'Aanmelden gesloten';
    });

    instellingenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fout   = document.getElementById('instellingen-fout');
      const succes = document.getElementById('instellingen-succes');
      fout.style.display   = 'none';
      succes.style.display = 'none';

      const prijsLeidingVal = document.getElementById('prijs-leiding').value.trim();
      const prijsVrijwVal   = document.getElementById('prijs-vrijwilliger').value.trim();

      const payload = {
        catering_actief:             actieCheckbox?.checked ? 1 : 0,
        catering_prijs_leiding:      prijsLeidingVal !== '' ? Number(prijsLeidingVal) : null,
        catering_prijs_vrijwilliger: prijsVrijwVal   !== '' ? Number(prijsVrijwVal)   : null,
      };

      const btn = document.getElementById('btn-instellingen-opslaan');
      btn.disabled = true;

      try {
        const bijgewerkt = await patch('/admin/catering/instellingen', payload);
        // State bijwerken zodat statistieken kloppen
        cateringData.editie.catering_actief             = bijgewerkt.catering_actief;
        cateringData.editie.catering_prijs_leiding      = bijgewerkt.catering_prijs_leiding;
        cateringData.editie.catering_prijs_vrijwilliger = bijgewerkt.catering_prijs_vrijwilliger;
        succes.textContent = 'Instellingen opgeslagen.';
        succes.style.display = '';
      } catch (err) {
        fout.textContent = err.message ?? 'Opslaan mislukt.';
        fout.style.display = '';
      }
      btn.disabled = false;
    });
  }

  // Aanmelding verwijderen
  document.querySelectorAll('.btn-verwijder').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = Number(btn.dataset.id);
      const item = cateringData.aanvragen.find(a => a.id === id);
      const naam = item?.gebruiker_naam ?? 'deze persoon';
      if (!confirm(`Catering aanmelding van ${naam} verwijderen?`)) return;
      try {
        await del(`/admin/catering/${id}`);
        cateringData.aanvragen = cateringData.aanvragen.filter(a => a.id !== id);
        // Totalen herberekenen
        herbereken();
        renderPagina();
      } catch (err) {
        alert(err.message ?? 'Verwijderen mislukt.');
      }
    });
  });
}

// Herbereken totalen na lokale verwijdering
function herbereken() {
  const rolTotalen = {};
  for (const a of cateringData.aanvragen) {
    if (!rolTotalen[a.rol]) rolTotalen[a.rol] = { rol: a.rol, aanvragen: 0, totaal_personen: 0 };
    rolTotalen[a.rol].aanvragen++;
    rolTotalen[a.rol].totaal_personen += a.aantal_personen;
  }
  cateringData.totalen = Object.values(rolTotalen);
}

// ── Helpers ───────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
