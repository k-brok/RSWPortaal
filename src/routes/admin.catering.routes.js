// src/routes/admin.catering.routes.js — Catering overzicht en instellingen (organisator/admin)

const router        = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const editieModel   = require('../models/editie.model');
const cateringModel = require('../models/catering.model');

router.use(requireAuth);
router.use(requireRole('organisator', 'admin'));

// ── Overzicht voor actieve editie ─────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.json({ editie: null, aanvragen: [], totalen: [] });

    const [aanvragen, totalen] = await Promise.all([
      cateringModel.alleVoorEditie(editie.id),
      cateringModel.totaalPerRol(editie.id),
    ]);

    res.json({ editie, aanvragen, totalen });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Catering instellingen bijwerken ───────────────────────────────

router.patch('/instellingen', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie gevonden' });

    const { catering_actief, catering_prijs_leiding, catering_prijs_vrijwilliger } = req.body;
    const instellingen = await cateringModel.updateCateringInstellingen(editie.id, {
      catering_actief,
      catering_prijs_leiding:      catering_prijs_leiding      !== undefined ? catering_prijs_leiding      : null,
      catering_prijs_vrijwilliger: catering_prijs_vrijwilliger !== undefined ? catering_prijs_vrijwilliger : null,
    });
    res.json(instellingen);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Aanvraag verwijderen (door organisator/admin) ─────────────────

router.delete('/:id', async (req, res) => {
  try {
    const aanvraag = await cateringModel.vindOpId(Number(req.params.id));
    if (!aanvraag) return res.status(404).json({ message: 'Niet gevonden' });

    await cateringModel.verwijder(Number(req.params.id));
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
