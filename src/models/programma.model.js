// src/models/programma.model.js — Programma-items en programma-overzicht

const db = require('../config/db');

async function alleItems(editieId) {
  const [rows] = await db.execute(
    'SELECT * FROM programma_items WHERE editie_id = ? ORDER BY start_tijd',
    [editieId]
  );
  return rows;
}

async function vindItem(id) {
  const [rows] = await db.execute('SELECT * FROM programma_items WHERE id = ?', [id]);
  return rows[0] ?? null;
}

async function aanmaken({ editie_id, naam, omschrijving, start_tijd, eind_tijd }) {
  const [r] = await db.execute(
    'INSERT INTO programma_items (editie_id, naam, omschrijving, start_tijd, eind_tijd) VALUES (?, ?, ?, ?, ?)',
    [editie_id, naam, omschrijving || null, start_tijd, eind_tijd || null]
  );
  return vindItem(r.insertId);
}

async function bijwerken(id, { naam, omschrijving, start_tijd, eind_tijd }) {
  await db.execute(
    'UPDATE programma_items SET naam=?, omschrijving=?, start_tijd=?, eind_tijd=? WHERE id=?',
    [naam, omschrijving || null, start_tijd, eind_tijd || null, id]
  );
  return vindItem(id);
}

async function verwijderen(id) {
  const [r] = await db.execute('DELETE FROM programma_items WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

async function setInProgramma(momentId, v) {
  await db.execute('UPDATE jurymomenten SET in_programma=? WHERE id=?', [v ? 1 : 0, momentId]);
}

// Zet een DATE-waarde om naar een datetime-string voor sortering
function datumNaarDT(d) {
  if (!d) return null;
  const s = typeof d === 'string' ? d : d.toISOString().split('T')[0];
  return s.length === 10 ? `${s} 00:00:00` : s;
}

// Gecombineerde publieke programma-view: custom items + zichtbare jurymomenten + inschrijvingsfasen
async function publiekProgramma(editieId) {
  const [editieRows] = await db.execute(`
    SELECT datum AS startdatum,
           voorinschrijving_start, voorinschrijving_sluit,
           inschrijving_start, inschrijving_sluit
    FROM edities WHERE id = ?
  `, [editieId]);
  const e = editieRows[0] || {};

  const [custom] = await db.execute(
    'SELECT id, naam, omschrijving, start_tijd, eind_tijd FROM programma_items WHERE editie_id = ?',
    [editieId]
  );

  const [momenten] = await db.execute(`
    SELECT jm.id, COALESCE(jm.naam, ec.naam) AS naam, NULL AS omschrijving,
           jm.start_tijd, jm.eind_tijd
    FROM jurymomenten jm
    LEFT JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jm.editie_id = ? AND jm.in_programma = 1
  `, [editieId]);

  // Automatische items vanuit inschrijvingsfasen editie (2 gecombineerde items)
  const inschrijvingItems = [];
  if (e.voorinschrijving_start || e.voorinschrijving_sluit) {
    inschrijvingItems.push({
      type: 'inschrijving', datum_alleen: true, naam: 'Voorinschrijving', omschrijving: null,
      start_tijd: datumNaarDT(e.voorinschrijving_start || e.voorinschrijving_sluit),
      eind_tijd:  e.voorinschrijving_sluit ? datumNaarDT(e.voorinschrijving_sluit) : null,
    });
  }
  if (e.inschrijving_start || e.inschrijving_sluit) {
    inschrijvingItems.push({
      type: 'inschrijving', datum_alleen: true, naam: 'Inschrijving', omschrijving: null,
      start_tijd: datumNaarDT(e.inschrijving_start || e.inschrijving_sluit),
      eind_tijd:  e.inschrijving_sluit ? datumNaarDT(e.inschrijving_sluit) : null,
    });
  }

  const items = [
    ...custom.map(c   => ({ type: 'custom',     ...c })),
    ...momenten.map(m => ({ type: 'jurymoment', ...m })),
    ...inschrijvingItems,
  ];

  items.sort((a, b) => new Date(a.start_tijd) - new Date(b.start_tijd));
  return items;
}

// Kopieer programma-items van bronEditie naar doelEditie, datums verschoven op basis van eventdatum
async function kopieerVanEditie(bronId, doelId) {
  const [[bron], [doel]] = await Promise.all([
    db.execute('SELECT datum FROM edities WHERE id = ?', [bronId]),
    db.execute('SELECT datum FROM edities WHERE id = ?', [doelId]),
  ]);

  const bronDatum = bron[0]?.datum;
  const doelDatum = doel[0]?.datum;
  if (!bronDatum) throw new Error('Broneditie heeft geen startdatum');
  if (!doelDatum) throw new Error('Doeleditie heeft geen startdatum');

  const offsetMs = new Date(doelDatum) - new Date(bronDatum);

  const [bronItems] = await db.execute(
    'SELECT naam, omschrijving, start_tijd, eind_tijd FROM programma_items WHERE editie_id = ?',
    [bronId]
  );
  if (!bronItems.length) return 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of bronItems) {
      const nieuweStart = new Date(new Date(item.start_tijd).getTime() + offsetMs);
      const nieuweEind  = item.eind_tijd
        ? new Date(new Date(item.eind_tijd).getTime() + offsetMs)
        : null;
      await conn.execute(
        'INSERT INTO programma_items (editie_id, naam, omschrijving, start_tijd, eind_tijd) VALUES (?, ?, ?, ?, ?)',
        [doelId, item.naam, item.omschrijving, nieuweStart, nieuweEind]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return bronItems.length;
}

module.exports = {
  alleItems, vindItem, aanmaken, bijwerken, verwijderen,
  setInProgramma, publiekProgramma, kopieerVanEditie,
};
