// src/models/gebruiker.model.js — DB-queries voor gebruikers (raw SQL)

const db = require('../config/db');

// ── Lezen ─────────────────────────────────────────────────────────

async function alles() {
  const [rows] = await db.execute(`
    SELECT g.id, g.naam, g.email, g.rol, g.groep_id, gr.naam AS groep, g.geverifieerd,
           g.aangemaakt_op
    FROM gebruikers g
    LEFT JOIN groepen gr ON g.groep_id = gr.id
    ORDER BY g.naam
  `);
  return rows;
}

async function vindOpId(id) {
  const [rows] = await db.execute(`
    SELECT g.id, g.naam, g.email, g.rol, g.groep_id, gr.naam AS groep, g.geverifieerd
    FROM gebruikers g
    LEFT JOIN groepen gr ON g.groep_id = gr.id
    WHERE g.id = ?
  `, [id]);
  return rows[0] ?? null;
}

async function vindOpEmail(email) {
  const [rows] = await db.execute(`
    SELECT g.id, g.naam, g.email, g.wachtwoord_hash, g.rol, g.groep_id,
           gr.naam AS groep, g.geverifieerd
    FROM gebruikers g
    LEFT JOIN groepen gr ON g.groep_id = gr.id
    WHERE g.email = ?
  `, [email]);
  return rows[0] ?? null;
}

// ── Aanmaken ──────────────────────────────────────────────────────

async function aanmaken({ naam, email, wachtwoord_hash, rol, groep_id = null }) {
  const [result] = await db.execute(
    `INSERT INTO gebruikers (naam, email, wachtwoord_hash, rol, groep_id)
     VALUES (?, ?, ?, ?, ?)`,
    [naam, email, wachtwoord_hash, rol, groep_id]
  );
  return vindOpId(result.insertId);
}

// ── Bijwerken ─────────────────────────────────────────────────────

async function bijwerken(id, { naam, email, rol, groep_id, geverifieerd }) {
  await db.execute(
    `UPDATE gebruikers
     SET naam=?, email=?, rol=?, groep_id=?, geverifieerd=?
     WHERE id=?`,
    [naam, email, rol, groep_id ?? null, geverifieerd ? 1 : 0, id]
  );
  return vindOpId(id);
}

async function wachtwoordBijwerken(id, wachtwoord_hash) {
  await db.execute('UPDATE gebruikers SET wachtwoord_hash=? WHERE id=?', [wachtwoord_hash, id]);
}

async function verificatieTokenZetten(id, token) {
  await db.execute('UPDATE gebruikers SET verificatie_token=? WHERE id=?', [token, id]);
}

async function verifieeren(token) {
  const [rows] = await db.execute(
    'SELECT id FROM gebruikers WHERE verificatie_token=? AND geverifieerd=0', [token]
  );
  if (!rows[0]) return false;
  await db.execute(
    'UPDATE gebruikers SET geverifieerd=1, verificatie_token=NULL WHERE id=?', [rows[0].id]
  );
  return true;
}

// ── Verwijderen ───────────────────────────────────────────────────

async function verwijderen(id) {
  const [result] = await db.execute('DELETE FROM gebruikers WHERE id=?', [id]);
  return result.affectedRows > 0;
}

// ── Reset token ───────────────────────────────────────────────────

async function resetTokenZetten(id, token, verloopt) {
  await db.execute(
    'UPDATE gebruikers SET reset_token=?, reset_token_verloopt=? WHERE id=?',
    [token, verloopt, id]
  );
}

async function vindOpResetToken(token) {
  const [rows] = await db.execute(
    'SELECT id, naam, email FROM gebruikers WHERE reset_token=? AND reset_token_verloopt > NOW()',
    [token]
  );
  return rows[0] ?? null;
}

async function resetTokenWissen(id) {
  await db.execute('UPDATE gebruikers SET reset_token=NULL, reset_token_verloopt=NULL WHERE id=?', [id]);
}

// ── E-mail wijziging ──────────────────────────────────────────────

async function emailWijzigTokenZetten(id, token, nieuwEmail, verloopt) {
  await db.execute(
    'UPDATE gebruikers SET email_wijzig_token=?, email_wijzig_nieuw=?, email_wijzig_verloopt=? WHERE id=?',
    [token, nieuwEmail, verloopt, id]
  );
}

async function vindOpEmailWijzigToken(token) {
  const [rows] = await db.execute(
    'SELECT id, naam, email_wijzig_nieuw AS nieuw_email FROM gebruikers WHERE email_wijzig_token=? AND email_wijzig_verloopt > NOW()',
    [token]
  );
  return rows[0] ?? null;
}

async function bevestigEmailWijziging(id, nieuwEmail) {
  await db.execute(
    'UPDATE gebruikers SET email=?, email_wijzig_token=NULL, email_wijzig_nieuw=NULL, email_wijzig_verloopt=NULL WHERE id=?',
    [nieuwEmail, id]
  );
}

// ── Groepen (voor dropdowns) ──────────────────────────────────────

async function alleGroepen() {
  const [rows] = await db.execute(
    'SELECT id, naam FROM groepen ORDER BY naam'
  );
  return rows;
}

module.exports = {
  alles, vindOpId, vindOpEmail, aanmaken, bijwerken,
  wachtwoordBijwerken, verificatieTokenZetten, verifieeren,
  resetTokenZetten, vindOpResetToken, resetTokenWissen,
  emailWijzigTokenZetten, vindOpEmailWijzigToken, bevestigEmailWijziging,
  verwijderen, alleGroepen,
};
