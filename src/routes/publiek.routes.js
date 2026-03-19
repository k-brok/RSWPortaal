// src/routes/publiek.routes.js — Publieke endpoints (geen auth vereist)

const router         = require('express').Router();
const editieModel    = require('../models/editie.model');
const juryModel      = require('../models/jury.model');
const programmaModel = require('../models/programma.model');
const vacModel       = require('../models/vrijwilliger-vacature.model');
const gebruikerModel = require('../models/gebruiker.model');

// ── Edities ───────────────────────────────────────────────────────

// Alle edities — voor de editie-switcher in de header
router.get('/edities', async (_req, res) => {
  try { res.json(await editieModel.alle()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// Systeem-actieve editie
router.get('/editie/actief', async (_req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie' });
    res.json(editie);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Top 10 (mock — wordt later vervangen door echte scores) ───────

router.get('/edities/:id/top10', (_req, res) => {
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

// ── Programma ─────────────────────────────────────────────────────

router.get('/edities/:id/programma', async (req, res) => {
  const editieId = Number(req.params.id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await programmaModel.publiekProgramma(editieId));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Vacatures (publiek, actieve editie) ───────────────────────────

router.get('/vacatures', async (_req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.json([]);
    res.json(await vacModel.alleVoorEditie(editie.id));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Groepen (voor registratieformulier) ───────────────────────────

router.get('/groepen', async (_req, res) => {
  try { res.json(await gebruikerModel.alleGroepen()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Uitslagen (publiek, actieve editie) ───────────────────────────

router.get('/uitslagen/actief', async (_req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie' });
    res.json(await juryModel.berekenUitslagen(editie.id, true));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
