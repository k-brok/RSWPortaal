// src/routes/admin.aanvragen.routes.js — Leiding-aanvragen beheer voor admin/organisator

const router       = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const aanvraagModel = require('../models/aanvraag.model');
const vrijwModel   = require('../models/vrijwilliger.model');
const editieModel  = require('../models/editie.model');
const mailService  = require('../services/mail.service');

const beheerder = requireRole('admin', 'organisator');

// ── Gecombineerd overzicht: openstaande leiding-aanvragen + vrijwilliger-aanmeldingen ──

router.get('/', beheerder, async (_req, res) => {
  try {
    const [leidingAanvragen, editie] = await Promise.all([
      aanvraagModel.alleInBehandeling(),
      editieModel.actieveEditie(),
    ]);

    let vrijwilligersAangemeld = [];
    if (editie) {
      const alle = await vrijwModel.alleVoorEditie(editie.id);
      vrijwilligersAangemeld = alle.filter(v => v.status === 'aangemeld');
    }

    res.json({ leidingAanvragen, vrijwilligersAangemeld, editie });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Leiding aanvraag: goedkeuren ──────────────────────────────────

router.post('/leiding/:id/goedkeuren', beheerder, async (req, res) => {
  try {
    const aanvraag = await aanvraagModel.goedkeuren(Number(req.params.id), req.gebruiker.id);

    await mailService.stuurAanvraagGoedgekeurdMail(
      aanvraag.gebruiker_email,
      aanvraag.gebruiker_naam,
      aanvraag.groep_label
    ).catch(e => console.error('Goedkeuringsmail mislukt:', e.message));

    res.json(aanvraag);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Leiding aanvraag: afwijzen ────────────────────────────────────

router.post('/leiding/:id/afwijzen', beheerder, async (req, res) => {
  try {
    const { reden } = req.body;
    const aanvraag = await aanvraagModel.afwijzen(Number(req.params.id), req.gebruiker.id, reden ?? null);

    await mailService.stuurAanvraagAfgewezenMail(
      aanvraag.gebruiker_email,
      aanvraag.gebruiker_naam,
      'leiding',
      reden ?? null
    ).catch(e => console.error('Afwijzingsmail mislukt:', e.message));

    res.json(aanvraag);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Vrijwilliger aanmelding: bevestigen ───────────────────────────

router.post('/vrijwilliger/:id/bevestigen', beheerder, async (req, res) => {
  try {
    const inschrijving = await vrijwModel.stelStatusIn(Number(req.params.id), 'bevestigd');

    await mailService.stuurAanvraagGoedgekeurdMail(
      inschrijving.gebruiker_email,
      inschrijving.gebruiker_naam,
      inschrijving.vacature_naam ?? 'vrijwilliger'
    ).catch(e => console.error('Bevestigingsmail mislukt:', e.message));

    res.json(inschrijving);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Vrijwilliger aanmelding: afwijzen ─────────────────────────────

router.post('/vrijwilliger/:id/afwijzen', beheerder, async (req, res) => {
  try {
    const { reden } = req.body;
    const inschrijving = await vrijwModel.stelStatusIn(Number(req.params.id), 'afgewezen');

    await mailService.stuurAanvraagAfgewezenMail(
      inschrijving.gebruiker_email,
      inschrijving.gebruiker_naam,
      'vrijwilliger',
      reden ?? null
    ).catch(e => console.error('Afwijzingsmail mislukt:', e.message));

    res.json(inschrijving);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
