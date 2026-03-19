// src/models/aanvraag.model.js — Leiding-aanvragen (groepskoppeling na zelf-registratie)

const db = require('../config/db');

// ── Lezen ─────────────────────────────────────────────────────────

async function alleInBehandeling() {
  const [rows] = await db.execute(`
    SELECT la.*,
           g.naam  AS gebruiker_naam, g.email AS gebruiker_email,
           gr.naam AS groep_naam,
           CONCAT(gr.naam, ' (', v.afkorting, ')') AS groep_label
    FROM leiding_aanvragen la
    JOIN gebruikers    g  ON g.id  = la.gebruiker_id
    JOIN groepen       gr ON gr.id = la.groep_id
    JOIN verenigingen  v  ON v.id  = gr.vereniging_id
    WHERE la.status = 'in_behandeling'
    ORDER BY la.aangemaakt_op ASC
  `);
  return rows;
}

async function alleVoorGebruiker(gebruikerId) {
  const [rows] = await db.execute(`
    SELECT la.*,
           CONCAT(gr.naam, ' (', v.afkorting, ')') AS groep_label
    FROM leiding_aanvragen la
    JOIN groepen      gr ON gr.id = la.groep_id
    JOIN verenigingen v  ON v.id  = gr.vereniging_id
    WHERE la.gebruiker_id = ?
    ORDER BY la.aangemaakt_op DESC
  `, [gebruikerId]);
  return rows;
}

async function vindOpId(id) {
  const [rows] = await db.execute(`
    SELECT la.*,
           g.naam  AS gebruiker_naam, g.email AS gebruiker_email,
           gr.naam AS groep_naam,
           CONCAT(gr.naam, ' (', v.afkorting, ')') AS groep_label
    FROM leiding_aanvragen la
    JOIN gebruikers    g  ON g.id  = la.gebruiker_id
    JOIN groepen       gr ON gr.id = la.groep_id
    JOIN verenigingen  v  ON v.id  = gr.vereniging_id
    WHERE la.id = ?
  `, [id]);
  return rows[0] ?? null;
}

// ── Aanmaken ──────────────────────────────────────────────────────

async function aanmaken(gebruikerId, groepId, opmerking = null) {
  // Per gebruiker slechts één open aanvraag
  await db.execute(
    `DELETE FROM leiding_aanvragen WHERE gebruiker_id = ? AND status = 'in_behandeling'`,
    [gebruikerId]
  );
  const [result] = await db.execute(
    `INSERT INTO leiding_aanvragen (gebruiker_id, groep_id, opmerking) VALUES (?, ?, ?)`,
    [gebruikerId, groepId, opmerking]
  );
  return vindOpId(result.insertId);
}

// ── Goedkeuren ────────────────────────────────────────────────────

async function goedkeuren(id, behandeldDoorId) {
  const aanvraag = await vindOpId(id);
  if (!aanvraag) throw new Error('Aanvraag niet gevonden');

  // Koppel gebruiker aan groep
  await db.execute(
    `UPDATE gebruikers SET groep_id = ? WHERE id = ?`,
    [aanvraag.groep_id, aanvraag.gebruiker_id]
  );

  await db.execute(
    `UPDATE leiding_aanvragen
     SET status = 'goedgekeurd', behandeld_door = ?, behandeld_op = NOW()
     WHERE id = ?`,
    [behandeldDoorId, id]
  );

  return vindOpId(id);
}

// ── Afwijzen ──────────────────────────────────────────────────────

async function afwijzen(id, behandeldDoorId, reden = null) {
  await db.execute(
    `UPDATE leiding_aanvragen
     SET status = 'afgewezen', behandeld_door = ?, behandeld_op = NOW(), reden_afwijzing = ?
     WHERE id = ?`,
    [behandeldDoorId, reden, id]
  );
  return vindOpId(id);
}

// ── Organisatoren ophalen (voor e-mail notificaties) ──────────────

async function alleOrganisatoren() {
  const [rows] = await db.execute(
    `SELECT id, naam, email FROM gebruikers
     WHERE rol IN ('admin', 'organisator') AND geverifieerd = 1`
  );
  return rows;
}

module.exports = { alleInBehandeling, alleVoorGebruiker, vindOpId, aanmaken, goedkeuren, afwijzen, alleOrganisatoren };
