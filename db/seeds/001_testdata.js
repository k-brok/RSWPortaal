// db/seeds/001_testdata.js — Test-data voor ontwikkeling
// Gebruik: node db/seeds/001_testdata.js

require('dotenv').config();

const bcrypt = require('bcrypt');
const db     = require('../../src/config/db');

const WACHTWOORD  = 'Test1234!';
const ROUNDS      = Number(process.env.BCRYPT_ROUNDS) || 12;

async function seed() {
  console.log('Seed gestart...\n');

  const hash = await bcrypt.hash(WACHTWOORD, ROUNDS);

  // ── Verenigingen ─────────────────────────────────────────────
  await db.execute('DELETE FROM editie_categorieen');
  await db.execute('DELETE FROM edities');
  await db.execute('DELETE FROM refresh_tokens');
  await db.execute('DELETE FROM gebruikers');
  await db.execute('DELETE FROM groepen');
  await db.execute('DELETE FROM verenigingen');
  await db.execute('DELETE FROM categorie_templates');

  const verenigingen = [
    [1, 'Scouting Regio De Langstraat', 'SRL'],
  ];
  for (const [id, naam, afkorting] of verenigingen) {
    await db.execute(
      'INSERT INTO verenigingen (id, naam, afkorting) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE naam=naam',
      [id, naam, afkorting]
    );
  }

  // ── Groepen ───────────────────────────────────────────────────
  const groepen = [
    [1, 'Scouting De Langstraat',  1],
    [2, 'Scouting Heusden',        1],
    [3, 'Scouting Waalwijk',       1],
    [4, 'Scouting Drunen',         1],
    [5, 'Scouting Loon op Zand',   1],
    [6, 'Scouting Vlijmen',        1],
    [7, 'Scouting Sprang-Capelle', 1],
    [8, 'Scouting Kaatsheuvel',    1],
  ];
  for (const [id, naam, ver_id] of groepen) {
    await db.execute(
      'INSERT INTO groepen (id, naam, vereniging_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE naam=naam',
      [id, naam, ver_id]
    );
  }

  // ── Gebruikers ────────────────────────────────────────────────
  // Inloggen kan met elk van deze e-mailadressen + wachtwoord: Test1234!
  const gebruikers = [
    [1,  'Admin Beheerder',    'admin@rsw.nl',            'admin',          null, 1],
    [2,  'Organisator Een',    'organisator@rsw.nl',       'organisator',    null, 1],
    [3,  'Jan de Vries',       'jan@langstraat.nl',        'leiding',        1,    1],
    [4,  'Lisa Bakker',        'lisa@heusden.nl',          'leiding',        2,    1],
    [5,  'Mark Smit',          'mark@waalwijk.nl',         'leiding',        3,    1],
    [6,  'Sara Jansen',        'sara@drunen.nl',           'leiding',        4,    0],
    [7,  'Tom Peters',         'tom@loonopzand.nl',        'leiding',        5,    1],
    [8,  'Emma Visser',        'emma@vrijwilliger.nl',     'vrijwilliger',   null, 1],
    [9,  'Kees Molen',         'kees@vrijwilliger.nl',     'vrijwilliger',   null, 1],
    [10, 'Nina Groot',         'nina@vrijwilliger.nl',     'vrijwilliger',   null, 0],
    [11, 'Piet Hendriks',      'piet@jury.nl',             'jury',           null, 1],
    [12, 'Ans Willems',        'ans@jury.nl',              'jury',           null, 1],
    [13, 'Rob Kramer',         'rob@spelbegeleider.nl',    'spelbegeleider', null, 1],
    [14, 'Lotte van Dam',      'lotte@vrijwilliger.nl',    'vrijwilliger',   null, 1],
  ];

  for (const [id, naam, email, rol, groep_id, geverifieerd] of gebruikers) {
    await db.execute(
      `INSERT INTO gebruikers (id, naam, email, wachtwoord_hash, rol, groep_id, geverifieerd)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE naam=VALUES(naam), rol=VALUES(rol), groep_id=VALUES(groep_id)`,
      [id, naam, email, hash, rol, groep_id, geverifieerd]
    );
  }

  // ── Edities ───────────────────────────────────────────────────
  // RSW 2026: inschrijving_start in het verleden zodat testgebruikers scouts kunnen inschrijven
  await db.execute(`
    INSERT INTO edities (id, naam, jaar, datum, lsw_datum, locatie, max_groepen,
      inschrijving_start, uitslagen_gepubliceerd, actief,
      min_scouts, max_scouts, min_leeftijd, max_leeftijd,
      ouderen_leeftijd, max_ouderen_klein, max_ouderen_groot, ouderen_grens,
      bm_label, bm_max_positie)
    VALUES (1,'RSW 2026',2026,'2026-05-16','2026-09-20','Speelbos De Langstraat, Waalwijk',36,
            '2026-01-01',0,1, 5,7,11,15, 15,1,2,6, 'Buiten mededinging',2)
    ON DUPLICATE KEY UPDATE
      naam=VALUES(naam), inschrijving_start=VALUES(inschrijving_start), actief=VALUES(actief),
      min_scouts=VALUES(min_scouts), max_scouts=VALUES(max_scouts),
      min_leeftijd=VALUES(min_leeftijd), max_leeftijd=VALUES(max_leeftijd),
      ouderen_leeftijd=VALUES(ouderen_leeftijd), bm_label=VALUES(bm_label)
  `);
  const edities = [
    [2, 'RSW 2025', 2025, '2025-05-17', '2025-09-13', 'Speelbos De Langstraat, Waalwijk', 36, 1, 0],
    [3, 'RSW 2024', 2024, '2024-05-18', '2024-09-14', 'Bosgebied Loon op Zand',           32, 1, 0],
    [4, 'RSW 2023', 2023, '2023-05-20', '2023-09-16', 'Speelbos De Langstraat, Waalwijk', 30, 1, 0],
  ];
  for (const [id, naam, jaar, datum, lsw_datum, locatie, max_groepen,
              uitslagen_gepubliceerd, actief] of edities) {
    await db.execute(
      `INSERT INTO edities (id, naam, jaar, datum, lsw_datum, locatie, max_groepen,
                            uitslagen_gepubliceerd, actief)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE naam=VALUES(naam), actief=VALUES(actief)`,
      [id, naam, jaar, datum, lsw_datum, locatie, max_groepen,
       uitslagen_gepubliceerd, actief]
    );
  }

  // ── Vrijwilliger-inschrijvingen ───────────────────────────────
  await db.execute('DELETE FROM vrijwilliger_inschrijvingen');

  const vrijwInschrijvingen = [
    // editie_id, gebruiker_id, taakvorkeur, opmerking, status
    [1, 8,  'EHBO',        null,                       'bevestigd'],
    [1, 9,  'Logistiek',   'Kan alleen ochtend helpen', 'aangemeld'],
    [1, 14, 'Terreinbeheer', null,                     'aangemeld'],
  ];
  for (const [eid, uid, taak, opm, status] of vrijwInschrijvingen) {
    await db.execute(
      `INSERT INTO vrijwilliger_inschrijvingen (editie_id, gebruiker_id, taakvorkeur, opmerking, status)
       VALUES (?, ?, ?, ?, ?)`,
      [eid, uid, taak, opm, status]
    );
  }

  // ── Test patrouilles voor RSW 2026 ───────────────────────────
  await db.execute('DELETE FROM patrouilles WHERE editie_id = 1');

  const [patA] = await db.execute(
    'INSERT INTO patrouilles (editie_id, groep_id, naam, jongste) VALUES (1, 1, ?, 0)',
    ['Vliegende Vossen']
  );
  const [patB] = await db.execute(
    'INSERT INTO patrouilles (editie_id, groep_id, naam, jongste) VALUES (1, 1, ?, 1)',
    ['Wilde Wolven']
  );
  const [patC] = await db.execute(
    'INSERT INTO patrouilles (editie_id, groep_id, naam, jongste) VALUES (1, 2, ?, 0)',
    ['Stoere Stalen']
  );

  // Scouts voor Vliegende Vossen (6 scouts, 1 van 15 = OK)
  const lsw = '2026-09-20';
  const scouts = [
    [patA.insertId, 'Liam', 'de Groot', '2013-03-15'],      // 13
    [patA.insertId, 'Sofie', 'Janssen', '2012-07-22'],      // 14
    [patA.insertId, 'Noah', 'van Dijk', '2013-11-08'],      // 12
    [patA.insertId, 'Emma', 'Pietersen', '2011-05-30'],     // 15
    [patA.insertId, 'Finn', 'Vermeer', '2012-09-14'],       // 13
    [patA.insertId, 'Mila', 'Hendricks', '2013-01-25'],     // 13
    // Wilde Wolven (5 scouts, goed)
    [patB.insertId, 'Tijn', 'Bakker', '2014-06-10'],        // 12
    [patB.insertId, 'Nora', 'Smeets', '2013-08-19'],        // 13
    [patB.insertId, 'Lars', 'Willems', '2013-04-03'],       // 13
    [patB.insertId, 'Bo', 'Kramer', '2014-02-28'],          // 12
    [patB.insertId, 'Roos', 'van Loon', '2013-12-07'],      // 12
    // Stoere Stalen (groep 2, 0 scouts — nog leeg)
  ];
  for (const [pid, vnm, anm, geb] of scouts) {
    await db.execute(
      'INSERT INTO deelnemers (patrouille_id, voornaam, achternaam, geboortedatum) VALUES (?,?,?,?)',
      [pid, vnm, anm, geb]
    );
  }

  // ── Categorie-templates ───────────────────────────────────────
  // id, naam, omschrijving, wegingspercentage
  const templates = [
    [1, 'Pionieren',   'Bouwen met touw en stokken', 30],
    [2, 'Eerste hulp', 'EHBO-handelingen',           25],
    [3, 'Navigatie',   'Kaart en kompas',            20],
    [4, 'Kampvuur',    'Vuur maken en kampvuurkoken', 25],
  ];
  for (const [id, naam, omschrijving, weeg] of templates) {
    await db.execute(
      `INSERT INTO categorie_templates (id, naam, omschrijving, wegingspercentage)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE naam=VALUES(naam), wegingspercentage=VALUES(wegingspercentage)`,
      [id, naam, omschrijving, weeg]
    );
  }

  // ── Subcategorieën & criteria (voorbeeld voor Pionieren) ──────
  await db.execute('DELETE FROM template_subcategorieen WHERE template_id = 1');

  const [subA] = await db.execute(
    'INSERT INTO template_subcategorieen (template_id, naam, volgorde) VALUES (1, ?, 1)',
    ['Pionierconstructie']
  );
  const [subB] = await db.execute(
    'INSERT INTO template_subcategorieen (template_id, naam, volgorde) VALUES (1, ?, 2)',
    ['Brugbouw']
  );

  // Criteria voor Pionierconstructie
  await db.execute(
    'INSERT INTO template_criteria (subcategorie_id, naam, omschrijving, max_score, volgorde) VALUES (?, ?, ?, ?, ?)',
    [subA.insertId, 'Sterkte constructie', 'Hoe stevig is de constructie?', 50, 1]
  );
  await db.execute(
    'INSERT INTO template_criteria (subcategorie_id, naam, omschrijving, max_score, volgorde) VALUES (?, ?, ?, ?, ?)',
    [subA.insertId, 'Nauwkeurigheid knopen', 'Zijn de knopen correct gelegd?', 30, 2]
  );
  await db.execute(
    'INSERT INTO template_criteria (subcategorie_id, naam, omschrijving, max_score, volgorde) VALUES (?, ?, ?, ?, ?)',
    [subA.insertId, 'Creativiteit', 'Originele elementen in het ontwerp', 20, 3]
  );

  // Criteria voor Brugbouw
  await db.execute(
    'INSERT INTO template_criteria (subcategorie_id, naam, omschrijving, max_score, volgorde) VALUES (?, ?, ?, ?, ?)',
    [subB.insertId, 'Draagvermogen', 'Kan de brug het gewicht dragen?', 60, 1]
  );
  await db.execute(
    'INSERT INTO template_criteria (subcategorie_id, naam, omschrijving, max_score, volgorde) VALUES (?, ?, ?, ?, ?)',
    [subB.insertId, 'Afwerking', 'Netheid en afwerking van de brug', 40, 2]
  );

  console.log(`✓ Verenigingen, groepen, gebruikers, edities, vrijwilligers en categorie-templates aangemaakt.`);
  console.log(`\nInloggen kan met alle e-mailadressen hierboven.`);
  console.log(`Wachtwoord voor iedereen: ${WACHTWOORD}\n`);

  await db.end();
}

seed().catch(err => {
  console.error('Seed mislukt:', err.message);
  process.exit(1);
});
