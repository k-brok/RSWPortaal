// src/app.js — Express server (dev / productie)
// Serveert de frontend en mock API-endpoints voor lokale ontwikkeling.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Statische bestanden ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Mock API (alleen voor frontend-test, wordt later vervangen) ──

// Auth: refresh — altijd "niet ingelogd" teruggeven zodat de publieke
// landing page getoond wordt zonder foutmelding.
app.post('/api/auth/refresh', (req, res) => {
  res.status(401).json({ message: 'Geen actieve sessie' });
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  // Simpele mock: elke combinatie werkt, rol bepaald door e-mailadres
  const rol = email?.includes('admin')        ? 'admin'
            : email?.includes('organisator')  ? 'organisator'
            : email?.includes('jury')         ? 'jury'
            : email?.includes('spel')         ? 'spelbegeleider'
            : email?.includes('vrijwilliger') ? 'vrijwilliger'
            : 'leiding';

  res.json({
    accessToken: 'mock-token-' + Date.now(),
    user: {
      id: 1,
      naam: 'Test Gebruiker',
      email,
      rol,
      groep: rol === 'leiding' ? 'Scouting De Langstraat' : null,
    },
  });
});

app.post('/api/auth/logout', (req, res) => res.status(204).end());

// Publiek: actieve editie
app.get('/api/publiek/editie/actief', (req, res) => {
  res.json({
    id: 1,
    naam: 'RSW 2026',
    jaar: 2026,
    datum: '2026-05-16T09:00:00',
    locatie: 'Speelbos De Langstraat, Waalwijk',
    inschrijving_open: true,
    uitslagen_gepubliceerd: true,
  });
});

// Publiek: top 10
app.get('/api/publiek/edities/:id/top10', (req, res) => {
  const top10 = [
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
  ];
  res.json(top10);
});

// Publiek: programma
app.get('/api/publiek/edities/:id/programma', (req, res) => {
  res.json([
    { starttijd: '08:30:00', naam: 'Ontvangst & registratie',  omschrijving: 'Incheck bij de ingang' },
    { starttijd: '09:00:00', naam: 'Openingsceremonie',        omschrijving: 'Welkomstwoord en vlaggenparade' },
    { starttijd: '09:30:00', naam: 'Categorie 1 — Pionieren',  omschrijving: 'Subkampen A t/m F' },
    { starttijd: '11:00:00', naam: 'Categorie 2 — Eerste hulp', omschrijving: 'Subkampen A t/m F' },
    { starttijd: '12:30:00', naam: 'Lunchpauze',               omschrijving: null },
    { starttijd: '13:15:00', naam: 'Categorie 3 — Navigatie',  omschrijving: 'Subkampen A t/m F' },
    { starttijd: '15:00:00', naam: 'Categorie 4 — Kampvuur',   omschrijving: 'Subkampen A t/m F' },
    { starttijd: '16:30:00', naam: 'Puntentelling & jurering', omschrijving: null },
    { starttijd: '17:00:00', naam: 'Prijsuitreiking',          omschrijving: 'Afsluiting van de dag' },
  ]);
});

// ── SPA fallback — alle overige GET-requests naar index.html ─────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSW Portaal draait op http://localhost:${PORT}`);
  console.log(`Omgeving: ${process.env.NODE_ENV ?? 'development'}`);
});
