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

// ── Sessie-gebaseerde endpoints (nieuwe QR-flow zonder interne camera) ────────

const SESSIE_COOKIE   = 'rally_sessie';
const COOKIE_OPTIES   = {
  httpOnly: true,
  maxAge:   60 * 60 * 1000, // 1 uur
  sameSite: 'lax',
  path:     '/',
  secure:   process.env.NODE_ENV === 'production',
};

function getSessieToken(req) { return req.cookies?.[SESSIE_COOKIE] || null; }

// GET /api/rally/station-scan/:token
// Scan station-QR → maak sessie + httpOnly cookie
router.get('/station-scan/:token', async (req, res) => {
  try {
    const data = await rallyModel.vindStationToken(req.params.token);
    if (!data) return res.status(404).json({ message: 'Ongeldig station token' });
    if (!isOpen(data.moment))
      return res.status(403).json({ message: 'Dit jureermoment is niet open', gesloten: true });

    const sessie = await rallyModel.maakStationSessie(data.station.id);
    res.cookie(SESSIE_COOKIE, sessie.token, COOKIE_OPTIES);

    res.json({
      station:        data.station,
      moment:         data.moment,
      categorie_naam: data.categorie_naam,
      rally_type:     data.rally_type,
      verlopen_op:    sessie.verlopen_op,
      patrouilles:    [], // leeg bij eerste scan; polling vult aan
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/rally/sessie
// Haal huidige sessie op + lijst patrouilles op post
router.get('/sessie', async (req, res) => {
  const token = getSessieToken(req);
  if (!token) return res.status(401).json({ message: 'Geen actieve sessie' });

  try {
    const sessie = await rallyModel.valideerStationSessie(token);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen — scan opnieuw een station-QR' });
    }
    if (!isOpen(sessie.moment))
      return res.status(403).json({ message: 'Jureermoment is gesloten', gesloten: true });

    const patrouilles = await rallyModel.patrouillesOpPost(
      sessie.moment.id, sessie.station.id, sessie.moment.editie_id
    );

    res.json({ ...sessie, patrouilles });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/rally/sessie-patrouilles
// Alleen de patrouillelijst (polling)
router.get('/sessie-patrouilles', async (req, res) => {
  const token = getSessieToken(req);
  if (!token) return res.status(401).json({ message: 'Geen actieve sessie' });

  try {
    const sessie = await rallyModel.valideerStationSessie(token);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen' });
    }

    const patrouilles = await rallyModel.patrouillesOpPost(
      sessie.moment.id, sessie.station.id, sessie.moment.editie_id
    );
    res.json({ patrouilles });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/rally/patrouille-aankomst
// Scan patrouille-QR met actieve station-sessie → registreer op post
// Body: { patrouille_token }
router.post('/patrouille-aankomst', async (req, res) => {
  const sessieToken = getSessieToken(req);
  if (!sessieToken) return res.status(401).json({ message: 'Geen actieve sessie — scan eerst een station-QR' });

  const { patrouille_token } = req.body || {};
  if (!patrouille_token) return res.status(400).json({ message: 'patrouille_token verplicht' });

  try {
    const sessie = await rallyModel.valideerStationSessie(sessieToken);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen — scan opnieuw een station-QR' });
    }
    if (!isOpen(sessie.moment))
      return res.status(403).json({ message: 'Jureermoment is gesloten' });

    const patrouille = await rallyModel.vindPatrouilleToken(patrouille_token);
    if (!patrouille) return res.status(404).json({ message: 'Ongeldig patrouille token' });
    if (patrouille.editie_id !== sessie.moment.editie_id)
      return res.status(400).json({ message: 'Patrouille hoort bij een andere editie' });

    const rallyType    = sessie.rally_type;
    const momentId     = sessie.moment.id;
    const stationId    = sessie.station.id;
    const patrouilleId = patrouille.patrouille_id;
    const puntsModus   = sessie.moment.aankomst_punten_modus;
    const db           = require('../config/db');

    // Controleer of al op post of al vertrokken
    const [[bestaand]] = await db.execute(
      `SELECT id AS bezoek_id, status FROM patrouille_bezoeken
       WHERE jurymoment_id=? AND station_id=? AND patrouille_id=?`,
      [momentId, stationId, patrouilleId]
    );

    if (bestaand?.status === 'vertrokken') {
      return res.status(409).json({ message: 'Patrouille is al afgemeld bij dit station', al_vertrokken: true });
    }

    // ── Tocht: route-validatie ────────────────────────────────────
    let isStartPositie  = false;
    let isHerhaalBezoek = false;
    let tochtRoute      = null;
    let huidigPositie   = null;
    let huidigPositieIdx = -1;

    if (rallyType === 'tocht') {
      const route = await rallyModel.vindPatrouilleRoute(patrouilleId, momentId);
      tochtRoute = route;

      if (!route) return res.status(400).json({
        message: 'Geen route toegewezen. Vraag de organisator.',
      });

      const [bezoeken] = await db.execute(`
        SELECT station_id, status, terugkomst_tijd
        FROM patrouille_bezoeken
        WHERE patrouille_id=? AND jurymoment_id=?
      `, [patrouilleId, momentId]);

      const bezoekMap = {};
      for (const b of bezoeken) bezoekMap[b.station_id] = b;

      const eersteKeerGezien = {};
      let volgendePositie = null;

      for (let i = 0; i < route.stations.length; i++) {
        const pos      = route.stations[i];
        const eersteKeer = !eersteKeerGezien[pos.station_id];
        eersteKeerGezien[pos.station_id] = true;

        const b = bezoekMap[pos.station_id];
        // Voltooid = vertrokken (nieuw) of bezig/voltooid (oud systeem); niet op_post
        const voltooid = eersteKeer
          ? !!b && b.status !== 'op_post'
          : !!b?.terugkomst_tijd;

        if (!voltooid) {
          volgendePositie  = { ...pos, eersteKeer };
          huidigPositieIdx = i;
          break;
        }
      }

      if (!volgendePositie) return res.status(400).json({
        message: 'Alle posten al bezocht.',
        klaar: true,
      });

      if (volgendePositie.station_id !== stationId) return res.status(400).json({
        message: `Dit is niet jouw volgende post. Ga eerst naar: ${volgendePositie.naam}`,
        volgende_post: volgendePositie.naam,
      });

      huidigPositie  = volgendePositie;
      isStartPositie = !!volgendePositie.is_start && volgendePositie.eersteKeer;
      isHerhaalBezoek = !volgendePositie.eersteKeer;
    }

    // ── Tijdslimiet ───────────────────────────────────────────────
    const maxDuur = sessie.moment.max_duur_minuten;
    let eindTijdPatrouille = null;

    if (maxDuur && rallyType === 'tocht' && !isStartPositie) {
      const [[startRij]] = await db.execute(
        `SELECT MIN(aankomst_tijd) AS start_scan FROM patrouille_bezoeken
         WHERE patrouille_id=? AND jurymoment_id=?`,
        [patrouilleId, momentId]
      );
      if (startRij?.start_scan) {
        const startMs = new Date(startRij.start_scan).getTime();
        eindTijdPatrouille = new Date(startMs + maxDuur * 60_000);
        if (Date.now() > eindTijdPatrouille.getTime()) {
          const eindStr = eindTijdPatrouille.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
          return res.status(403).json({
            message: `Tijd verstreken. De rally eindigde om ${eindStr}.`,
            tijd_verstreken: true,
          });
        }
      }
    }

    // ── Aankomstpunten ────────────────────────────────────────────
    let punten = 0;
    const magScoren = rallyType !== 'tocht' || !isStartPositie;

    if (magScoren && puntsModus !== 'geen') {
      if (puntsModus === 'per_station') {
        punten = (huidigPositie?.station_punten ?? sessie.station.punten) ?? 0;

      } else if (puntsModus === 'per_bezoek') {
        const puntenLijst = await rallyModel.voortgangPuntenVoorMoment(momentId);
        if (rallyType === 'tocht' && huidigPositie && tochtRoute) {
          const eersteKeerTmp = {};
          let bezoekNr = 0;
          for (let i = 0; i <= huidigPositieIdx; i++) {
            const p = tochtRoute.stations[i];
            const ek = !eersteKeerTmp[p.station_id];
            eersteKeerTmp[p.station_id] = true;
            if (!(p.is_start && ek)) bezoekNr++;
          }
          const rij = puntenLijst.find(r => r.bezoek_nr === bezoekNr);
          punten = rij ? Number(rij.punten) : 0;
        } else {
          const aantalBezocht = await rallyModel.telBezoeken(momentId, patrouilleId);
          const rij = puntenLijst.find(r => r.bezoek_nr === aantalBezocht + 1);
          punten = rij ? Number(rij.punten) : 0;
        }

      } else if (puntsModus === 'per_positie') {
        const aantalVoor = isHerhaalBezoek
          ? await rallyModel.telTerugkomstenBijStation(momentId, stationId)
          : await rallyModel.telAankomstenBijStation(momentId, stationId);
        const puntenLijst = await rallyModel.aankomstPuntenVoorMoment(momentId);
        const rij = puntenLijst.find(p => p.positie === aantalVoor + 1);
        punten = rij ? Number(rij.punten) : 0;
      }
    }

    // ── Startpost: direct verwerken en stoppen ────────────────────
    if (isStartPositie) {
      if (!bestaand) {
        await rallyModel.registreerStartpost(momentId, stationId, patrouilleId);
      }
      const startTijd = new Date();
      if (maxDuur) eindTijdPatrouille = new Date(startTijd.getTime() + maxDuur * 60_000);

      return res.json({
        is_start_positie: true,
        patrouille: { id: patrouilleId, nummer: patrouille.nummer },
        station:    { naam: sessie.station.naam, categorie_naam: sessie.categorie_naam },
        start_tijd:          startTijd.toISOString(),
        eind_tijd_patrouille: eindTijdPatrouille?.toISOString() ?? null,
      });
    }

    // ── Bezoek registreren ────────────────────────────────────────
    let bezoek;
    if (bestaand) {
      // Patrouille al aanwezig (re-scan) → bestaand record teruggeven
      bezoek = { id: bestaand.bezoek_id, status: bestaand.status };
    } else if (isHerhaalBezoek) {
      bezoek = await rallyModel.registreerTerugkomst(momentId, stationId, patrouilleId, null);
    } else {
      bezoek = await rallyModel.registreerAankomstOpPost(momentId, stationId, patrouilleId, null);
    }

    // ── Aankomstpunten opslaan ────────────────────────────────────
    const juryModel = require('../models/jury.model');
    if (punten > 0 && patrouille.subkamp_id) {
      const [aankomstCrit] = await db.execute(
        `SELECT criterium_id AS id FROM rally_station_criteria
         WHERE station_id=? AND is_aankomst=1`,
        [stationId]
      );
      for (const cr of aankomstCrit) {
        await juryModel.slaScoreOpIgnore(momentId, patrouille.subkamp_id, patrouilleId, cr.id, punten);
      }
    }

    // ── Scoreformulier opbouwen ───────────────────────────────────
    const [stationCriteria] = await db.execute(`
      SELECT rsc.criterium_id AS id, rsc.volgorde,
             ec.naam, ec.omschrijving, ec.invoer_type, ec.max_score, ec.min_score,
             es.naam AS subcategorie
      FROM rally_station_criteria rsc
      JOIN editie_criteria ec ON ec.id = rsc.criterium_id
      JOIN editie_subcategorieen es ON es.id = ec.subcategorie_id
      WHERE rsc.station_id = ? AND rsc.is_aankomst = 0
      ORDER BY rsc.volgorde, ec.naam
    `, [stationId]);

    const [scores] = await db.execute(
      `SELECT criterium_id, score FROM jury_scores WHERE jurymoment_id=? AND patrouille_id=?`,
      [momentId, patrouilleId]
    );
    const scoreMap = Object.fromEntries(scores.map(s => [s.criterium_id, Number(s.score)]));

    const scoreFormData = stationCriteria.map(cr => ({
      id:           cr.id,
      naam:         cr.naam,
      omschrijving: cr.omschrijving || null,
      invoer_type:  cr.invoer_type || 'getal',
      min_score:    Number(cr.min_score ?? 0),
      max_score:    Number(cr.max_score ?? 10),
      subcategorie: cr.subcategorie,
      huidige_score: scoreMap[cr.id] ?? null,
    }));

    res.json({
      bezoek_id:        bezoek?.id,
      al_aanwezig:      !!bestaand,
      is_start_positie: false,
      aankomst_punten:  punten,
      eind_tijd_patrouille: eindTijdPatrouille?.toISOString() ?? null,
      patrouille: {
        id:     patrouilleId,
        nummer: patrouille.nummer,
      },
      station: {
        id:             stationId,
        naam:           sessie.station.naam,
        categorie_naam: sessie.categorie_naam,
        moment_id:      momentId,
      },
      rally_type:   rallyType,
      scoreFormData,
    });
  } catch (e) {
    console.error('[rally:patrouille-aankomst]', e.message);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/rally/patrouille-vertrek
// Sla scores op + zet patrouille op 'vertrokken'
// Body: { bezoek_id, patrouille_id, scores: [{criterium_id, score}] }
router.post('/patrouille-vertrek', async (req, res) => {
  const sessieToken = getSessieToken(req);
  if (!sessieToken) return res.status(401).json({ message: 'Geen actieve sessie' });

  const { bezoek_id, patrouille_id, scores } = req.body || {};
  if (!bezoek_id || !patrouille_id) return res.status(400).json({ message: 'bezoek_id en patrouille_id verplicht' });

  try {
    const sessie = await rallyModel.valideerStationSessie(sessieToken);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen' });
    }

    // Scores opslaan indien meegegeven
    if (Array.isArray(scores) && scores.length) {
      const subkampId = await rallyModel.vindSubkampPatrouille(
        Number(patrouille_id), sessie.moment.editie_id
      );
      if (subkampId) {
        const juryModel = require('../models/jury.model');
        for (const s of scores) {
          if (s.criterium_id == null || s.score == null) continue;
          await juryModel.slaScoreOp(sessie.moment.id, subkampId, Number(patrouille_id), s.criterium_id, s.score);
        }
      }
    }

    await rallyModel.zetVertrokken(Number(bezoek_id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/rally/sessie-score
// Scores opslaan zonder vertrekken (cookie-gebaseerd)
// Body: { patrouille_id, scores: [{criterium_id, score}] }
router.post('/sessie-score', async (req, res) => {
  const sessieToken = getSessieToken(req);
  if (!sessieToken) return res.status(401).json({ message: 'Geen actieve sessie' });

  const { patrouille_id, scores } = req.body || {};
  if (!patrouille_id || !Array.isArray(scores))
    return res.status(400).json({ message: 'patrouille_id en scores verplicht' });

  try {
    const sessie = await rallyModel.valideerStationSessie(sessieToken);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen' });
    }

    const subkampId = await rallyModel.vindSubkampPatrouille(
      Number(patrouille_id), sessie.moment.editie_id
    );
    if (!subkampId)
      return res.status(400).json({ message: 'Patrouille heeft nog geen subkamp toegewezen' });

    const juryModel = require('../models/jury.model');
    for (const s of scores) {
      if (s.criterium_id == null || s.score == null) continue;
      await juryModel.slaScoreOp(sessie.moment.id, subkampId, Number(patrouille_id), s.criterium_id, s.score);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/rally/patrouille-info/:token
// Zelf-scan: geen station-sessie → toon info voor de patrouille zelf
router.get('/patrouille-info/:token', async (req, res) => {
  try {
    const info = await rallyModel.patrouilleInfoVoorToken(req.params.token);
    if (!info) return res.status(404).json({ message: 'Ongeldig patrouille token' });
    res.json(info);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/rally/bezoek-formulier
// Scoreformulier ophalen voor een bestaand bezoek (vanuit de patrouillelijst)
// Body: { bezoek_id, patrouille_id }
router.post('/bezoek-formulier', async (req, res) => {
  const sessieToken = getSessieToken(req);
  if (!sessieToken) return res.status(401).json({ message: 'Geen actieve sessie' });

  const { bezoek_id, patrouille_id } = req.body || {};
  if (!bezoek_id || !patrouille_id) return res.status(400).json({ message: 'bezoek_id en patrouille_id verplicht' });

  try {
    const sessie = await rallyModel.valideerStationSessie(sessieToken);
    if (!sessie) {
      res.clearCookie(SESSIE_COOKIE, { path: '/' });
      return res.status(401).json({ message: 'Sessie verlopen' });
    }

    const db = require('../config/db');

    // Bezoek ophalen + valideren (hoort bij dit station)
    const [[bezoek]] = await db.execute(
      `SELECT id, patrouille_id, status FROM patrouille_bezoeken
       WHERE id=? AND station_id=? AND jurymoment_id=?`,
      [Number(bezoek_id), sessie.station.id, sessie.moment.id]
    );
    if (!bezoek) return res.status(404).json({ message: 'Bezoek niet gevonden bij dit station' });

    // Patrouille nummer ophalen
    const [plRows] = await db.execute(
      `SELECT cellen FROM plattegronden WHERE editie_id=?`, [sessie.moment.editie_id]
    );
    const cellen = plRows[0]?.cellen
      ? (typeof plRows[0].cellen === 'string' ? JSON.parse(plRows[0].cellen) : plRows[0].cellen)
      : {};
    let nummer = null;
    Object.values(cellen).forEach(cel => {
      if (Number(cel.patrouille_id) === Number(patrouille_id)) {
        nummer = cel.nummer ?? cel.patrouilleNummer ?? null;
      }
    });

    // Station-criteria ophalen (geen aankomst-criteria)
    const [stationCriteria] = await db.execute(`
      SELECT rsc.criterium_id AS id, rsc.volgorde,
             ec.naam, ec.omschrijving, ec.invoer_type, ec.max_score, ec.min_score,
             es.naam AS subcategorie
      FROM rally_station_criteria rsc
      JOIN editie_criteria ec ON ec.id = rsc.criterium_id
      JOIN editie_subcategorieen es ON es.id = ec.subcategorie_id
      WHERE rsc.station_id=? AND rsc.is_aankomst=0
      ORDER BY rsc.volgorde, ec.naam
    `, [sessie.station.id]);

    // Bestaande scores
    const [scores] = await db.execute(
      `SELECT criterium_id, score FROM jury_scores WHERE jurymoment_id=? AND patrouille_id=?`,
      [sessie.moment.id, Number(patrouille_id)]
    );
    const scoreMap = Object.fromEntries(scores.map(s => [s.criterium_id, Number(s.score)]));

    const scoreFormData = stationCriteria.map(cr => ({
      id:           cr.id,
      naam:         cr.naam,
      omschrijving: cr.omschrijving || null,
      invoer_type:  cr.invoer_type || 'getal',
      min_score:    Number(cr.min_score ?? 0),
      max_score:    Number(cr.max_score ?? 10),
      subcategorie: cr.subcategorie,
      huidige_score: scoreMap[cr.id] ?? null,
    }));

    res.json({
      bezoek_id:   Number(bezoek_id),
      al_aanwezig: true,
      aankomst_punten: 0,
      patrouille: { id: Number(patrouille_id), nummer },
      station: {
        id:             sessie.station.id,
        naam:           sessie.station.naam,
        categorie_naam: sessie.categorie_naam,
        moment_id:      sessie.moment.id,
      },
      rally_type:   sessie.rally_type,
      scoreFormData,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/rally/sessie-verlaten
// Verwijder sessie-cookie (wissel van station)
router.post('/sessie-verlaten', (req, res) => {
  res.clearCookie(SESSIE_COOKIE, { path: '/' });
  res.json({ ok: true });
});

module.exports = router;
