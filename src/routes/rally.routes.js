// src/routes/rally.routes.js — Publieke rally scan endpoints (geen auth vereist)

const router     = require('express').Router();
const rallyModel = require('../models/rally.model');
const juryModel  = require('../models/jury.model');

function isOpen(moment) {
  if (!moment) return false;
  if (moment.handmatig_open) return true;
  const now = new Date();
  return now >= new Date(moment.start_tijd) && now <= new Date(moment.eind_tijd);
}

// ── Station valideren ──────────────────────────────────────────────
// GET /api/rally/station/:token
router.get('/station/:token', async (req, res) => {
  try {
    const data = await rallyModel.vindStationToken(req.params.token);
    if (!data) return res.status(404).json({ message: 'Ongeldig station token' });
    if (!isOpen(data.moment)) {
      return res.status(403).json({ message: 'Dit jureermoment is niet open', gesloten: true });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Open rally stations ophalen (voor handmatige keuze) ────────────
// GET /api/rally/stations?editie_id=X
router.get('/stations', async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    const db = require('../config/db');
    const [rows] = await db.execute(`
      SELECT rs.id AS station_id, rs.naam AS station_naam, rs.token,
             jm.id AS moment_id, jm.naam AS moment_naam,
             jm.start_tijd, jm.eind_tijd, jm.handmatig_open,
             ec.naam AS categorie_naam
      FROM rally_stations rs
      JOIN jurymomenten jm ON jm.id = rs.jurymoment_id
      JOIN editie_categorieen ec ON ec.id = jm.categorie_id
      WHERE jm.editie_id = ? AND jm.rally_modus = 1
      ORDER BY jm.start_tijd, rs.volgorde, rs.naam
    `, [editieId]);

    const nu = new Date();
    const open = rows.filter(r => {
      if (r.handmatig_open) return true;
      return nu >= new Date(r.start_tijd) && nu <= new Date(r.eind_tijd);
    });
    res.json(open);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Patrouille token valideren + bezoek registreren ───────────────
// POST /api/rally/scan  —  Body: { station_token, patrouille_token }
router.post('/scan', async (req, res) => {
  const { station_token, patrouille_token } = req.body || {};
  if (!station_token || !patrouille_token)
    return res.status(400).json({ message: 'station_token en patrouille_token zijn verplicht' });

  try {
    // Valideer station via rally_stations tabel
    const stationData = await rallyModel.vindStationToken(station_token);
    if (!stationData) return res.status(404).json({ message: 'Ongeldig station token' });
    if (!isOpen(stationData.moment))
      return res.status(403).json({ message: 'Dit jureermoment is gesloten', gesloten: true });

    // Valideer patrouille
    const patrouille = await rallyModel.vindPatrouilleToken(patrouille_token);
    if (!patrouille) return res.status(404).json({ message: 'Ongeldig patrouille token' });
    if (patrouille.editie_id !== stationData.moment.editie_id)
      return res.status(400).json({ message: 'Patrouille hoort bij een andere editie' });

    // Registreer bezoek (INSERT IGNORE — dubbele scan geeft bestaand bezoek terug)
    const bezoek = await rallyModel.registreerBezoek(
      stationData.moment.id,
      stationData.station.id,
      patrouille.patrouille_id
    );

    // Splits criteria: aankomst-criteria (auto-score) vs. jury-criteria (zichtbaar in formulier)
    const aankomstCriteria = stationData.criteria.filter(c => c.is_aankomst);
    const juryCriteria     = stationData.criteria.filter(c => !c.is_aankomst);

    // Sla aankomstscores automatisch op in jury_scores (INSERT IGNORE — blijft bij herscan)
    if (patrouille.subkamp_id) {
      for (const cr of aankomstCriteria) {
        if ((cr.aankomst_punten ?? 0) > 0) {
          await juryModel.slaScoreOpIgnore(
            stationData.moment.id, patrouille.subkamp_id,
            patrouille.patrouille_id, cr.id, cr.aankomst_punten
          );
        }
      }
    }

    // Haal bestaande scores op uit jury_scores (voor het voorinvullen van het formulier)
    const db = require('../config/db');
    const [scores] = await db.execute(
      `SELECT criterium_id, score FROM jury_scores
       WHERE jurymoment_id=? AND patrouille_id=?`,
      [stationData.moment.id, patrouille.patrouille_id]
    );

    // Bouw scoreformulier — alleen jury-criteria (aankomst-criteria niet tonen)
    const scoreMap = Object.fromEntries(scores.map(s => [s.criterium_id, Number(s.score)]));
    const scoreFormData = juryCriteria.map(cr => ({
      type:          'criterium',
      id:            cr.id,
      naam:          cr.naam,
      omschrijving:  cr.omschrijving || null,
      invoer_type:   cr.invoer_type || 'getal',
      min_score:     Number(cr.min_score ?? 0),
      max_score:     Number(cr.max_score ?? 10),
      subcategorie:  cr.subcategorie,
      huidige_score: scoreMap[cr.id] ?? null,
    }));

    res.json({
      bezoek_id:     bezoek?.id,
      bezoek_status: bezoek?.status,
      patrouille: {
        id:     patrouille.patrouille_id,
        nummer: patrouille.nummer,
      },
      station: {
        id:             stationData.station.id,
        naam:           stationData.station.naam,
        categorie_naam: stationData.categorie_naam,
        moment_id:      stationData.moment.id,
      },
      scoreFormData,
      scores: scores.map(s => ({ criterium_id: s.criterium_id, score: Number(s.score) })),
    });
  } catch (e) {
    console.error('[rally:scan]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── Score opslaan ──────────────────────────────────────────────────
// POST /api/rally/score  —  Body: { station_token, patrouille_id, scores: [{criterium_id, score}] }
router.post('/score', async (req, res) => {
  const { station_token, patrouille_id, scores } = req.body || {};
  if (!station_token || !patrouille_id || !Array.isArray(scores))
    return res.status(400).json({ message: 'station_token, patrouille_id en scores verplicht' });

  try {
    const stationData = await rallyModel.vindStationToken(station_token);
    if (!stationData) return res.status(404).json({ message: 'Ongeldig station token' });
    if (!isOpen(stationData.moment))
      return res.status(403).json({ message: 'Jureermoment is gesloten' });

    const subkampId = await rallyModel.vindSubkampPatrouille(
      Number(patrouille_id), stationData.moment.editie_id
    );
    if (!subkampId)
      return res.status(400).json({ message: 'Patrouille heeft nog geen subkamp toegewezen' });

    for (const s of scores) {
      if (s.criterium_id == null || s.score == null) continue;
      await juryModel.slaScoreOp(
        stationData.moment.id, subkampId, Number(patrouille_id), s.criterium_id, s.score
      );
    }

    await rallyModel.zetBezoekBezig(stationData.station.id, patrouille_id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


module.exports = router;
