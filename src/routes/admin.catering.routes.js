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

// ── Gebruikers die nog niet aangemeld zijn (voor toevoegen-modal) ──

router.get('/beschikbare-gebruikers', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.json([]);
    const gebruikers = await cateringModel.beschikbareGebruikers(editie.id);
    res.json(gebruikers);
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

// ── Persoon handmatig toevoegen aan catering ──────────────────────

router.post('/', async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie gevonden' });

    const { gebruiker_id, handmatig_naam, rol, aantal_personen, opmerking } = req.body;

    // Moet óf een gebruiker_id óf een handmatig_naam hebben
    if (!gebruiker_id && !handmatig_naam?.trim()) {
      return res.status(400).json({ message: 'Vul een gebruiker of een naam in.' });
    }
    if (!['leiding', 'vrijwilliger', 'overig'].includes(rol)) {
      return res.status(400).json({ message: 'Ongeldig rol.' });
    }
    if (!Number.isInteger(Number(aantal_personen)) || Number(aantal_personen) < 1) {
      return res.status(400).json({ message: 'Aantal personen moet minimaal 1 zijn.' });
    }

    const aanvraag = await cateringModel.voegHandmatigToe(editie.id, {
      gebruiker_id: gebruiker_id ? Number(gebruiker_id) : null,
      handmatig_naam: handmatig_naam?.trim() || null,
      rol,
      aantal_personen: Number(aantal_personen),
      opmerking: opmerking?.trim() || null,
    });

    res.status(201).json(aanvraag);
  } catch (e) {
    const status = e.message.includes('al aangemeld') ? 409 : 500;
    res.status(status).json({ message: e.message });
  }
});

// ── Betaalstatus bijwerken ─────────────────────────────────────────

router.patch('/:id/betaald', async (req, res) => {
  try {
    const aanvraag = await cateringModel.vindOpId(Number(req.params.id));
    if (!aanvraag) return res.status(404).json({ message: 'Niet gevonden' });

    const { betaald } = req.body;
    await cateringModel.updateBetaald(Number(req.params.id), betaald);
    res.json({ id: aanvraag.id, betaald: betaald ? 1 : 0 });
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
