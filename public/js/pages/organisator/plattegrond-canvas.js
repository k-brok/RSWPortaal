// public/js/pages/organisator/plattegrond-canvas.js
// Cellen worden via drag-and-drop vanuit de sidebar geplaatst.
// In bewegen-modus: klik = selecteer, sleep = verplaats, R = draai 90°.
// Scroll = zoom (gecentreerd op cursor), middelste muisknop = pan.

export class PlattegrondCanvas {
  /* ── State ─────────────────────────────────────────────────────── */
  #canvas; #ctx;
  #cellen      = {};
  #subkampen   = [];
  #patrouilles = [];
  #bgImage     = null;
  #bgOpacity   = 0.65;
  #snapG       = 20;
  #schaalMeter = null;
  #tool        = 'bewegen';
  #actieveSub  = null;
  #defW        = 40;
  #defH        = 60;
  #vergrendeld    = false;
  #indelingModus  = false;
  #indelingVast   = false;
  #scores         = {};
  #tonenScores    = false;
  #spreadDots     = {}; // celId → hue (0=rood … 120=groen)
  // zoom & pan
  #zoom  = 1;
  #panX  = 0;
  #panY  = 0;
  #panStart = null; // { x, y } — voor middelste-muis-pan
  // interactie
  #dragStart        = null; // { moveCelId, ox, oy, startX, startY }
  #indelingDrag          = null;  // { fromCelId, patId, startX, startY } — patrouille slepen tussen cellen
  #indelingDragGesleept  = false; // true zodra sleepdrempel overschreden
  #indelingDragMuis      = null;  // { sx, sy } schermcoördinaten voor floating ghost
  #preview          = null; // { x, y, w, h }
  #hover            = null;
  #geselecteerd     = null; // cel id (indelingmodus)
  #geselecteerdEdit = null; // cel id (editormodus, voor draaien)
  #pendingDrag      = null; // { subkampId, type }
  onChange = null;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx    = canvas.getContext('2d');
    canvas.addEventListener('mousedown',  e => this.#onDown(e));
    canvas.addEventListener('mousemove',  e => this.#onMove(e));
    canvas.addEventListener('mouseup',    e => this.#onUp(e));
    canvas.addEventListener('mouseleave', () => {
      this.#panStart = null; this.#dragStart = null; this.#preview = null; this.#hover = null;
      // Als er een patrouille-sleep actief was die al bewogen is, geef dit door aan de pagina
      // zodat een drop op het panel buiten de canvas afgehandeld kan worden.
      if (this.#indelingDragGesleept && this.#indelingDrag) {
        canvas.dispatchEvent(new CustomEvent('rsw:slepen-verlaat', {
          detail: { fromCelId: this.#indelingDrag.fromCelId, patId: this.#indelingDrag.patId },
          bubbles: true,
        }));
      }
      this.#indelingDrag = null; this.#indelingDragGesleept = false; this.#indelingDragMuis = null;
      this.render();
    });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.#verwijderOnder(e); });
    canvas.addEventListener('wheel',      e => this.#onWheel(e), { passive: false });
    canvas.addEventListener('dragover',   e => this.#onDragOver(e));
    canvas.addEventListener('dragleave',  () => this.#onDragLeave());
    canvas.addEventListener('drop',       e => this.#onDrop(e));
  }

  /* ── Setters ───────────────────────────────────────────────────── */
  setCanvas(b, h)   { this.#canvas.width = b; this.#canvas.height = h; this.render(); }
  setCellen(c)      { this.#cellen = typeof c === 'string' ? JSON.parse(c) : (c ?? {}); this.#herbereken(); this.render(); }
  setSubkampen(s)   { this.#subkampen = s ?? [];   this.render(); }
  setPatrouilles(p) { this.#patrouilles = p ?? []; this.#herbereken(); this.render(); }
  setVergrendeld(v) { this.#vergrendeld = v;       this.render(); }
  setSnap(g)        { this.#snapG = Math.max(5, g); this.render(); }
  setSchaal(m)      { this.#schaalMeter = m;       this.render(); }
  setOpacity(o)     { this.#bgOpacity = Math.min(1, Math.max(0.05, o)); this.render(); }
  setDefaults(w, h) { this.#defW = Math.max(this.#snapG, w); this.#defH = Math.max(this.#snapG, h); }
  setTool(t, sub)   { this.#tool = t; this.#actieveSub = sub ?? null; }
  setPendingDrag(d) { this.#pendingDrag = d; }
  setIndelingModus(vast) { this.#indelingModus = true; this.#indelingVast = vast; this.#geselecteerd = null; this.#geselecteerdEdit = null; this.render(); }
  setEditorModus()  { this.#indelingModus = false; this.#geselecteerd = null; this.render(); }
  setScores(s, toon) { this.#scores = s ?? {}; this.#tonenScores = !!toon; this.render(); }
  getCellen()       { return this.#cellen; }

  /** Verwijder de patrouille-koppeling van een cel (voor terugslepen naar het panel). */
  unassignCel(celId) {
    const cel = this.#cellen[celId];
    if (!cel) return;
    cel.patrouille_id = null;
    this.#herbereken();
    this.render();
    this.onChange?.(this.#cellen);
  }
  getTool()         { return this.#tool; }

  resetZoom()  { this.#zoom = 1; this.#panX = 0; this.#panY = 0; this.render(); }
  zoomIn()     { this.#zoomOp(this.#canvas.width / 2, this.#canvas.height / 2, 1.25); }
  zoomOut()    { this.#zoomOp(this.#canvas.width / 2, this.#canvas.height / 2, 0.8); }
  getZoomPct() { return Math.round(this.#zoom * 100); }

  /** Pas alle bestaande cellen aan naar de nieuwe afmeting.
   *  Cellen die 90° gedraaid zijn (w en h omgewisseld t.o.v. de standaard)
   *  behouden hun draairichting. */
  resizeAllCellen(newW, newH) {
    if (!Object.keys(this.#cellen).length) return;
    const standaardLandscape = newW > newH;
    for (const cel of Object.values(this.#cellen)) {
      const celLandscape = cel.w > cel.h;
      if (newW === newH || celLandscape === standaardLandscape) {
        cel.w = newW; cel.h = newH;
      } else {
        // cel is gedraaid t.o.v. standaard → swap afmetingen
        cel.w = newH; cel.h = newW;
      }
    }
    this.render();
    this.onChange?.(this.#cellen);
  }

  /** Draai geselecteerde (blauw) cel 90°. */
  rotateerGeselecteerde() {
    const id = this.#geselecteerdEdit;
    if (!id || !this.#cellen[id]) return;
    const cel = this.#cellen[id];
    [cel.w, cel.h] = [cel.h, cel.w];
    this.render();
    this.onChange?.(this.#cellen);
  }

  async setAfbeelding(base64) {
    if (!base64) { this.#bgImage = null; this.render(); return; }
    const img = new Image();
    img.src = base64;
    await img.decode().catch(() => {});
    this.#bgImage = img;
    this.render();
  }

  /* ── Render ────────────────────────────────────────────────────── */
  render() {
    const ctx = this.#ctx;
    const W = this.#canvas.width, H = this.#canvas.height;

    // Achtergrond (schermruimte)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, 0, W, H);

    // Canvasinhoud (zoom + pan)
    ctx.setTransform(this.#zoom, 0, 0, this.#zoom, this.#panX, this.#panY);

    if (this.#bgImage) {
      ctx.globalAlpha = this.#bgOpacity;
      ctx.drawImage(this.#bgImage, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    this.#drawSnapGrid(W, H);
    for (const cel of Object.values(this.#cellen)) this.#drawCel(cel);
    if (this.#preview) this.#drawPreview();

    // Schermruimte-overlays (niet meezoomen)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.#schaalMeter) this.#drawSchaalBalk(W, H);
    this.#drawZoomLabel(W, H);
    if (this.#indelingDragGesleept && this.#indelingDragMuis) {
      this.#drawGhost(this.#indelingDragMuis.sx, this.#indelingDragMuis.sy);
    }
  }

  #drawGhost(sx, sy) {
    const drag = this.#indelingDrag;
    if (!drag) return;
    const cel = this.#cellen[drag.fromCelId];
    if (!cel) return;
    const sub   = cel.subkamp_id ? this.#subkampen.find(s => s.id === cel.subkamp_id) : null;
    const kleur = sub?.kleur ?? '#2a2a4a';
    const ctx   = this.#ctx;
    const vw    = cel.w * this.#zoom;   // visuele breedte in canvas-pixels
    const vh    = cel.h * this.#zoom;   // visuele hoogte in canvas-pixels
    const gx    = sx - vw / 2;
    const gy    = sy - vh / 2;

    ctx.save();
    ctx.globalAlpha = 0.85;

    // Slagschaduw
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = 14;
    ctx.shadowOffsetY = 5;

    // Celachtergrond
    ctx.fillStyle = kleur + '88';
    ctx.fillRect(gx, gy, vw, vh);

    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Cel-inhoud via drawCelTekst in lokale coördinaten
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(this.#zoom, this.#zoom);
    this.#drawCelTekst(cel, 0, 0, cel.w, cel.h, drag.patId);
    ctx.restore();

    // Rand (highlight)
    ctx.strokeStyle = 'rgba(120,190,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(gx + 0.5, gy + 0.5, vw - 1, vh - 1);

    ctx.restore();
  }

  #drawSnapGrid(W, H) {
    const ctx = this.#ctx, g = this.#snapG;
    ctx.fillStyle = 'rgba(180,200,255,0.18)';
    for (let x = 0; x < W; x += g)
      for (let y = 0; y < H; y += g)
        ctx.fillRect(x, y, 1.5, 1.5);
  }

  #drawSchaalBalk(_, H) {
    const ctx = this.#ctx;
    const barPx = 5 * this.#snapG * this.#zoom;
    const meter  = 5 * this.#schaalMeter;
    const x = 14, y = H - 14;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y-7); ctx.lineTo(x, y); ctx.lineTo(x+barPx, y); ctx.lineTo(x+barPx, y-7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${meter} m`, x + barPx/2, y - 10);
    ctx.restore();
  }

  #drawZoomLabel(W, H) {
    const ctx = this.#ctx;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(this.#zoom * 100)}%`, W - 6, H - 6);
  }

  #drawCel(cel) {
    const ctx = this.#ctx;
    const { x, y, w, h, id } = cel;
    const isHover     = this.#hover === id;
    const isGesel     = this.#geselecteerd === id;
    const isGeselEdit = this.#geselecteerdEdit === id;
    const sub   = cel.subkamp_id ? this.#subkampen.find(s => s.id === cel.subkamp_id) : null;
    const kleur = sub?.kleur ?? '#2a2a4a';

    // Bepaal preview-patrouille voor broncel en doelcel
    const isDragBron = this.#indelingDragGesleept && this.#indelingDrag?.fromCelId === id;
    let previewPatId = cel.patrouille_id; // standaard: toon eigen patrouille

    if (isDragBron) {
      // Broncel: toon de patrouille van de huidige doelcel (swap-preview), anders eigen patrouille
      const hoverCel = this.#hover ? this.#cellen[this.#hover] : null;
      const hoverGeldig = hoverCel && hoverCel.type === 'wedstrijd' && hoverCel.id !== id &&
        (!this.#indelingVast || hoverCel.subkamp_id === cel.subkamp_id);
      previewPatId = hoverGeldig ? (hoverCel.patrouille_id ?? null) : cel.patrouille_id;
    } else if (cel.type === 'wedstrijd' && isHover) {
      if (this.#indelingDragGesleept && this.#indelingDrag && id !== this.#indelingDrag.fromCelId) {
        previewPatId = this.#indelingDrag.patId;           // doelcel: toon gesleepte patrouille
      } else if (this.#pendingDrag?.type === 'patrouille') {
        previewPatId = this.#pendingDrag.patId;            // sleep vanuit panel: toon die patrouille
      }
    }

    if (cel.type === 'onbruikbaar') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.strokeStyle = 'rgba(80,80,80,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -h; i < w+h; i += 12) { ctx.moveTo(x+i, y); ctx.lineTo(x+i+h, y+h); }
      ctx.stroke(); ctx.restore();
    } else {
      ctx.fillStyle = kleur + (cel.type === 'HQ' ? 'cc' : '88');
      ctx.fillRect(x, y, w, h);

      // Preview-tint op doelcel
      const isPreviewDoel = cel.type === 'wedstrijd' && isHover && previewPatId !== cel.patrouille_id
        && (this.#indelingDragGesleept || this.#pendingDrag?.type === 'patrouille');
      if (isPreviewDoel) {
        ctx.fillStyle = 'rgba(80,210,120,0.22)';
        ctx.fillRect(x, y, w, h);
      }

      if (this.#tonenScores && cel.patrouille_id != null) {
        const sc = Math.min(this.#scores[cel.patrouille_id] ?? 0, 100) / 100;
        ctx.fillStyle = `rgba(${Math.round(255*(1-sc))},${Math.round(200*sc)},0,0.42)`;
        ctx.fillRect(x, y, w, h);
      }

      if (cel.type === 'HQ') {
        const fs = Math.max(9, Math.min(w, h) * 0.3);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText('HQ', x+w/2, y+h/2);
      } else {
        this.#drawCelTekst(cel, x, y, w, h, previewPatId);
      }

      // Jongste-badge: gouden ster rechts-boven, alleen als toegewezen patrouille jongste is
      const previewPat = previewPatId != null ? this.#patrouilles.find(p => p.id === previewPatId) : null;
      if (previewPat?.jongste) {
        const fs = Math.max(8, Math.min(11, Math.min(w, h) * 0.22));
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,215,0,0.92)';
        ctx.fillText('\u2605', x + w - 3, y + 3);
      }
    }

    if (isGeselEdit) { ctx.fillStyle = 'rgba(100,200,255,0.18)'; ctx.fillRect(x, y, w, h); }

    // Rand: gestippeld op broncel, normaal/highlight op rest
    if (isDragBron) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
      ctx.restore();
    } else {
      ctx.strokeStyle = isGesel ? '#f5e642' : isGeselEdit ? '#64c8ff' : isHover ? '#e0e0e0' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth   = (isGesel || isGeselEdit || isHover) ? 2.5 : 1;
      ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    }
  }

  // Tekst in een wedstrijdcel: patrouille-info + nummer in hoekje
  // patIdOverride: overschrijft cel.patrouille_id voor de preview (nummer + dot blijven cel-eigendom)
  #drawCelTekst(cel, x, y, w, h, patIdOverride = undefined) {
    const ctx = this.#ctx;
    const patId = patIdOverride !== undefined ? patIdOverride : cel.patrouille_id;
    const pat   = patId != null ? this.#patrouilles.find(p => p.id === patId) : null;

    // Nummer altijd klein in linker bovenhoek
    if (cel.nummer != null) {
      const nrFs = Math.max(7, Math.min(11, Math.min(w, h) * 0.18));
      ctx.font = `bold ${nrFs}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(String(cel.nummer), x + 3, y + 3);
    }

    // Spreiding-dot rechts-onder (altijd zichtbaar als cel bezet is)
    if (this.#spreadDots[cel.id] !== undefined) {
      const dotR = Math.max(4, Math.min(7, Math.min(w, h) * 0.1));
      ctx.beginPath();
      ctx.arc(x + w - dotR - 3, y + h - dotR - 3, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${this.#spreadDots[cel.id]}, 85%, 52%)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (!pat) return;

    const minDim = Math.min(w, h);

    if (minDim < 28) {
      // Te klein voor tekst
      return;
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = x + w / 2;

    if (minDim < 48) {
      // Alleen afkorting
      const fs = Math.max(8, minDim * 0.3);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(this.#clip(ctx, pat.afkorting ?? '', w - 4), cx, y + h / 2);
      return;
    }

    // Drie regels: afkorting (groot) · groepsnaam · patrouillenaam
    const afkFs  = Math.max(9,  Math.min(minDim * 0.22, 14));
    const infoFs = Math.max(7,  Math.min(minDim * 0.17, 11));
    const totaalH = afkFs + infoFs * 2 + 6;
    const numHoogte = cel.nummer != null ? Math.max(7, Math.min(11, minDim * 0.18)) + 5 : 0;
    const beschikbaarH = h - numHoogte;
    let ty = y + numHoogte + (beschikbaarH - totaalH) / 2 + afkFs / 2;

    ctx.font = `bold ${afkFs}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.fillText(this.#clip(ctx, pat.afkorting ?? '', w - 6), cx, ty);
    ty += afkFs + 3;

    ctx.font = `${infoFs}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.fillText(this.#clip(ctx, pat.groep_naam_kort ?? '', w - 6), cx, ty);
    ty += infoFs + 3;

    ctx.fillText(this.#clip(ctx, pat.naam, w - 6), cx, ty);
  }

  // Knipt tekst af met '…' zodat het binnen maxW past
  #clip(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // Herbereken spreidingsdots op basis van actuele cellen + patrouilles (client-side)
  #herbereken() {
    const dots = {};
    const W = this.#canvas.width, H = this.#canvas.height;
    const ref = Math.min(W, H) * 0.35; // afstand = 35% van kortste kant → groen

    // patrouille_id → center {x,y}
    const posities = {};
    for (const cel of Object.values(this.#cellen)) {
      if (cel.patrouille_id != null)
        posities[cel.patrouille_id] = { x: cel.x + cel.w / 2, y: cel.y + cel.h / 2 };
    }

    // patrouille_id → groep_id
    const patGroep = {};
    for (const p of this.#patrouilles) patGroep[p.id] = p.groep_id;

    // groep_id → [{ patId, x, y }] (alleen geplaatste)
    const perGroep = {};
    for (const [patIdStr, pos] of Object.entries(posities)) {
      const gid = patGroep[Number(patIdStr)];
      if (gid != null) (perGroep[gid] ??= []).push({ patId: Number(patIdStr), ...pos });
    }

    for (const cel of Object.values(this.#cellen)) {
      if (cel.type !== 'wedstrijd' || cel.patrouille_id == null) continue;
      const gid = patGroep[cel.patrouille_id];
      if (gid == null) { dots[cel.id] = 90; continue; }

      const genoten = (perGroep[gid] ?? []).filter(g => g.patId !== cel.patrouille_id);
      if (!genoten.length) {
        dots[cel.id] = 118; // geen groepsgenoten → altijd groen
      } else {
        const pos = posities[cel.patrouille_id];
        const minDist = Math.min(...genoten.map(g =>
          Math.sqrt((pos.x - g.x) ** 2 + (pos.y - g.y) ** 2)
        ));
        dots[cel.id] = Math.round(Math.min(1, minDist / ref) * 120);
      }
    }
    this.#spreadDots = dots;
  }

  #drawPreview() {
    const ctx = this.#ctx;
    const { x, y, w, h } = this.#preview;
    const type = this.#pendingDrag?.type ?? 'wedstrijd';
    const sub  = this.#pendingDrag?.subkampId ? this.#subkampen.find(s => s.id === this.#pendingDrag.subkampId) : null;
    ctx.fillStyle  = type === 'onbruikbaar' ? 'rgba(0,0,0,0.4)' : (sub?.kleur ?? '#3498db') + '55';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = sub?.kleur ?? '#3498db';
    ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
    ctx.strokeRect(x+1, y+1, w-2, h-2);
    ctx.setLineDash([]);
  }

  /* ── Zoom & Pan ────────────────────────────────────────────────── */
  #zoomOp(mx, my, factor) {
    const newZoom = Math.min(8, Math.max(0.1, this.#zoom * factor));
    this.#panX = mx + (this.#panX - mx) * newZoom / this.#zoom;
    this.#panY = my + (this.#panY - my) * newZoom / this.#zoom;
    this.#zoom = newZoom;
    this.render();
  }

  #onWheel(e) {
    e.preventDefault();
    const r = this.#canvas.getBoundingClientRect();
    const { cx, cy } = this.#toCanvas(e.clientX - r.left, e.clientY - r.top);
    this.#zoomOp(cx, cy, e.deltaY < 0 ? 1.15 : 1/1.15);
  }

  /* ── Drag & Drop ───────────────────────────────────────────────── */
  #onDragOver(e) {
    e.preventDefault();
    const { x, y } = this.#muis(e);

    if (this.#indelingModus) {
      // Patrouille slepen: highlight wedstrijdcel onder cursor
      if (this.#pendingDrag?.type === 'patrouille') {
        const cel = this.#celOnder(x, y);
        const nieuw = (cel?.type === 'wedstrijd') ? cel.id : null;
        if (nieuw !== this.#hover) { this.#hover = nieuw; this.render(); }
      }
      return;
    }
    if (this.#vergrendeld) return;

    this.#preview = { x: this.#snap(x), y: this.#snap(y), w: this.#defW, h: this.#defH };
    this.render();
  }

  #onDragLeave() {
    this.#preview = null;
    if (this.#indelingModus) this.#hover = null;
    this.render();
  }

  #onDrop(e) {
    e.preventDefault();
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }

    // Patrouille drag-to-assign (indeling-modus)
    if (this.#indelingModus && data.type === 'patrouille') {
      const { x, y } = this.#muis(e);
      const cel = this.#celOnder(x, y);
      if (cel && cel.type === 'wedstrijd' && !cel.patrouille_id) {
        if (this.#indelingVast) {
          const huidigCel = Object.values(this.#cellen).find(c => c.patrouille_id === data.patId);
          if (huidigCel && huidigCel.subkamp_id !== cel.subkamp_id) {
            this.#pendingDrag = null; this.#hover = null; this.render(); return;
          }
        }
        for (const c of Object.values(this.#cellen)) {
          if (c.patrouille_id === data.patId) c.patrouille_id = null;
        }
        cel.patrouille_id = data.patId;
        this.#herbereken(); this.#hover = null; this.render(); this.onChange?.(this.#cellen);
      }
      this.#pendingDrag = null;
      return;
    }

    if (this.#vergrendeld || this.#indelingModus) return;

    // Editor-modus: nieuwe cel aanmaken op drop-positie
    const { x, y } = this.#muis(e);
    const id = 'cel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    this.#cellen[id] = {
      id, x: this.#snap(x), y: this.#snap(y), w: this.#defW, h: this.#defH,
      type: data.type ?? 'wedstrijd',
      subkamp_id: data.subkampId ?? null,
      patrouille_id: null, nummer: null,
    };
    this.#preview = null; this.#pendingDrag = null;
    this.render(); this.onChange?.(this.#cellen);
  }

  /* ── Muisinteractie ────────────────────────────────────────────── */
  #snap(v) { return Math.round(v / this.#snapG) * this.#snapG; }

  // Zet een CSS-pixelpositie om naar canvas-pixelruimte (compenseert voor eventuele CSS-schaling)
  #toCanvas(cssX, cssY) {
    const r = this.#canvas.getBoundingClientRect();
    return {
      cx: cssX * (this.#canvas.width  / r.width),
      cy: cssY * (this.#canvas.height / r.height),
    };
  }

  #muis(e) {
    const r  = this.#canvas.getBoundingClientRect();
    const { cx, cy } = this.#toCanvas(e.clientX - r.left, e.clientY - r.top);
    return { x: (cx - this.#panX) / this.#zoom, y: (cy - this.#panY) / this.#zoom };
  }
  #celOnder(mx, my) {
    return Object.values(this.#cellen).reverse()
      .find(c => mx >= c.x && mx < c.x+c.w && my >= c.y && my < c.y+c.h) ?? null;
  }

  #onDown(e) {
    // Middelste muisknop = pan
    if (e.button === 1) {
      e.preventDefault();
      this.#panStart = { cx: e.clientX, cy: e.clientY, px: this.#panX, py: this.#panY };
      return;
    }

    const { x, y } = this.#muis(e);
    if (this.#indelingModus) {
      const cel = this.#celOnder(x, y);
      if (cel?.patrouille_id) {
        // Begin mogelijk sleep — patrouille heeft een cel
        this.#indelingDrag = { fromCelId: cel.id, patId: cel.patrouille_id, startX: x, startY: y };
      } else {
        this.#indelingKlik(x, y);
      }
      return;
    }
    if (this.#vergrendeld) return;

    const cel = this.#celOnder(x, y);

    if (this.#tool === 'bewegen') {
      if (cel) {
        this.#dragStart = { moveCelId: cel.id, ox: x-cel.x, oy: y-cel.y, startX: x, startY: y };
      } else {
        this.#geselecteerdEdit = null; this.render();
      }
    } else if (this.#tool === 'verwijder' && cel) {
      delete this.#cellen[cel.id];
      if (this.#geselecteerdEdit === cel.id) this.#geselecteerdEdit = null;
      this.render(); this.onChange?.(this.#cellen);
    } else if (this.#tool === 'subkamp_verf' && cel && cel.type !== 'onbruikbaar') {
      cel.subkamp_id = this.#actieveSub?.id ?? null;
      this.render(); this.onChange?.(this.#cellen);
    }
  }

  #onMove(e) {
    // Pan
    if (this.#panStart) {
      const r  = this.#canvas.getBoundingClientRect();
      const sx = this.#canvas.width  / r.width;
      const sy = this.#canvas.height / r.height;
      this.#panX = this.#panStart.px + (e.clientX - this.#panStart.cx) * sx;
      this.#panY = this.#panStart.py + (e.clientY - this.#panStart.cy) * sy;
      this.render(); return;
    }

    const { x, y } = this.#muis(e);

    // Patrouille slepen tussen cellen (indeling-modus)
    if (this.#indelingDrag) {
      const r  = this.#canvas.getBoundingClientRect();
      const { cx, cy } = this.#toCanvas(e.clientX - r.left, e.clientY - r.top);
      this.#indelingDragMuis = { sx: cx, sy: cy };
      const gesleept = Math.abs(x - this.#indelingDrag.startX) > 4 / this.#zoom ||
                       Math.abs(y - this.#indelingDrag.startY) > 4 / this.#zoom;
      if (gesleept) {
        const wasGesleept = this.#indelingDragGesleept;
        this.#indelingDragGesleept = true;
        const doel = this.#celOnder(x, y);
        const nieuwHover = (doel?.type === 'wedstrijd' && doel.id !== this.#indelingDrag.fromCelId)
          ? doel.id : null;
        if (!wasGesleept || nieuwHover !== this.#hover) {
          this.#hover = nieuwHover;
        }
      }
      this.render(); // altijd hertekenen voor floating ghost
      return;
    }

    const oudHover = this.#hover;
    this.#hover = this.#celOnder(x, y)?.id ?? null;

    if (this.#dragStart?.moveCelId) {
      const cel = this.#cellen[this.#dragStart.moveCelId];
      if (cel) { cel.x = this.#snap(x - this.#dragStart.ox); cel.y = this.#snap(y - this.#dragStart.oy); }
      this.render(); return;
    }

    if (oudHover !== this.#hover) this.render();
  }

  #onUp(e) {
    if (e.button === 1) { this.#panStart = null; return; }

    const { x, y } = this.#muis(e);

    // Afronden patrouille-sleep (indeling-modus)
    if (this.#indelingDrag) {
      const gesleept = Math.abs(x - this.#indelingDrag.startX) > 4 / this.#zoom ||
                       Math.abs(y - this.#indelingDrag.startY) > 4 / this.#zoom;
      if (gesleept) {
        const doel = this.#celOnder(x, y);
        const bron = this.#cellen[this.#indelingDrag.fromCelId];
        if (doel && bron && doel.type === 'wedstrijd' && doel.id !== bron.id) {
          const subkampOk = !this.#indelingVast || bron.subkamp_id === doel.subkamp_id;
          if (subkampOk) {
            // Wissel patrouilles (nummers blijven aan cellen)
            const tmpPat = doel.patrouille_id;
            doel.patrouille_id = this.#indelingDrag.patId;
            bron.patrouille_id = tmpPat ?? null;
            this.#herbereken(); this.onChange?.(this.#cellen);
          }
        }
      } else {
        // Kleine beweging = klik → normale indeling-klik afhandeling
        this.#indelingKlik(x, y);
      }
      this.#indelingDrag        = null;
      this.#indelingDragGesleept = false;
      this.#indelingDragMuis    = null;
      this.#hover = null;
      this.render();
      return;
    }

    if (this.#dragStart?.moveCelId) {
      const moved = Math.abs(x - this.#dragStart.startX) > 3/this.#zoom || Math.abs(y - this.#dragStart.startY) > 3/this.#zoom;
      if (moved) {
        this.onChange?.(this.#cellen);
      } else {
        this.#geselecteerdEdit = this.#dragStart.moveCelId;
      }
      this.#dragStart = null; this.render();
    }
  }

  #verwijderOnder(e) {
    if (this.#vergrendeld || this.#indelingModus) return;
    const { x, y } = this.#muis(e);
    const cel = this.#celOnder(x, y);
    if (cel) {
      delete this.#cellen[cel.id];
      if (this.#geselecteerdEdit === cel.id) this.#geselecteerdEdit = null;
      this.render(); this.onChange?.(this.#cellen);
    }
  }

  #indelingKlik(x, y) {
    const cel = this.#celOnder(x, y);
    if (!cel) { this.#geselecteerd = null; this.render(); return; }

    if (this.#geselecteerd) {
      const van = this.#cellen[this.#geselecteerd];
      if (van && cel.type === 'wedstrijd' && !cel.patrouille_id && cel.id !== van.id) {
        if (this.#indelingVast && van.subkamp_id !== cel.subkamp_id) { this.#geselecteerd = null; this.render(); return; }
        // Nummer blijft aan de cel gekoppeld; alleen de patrouille verplaatst.
        cel.patrouille_id = van.patrouille_id;
        van.patrouille_id = null;
        this.#geselecteerd = null;
        this.#herbereken(); this.render(); this.onChange?.(this.#cellen);
      } else {
        this.#geselecteerd = cel.patrouille_id ? cel.id : null; this.render();
      }
    } else {
      this.#geselecteerd = cel.patrouille_id ? cel.id : null; this.render();
    }
  }
}
