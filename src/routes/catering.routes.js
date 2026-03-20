// src/routes/catering.routes.js — Catering aanmeldingen (leiding + vrijwilliger)

const router        = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const editieModel   = require('../models/editie.model');
const cateringModel = require('../models/catering.model');

router.use(requireAuth);

// ── Status + eigen aanvraag voor actieve editie ───────────────────

router.get('/status', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.json({ editie: null, aanvraag: null });

    const aanvraag = await cateringModel.vindVoorGebruiker(req.gebruiker.id, editie.id);
    res.json({ editie, aanvraag });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Catering aanmelden ────────────────────────────────────────────

router.post('/', requireRole('leiding', 'vrijwilliger', 'admin', 'organisator'), async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie gevonden' });

    const instellingen = await cateringModel.getCateringInstellingen(editie.id);
    if (!instellingen?.catering_actief) {
      return res.status(400).json({ message: 'Catering is momenteel niet beschikbaar voor deze editie' });
    }

    const bestaand = await cateringModel.vindVoorGebruiker(req.gebruiker.id, editie.id);
    if (bestaand) return res.status(409).json({ message: 'Je hebt al een catering aanvraag voor deze editie' });

    const { aantal_personen, opmerking } = req.body;
    if (!aantal_personen || Number(aantal_personen) < 1) {
      return res.status(400).json({ message: 'Aantal personen moet minimaal 1 zijn' });
    }

    // Rol bepalen voor de aanvraag
    const cateringRol = req.gebruiker.rol === 'leiding' ? 'leiding' : 'vrijwilliger';

    const aanvraag = await cateringModel.aanmelden(editie.id, req.gebruiker.id, cateringRol, {
      aantal_personen: Number(aantal_personen),
      opmerking,
    });
    res.status(201).json(aanvraag);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Eigen aanvraag bijwerken ──────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const aanvraag = await cateringModel.vindOpId(Number(req.params.id));
    if (!aanvraag) return res.status(404).json({ message: 'Niet gevonden' });

    const isAdmin = ['admin', 'organisator'].includes(req.gebruiker.rol);
    if (!isAdmin && aanvraag.gebruiker_id !== req.gebruiker.id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const { aantal_personen, opmerking } = req.body;
    if (!aantal_personen || Number(aantal_personen) < 1) {
      return res.status(400).json({ message: 'Aantal personen moet minimaal 1 zijn' });
    }

    const bijgewerkt = await cateringModel.bijwerken(Number(req.params.id), {
      aantal_personen: Number(aantal_personen),
      opmerking,
    });
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Eigen aanvraag annuleren ──────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const aanvraag = await cateringModel.vindOpId(Number(req.params.id));
    if (!aanvraag) return res.status(404).json({ message: 'Niet gevonden' });

    const isAdmin = ['admin', 'organisator'].includes(req.gebruiker.rol);
    if (!isAdmin && aanvraag.gebruiker_id !== req.gebruiker.id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    await cateringModel.verwijder(Number(req.params.id));
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
