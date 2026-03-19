// src/routes/admin.rally.routes.js — Beheer rally patrouille QR tokens + tracking

const router     = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const rallyModel = require('../models/rally.model');
const editieModel = require('../models/editie.model');

const kanBeheren = requireRole('admin', 'organisator');

// ── Patrouille QR tokens genereren ────────────────────────────────

// POST /api/admin/rally/tokens/genereer
router.post('/tokens/genereer', kanBeheren, async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(400).json({ message: 'Geen actieve editie' });

    const tokens = await rallyModel.genereerPatrouilleTokens(editie.id);
    res.json({ editie_id: editie.id, tokens });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/rally/tokens?editie_id=X
router.get('/tokens', kanBeheren, async (req, res) => {
  try {
    let editieId = Number(req.query.editie_id);
    if (!editieId) {
      const editie = await editieModel.actieveEditie();
      if (!editie) return res.status(400).json({ message: 'Geen actieve editie' });
      editieId = editie.id;
    }
    const tokens = await rallyModel.alleTokensVoorEditie(editieId);
    res.json({ editie_id: editieId, tokens });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Rally stations CRUD ────────────────────────────────────────────

function fout(res, e) {
  res.status(e.status || 500).json({ message: e.message });
}

// GET /api/admin/rally/stations?moment_id=X
router.get('/stations', kanBeheren, async (req, res) => {
  const momentId = Number(req.query.moment_id);
  if (!momentId) return res.status(400).json({ message: 'moment_id vereist' });
  try { res.json(await rallyModel.alleStations(momentId)); }
  catch (e) { fout(res, e); }
});

// POST /api/admin/rally/stations
router.post('/stations', kanBeheren, async (req, res) => {
  const { jurymoment_id, naam, volgorde } = req.body;
  if (!jurymoment_id || !naam?.trim())
    return res.status(400).json({ message: 'jurymoment_id en naam zijn verplicht' });
  try { res.status(201).json(await rallyModel.stationAanmaken({ jurymoment_id, naam, volgorde })); }
  catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/stations/:id
router.put('/stations/:id', kanBeheren, async (req, res) => {
  const { naam, volgorde } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'naam is verplicht' });
  try {
    await rallyModel.stationBijwerken(Number(req.params.id), { naam, volgorde });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/rally/stations/:id
router.delete('/stations/:id', kanBeheren, async (req, res) => {
  try {
    const ok = await rallyModel.stationVerwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/stations/:id/criteria
router.put('/stations/:id/criteria', kanBeheren, async (req, res) => {
  const { criteria } = req.body; // [{criterium_id, aankomst_punten, volgorde}]
  if (!Array.isArray(criteria)) return res.status(400).json({ message: 'criteria[] vereist' });
  try {
    await rallyModel.criteriaInstellen(Number(req.params.id), criteria);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Tracking overzicht ─────────────────────────────────────────────

// GET /api/admin/rally/tracking?editie_id=X
router.get('/tracking', kanBeheren, async (req, res) => {
  try {
    let editieId = Number(req.query.editie_id);
    if (!editieId) {
      const editie = await editieModel.actieveEditie();
      if (!editie) return res.status(400).json({ message: 'Geen actieve editie' });
      editieId = editie.id;
    }
    const overzicht = await rallyModel.trackingOverzicht(editieId);
    res.json(overzicht);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
