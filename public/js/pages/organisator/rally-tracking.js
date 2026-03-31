// pages/organisator/rally-tracking.js — Live tracking: tocht-voortgang & spelmiddag-overzicht

import { get } from '../../services/api.js';
import { getGeselecteerdeEditie } from '../../services/editie.js';

let data                 = null;
let editieId             = null;
let pollTimer            = null;
let geselecteerdMomentId = null;

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>&#128204; Rally Tracking</h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="tracking-status" class="badge badge-info">laden…</span>
        <button class="btn btn-ghost btn-sm" id="btn-ververs">&#8635; Ververs</button>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <label class="form-label" style="margin:0;white-space:nowrap;">Rally moment:</label>
      <select id="tracking-moment-sel" class="form-input" style="max-width:360px;">
        <option value="">— laden… —</option>
      </select>
    </div>

    <div id="tracking-berichten"></div>
    <div id="tracking-inhoud"><div class="loading-spinner"></div></div>
  `;
}

export async function onMount() {
  document.getElementById('btn-ververs').addEventListener('click', () => laadData());
  window.addEventListener('rsw:editie-changed', _onEditieChanged);
  await laadData();
  pollTimer = setInterval(laadData, 15_000);
}

export function onDestroy() {
  clearInterval(pollTimer);
  pollTimer = null;
  window.removeEventListener('rsw:editie-changed', _onEditieChanged);
}

function _onEditieChanged() {
  geselecteerdMomentId = null;
  laadData();
}

// ── Data laden ────────────────────────────────────────────────────

async function laadData() {
  try {
    const editie = getGeselecteerdeEditie();
    editieId = editie?.id ?? null;

    if (!editieId) {
      document.getElementById('tracking-inhoud').innerHTML =
        '<div class="card"><p class="text-muted" style="padding:16px">Geen editie geselecteerd. Kies een editie via de header.</p></div>';
      return;
    }

    data = await get(`/admin/rally/tracking?editie_id=${editieId}`);
    const nu = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('tracking-status').textContent = `bijgewerkt ${nu}`;
    document.getElementById('tracking-status').className = 'badge badge-success';
    vulTrackingMomentDropdown();
    renderTracking();
  } catch (e) {
    document.getElementById('tracking-status').textContent = 'fout';
    document.getElementById('tracking-status').className = 'badge badge-error';
    toonBericht('error', e.message);
  }
}

// ── Moment dropdown ───────────────────────────────────────────────

function vulTrackingMomentDropdown() {
  const sel = document.getElementById('tracking-moment-sel');
  if (!sel || !data?.momenten) return;

  const { momenten } = data;
  if (!momenten.length) {
    sel.innerHTML = '<option value="">— geen rally momenten —</option>';
    geselecteerdMomentId = null;
    return;
  }

  sel.innerHTML = momenten.map(m => {
    const label = [m.moment_naam, m.categorie_naam].filter(Boolean).join(' — ');
    const type  = m.rally_type === 'tocht' ? '🗺 Tocht' : m.rally_type === 'spelmiddag' ? '🎯 Spelmiddag' : '';
    return `<option value="${m.moment_id}">${esc(label)}${type ? ' (' + type + ')' : ''}</option>`;
  }).join('');

  if (!geselecteerdMomentId || !momenten.find(m => m.moment_id === geselecteerdMomentId)) {
    geselecteerdMomentId = momenten[0].moment_id;
  }
  sel.value = geselecteerdMomentId;

  sel.onchange = () => {
    geselecteerdMomentId = Number(sel.value) || null;
    renderTracking();
  };
}

// ── Hoofd render ──────────────────────────────────────────────────

function renderTracking() {
  const el = document.getElementById('tracking-inhoud');
  if (!data) return;

  const { momenten, stations, patrouilles, bezoekLookup, routeLookup, routeStationsLookup } = data;

  if (!momenten.length) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body text-center" style="padding:2rem">
          <div style="font-size:2rem;opacity:.4;margin-bottom:1rem">&#128204;</div>
          <p class="text-muted">Geen rally-momenten actief.<br>
          <span class="text-sm">Zet "Rally modus" aan bij een jureermoment om tracking in te schakelen.</span></p>
        </div>
      </div>
    `;
    return;
  }

  if (!patrouilles.length) {
    el.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px">Geen patrouilles met nummers gevonden.</p></div>`;
    return;
  }

  const m = momenten.find(x => x.moment_id === geselecteerdMomentId);
  if (!m) { el.innerHTML = '<p class="text-muted">Selecteer een rally moment.</p>'; return; }

  const momentStations = stations.filter(s => s.moment_id === m.moment_id);
  const momentHtml = m.rally_type === 'tocht'
    ? renderTochtMoment(m, momentStations, patrouilles, bezoekLookup, routeLookup, routeStationsLookup)
    : renderSpelmiddagMoment(m, momentStations, patrouilles, bezoekLookup);

  el.innerHTML = momentHtml;
}

// ── Tocht ─────────────────────────────────────────────────────────

function renderTochtMoment(moment, momentStations, patrouilles, bezoekLookup, routeLookup, routeStationsLookup) {
  // Groepeer patrouilles per route
  const routeGroepen = {}; // routeId → { route_naam, stations[], patrouilles[] }
  const geenRoute    = [];

  for (const pat of patrouilles) {
    const rt = routeLookup[`${moment.moment_id}_${pat.id}`];
    if (!rt) {
      geenRoute.push(pat);
      continue;
    }
    if (!routeGroepen[rt.route_id]) {
      // Bouw positielijst (met duplicaten) — elk item is een route-positie met station-info
      const posities = (routeStationsLookup[rt.route_id] || [])
        .map(rs => {
          const st = momentStations.find(s => s.station_id === rs.station_id);
          if (!st) return null;
          return { ...st, is_start: !!rs.is_start };
        })
        .filter(Boolean);
      routeGroepen[rt.route_id] = { route_naam: rt.route_naam, posities, patrouilles: [] };
    }
    routeGroepen[rt.route_id].patrouilles.push(pat);
  }

  const routeTabellen = Object.values(routeGroepen)
    .map(rg => renderTochtRouteGroep(rg, bezoekLookup))
    .join('');

  const geenRouteHtml = geenRoute.length ? `
    <div style="margin-top:12px">
      <span class="text-muted text-sm">Geen route: </span>
      ${geenRoute.map(p => `<span class="badge badge-error" style="margin:2px">#${p.nummer ?? '?'}</span>`).join('')}
    </div>
  ` : '';

  return `
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <h2 style="margin:0;font-size:1rem">${esc(moment.moment_naam)}</h2>
        <span class="text-muted text-sm">${esc(moment.categorie_naam)}</span>
        <span class="badge badge-info" style="font-size:.7rem">Tocht</span>
      </div>
      <div style="margin-bottom:8px;font-size:.75rem;display:flex;gap:12px;flex-wrap:wrap">
        <span><span style="color:var(--color-warning)">&#8594;</span> Volgende post</span>
        <span><span style="color:var(--color-warning)">&#128336;</span> Aangekomen / bezig</span>
        <span><span style="color:var(--color-success)">&#10003;</span> Voltooid</span>
        <span style="color:var(--color-text-muted)">Getal = aankomstpositie</span>
      </div>
      ${routeTabellen || '<p class="text-muted text-sm">Geen routes ingesteld voor dit moment.</p>'}
      ${geenRouteHtml}
    </div>
  `;
}

function renderTochtRouteGroep(rg, bezoekLookup) {
  const { route_naam, posities, patrouilles } = rg;

  const thCols = posities.map((pos, i) => `
    <th style="padding:6px 8px;text-align:center;min-width:72px;font-size:.75rem;font-weight:600">
      <div style="display:flex;flex-direction:column;align-items:center;gap:1px">
        <div class="text-muted" style="font-size:.65rem">
          ${pos.is_start ? '&#9654; start' : `post ${i + 1}`}
        </div>
        <div>${esc(pos.station_naam)}</div>
      </div>
    </th>
  `).join('');

  const rijen = patrouilles.map(pat => {
    // Bijhouden eerste/tweede keer per station_id (zelfde logica als scan-validatie)
    const eersteKeerGezien = {};
    let volgendeIdx = -1;

    // Bepaal de eerste onvoltooide positie
    for (let i = 0; i < posities.length; i++) {
      const pos       = posities[i];
      const eersteKeer = !eersteKeerGezien[pos.station_id];
      eersteKeerGezien[pos.station_id] = true;
      const b = bezoekLookup[`${pos.station_id}_${pat.id}`];
      const voltooid = eersteKeer ? !!b : !!b?.terugkomst_tijd;
      if (!voltooid) { volgendeIdx = i; break; }
    }

    // Reset voor cel-rendering
    const eersteKeerCel = {};
    const cellen = posities.map((pos, i) => {
      const eersteKeer = !eersteKeerCel[pos.station_id];
      eersteKeerCel[pos.station_id] = true;
      const b = bezoekLookup[`${pos.station_id}_${pat.id}`];

      // Niet bereikt
      if (eersteKeer ? !b : !b?.terugkomst_tijd) {
        if (i === volgendeIdx) {
          return `<td style="text-align:center;padding:4px" title="Volgende post">
            <span style="color:var(--color-warning);font-size:1rem">&#8594;</span>
          </td>`;
        }
        return `<td style="text-align:center;padding:4px">
          <span style="color:var(--color-text-muted)">&#9643;</span>
        </td>`;
      }

      const tijd = eersteKeer
        ? (b.aankomst_tijd ? new Date(b.aankomst_tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '')
        : (b.terugkomst_tijd ? new Date(b.terugkomst_tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '');

      const kleur = (eersteKeer ? b.status === 'voltooid' : !!b.terugkomst_tijd)
        ? 'var(--color-success)' : 'var(--color-warning)';
      const icoon = kleur === 'var(--color-success)' ? '&#10003;' : '&#128336;';

      return `<td style="text-align:center;padding:4px">
        <span style="color:${kleur};font-size:1rem">${icoon}</span>
        ${tijd ? `<div class="text-muted" style="font-size:.6rem">${esc(tijd)}</div>` : ''}
      </td>`;
    }).join('');

    const gedaan   = volgendeIdx === -1 ? posities.length : volgendeIdx;
    const pct      = posities.length ? Math.round(gedaan / posities.length * 100) : 0;
    const kleurBar = pct === 100 ? 'var(--color-success)' : pct > 0 ? 'var(--color-warning)' : 'var(--color-border)';

    return `
      <tr>
        <td style="padding:6px 8px;white-space:nowrap;font-weight:600;min-width:60px">
          <span style="color:var(--color-primary)">#${pat.nummer ?? '?'}</span>
          <div style="width:100%;height:3px;background:var(--color-border);border-radius:2px;margin-top:3px">
            <div style="width:${pct}%;height:3px;background:${kleurBar};border-radius:2px"></div>
          </div>
          <div class="text-muted" style="font-size:.65rem">${gedaan}/${posities.length}</div>
        </td>
        ${cellen}
      </tr>
    `;
  }).join('');

  return `
    <div style="margin-bottom:20px">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:8px;color:var(--color-primary)">
        Route: ${esc(route_naam)}
        <span class="text-muted" style="font-weight:400;font-size:.8rem"> — ${patrouilles.length} patrouille${patrouilles.length !== 1 ? 's' : ''}</span>
      </div>
      ${posities.length ? `
        <div style="overflow-x:auto">
          <table class="data-table" style="min-width:100%">
            <thead>
              <tr>
                <th style="padding:6px 8px;font-size:.8rem">#</th>
                ${thCols}
              </tr>
            </thead>
            <tbody>${rijen}</tbody>
          </table>
        </div>
      ` : '<p class="text-muted text-sm">Geen stations in deze route.</p>'}
    </div>
  `;
}

// ── Spelmiddag ────────────────────────────────────────────────────

function renderSpelmiddagMoment(moment, momentStations, patrouilles, bezoekLookup) {
  const header = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <h2 style="margin:0;font-size:1rem">${esc(moment.moment_naam)}</h2>
      <span class="text-muted text-sm">${esc(moment.categorie_naam)}</span>
      <span class="badge badge-warning" style="font-size:.7rem">Spelmiddag</span>
    </div>
  `;

  if (!momentStations.length) {
    return `<div class="card" style="margin-bottom:16px;padding:16px">${header}<p class="text-muted text-sm">Geen stations geconfigureerd.</p></div>`;
  }

  const thCols = momentStations.map(st => `
    <th style="padding:4px 6px;text-align:center;min-width:56px;font-size:.75rem;font-weight:600">
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;max-height:80px;margin:0 auto">
        ${esc(st.station_naam)}
      </div>
    </th>
  `).join('');

  const rijen = patrouilles.map(pat => {
    const cellen = momentStations.map(st => {
      const b = bezoekLookup[`${st.station_id}_${pat.id}`];
      if (!b) return `<td style="text-align:center;padding:4px"><span style="color:var(--color-text-muted)">&#9643;</span></td>`;
      if (b.status === 'voltooid') return `<td style="text-align:center;padding:4px"><span style="color:var(--color-success);font-size:1.1rem">&#10003;</span></td>`;
      return `<td style="text-align:center;padding:4px"><span style="color:var(--color-warning)">&#128336;</span></td>`;
    }).join('');

    const gedaan   = momentStations.filter(st => !!bezoekLookup[`${st.station_id}_${pat.id}`]).length;
    const pct      = momentStations.length ? Math.round(gedaan / momentStations.length * 100) : 0;
    const kleurBar = pct === 100 ? 'var(--color-success)' : pct > 0 ? 'var(--color-warning)' : 'var(--color-border)';

    return `
      <tr>
        <td style="padding:6px 8px;white-space:nowrap;font-weight:600;min-width:60px">
          <span style="color:var(--color-primary)">#${pat.nummer ?? '?'}</span>
          <div style="width:100%;height:3px;background:var(--color-border);border-radius:2px;margin-top:3px">
            <div style="width:${pct}%;height:3px;background:${kleurBar};border-radius:2px"></div>
          </div>
        </td>
        ${cellen}
        <td style="text-align:center;padding:4px;font-weight:700;color:var(--color-primary)">${gedaan}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom:16px;padding:16px">
      ${header}
      <div style="margin-bottom:8px;font-size:.75rem;display:flex;gap:12px;flex-wrap:wrap">
        <span><span style="color:var(--color-text-muted)">&#9643;</span> Niet gedaan</span>
        <span><span style="color:var(--color-warning)">&#128336;</span> Bezig</span>
        <span><span style="color:var(--color-success)">&#10003;</span> Voltooid</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" style="min-width:100%">
          <thead>
            <tr>
              <th style="padding:6px 8px;font-size:.8rem">#</th>
              ${thCols}
              <th style="padding:6px 8px;text-align:center;font-size:.8rem">Totaal</th>
            </tr>
          </thead>
          <tbody>${rijen}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────

function toonBericht(type, msg) {
  const el = document.getElementById('tracking-berichten');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}" style="margin-bottom:12px">${esc(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
