// src/app.js — Express server

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');

const app   = express();
const PORT  = process.env.PORT || 3000;

// Unieke versie per server-start — omzeilt proxy-caches voor JS/CSS
const BUILD_VERSION = Date.now().toString();

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Statische bestanden (nooit cachen in development) ─────────────
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// app.js krijgt BUILD_VERSION geïnjecteerd voor cache-busting
app.get('/js/app.js', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const inhoud   = fs.readFileSync(filePath, 'utf8').replace('__RSW_VERSION__', BUILD_VERSION);
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(inhoud);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth.routes'));
app.use('/api/profiel', require('./routes/profiel.routes'));
app.use('/api/admin',   require('./routes/admin.routes'));

// ── Publieke data (mock — later vervangen door echte DB-queries) ──
app.get('/api/publiek/editie/actief', (_req, res) => {
  res.json({
    id: 1, naam: 'RSW 2026', jaar: 2026,
    datum: '2026-05-16T09:00:00',
    locatie: 'Speelbos De Langstraat, Waalwijk',
    inschrijving_open: true, uitslagen_gepubliceerd: true,
  });
});

app.get('/api/publiek/edities/:id/top10', (_req, res) => {
  res.json([
    { patrouillenummer: 'A1', groep: 'Scouting De Langstraat',  eindscore: 94.2 },
    { patrouillenummer: 'B3', groep: 'Scouting Heusden',        eindscore: 91.8 },
    { patrouillenummer: 'C2', groep: 'Scouting Waalwijk',       eindscore: 89.5 },
    { patrouillenummer: 'A4', groep: 'Scouting Drunen',         eindscore: 87.1 },
    { patrouillenummer: 'D1', groep: 'Scouting Loon op Zand',   eindscore: 85.9 },
    { patrouillenummer: 'B2', groep: 'Scouting Vlijmen',        eindscore: 83.4 },
    { patrouillenummer: 'C5', groep: 'Scouting Sprang-Capelle', eindscore: 81.7 },
    { patrouillenummer: 'E3', groep: 'Scouting Kaatsheuvel',    eindscore: 79.2 },
    { patrouillenummer: 'A6', groep: 'Scouting De Langstraat',  eindscore: 77.8 },
    { patrouillenummer: 'D4', groep: 'Scouting Waalwijk',       eindscore: 75.3 },
  ]);
});

app.get('/api/publiek/edities/:id/programma', (_req, res) => {
  res.json([
    { starttijd: '08:30:00', naam: 'Ontvangst & registratie',   omschrijving: 'Incheck bij de ingang' },
    { starttijd: '09:00:00', naam: 'Openingsceremonie',         omschrijving: 'Welkomstwoord en vlaggenparade' },
    { starttijd: '09:30:00', naam: 'Categorie 1 — Pionieren',   omschrijving: 'Subkampen A t/m F' },
    { starttijd: '11:00:00', naam: 'Categorie 2 — Eerste hulp', omschrijving: 'Subkampen A t/m F' },
    { starttijd: '12:30:00', naam: 'Lunchpauze',                omschrijving: null },
    { starttijd: '13:15:00', naam: 'Categorie 3 — Navigatie',   omschrijving: 'Subkampen A t/m F' },
    { starttijd: '15:00:00', naam: 'Categorie 4 — Kampvuur',    omschrijving: 'Subkampen A t/m F' },
    { starttijd: '16:30:00', naam: 'Puntentelling & jurering',  omschrijving: null },
    { starttijd: '17:00:00', naam: 'Prijsuitreiking',           omschrijving: 'Afsluiting van de dag' },
  ]);
});

// ── SPA fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return res.status(404).json({ message: `Niet gevonden: ${req.path}` });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSW Portaal draait op http://localhost:${PORT}`);
  console.log(`Omgeving: ${process.env.NODE_ENV ?? 'development'}`);
});
