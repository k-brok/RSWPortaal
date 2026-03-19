// src/models/vrijwilliger.model.js — Vrijwilliger-inschrijvingen

const db = require('../config/db');

// ── Vrijwilliger zelf ─────────────────────────────────────────────

async function vindVoorGebruiker(gebruikerId, editieId) {
  const [rows] = await db.execute(
    `SELECT vi.*, e.naam AS editie_naam, e.jaar, e.datum, e.locatie,
            vv.naam AS vacature_naam
     FROM vrijwilliger_inschrijvingen vi
     JOIN edities e ON e.id = vi.editie_id
     LEFT JOIN vrijwilliger_vacatures vv ON vv.id = vi.vacature_id
     WHERE vi.gebruiker_id = ? AND vi.editie_id = ?`,
    [gebruikerId, editieId]
  );
  return rows[0] ?? null;
}

async function alleVoorGebruiker(gebruikerId) {
  const [rows] = await db.execute(
    `SELECT vi.*, e.naam AS editie_naam, e.jaar, e.datum, e.locatie
     FROM vrijwilliger_inschrijvingen vi
     JOIN edities e ON e.id = vi.editie_id
     WHERE vi.gebruiker_id = ?
     ORDER BY e.jaar DESC`,
    [gebruikerId]
  );
  return rows;
}

async function aanmelden(editieId, gebruikerId, { taakvorkeur, opmerking, vacature_id }) {
  const [result] = await db.execute(
    `INSERT INTO vrijwilliger_inschrijvingen (editie_id, gebruiker_id, taakvorkeur, vacature_id, opmerking)
     VALUES (?, ?, ?, ?, ?)`,
    [editieId, gebruikerId, taakvorkeur ?? null, vacature_id ?? null, opmerking ?? null]
  );
  return vindOpId(result.insertId);
}

async function bijwerken(id, { taakvorkeur, opmerking, vacature_id }) {
  await db.execute(
    `UPDATE vrijwilliger_inschrijvingen SET taakvorkeur = ?, vacature_id = ?, opmerking = ? WHERE id = ?`,
    [taakvorkeur ?? null, vacature_id ?? null, opmerking ?? null, id]
  );
  return vindOpId(id);
}

async function verwijder(id) {
  const [result] = await db.execute(
    'DELETE FROM vrijwilliger_inschrijvingen WHERE id = ?', [id]
  );
  return result.affectedRows > 0;
}

async function vindOpId(id) {
  const [rows] = await db.execute(
    `SELECT vi.*, e.naam AS editie_naam, e.jaar, e.datum, e.locatie,
            g.naam AS gebruiker_naam, g.email AS gebruiker_email,
            vv.naam AS vacature_naam
     FROM vrijwilliger_inschrijvingen vi
     JOIN edities e ON e.id = vi.editie_id
     JOIN gebruikers g ON g.id = vi.gebruiker_id
     LEFT JOIN vrijwilliger_vacatures vv ON vv.id = vi.vacature_id
     WHERE vi.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

// ── Organisator / admin ───────────────────────────────────────────

async function alleVoorEditie(editieId) {
  const [rows] = await db.execute(
    `SELECT vi.*, g.naam AS gebruiker_naam, g.email AS gebruiker_email,
            vv.naam AS vacature_naam
     FROM vrijwilliger_inschrijvingen vi
     JOIN gebruikers g ON g.id = vi.gebruiker_id
     LEFT JOIN vrijwilliger_vacatures vv ON vv.id = vi.vacature_id
     WHERE vi.editie_id = ?
     ORDER BY vi.status, g.naam`,
    [editieId]
  );
  return rows;
}

async function stelStatusIn(id, status) {
  const toegestaan = ['aangemeld', 'bevestigd', 'afgewezen'];
  if (!toegestaan.includes(status)) throw new Error('Ongeldige status');
  await db.execute(
    'UPDATE vrijwilliger_inschrijvingen SET status = ? WHERE id = ?',
    [status, id]
  );
  return vindOpId(id);
}

module.exports = {
  vindVoorGebruiker,
  alleVoorGebruiker,
  aanmelden,
  bijwerken,
  verwijder,
  vindOpId,
  alleVoorEditie,
  stelStatusIn,
};
