// src/models/subkamp.model.js — CRUD voor subkampen per editie

const db = require('../config/db');

const KOLOMMEN = `
  s.id, s.editie_id, s.naam, s.kleur, s.omschrijving, s.volgorde, s.is_jongste,
  s.groep_id,       CONCAT(g.naam, ' (', vg.afkorting, ')') AS groep_naam,
  s.vereniging_id,  v.naam  AS vereniging_naam,
  s.aangemaakt_op,  s.bijgewerkt_op
`;

async function alleSubkampen(editieId) {
  const [rows] = await db.execute(`
    SELECT ${KOLOMMEN}
    FROM subkampen s
    LEFT JOIN groepen     g  ON g.id  = s.groep_id
    LEFT JOIN verenigingen vg ON vg.id = g.vereniging_id
    LEFT JOIN verenigingen v  ON v.id  = s.vereniging_id
    WHERE s.editie_id = ?
    ORDER BY s.volgorde, s.naam
  `, [editieId]);
  return rows;
}

async function vindOpId(id) {
  const [rows] = await db.execute(`
    SELECT ${KOLOMMEN}
    FROM subkampen s
    LEFT JOIN groepen     g  ON g.id  = s.groep_id
    LEFT JOIN verenigingen vg ON vg.id = g.vereniging_id
    LEFT JOIN verenigingen v  ON v.id  = s.vereniging_id
    WHERE s.id = ?
  `, [id]);
  return rows[0] ?? null;
}

async function aanmaken({ editie_id, naam, kleur, omschrijving, groep_id, vereniging_id }) {
  // Volgorde = na laatste subkamp in deze editie
  const [[{ max_vol }]] = await db.execute(
    'SELECT COALESCE(MAX(volgorde), 0) AS max_vol FROM subkampen WHERE editie_id = ?', [editie_id]
  );
  const [r] = await db.execute(
    `INSERT INTO subkampen (editie_id, naam, kleur, omschrijving, groep_id, vereniging_id, volgorde)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [editie_id, naam.trim(), kleur || '#3498db', omschrijving?.trim() || null,
     groep_id || null, vereniging_id || null, max_vol + 1]
  );
  return vindOpId(r.insertId);
}

async function bijwerken(id, { naam, kleur, omschrijving, groep_id, vereniging_id }) {
  await db.execute(
    `UPDATE subkampen SET naam=?, kleur=?, omschrijving=?, groep_id=?, vereniging_id=? WHERE id=?`,
    [naam.trim(), kleur || '#3498db', omschrijving?.trim() || null,
     groep_id || null, vereniging_id || null, id]
  );
  return vindOpId(id);
}

async function bijwerkenVolgorde(items) {
  // items = [{ id, volgorde }, ...]
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const { id, volgorde } of items) {
      await conn.execute('UPDATE subkampen SET volgorde=? WHERE id=?', [volgorde, id]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function verwijderen(id) {
  const [r] = await db.execute('DELETE FROM subkampen WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// Stel één subkamp in als jongste (of wis de aanduiding als subkampId null is).
// Er kan per editie maar één jongste subkamp zijn.
async function setJongste(editieId, subkampId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE subkampen SET is_jongste=0 WHERE editie_id=?', [editieId]);
    if (subkampId) {
      await conn.execute('UPDATE subkampen SET is_jongste=1 WHERE id=? AND editie_id=?', [subkampId, editieId]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { alleSubkampen, vindOpId, aanmaken, bijwerken, bijwerkenVolgorde, verwijderen, setJongste };
