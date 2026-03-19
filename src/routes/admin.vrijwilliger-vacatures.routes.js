// src/routes/admin.vrijwilliger-vacatures.routes.js — Vacaturesbeheer voor admin/organisator

const router       = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const editieModel  = require('../models/editie.model');
const vacModel     = require('../models/vrijwilliger-vacature.model');

const beheerder = requireRole('admin', 'organisator');

// Alle vacatures voor (actieve) editie
router.get('/', beheerder, async (req, res) => {
  try {
    const editie = req.query.editie_id
      ? await editieModel.vindOpId(Number(req.query.editie_id))
      : await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen editie gevonden' });
    const vacatures = await vacModel.alleVoorEditie(editie.id);
    res.json({ editie, vacatures });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Aanmaken
router.post('/', beheerder, async (req, res) => {
  try {
    const editie = req.body.editie_id
      ? await editieModel.vindOpId(Number(req.body.editie_id))
      : await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie gevonden' });

    const { naam, omschrijving, max_vrijwilligers } = req.body;
    if (!naam?.trim()) return res.status(400).json({ message: 'naam is verplicht' });

    const vacature = await vacModel.aanmaken(editie.id, { naam, omschrijving, max_vrijwilligers });
    res.status(201).json(vacature);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Bijwerken
router.put('/:id', beheerder, async (req, res) => {
  try {
    const bestaand = await vacModel.vindOpId(Number(req.params.id));
    if (!bestaand) return res.status(404).json({ message: 'Vacature niet gevonden' });

    const { naam, omschrijving, max_vrijwilligers } = req.body;
    if (!naam?.trim()) return res.status(400).json({ message: 'naam is verplicht' });

    const bijgewerkt = await vacModel.bijwerken(Number(req.params.id), { naam, omschrijving, max_vrijwilligers });
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Verwijderen
router.delete('/:id', beheerder, async (req, res) => {
  try {
    const ok = await vacModel.verwijder(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Vacature niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
