// src/models/jury.model.js — Jury momenten, tokens en scores

const db              = require('../config/db');
const crypto          = require('crypto');
const QRCode          = require('qrcode');
const { naarMysqlDT } = require('../utils/datum');
const editieModel = require('./editie.model');
const { berekenBmStatus } = require('./patrouille.model');

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ── Scoreringstransformatie ────────────────────────────────────────
// Zet ruwe invoer om naar genormaliseerde score (0–100%).
// alleRaw = array met alle ruwe scores van alle patrouilles voor dit criterium (voor groepen-methode).

function transformeerScore(rawScore, criterium, alleRaw) {
  const methode  = criterium.scorerings_methode || 'direct';
  const config   = criterium.scorerings_config
    ? (typeof criterium.scorerings_config === 'string'
        ? JSON.parse(criterium.scorerings_config)
        : criterium.scorerings_config)
    : {};
  const maxScore    = Number(criterium.max_score) || 1;
  const minScore    = Number(criterium.min_score) || 0;
  const lagerBeter  = !!criterium.lager_is_beter;
  const raw         = Number(rawScore) || 0;

  if (methode === 'direct') {
    const pct = Math.max(0, Math.min(1, (raw - minScore) / (maxScore - minScore || 1)));
    return (lagerBeter ? 1 - pct : pct) * 100;
  }

  if (methode === 'normalisatie') {
    const invoerMin = config.invoer_min ?? minScore;
    const invoerMax = config.invoer_max ?? maxScore;
    let pct = (raw - invoerMin) / ((invoerMax - invoerMin) || 1);
    pct = Math.max(0, Math.min(1, pct));
    return (lagerBeter ? 1 - pct : pct) * 100;
  }

  if (methode === 'drempelwaarden') {
    const bereiken    = config.bereiken || [];
    const maxPunten   = bereiken.reduce((m, b) => Math.max(m, b.punten ?? 0), maxScore);
    let gevondenPunten = 0;
    for (const b of bereiken) {
      if (raw >= b.van && (b.tot == null || raw < b.tot)) {
        gevondenPunten = b.punten ?? 0;
        break;
      }
    }
    return (gevondenPunten / (maxPunten || 1)) * 100;
  }

  if (methode === 'groepen') {
    const aantalGroepen   = config.aantal_groepen || 4;
    const puntenPerGroep  = config.punten_per_groep || Array.from({ length: aantalGroepen }, (_, i) => i + 1);
    const maxPunten       = Math.max(...puntenPerGroep, maxScore);

    // Sorteer alle ruwe scores oplopend
    const gesorteerd = [...alleRaw].map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (!gesorteerd.length) return 0;

    // Bepaal rang (0-gebaseerd, laagste score = rang 0)
    const rang = gesorteerd.filter(s => s < raw).length;
    const groepGrootte = gesorteerd.length / aantalGroepen;
    let groepIndex     = Math.min(Math.floor(rang / groepGrootte), aantalGroepen - 1);

    // Bij "lager is beter": laagste score → hoogste groep (meeste punten)
    if (lagerBeter) groepIndex = aantalGroepen - 1 - groepIndex;

    const punten = puntenPerGroep[groepIndex] ?? 0;
    return (punten / (maxPunten || 1)) * 100;
  }

  // Fallback: direct
  return Math.max(0, Math.min(100, (raw / (maxScore || 1)) * 100));
}

// ── Momenten ───────────────────────────────────────────────────────

async function alleMomenten(editieId) {
  const [rows] = await db.execute(`
    SELECT jm.*, ec.naam AS categorie_naam,
           COUNT(DISTINCT jst.subkamp_id) AS subkamp_count,
           jm.rally_modus, jm.score_niveau, jm.aankomst_punten
    FROM jurymomenten jm
    LEFT JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    LEFT JOIN jury_subkamp_tokens jst ON jst.jurymoment_id = jm.id
    WHERE jm.editie_id = ?
    GROUP BY jm.id
    ORDER BY jm.start_tijd
  `, [editieId]);
  return rows;
}

async function vindMoment(momentId) {
  const [rows] = await db.execute(`
    SELECT jm.*, ec.naam AS categorie_naam, ec.editie_id
    FROM jurymomenten jm
    LEFT JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jm.id = ?
  `, [momentId]);
  return rows[0] ?? null;
}

async function momentMetTokens(momentId) {
  const moment = await vindMoment(momentId);
  if (!moment) return null;

  const [tokens] = await db.execute(`
    SELECT jst.subkamp_id, jst.token, jst.aankomst_punten, s.naam AS subkamp_naam, s.kleur
    FROM jury_subkamp_tokens jst
    JOIN subkampen s ON s.id = jst.subkamp_id
    WHERE jst.jurymoment_id = ?
    ORDER BY s.volgorde, s.naam
  `, [momentId]);

  const tokensMet = await Promise.all(tokens.map(async (t) => {
    const url = `${APP_URL()}/formulier?token=${t.token}`;
    const qr_dataurl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
    return { ...t, url, qr_dataurl };
  }));

  return { ...moment, tokens: tokensMet };
}

async function genereerTokens(momentId, subkampenArray) {
  // INSERT IGNORE zodat bestaande tokens niet worden overschreven
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const subkampId of subkampenArray) {
      const token = crypto.randomBytes(32).toString('hex');
      await conn.execute(
        `INSERT IGNORE INTO jury_subkamp_tokens (jurymoment_id, subkamp_id, token)
         VALUES (?, ?, ?)`,
        [momentId, subkampId, token]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Stel stations in voor een rally moment: upsert per station, verwijder ontbrekende (mits geen scans)
async function bijwerkenStations(momentId, stations) {
  // stations = [{ subkamp_id, aankomst_punten }]
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [huidige] = await conn.execute(
      'SELECT subkamp_id FROM jury_subkamp_tokens WHERE jurymoment_id = ?', [momentId]
    );
    const huidigeIds = new Set(huidige.map(r => r.subkamp_id));
    const nieuweIds  = new Set(stations.map(s => Number(s.subkamp_id)));

    for (const s of stations) {
      const subId = Number(s.subkamp_id);
      const pts   = Number(s.aankomst_punten) || 0;
      if (huidigeIds.has(subId)) {
        await conn.execute(
          'UPDATE jury_subkamp_tokens SET aankomst_punten=? WHERE jurymoment_id=? AND subkamp_id=?',
          [pts, momentId, subId]
        );
      } else {
        const token = crypto.randomBytes(32).toString('hex');
        await conn.execute(
          'INSERT INTO jury_subkamp_tokens (jurymoment_id, subkamp_id, token, aankomst_punten) VALUES (?,?,?,?)',
          [momentId, subId, token, pts]
        );
      }
    }

    // Verwijder stations die uit de lijst zijn gehaald (alleen als er geen scanhistorie is)
    for (const hId of huidigeIds) {
      if (!nieuweIds.has(hId)) {
        const [[{ n }]] = await conn.execute(
          'SELECT COUNT(*) AS n FROM patrouille_bezoeken WHERE jurymoment_id=? AND subkamp_id=?',
          [momentId, hId]
        );
        if (n === 0) {
          await conn.execute(
            'DELETE FROM jury_subkamp_tokens WHERE jurymoment_id=? AND subkamp_id=?',
            [momentId, hId]
          );
        }
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function aanmaken({ editie_id, categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
                          rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus,
                          max_duur_minuten }) {
  const [r] = await db.execute(
    `INSERT INTO jurymomenten
       (editie_id, categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
        rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus, max_duur_minuten)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [editie_id, categorie_id, naam || null, naarMysqlDT(start_tijd), naarMysqlDT(eind_tijd), jureer_modus || 'numeriek',
     rally_modus ? 1 : 0, score_niveau || 'criterium', aankomst_punten ?? 0,
     aankomst_punten_modus || 'geen', max_duur_minuten || null]
  );
  return vindMoment(r.insertId);
}

async function bijwerken(momentId, { categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
                                     rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus,
                                     max_duur_minuten }) {
  await db.execute(
    `UPDATE jurymomenten
     SET categorie_id=?, naam=?, start_tijd=?, eind_tijd=?, jureer_modus=?,
         rally_modus=?, score_niveau=?, aankomst_punten=?, aankomst_punten_modus=?,
         max_duur_minuten=?
     WHERE id=?`,
    [categorie_id, naam || null, naarMysqlDT(start_tijd), naarMysqlDT(eind_tijd), jureer_modus || 'numeriek',
     rally_modus ? 1 : 0, score_niveau || 'criterium', aankomst_punten ?? 0,
     aankomst_punten_modus || 'geen', max_duur_minuten || null,
     momentId]
  );
  return vindMoment(momentId);
}

async function verwijderen(momentId) {
  const [r] = await db.execute('DELETE FROM jurymomenten WHERE id=?', [momentId]);
  return r.affectedRows > 0;
}

async function setHandmatigOpen(momentId, open) {
  await db.execute('UPDATE jurymomenten SET handmatig_open=? WHERE id=?', [open ? 1 : 0, momentId]);
}

async function setGepubliceerd(momentId, v) {
  await db.execute('UPDATE jurymomenten SET gepubliceerd=? WHERE id=?', [v ? 1 : 0, momentId]);
}

function isOpen(moment) {
  if (!moment) return false;
  if (moment.handmatig_open) return true;
  const now = new Date();
  return now >= new Date(moment.start_tijd) && now <= new Date(moment.eind_tijd);
}

// ── Token validatie ────────────────────────────────────────────────

async function vindToken(token) {
  const [rows] = await db.execute(`
    SELECT jst.subkamp_id, jst.jurymoment_id, jst.aankomst_punten AS station_aankomst_punten,
           jm.categorie_id, jm.editie_id, jm.jureer_modus, jm.rally_modus, jm.score_niveau,
           jm.start_tijd, jm.eind_tijd, jm.handmatig_open, jm.naam AS moment_naam,
           s.naam AS subkamp_naam, s.kleur AS subkamp_kleur,
           ec.naam AS categorie_naam
    FROM jury_subkamp_tokens jst
    JOIN jurymomenten jm ON jm.id = jst.jurymoment_id
    JOIN subkampen s ON s.id = jst.subkamp_id
    JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jst.token = ?
  `, [token]);

  if (!rows[0]) return null;
  const rij = rows[0];

  // Categorie met details ophalen
  const catModel = require('./editie-categorie.model');
  const alleKategorieen = await catModel.categorieMetDetails(rij.editie_id);
  const categorie = alleKategorieen.find(c => c.id === rij.categorie_id) || null;

  // Plattegrond cellen ophalen voor patrouillenummers
  const [plRows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [rij.editie_id]
  );
  const cellenRaw = plRows[0]?.cellen;
  const cellen = cellenRaw
    ? (typeof cellenRaw === 'string' ? JSON.parse(cellenRaw) : cellenRaw)
    : {};

  // Bouw map patrouille_id → nummer vanuit cellen in dit subkamp
  const patrouilleNummer = {};
  Object.values(cellen).forEach(cel => {
    if (cel.subkamp_id === rij.subkamp_id && cel.patrouille_id) {
      patrouilleNummer[cel.patrouille_id] = cel.nummer ?? cel.patrouilleNummer ?? null;
    }
  });

  // Patrouilles ophalen
  const patrouilleIds = Object.keys(patrouilleNummer).map(Number);
  let patrouilles = [];
  if (patrouilleIds.length) {
    const placeholders = patrouilleIds.map(() => '?').join(',');
    const [pRows] = await db.execute(
      `SELECT id, naam FROM patrouilles WHERE id IN (${placeholders})`, patrouilleIds
    );
    patrouilles = pRows
      .map(p => ({ ...p, nummer: patrouilleNummer[p.id] }))
      .sort((a, b) => (a.nummer ?? 999) - (b.nummer ?? 999));
  }

  // Scores ophalen
  const scores = await alleScores(rij.jurymoment_id, rij.subkamp_id);

  return {
    moment: {
      id: rij.jurymoment_id, naam: rij.moment_naam,
      start_tijd: rij.start_tijd, eind_tijd: rij.eind_tijd,
      handmatig_open: rij.handmatig_open, jureer_modus: rij.jureer_modus,
    },
    subkamp: { id: rij.subkamp_id, naam: rij.subkamp_naam, kleur: rij.subkamp_kleur },
    categorie,
    patrouilles,
    scores,
  };
}

// ── Scoreformulier printdata ────────────────────────────────────────

async function formulierData(momentId, subkampId) {
  const moment = await vindMoment(momentId);
  if (!moment) return null;

  // Editie naam
  const [editieRows] = await db.execute(
    `SELECT naam, jaar FROM edities WHERE id = ?`, [moment.editie_id]
  );
  const editie = editieRows[0] ?? null;

  const [subRows] = await db.execute(
    `SELECT id, naam, kleur FROM subkampen WHERE id = ?`, [subkampId]
  );
  const subkamp = subRows[0] ?? null;
  if (!subkamp) return null;

  const catModel = require('./editie-categorie.model');
  const alleKat  = await catModel.categorieMetDetails(moment.editie_id);
  const categorie = alleKat.find(c => c.id === moment.categorie_id) || null;

  const [plRows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [moment.editie_id]
  );
  const cellenRaw = plRows[0]?.cellen;
  const cellen = cellenRaw
    ? (typeof cellenRaw === 'string' ? JSON.parse(cellenRaw) : cellenRaw)
    : {};

  const patrouilleNummer = {};
  Object.values(cellen).forEach(cel => {
    if (Number(cel.subkamp_id) === subkampId && cel.patrouille_id) {
      patrouilleNummer[cel.patrouille_id] = cel.nummer ?? cel.patrouilleNummer ?? null;
    }
  });

  const patrouilleIds = Object.keys(patrouilleNummer).map(Number);
  let patrouilles = [];
  if (patrouilleIds.length) {
    const ph = patrouilleIds.map(() => '?').join(',');
    const [pRows] = await db.execute(
      `SELECT id, jongste FROM patrouilles WHERE id IN (${ph})`, patrouilleIds
    );
    patrouilles = pRows
      .map(p => ({ id: p.id, jongste: !!p.jongste, nummer: patrouilleNummer[p.id] }))
      .sort((a, b) => (a.nummer ?? 999) - (b.nummer ?? 999));
  }

  return { moment, editie, subkamp, categorie, patrouilles };
}

// ── Scores ─────────────────────────────────────────────────────────

async function slaScoreOp(jurymomentId, subkampId, patrouilleId, criteriumId, score) {
  await db.execute(
    `INSERT INTO jury_scores (jurymoment_id, subkamp_id, patrouille_id, criterium_id, score)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), bijgewerkt_op = NOW()`,
    [jurymomentId, subkampId, patrouilleId, criteriumId, score]
  );
}

// Aankomstscore: alleen opslaan als nog geen score bestaat (INSERT IGNORE)
async function slaScoreOpIgnore(jurymomentId, subkampId, patrouilleId, criteriumId, score) {
  await db.execute(
    `INSERT IGNORE INTO jury_scores (jurymoment_id, subkamp_id, patrouille_id, criterium_id, score)
     VALUES (?, ?, ?, ?, ?)`,
    [jurymomentId, subkampId, patrouilleId, criteriumId, score]
  );
}

async function alleScores(jurymomentId, subkampId) {
  const [rows] = await db.execute(
    `SELECT patrouille_id, criterium_id, score FROM jury_scores
     WHERE jurymoment_id = ? AND subkamp_id = ?`,
    [jurymomentId, subkampId]
  );
  return rows;
}

async function alleScoresMoment(jurymomentId) {
  const [rows] = await db.execute(
    `SELECT subkamp_id, patrouille_id, criterium_id, score FROM jury_scores
     WHERE jurymoment_id = ?`,
    [jurymomentId]
  );
  return rows;
}

// ── Uitslag berekening ─────────────────────────────────────────────

async function berekenUitslagen(editieId, gepubliceerdOnly = false) {
  const catModel = require('./editie-categorie.model');

  // 1. Momenten + volledige categoriedetails
  const alleMomentenLijst = await alleMomenten(editieId);
  const momenten = gepubliceerdOnly
    ? alleMomentenLijst.filter(m => m.gepubliceerd)
    : alleMomentenLijst;
  const categorieen = await catModel.categorieMetDetails(editieId);
  const catMap    = new Map(categorieen.map(c => [c.id, c]));

  // 2. Alle scores per moment
  const scoreMap = new Map(); // `${momentId}_${patId}_${crId}` → score
  for (const m of momenten) {
    const scores = await alleScoresMoment(m.id);
    for (const s of scores) {
      scoreMap.set(`${m.id}_${s.patrouille_id}_${s.criterium_id}`, Number(s.score));
    }
  }

  // 3. Plattegrond → patrouille → { subkamp_id, nummer }
  const [plRows] = await db.execute('SELECT cellen FROM plattegronden WHERE editie_id = ?', [editieId]);
  const cellen   = plRows[0]?.cellen
    ? (typeof plRows[0].cellen === 'string' ? JSON.parse(plRows[0].cellen) : plRows[0].cellen)
    : {};

  const patInfo = {}; // patId → { subkamp_id, nummer }
  Object.values(cellen).forEach(cel => {
    if (cel.patrouille_id) {
      patInfo[cel.patrouille_id] = {
        subkamp_id: cel.subkamp_id,
        nummer: cel.nummer ?? cel.patrouilleNummer ?? null,
      };
    }
  });

  // 4. Patrouilles
  const patIds = Object.keys(patInfo).map(Number);
  if (!patIds.length) return [];
  const [patRows] = await db.execute(
    `SELECT p.id, p.naam, p.jongste, p.buiten_mededinging,
            g.naam AS groep_naam, v.naam AS vereniging_naam
     FROM patrouilles p
     LEFT JOIN groepen g ON g.id = p.groep_id
     LEFT JOIN verenigingen v ON v.id = g.vereniging_id
     WHERE p.id IN (${patIds.map(() => '?').join(',')})`,
    patIds
  );

  // 5. Subkampen
  const [subRows] = await db.execute('SELECT id, naam, kleur FROM subkampen WHERE editie_id = ?', [editieId]);
  const subMap = new Map(subRows.map(s => [s.id, s]));

  // 6. Bouw per-criterium score-arrays voor groepen-methode
  // criteriumScoreLijst[criteriumId] = [rawScore, rawScore, ...] (alle patrouilles)
  const criteriumScoreLijst = {};
  for (const [key, score] of scoreMap) {
    // key = `${momentId}_${patId}_${criteriumId}`
    const critId = Number(key.split('_')[2]);
    if (!criteriumScoreLijst[critId]) criteriumScoreLijst[critId] = [];
    criteriumScoreLijst[critId].push(score);
  }

  // 7. Bereken score per patrouille
  const resultaten = patRows.map(pat => {
    const info    = patInfo[pat.id] || {};
    const subkamp = subMap.get(info.subkamp_id) || null;

    let eindscore = 0;
    const catScores = [];

    for (const m of momenten) {
      const cat = catMap.get(m.categorie_id);
      if (!cat) continue;

      const allCriteria = (cat.subcategorieen || []).flatMap(s => s.criteria || []);
      const totalWeight = allCriteria.reduce((sum, cr) => sum + (Number(cr.wegingsfactor) || 1), 0);
      if (!totalWeight || !allCriteria.length) continue;

      let weightedSum = 0;
      for (const cr of allCriteria) {
        const raw     = scoreMap.get(`${m.id}_${pat.id}_${cr.id}`) ?? 0;
        const alleRaw = criteriumScoreLijst[cr.id] || [raw];
        const norm    = transformeerScore(raw, cr, alleRaw); // 0–100%
        weightedSum  += norm * (Number(cr.wegingsfactor) || 1);
      }

      const catScore = weightedSum / totalWeight;           // 0–100%
      const wegPct   = Number(cat.wegingspercentage) || 0;
      eindscore     += catScore * wegPct / 100;

      catScores.push({ naam: cat.naam, score: Math.round(catScore * 10) / 10, wegPct });
    }

    return {
      patrouille_id:      pat.id,
      naam:               pat.naam,
      jongste:            !!pat.jongste,
      buiten_mededinging: !!pat.buiten_mededinging,
      groep_naam:         pat.groep_naam || null,
      vereniging_naam:    pat.vereniging_naam || null,
      nummer:             info.nummer,
      subkamp:            subkamp ? { naam: subkamp.naam, kleur: subkamp.kleur } : null,
      eindscore:          Math.round(eindscore * 10) / 10,
      categorieScores:    catScores,
    };
  });

  // BM-status opnieuw berekenen op basis van actuele deelnemers + editie-regels
  // (de opgeslagen buiten_mededinging-waarde kan verouderd zijn)
  const editie = await editieModel.vindOpId(editieId);
  if (editie && patIds.length) {
    const [deelnemerRows] = await db.execute(
      `SELECT patrouille_id, geboortedatum FROM deelnemers WHERE patrouille_id IN (${patIds.map(() => '?').join(',')})`,
      patIds
    );
    const dByPat = {};
    for (const d of deelnemerRows) {
      if (!dByPat[d.patrouille_id]) dByPat[d.patrouille_id] = [];
      dByPat[d.patrouille_id].push(d);
    }
    for (const r of resultaten) {
      const { buiten } = berekenBmStatus(dByPat[r.patrouille_id] || [], editie);
      r.buiten_mededinging = buiten;
    }
  }

  // Sorteren op score desc (iedereen samen)
  resultaten.sort((a, b) => b.eindscore - a.eindscore);

  // Posities 1 en 2 zijn voorbehouden aan de twee hoogst scorende niet-BM, niet-jongste patrouilles (LSW-plaatsen).
  // Alle overigen (BM + jongste + niet-BM vanaf #3) krijgen posities 3, 4, 5… op score-volgorde.
  const lswKandidaten = resultaten.filter(r => !r.buiten_mededinging && !r.jongste).slice(0, 2);
  const lswIds = new Set(lswKandidaten.map(r => r.patrouille_id));
  lswKandidaten.forEach((r, i) => { r.positie = i + 1; });

  const overigen = resultaten.filter(r => !lswIds.has(r.patrouille_id));
  let volgPos = 3;
  overigen.forEach((r, i) => {
    if (i > 0 && r.eindscore !== overigen[i - 1].eindscore) volgPos = i + 3;
    r.positie = volgPos;
  });

  // Aparte jongste ranking
  const jongste = resultaten.filter(r => r.jongste).map((r, i, arr) => {
    let jPos = 1;
    if (i > 0 && r.eindscore !== arr[i - 1].eindscore) jPos = i + 1;
    else if (i > 0) jPos = arr[i - 1].jongste_positie;
    r.jongste_positie = jPos;
    return r;
  });
  // Fix jongste positions
  let jPos = 1;
  jongste.forEach((r, i) => {
    if (i > 0 && r.eindscore !== jongste[i - 1].eindscore) jPos = i + 1;
    r.jongste_positie = jPos;
  });

  const gebruikteCatIds = new Set(momenten.map(m => m.categorie_id));
  const zichtbareCategorieen = categorieen
    .filter(c => gebruikteCatIds.has(c.id))
    .map(c => ({ id: c.id, naam: c.naam, wegingspercentage: c.wegingspercentage }));

  return { resultaten, categorieen: zichtbareCategorieen };
}

module.exports = {
  alleMomenten, vindMoment, momentMetTokens, genereerTokens, bijwerkenStations,
  aanmaken, bijwerken, verwijderen,
  setHandmatigOpen, setGepubliceerd, isOpen,
  vindToken, formulierData, slaScoreOp, slaScoreOpIgnore, alleScores, alleScoresMoment,
  berekenUitslagen,
};
