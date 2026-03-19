// src/routes/admin.edities.routes.js — Editiebeheer (admin only)

const router   = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const model    = require('../models/editie.model');
const patModel = require('../models/patrouille.model');

const adminOnly = requireRole('admin', 'organisator');

// ── Lezen ─────────────────────────────────────────────────────────

router.get('/', adminOnly, async (_req, res) => {
  try { res.json(await model.alle()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', adminOnly, async (req, res) => {
  try {
    const editie = await model.vindOpId(Number(req.params.id));
    if (!editie) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(editie);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Aanmaken ──────────────────────────────────────────────────────

router.post('/', adminOnly, async (req, res) => {
  const { naam, jaar, startdatum, lsw_datum, locatie, max_groepen } = req.body;
  if (!naam?.trim())        return res.status(400).json({ message: 'Naam is verplicht' });
  if (!jaar || isNaN(jaar)) return res.status(400).json({ message: 'Geldig jaar is verplicht' });
  try {
    const nieuw = await model.aanmaken({
      naam, jaar: Number(jaar), startdatum, lsw_datum, locatie, max_groepen,
    });
    res.status(201).json(nieuw);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Bijwerken (volledig) ──────────────────────────────────────────

router.put('/:id', adminOnly, async (req, res) => {
  const { naam, jaar } = req.body;
  if (!naam?.trim())        return res.status(400).json({ message: 'Naam is verplicht' });
  if (!jaar || isNaN(jaar)) return res.status(400).json({ message: 'Geldig jaar is verplicht' });
  try {
    const editie = await model.bijwerken(Number(req.params.id),
      { ...req.body, jaar: Number(jaar) }
    );
    if (!editie) return res.status(404).json({ message: 'Niet gevonden' });
    await patModel.hererekenEditie(editie); // herbereken BM bij gewijzigde regels
    res.json(editie);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Snel één veld bijwerken (toggle-knoppen in de UI)
router.patch('/:id', adminOnly, async (req, res) => {
  const { veld, waarde } = req.body;
  try {
    const editie = await model.patchVeld(Number(req.params.id), veld, waarde);
    res.json(editie);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ── Activeren / deactiveren ───────────────────────────────────────

router.post('/:id/activeer', adminOnly, async (req, res) => {
  try {
    const editie = await model.activeer(Number(req.params.id));
    if (!editie) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(editie);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/:id/deactiveer', adminOnly, async (req, res) => {
  try {
    const editie = await model.deactiveer(Number(req.params.id));
    if (!editie) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(editie);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Verwijderen ───────────────────────────────────────────────────

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const ok = await model.verwijder(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(409).json({ message: e.message }); }
});

module.exports = router;
