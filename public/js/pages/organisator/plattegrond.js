// public/js/pages/organisator/plattegrond.js — Plattegrond editor
// Drie kolommen: links (context-afhankelijk), midden (canvas), rechts (settings + acties)

import { get, put, post, del } from '../../services/api.js';
import { escapeHtml }          from '../../utils/escape.js';
import { PlattegrondCanvas }   from './plattegrond-canvas.js';

const MAX_CANVAS_W = 1600;
const MAX_CANVAS_H = 1200;

let editieId    = null;
let canvas      = null;
let plattegrond = null;
let subkampen   = [];
let patrouilles = [];
let actieveSub  = null;
let actieveTool = 'bewegen';
let huidigType  = 'wedstrijd';
let slaOpTimer  = null;
let canvasB     = 900;
let canvasH     = 600;

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div id="plat-editor" style="display:grid;grid-template-columns:220px 1fr 260px;gap:12px;align-items:start">

      <!-- ── Links ─────────────────────────────────────────────── -->
      <div style="display:flex;flex-direction:column;gap:8px">

        <!-- Editor-modus: cellen aanmaken + subkamp items -->
        <div id="editor-kolom" style="display:flex;flex-direction:column;gap:8px">
          <div class="card" style="padding:12px">
            <div class="form-label">Celafmeting (raster-eenheden)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px">
              <div>
                <label class="form-label" style="font-size:.75rem">Breed</label>
                <input class="form-input" type="number" id="inp-def-w" min="1" max="50" value="3" />
              </div>
              <div>
                <label class="form-label" style="font-size:.75rem">Hoog</label>
                <input class="form-input" type="number" id="inp-def-h" min="1" max="50" value="4" />
              </div>
            </div>
            <div id="lbl-def-px" class="text-muted" style="font-size:.75rem;text-align:center;margin-bottom:10px"></div>
            <div class="form-label">Celtype</div>
            <div id="celtype-knoppen" style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" data-type="wedstrijd">&#127937; Wedstrijd</button>
              <button class="btn btn-ghost btn-sm"   data-type="HQ">&#11088; HQ</button>
              <button class="btn btn-ghost btn-sm"   data-type="onbruikbaar">&#128683; Onbr.</button>
            </div>
          </div>
          <div class="card" style="padding:12px;max-height:160px;overflow-y:auto">
            <div class="form-label">Sleep naar canvas</div>
            <div id="subkamp-sleep" style="display:flex;flex-direction:column;gap:4px"></div>
          </div>
        </div>

        <!-- Indeling-modus: patrouilles slepen naar cellen -->
        <div id="indeling-kolom" style="display:none;flex-direction:column;gap:8px">
          <div class="card" style="padding:12px">
            <div class="form-label" style="margin-bottom:6px">Niet ingedeeld</div>
            <div id="niet-ingedeeld" style="display:flex;flex-direction:column;gap:3px;max-height:220px;overflow-y:auto"></div>
          </div>
          <div id="subkamp-groepen" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>

      </div>

      <!-- ── Midden ─────────────────────────────────────────────── -->
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0;overflow:hidden">

        <!-- Toolbar: tools (editor) + zoom altijd -->
        <div style="display:flex;align-items:center;gap:6px;background:var(--color-surface);
                    border:1px solid var(--color-border);border-radius:var(--radius-md);padding:6px 10px;flex-wrap:wrap">
          <div id="tool-knoppen" style="display:contents">
            <button class="btn btn-primary btn-sm tool-knop" data-tool="bewegen"
                    title="Selecteer / sleep cellen">&#8597; Verplaatsen</button>
            <button class="btn btn-ghost btn-sm" id="btn-draaien"
                    title="Draai geselecteerde cel (R)">&#8635; Draaien</button>
            <button class="btn btn-ghost btn-sm tool-knop" data-tool="subkamp_verf"
                    title="Wijs actief subkamp toe aan cel">&#127912; Subkamp</button>
            <button class="btn btn-ghost btn-sm tool-knop" data-tool="verwijder"
                    title="Klik op cel om te verwijderen">&#128465; Verwijder</button>
            <span style="width:1px;height:20px;background:var(--color-border);margin:0 4px"></span>
          </div>
          <span style="flex:1"></span>
          <span id="lbl-canvas-grootte" class="text-muted" style="font-size:.75rem"></span>
          <button class="btn btn-ghost btn-sm" id="btn-zoom-in"    title="Inzoomen">&#43;</button>
          <button class="btn btn-ghost btn-sm" id="btn-zoom-out"   title="Uitzoomen">&#8722;</button>
          <button class="btn btn-ghost btn-sm" id="btn-zoom-reset" title="Zoom resetten">100%</button>
        </div>

        <!-- Canvas -->
        <div style="background:var(--color-bg);border:1px solid var(--color-border);
                    border-radius:var(--radius-md);padding:8px;overflow:hidden;width:100%;box-sizing:border-box">
          <canvas id="plat-canvas" style="image-rendering:pixelated;display:block"></canvas>
        </div>

      </div>

      <!-- ── Rechts ─────────────────────────────────────────────── -->
      <div style="display:flex;flex-direction:column;gap:12px">

        <!-- Raster- en celinstellingen (verdwijnt bij grid-lock) -->
        <div id="instellingen-kaart" class="card" style="padding:12px">
          <div class="form-label" style="margin-bottom:8px">Raster &amp; achtergrond</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
            <div>
              <label class="form-label" style="font-size:.75rem">Breed (raster-eenheden)</label>
              <input class="form-input" type="number" id="inp-canvas-b" min="200" max="2000" value="900" />
            </div>
            <div>
              <label class="form-label" style="font-size:.75rem">Hoog</label>
              <input class="form-input" type="number" id="inp-canvas-h" min="200" max="2000" value="600" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:6px">
            <label class="form-label" style="font-size:.75rem">Rastergrootte (px/eenheid)</label>
            <input class="form-input" type="number" id="inp-snap" min="5" max="200" value="20" />
          </div>
          <div class="form-group" style="margin-bottom:6px">
            <label class="form-label" style="font-size:.75rem">Schaal (meter/eenheid)</label>
            <input class="form-input" type="number" id="inp-schaal" min="0.1" step="0.1" placeholder="bijv. 2.5" />
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:.75rem">
              Achtergrond zichtbaarheid (<span id="opacity-waarde">65</span>%)
            </label>
            <input type="range" id="inp-opacity" min="5" max="100" value="65"
                   style="width:100%;accent-color:var(--color-primary)" />
          </div>
          <input type="file" id="afb-upload" accept="image/*" style="display:none" />
          <div style="display:flex;gap:4px;margin-bottom:8px">
            <button class="btn btn-ghost btn-sm" id="btn-afb-kiezen" style="flex:1">&#128247; Afbeelding</button>
            <button class="btn btn-ghost btn-sm" id="btn-afb-verwijderen"
                    style="color:var(--color-error);display:none" title="Verwijder achtergrond">&#128465;</button>
          </div>
          <div id="afb-info" class="text-muted" style="font-size:.75rem;margin-bottom:6px;display:none"></div>
          <button class="btn btn-primary btn-sm w-full" id="btn-instellingen-opslaan">Opslaan</button>
        </div>

        <!-- Vastzetten -->
        <div class="card" style="padding:12px">
          <div class="form-label" style="margin-bottom:8px">Vastzetten</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-sm btn-primary w-full" id="btn-grid-vast">&#128274; Grid vastzetten</button>
            <button class="btn btn-sm btn-ghost w-full"   id="btn-sub-vast"  disabled>&#128274; Subkampen vastzetten</button>
            <button class="btn btn-sm btn-ghost w-full"   id="btn-pat-vast"  disabled>&#128274; Patrouilles vastzetten</button>
          </div>
          <p id="lock-uitleg" class="text-muted text-sm mt-8"></p>
        </div>

        <!-- Publiceren -->
        <div class="card" style="padding:12px">
          <div class="form-label" style="margin-bottom:4px">Publiceren</div>
          <p class="text-muted text-sm" style="margin-bottom:8px">Bepaal wat leiding en publiek kunnen zien.</p>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-sm btn-ghost w-full" id="btn-pub-subkamp" disabled>
              &#128228; Subkampen publiceren
            </button>
            <p id="pub-sub-uitleg" class="text-muted text-sm mt-4" style="margin-bottom:4px"></p>
            <button class="btn btn-sm btn-ghost w-full" id="btn-pub-nummers" disabled>
              &#128228; Nummers publiceren
            </button>
            <p id="pub-nr-uitleg" class="text-muted text-sm mt-4"></p>
          </div>
        </div>

        <!-- Indeling & nummering -->
        <div class="card" style="padding:12px">
          <div class="form-label" style="margin-bottom:6px">Indeling</div>
          <div class="text-muted text-sm" id="lbl-geplaatst" style="margin-bottom:8px"></div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-sm btn-primary w-full" id="btn-autoindeling">&#9881;&#65039; Auto-indeling</button>
            <button class="btn btn-sm btn-ghost w-full"   id="btn-nummers">&#128290; Bereken nummers</button>
            <button class="btn btn-sm btn-ghost w-full"   id="btn-nummers-aanpassen">&#9999;&#65039; Nummers aanpassen</button>
          </div>
          <div id="subkamp-volgorde" style="margin-top:10px;border-top:1px solid var(--color-border);padding-top:8px;font-size:.8rem;color:var(--color-text-muted)"></div>
        </div>

      </div>
    </div>

    <!-- Nummers-aanpassen modal -->
    <div id="modal-nummers" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);
         z-index:1000;align-items:center;justify-content:center">
      <div class="card" style="padding:20px;width:460px;max-height:80vh;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>Nummers aanpassen</strong>
          <button class="btn-icon" id="btn-nummers-sluiten">&#10005;</button>
        </div>
        <p class="text-muted text-sm">Wijzig het nummer per cel. Nummers hoeven niet aaneengesloten te zijn.</p>
        <div id="nummers-lijst" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:4px"></div>
        <button class="btn btn-primary w-full" id="btn-nummers-opslaan">Opslaan</button>
      </div>
    </div>
  `;
}

// ── Mount / Destroy ───────────────────────────────────────────────

export async function onMount() {
  try {
    const editie = await get('/publiek/editie/actief');
    editieId = editie?.id ?? null;
  } catch { editieId = null; }

  if (!editieId) return;

  canvas = new PlattegrondCanvas(document.getElementById('plat-canvas'));
  canvas.onChange = (cellen) => {
    plattegrond.cellen = cellen;      // lokale staat synchroon houden
    renderPlaatsingsLijst();          // linker kolom direct bijwerken
    debouncedOpslaan(cellen);         // opslaan na debounce
  };

  await herlaad();
  bindUIEvents();
  bindSlepenNaarPanel();
  document.addEventListener('keydown', onKeyDown);
}

export function onDestroy() {
  if (slaOpTimer) clearTimeout(slaOpTimer);
  document.removeEventListener('keydown', onKeyDown);
}

function onKeyDown(e) {
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey)
    canvas?.rotateerGeselecteerde();
}

// ── Data ──────────────────────────────────────────────────────────

async function herlaad() {
  [plattegrond, subkampen] = await Promise.all([
    get(`/plattegrond/${editieId}`),
    get(`/subkampen?editie_id=${editieId}`),
  ]);
  patrouilles = await get('/admin/inschrijvingen').then(d => d.patrouilles ?? []).catch(() => []);

  canvasB = plattegrond.breedte      ?? 900;
  canvasH = plattegrond.hoogte       ?? 600;
  const s = plattegrond.snap_grootte ?? 20;
  const m = plattegrond.schaal_meter ?? null;
  const o = plattegrond.bg_opacity   ?? 0.65;

  canvas.setCanvas(canvasB, canvasH);
  canvas.setSnap(s);
  canvas.setSchaal(m);
  canvas.setOpacity(o);
  canvas.setSubkampen(subkampen);
  canvas.setPatrouilles(patrouilles);
  canvas.setCellen(plattegrond.cellen ?? {});
  canvas.setVergrendeld(!!plattegrond.vergrendeld);

  if (plattegrond.indeling_vast || plattegrond.vergrendeld) {
    canvas.setIndelingModus(!!plattegrond.indeling_vast);
  } else {
    canvas.setEditorModus();
  }

  // Inputs bijwerken
  document.getElementById('inp-snap').value     = s;
  document.getElementById('inp-schaal').value   = m ?? '';
  document.getElementById('inp-opacity').value  = Math.round(o * 100);
  document.getElementById('opacity-waarde').textContent = Math.round(o * 100);
  document.getElementById('inp-def-w').value    = plattegrond.def_cel_w ?? 3;
  document.getElementById('inp-def-h').value    = plattegrond.def_cel_h ?? 4;
  document.getElementById('inp-canvas-b').value = canvasB;
  document.getElementById('inp-canvas-h').value = canvasH;
  document.getElementById('lbl-canvas-grootte').textContent = `${canvasB} × ${canvasH} px`;

  updateDefaults();
  updateKolommen();
  updateVergrendeling();
  updateIndelingKaart();

  // Achtergrond laden
  get(`/plattegrond/${editieId}/afbeelding`).then(({ afbeelding }) => {
    if (afbeelding) {
      canvas.setAfbeelding(afbeelding);
      document.getElementById('btn-afb-verwijderen').style.display = '';
    }
  }).catch(() => {});

}

// ── Kolommen: context-afhankelijk tonen ───────────────────────────

function updateKolommen() {
  const gridVast = !!plattegrond.vergrendeld;
  document.getElementById('editor-kolom').style.display  = gridVast ? 'none'  : 'flex';
  document.getElementById('indeling-kolom').style.display = gridVast ? 'flex'  : 'none';
  document.getElementById('instellingen-kaart').style.display = gridVast ? 'none' : '';
  document.getElementById('tool-knoppen').style.display = gridVast ? 'none' : 'contents';

  if (gridVast) {
    renderPlaatsingsLijst();
  } else {
    renderSubkampSleep();
  }
}

// ── Vergrendeling status & knoppen ────────────────────────────────

function updateVergrendeling() {
  const gridVast = !!plattegrond.vergrendeld;
  const subVast  = !!plattegrond.indeling_vast;
  const patVast  = !!plattegrond.gepubliceerd;
  const subPub   = !!plattegrond.subkamp_gepubliceerd;
  const nrPub    = !!plattegrond.nummers_gepubliceerd;

  // ── Vastzetten ──
  const btnGrid = document.getElementById('btn-grid-vast');
  const btnSub  = document.getElementById('btn-sub-vast');
  const btnPat  = document.getElementById('btn-pat-vast');

  btnGrid.textContent = gridVast ? '\uD83D\uDD13 Grid vrijgeven'       : '\uD83D\uDD12 Grid vastzetten';
  btnGrid.className   = `btn btn-sm ${gridVast ? 'btn-ghost' : 'btn-primary'} w-full`;

  btnSub.disabled    = !gridVast;
  btnSub.textContent = subVast ? '\uD83D\uDD13 Subkampen vrijgeven'    : '\uD83D\uDD12 Subkampen vastzetten';
  btnSub.className   = `btn btn-sm ${subVast ? 'btn-ghost' : gridVast ? 'btn-primary' : 'btn-ghost'} w-full`;

  btnPat.disabled    = !subVast;
  btnPat.textContent = patVast ? '\uD83D\uDD13 Patrouilles vrijgeven'  : '\uD83D\uDD12 Patrouilles vastzetten';
  btnPat.className   = `btn btn-sm ${patVast ? 'btn-ghost' : subVast ? 'btn-primary' : 'btn-ghost'} w-full`;

  document.getElementById('lock-uitleg').textContent =
    patVast  ? 'Patrouille-indeling is vastgezet.' :
    subVast  ? 'Subkampen zijn vastgezet. Patrouilles kunnen alleen binnen eigen subkamp worden verschoven.' :
    gridVast ? 'Grid is vastgezet. Sleep patrouilles naar lege velden.' :
               'Zet het grid vast als alle velden correct staan.';

  // ── Publiceren ──
  const btnPubSub = document.getElementById('btn-pub-subkamp');
  const btnPubNr  = document.getElementById('btn-pub-nummers');

  btnPubSub.disabled    = !gridVast;
  btnPubSub.textContent = subPub ? '\uD83D\uDD12 Subkampen verbergen' : '\uD83D\uDCE4 Subkampen publiceren';
  btnPubSub.className   = `btn btn-sm ${subPub ? 'btn-ghost' : gridVast ? 'btn-primary' : 'btn-ghost'} w-full`;
  document.getElementById('pub-sub-uitleg').textContent = subPub
    ? 'Leiding en publiek zien welke patrouilles in welk subkamp zitten.'
    : 'Publiceer om subkamp-indeling zichtbaar te maken voor leiding en publiek.';

  btnPubNr.disabled    = !subVast;
  btnPubNr.textContent = nrPub ? '\uD83D\uDD12 Nummers verbergen' : '\uD83D\uDCE4 Nummers publiceren';
  btnPubNr.className   = `btn btn-sm ${nrPub ? 'btn-ghost' : subVast ? 'btn-primary' : 'btn-ghost'} w-full`;
  document.getElementById('pub-nr-uitleg').textContent = nrPub
    ? 'Leiding ziet het patrouillenummer van hun eigen patrouille.'
    : 'Publiceer om patrouillenummers zichtbaar te maken voor leiding.';
}

// ── Indeling kaart ────────────────────────────────────────────────

function updateIndelingKaart() {
  const cellen = plattegrond.cellen ?? {};
  const geplaatst = Object.values(cellen).filter(c => c.patrouille_id).length;
  document.getElementById('lbl-geplaatst').textContent =
    `${geplaatst} van ${patrouilles.length} patrouilles geplaatst`;

  const subVast = !!plattegrond.indeling_vast;
  const patVast = !!plattegrond.gepubliceerd;
  document.getElementById('btn-autoindeling').disabled = subVast || patVast;
  document.getElementById('btn-nummers').disabled      = patVast;

  // Subkamp volgorde
  document.getElementById('subkamp-volgorde').innerHTML = subkampen.length
    ? `<div class="form-label" style="margin-bottom:4px;font-size:.75rem">Nummering volgorde</div>` +
      subkampen.map((s, i) =>
        `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
           <span style="width:10px;height:10px;border-radius:50%;background:${escapeHtml(s.kleur)};flex-shrink:0"></span>
           <span>${i + 1}. ${escapeHtml(s.naam)}</span>
         </div>`
      ).join('')
    : '';
}

// ── Terugslepen naar panel ────────────────────────────────────────

function bindSlepenNaarPanel() {
  document.getElementById('plat-canvas').addEventListener('rsw:slepen-verlaat', e => {
    const { fromCelId, patId } = e.detail;
    const pat = patrouilles.find(p => p.id === patId);

    // Maak een zwevende ghost-div die de muis volgt
    const ghost = document.createElement('div');
    const jongsteBadge = pat?.jongste ? ' \u2605' : '';
    ghost.innerHTML = `<strong>${escapeHtml(pat?.afkorting ?? '?')}${escapeHtml(jongsteBadge)}</strong>`
      + ` <span style="opacity:.7">${escapeHtml(pat?.groep_naam_kort ?? '')}</span>`;
    ghost.style.cssText = [
      'position:fixed', 'z-index:9999', 'pointer-events:none',
      'background:var(--color-surface-alt)', 'border:1px solid var(--color-primary)',
      'border-radius:var(--radius-sm)', 'padding:4px 10px', 'font-size:.8rem',
      'box-shadow:0 4px 12px rgba(0,0,0,.5)', 'white-space:nowrap',
    ].join(';');
    document.body.appendChild(ghost);

    // Highlight het panel als drop-zone
    const dropZone = document.getElementById('niet-ingedeeld')?.closest('.card');

    function onMove(ev) {
      ghost.style.left = ev.clientX + 14 + 'px';
      ghost.style.top  = ev.clientY - 16 + 'px';

      if (dropZone) {
        const r = dropZone.getBoundingClientRect();
        const over = ev.clientX >= r.left && ev.clientX <= r.right
                  && ev.clientY >= r.top  && ev.clientY <= r.bottom;
        dropZone.style.outline = over ? '2px solid var(--color-primary)' : '';
      }
    }

    function onUp(ev) {
      ghost.remove();
      if (dropZone) dropZone.style.outline = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);

      // Controleer of de muis boven het panel losgelaten is
      if (dropZone) {
        const r = dropZone.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right
         && ev.clientY >= r.top  && ev.clientY <= r.bottom) {
          canvas.unassignCel(fromCelId);
        }
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Linker kolom: patrouilles ─────────────────────────────────────

function renderPlaatsingsLijst() {
  const cellen = plattegrond.cellen ?? {};
  const geplaatsteIds = new Set(Object.values(cellen).map(c => c.patrouille_id).filter(Boolean));

  const nietIngedeeld = patrouilles.filter(p => !geplaatsteIds.has(p.id));
  const elNiet = document.getElementById('niet-ingedeeld');

  if (!nietIngedeeld.length) {
    elNiet.innerHTML = '<span class="text-muted text-sm">Alle patrouilles zijn ingedeeld.</span>';
  } else {
    elNiet.innerHTML = nietIngedeeld.map(p => patrouilleKaartje(p)).join('');
    elNiet.querySelectorAll('.pat-drag').forEach(el => bindPatrouilleDrag(el));
  }

  // Subkampen met hun patrouilles
  const groepenEl = document.getElementById('subkamp-groepen');
  groepenEl.innerHTML = subkampen.map(sub => {
    const ids = Object.values(cellen).filter(c => c.subkamp_id === sub.id && c.patrouille_id).map(c => c.patrouille_id);
    const pats = ids.map(id => patrouilles.find(p => p.id === id)).filter(Boolean);
    return `
      <div class="card" style="padding:10px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="width:12px;height:12px;border-radius:50%;background:${escapeHtml(sub.kleur)};flex-shrink:0"></span>
          <strong style="font-size:.85rem">${escapeHtml(sub.naam)}</strong>
          <span class="text-muted text-sm">(${pats.length})</span>
        </div>
        ${pats.length
          ? pats.map(p => `<div style="font-size:.78rem;padding:2px 4px;color:var(--color-text-muted)">
              ${p.jongste ? '<span style="color:#ffd700">\u2605</span> ' : ''}${escapeHtml(p.afkorting ?? '')} ${escapeHtml(p.groep_naam_kort ?? '')} · ${escapeHtml(p.naam)}
            </div>`).join('')
          : `<span class="text-muted text-sm">Leeg</span>`}
      </div>`;
  }).join('');
}

function patrouilleKaartje(p) {
  const jongsteBadge = p.jongste
    ? `<span style="color:#ffd700;font-size:.7rem;margin-left:4px" title="Jongste patrouille">\u2605</span>`
    : '';
  return `
    <div class="pat-drag" draggable="true" data-pat-id="${p.id}"
         style="background:var(--color-surface-alt);border:1px solid var(--color-border);
                border-radius:var(--radius-sm);padding:5px 8px;cursor:grab;font-size:.8rem">
      <div style="display:flex;align-items:center;gap:2px">
        <strong>${escapeHtml(p.afkorting ?? '')}</strong>${jongsteBadge}
        <span style="color:var(--color-text-muted);margin-left:4px">${escapeHtml(p.groep_naam_kort ?? '')}</span>
      </div>
      <div style="font-size:.75rem;color:var(--color-text-muted)">${escapeHtml(p.naam)}</div>
    </div>`;
}

function bindPatrouilleDrag(el) {
  const patId = Number(el.dataset.patId);
  el.addEventListener('dragstart', e => {
    const data = { type: 'patrouille', patId };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    canvas.setPendingDrag(data);
    setTimeout(() => el.style.opacity = '0.4', 0);
  });
  el.addEventListener('dragend', () => {
    el.style.opacity = '';
    canvas.setPendingDrag(null);
    // Herlaad lijsten na drop (canvas.onChange triggert cellen-save; herlaad na korte delay)
    setTimeout(renderPlaatsingsLijst, 200);
  });
}

// ── Subkamp sleep (editor-modus) ──────────────────────────────────

function renderSubkampSleep() {
  const el = document.getElementById('subkamp-sleep');
  if (!subkampen.length) {
    el.innerHTML = '<span class="text-muted text-sm">Geen subkampen aangemaakt.</span>';
    return;
  }
  el.innerHTML = subkampen.map(s =>
    `<div class="btn btn-ghost btn-sm sub-sleep-item" draggable="true" data-sub-id="${s.id}"
          style="display:flex;align-items:center;gap:6px;text-align:left;cursor:grab">
       <span style="width:12px;height:12px;border-radius:50%;background:${escapeHtml(s.kleur)};
                    flex-shrink:0;border:1px solid rgba(255,255,255,.2)"></span>
       <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(s.naam)}</span>
       <span style="font-size:.7rem;opacity:.5">&#8597;</span>
     </div>`
  ).join('');

  if (subkampen.length) activeerSubkamp(subkampen[0]);

  el.querySelectorAll('.sub-sleep-item').forEach(item => {
    const sub = subkampen.find(s => s.id === Number(item.dataset.subId));
    item.addEventListener('click', () => activeerSubkamp(sub));
    item.addEventListener('dragstart', e => {
      const type = huidigType === 'onbruikbaar' ? 'onbruikbaar' : huidigType;
      const data = { subkampId: type === 'onbruikbaar' ? null : sub.id, type };
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
      canvas.setPendingDrag(data);
    });
    item.addEventListener('dragend', () => canvas.setPendingDrag(null));
  });
}

function activeerSubkamp(sub) {
  actieveSub = sub;
  canvas.setTool(actieveTool, sub);
  document.querySelectorAll('.sub-sleep-item').forEach(b => {
    b.classList.toggle('btn-primary', Number(b.dataset.subId) === sub?.id);
    b.classList.toggle('btn-ghost',   Number(b.dataset.subId) !== sub?.id);
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function huidigSnap() { return Math.max(5, Number(document.getElementById('inp-snap').value) || 20); }

function updateDefaults() {
  const g  = huidigSnap();
  const wu = Number(document.getElementById('inp-def-w').value) || 3;
  const hu = Number(document.getElementById('inp-def-h').value) || 4;
  document.getElementById('lbl-def-px').textContent = `= ${wu * g} × ${hu * g} px`;
  canvas?.setDefaults(wu * g, hu * g);
}

// ── UI events ─────────────────────────────────────────────────────

function bindUIEvents() {
  // Vergrendeling knoppen
  document.getElementById('btn-grid-vast').addEventListener('click', async () => {
    await put(`/plattegrond/${editieId}/vergrendel`, { vergrendeld: !plattegrond.vergrendeld });
    await herlaad();
  });
  document.getElementById('btn-sub-vast').addEventListener('click', async () => {
    await put(`/plattegrond/${editieId}/indelingvast`, { vast: !plattegrond.indeling_vast });
    await herlaad();
  });
  document.getElementById('btn-pat-vast').addEventListener('click', async () => {
    await put(`/plattegrond/${editieId}/publiceer`, { gepubliceerd: !plattegrond.gepubliceerd });
    await herlaad();
  });
  document.getElementById('btn-pub-subkamp').addEventListener('click', async () => {
    await put(`/plattegrond/${editieId}/publiceer-subkamp`, { gepubliceerd: !plattegrond.subkamp_gepubliceerd });
    await herlaad();
  });
  document.getElementById('btn-pub-nummers').addEventListener('click', async () => {
    await put(`/plattegrond/${editieId}/publiceer-nummers`, { gepubliceerd: !plattegrond.nummers_gepubliceerd });
    await herlaad();
  });

  // Celtype
  document.getElementById('celtype-knoppen').querySelectorAll('button').forEach(btn =>
    btn.addEventListener('click', () => {
      document.getElementById('celtype-knoppen').querySelectorAll('button').forEach(b =>
        b.classList.replace('btn-primary', 'btn-ghost'));
      btn.classList.replace('btn-ghost', 'btn-primary');
      huidigType = btn.dataset.type;
    })
  );

  // Celafmeting inputs
  ['inp-def-w', 'inp-def-h', 'inp-snap'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateDefaults)
  );
  ['inp-def-w', 'inp-def-h'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => {
      const g = huidigSnap();
      canvas?.resizeAllCellen(
        (Number(document.getElementById('inp-def-w').value) || 3) * g,
        (Number(document.getElementById('inp-def-h').value) || 4) * g
      );
    })
  );

  // Tools
  document.querySelectorAll('.tool-knop').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-knop').forEach(b => b.classList.replace('btn-primary', 'btn-ghost'));
      btn.classList.replace('btn-ghost', 'btn-primary');
      actieveTool = btn.dataset.tool;
      canvas.setTool(actieveTool, actieveSub);
    })
  );
  document.getElementById('btn-draaien').addEventListener('click', () => canvas.rotateerGeselecteerde());

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click',    () => canvas.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click',   () => canvas.zoomOut());
  document.getElementById('btn-zoom-reset').addEventListener('click', () => canvas.resetZoom());

  // Opacity
  document.getElementById('inp-opacity').addEventListener('input', e => {
    document.getElementById('opacity-waarde').textContent = e.target.value;
    canvas.setOpacity(Number(e.target.value) / 100);
  });

  // Instellingen opslaan
  document.getElementById('btn-instellingen-opslaan').addEventListener('click', async () => {
    canvasB = Number(document.getElementById('inp-canvas-b').value) || canvasB;
    canvasH = Number(document.getElementById('inp-canvas-h').value) || canvasH;
    const snap_grootte = huidigSnap();
    const schaal_meter = document.getElementById('inp-schaal').value.trim()
      ? Number(document.getElementById('inp-schaal').value) : null;
    const bg_opacity  = Number(document.getElementById('inp-opacity').value) / 100;
    const def_cel_w   = Number(document.getElementById('inp-def-w').value) || 3;
    const def_cel_h   = Number(document.getElementById('inp-def-h').value) || 4;
    canvas.setCanvas(canvasB, canvasH);
    canvas.setSnap(snap_grootte);
    canvas.setSchaal(schaal_meter);
    updateDefaults();
    document.getElementById('lbl-canvas-grootte').textContent = `${canvasB} × ${canvasH} px`;
    try {
      await put(`/plattegrond/${editieId}/instellingen`,
        { breedte: canvasB, hoogte: canvasH, snap_grootte, def_cel_w, def_cel_h, schaal_meter, bg_opacity });
    } catch { /* stil */ }
  });

  // Achtergrond
  document.getElementById('btn-afb-kiezen').addEventListener('click', () =>
    document.getElementById('afb-upload').click()
  );
  document.getElementById('afb-upload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const btn = document.getElementById('btn-afb-kiezen');
    btn.textContent = 'Bezig…'; btn.disabled = true;
    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const base64 = evt.target.result;
        const img = new Image(); img.src = base64;
        await new Promise(r => { img.onload = r; });
        const scale = Math.min(1, MAX_CANVAS_W / img.naturalWidth, MAX_CANVAS_H / img.naturalHeight);
        canvasB = Math.round(img.naturalWidth * scale);
        canvasH = Math.round(img.naturalHeight * scale);
        canvas.setCanvas(canvasB, canvasH);
        await canvas.setAfbeelding(base64);
        document.getElementById('lbl-canvas-grootte').textContent = `${canvasB} × ${canvasH} px`;
        document.getElementById('inp-canvas-b').value = canvasB;
        document.getElementById('inp-canvas-h').value = canvasH;
        document.getElementById('afb-info').textContent =
          `${img.naturalWidth} × ${img.naturalHeight} → ${canvasB} × ${canvasH} px`;
        document.getElementById('afb-info').style.display = '';
        document.getElementById('btn-afb-verwijderen').style.display = '';
        const snap_grootte = huidigSnap(), bg_opacity = Number(document.getElementById('inp-opacity').value) / 100;
        const schaal_meter = document.getElementById('inp-schaal').value.trim() ? Number(document.getElementById('inp-schaal').value) : null;
        const def_cel_w = Number(document.getElementById('inp-def-w').value) || 3;
        const def_cel_h = Number(document.getElementById('inp-def-h').value) || 4;
        await post(`/plattegrond/${editieId}/afbeelding`, { afbeelding: base64 });
        await put(`/plattegrond/${editieId}/instellingen`,
          { breedte: canvasB, hoogte: canvasH, snap_grootte, def_cel_w, def_cel_h, schaal_meter, bg_opacity });
      } catch (err) { alert('Fout bij uploaden: ' + err.message); }
      finally { btn.textContent = '&#128247; Afbeelding'; btn.disabled = false; }
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('btn-afb-verwijderen').addEventListener('click', async () => {
    await canvas.setAfbeelding(null);
    try { await del(`/plattegrond/${editieId}/afbeelding`); } catch { /* stil */ }
    document.getElementById('btn-afb-verwijderen').style.display = 'none';
    document.getElementById('afb-info').style.display = 'none';
    document.getElementById('afb-upload').value = '';
  });

  // Indeling knoppen
  document.getElementById('btn-autoindeling').addEventListener('click', async () => {
    const btn = document.getElementById('btn-autoindeling');
    btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      const { cellen } = await post(`/plattegrond/${editieId}/autoindeling`, {});
      canvas.setCellen(cellen);
      const { cellen: c2 } = await post(`/plattegrond/${editieId}/nummers`, {});
      canvas.setCellen(c2);
      await put(`/plattegrond/${editieId}/cellen`, { cellen: canvas.getCellen() });
      await herlaad();
    } catch (e) { alert('Fout: ' + e.message); }
    btn.disabled = false; btn.textContent = '⚙️ Auto-indeling';
  });

  document.getElementById('btn-nummers').addEventListener('click', async () => {
    try {
      const { cellen } = await post(`/plattegrond/${editieId}/nummers`, {});
      canvas.setCellen(cellen);
      await put(`/plattegrond/${editieId}/cellen`, { cellen });
      await herlaad();
    } catch (e) { alert('Fout: ' + e.message); }
  });

  // Nummers aanpassen modal
  document.getElementById('btn-nummers-aanpassen').addEventListener('click', () => openNummersModal());
  document.getElementById('btn-nummers-sluiten').addEventListener('click',   () => sluitNummersModal());
  document.getElementById('btn-nummers-opslaan').addEventListener('click',   () => slaaNummersOp());
}

// ── Nummers modal ─────────────────────────────────────────────────

function openNummersModal() {
  const cellen = canvas.getCellen();
  const lijst  = document.getElementById('nummers-lijst');

  const rijen = Object.values(cellen)
    .filter(c => c.type === 'wedstrijd')
    .sort((a, b) => (a.nummer ?? 9999) - (b.nummer ?? 9999) || a.y - b.y || a.x - b.x);

  lijst.innerHTML = rijen.map(c => {
    const sub = subkampen.find(s => s.id === c.subkamp_id);
    const pat = c.patrouille_id ? patrouilles.find(p => p.id === c.patrouille_id) : null;
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;
                     background:${escapeHtml(sub?.kleur ?? '#555')}"></span>
        <span style="flex:1;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${pat ? `${escapeHtml(pat.afkorting ?? '')} ${escapeHtml(pat.naam)}` : '<em style="color:var(--color-text-muted)">Leeg</em>'}
        </span>
        <input class="form-input" type="number" data-cel-id="${c.id}" value="${c.nummer ?? ''}"
               min="1" style="width:64px;text-align:center" />
      </div>`;
  }).join('');

  document.getElementById('modal-nummers').style.display = 'flex';
}

function sluitNummersModal() {
  document.getElementById('modal-nummers').style.display = 'none';
}

async function slaaNummersOp() {
  const cellen = canvas.getCellen();
  document.getElementById('nummers-lijst').querySelectorAll('input[data-cel-id]').forEach(inp => {
    const cel = cellen[inp.dataset.celId];
    if (cel) cel.nummer = inp.value ? Number(inp.value) : null;
  });
  canvas.setCellen(cellen);
  sluitNummersModal();
  try { await put(`/plattegrond/${editieId}/cellen`, { cellen }); } catch { /* stil */ }
  updateIndelingKaart();
}

// ── Debounced opslaan ─────────────────────────────────────────────

function debouncedOpslaan(cellen) {
  if (slaOpTimer) clearTimeout(slaOpTimer);
  slaOpTimer = setTimeout(async () => {
    try { await put(`/plattegrond/${editieId}/cellen`, { cellen }); } catch { /* stil */ }
  }, 1500);
}
