// src/models/vereniging.model.js — CRUD voor verenigingen en groepen

const db = require('../config/db');

// ── Verenigingen ──────────────────────────────────────────────────

async function alleVerenigingen() {
  const [rows] = await db.execute(`
    SELECT v.id, v.naam, v.afkorting, v.aangemaakt_op,
           COUNT(g.id) AS aantal_groepen
    FROM verenigingen v
    LEFT JOIN groepen g ON g.vereniging_id = v.id
    GROUP BY v.id
    ORDER BY v.naam
  `);
  return rows;
}

async function verenigingMetGroepen(id) {
  const [[ver]] = await db.execute(
    'SELECT id, naam, afkorting FROM verenigingen WHERE id = ?', [id]
  );
  if (!ver) return null;
  const [groepen] = await db.execute(
    'SELECT id, naam FROM groepen WHERE vereniging_id = ? ORDER BY naam', [id]
  );
  return { ...ver, groepen };
}

async function maakVereniging({ naam, afkorting }) {
  const [r] = await db.execute(
    'INSERT INTO verenigingen (naam, afkorting) VALUES (?, ?)',
    [naam.trim(), afkorting.trim().toUpperCase()]
  );
  return { id: r.insertId, naam: naam.trim(), afkorting: afkorting.trim().toUpperCase(), aantal_groepen: 0 };
}

async function werkVerenigingBij(id, { naam, afkorting }) {
  await db.execute(
    'UPDATE verenigingen SET naam=?, afkorting=? WHERE id=?',
    [naam.trim(), afkorting.trim().toUpperCase(), id]
  );
  return vereinigingMetGroepen(id);
}

// Veilige delete: alleen mogelijk als er geen gebruikers aan groepen gekoppeld zijn
async function verwijderVereniging(id) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS n FROM gebruikers u JOIN groepen g ON u.groep_id = g.id WHERE g.vereniging_id = ?',
    [id]
  );
  if (rows[0].n > 0) throw new Error('Vereniging heeft nog gekoppelde gebruikers via groepen');
  const [r] = await db.execute('DELETE FROM verenigingen WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// ── Groepen ───────────────────────────────────────────────────────

async function maakGroep({ naam, vereniging_id }) {
  const [r] = await db.execute(
    'INSERT INTO groepen (naam, vereniging_id) VALUES (?, ?)',
    [naam.trim(), vereniging_id]
  );
  return { id: r.insertId, naam: naam.trim(), vereniging_id };
}

async function werkGroepBij(id, { naam }) {
  await db.execute('UPDATE groepen SET naam=? WHERE id=?', [naam.trim(), id]);
  const [[row]] = await db.execute('SELECT id, naam, vereniging_id FROM groepen WHERE id=?', [id]);
  return row ?? null;
}

async function verwijderGroep(id) {
  const [check] = await db.execute(
    'SELECT COUNT(*) AS n FROM gebruikers WHERE groep_id=?', [id]
  );
  if (check[0].n > 0) throw new Error('Groep heeft nog gekoppelde gebruikers');
  const [r] = await db.execute('DELETE FROM groepen WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// Alias voor typo in werkVerenigingBij (intern gebruik)
async function vereinigingMetGroepen(id) {
  return verenigingMetGroepen(id);
}

module.exports = {
  alleVerenigingen, verenigingMetGroepen,
  maakVereniging, werkVerenigingBij, verwijderVereniging,
  maakGroep, werkGroepBij, verwijderGroep,
};
