// organisator/catering.js — Catering overzicht en instellingen voor organisator/admin

import { get, post, patch, del } from '../../services/api.js';
import { notify }                from '../../utils/notify.js';

// ── State ─────────────────────────────────────────────────────────

let cateringData = null; // { editie, aanvragen, totalen }

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><span class="material-icons">restaurant</span> Catering overzicht</h1>
    </div>
    <div id="catering-org-inhoud">
      <div class="loading-spinner"></div>
    </div>
    <div id="catering-modal-overlay" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h3 class="modal-title"><span class="material-icons">person_add</span> Persoon toevoegen</h3>
          <button class="modal-close" id="modal-sluiten">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
      </div>
    </div>
  `;
}

export async function onMount() {
  await laadData();
  document.getElementById('modal-sluiten')?.addEventListener('click', sluitModal);
  document.getElementById('catering-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'catering-modal-overlay') sluitModal();
  });
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
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons">restaurant</span></div>
          <p class="text-muted">Geen actieve editie gevonden.</p>
        </div>
      </div>
    `;
    return;
  }

  // Bepaal standaard open/dicht op basis van of instellingen al ingevuld zijn
  const ingesteld = editie.catering_prijs_leiding !== null || editie.catering_prijs_vrijwilliger !== null;

  el.innerHTML = `
    ${buildInstellingenKaart(editie, !ingesteld)}
    ${buildStatistiekenRij(totalen, editie)}
    ${buildAanvragenTabel(aanvragen, editie)}
  `;

  bindEvents(editie);
}

// ── Instellingen kaart (uitklapbaar) ──────────────────────────────

function buildInstellingenKaart(editie, startOpen) {
  return `
    <div class="card catering-instellingen-kaart" style="margin-bottom:1.5rem;">
      <div class="card-header catering-instellingen-header" style="cursor:pointer;user-select:none;" id="instellingen-header">
        <h2 class="card-title">
          <span class="material-icons">settings</span>
          Catering instellingen — ${esc(editie.naam)}
        </h2>
        <span class="material-icons catering-chevron" id="instellingen-chevron"
          style="transition:transform .2s ease;${startOpen ? '' : 'transform:rotate(-90deg)'}">
          expand_more
        </span>
      </div>
      <div id="instellingen-body" style="${startOpen ? '' : 'display:none'}">
        <div class="card-body">
          <form id="instellingen-form">
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-end;">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Catering beschikbaar</label>
                <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 0;">
                  <input type="checkbox" id="catering-actief" ${editie.catering_actief ? 'checked' : ''}
                    style="width:18px;height:18px;cursor:pointer;">
                  <span id="catering-actief-label">${editie.catering_actief ? 'Aanmelden mogelijk' : 'Aanmelden gesloten'}</span>
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
          </form>
        </div>
      </div>
    </div>
  `;
}

// ── Statistieken rij ──────────────────────────────────────────────

function buildStatistiekenRij(totalen, editie) {
  const leidingRij = totalen.find(t => t.rol === 'leiding')      ?? { aanvragen: 0, totaal_personen: 0, betaald_personen: 0, onbetaald_personen: 0 };
  const vrijwRij   = totalen.find(t => t.rol === 'vrijwilliger') ?? { aanvragen: 0, totaal_personen: 0, betaald_personen: 0, onbetaald_personen: 0 };
  const overigeRij = totalen.find(t => t.rol === 'overig')       ?? { aanvragen: 0, totaal_personen: 0, betaald_personen: 0, onbetaald_personen: 0 };

  const totaalAanvragen = [leidingRij, vrijwRij, overigeRij].reduce((s, r) => s + Number(r.aanvragen), 0);
  const totaalPersonen  = [leidingRij, vrijwRij, overigeRij].reduce((s, r) => s + Number(r.totaal_personen), 0);
  const totaalBetaald   = [leidingRij, vrijwRij, overigeRij].reduce((s, r) => s + Number(r.betaald_personen), 0);
  const totaalOnbetaald = totaalPersonen - totaalBetaald;

  const prijsLeiding = editie.catering_prijs_leiding;
  const prijsVrijw   = editie.catering_prijs_vrijwilliger;

  const verwacht  = (prijsLeiding != null && prijsVrijw != null)
    ? (Number(prijsLeiding) * Number(leidingRij.totaal_personen) + Number(prijsVrijw) * Number(vrijwRij.totaal_personen)).toFixed(2)
    : null;
  const ontvangen = (prijsLeiding != null && prijsVrijw != null)
    ? (Number(prijsLeiding) * Number(leidingRij.betaald_personen) + Number(prijsVrijw) * Number(vrijwRij.betaald_personen)).toFixed(2)
    : null;

  const stats = [
    { waarde: totaalAanvragen, label: 'Aanmeldingen', verberg: 'stat-hide-sm' },
    { waarde: totaalPersonen,  label: 'Personen' },
    { waarde: totaalBetaald,   label: 'Betaald',  kleur: 'var(--color-success)' },
    { waarde: totaalOnbetaald, label: 'Onbetaald', kleur: 'var(--color-warning)' },
    verwacht  !== null ? { waarde: `€\u00a0${verwacht}`,  label: 'Verwacht',  kleur: 'var(--color-text-muted)', verberg: 'stat-hide-sm' } : null,
    ontvangen !== null ? { waarde: `€\u00a0${ontvangen}`, label: 'Ontvangen', kleur: 'var(--color-success)' }   : null,
  ].filter(Boolean);

  const kaartjes = stats.map(s => `
    <div class="stat-card catering-stat-card${s.verberg ? ` ${s.verberg}` : ''}">
      <div class="stat-info">
        <div class="stat-value"${s.kleur ? ` style="color:${s.kleur}"` : ''}>${s.waarde}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>
  `).join('');

  return `<div class="catering-stats-rij">${kaartjes}</div>`;
}

// ── Aanvragen tabel ───────────────────────────────────────────────

function buildAanvragenTabel(aanvragen, editie) {
  const prijsLeiding = editie.catering_prijs_leiding;
  const prijsVrijw   = editie.catering_prijs_vrijwilliger;

  // Aantal kolommen voor colspan in uitklap-rij (Naam + E-mail + Groep + Rol + Pers. + Totaal + Betaling)
  const colCount = 7;

  const tabelInhoud = aanvragen.length ? (() => {
    const rijen = aanvragen.map((a, idx) => {
      const prijs  = a.rol === 'leiding' ? prijsLeiding : (a.rol === 'vrijwilliger' ? prijsVrijw : null);
      const totaal = prijs != null ? `€\u00a0${(Number(prijs) * a.aantal_personen).toFixed(2)}` : '—';

      const rolBadge = a.rol === 'leiding'
        ? '<span class="badge badge-info">Leiding</span>'
        : a.rol === 'vrijwilliger'
          ? '<span class="badge badge-warning">Vrijwilliger</span>'
          : '<span class="badge badge-secondary">Overig</span>';

      const betaaldKnop = `
        <button class="btn btn-sm ${a.betaald ? 'btn-success' : 'btn-ghost'} btn-betaald"
          data-id="${a.id}" data-betaald="${a.betaald ? '1' : '0'}"
          title="${a.betaald ? 'Betaald — klik om te wijzigen' : 'Onbetaald — klik om te markeren'}"
          style="min-width:92px;white-space:nowrap;">
          <span class="material-icons" style="font-size:.95rem;vertical-align:middle;">
            ${a.betaald ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          ${a.betaald ? 'Betaald' : 'Onbetaald'}
        </button>
      `;

      // Uitklap-details: kolommen die op mobiel progressief verdwijnen + acties
      const uitklapItems = [
        a.gebruiker_email ? `<span class="uitklap-item"><span class="material-icons" style="font-size:1rem;color:var(--color-text-muted)">email</span><a href="mailto:${esc(a.gebruiker_email)}" class="link-muted">${esc(a.gebruiker_email)}</a></span>` : '',
        `<span class="uitklap-item"><span class="material-icons" style="font-size:1rem;color:var(--color-text-muted)">group</span>${a.groep_naam ? esc(a.groep_naam) : '<span class="text-muted">Geen groep</span>'}</span>`,
        `<span class="uitklap-item">${rolBadge}</span>`,
        `<span class="uitklap-item"><span class="material-icons" style="font-size:1rem;color:var(--color-text-muted)">people</span>${a.aantal_personen} persoon${a.aantal_personen !== 1 ? 'en' : ''}</span>`,
        `<span class="uitklap-item"><span class="material-icons" style="font-size:1rem;color:var(--color-text-muted)">euro</span>${totaal}</span>`,
        a.opmerking ? `<span class="uitklap-item"><span class="material-icons" style="font-size:1rem;color:var(--color-text-muted)">notes</span>${esc(a.opmerking)}</span>` : '',
        !a.gebruiker_id ? `<span class="uitklap-item"><span class="badge badge-secondary">Handmatig toegevoegd</span></span>` : '',
        `<span class="uitklap-item">
          <button class="btn btn-ghost btn-sm btn-danger btn-verwijder" data-id="${a.id}" style="padding:4px 10px;">
            <span class="material-icons" style="font-size:1rem;vertical-align:middle;">delete</span> Verwijderen
          </button>
        </span>`,
      ].filter(Boolean).join('');

      // Chevron in naam-kolom (zichtbaar zodra kolommen verborgen zijn op mobiel)
      const chevron = `<span class="row-expand-hint"><span class="material-icons" style="font-size:0.9rem">chevron_right</span></span>`;

      return `
        <tr class="uitslag-row expandable-sm catering-rij" data-target="uitklap-${idx}">
          <td style="white-space:nowrap;">${esc(a.gebruiker_naam)}${chevron}</td>
          <td class="col-hide-md">${a.gebruiker_email ? `<a href="mailto:${esc(a.gebruiker_email)}" class="link-muted">${esc(a.gebruiker_email)}</a>` : '<span class="text-muted">—</span>'}</td>
          <td class="col-hide-sm">${a.groep_naam ? esc(a.groep_naam) : '<span class="text-muted">—</span>'}</td>
          <td class="col-hide-sm">${rolBadge}</td>
          <td class="col-hide-xs" style="text-align:center;white-space:nowrap;"><strong>${a.aantal_personen}</strong></td>
          <td class="col-hide-xs" style="white-space:nowrap;">${totaal}</td>
          <td style="white-space:nowrap;">${betaaldKnop}</td>
        </tr>
        <tr id="uitklap-${idx}" style="display:none;">
          <td colspan="${colCount}" style="padding:0;">
            <div class="uitklap-content">${uitklapItems}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card-body" style="padding:0;">
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Naam</th>
              <th class="col-hide-md">E-mail</th>
              <th class="col-hide-sm">Groep</th>
              <th class="col-hide-sm">Rol</th>
              <th class="col-hide-xs">Pers.</th>
              <th class="col-hide-xs">Totaal</th>
              <th>Betaling</th>
            </tr>
          </thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    `;
  })() : `
    <div class="card-body text-center" style="padding:2rem;">
      <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons">restaurant</span></div>
      <p class="text-muted">Nog niemand aangemeld voor <strong>${esc(editie.naam)}</strong>.</p>
    </div>
  `;

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title"><span class="material-icons">restaurant</span> Aanmeldingen — ${esc(editie.naam)}</h2>
        <div style="display:flex;align-items:center;gap:.75rem;">
          <span class="text-muted text-sm">${aanvragen.length} aanmelding${aanvragen.length !== 1 ? 'en' : ''}</span>
          <button class="btn btn-primary btn-sm" id="btn-toevoegen">
            <span class="material-icons">person_add</span> Toevoegen
          </button>
        </div>
      </div>
      ${tabelInhoud}
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents(editie) {
  // Instellingen uitklappen/inklappen
  document.getElementById('instellingen-header')?.addEventListener('click', () => {
    const body    = document.getElementById('instellingen-body');
    const chevron = document.getElementById('instellingen-chevron');
    const open    = body.style.display !== 'none';
    body.style.display    = open ? 'none' : '';
    chevron.style.transform = open ? 'rotate(-90deg)' : '';
  });

  // Instellingen opslaan
  document.getElementById('instellingen-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actieCheckbox   = document.getElementById('catering-actief');
    const prijsLeidingVal = document.getElementById('prijs-leiding').value.trim();
    const prijsVrijwVal   = document.getElementById('prijs-vrijwilliger').value.trim();

    const btn = document.getElementById('btn-instellingen-opslaan');
    btn.disabled = true;

    try {
      const bijgewerkt = await patch('/admin/catering/instellingen', {
        catering_actief:             actieCheckbox?.checked ? 1 : 0,
        catering_prijs_leiding:      prijsLeidingVal !== '' ? Number(prijsLeidingVal) : null,
        catering_prijs_vrijwilliger: prijsVrijwVal   !== '' ? Number(prijsVrijwVal)   : null,
      });
      cateringData.editie.catering_actief             = bijgewerkt.catering_actief;
      cateringData.editie.catering_prijs_leiding      = bijgewerkt.catering_prijs_leiding;
      cateringData.editie.catering_prijs_vrijwilliger = bijgewerkt.catering_prijs_vrijwilliger;
      notify.success('Instellingen opgeslagen.');

      const label = document.getElementById('catering-actief-label');
      if (label) label.textContent = actieCheckbox.checked ? 'Aanmelden mogelijk' : 'Aanmelden gesloten';
    } catch (err) {
      notify.error(err.message ?? 'Opslaan mislukt.');
    }
    btn.disabled = false;
  });

  // Uitklap: klik op rij togglet de detail-rij (alleen actief op mobiel via CSS cursor)
  document.querySelectorAll('.catering-rij').forEach(rij => {
    rij.addEventListener('click', (e) => {
      // Knoppen in de rij mogen de rij-klik niet triggeren
      if (e.target.closest('button, a')) return;
      const detailRij = document.getElementById(rij.dataset.target);
      if (!detailRij) return;
      const open = detailRij.style.display !== 'none';
      detailRij.style.display = open ? 'none' : 'table-row';
      rij.classList.toggle('expanded', !open);
    });
  });

  // Betaalstatus togglen
  document.querySelectorAll('.btn-betaald').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id          = Number(btn.dataset.id);
      const wasBetaald  = btn.dataset.betaald === '1';
      const nieuwBetaald = !wasBetaald;

      btn.disabled = true;
      try {
        await patch(`/admin/catering/${id}/betaald`, { betaald: nieuwBetaald });
        const item = cateringData.aanvragen.find(a => a.id === id);
        if (item) item.betaald = nieuwBetaald ? 1 : 0;
        herbereken();
        renderPagina();
      } catch (err) {
        notify.error(err.message ?? 'Bijwerken mislukt.');
        btn.disabled = false;
      }
    });
  });

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
        herbereken();
        renderPagina();
      } catch (err) {
        notify.error(err.message ?? 'Verwijderen mislukt.');
      }
    });
  });

  // Toevoegen-modal
  document.getElementById('btn-toevoegen')?.addEventListener('click', () => openToevoegenModal());
}

// ── Toevoegen-modal ───────────────────────────────────────────────

async function openToevoegenModal() {
  const overlay = document.getElementById('catering-modal-overlay');
  const body    = document.getElementById('modal-body');

  body.innerHTML = '<div class="loading-spinner" style="margin:1.5rem auto;"></div>';
  overlay.style.display = 'flex';

  let gebruikers = [];
  try { gebruikers = await get('/admin/catering/beschikbare-gebruikers'); } catch { /* stil */ }

  const gebruikersOpties = gebruikers.map(g =>
    `<option value="${g.id}" data-rol="${esc(g.rol ?? '')}">${esc(g.naam)} (${esc(g.email)})${g.groep_naam ? ` — ${esc(g.groep_naam)}` : ''}</option>`
  ).join('');

  body.innerHTML = `
    <form id="toevoegen-form">
      <div class="form-group">
        <label class="form-label">Type invoer</label>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;">
            <input type="radio" name="type" value="gebruiker" ${gebruikers.length ? 'checked' : 'disabled'}> Bestaande gebruiker
          </label>
          <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;">
            <input type="radio" name="type" value="handmatig" ${!gebruikers.length ? 'checked' : ''}> Vrije naam
          </label>
        </div>
      </div>
      <div id="veld-gebruiker" class="form-group" ${!gebruikers.length ? 'style="display:none"' : ''}>
        <label class="form-label">Gebruiker</label>
        <select id="sel-gebruiker" class="form-input">
          <option value="">— Kies een gebruiker —</option>
          ${gebruikersOpties}
        </select>
      </div>
      <div id="veld-handmatig" class="form-group" style="${gebruikers.length ? 'display:none' : ''}">
        <label class="form-label">Naam</label>
        <input type="text" id="inp-naam" class="form-input" placeholder="Volledige naam" maxlength="150">
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select id="sel-rol" class="form-input">
          <option value="leiding">Leiding</option>
          <option value="vrijwilliger">Vrijwilliger</option>
          <option value="overig">Overig</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Aantal personen</label>
        <input type="number" id="inp-personen" class="form-input" value="1" min="1" max="50" style="max-width:120px;">
      </div>
      <div class="form-group">
        <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
        <input type="text" id="inp-opmerking" class="form-input" placeholder="Bijv. dieetwensen" maxlength="255">
      </div>
      <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem;">
        <button type="button" class="btn btn-ghost" id="btn-annuleer-modal">Annuleren</button>
        <button type="submit" class="btn btn-primary" id="btn-opslaan-modal">
          <span class="material-icons">person_add</span> Toevoegen
        </button>
      </div>
    </form>
  `;

  document.querySelectorAll('input[name="type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isGebruiker = radio.value === 'gebruiker';
      document.getElementById('veld-gebruiker').style.display = isGebruiker ? '' : 'none';
      document.getElementById('veld-handmatig').style.display = isGebruiker ? 'none' : '';
    });
  });

  document.getElementById('sel-gebruiker')?.addEventListener('change', () => {
    const opt = document.getElementById('sel-gebruiker').selectedOptions[0];
    const rol = opt?.dataset.rol;
    if (rol && ['leiding', 'vrijwilliger'].includes(rol)) {
      document.getElementById('sel-rol').value = rol;
    }
  });

  document.getElementById('btn-annuleer-modal').addEventListener('click', sluitModal);

  document.getElementById('toevoegen-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type        = document.querySelector('input[name="type"]:checked')?.value ?? 'handmatig';
    const gebruikerId = type === 'gebruiker' ? document.getElementById('sel-gebruiker').value : null;
    const naam        = type === 'handmatig' ? document.getElementById('inp-naam').value.trim() : null;
    const rol         = document.getElementById('sel-rol').value;
    const personen    = Number(document.getElementById('inp-personen').value);
    const opmerking   = document.getElementById('inp-opmerking').value.trim();

    if (type === 'gebruiker' && !gebruikerId) { notify.warning('Kies een gebruiker.'); return; }
    if (type === 'handmatig' && !naam)        { notify.warning('Vul een naam in.');    return; }

    const btn = document.getElementById('btn-opslaan-modal');
    btn.disabled = true; btn.textContent = 'Bezig…';

    try {
      const nieuweAanvraag = await post('/admin/catering', {
        gebruiker_id:    gebruikerId ? Number(gebruikerId) : null,
        handmatig_naam:  naam,
        rol,
        aantal_personen: personen,
        opmerking:       opmerking || null,
      });
      cateringData.aanvragen.push({
        ...nieuweAanvraag,
        gebruiker_naam:  nieuweAanvraag.handmatig_naam ?? nieuweAanvraag.gebruiker_naam,
        gebruiker_email: nieuweAanvraag.gebruiker_email ?? null,
        groep_naam:      nieuweAanvraag.groep_naam ?? null,
        betaald:         0,
      });
      herbereken();
      sluitModal();
      renderPagina();
      notify.success('Persoon toegevoegd aan catering.');
    } catch (err) {
      notify.error(err.message ?? 'Toevoegen mislukt.');
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">person_add</span> Toevoegen';
    }
  });
}

function sluitModal() {
  const overlay = document.getElementById('catering-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Totalen herberekenen na lokale mutatie ────────────────────────

function herbereken() {
  const rollen = {};
  for (const a of cateringData.aanvragen) {
    if (!rollen[a.rol]) rollen[a.rol] = { rol: a.rol, aanvragen: 0, totaal_personen: 0, betaald_personen: 0, onbetaald_personen: 0 };
    rollen[a.rol].aanvragen++;
    rollen[a.rol].totaal_personen    += a.aantal_personen;
    rollen[a.rol].betaald_personen   += a.betaald ? a.aantal_personen : 0;
    rollen[a.rol].onbetaald_personen += a.betaald ? 0 : a.aantal_personen;
  }
  cateringData.totalen = Object.values(rollen);
}

// ── Helpers ───────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
