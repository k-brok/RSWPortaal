// src/routes/admin.rally.routes.js — Beheer rally: tokens, stations, routes, tracking

const router      = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const rallyModel  = require('../models/rally.model');
const editieModel = require('../models/editie.model');

const kanBeheren = requireRole('admin', 'organisator');

function fout(res, e) {
  res.status(e.status || 500).json({ message: e.message });
}

// ── Patrouille QR tokens ───────────────────────────────────────────

// POST /api/admin/rally/tokens/genereer
router.post('/tokens/genereer', kanBeheren, async (req, res) => {
  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(400).json({ message: 'Geen actieve editie' });
    const tokens = await rallyModel.genereerPatrouilleTokens(editie.id);
    res.json({ editie_id: editie.id, tokens });
  } catch (e) { fout(res, e); }
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
    res.json({ editie_id: editieId, tokens: await rallyModel.alleTokensVoorEditie(editieId) });
  } catch (e) { fout(res, e); }
});

// ── Rally stations CRUD ────────────────────────────────────────────

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
  const { naam, volgorde, punten } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'naam is verplicht' });
  try {
    await rallyModel.stationBijwerken(Number(req.params.id), { naam, volgorde, punten });
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
  const { criteria } = req.body;
  if (!Array.isArray(criteria)) return res.status(400).json({ message: 'criteria[] vereist' });
  try {
    await rallyModel.criteriaInstellen(Number(req.params.id), criteria);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Routes (tocht) ─────────────────────────────────────────────────

// GET /api/admin/rally/routes?moment_id=X
router.get('/routes', kanBeheren, async (req, res) => {
  const momentId = Number(req.query.moment_id);
  if (!momentId) return res.status(400).json({ message: 'moment_id vereist' });
  try { res.json(await rallyModel.alleRoutes(momentId)); }
  catch (e) { fout(res, e); }
});

// POST /api/admin/rally/routes
router.post('/routes', kanBeheren, async (req, res) => {
  const { jurymoment_id, naam } = req.body;
  if (!jurymoment_id || !naam?.trim())
    return res.status(400).json({ message: 'jurymoment_id en naam zijn verplicht' });
  try { res.status(201).json(await rallyModel.routeAanmaken(jurymoment_id, naam)); }
  catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/routes/:id
router.put('/routes/:id', kanBeheren, async (req, res) => {
  const { naam } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'naam is verplicht' });
  try {
    await rallyModel.routeBijwerken(Number(req.params.id), naam);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/rally/routes/:id
router.delete('/routes/:id', kanBeheren, async (req, res) => {
  try {
    await rallyModel.routeVerwijderen(Number(req.params.id));
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/routes/:id/stations  —  Body: { stations: [{station_id, is_start},...] }
router.put('/routes/:id/stations', kanBeheren, async (req, res) => {
  const { stations } = req.body;
  if (!Array.isArray(stations))
    return res.status(400).json({ message: 'stations[] vereist' });
  try {
    await rallyModel.routeStationsInstellen(Number(req.params.id), stations);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Patrouille-route toewijzingen ─────────────────────────────────

// GET /api/admin/rally/patrouille-routes?moment_id=X
router.get('/patrouille-routes', kanBeheren, async (req, res) => {
  const momentId = Number(req.query.moment_id);
  if (!momentId) return res.status(400).json({ message: 'moment_id vereist' });
  try { res.json(await rallyModel.allePatrouilleRoutes(momentId)); }
  catch (e) { fout(res, e); }
});

// POST /api/admin/rally/patrouille-routes  —  Body: { patrouille_id, route_id }
router.post('/patrouille-routes', kanBeheren, async (req, res) => {
  const { patrouille_id, route_id } = req.body;
  if (!patrouille_id || !route_id)
    return res.status(400).json({ message: 'patrouille_id en route_id zijn verplicht' });
  try {
    await rallyModel.patrouilleToewijzenRoute(Number(patrouille_id), Number(route_id));
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/rally/patrouille-routes?patrouille_id=X&moment_id=Y
router.delete('/patrouille-routes', kanBeheren, async (req, res) => {
  const patrouilleId = Number(req.query.patrouille_id);
  const momentId     = Number(req.query.moment_id);
  if (!patrouilleId || !momentId)
    return res.status(400).json({ message: 'patrouille_id en moment_id vereist' });
  try {
    await rallyModel.patrouilleRouteVerwijderen(patrouilleId, momentId);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Aankomstpunten per positie ─────────────────────────────────────

// GET /api/admin/rally/aankomst-punten?moment_id=X
router.get('/aankomst-punten', kanBeheren, async (req, res) => {
  const momentId = Number(req.query.moment_id);
  if (!momentId) return res.status(400).json({ message: 'moment_id vereist' });
  try { res.json(await rallyModel.aankomstPuntenVoorMoment(momentId)); }
  catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/aankomst-punten  —  Body: { moment_id, punten: [{positie,punten},...] }
router.put('/aankomst-punten', kanBeheren, async (req, res) => {
  const { moment_id, punten } = req.body;
  if (!moment_id || !Array.isArray(punten))
    return res.status(400).json({ message: 'moment_id en punten[] zijn verplicht' });
  try {
    await rallyModel.aankomstPuntenInstellen(Number(moment_id), punten);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Voortgang punten per bezoek-nr ─────────────────────────────────

// GET /api/admin/rally/voortgang-punten?moment_id=X
router.get('/voortgang-punten', kanBeheren, async (req, res) => {
  const momentId = Number(req.query.moment_id);
  if (!momentId) return res.status(400).json({ message: 'moment_id vereist' });
  try { res.json(await rallyModel.voortgangPuntenVoorMoment(momentId)); }
  catch (e) { fout(res, e); }
});

// PUT /api/admin/rally/voortgang-punten  —  Body: { moment_id, punten: [{bezoek_nr,punten},...] }
router.put('/voortgang-punten', kanBeheren, async (req, res) => {
  const { moment_id, punten } = req.body;
  if (!moment_id || !Array.isArray(punten))
    return res.status(400).json({ message: 'moment_id en punten[] zijn verplicht' });
  try {
    await rallyModel.voortgangPuntenInstellen(Number(moment_id), punten);
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
    res.json(await rallyModel.trackingOverzicht(editieId));
  } catch (e) { fout(res, e); }
});

module.exports = router;
