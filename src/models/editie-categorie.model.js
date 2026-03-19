// src/models/editie-categorie.model.js — Per-editie categorieën, subcategorieën en criteria

const db = require('../config/db');

// ── Lees operaties ─────────────────────────────────────────────────

async function alleCategorieen(editieId) {
  const [rows] = await db.execute(`
    SELECT ec.id, ec.editie_id, ec.naam, ec.omschrijving,
           ec.wegingspercentage, ec.volgorde,
           COUNT(DISTINCT es.id) AS subcategorie_count,
           COUNT(DISTINCT ecr.id) AS criterium_count,
           EXISTS (
             SELECT 1 FROM jurymomenten jm
             JOIN editie_subcategorieen es2 ON es2.categorie_id = ec.id
             JOIN editie_criteria ecr2 ON ecr2.subcategorie_id = es2.id
             JOIN jury_scores js ON js.criterium_id = ecr2.id AND js.jurymoment_id = jm.id
             WHERE jm.categorie_id = ec.id
             LIMIT 1
           ) AS jurering_gestart
    FROM editie_categorieen ec
    LEFT JOIN editie_subcategorieen es ON es.categorie_id = ec.id
    LEFT JOIN editie_criteria ecr ON ecr.subcategorie_id = es.id
    WHERE ec.editie_id = ?
    GROUP BY ec.id
    ORDER BY ec.volgorde, ec.naam
  `, [editieId]);
  return rows.map(r => ({ ...r, jurering_gestart: !!r.jurering_gestart }));
}

// Eén categorie met volledige geneste structuur (voor jury formulier)
async function categorieMetDetails(editieId) {
  const [cats] = await db.execute(
    `SELECT * FROM editie_categorieen WHERE editie_id = ? ORDER BY volgorde, naam`,
    [editieId]
  );
  if (!cats.length) return [];

  const catIds = cats.map(c => c.id);
  const ph = catIds.map(() => '?').join(',');

  const [subs] = await db.execute(
    `SELECT * FROM editie_subcategorieen WHERE categorie_id IN (${ph}) ORDER BY volgorde, naam`,
    catIds
  );
  const subIds = subs.map(s => s.id);

  let criteria = [];
  if (subIds.length) {
    const subPh = subIds.map(() => '?').join(',');
    const [crit] = await db.execute(
      `SELECT * FROM editie_criteria WHERE subcategorie_id IN (${subPh}) ORDER BY volgorde, naam`,
      subIds
    );
    criteria = crit;
  }

  const critBySubId = {};
  criteria.forEach(c => {
    if (!critBySubId[c.subcategorie_id]) critBySubId[c.subcategorie_id] = [];
    critBySubId[c.subcategorie_id].push(c);
  });

  const subByCatId = {};
  subs.forEach(s => {
    if (!subByCatId[s.categorie_id]) subByCatId[s.categorie_id] = [];
    subByCatId[s.categorie_id].push({ ...s, criteria: critBySubId[s.id] || [] });
  });

  return cats.map(c => ({ ...c, subcategorieen: subByCatId[c.id] || [] }));
}

// ── Jurering-lock check ────────────────────────────────────────────

async function heeftJureringsScores(categorieId) {
  const [[{ n }]] = await db.execute(`
    SELECT COUNT(*) AS n FROM jury_scores js
    JOIN jurymomenten jm ON jm.id = js.jurymoment_id
    WHERE jm.categorie_id = ?
  `, [categorieId]);
  return n > 0;
}

async function subcategorieHeeftScores(subcategorieId) {
  const [[{ n }]] = await db.execute(`
    SELECT COUNT(*) AS n FROM jury_scores js
    JOIN editie_criteria ec ON ec.id = js.criterium_id
    WHERE ec.subcategorie_id = ?
  `, [subcategorieId]);
  return n > 0;
}

async function criteriumHeeftScores(criteriumId) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM jury_scores WHERE criterium_id = ?`,
    [criteriumId]
  );
  return n > 0;
}

// ── Categorie CRUD ─────────────────────────────────────────────────

async function categorieAanmaken({ editie_id, naam, omschrijving, wegingspercentage, volgorde }) {
  const [r] = await db.execute(
    `INSERT INTO editie_categorieen (editie_id, naam, omschrijving, wegingspercentage, volgorde)
     VALUES (?, ?, ?, ?, ?)`,
    [editie_id, naam.trim(), omschrijving || null, wegingspercentage || 0, volgorde || 0]
  );
  return { id: r.insertId };
}

async function categorieBijwerken(id, { naam, omschrijving, volgorde }) {
  // wegingspercentage apart via bijwerkenWegingen — hier alleen tekst en volgorde
  await db.execute(
    `UPDATE editie_categorieen SET naam=?, omschrijving=?, volgorde=? WHERE id=?`,
    [naam.trim(), omschrijving || null, volgorde || 0, id]
  );
}

async function categorieVerwijderen(id) {
  if (await heeftJureringsScores(id)) {
    throw Object.assign(new Error('Categorie kan niet worden verwijderd: er zijn al jureringsscores ingevoerd.'), { status: 409 });
  }
  const [r] = await db.execute('DELETE FROM editie_categorieen WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// Batch-update wegingspercentages; totaal mag niet > 100%
async function bijwerkenWegingen(items) {
  // items = [{ id, wegingspercentage }, ...]
  const totaal = items.reduce((s, i) => s + Number(i.wegingspercentage), 0);
  if (totaal > 100.001) {
    throw Object.assign(new Error(`Totaal wegingspercentage (${totaal.toFixed(1)}%) overschrijdt 100%.`), { status: 400 });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const { id, wegingspercentage } of items) {
      await conn.execute(
        `UPDATE editie_categorieen SET wegingspercentage=? WHERE id=?`,
        [Number(wegingspercentage), id]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Subcategorie CRUD ──────────────────────────────────────────────

async function subcategorieAanmaken({ categorie_id, naam, volgorde }) {
  const [r] = await db.execute(
    `INSERT INTO editie_subcategorieen (categorie_id, naam, volgorde) VALUES (?, ?, ?)`,
    [categorie_id, naam.trim(), volgorde || 0]
  );
  return { id: r.insertId };
}

async function subcategorieBijwerken(id, { naam, volgorde }) {
  await db.execute(
    `UPDATE editie_subcategorieen SET naam=?, volgorde=? WHERE id=?`,
    [naam.trim(), volgorde || 0, id]
  );
}

async function subcategorieVerwijderen(id) {
  if (await subcategorieHeeftScores(id)) {
    throw Object.assign(new Error('Subcategorie kan niet worden verwijderd: er zijn al scores ingevoerd.'), { status: 409 });
  }
  const [r] = await db.execute('DELETE FROM editie_subcategorieen WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// ── Criterium CRUD ─────────────────────────────────────────────────

async function criteriumAanmaken({ subcategorie_id, naam, omschrijving, invoer_type, max_score, min_score,
                                    lager_is_beter, scorerings_methode, scorerings_config, volgorde }) {
  const config = scorerings_config != null
    ? JSON.stringify(scorerings_config) : null;
  const [r] = await db.execute(
    `INSERT INTO editie_criteria
       (subcategorie_id, naam, omschrijving, invoer_type, max_score, min_score,
        lager_is_beter, scorerings_methode, scorerings_config, volgorde)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [subcategorie_id, naam.trim(), omschrijving || null,
     invoer_type || 'getal', max_score ?? 10, min_score ?? 0,
     lager_is_beter ? 1 : 0, scorerings_methode || 'direct', config, volgorde || 0]
  );
  return { id: r.insertId };
}

async function criteriumBijwerken(id, { naam, omschrijving, invoer_type, max_score, min_score,
                                        lager_is_beter, scorerings_methode, scorerings_config, volgorde }) {
  const config = scorerings_config != null
    ? JSON.stringify(scorerings_config) : null;
  await db.execute(
    `UPDATE editie_criteria
     SET naam=?, omschrijving=?, invoer_type=?, max_score=?, min_score=?,
         lager_is_beter=?, scorerings_methode=?, scorerings_config=?, volgorde=?
     WHERE id=?`,
    [naam.trim(), omschrijving || null,
     invoer_type || 'getal', max_score ?? 10, min_score ?? 0,
     lager_is_beter ? 1 : 0, scorerings_methode || 'direct', config, volgorde || 0, id]
  );
}

async function criteriumVerwijderen(id) {
  if (await criteriumHeeftScores(id)) {
    throw Object.assign(new Error('Criterium kan niet worden verwijderd: er zijn al scores ingevoerd.'), { status: 409 });
  }
  const [r] = await db.execute('DELETE FROM editie_criteria WHERE id=?', [id]);
  return r.affectedRows > 0;
}

// ── Kopiëren van vorige editie ─────────────────────────────────────

async function importeerVanEditie(bronEditieId, doelEditieId) {
  const [[{ n }]] = await db.execute(
    'SELECT COUNT(*) AS n FROM editie_categorieen WHERE editie_id = ?', [doelEditieId]
  );
  if (n > 0) return { overgeslagen: true, reden: 'Doeleditie heeft al categorieën.' };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [cats] = await conn.execute(
      `SELECT * FROM editie_categorieen WHERE editie_id = ? ORDER BY volgorde, naam`,
      [bronEditieId]
    );

    for (const cat of cats) {
      const [rc] = await conn.execute(
        `INSERT INTO editie_categorieen (editie_id, naam, omschrijving, wegingspercentage, volgorde)
         VALUES (?, ?, ?, ?, ?)`,
        [doelEditieId, cat.naam, cat.omschrijving, cat.wegingspercentage, cat.volgorde]
      );
      const newCatId = rc.insertId;

      const [subs] = await conn.execute(
        `SELECT * FROM editie_subcategorieen WHERE categorie_id = ? ORDER BY volgorde, naam`,
        [cat.id]
      );

      for (const sub of subs) {
        const [rs] = await conn.execute(
          `INSERT INTO editie_subcategorieen (categorie_id, naam, volgorde) VALUES (?, ?, ?)`,
          [newCatId, sub.naam, sub.volgorde]
        );
        const newSubId = rs.insertId;

        const [crit] = await conn.execute(
          `SELECT * FROM editie_criteria WHERE subcategorie_id = ? ORDER BY volgorde, naam`,
          [sub.id]
        );

        for (const cr of crit) {
          await conn.execute(
            `INSERT INTO editie_criteria
               (subcategorie_id, naam, omschrijving, invoer_type, max_score, min_score,
                lager_is_beter, scorerings_methode, scorerings_config, volgorde)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newSubId, cr.naam, cr.omschrijving, cr.invoer_type || 'getal',
             cr.max_score, cr.min_score ?? 0, cr.lager_is_beter ? 1 : 0,
             cr.scorerings_methode || 'direct',
             cr.scorerings_config ? JSON.stringify(cr.scorerings_config) : null,
             cr.volgorde]
          );
        }
      }
    }

    await conn.commit();
    return { geimporteerd: cats.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}


module.exports = {
  alleCategorieen, categorieMetDetails,
  categorieAanmaken, categorieBijwerken, categorieVerwijderen, bijwerkenWegingen,
  subcategorieAanmaken, subcategorieBijwerken, subcategorieVerwijderen,
  criteriumAanmaken, criteriumBijwerken, criteriumVerwijderen,
  importeerVanEditie,
};
