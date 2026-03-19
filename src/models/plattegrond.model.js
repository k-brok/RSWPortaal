// src/models/plattegrond.model.js — CRUD voor plattegrond per editie

const db = require('../config/db');

const KOLOMMEN = `id, editie_id, breedte, hoogte, snap_grootte, def_cel_w, def_cel_h,
  schaal_meter, bg_opacity, cellen, vergrendeld, indeling_vast, gepubliceerd,
  subkamp_gepubliceerd, nummers_gepubliceerd`;

async function vindOfMaakAan(editieId) {
  const [rows] = await db.execute(
    `SELECT ${KOLOMMEN} FROM plattegronden WHERE editie_id = ?`, [editieId]
  );
  if (rows[0]) {
    const raw = rows[0].cellen;
    rows[0].cellen = raw == null ? {}
      : typeof raw === 'string' ? JSON.parse(raw)
      : raw;
    return rows[0];
  }
  const [r] = await db.execute('INSERT INTO plattegronden (editie_id) VALUES (?)', [editieId]);
  return {
    id: r.insertId, editie_id: editieId,
    breedte: 900, hoogte: 600, snap_grootte: 20, schaal_meter: null, bg_opacity: 0.65,
    cellen: {}, def_cel_w: 3, def_cel_h: 4, vergrendeld: 0, indeling_vast: 0, gepubliceerd: 0,
    subkamp_gepubliceerd: 0, nummers_gepubliceerd: 0,
  };
}

async function bijwerkenInstellingen(editieId, { breedte, hoogte, snap_grootte, def_cel_w, def_cel_h, schaal_meter, bg_opacity }) {
  await db.execute(
    `UPDATE plattegronden
     SET breedte=?, hoogte=?, snap_grootte=?, def_cel_w=?, def_cel_h=?, schaal_meter=?, bg_opacity=?
     WHERE editie_id=?`,
    [
      Math.min(Math.max(breedte ?? 900, 200), 2000),
      Math.min(Math.max(hoogte ?? 600, 200), 2000),
      Math.min(Math.max(snap_grootte ?? 20, 5), 100),
      Math.min(Math.max(def_cel_w ?? 3, 1), 50),
      Math.min(Math.max(def_cel_h ?? 4, 1), 50),
      schaal_meter ?? null,
      Math.min(Math.max(bg_opacity ?? 0.65, 0.1), 1.0),
      editieId,
    ]
  );
}

async function slaafCellenOp(editieId, cellen) {
  await db.execute(
    'UPDATE plattegronden SET cellen=? WHERE editie_id=?',
    [JSON.stringify(cellen), editieId]
  );
}

async function laadAfbeelding(plattegrondId) {
  const [rows] = await db.execute(
    'SELECT afbeelding FROM plattegrond_afbeeldingen WHERE plattegrond_id=?', [plattegrondId]
  );
  return rows[0]?.afbeelding ?? null;
}

async function slaafAfbeeldingOp(plattegrondId, base64) {
  await db.execute(
    `INSERT INTO plattegrond_afbeeldingen (plattegrond_id, afbeelding) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE afbeelding=VALUES(afbeelding)`,
    [plattegrondId, base64]
  );
}

async function verwijderAfbeelding(plattegrondId) {
  await db.execute('DELETE FROM plattegrond_afbeeldingen WHERE plattegrond_id=?', [plattegrondId]);
}

async function setVergrendeld(editieId, v)          { await db.execute('UPDATE plattegronden SET vergrendeld=?          WHERE editie_id=?', [v ? 1 : 0, editieId]); }
async function setIndelingVast(editieId, v)         { await db.execute('UPDATE plattegronden SET indeling_vast=?        WHERE editie_id=?', [v ? 1 : 0, editieId]); }
async function setGepubliceerd(editieId, v)         { await db.execute('UPDATE plattegronden SET gepubliceerd=?         WHERE editie_id=?', [v ? 1 : 0, editieId]); }
async function setSubkampGepubliceerd(editieId, v)  { await db.execute('UPDATE plattegronden SET subkamp_gepubliceerd=? WHERE editie_id=?', [v ? 1 : 0, editieId]); }
async function setNummersGepubliceerd(editieId, v)  { await db.execute('UPDATE plattegronden SET nummers_gepubliceerd=? WHERE editie_id=?', [v ? 1 : 0, editieId]); }

// Bouwt een map patrouille_id → { nummer, subkamp_id } vanuit de plattegrond-cellen
async function patrouilleNummerMap(editieId) {
  const plattegrond = await vindOfMaakAan(editieId);
  const map = {};
  Object.values(plattegrond.cellen || {}).forEach(cel => {
    if (cel.patrouille_id && cel.nummer != null) {
      map[cel.patrouille_id] = { nummer: cel.nummer, subkamp_id: cel.subkamp_id ?? null };
    }
  });
  return map;
}

module.exports = {
  vindOfMaakAan, bijwerkenInstellingen, slaafCellenOp,
  laadAfbeelding, slaafAfbeeldingOp, verwijderAfbeelding,
  setVergrendeld, setIndelingVast, setGepubliceerd,
  setSubkampGepubliceerd, setNummersGepubliceerd,
  patrouilleNummerMap,
};
