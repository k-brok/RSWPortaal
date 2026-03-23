// src/models/editie.model.js — CRUD voor edities

const db = require('../config/db');

const KOLOMMEN = `
  id, naam, jaar, datum AS startdatum, lsw_datum, locatie,
  max_groepen, voorinschrijving_start, voorinschrijving_sluit,
  inschrijving_start, inschrijving_sluit, uitslagen_gepubliceerd, actief,
  min_scouts, max_scouts, min_leeftijd, max_leeftijd,
  ouderen_leeftijd, max_ouderen_klein, max_ouderen_groot, ouderen_grens,
  bm_label, bm_max_positie,
  catering_actief, catering_prijs_leiding, catering_prijs_vrijwilliger,
  aangemaakt_op, bijgewerkt_op
`;

// ── Hulpfunctie: normaliseer DATE-only velden naar "YYYY-MM-DD" strings ──
// mysql2 geeft DATE-kolommen terug als Date-objecten (UTC midnight). Die worden
// door JSON.stringify geserialiseerd als "2026-06-14T00:00:00.000Z", wat
// stringvergelijkingen op de frontend breekt. We zetten ze om naar "YYYY-MM-DD".

const DATE_VELDEN = [
  'startdatum', 'lsw_datum',
  'voorinschrijving_start', 'voorinschrijving_sluit',
  'inschrijving_start', 'inschrijving_sluit',
];

function normaliseerEditie(rij) {
  if (!rij) return rij;
  for (const veld of DATE_VELDEN) {
    if (rij[veld] instanceof Date) {
      rij[veld] = rij[veld].toISOString().split('T')[0];
    }
  }
  return rij;
}

// ── Hulpfunctie: bepaal huidige inschrijffase op basis van datums ──

function bepaalFase(editie) {
  const vandaag = new Date().toISOString().split('T')[0];
  const d = v => v ? new Date(v).toISOString().split('T')[0] : null;

  const viStart = d(editie.voorinschrijving_start);
  const viSluit = d(editie.voorinschrijving_sluit);
  if (viStart && viStart <= vandaag && (!viSluit || viSluit >= vandaag)) {
    return 'voorinschrijving';
  }

  const iStart = d(editie.inschrijving_start);
  const iSluit = d(editie.inschrijving_sluit);
  if (iStart && iStart <= vandaag && (!iSluit || iSluit >= vandaag)) {
    return 'inschrijving';
  }

  return 'gesloten';
}

// ── Lezen ─────────────────────────────────────────────────────────

async function alle() {
  const [rows] = await db.execute(
    `SELECT ${KOLOMMEN} FROM edities ORDER BY jaar DESC, naam`
  );
  return rows.map(normaliseerEditie);
}

async function vindOpId(id) {
  const [rows] = await db.execute(
    `SELECT ${KOLOMMEN} FROM edities WHERE id = ?`, [id]
  );
  return normaliseerEditie(rows[0] ?? null);
}

async function actieveEditie() {
  const [rows] = await db.execute(
    `SELECT ${KOLOMMEN} FROM edities WHERE actief = 1 LIMIT 1`
  );
  return normaliseerEditie(rows[0] ?? null);
}

// ── Aanmaken ──────────────────────────────────────────────────────

async function aanmaken({ naam, jaar, startdatum, lsw_datum, locatie, max_groepen }) {
  const [r] = await db.execute(
    `INSERT INTO edities (naam, jaar, datum, lsw_datum, locatie, max_groepen)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [naam.trim(), jaar, startdatum || null, lsw_datum || null,
     locatie?.trim() || null, max_groepen || 36]
  );
  return vindOpId(r.insertId);
}

// ── Bijwerken (volledig) ───────────────────────────────────────────

async function bijwerken(id, data) {
  const {
    naam, jaar, startdatum, lsw_datum, locatie, max_groepen,
    voorinschrijving_start, voorinschrijving_sluit,
    inschrijving_start, inschrijving_sluit, uitslagen_gepubliceerd,
    min_scouts, max_scouts, min_leeftijd, max_leeftijd,
    ouderen_leeftijd, max_ouderen_klein, max_ouderen_groot, ouderen_grens,
    bm_label, bm_max_positie,
  } = data;

  await db.execute(`
    UPDATE edities SET
      naam=?, jaar=?, datum=?, lsw_datum=?, locatie=?, max_groepen=?,
      voorinschrijving_start=?, voorinschrijving_sluit=?,
      inschrijving_start=?, inschrijving_sluit=?, uitslagen_gepubliceerd=?,
      min_scouts=?, max_scouts=?, min_leeftijd=?, max_leeftijd=?,
      ouderen_leeftijd=?, max_ouderen_klein=?, max_ouderen_groot=?, ouderen_grens=?,
      bm_label=?, bm_max_positie=?
    WHERE id=?`,
    [naam.trim(), jaar, startdatum || null, lsw_datum || null,
     locatie?.trim() || null, max_groepen ?? 36,
     voorinschrijving_start || null, voorinschrijving_sluit || null,
     inschrijving_start || null, inschrijving_sluit || null, uitslagen_gepubliceerd ? 1 : 0,
     min_scouts ?? 5, max_scouts ?? 7, min_leeftijd || null, max_leeftijd || null,
     ouderen_leeftijd ?? 15, max_ouderen_klein ?? 1, max_ouderen_groot ?? 2, ouderen_grens ?? 6,
     bm_label?.trim() || 'Buiten mededinging', bm_max_positie ?? 2,
     id]
  );
  return vindOpId(id);
}

// ── Snel één veld bijwerken (voor toggle-knoppen) ─────────────────

const PATCH_VELDEN = ['uitslagen_gepubliceerd',
                      'voorinschrijving_start', 'voorinschrijving_sluit',
                      'inschrijving_start', 'inschrijving_sluit'];

async function patchVeld(id, veld, waarde) {
  if (!PATCH_VELDEN.includes(veld)) throw new Error(`Veld '${veld}' mag niet gepatcht worden`);
  const val = veld === 'uitslagen_gepubliceerd' ? (waarde ? 1 : 0) : (waarde || null);
  await db.execute(`UPDATE edities SET ${veld}=? WHERE id=?`, [val, id]);
  return vindOpId(id);
}

// ── Activeren (systeem-actieve editie) ───────────────────────────

async function activeer(id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE edities SET actief = 0');
    await conn.execute('UPDATE edities SET actief = 1 WHERE id = ?', [id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return vindOpId(id);
}

async function deactiveer(id) {
  await db.execute('UPDATE edities SET actief = 0 WHERE id = ?', [id]);
  return vindOpId(id);
}

// ── Verwijderen ───────────────────────────────────────────────────

async function verwijder(id) {
  const editie = await vindOpId(id);
  if (!editie) return false;
  if (editie.actief) throw new Error('Kan de actieve editie niet verwijderen');
  const [r] = await db.execute('DELETE FROM edities WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

module.exports = {
  alle, vindOpId, actieveEditie, bepaalFase,
  aanmaken, bijwerken, patchVeld, activeer, deactiveer, verwijder,
};
