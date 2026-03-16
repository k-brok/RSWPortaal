// src/routes/admin.verenigingen.routes.js — Verenigingen + groepen beheer (admin only)

const router   = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const model    = require('../models/vereniging.model');

const adminOnly = requireRole('admin');

// ── Verenigingen ──────────────────────────────────────────────────

router.get('/', adminOnly, async (_req, res) => {
  try { res.json(await model.alleVerenigingen()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/:id', adminOnly, async (req, res) => {
  try {
    const ver = await model.verenigingMetGroepen(Number(req.params.id));
    if (!ver) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(ver);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', adminOnly, async (req, res) => {
  const { naam, afkorting } = req.body;
  if (!naam?.trim() || !afkorting?.trim()) {
    return res.status(400).json({ message: 'Naam en afkorting zijn verplicht' });
  }
  if (afkorting.trim().length > 10) {
    return res.status(400).json({ message: 'Afkorting mag maximaal 10 tekens zijn' });
  }
  try {
    res.status(201).json(await model.maakVereniging({ naam, afkorting }));
  } catch (e) {
    const msg = e.code === 'ER_DUP_ENTRY' ? 'Naam of afkorting al in gebruik' : e.message;
    res.status(400).json({ message: msg });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  const { naam, afkorting } = req.body;
  if (!naam?.trim() || !afkorting?.trim()) {
    return res.status(400).json({ message: 'Naam en afkorting zijn verplicht' });
  }
  try {
    const bijgewerkt = await model.werkVerenigingBij(Number(req.params.id), { naam, afkorting });
    if (!bijgewerkt) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(bijgewerkt);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const ok = await model.verwijderVereniging(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(409).json({ message: e.message }); }
});

// ── Groepen (genest onder vereniging) ────────────────────────────

router.post('/:id/groepen', adminOnly, async (req, res) => {
  const { naam } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    res.status(201).json(await model.maakGroep({ naam, vereniging_id: Number(req.params.id) }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/groepen/:groepId', adminOnly, async (req, res) => {
  const { naam } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    const bijgewerkt = await model.werkGroepBij(Number(req.params.groepId), { naam });
    if (!bijgewerkt) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/groepen/:groepId', adminOnly, async (req, res) => {
  try {
    const ok = await model.verwijderGroep(Number(req.params.groepId));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(409).json({ message: e.message }); }
});

module.exports = router;
