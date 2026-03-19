// src/routes/admin.vrijwilligers.routes.js — Vrijwilligersbeheer voor admin/organisator

const router        = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const editieModel   = require('../models/editie.model');
const vrijwModel    = require('../models/vrijwilliger.model');

const beheerder = requireRole('admin', 'organisator');

// Alle vrijwilligers voor een editie
router.get('/', beheerder, async (req, res) => {
  try {
    const editie = req.query.editie_id
      ? await editieModel.vindOpId(Number(req.query.editie_id))
      : await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen editie gevonden' });

    const vrijwilligers = await vrijwModel.alleVoorEditie(editie.id);
    res.json({ editie, vrijwilligers });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Status wijzigen (bevestigd / afgewezen / aangemeld)
router.patch('/:id/status', beheerder, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'status is verplicht' });
    const bijgewerkt = await vrijwModel.stelStatusIn(Number(req.params.id), status);
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Verwijderen door beheerder
router.delete('/:id', beheerder, async (req, res) => {
  try {
    const ok = await vrijwModel.verwijder(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
