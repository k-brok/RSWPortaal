// services/scorekaart-pdf.js — PDF scorekaart per patrouille (pdfmake)

import { laadPdfMake } from './pdf.js';
import { get }         from './api.js';

const ROOD       = '#e94560';
const DONKER     = '#1a1a2e';
const GRIJS      = '#6b7280';
const LICHTGRIJS = '#f3f4f6';
const WIT        = '#ffffff';

// ── Publieke exports ───────────────────────────────────────────────

export async function drukScorekaartAf(patrouilleId) {
  const data = await get(`/inschrijving/patrouilles/${patrouilleId}/scorekaart`);
  await laadPdfMake();
  const naam = (data.patrouille.naam || 'patrouille').replace(/\s+/g, '_');
  pdfMake.createPdf(bouwDoc([data])).download(`RSW_Scorekaart_${naam}.pdf`);
}

export async function drukAlleScorekaarten(patrouilleIds, onProgress) {
  await laadPdfMake();
  // Serieel ophalen zodat de server niet overbelast raakt; progress bijhouden
  const datasets = [];
  for (const id of patrouilleIds) {
    datasets.push(await get(`/inschrijving/patrouilles/${id}/scorekaart`));
    onProgress?.(datasets.length);
  }
  datasets.sort((a, b) => {
    const pA = a.patrouille.positie ?? 9999;
    const pB = b.patrouille.positie ?? 9999;
    if (pA !== pB) return pA - pB;
    return String(a.patrouille.nummer ?? '').localeCompare(String(b.patrouille.nummer ?? ''), 'nl', { numeric: true });
  });
  const editieNaam = (datasets[0]?.editie?.naam ?? 'RSW').replace(/\s+/g, '_');
  pdfMake.createPdf(bouwDoc(datasets)).download(`RSW_Scorekaarten_${editieNaam}.pdf`);
}

// ── Document opbouw ────────────────────────────────────────────────

function bouwDoc(datasets) {
  const content = [];

  datasets.forEach((data, index) => {
    const { patrouille, editie } = data;
    const secties = bouwSectie(patrouille, editie);

    // Elk kaart begint op een nieuwe pagina (behalve de eerste)
    if (index > 0) secties[0].pageBreak = 'before';
    content.push(...secties);
  });

  return {
    pageSize:    'A4',
    pageMargins: [40, 60, 40, 60],
    content,
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'RSW Portaal — Regionale Scouting Wedstrijden', fontSize: 7, color: GRIJS, margin: [40, 0, 0, 0] },
        { text: `Pagina ${currentPage} van ${pageCount}`, fontSize: 7, color: GRIJS, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 10, 0, 0],
    }),
    defaultStyle: { font: 'Roboto' },
  };
}

function bouwSectie(patrouille, editie) {
  const datum = editie.lsw_datum
    ? new Date(editie.lsw_datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : String(editie.jaar ?? '');

  const positieTekst = patrouille.positie
    ? ordinal(patrouille.positie) + ' plaats'
    : '—';

  const jongesteTekst = patrouille.jongste && patrouille.jongste_positie
    ? ordinal(patrouille.jongste_positie) + ' (jongste categorie)'
    : null;

  // ── Scores tabel ────────────────────────────────────────────────
  const catBody = [[
    kolHdr('Categorie'),
    kolHdr('Score', 'right'),
    kolHdr('Weging', 'right'),
    kolHdr('Bijdrage', 'right'),
  ]];

  (patrouille.categorieScores || []).forEach((c, i) => {
    const fill = i % 2 === 0 ? WIT : LICHTGRIJS;
    catBody.push([
      cel(c.naam, 10, fill),
      cel(c.score.toFixed(1) + '%', 10, fill, 'right'),
      cel(c.wegPct + '%', 10, fill, 'right'),
      cel((c.score * c.wegPct / 100).toFixed(1) + '%', 10, fill, 'right'),
    ]);
  });

  catBody.push([
    { text: 'Eindscore', fontSize: 10, bold: true, fillColor: '#eef2ff', margin: [4, 6, 4, 6], border: [false, true, false, false], borderColor: ['', ROOD, '', ''] },
    { text: '', fillColor: '#eef2ff', border: [false, true, false, false], borderColor: ['', ROOD, '', ''] },
    { text: '', fillColor: '#eef2ff', border: [false, true, false, false], borderColor: ['', ROOD, '', ''] },
    { text: (patrouille.eindscore ?? 0).toFixed(1) + '%', fontSize: 11, bold: true, alignment: 'right', color: ROOD, fillColor: '#eef2ff', margin: [4, 6, 4, 6], border: [false, true, false, false], borderColor: ['', ROOD, '', ''] },
  ]);

  // ── Scouts tabel ────────────────────────────────────────────────
  const scoutBody = [[kolHdr('Naam'), kolHdr('Functie', 'center')]];
  (patrouille.deelnemers || []).forEach((d, i) => {
    const fill = i % 2 === 0 ? WIT : LICHTGRIJS;
    scoutBody.push([
      cel(`${d.voornaam} ${d.achternaam}`, 10, fill),
      { text: d.functie ?? '—', fontSize: 10, alignment: 'center', bold: !!d.functie, color: d.functie ? ROOD : GRIJS, fillColor: fill, margin: [4, 4, 4, 4] },
    ]);
  });

  // ── Badges ──────────────────────────────────────────────────────
  const badges = [];
  if (patrouille.jongste) badges.push({ text: ' Jongste ', fontSize: 8, color: WIT, background: GRIJS, margin: [0, 2, 6, 0] });

  // ── Secties samenvoegen ─────────────────────────────────────────
  return [
    // Header
    {
      columns: [
        {
          stack: [
            { text: 'RSW', fontSize: 30, bold: true, color: ROOD },
            { text: `Regionale Scouting Wedstrijden · ${editie.naam}`, fontSize: 9, color: GRIJS, margin: [0, 2, 0, 0] },
          ],
        },
        {
          stack: [
            { text: datum, fontSize: 10, color: GRIJS, alignment: 'right' },
            editie.locatie ? { text: editie.locatie, fontSize: 10, color: GRIJS, alignment: 'right', margin: [0, 2, 0, 0] } : {},
          ],
          width: 200,
        },
      ],
      margin: [0, 0, 0, 12],
    },

    // Rode lijn
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: ROOD }], margin: [0, 0, 0, 14] },

    // Naam + positie
    {
      columns: [
        {
          stack: [
            { text: patrouille.naam, fontSize: 22, bold: true, color: DONKER },
            badges.length ? { columns: badges, margin: [0, 4, 0, 0] } : {},
          ],
        },
        {
          stack: [
            { text: positieTekst, fontSize: 18, bold: true, alignment: 'right', color: ROOD },
            jongesteTekst ? { text: jongesteTekst, fontSize: 8, color: GRIJS, alignment: 'right', margin: [0, 2, 0, 0] } : {},
            patrouille.buiten_mededinging ? { text: patrouille.bm_label ?? 'Buiten mededinging', fontSize: 8, color: GRIJS, alignment: 'right', italics: true, margin: [0, 2, 0, 0] } : {},
          ],
          width: 180,
        },
      ],
      margin: [0, 0, 0, 12],
    },

    // Info grid
    {
      table: {
        widths: [90, '*', 90, '*'],
        body: [
          [infoCel('Groep'), infoWaarde(patrouille.groep_naam), infoCel('Subkamp'), infoWaarde(patrouille.subkamp?.naam)],
          [infoCel('Vereniging'), infoWaarde(patrouille.vereniging_naam), infoCel('Patrouille nr.'), infoWaarde(patrouille.nummer ? `#${patrouille.nummer}` : null)],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 20],
    },

    // Categorie scores
    { text: 'Scores per categorie', fontSize: 12, bold: true, color: DONKER, margin: [0, 0, 0, 8] },
    patrouille.categorieScores?.length
      ? { table: { headerRows: 1, widths: ['*', 75, 55, 75], body: catBody }, layout: tabelLayout(), margin: [0, 0, 0, 20] }
      : { text: 'Geen scores beschikbaar', fontSize: 10, color: GRIJS, italics: true, margin: [0, 0, 0, 20] },

    // Scouts
    { text: 'Deelnemers', fontSize: 12, bold: true, color: DONKER, margin: [0, 0, 0, 8] },
    patrouille.deelnemers?.length
      ? { table: { headerRows: 1, widths: ['*', 80], body: scoutBody }, layout: tabelLayout(), margin: [0, 0, 0, 20] }
      : { text: 'Geen deelnemers geregistreerd', fontSize: 10, color: GRIJS, italics: true, margin: [0, 0, 0, 20] },

    // Toelichting
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }], margin: [0, 0, 0, 10] },
    { text: 'Toelichting scoreberekening', fontSize: 10, bold: true, color: DONKER, margin: [0, 0, 0, 4] },
    {
      text: 'De score per categorie is de gewogen gemiddelde score over alle criteria, genormaliseerd naar 0–100%. '
          + 'De eindscore is het gewogen gemiddelde van alle categorieën (wegingspercentages tellen op tot 100%). '
          + 'Patrouilles buiten mededinging nemen deel maar tellen niet mee in de officiële rangschikking.',
      fontSize: 8, color: GRIJS, lineHeight: 1.5,
    },
  ];
}

// ── Hulpfuncties ──────────────────────────────────────────────────

function ordinal(n) {
  return n === 1 ? '1ste' : n === 2 ? '2de' : n === 3 ? '3de' : `${n}de`;
}

function kolHdr(tekst, alignment = 'left') {
  return { text: tekst, fontSize: 9, bold: true, fillColor: DONKER, color: WIT, alignment, margin: [4, 5, 4, 5] };
}

function cel(tekst, fontSize = 10, fillColor = WIT, alignment = 'left') {
  return { text: tekst, fontSize, fillColor, alignment, margin: [4, 4, 4, 4] };
}

function infoCel(label) {
  return { text: label, fontSize: 9, color: GRIJS, border: [false, false, false, false], margin: [0, 2, 8, 2] };
}

function infoWaarde(waarde) {
  return { text: waarde ?? '—', fontSize: 10, bold: true, border: [false, false, false, false], margin: [0, 2, 16, 2] };
}

function tabelLayout() {
  return {
    hLineWidth:   (i, node) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
    vLineWidth:   ()        => 0,
    hLineColor:   ()        => '#e5e7eb',
    paddingLeft:  ()        => 4,
    paddingRight: ()        => 4,
  };
}
