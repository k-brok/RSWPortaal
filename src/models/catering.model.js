// src/models/catering.model.js — Catering aanmeldingen

const db = require('../config/db');

// ── Eigen aanvraag ophalen ─────────────────────────────────────────

async function vindVoorGebruiker(gebruikerId, editieId) {
  const [rows] = await db.execute(
    `SELECT ca.*, e.naam AS editie_naam, e.jaar,
            e.catering_prijs_leiding, e.catering_prijs_vrijwilliger
     FROM catering_aanvragen ca
     JOIN edities e ON e.id = ca.editie_id
     WHERE ca.gebruiker_id = ? AND ca.editie_id = ?`,
    [gebruikerId, editieId]
  );
  return rows[0] ?? null;
}

async function vindOpId(id) {
  const [rows] = await db.execute(
    `SELECT ca.*, e.naam AS editie_naam, e.jaar,
            g.naam AS gebruiker_naam, g.email AS gebruiker_email,
            e.catering_prijs_leiding, e.catering_prijs_vrijwilliger
     FROM catering_aanvragen ca
     JOIN edities e ON e.id = ca.editie_id
     JOIN gebruikers g ON g.id = ca.gebruiker_id
     WHERE ca.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

// ── Aanmelden / bijwerken / annuleren ─────────────────────────────

async function aanmelden(editieId, gebruikerId, rol, { aantal_personen, opmerking }) {
  const [result] = await db.execute(
    `INSERT INTO catering_aanvragen (editie_id, gebruiker_id, rol, aantal_personen, opmerking)
     VALUES (?, ?, ?, ?, ?)`,
    [editieId, gebruikerId, rol, aantal_personen, opmerking ?? null]
  );
  return vindOpId(result.insertId);
}

async function bijwerken(id, { aantal_personen, opmerking }) {
  await db.execute(
    `UPDATE catering_aanvragen SET aantal_personen = ?, opmerking = ? WHERE id = ?`,
    [aantal_personen, opmerking ?? null, id]
  );
  return vindOpId(id);
}

async function verwijder(id) {
  const [result] = await db.execute(
    'DELETE FROM catering_aanvragen WHERE id = ?', [id]
  );
  return result.affectedRows > 0;
}

// ── Organisator / admin ───────────────────────────────────────────

async function alleVoorEditie(editieId) {
  const [rows] = await db.execute(
    `SELECT ca.*, g.naam AS gebruiker_naam, g.email AS gebruiker_email,
            gr.naam AS groep_naam
     FROM catering_aanvragen ca
     JOIN gebruikers g ON g.id = ca.gebruiker_id
     LEFT JOIN groepen gr ON gr.id = g.groep_id
     WHERE ca.editie_id = ?
     ORDER BY ca.rol, g.naam`,
    [editieId]
  );
  return rows;
}

// Totaal aangemelde personen per rol (voor het overzicht)
async function totaalPerRol(editieId) {
  const [rows] = await db.execute(
    `SELECT rol,
            COUNT(*) AS aanvragen,
            SUM(aantal_personen) AS totaal_personen
     FROM catering_aanvragen
     WHERE editie_id = ?
     GROUP BY rol`,
    [editieId]
  );
  return rows;
}

// ── Catering instellingen per editie ─────────────────────────────

async function getCateringInstellingen(editieId) {
  const [rows] = await db.execute(
    `SELECT catering_actief, catering_prijs_leiding, catering_prijs_vrijwilliger
     FROM edities WHERE id = ?`,
    [editieId]
  );
  return rows[0] ?? null;
}

async function updateCateringInstellingen(editieId, { catering_actief, catering_prijs_leiding, catering_prijs_vrijwilliger }) {
  await db.execute(
    `UPDATE edities
     SET catering_actief = ?, catering_prijs_leiding = ?, catering_prijs_vrijwilliger = ?
     WHERE id = ?`,
    [catering_actief ? 1 : 0, catering_prijs_leiding ?? null, catering_prijs_vrijwilliger ?? null, editieId]
  );
  return getCateringInstellingen(editieId);
}

module.exports = {
  vindVoorGebruiker,
  vindOpId,
  aanmelden,
  bijwerken,
  verwijder,
  alleVoorEditie,
  totaalPerRol,
  getCateringInstellingen,
  updateCateringInstellingen,
};
