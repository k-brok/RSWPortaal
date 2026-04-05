// vrijwilliger/inschrijving.js — Vrijwilliger-inschrijving voor de actieve editie

import { get, post, put, del } from '../../services/api.js';
import { getVacatures } from '../../services/api.js';

// ── State ─────────────────────────────────────────────────────────

let statusData = null; // { editie, inschrijving }
let vacatures  = [];
let gekozenVacatureId = null; // ingesteld via kaart-klik

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Vrijwilliger aanmelden</h1>
    </div>
    <div id="vrijw-inhoud">
      <div class="loading-spinner"></div>
    </div>
  `;
}

export async function onMount() {
  vacatures = await getVacatures().catch(() => []);
  await laadStatus();
  laadHistorisch();
}

// ── Status ophalen ────────────────────────────────────────────────

async function laadStatus() {
  try {
    statusData = await get('/vrijwilliger/status');
  } catch {
    statusData = { editie: null, inschrijving: null };
  }
  renderPagina();
}

// ── Hoofdpagina ───────────────────────────────────────────────────

function renderPagina() {
  const inhoud = document.getElementById('vrijw-inhoud');
  if (!inhoud) return;

  const { editie, inschrijving } = statusData ?? {};

  if (!editie) {
    inhoud.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons" style="font-size:2rem">event</span></div>
          <p class="text-muted">Er is momenteel geen actieve editie waarvoor je je kunt aanmelden.</p>
        </div>
      </div>
    `;
    return;
  }

  if (inschrijving) {
    // Al ingeschreven: toon de bestaande inschrijving
    inhoud.innerHTML = buildInschrijvingKaart(editie, inschrijving);
    bindInschrijvingEvents();
  } else {
    // Nog niet ingeschreven: toon vacatures + formulier
    gekozenVacatureId = null;
    inhoud.innerHTML = buildAanmeldenView(editie);
    bindAanmeldenEvents();
  }
}

// ── Kaart: bestaande inschrijving ─────────────────────────────────

function buildInschrijvingKaart(editie, inschrijving) {
  const statusKleur = { aangemeld: 'warning', bevestigd: 'success', afgewezen: 'error' }[inschrijving.status] ?? 'info';
  const statusLabel = {
    aangemeld: 'Aangemeld — wacht op bevestiging',
    bevestigd: 'Bevestigd',
    afgewezen: 'Afgewezen — neem contact op met de organisatie',
  }[inschrijving.status] ?? inschrijving.status;

  const vacatureRegel = inschrijving.vacature_naam
    ? `<div class="form-group"><label class="form-label">Vacature</label><p><span class="badge badge-info">${esc(inschrijving.vacature_naam)}</span></p></div>`
    : '';

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title"><span class="material-icons">volunteer_activism</span> Aanmelding ${esc(editie.naam)}</h2>
        <span class="badge badge-${statusKleur}">${statusLabel}</span>
      </div>
      <div class="card-body">
        <form id="vrijw-form">
          ${vacatureRegel}
          <div class="form-group">
            <label class="form-label">Taakvorkeur <span class="text-muted">(optioneel)</span></label>
            <input type="text" id="taakvorkeur" class="form-input"
              placeholder="Bijv. EHBO, logistiek, terreinbeheer…"
              value="${esc(inschrijving.taakvorkeur ?? '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
            <textarea id="opmerking" class="form-input" rows="3"
              placeholder="Eventuele opmerkingen of vragen">${esc(inschrijving.opmerking ?? '')}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-opslaan">Wijzigingen opslaan</button>
            <button type="button" class="btn btn-ghost btn-danger" id="btn-afmelden">Afmelden</button>
          </div>
          <div id="vrijw-fout"   class="alert alert-error"   style="display:none;margin-top:1rem;"></div>
          <div id="vrijw-succes" class="alert alert-success" style="display:none;margin-top:1rem;"></div>
        </form>
      </div>
    </div>
    <div id="historisch-sectie"></div>
  `;
}

// ── Aanmelden view: vacatures + formulier ─────────────────────────

function buildAanmeldenView(editie) {
  return `
    ${vacatures.length ? buildVacatureKaarten() : ''}
    <div class="card" id="aanmelden-kaart" ${vacatures.length ? 'style="margin-top:1.5rem;"' : ''}>
      <div class="card-header">
        <h2 class="card-title"><span class="material-icons">volunteer_activism</span> Aanmelden als vrijwilliger</h2>
        <span class="badge badge-info">${esc(editie.naam)}</span>
      </div>
      <div class="card-body">
        <p class="text-muted" style="margin-bottom:1.25rem;">
          ${vacatures.length
            ? 'Klik op een vacature hierboven om je voor die taak aan te melden, of meld je aan zonder voorkeur.'
            : 'Meld je aan als vrijwilliger. De organisatie neemt contact op over de taakverdeling.'
          }
        </p>
        <form id="vrijw-form">
          <div id="gekozen-vacature-info" style="display:none;margin-bottom:1rem;">
            <div class="alert alert-success">
              <span class="alert-icon"><span class="material-icons">volunteer_activism</span></span>
              <span>Je meldt je aan voor: <strong id="gekozen-vacature-naam"></strong></span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Taakvorkeur <span class="text-muted">(optioneel)</span></label>
            <input type="text" id="taakvorkeur" class="form-input"
              placeholder="Bijv. EHBO, logistiek, terreinbeheer, keuken…">
          </div>
          <div class="form-group">
            <label class="form-label">Opmerking <span class="text-muted">(optioneel)</span></label>
            <textarea id="opmerking" class="form-input" rows="3"
              placeholder="Eventuele opmerkingen of vragen"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-aanmelden">Aanmelden</button>
          </div>
          <div id="vrijw-fout" class="alert alert-error" style="display:none;margin-top:1rem;"></div>
        </form>
      </div>
    </div>
    <div id="historisch-sectie"></div>
  `;
}

function buildVacatureKaarten() {
  const kaarten = vacatures.map(v => {
    const bezet = Number(v.aanmeldingen);
    const max   = v.max_vrijwilligers ? Number(v.max_vrijwilligers) : null;
    const vol   = max !== null && bezet >= max;
    const nog   = v.benodigd ? Math.max(0, Number(v.benodigd) - bezet) : null;
    const voortgang = max ? Math.min(100, Math.round((bezet / max) * 100)) : null;

    return `
      <div class="card vacature-keuze ${vol ? 'vol' : ''}"
           data-id="${v.id}" data-naam="${esc(v.naam)}"
           style="cursor:${vol ? 'not-allowed' : 'pointer'};border:2px solid var(--color-border);transition:border-color .15s;margin-bottom:.75rem;">
        <div class="card-header">
          <div class="card-title" style="gap:.5rem;">
            <span class="card-icon"><span class="material-icons">volunteer_activism</span></span>
            ${esc(v.naam)}
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
            ${vol ? '<span class="badge badge-error">Vol</span>' : '<span class="badge badge-success">Open</span>'}
            ${nog !== null && nog > 0 ? `<span class="badge badge-warning">Nog ${nog} benodigd!</span>` : ''}
          </div>
        </div>
        ${v.omschrijving || max ? `
          <div class="card-body" style="padding-top:0;">
            ${v.omschrijving ? `<p class="text-sm text-muted">${esc(v.omschrijving)}</p>` : ''}
            ${voortgang !== null ? `
              <div style="display:flex;gap:1rem;align-items:center;margin-top:.5rem;">
                <span class="text-sm text-muted"><span class="material-icons">groups</span> ${bezet}/${max}</span>
                <div style="flex:1;background:var(--color-border);border-radius:4px;height:5px;">
                  <div style="width:${voortgang}%;background:${vol ? 'var(--color-error)' : 'var(--color-success)'};height:5px;border-radius:4px;"></div>
                </div>
              </div>
            ` : (max === null ? `<p class="text-sm text-muted"><span class="material-icons">groups</span> ${bezet} aangemeld</p>` : '')}
          </div>
        ` : ''}
        ${!vol ? `
          <div class="card-footer">
            <button class="btn btn-primary btn-sm btn-kies-vacature" data-id="${v.id}" data-naam="${esc(v.naam)}">
              Aanmelden voor deze vacature &rarr;
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="section-header mb-16">
      <h2 class="section-title"><span class="material-icons">content_paste</span> Beschikbare vacatures</h2>
      <span class="text-muted text-sm">${vacatures.length} vacature${vacatures.length !== 1 ? 's' : ''}</span>
    </div>
    ${kaarten}
  `;
}

// ── Events: aanmelden ─────────────────────────────────────────────

function bindAanmeldenEvents() {
  // Vacature selecteren via kaart-knop
  document.querySelectorAll('.btn-kies-vacature').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      gekozenVacatureId = Number(btn.dataset.id);
      // Markeer geselecteerde kaart
      document.querySelectorAll('.vacature-keuze').forEach(k =>
        k.style.borderColor = 'var(--color-border)'
      );
      btn.closest('.vacature-keuze').style.borderColor = 'var(--color-primary)';
      // Toon info in formulier
      const info = document.getElementById('gekozen-vacature-info');
      const naam = document.getElementById('gekozen-vacature-naam');
      if (info && naam) {
        naam.textContent = btn.dataset.naam;
        info.style.display = '';
      }
      // Scroll naar formulier
      document.getElementById('aanmelden-kaart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Formulier submit
  const form = document.getElementById('vrijw-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fout = document.getElementById('vrijw-fout');
    fout.style.display = 'none';

    const payload = {
      taakvorkeur: document.getElementById('taakvorkeur')?.value.trim() || null,
      opmerking:   document.getElementById('opmerking')?.value.trim()   || null,
      vacature_id: gekozenVacatureId ?? null,
    };

    const btn = document.getElementById('btn-aanmelden');
    btn.disabled = true;

    try {
      statusData.inschrijving = await post('/vrijwilliger', payload);
      renderPagina();
    } catch (err) {
      fout.textContent = err.message ?? 'Er is een fout opgetreden.';
      fout.style.display = '';
      btn.disabled = false;
    }
  });
}

// ── Events: bestaande inschrijving bewerken/verwijderen ───────────

function bindInschrijvingEvents() {
  const form   = document.getElementById('vrijw-form');
  const fout   = document.getElementById('vrijw-fout');
  const succes = document.getElementById('vrijw-succes');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    fout.style.display   = 'none';
    succes.style.display = 'none';

    const payload = {
      taakvorkeur: document.getElementById('taakvorkeur')?.value.trim() || null,
      opmerking:   document.getElementById('opmerking')?.value.trim()   || null,
      vacature_id: statusData.inschrijving.vacature_id ?? null,
    };

    const btn = document.getElementById('btn-opslaan');
    btn.disabled = true;

    try {
      statusData.inschrijving = await put(`/vrijwilliger/${statusData.inschrijving.id}`, payload);
      succes.textContent = 'Inschrijving bijgewerkt.';
      succes.style.display = '';
    } catch (err) {
      fout.textContent = err.message ?? 'Er is een fout opgetreden.';
      fout.style.display = '';
    }

    btn.disabled = false;
  });

  document.getElementById('btn-afmelden')?.addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je je wilt afmelden als vrijwilliger?')) return;
    try {
      await del(`/vrijwilliger/${statusData.inschrijving.id}`);
      statusData.inschrijving = null;
      renderPagina();
    } catch (err) {
      const foutEl = document.getElementById('vrijw-fout');
      if (foutEl) { foutEl.textContent = err.message ?? 'Afmelden mislukt.'; foutEl.style.display = ''; }
    }
  });
}

// ── Historische inschrijvingen ────────────────────────────────────

async function laadHistorisch() {
  const sectie = document.getElementById('historisch-sectie');
  if (!sectie) return;

  let historisch;
  try { historisch = await get('/vrijwilliger/historisch'); }
  catch { return; }

  if (!historisch.length) return;

  const rijen = historisch.map(i => {
    const badge = {
      aangemeld: '<span class="badge badge-warning">Aangemeld</span>',
      bevestigd: '<span class="badge badge-success">Bevestigd</span>',
      afgewezen: '<span class="badge badge-error">Afgewezen</span>',
    }[i.status] ?? i.status;

    return `
      <tr>
        <td>${esc(i.editie_naam)} (${i.jaar})</td>
        <td>${i.vacature_naam ? `<span class="badge badge-info">${esc(i.vacature_naam)}</span>` : esc(i.taakvorkeur ?? '—')}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');

  sectie.innerHTML = `
    <div class="card" style="margin-top:1.5rem;">
      <div class="card-header"><h2 class="card-title">Eerdere aanmeldingen</h2></div>
      <div class="card-body" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>Editie</th><th>Vacature / taakvorkeur</th><th>Status</th></tr></thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
