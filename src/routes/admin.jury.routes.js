// src/routes/admin.jury.routes.js — Jury beheer voor admin en organisator

const { requireRole } = require('../middleware/auth.middleware');
const juryModel      = require('../models/jury.model');
const catModel       = require('../models/editie-categorie.model');
const subkampModel   = require('../models/subkamp.model');
const programmaModel = require('../models/programma.model');

const beheer = requireRole('admin', 'organisator');

module.exports = (io) => {
const router = require('express').Router();
const uitslagenRoom = (editieId) => `uitslagen:${editieId}`;

// ── Jurymomenten ──────────────────────────────────────────────────

// GET /momenten?editie_id=X
router.get('/momenten', beheer, async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await juryModel.alleMomenten(editieId));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /momenten
router.post('/momenten', beheer, async (req, res) => {
  const { editie_id, categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
          rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus,
          max_duur_minuten } = req.body;
  if (!editie_id || !categorie_id || !start_tijd || !eind_tijd)
    return res.status(400).json({ message: 'editie_id, categorie_id, start_tijd en eind_tijd zijn verplicht' });
  try {
    res.status(201).json(await juryModel.aanmaken({
      editie_id, categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
      rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus, max_duur_minuten,
    }));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id
router.put('/momenten/:id', beheer, async (req, res) => {
  const { categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
          rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus,
          max_duur_minuten } = req.body;
  if (!categorie_id || !start_tijd || !eind_tijd)
    return res.status(400).json({ message: 'categorie_id, start_tijd en eind_tijd zijn verplicht' });
  try {
    const m = await juryModel.bijwerken(Number(req.params.id), {
      categorie_id, naam, start_tijd, eind_tijd, jureer_modus,
      rally_modus, score_niveau, aankomst_punten, aankomst_punten_modus, max_duur_minuten,
    });
    if (!m) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(m);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /momenten/:id
router.delete('/momenten/:id', beheer, async (req, res) => {
  try {
    const ok = await juryModel.verwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id/open — toggle handmatig_open
router.put('/momenten/:id/open', beheer, async (req, res) => {
  try {
    const moment = await juryModel.vindMoment(Number(req.params.id));
    if (!moment) return res.status(404).json({ message: 'Niet gevonden' });
    const nieuw = !moment.handmatig_open;
    await juryModel.setHandmatigOpen(moment.id, nieuw);
    res.json({ handmatig_open: nieuw });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id/programma — toggle in_programma
router.put('/momenten/:id/programma', beheer, async (req, res) => {
  try {
    const moment = await juryModel.vindMoment(Number(req.params.id));
    if (!moment) return res.status(404).json({ message: 'Niet gevonden' });
    const nieuw = !moment.in_programma;
    await programmaModel.setInProgramma(moment.id, nieuw);
    res.json({ in_programma: nieuw });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id/publiceer — toggle gepubliceerd
router.put('/momenten/:id/publiceer', beheer, async (req, res) => {
  try {
    const moment = await juryModel.vindMoment(Number(req.params.id));
    if (!moment) return res.status(404).json({ message: 'Niet gevonden' });
    const nieuw = !moment.gepubliceerd;
    await juryModel.setGepubliceerd(moment.id, nieuw);
    res.json({ gepubliceerd: nieuw });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id/stations — stel in welke subkampen aan dit rally moment deelnemen
router.put('/momenten/:id/stations', beheer, async (req, res) => {
  const { stations } = req.body; // [{ subkamp_id, aankomst_punten }]
  if (!Array.isArray(stations))
    return res.status(400).json({ message: 'stations[] vereist' });
  try {
    await juryModel.bijwerkenStations(Number(req.params.id), stations);
    res.json(await juryModel.momentMetTokens(Number(req.params.id)));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /momenten/:id/tokens — genereer QR tokens voor alle subkampen van editie
router.post('/momenten/:id/tokens', beheer, async (req, res) => {
  try {
    const moment = await juryModel.vindMoment(Number(req.params.id));
    if (!moment) return res.status(404).json({ message: 'Niet gevonden' });

    const subkampen = await subkampModel.alleSubkampen(moment.editie_id);
    if (!subkampen.length) return res.status(400).json({ message: 'Geen subkampen gevonden voor deze editie' });

    const subkampIds = subkampen.map(s => s.id);
    await juryModel.genereerTokens(moment.id, subkampIds);

    const metTokens = await juryModel.momentMetTokens(moment.id);
    res.json(metTokens);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /momenten/:id/tokens — haal bestaande tokens + QR data urls op
router.get('/momenten/:id/tokens', beheer, async (req, res) => {
  try {
    const metTokens = await juryModel.momentMetTokens(Number(req.params.id));
    if (!metTokens) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(metTokens);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /momenten/:id/printdata/:subkampId — data voor scoreformulier print
router.get('/momenten/:id/printdata/:subkampId', beheer, async (req, res) => {
  try {
    const data = await juryModel.formulierData(
      Number(req.params.id),
      Number(req.params.subkampId)
    );
    if (!data) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /momenten/:id/scores — alle scores voor dit moment
router.get('/momenten/:id/scores', beheer, async (req, res) => {
  try {
    const scores = await juryModel.alleScoresMoment(Number(req.params.id));
    res.json(scores);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /momenten/:id/scores — sla één score op
router.put('/momenten/:id/scores', beheer, async (req, res) => {
  const { subkamp_id, patrouille_id, criterium_id, score } = req.body;
  if (subkamp_id == null || patrouille_id == null || criterium_id == null || score == null)
    return res.status(400).json({ message: 'subkamp_id, patrouille_id, criterium_id en score zijn verplicht' });
  try {
    const momentId = Number(req.params.id);
    await juryModel.slaScoreOp(momentId, subkamp_id, patrouille_id, criterium_id, score);
    // Emit live update naar uitslagen watchers
    const moment = await juryModel.vindMoment(momentId);
    if (moment?.editie_id) io.to(uitslagenRoom(moment.editie_id)).emit('uitslagen:updated');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Editie categorieen ─────────────────────────────────────────────

// GET /categorieen?editie_id=X
router.get('/categorieen', beheer, async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await catModel.alleCategorieen(editieId));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /uitslagen?editie_id=X — berekende uitslagen (admin preview)
router.get('/uitslagen', beheer, async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await juryModel.berekenUitslagen(editieId));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

return router;
}; // einde module.exports factory
