// organisator/aanvragen.js — Alle openstaande aanvragen in één overzicht

import { get, post } from '../../services/api.js';

let data = null; // { leidingAanvragen, vrijwilligersAangemeld, editie }

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Aanvragen</h1>
    </div>
    <div id="aanvragen-inhoud"><div class="loading-spinner"></div></div>
    <div id="aanvragen-modal"></div>
  `;
}

export async function onMount() {
  await laadData();
}

// ── Data laden ────────────────────────────────────────────────────

async function laadData() {
  try {
    data = await get('/admin/aanvragen');
  } catch (e) {
    document.getElementById('aanvragen-inhoud').innerHTML =
      `<div class="alert alert-error">${e.message}</div>`;
    return;
  }
  renderPagina();
}

// ── Pagina ────────────────────────────────────────────────────────

function renderPagina() {
  const el = document.getElementById('aanvragen-inhoud');
  if (!el) return;

  const { leidingAanvragen, vrijwilligersAangemeld } = data;

  // Combineer beide lijsten met een type-veld
  const alles = [
    ...leidingAanvragen.map(a => ({ ...a, _type: 'leiding' })),
    ...vrijwilligersAangemeld.map(v => ({ ...v, _type: 'vrijwilliger' })),
  ].sort((a, b) => new Date(a.aangemaakt_op) - new Date(b.aangemaakt_op));

  const totaal = alles.length;

  if (!totaal) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem;">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem;"><span class="material-icons" style="font-size:2rem">check_circle</span></div>
          <p class="text-muted">Geen openstaande aanvragen.</p>
        </div>
      </div>
    `;
    return;
  }

  const rijen = alles.map(item => {
    const typeBadge = item._type === 'leiding'
      ? '<span class="badge badge-info">Leiding</span>'
      : '<span class="badge badge-success">Vrijwilliger</span>';

    const detail = item._type === 'leiding'
      ? esc(item.groep_label)
      : (item.vacature_naam ? `<span class="badge badge-info">${esc(item.vacature_naam)}</span>` : item.taakvorkeur ? esc(item.taakvorkeur) : '—');

    const opmerking = item.opmerking
      ? `<span title="${esc(item.opmerking)}" style="cursor:help;"><span class="material-icons" style="font-size:0.9rem">description</span> ${esc(item.opmerking.slice(0, 35))}${item.opmerking.length > 35 ? '…' : ''}</span>`
      : '—';

    const goedkeurLabel  = item._type === 'leiding' ? 'Goedkeuren' : 'Bevestigen';
    const goedkeurClass  = item._type === 'leiding' ? 'btn-goedkeuren' : 'btn-bevestigen';

    return `
      <tr>
        <td>${typeBadge}</td>
        <td>
          <div style="font-weight:600;">${esc(item.gebruiker_naam)}</div>
          <div class="text-muted text-sm">
            <a href="mailto:${esc(item.gebruiker_email)}" class="link-muted">${esc(item.gebruiker_email)}</a>
          </div>
        </td>
        <td>${detail}</td>
        <td>${opmerking}</td>
        <td>${formatDatum(item.aangemaakt_op)}</td>
        <td>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm ${goedkeurClass}"
              data-id="${item.id}" data-type="${item._type}"
              data-naam="${esc(item.gebruiker_naam)}"
              data-detail="${item._type === 'leiding' ? esc(item.groep_label) : ''}">
              <span class="material-icons">check</span> ${goedkeurLabel}
            </button>
            <button class="btn btn-ghost btn-sm btn-danger btn-afwijzen"
              data-id="${item.id}" data-type="${item._type}"
              data-naam="${esc(item.gebruiker_naam)}">
              <span class="material-icons">close</span> Afwijzen
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title"><span class="material-icons">content_paste</span> Openstaande aanvragen</h2>
        <span class="badge badge-warning">${totaal} in behandeling</span>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Persoon</th>
              <th>Groep / vacature</th>
              <th>Opmerking</th>
              <th>Datum</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    </div>
  `;

  bindEvents();
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents() {
  document.querySelectorAll('.btn-goedkeuren, .btn-bevestigen').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = Number(btn.dataset.id);
      const type   = btn.dataset.type;
      const naam   = btn.dataset.naam;
      const detail = btn.dataset.detail;

      const bevestiging = type === 'leiding'
        ? `Aanvraag van ${naam} goedkeuren?\nZij worden gekoppeld aan: ${detail}`
        : `Aanmelding van ${naam} bevestigen?`;

      if (!confirm(bevestiging)) return;

      try {
        const endpoint = type === 'leiding'
          ? `/admin/aanvragen/leiding/${id}/goedkeuren`
          : `/admin/aanvragen/vrijwilliger/${id}/bevestigen`;

        await post(endpoint, {});

        if (type === 'leiding') {
          data.leidingAanvragen = data.leidingAanvragen.filter(a => a.id !== id);
        } else {
          data.vrijwilligersAangemeld = data.vrijwilligersAangemeld.filter(v => v.id !== id);
        }

        renderPagina();
      } catch (e) { alert(e.message); }
    });
  });

  document.querySelectorAll('.btn-afwijzen').forEach(btn => {
    btn.addEventListener('click', () => {
      openAfwijsModal(btn.dataset.type, Number(btn.dataset.id), btn.dataset.naam);
    });
  });
}

// ── Afwijzen modal ────────────────────────────────────────────────

function openAfwijsModal(type, id, naam) {
  const container = document.getElementById('aanvragen-modal');
  container.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>Aanvraag afwijzen</h3>
          <button class="btn-icon" id="afwijs-sluiten"><span class="material-icons">close</span></button>
        </div>
        <div class="modal-body">
          <p>Je wijst de aanvraag van <strong>${esc(naam)}</strong> af.</p>
          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label">Reden <span class="text-muted">(optioneel — wordt gemaild)</span></label>
            <textarea id="afwijs-reden" class="form-input" rows="3"
              placeholder="Bijv. geen plek meer beschikbaar…"></textarea>
          </div>
          <div id="afwijs-fout" class="alert alert-error" style="display:none;margin-top:.75rem;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="afwijs-annuleer">Annuleren</button>
          <button class="btn btn-danger" id="afwijs-bevestig">Afwijzen</button>
        </div>
      </div>
    </div>
  `;

  const sluit = () => { container.innerHTML = ''; };
  document.getElementById('afwijs-sluiten').addEventListener('click', sluit);
  document.getElementById('afwijs-annuleer').addEventListener('click', sluit);

  document.getElementById('afwijs-bevestig').addEventListener('click', async () => {
    const reden  = document.getElementById('afwijs-reden').value.trim() || null;
    const foutEl = document.getElementById('afwijs-fout');
    const btn    = document.getElementById('afwijs-bevestig');
    btn.disabled = true;

    try {
      const endpoint = type === 'leiding'
        ? `/admin/aanvragen/leiding/${id}/afwijzen`
        : `/admin/aanvragen/vrijwilliger/${id}/afwijzen`;

      await post(endpoint, { reden });

      if (type === 'leiding') {
        data.leidingAanvragen = data.leidingAanvragen.filter(a => a.id !== id);
      } else {
        data.vrijwilligersAangemeld = data.vrijwilligersAangemeld.filter(v => v.id !== id);
      }

      sluit();
      renderPagina();
    } catch (e) {
      foutEl.textContent = e.message;
      foutEl.style.display = '';
      btn.disabled = false;
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDatum(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
