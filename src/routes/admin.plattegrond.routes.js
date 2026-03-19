// src/routes/admin.plattegrond.routes.js — Plattegrond editor endpoints

const router = require('express').Router();
const { requireRole }  = require('../middleware/auth.middleware');
const plattegrondModel = require('../models/plattegrond.model');
const subkampModel     = require('../models/subkamp.model');
const db               = require('../config/db');
const svc              = require('../services/plattegrond.service');

const beheer = requireRole('admin', 'organisator');

// GET /api/plattegrond/:editieId — laad plattegrond (zonder afbeelding)
router.get('/:editieId', beheer, async (req, res) => {
  try {
    const p = await plattegrondModel.vindOfMaakAan(Number(req.params.editieId));
    res.json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/plattegrond/:editieId/afbeelding — laad enkel de afbeelding
router.get('/:editieId/afbeelding', beheer, async (req, res) => {
  try {
    const p = await plattegrondModel.vindOfMaakAan(Number(req.params.editieId));
    const afb = await plattegrondModel.laadAfbeelding(p.id);
    res.json({ afbeelding: afb });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/instellingen — canvas afmetingen, snap, schaal, opacity
router.put('/:editieId/instellingen', beheer, async (req, res) => {
  const { breedte, hoogte, snap_grootte, def_cel_w, def_cel_h, schaal_meter, bg_opacity } = req.body;
  try {
    await plattegrondModel.bijwerkenInstellingen(Number(req.params.editieId), { breedte, hoogte, snap_grootte, def_cel_w, def_cel_h, schaal_meter, bg_opacity });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/cellen — sla alle cellen op
router.put('/:editieId/cellen', beheer, async (req, res) => {
  const { cellen } = req.body;
  if (!cellen || typeof cellen !== 'object')
    return res.status(400).json({ message: 'cellen object vereist' });
  try {
    await plattegrondModel.slaafCellenOp(Number(req.params.editieId), cellen);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/plattegrond/:editieId/afbeelding — upload base64 afbeelding
router.post('/:editieId/afbeelding', beheer, async (req, res) => {
  const { afbeelding } = req.body;
  if (!afbeelding) return res.status(400).json({ message: 'afbeelding vereist' });
  try {
    const p = await plattegrondModel.vindOfMaakAan(Number(req.params.editieId));
    await plattegrondModel.slaafAfbeeldingOp(p.id, afbeelding);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/plattegrond/:editieId/afbeelding — verwijder afbeelding
router.delete('/:editieId/afbeelding', beheer, async (req, res) => {
  try {
    const p = await plattegrondModel.vindOfMaakAan(Number(req.params.editieId));
    await plattegrondModel.verwijderAfbeelding(p.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/plattegrond/:editieId/autoindeling — auto-indeling patrouilles
router.post('/:editieId/autoindeling', beheer, async (req, res) => {
  const editieId = Number(req.params.editieId);
  try {
    const p           = await plattegrondModel.vindOfMaakAan(editieId);
    const subkampen   = await subkampModel.alleSubkampen(editieId);
    const [patrouilles] = await db.execute(
      `SELECT p.id, p.groep_id, p.jongste, g.vereniging_id
       FROM patrouilles p
       JOIN groepen g ON g.id = p.groep_id
       WHERE p.editie_id = ?`, [editieId]
    );
    const nieuweCellen = svc.autoIndeling(subkampen, patrouilles, p.cellen ?? {});
    await plattegrondModel.slaafCellenOp(editieId, nieuweCellen);
    res.json({ cellen: nieuweCellen });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/plattegrond/:editieId/nummers — bereken en sla patrouillenummers op
router.post('/:editieId/nummers', beheer, async (req, res) => {
  const editieId = Number(req.params.editieId);
  try {
    const p         = await plattegrondModel.vindOfMaakAan(editieId);
    const subkampen = await subkampModel.alleSubkampen(editieId);
    const nieuweCellen = svc.berekenNummers(subkampen, p.cellen ?? {});
    await plattegrondModel.slaafCellenOp(editieId, nieuweCellen);
    res.json({ cellen: nieuweCellen });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/plattegrond/:editieId/scores — bereken spreiding-scores
router.post('/:editieId/scores', beheer, async (req, res) => {
  const editieId = Number(req.params.editieId);
  try {
    const p = await plattegrondModel.vindOfMaakAan(editieId);
    const [patrouilles] = await db.execute(
      'SELECT p.id, p.groep_id FROM patrouilles p WHERE p.editie_id = ?', [editieId]
    );
    const scores = svc.berekenScores(p.cellen ?? {}, patrouilles);
    res.json({ scores });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/vergrendel
router.put('/:editieId/vergrendel', beheer, async (req, res) => {
  try {
    await plattegrondModel.setVergrendeld(Number(req.params.editieId), req.body.vergrendeld);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/indelingvast
router.put('/:editieId/indelingvast', beheer, async (req, res) => {
  try {
    await plattegrondModel.setIndelingVast(Number(req.params.editieId), req.body.vast);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/publiceer  (patrouilles vastzetten)
router.put('/:editieId/publiceer', beheer, async (req, res) => {
  try {
    await plattegrondModel.setGepubliceerd(Number(req.params.editieId), req.body.gepubliceerd);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/publiceer-subkamp — maak subkamp-indeling zichtbaar voor leiding/publiek
router.put('/:editieId/publiceer-subkamp', beheer, async (req, res) => {
  try {
    await plattegrondModel.setSubkampGepubliceerd(Number(req.params.editieId), req.body.gepubliceerd);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/plattegrond/:editieId/publiceer-nummers — maak patrouillenummers zichtbaar voor leiding
router.put('/:editieId/publiceer-nummers', beheer, async (req, res) => {
  try {
    await plattegrondModel.setNummersGepubliceerd(Number(req.params.editieId), req.body.gepubliceerd);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET publiek — gepubliceerde plattegrond voor actieve editie
router.get('/publiek/actief', async (_req, res) => {
  try {
    const [[editie]] = await db.execute('SELECT id FROM edities WHERE actief=1 LIMIT 1');
    if (!editie) return res.json(null);
    const p = await plattegrondModel.vindOfMaakAan(editie.id);
    if (!p.gepubliceerd) return res.json(null);
    const subkampen = await subkampModel.alleSubkampen(editie.id);
    const [patrouilles] = await db.execute(
      `SELECT p.id, p.naam, p.nummer, p.groep_id,
              CONCAT(g.naam, ' (', v.afkorting, ')') AS groep
       FROM patrouilles p
       JOIN groepen g ON g.id = p.groep_id
       JOIN verenigingen v ON v.id = g.vereniging_id
       WHERE p.editie_id = ?`, [editie.id]
    );
    res.json({ plattegrond: p, subkampen, patrouilles });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
