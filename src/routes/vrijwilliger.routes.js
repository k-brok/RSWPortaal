// src/routes/vrijwilliger.routes.js — Vrijwilliger-inschrijving (eigen inschrijving beheren)

const router        = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const editieModel   = require('../models/editie.model');
const vrijwModel    = require('../models/vrijwilliger.model');

router.use(requireAuth);

// ── Status + eigen inschrijving voor actieve editie ───────────────

router.get('/status', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.json({ editie: null, inschrijving: null });

    const inschrijving = await vrijwModel.vindVoorGebruiker(req.gebruiker.id, editie.id);
    res.json({ editie, inschrijving });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Historische inschrijvingen voor de ingelogde vrijwilliger ─────

router.get('/historisch', async (req, res) => {
  try {
    const alle = await vrijwModel.alleVoorGebruiker(req.gebruiker.id);
    // Actieve editie eruit filteren
    const actief = await editieModel.actieveEditie();
    const historisch = alle.filter(i => !actief || i.editie_id !== actief.id);
    res.json(historisch);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Aanmelden voor actieve editie ─────────────────────────────────

router.post('/', requireRole('vrijwilliger', 'admin', 'organisator'), async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie gevonden' });

    const bestaand = await vrijwModel.vindVoorGebruiker(req.gebruiker.id, editie.id);
    if (bestaand) return res.status(409).json({ message: 'Je bent al aangemeld voor deze editie' });

    const { taakvorkeur, opmerking, vacature_id } = req.body;
    const inschrijving = await vrijwModel.aanmelden(editie.id, req.gebruiker.id, { taakvorkeur, opmerking, vacature_id });
    res.status(201).json(inschrijving);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Eigen inschrijving bijwerken ──────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const inschrijving = await vrijwModel.vindOpId(Number(req.params.id));
    if (!inschrijving) return res.status(404).json({ message: 'Niet gevonden' });

    // Vrijwilliger mag alleen eigen inschrijving bewerken; admin/org alles
    const isAdmin = ['admin', 'organisator'].includes(req.gebruiker.rol);
    if (!isAdmin && inschrijving.gebruiker_id !== req.gebruiker.id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const { taakvorkeur, opmerking, vacature_id } = req.body;
    const bijgewerkt = await vrijwModel.bijwerken(Number(req.params.id), { taakvorkeur, opmerking, vacature_id });
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Eigen inschrijving verwijderen ────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const inschrijving = await vrijwModel.vindOpId(Number(req.params.id));
    if (!inschrijving) return res.status(404).json({ message: 'Niet gevonden' });

    const isAdmin = ['admin', 'organisator'].includes(req.gebruiker.rol);
    if (!isAdmin && inschrijving.gebruiker_id !== req.gebruiker.id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    await vrijwModel.verwijder(Number(req.params.id));
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
