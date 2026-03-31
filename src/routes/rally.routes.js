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
             ec.naam AS categorie_naam, ec.rally_type
      FROM rally_stations rs
      JOIN jurymomenten jm ON jm.id = rs.jurymoment_id
      JOIN editie_categorieen ec ON ec.id = jm.categorie_id
      WHERE jm.editie_id = ? AND jm.rally_modus = 1
      ORDER BY jm.start_tijd, rs.volgorde, rs.naam
    `, [editieId]);

    const nu   = new Date();
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
    const stationData = await rallyModel.vindStationToken(station_token);
    if (!stationData) return res.status(404).json({ message: 'Ongeldig station token' });
    if (!isOpen(stationData.moment))
      return res.status(403).json({ message: 'Dit jureermoment is gesloten', gesloten: true });

    const patrouille = await rallyModel.vindPatrouilleToken(patrouille_token);
    if (!patrouille) return res.status(404).json({ message: 'Ongeldig patrouille token' });
    if (patrouille.editie_id !== stationData.moment.editie_id)
      return res.status(400).json({ message: 'Patrouille hoort bij een andere editie' });

    const rallyType    = stationData.rally_type;
    const momentId     = stationData.moment.id;
    const stationId    = stationData.station.id;
    const patrouilleId = patrouille.patrouille_id;
    const puntsModus   = stationData.moment.aankomst_punten_modus;

    const db = require('../config/db');

    // ── Tocht: positie-gebaseerde validatie ───────────────────────
    let huidigPositie     = null; // de route-positie die nu gescand wordt
    let huidigPositieIdx  = -1;   // index in route.stations
    let isStartPositie    = false;
    let isHerhaalBezoek   = false; // tweede keer bij dezelfde post (terugkomst-scan)
    let tochtRoute        = null;  // route-object, hergebruikt bij puntenberekening

    if (rallyType === 'tocht') {
      const route = await rallyModel.vindPatrouilleRoute(patrouilleId, momentId);
      tochtRoute = route;

      if (!route) {
        return res.status(400).json({
          message: 'Geen route toegewezen. Vraag de organisator om jouw route in te stellen.',
        });
      }
      if (!route.stations.length) {
        return res.status(400).json({
          message: 'De route heeft nog geen stations. Neem contact op met de organisator.',
        });
      }

      // Haal bestaande bezoeken op (per station_id)
      const [bezoeken] = await db.execute(`
        SELECT station_id, terugkomst_tijd
        FROM patrouille_bezoeken
        WHERE patrouille_id = ? AND jurymoment_id = ?
      `, [patrouilleId, momentId]);

      const bezoekMap = {}; // station_id → bezoek-object
      for (const b of bezoeken) bezoekMap[b.station_id] = b;

      // Bepaal de eerste onvoltooide positie in de reeks
      // Eerste keer dat station X voorkomt → voltooid als bezoekMap[X] bestaat
      // Tweede keer dat station X voorkomt → voltooid als bezoekMap[X].terugkomst_tijd is gezet
      const eersteKeerGezien = {}; // station_id → al eens voorgekomen
      let volgendePositie = null;

      for (let i = 0; i < route.stations.length; i++) {
        const pos        = route.stations[i];
        const eersteKeer = !eersteKeerGezien[pos.station_id];
        eersteKeerGezien[pos.station_id] = true;

        const voltooid = eersteKeer
          ? !!bezoekMap[pos.station_id]
          : !!bezoekMap[pos.station_id]?.terugkomst_tijd;

        if (!voltooid) {
          volgendePositie    = { ...pos, eersteKeer };
          huidigPositieIdx   = i;
          break;
        }
      }

      if (!volgendePositie) {
        return res.status(400).json({ message: 'Je hebt alle posten van je route al bezocht.', klaar: true });
      }

      if (volgendePositie.station_id !== stationId) {
        return res.status(400).json({
          message: `Dit is niet jouw volgende post. Ga eerst naar: ${volgendePositie.naam}`,
          volgende_post: volgendePositie.naam,
        });
      }

      huidigPositie   = volgendePositie;
      isStartPositie  = !!volgendePositie.is_start && volgendePositie.eersteKeer;
      isHerhaalBezoek = !volgendePositie.eersteKeer;
    }

    // ── Tijdslimiet controleren ───────────────────────────────────
    // Bij tocht met max_duur_minuten: na de startpost-scan loopt de timer.
    // Niet-startpost scans worden geweigerd als de tijd verstreken is.
    const maxDuur = stationData.moment.max_duur_minuten;
    let eindTijdPatrouille = null; // ingevuld bij startpost-scan of tijdcontrole

    if (maxDuur && rallyType === 'tocht' && !isStartPositie) {
      const [[startRij]] = await db.execute(
        `SELECT MIN(aankomst_tijd) AS start_scan_tijd
         FROM patrouille_bezoeken
         WHERE patrouille_id = ? AND jurymoment_id = ?`,
        [patrouilleId, momentId]
      );
      if (startRij?.start_scan_tijd) {
        const startMs = new Date(startRij.start_scan_tijd).getTime();
        eindTijdPatrouille = new Date(startMs + maxDuur * 60 * 1000);
        if (Date.now() > eindTijdPatrouille.getTime()) {
          const eindStr = eindTijdPatrouille.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
          return res.status(403).json({
            message: `Tijd verstreken. Jullie rally eindigde om ${eindStr}.`,
            tijd_verstreken: true,
            eind_tijd_patrouille: eindTijdPatrouille.toISOString(),
          });
        }
      }
    }

    // ── Punten berekenen ──────────────────────────────────────────
    // Startpost scoort nooit bij de eerste scan (is_start = true, eersteKeer)
    let punten = 0;
    const magScoren = rallyType !== 'tocht' || !isStartPositie;

    if (magScoren && puntsModus !== 'geen') {
      if (puntsModus === 'per_station') {
        // Gebruik punten van de route-positie indien beschikbaar, anders station-niveau
        punten = (huidigPositie?.station_punten ?? stationData.station.punten) ?? 0;

      } else if (puntsModus === 'per_bezoek') {
        if (rallyType === 'tocht' && huidigPositie && tochtRoute) {
          // Bereken bezoek-nummer: tel niet-startpost posities t/m huidige positie
          const sequence      = tochtRoute.stations;
          const eersteKeerTmp = {};
          let bezoekNr = 0;
          for (let i = 0; i <= huidigPositieIdx; i++) {
            const p  = sequence[i];
            const ek = !eersteKeerTmp[p.station_id];
            eersteKeerTmp[p.station_id] = true;
            if (!(p.is_start && ek)) bezoekNr++; // startpost telt niet mee
          }
          const puntenLijst = await rallyModel.voortgangPuntenVoorMoment(momentId);
          const rij = puntenLijst.find(r => r.bezoek_nr === bezoekNr);
          punten = rij ? Number(rij.punten) : 0;
        } else {
          const aantalBezocht = await rallyModel.telBezoeken(momentId, patrouilleId);
          const puntenLijst   = await rallyModel.voortgangPuntenVoorMoment(momentId);
          const rij = puntenLijst.find(r => r.bezoek_nr === aantalBezocht + 1);
          punten = rij ? Number(rij.punten) : 0;
        }

      } else if (puntsModus === 'per_positie') {
        const aantalVoor = isHerhaalBezoek
          ? await rallyModel.telTerugkomstenBijStation(momentId, stationId)
          : await rallyModel.telAankomstenBijStation(momentId, stationId);
        const positie    = aantalVoor + 1;
        const puntenLijst = await rallyModel.aankomstPuntenVoorMoment(momentId);
        const rij = puntenLijst.find(p => p.positie === positie);
        punten = rij ? Number(rij.punten) : 0;
      }
    }

    // ── Bezoek registreren ────────────────────────────────────────
    let bezoek;
    if (isHerhaalBezoek) {
      bezoek = await rallyModel.registreerTerugkomst(momentId, stationId, patrouilleId, null);
    } else {
      bezoek = await rallyModel.registreerBezoek(momentId, stationId, patrouilleId, null);
    }

    // ── Punten opslaan via is_aankomst criterium ──────────────────
    if (punten > 0 && patrouille.subkamp_id) {
      const aankomstCriteria = stationData.criteria.filter(c => c.is_aankomst);
      for (const cr of aankomstCriteria) {
        await juryModel.slaScoreOpIgnore(
          momentId, patrouille.subkamp_id, patrouilleId, cr.id, punten
        );
      }
    }

    // ── Scoreformulier opbouwen (jury-criteria, geen aankomst-criteria) ───
    const juryCriteria = stationData.criteria.filter(c => !c.is_aankomst);

    const [scores] = await db.execute(
      `SELECT criterium_id, score FROM jury_scores
       WHERE jurymoment_id=? AND patrouille_id=?`,
      [momentId, patrouilleId]
    );

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

    // Bij startpost + max_duur: bereken eindtijd vanuit het NET geregistreerde bezoek
    if (isStartPositie && maxDuur) {
      eindTijdPatrouille = new Date(Date.now() + maxDuur * 60 * 1000);
    }

    res.json({
      bezoek_id:             bezoek?.id,
      bezoek_status:         bezoek?.status,
      is_herhaal_bezoek:     isHerhaalBezoek,
      is_start_positie:      isStartPositie,
      aankomst_punten:       punten,
      start_tijd_patrouille: isStartPositie ? new Date().toISOString() : undefined,
      eind_tijd_patrouille:  eindTijdPatrouille ? eindTijdPatrouille.toISOString() : undefined,
      patrouille: {
        id:     patrouilleId,
        nummer: patrouille.nummer,
      },
      station: {
        id:             stationId,
        naam:           stationData.station.naam,
        categorie_naam: stationData.categorie_naam,
        moment_id:      momentId,
      },
      rally_type:   rallyType,
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
