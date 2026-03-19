// src/models/vrijwilliger-vacature.model.js — Vrijwilliger-vacatures per editie

const db = require('../config/db');

// ── Publiek / leesrechten ─────────────────────────────────────────

async function alleVoorEditie(editieId) {
  const [rows] = await db.execute(
    `SELECT vv.*,
            COUNT(vi.id)                                   AS aanmeldingen,
            COALESCE(vv.max_vrijwilligers, 0)              AS max_vrijwilligers
     FROM vrijwilliger_vacatures vv
     LEFT JOIN vrijwilliger_inschrijvingen vi
            ON vi.vacature_id = vv.id
     WHERE vv.editie_id = ?
     GROUP BY vv.id
     ORDER BY vv.naam`,
    [editieId]
  );
  return rows;
}

async function vindOpId(id) {
  const [rows] = await db.execute(
    `SELECT vv.*,
            COUNT(vi.id) AS aanmeldingen
     FROM vrijwilliger_vacatures vv
     LEFT JOIN vrijwilliger_inschrijvingen vi ON vi.vacature_id = vv.id
     WHERE vv.id = ?
     GROUP BY vv.id`,
    [id]
  );
  return rows[0] ?? null;
}

// ── Beheer (admin / organisator) ──────────────────────────────────

async function aanmaken(editieId, { naam, omschrijving, max_vrijwilligers, benodigd }) {
  const [result] = await db.execute(
    `INSERT INTO vrijwilliger_vacatures (editie_id, naam, omschrijving, max_vrijwilligers, benodigd)
     VALUES (?, ?, ?, ?, ?)`,
    [editieId, naam, omschrijving ?? null, max_vrijwilligers ?? null, benodigd ?? null]
  );
  return vindOpId(result.insertId);
}

async function bijwerken(id, { naam, omschrijving, max_vrijwilligers, benodigd }) {
  await db.execute(
    `UPDATE vrijwilliger_vacatures
     SET naam = ?, omschrijving = ?, max_vrijwilligers = ?, benodigd = ?
     WHERE id = ?`,
    [naam, omschrijving ?? null, max_vrijwilligers ?? null, benodigd ?? null, id]
  );
  return vindOpId(id);
}

async function verwijder(id) {
  const [result] = await db.execute(
    'DELETE FROM vrijwilliger_vacatures WHERE id = ?', [id]
  );
  return result.affectedRows > 0;
}

module.exports = { alleVoorEditie, vindOpId, aanmaken, bijwerken, verwijder };
