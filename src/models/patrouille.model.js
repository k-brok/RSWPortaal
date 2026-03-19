// src/models/patrouille.model.js — Patrouilles en deelnemers per editie

const db = require('../config/db');

// ── Hulpfuncties ──────────────────────────────────────────────────

function berekenLeeftijd(geboortedatum, refDatum) {
  const geb = new Date(geboortedatum);
  const ref = new Date(refDatum);
  let l = ref.getFullYear() - geb.getFullYear();
  const m = ref.getMonth() - geb.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < geb.getDate())) l--;
  return l;
}

function berekenBmStatus(deelnemers, editie) {
  if (!editie.lsw_datum) return { buiten: false, reden: null };

  const n = deelnemers.length;
  const redenen = [];

  if (n < editie.min_scouts)
    redenen.push(`Minimaal ${editie.min_scouts} scouts vereist (nu ${n})`);
  if (n > editie.max_scouts)
    redenen.push(`Maximaal ${editie.max_scouts} scouts toegestaan (nu ${n})`);

  if (n > 0) {
    const leeftijden = deelnemers.map(d => berekenLeeftijd(d.geboortedatum, editie.lsw_datum));

    if (editie.min_leeftijd) {
      const jong = leeftijden.filter(l => l < editie.min_leeftijd).length;
      if (jong) redenen.push(`${jong} deelnemer(s) te jong (min ${editie.min_leeftijd} jaar op LSW)`);
    }
    if (editie.max_leeftijd) {
      const oud = leeftijden.filter(l => l > editie.max_leeftijd).length;
      if (oud) redenen.push(`${oud} deelnemer(s) te oud (max ${editie.max_leeftijd} jaar op LSW)`);
    }

    const oudCount  = leeftijden.filter(l => l >= editie.ouderen_leeftijd).length;
    const maxOud    = n >= editie.ouderen_grens ? editie.max_ouderen_groot : editie.max_ouderen_klein;
    if (oudCount > maxOud)
      redenen.push(`Teveel scouts van ${editie.ouderen_leeftijd}+ jaar (max ${maxOud} voor patrouille van ${n})`);
  }

  return { buiten: redenen.length > 0, reden: redenen.join('; ') || null };
}

// ── Patrouilles lezen ─────────────────────────────────────────────

async function patrouillesVoorGroep(groepId, editieId) {
  const [rows] = await db.execute(`
    SELECT p.id, p.naam, p.jongste, p.buiten_mededinging, p.bm_reden,
           p.aangemaakt_op, p.bijgewerkt_op,
           COUNT(d.id) AS aantal_deelnemers
    FROM patrouilles p
    LEFT JOIN deelnemers d ON d.patrouille_id = p.id
    WHERE p.groep_id = ? AND p.editie_id = ?
    GROUP BY p.id
    ORDER BY p.naam
  `, [groepId, editieId]);
  return rows;
}

async function allePatrouilles(editieId) {
  const [rows] = await db.execute(`
    SELECT p.id, p.naam, p.jongste, p.buiten_mededinging, p.bm_reden,
           g.naam AS groep_naam_kort,
           v.afkorting,
           CONCAT(g.naam, ' (', v.afkorting, ')') AS groep_naam,
           g.id AS groep_id,
           COUNT(d.id) AS aantal_deelnemers
    FROM patrouilles p
    JOIN groepen g    ON g.id = p.groep_id
    JOIN verenigingen v ON v.id = g.vereniging_id
    LEFT JOIN deelnemers d ON d.patrouille_id = p.id
    WHERE p.editie_id = ?
    GROUP BY p.id
    ORDER BY v.naam, g.naam, p.naam
  `, [editieId]);
  return rows;
}

async function vindOpId(id) {
  const [[p]] = await db.execute(`
    SELECT p.id, p.editie_id, p.groep_id, p.naam, p.jongste,
           p.buiten_mededinging, p.bm_reden,
           CONCAT(g.naam, ' (', v.afkorting, ')') AS groep_naam
    FROM patrouilles p
    JOIN groepen g    ON g.id = p.groep_id
    JOIN verenigingen v ON v.id = g.vereniging_id
    WHERE p.id = ?
  `, [id]);
  if (!p) return null;

  const [deelnemers] = await db.execute(
    'SELECT * FROM deelnemers WHERE patrouille_id = ? ORDER BY achternaam, voornaam',
    [id]
  );
  p.deelnemers = deelnemers;
  return p;
}

// ── Patrouilles schrijven ─────────────────────────────────────────

async function aanmaken({ editie_id, groep_id, naam, jongste }) {
  const [r] = await db.execute(
    'INSERT INTO patrouilles (editie_id, groep_id, naam, jongste) VALUES (?, ?, ?, ?)',
    [editie_id, groep_id, naam.trim(), jongste ? 1 : 0]
  );
  return vindOpId(r.insertId);
}

async function bijwerken(id, { naam, jongste }) {
  const sets  = [];
  const vals  = [];
  if (naam     !== undefined) { sets.push('naam=?');    vals.push(naam.trim()); }
  if (jongste  !== undefined) { sets.push('jongste=?'); vals.push(jongste ? 1 : 0); }
  if (sets.length === 0) throw new Error('Geen velden om bij te werken');
  vals.push(id);
  await db.execute(`UPDATE patrouilles SET ${sets.join(', ')} WHERE id=?`, vals);
  return vindOpId(id);
}

async function verwijder(id) {
  const [r] = await db.execute('DELETE FROM patrouilles WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// ── Deelnemers schrijven ──────────────────────────────────────────

async function voegDeelnemerToe(patrouilleId, { voornaam, achternaam, geboortedatum }) {
  const [r] = await db.execute(
    'INSERT INTO deelnemers (patrouille_id, voornaam, achternaam, geboortedatum) VALUES (?,?,?,?)',
    [patrouilleId, voornaam.trim(), achternaam.trim(), geboortedatum]
  );
  return { id: r.insertId, patrouille_id: patrouilleId,
           voornaam: voornaam.trim(), achternaam: achternaam.trim(), geboortedatum };
}

async function bijwerkenDeelnemer(id, { voornaam, achternaam, geboortedatum }) {
  await db.execute(
    'UPDATE deelnemers SET voornaam=?, achternaam=?, geboortedatum=? WHERE id=?',
    [voornaam.trim(), achternaam.trim(), geboortedatum, id]
  );
  const [[d]] = await db.execute('SELECT * FROM deelnemers WHERE id=?', [id]);
  return d ?? null;
}

async function stelFunctieIn(id, functie) {
  const [[d]] = await db.execute('SELECT patrouille_id FROM deelnemers WHERE id=?', [id]);
  if (!d) return null;
  // Verwijder bestaande houder van dezelfde functie binnen de patrouille
  if (functie) {
    await db.execute(
      'UPDATE deelnemers SET functie=NULL WHERE patrouille_id=? AND functie=? AND id!=?',
      [d.patrouille_id, functie, id]
    );
  }
  await db.execute('UPDATE deelnemers SET functie=? WHERE id=?', [functie || null, id]);
  return d.patrouille_id;
}

async function verplaatsDeelnemer(id, nieuwPatrouilleId) {
  const [[huidig]] = await db.execute('SELECT patrouille_id FROM deelnemers WHERE id=?', [id]);
  if (!huidig) return null;
  await db.execute('UPDATE deelnemers SET patrouille_id=?, functie=NULL WHERE id=?', [nieuwPatrouilleId, id]);
  return { oudePatrouilleId: huidig.patrouille_id, nieuwePatrouilleId: nieuwPatrouilleId };
}

async function verwijderDeelnemer(id) {
  const [[d]] = await db.execute('SELECT patrouille_id FROM deelnemers WHERE id=?', [id]);
  if (!d) return null;
  await db.execute('DELETE FROM deelnemers WHERE id=?', [id]);
  return d.patrouille_id;
}

// ── BM-status herberekenen ────────────────────────────────────────

async function herbereken(patrouilleId, editie) {
  const [deelnemers] = await db.execute(
    'SELECT * FROM deelnemers WHERE patrouille_id=?', [patrouilleId]
  );
  const { buiten, reden } = berekenBmStatus(deelnemers, editie);
  await db.execute(
    'UPDATE patrouilles SET buiten_mededinging=?, bm_reden=? WHERE id=?',
    [buiten ? 1 : 0, reden, patrouilleId]
  );
  return { buiten, reden };
}

// Herbereken alle patrouilles voor een editie (na wijziging editie-instellingen)
async function hererekenEditie(editie) {
  const [patrouilles] = await db.execute(
    'SELECT id FROM patrouilles WHERE editie_id=?', [editie.id]
  );
  for (const p of patrouilles) await herbereken(p.id, editie);
}

module.exports = {
  patrouillesVoorGroep, allePatrouilles, vindOpId,
  aanmaken, bijwerken, verwijder,
  voegDeelnemerToe, bijwerkenDeelnemer, stelFunctieIn, verplaatsDeelnemer, verwijderDeelnemer,
  herbereken, hererekenEditie, berekenLeeftijd, berekenBmStatus,
};
