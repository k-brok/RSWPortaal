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

  // ── Editie ────────────────────────────────────────────────────
  await db.execute(
    `INSERT INTO edities (id, naam, jaar, datum, locatie, inschrijving_open, uitslagen_gepubliceerd)
     VALUES (1, 'RSW 2026', 2026, '2026-05-16', 'Speelbos De Langstraat, Waalwijk', 1, 0)
     ON DUPLICATE KEY UPDATE naam=VALUES(naam)`,
  );

  // ── Categorie-templates ───────────────────────────────────────
  const templates = [
    [1, 'Pionieren',   'Bouwen met touw en stokken'],
    [2, 'Eerste hulp', 'EHBO-handelingen'],
    [3, 'Navigatie',   'Kaart en kompas'],
    [4, 'Kampvuur',    'Vuur maken en kampvuurkoken'],
  ];
  for (const [id, naam, omschrijving] of templates) {
    await db.execute(
      'INSERT INTO categorie_templates (id, naam, omschrijving) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE naam=naam',
      [id, naam, omschrijving]
    );
  }

  console.log(`✓ Verenigingen, groepen, gebruikers, editie en categorie-templates aangemaakt.`);
  console.log(`\nInloggen kan met alle e-mailadressen hierboven.`);
  console.log(`Wachtwoord voor iedereen: ${WACHTWOORD}\n`);

  await db.end();
}

seed().catch(err => {
  console.error('Seed mislukt:', err.message);
  process.exit(1);
});
