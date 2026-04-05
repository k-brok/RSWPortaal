// organisator/vrijwilligers.js — Gecombineerde vrijwilligers- en vacaturesbeheer pagina

import { get, post, put, patch, del } from '../../services/api.js';

// ── State ─────────────────────────────────────────────────────────

let vrijwData = null; // { editie, vrijwilligers }
let vacData   = null; // { editie, vacatures }
let actieveTab = 'aanmeldingen'; // 'aanmeldingen' | 'vacatures'

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Vrijwilligers</h1>
      <button class="btn btn-primary" id="btn-nieuw-vac" style="display:none;"><span class="material-icons">add</span> Nieuwe vacature</button>
    </div>

    <div class="tabs mb-24">
      <button class="tab-btn active" data-tab="aanmeldingen"><span class="material-icons">groups</span> Aanmeldingen</button>
      <button class="tab-btn" data-tab="vacatures"><span class="material-icons">content_paste</span> Vacatures</button>
    </div>

    <div id="tab-aanmeldingen"><div class="loading-spinner"></div></div>
    <div id="tab-vacatures" style="display:none;"><div class="loading-spinner"></div></div>
    <div id="vac-modal-container"></div>
  `;
}

export async function onMount() {
  // Laad beide datasets tegelijk
  await Promise.all([laadVrijwilligers(), laadVacatures()]);
  bindTabEvents();
  document.getElementById('btn-nieuw-vac')?.addEventListener('click', () => openVacatureModal(null));
}

// ── Tab navigatie ─────────────────────────────────────────────────

function bindTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => wisselTab(btn.dataset.tab));
  });
}

function wisselTab(tab) {
  actieveTab = tab;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-aanmeldingen').style.display = tab === 'aanmeldingen' ? '' : 'none';
  document.getElementById('tab-vacatures').style.display    = tab === 'vacatures'    ? '' : 'none';

  const btnNieuw = document.getElementById('btn-nieuw-vac');
  if (btnNieuw) btnNieuw.style.display = tab === 'vacatures' ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════
// AANMELDINGEN
// ══════════════════════════════════════════════════════════════════

async function laadVrijwilligers() {
  try {
    vrijwData = await get('/admin/vrijwilligers');
  } catch (e) {
    document.getElementById('tab-aanmeldingen').innerHTML =
      `<div class="alert alert-error">${e.message}</div>`;
    return;
  }
  renderAanmeldingen();
}

function renderAanmeldingen() {
  const el = document.getElementById('tab-aanmeldingen');
  if (!el) return;

  const { editie, vrijwilligers } = vrijwData;

  const totaal    = vrijwilligers.length;
  const bevestigd = vrijwilligers.filter(v => v.status === 'bevestigd').length;
  const aangemeld = vrijwilligers.filter(v => v.status === 'aangemeld').length;
  const afgewezen = vrijwilligers.filter(v => v.status === 'afgewezen').length;

  if (!totaal) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons" style="font-size:2rem">volunteer_activism</span></div>
          <p class="text-muted">Nog niemand aangemeld als vrijwilliger voor <strong>${esc(editie.naam)}</strong>.</p>
        </div>
      </div>
    `;
    return;
  }

  const rijen = vrijwilligers.map(v => {
    const statusOpties = ['aangemeld', 'bevestigd', 'afgewezen']
      .map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`)
      .join('');

    return `
      <tr>
        <td>${esc(v.gebruiker_naam)}</td>
        <td><a href="mailto:${esc(v.gebruiker_email)}" class="link-muted">${esc(v.gebruiker_email)}</a></td>
        <td>${v.vacature_naam ? `<span class="badge badge-info">${esc(v.vacature_naam)}</span>` : '—'}</td>
        <td>${esc(v.taakvorkeur ?? '—')}</td>
        <td>${v.opmerking ? `<span title="${esc(v.opmerking)}" style="cursor:help;"><span class="material-icons" style="font-size:0.9rem">description</span> bekijk</span>` : '—'}</td>
        <td>
          <select class="form-input form-input-sm status-select" data-id="${v.id}">
            ${statusOpties}
          </select>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm btn-danger btn-verwijder" data-id="${v.id}"
            title="Verwijder aanmelding"><span class="material-icons">delete</span></button>
        </td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <div class="stats-row" style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <div class="stat-card"><span class="stat-value">${totaal}</span><span class="stat-label">Totaal</span></div>
      <div class="stat-card"><span class="stat-value" style="color:var(--color-success)">${bevestigd}</span><span class="stat-label">Bevestigd</span></div>
      <div class="stat-card"><span class="stat-value" style="color:var(--color-warning)">${aangemeld}</span><span class="stat-label">Aangemeld</span></div>
      <div class="stat-card"><span class="stat-value" style="color:var(--color-error)">${afgewezen}</span><span class="stat-label">Afgewezen</span></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2 class="card-title"><span class="material-icons">volunteer_activism</span> Aanmeldingen — ${esc(editie.naam)}</h2>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Naam</th><th>E-mail</th><th>Vacature</th>
              <th>Taakvorkeur</th><th>Opmerking</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    </div>
  `;

  bindAanmeldingenEvents();
}

function bindAanmeldingenEvents() {
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = Number(sel.dataset.id);
      const origineel = vrijwData.vrijwilligers.find(v => v.id === id)?.status;
      try {
        const bijgewerkt = await patch(`/admin/vrijwilligers/${id}/status`, { status: sel.value });
        const idx = vrijwData.vrijwilligers.findIndex(v => v.id === id);
        if (idx !== -1) vrijwData.vrijwilligers[idx] = bijgewerkt;
        renderAanmeldingen();
      } catch (e) {
        sel.value = origineel;
        alert(e.message);
      }
    });
  });

  document.querySelectorAll('.btn-verwijder').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const naam = vrijwData.vrijwilligers.find(v => v.id === id)?.gebruiker_naam ?? 'deze persoon';
      if (!confirm(`Aanmelding van ${naam} verwijderen?`)) return;
      try {
        await del(`/admin/vrijwilligers/${id}`);
        vrijwData.vrijwilligers = vrijwData.vrijwilligers.filter(v => v.id !== id);
        renderAanmeldingen();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// VACATURES
// ══════════════════════════════════════════════════════════════════

async function laadVacatures() {
  try {
    vacData = await get('/admin/vrijwilliger-vacatures');
  } catch (e) {
    document.getElementById('tab-vacatures').innerHTML =
      `<div class="alert alert-error">${e.message}</div>`;
    return;
  }
  renderVacatures();
}

function renderVacatures() {
  const el = document.getElementById('tab-vacatures');
  if (!el) return;

  const { editie, vacatures } = vacData;

  if (!vacatures.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons" style="font-size:2rem">content_paste</span></div>
          <p class="text-muted">Nog geen vacatures voor <strong>${esc(editie.naam)}</strong>.</p>
          <p class="text-muted text-sm">Klik op '+ Nieuwe vacature' om een taak zichtbaar te maken voor potentiële vrijwilligers.</p>
        </div>
      </div>
    `;
    return;
  }

  const kaarten = vacatures.map(v => {
    const bezet     = Number(v.aanmeldingen);
    const max       = v.max_vrijwilligers ? Number(v.max_vrijwilligers) : null;
    const vol       = max !== null && bezet >= max;
    const nog       = v.benodigd ? Math.max(0, Number(v.benodigd) - bezet) : null;
    const voortgang = max ? Math.min(100, Math.round((bezet / max) * 100)) : null;

    return `
      <div class="card" style="margin-bottom:1rem;">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">volunteer_activism</span></span>
            ${esc(v.naam)}
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;">
            ${vol ? '<span class="badge badge-error">Vol</span>' : '<span class="badge badge-success">Open</span>'}
            ${nog !== null && nog > 0 ? `<span class="badge badge-warning">Nog ${nog} benodigd!</span>` : ''}
            <button class="btn btn-ghost btn-sm" data-edit="${v.id}" title="Bewerken"><span class="material-icons">edit</span></button>
            <button class="btn btn-ghost btn-sm btn-danger" data-del="${v.id}" title="Verwijderen"><span class="material-icons">delete</span></button>
          </div>
        </div>
        <div class="card-body">
          ${v.omschrijving ? `<p class="text-sm text-muted" style="margin-bottom:.75rem;">${esc(v.omschrijving)}</p>` : ''}
          <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap;">
            <span class="text-sm"><span class="material-icons" style="font-size:0.9rem">groups</span> <strong>${bezet}</strong>${max ? ` / ${max}` : ''} aangemeld</span>
            ${voortgang !== null ? `
              <div style="flex:1;min-width:120px;background:var(--color-border);border-radius:4px;height:6px;">
                <div style="width:${voortgang}%;background:${vol ? 'var(--color-error)' : 'var(--color-success)'};height:6px;border-radius:4px;transition:width .3s;"></div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div class="section-header mb-16">
      <h2 class="section-title">Vacatures — ${esc(editie.naam)}</h2>
      <span class="text-muted text-sm">${vacatures.length} vacature${vacatures.length !== 1 ? 's' : ''}</span>
    </div>
    ${kaarten}
  `;

  bindVacatureEvents();
}

function bindVacatureEvents() {
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vac = vacData.vacatures.find(v => v.id === Number(btn.dataset.edit));
      if (vac) openVacatureModal(vac);
    });
  });

  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const vac = vacData.vacatures.find(v => v.id === Number(btn.dataset.del));
      if (!vac) return;
      if (!confirm(`Vacature '${vac.naam}' verwijderen?\nBestaande inschrijvingen verliezen de koppeling maar blijven bestaan.`)) return;
      try {
        await del(`/admin/vrijwilliger-vacatures/${vac.id}`);
        vacData.vacatures = vacData.vacatures.filter(v => v.id !== vac.id);
        renderVacatures();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

// ── Modal: aanmaken / bewerken ────────────────────────────────────

function openVacatureModal(vac) {
  const container = document.getElementById('vac-modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h3>${vac ? 'Vacature bewerken' : 'Nieuwe vacature'}</h3>
          <button class="btn-icon" id="modal-sluiten"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Naam <span class="text-error">*</span></label>
            <input type="text" id="vac-naam" class="form-input"
              placeholder="Bijv. EHBO, Keuken, Terreinbeheer…"
              value="${esc(vac?.naam ?? '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Omschrijving <span class="text-muted">(optioneel)</span></label>
            <textarea id="vac-omschrijving" class="form-input" rows="3"
              placeholder="Korte toelichting op de taak">${esc(vac?.omschrijving ?? '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Benodigd aantal <span class="text-muted">(leeg = niet instellen)</span></label>
            <input type="number" id="vac-benodigd" class="form-input" min="1"
              placeholder="Bijv. 5" value="${vac?.benodigd ?? ''}">
            <div class="form-hint">Toont "Nog X benodigd!" op de publieke pagina.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Maximum vrijwilligers <span class="text-muted">(leeg = onbeperkt)</span></label>
            <input type="number" id="vac-max" class="form-input" min="1"
              placeholder="Onbeperkt" value="${vac?.max_vrijwilligers ?? ''}">
          </div>
          <div id="vac-form-fout" class="alert alert-error" style="display:none;margin-top:1rem;"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="modal-annuleer">Annuleren</button>
          <button type="button" class="btn btn-primary" id="modal-opslaan">
            ${vac ? 'Opslaan' : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  `;

  const sluit = () => { container.innerHTML = ''; };
  document.getElementById('modal-sluiten').addEventListener('click', sluit);
  document.getElementById('modal-annuleer').addEventListener('click', sluit);

  document.getElementById('modal-opslaan').addEventListener('click', async () => {
    const naam              = document.getElementById('vac-naam').value.trim();
    const omschrijving      = document.getElementById('vac-omschrijving').value.trim() || null;
    const benodigdVal       = document.getElementById('vac-benodigd').value.trim();
    const benodigd          = benodigdVal ? Number(benodigdVal) : null;
    const maxVal            = document.getElementById('vac-max').value.trim();
    const max_vrijwilligers = maxVal ? Number(maxVal) : null;
    const foutEl            = document.getElementById('vac-form-fout');

    if (!naam) {
      foutEl.textContent = 'Naam is verplicht.';
      foutEl.style.display = '';
      return;
    }

    const btn = document.getElementById('modal-opslaan');
    btn.disabled = true;

    try {
      if (vac) {
        const bijgewerkt = await put(`/admin/vrijwilliger-vacatures/${vac.id}`, { naam, omschrijving, max_vrijwilligers, benodigd });
        const idx = vacData.vacatures.findIndex(v => v.id === vac.id);
        if (idx !== -1) vacData.vacatures[idx] = bijgewerkt;
      } else {
        const nieuw = await post('/admin/vrijwilliger-vacatures', { naam, omschrijving, max_vrijwilligers, benodigd });
        vacData.vacatures.push(nieuw);
      }
      sluit();
      renderVacatures();
    } catch (e) {
      foutEl.textContent = e.message;
      foutEl.style.display = '';
      btn.disabled = false;
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function statusLabel(s) {
  return { aangemeld: 'Aangemeld', bevestigd: 'Bevestigd', afgewezen: 'Afgewezen' }[s] ?? s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
