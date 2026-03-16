// src/config/migrate.js — Eenvoudige SQL migration runner
// Gebruik: node src/config/migrate.js

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

async function run() {
  // Zorg dat de tracking-tabel bestaat
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migraties (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      bestandsnaam VARCHAR(255) NOT NULL UNIQUE,
      uitgevoerd_op DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Haal al uitgevoerde migraties op
  const [uitgevoerd] = await db.execute('SELECT bestandsnaam FROM _migraties');
  const gedaan = new Set(uitgevoerd.map(r => r.bestandsnaam));

  // Lees bestanden gesorteerd op naam
  const bestanden = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let aantalNieuw = 0;

  for (const bestand of bestanden) {
    if (gedaan.has(bestand)) {
      console.log(`  ✓ ${bestand} (al uitgevoerd)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, bestand), 'utf8');

    // Verwijder commentaarregels, splits dan op ; (mysql2 heeft geen multi-statement support)
    const cleaned = sql.split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleaned
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await db.execute(statement);
    }

    await db.execute('INSERT INTO _migraties (bestandsnaam) VALUES (?)', [bestand]);
    console.log(`  ↑ ${bestand} uitgevoerd`);
    aantalNieuw++;
  }

  if (aantalNieuw === 0) console.log('Geen nieuwe migraties.');
  else console.log(`\n${aantalNieuw} migratie(s) succesvol uitgevoerd.`);

  await db.end();
}

run().catch(err => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
