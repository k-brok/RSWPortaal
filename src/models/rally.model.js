// src/models/rally.model.js — Rally scan systeem: patrouille QR tokens + bezoeken

const db      = require('../config/db');
const crypto  = require('crypto');
const QRCode  = require('qrcode');

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ── Patrouille QR tokens ────────────────────────────────────────────

async function genereerPatrouilleTokens(editieId) {
  const [patrouilles] = await db.execute(
    `SELECT id FROM patrouilles WHERE editie_id = ?`, [editieId]
  );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of patrouilles) {
      const token = crypto.randomBytes(32).toString('hex');
      await conn.execute(
        `INSERT IGNORE INTO patrouille_qr_tokens (editie_id, patrouille_id, token)
         VALUES (?, ?, ?)`,
        [editieId, p.id, token]
      );
    }
    await conn.commit();
    return alleTokensVoorEditie(editieId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function alleTokensVoorEditie(editieId) {
  const [rows] = await db.execute(`
    SELECT pqt.id, pqt.token, pqt.patrouille_id,
           pl.cellen
    FROM patrouille_qr_tokens pqt
    JOIN patrouilles p ON p.id = pqt.patrouille_id
    LEFT JOIN plattegronden pl ON pl.editie_id = pqt.editie_id
    WHERE pqt.editie_id = ?
    ORDER BY p.id
  `, [editieId]);

  if (!rows.length) return [];

  const cellenRaw = rows[0]?.cellen;
  const cellen = cellenRaw
    ? (typeof cellenRaw === 'string' ? JSON.parse(cellenRaw) : cellenRaw)
    : {};
  const nummerMap = {};
  Object.values(cellen).forEach(cel => {
    if (cel.patrouille_id) {
      nummerMap[cel.patrouille_id] = cel.nummer ?? cel.patrouilleNummer ?? null;
    }
  });

  return Promise.all(rows.map(async r => {
    const url        = `${APP_URL()}/rally?patrouille=${r.token}`;
    const qr_dataurl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
    return {
      id:            r.id,
      token:         r.token,
      patrouille_id: r.patrouille_id,
      nummer:        nummerMap[r.patrouille_id] ?? null,
      url,
      qr_dataurl,
    };
  }));
}

async function vindPatrouilleToken(token) {
  const [rows] = await db.execute(`
    SELECT pqt.patrouille_id, pqt.editie_id,
           p.naam AS patrouille_naam
    FROM patrouille_qr_tokens pqt
    JOIN patrouilles p ON p.id = pqt.patrouille_id
    WHERE pqt.token = ?
  `, [token]);

  if (!rows[0]) return null;
  const r = rows[0];

  const [plRows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [r.editie_id]
  );
  const cellen = plRows[0]?.cellen
    ? (typeof plRows[0].cellen === 'string' ? JSON.parse(plRows[0].cellen) : plRows[0].cellen)
    : {};
  let nummer = null;
  let subkamp_id = null;
  Object.values(cellen).forEach(cel => {
    if (Number(cel.patrouille_id) === r.patrouille_id) {
      nummer     = cel.nummer ?? cel.patrouilleNummer ?? null;
      subkamp_id = cel.subkamp_id ?? null;
    }
  });

  return {
    patrouille_id: r.patrouille_id,
    editie_id:     r.editie_id,
    nummer,
    subkamp_id,
  };
}

// ── Rally stations ─────────────────────────────────────────────────

async function alleStations(momentId) {
  const [stations] = await db.execute(`
    SELECT rs.id, rs.naam, rs.token, rs.volgorde, rs.punten,
           COUNT(rsc.id) AS criteria_count
    FROM rally_stations rs
    LEFT JOIN rally_station_criteria rsc ON rsc.station_id = rs.id
    WHERE rs.jurymoment_id = ?
    GROUP BY rs.id
    ORDER BY rs.volgorde, rs.naam
  `, [momentId]);

  if (!stations.length) return [];

  const ids = stations.map(s => s.id);
  const ph  = ids.map(() => '?').join(',');
  const [crit] = await db.execute(`
    SELECT rsc.station_id, rsc.criterium_id, rsc.aankomst_punten, rsc.is_aankomst, rsc.volgorde,
           ec.naam AS criterium_naam, ec.max_score, ec.invoer_type,
           es.naam AS subcategorie_naam
    FROM rally_station_criteria rsc
    JOIN editie_criteria ec ON ec.id = rsc.criterium_id
    JOIN editie_subcategorieen es ON es.id = ec.subcategorie_id
    WHERE rsc.station_id IN (${ph})
    ORDER BY rsc.is_aankomst, rsc.volgorde, ec.naam
  `, ids);

  const critByStation = {};
  for (const c of crit) {
    if (!critByStation[c.station_id]) critByStation[c.station_id] = [];
    critByStation[c.station_id].push(c);
  }

  return Promise.all(stations.map(async s => {
    const url        = `${APP_URL()}/rally?station=${s.token}`;
    const qr_dataurl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
    return { ...s, criteria: critByStation[s.id] || [], url, qr_dataurl };
  }));
}

async function stationAanmaken({ jurymoment_id, naam, volgorde }) {
  const token = crypto.randomBytes(32).toString('hex');
  const [r] = await db.execute(
    `INSERT INTO rally_stations (jurymoment_id, naam, token, volgorde) VALUES (?,?,?,?)`,
    [jurymoment_id, naam.trim(), token, volgorde ?? 0]
  );
  return { id: r.insertId, token };
}

async function stationBijwerken(id, { naam, volgorde, punten }) {
  await db.execute(
    `UPDATE rally_stations SET naam=?, volgorde=?, punten=? WHERE id=?`,
    [naam.trim(), volgorde ?? 0, punten ?? null, id]
  );
}

async function stationVerwijderen(id) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM patrouille_bezoeken WHERE station_id=?`, [id]
  );
  if (n > 0) throw Object.assign(
    new Error('Station kan niet worden verwijderd: er zijn al bezoeken geregistreerd.'),
    { status: 409 }
  );
  const [r] = await db.execute('DELETE FROM rally_stations WHERE id=?', [id]);
  return r.affectedRows > 0;
}

async function criteriaInstellen(stationId, criteria) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM rally_station_criteria WHERE station_id=?', [stationId]);
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      await conn.execute(
        `INSERT INTO rally_station_criteria
           (station_id, criterium_id, aankomst_punten, is_aankomst, volgorde)
         VALUES (?,?,?,?,?)`,
        [stationId, c.criterium_id, c.aankomst_punten ?? 0, c.is_aankomst ? 1 : 0, c.volgorde ?? i]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Valideert station token — incl. rally_type van de categorie
async function vindStationToken(token) {
  const [rows] = await db.execute(`
    SELECT rs.id AS station_id, rs.naam AS station_naam, rs.jurymoment_id,
           rs.punten AS station_punten,
           jm.categorie_id, jm.editie_id, jm.rally_modus,
           jm.start_tijd, jm.eind_tijd, jm.handmatig_open, jm.naam AS moment_naam,
           jm.aankomst_punten_modus, jm.max_duur_minuten,
           ec.naam AS categorie_naam, ec.rally_type
    FROM rally_stations rs
    JOIN jurymomenten jm ON jm.id = rs.jurymoment_id
    JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE rs.token = ?
  `, [token]);
  if (!rows[0]) return null;

  const r = rows[0];
  const [criteria] = await db.execute(`
    SELECT rsc.criterium_id AS id, rsc.aankomst_punten, rsc.is_aankomst, rsc.volgorde,
           ec.naam, ec.omschrijving, ec.invoer_type, ec.max_score, ec.min_score,
           ec.lager_is_beter, ec.scorerings_methode, ec.scorerings_config,
           es.naam AS subcategorie
    FROM rally_station_criteria rsc
    JOIN editie_criteria ec ON ec.id = rsc.criterium_id
    JOIN editie_subcategorieen es ON es.id = ec.subcategorie_id
    WHERE rsc.station_id = ?
    ORDER BY rsc.is_aankomst, rsc.volgorde, ec.naam
  `, [r.station_id]);

  return {
    station: {
      id:     r.station_id,
      naam:   r.station_naam,
      punten: r.station_punten != null ? Number(r.station_punten) : null,
    },
    moment: {
      id:                    r.jurymoment_id,
      editie_id:             r.editie_id,
      categorie_id:          r.categorie_id,
      start_tijd:            r.start_tijd,
      eind_tijd:             r.eind_tijd,
      handmatig_open:        !!r.handmatig_open,
      naam:                  r.moment_naam,
      rally_modus:           !!r.rally_modus,
      aankomst_punten_modus: r.aankomst_punten_modus || 'geen',
      max_duur_minuten:      r.max_duur_minuten != null ? Number(r.max_duur_minuten) : null,
    },
    rally_type:     r.rally_type ?? null,
    categorie_naam: r.categorie_naam,
    criteria,
  };
}

// ── Routes (tocht) ─────────────────────────────────────────────────

async function alleRoutes(jurymomentId) {
  const [routes] = await db.execute(
    `SELECT id, naam FROM rally_routes WHERE jurymoment_id = ? ORDER BY naam`,
    [jurymomentId]
  );
  if (!routes.length) return [];

  const ids = routes.map(r => r.id);
  const ph  = ids.map(() => '?').join(',');
  const [rrs] = await db.execute(`
    SELECT rrs.route_id, rrs.station_id, rrs.volgorde, rrs.is_start, rs.naam AS station_naam
    FROM rally_route_stations rrs
    JOIN rally_stations rs ON rs.id = rrs.station_id
    WHERE rrs.route_id IN (${ph})
    ORDER BY rrs.route_id, rrs.volgorde
  `, ids);

  // Aantal patrouilles per route
  const [toewijzingen] = await db.execute(
    `SELECT route_id, COUNT(*) AS n FROM patrouille_routes WHERE route_id IN (${ph}) GROUP BY route_id`,
    ids
  );
  const patCount = Object.fromEntries(toewijzingen.map(t => [t.route_id, Number(t.n)]));

  const stByRoute = {};
  for (const rr of rrs) {
    if (!stByRoute[rr.route_id]) stByRoute[rr.route_id] = [];
    stByRoute[rr.route_id].push({ station_id: rr.station_id, naam: rr.station_naam, volgorde: rr.volgorde, is_start: !!rr.is_start });
  }

  return routes.map(r => ({
    ...r,
    stations:         stByRoute[r.id] || [],
    patrouille_count: patCount[r.id]  || 0,
  }));
}

async function routeAanmaken(jurymomentId, naam) {
  const [r] = await db.execute(
    `INSERT INTO rally_routes (jurymoment_id, naam) VALUES (?,?)`,
    [jurymomentId, naam.trim()]
  );
  return { id: r.insertId, naam: naam.trim(), stations: [], patrouille_count: 0 };
}

async function routeBijwerken(routeId, naam) {
  await db.execute(`UPDATE rally_routes SET naam=? WHERE id=?`, [naam.trim(), routeId]);
}

async function routeVerwijderen(routeId) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM patrouille_routes WHERE route_id=?`, [routeId]
  );
  if (n > 0) throw Object.assign(
    new Error('Route kan niet worden verwijderd: er zijn patrouilles aan gekoppeld.'),
    { status: 409 }
  );
  await db.execute(`DELETE FROM rally_routes WHERE id=?`, [routeId]);
}

// Stel de volgorde van stations in voor een route (vervangt bestaande volgorde)
// stations = [{station_id, is_start}]
async function routeStationsInstellen(routeId, stations) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM rally_route_stations WHERE route_id=?`, [routeId]);
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      await conn.execute(
        `INSERT INTO rally_route_stations (route_id, station_id, volgorde, is_start) VALUES (?,?,?,?)`,
        [routeId, s.station_id, i + 1, s.is_start ? 1 : 0]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Patrouille-route toewijzing ────────────────────────────────────

// Wijs een patrouille toe aan een route (verwijdert eventuele vorige toewijzing voor dit moment)
async function patrouilleToewijzenRoute(patrouilleId, routeId) {
  // Zoek het jurymoment van deze route om oude toewijzingen te kunnen verwijderen
  const [[route]] = await db.execute(
    `SELECT jurymoment_id FROM rally_routes WHERE id=?`, [routeId]
  );
  if (!route) throw Object.assign(new Error('Route niet gevonden'), { status: 404 });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Verwijder eventuele bestaande toewijzing voor hetzelfde moment
    await conn.execute(`
      DELETE pr FROM patrouille_routes pr
      JOIN rally_routes rr ON rr.id = pr.route_id
      WHERE pr.patrouille_id = ? AND rr.jurymoment_id = ?
    `, [patrouilleId, route.jurymoment_id]);
    // Voeg nieuwe toewijzing toe
    await conn.execute(
      `INSERT INTO patrouille_routes (patrouille_id, route_id) VALUES (?,?)`,
      [patrouilleId, routeId]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function patrouilleRouteVerwijderen(patrouilleId, jurymomentId) {
  await db.execute(`
    DELETE pr FROM patrouille_routes pr
    JOIN rally_routes rr ON rr.id = pr.route_id
    WHERE pr.patrouille_id = ? AND rr.jurymoment_id = ?
  `, [patrouilleId, jurymomentId]);
}

// Geeft de route + geordende stations terug voor een patrouille in een moment
async function vindPatrouilleRoute(patrouilleId, jurymomentId) {
  const [rows] = await db.execute(`
    SELECT rr.id AS route_id, rr.naam AS route_naam,
           rrs.station_id, rrs.volgorde, rrs.is_start, rs.naam AS station_naam,
           rs.punten AS station_punten
    FROM patrouille_routes pr
    JOIN rally_routes rr ON rr.id = pr.route_id
    LEFT JOIN rally_route_stations rrs ON rrs.route_id = rr.id
    LEFT JOIN rally_stations rs ON rs.id = rrs.station_id
    WHERE pr.patrouille_id = ? AND rr.jurymoment_id = ?
    ORDER BY rrs.volgorde
  `, [patrouilleId, jurymomentId]);

  if (!rows.length || !rows[0].route_id) return null;

  return {
    route_id:   rows[0].route_id,
    route_naam: rows[0].route_naam,
    stations:   rows
      .filter(r => r.station_id)
      .map(r => ({
        station_id:    r.station_id,
        naam:          r.station_naam,
        volgorde:      r.volgorde,
        is_start:      !!r.is_start,
        station_punten: r.station_punten != null ? Number(r.station_punten) : null,
      })),
  };
}

// Alle patrouille-toewijzingen voor een moment
async function allePatrouilleRoutes(jurymomentId) {
  const [rows] = await db.execute(`
    SELECT pr.patrouille_id, pr.route_id, rr.naam AS route_naam
    FROM patrouille_routes pr
    JOIN rally_routes rr ON rr.id = pr.route_id
    WHERE rr.jurymoment_id = ?
  `, [jurymomentId]);
  return rows;
}

// ── Aankomstpunten per positie (tocht) ────────────────────────────

async function aankomstPuntenVoorMoment(jurymomentId) {
  const [rows] = await db.execute(
    `SELECT positie, punten FROM rally_aankomst_punten
     WHERE jurymoment_id = ? ORDER BY positie`,
    [jurymomentId]
  );
  return rows; // [{positie, punten}, ...]
}

async function aankomstPuntenInstellen(jurymomentId, puntenLijst) {
  // puntenLijst = [{positie: 1, punten: 10}, {positie: 2, punten: 7}, ...]
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM rally_aankomst_punten WHERE jurymoment_id=?`, [jurymomentId]
    );
    for (const p of puntenLijst) {
      if (p.punten > 0) {
        await conn.execute(
          `INSERT INTO rally_aankomst_punten (jurymoment_id, positie, punten) VALUES (?,?,?)`,
          [jurymomentId, p.positie, p.punten]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Voortgang punten per bezoek-nr ────────────────────────────────

async function voortgangPuntenVoorMoment(jurymomentId) {
  const [rows] = await db.execute(
    `SELECT bezoek_nr, punten FROM rally_voortgang_punten
     WHERE jurymoment_id = ? ORDER BY bezoek_nr`,
    [jurymomentId]
  );
  return rows;
}

async function voortgangPuntenInstellen(jurymomentId, puntenLijst) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM rally_voortgang_punten WHERE jurymoment_id=?`, [jurymomentId]);
    for (const p of puntenLijst) {
      if (p.punten > 0) {
        await conn.execute(
          `INSERT INTO rally_voortgang_punten (jurymoment_id, bezoek_nr, punten) VALUES (?,?,?)`,
          [jurymomentId, p.bezoek_nr, p.punten]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Bezoeken ───────────────────────────────────────────────────────

async function registreerBezoek(jurymomentId, stationId, patrouilleId, aankomstPositie = null) {
  await db.execute(
    `INSERT IGNORE INTO patrouille_bezoeken
       (jurymoment_id, station_id, patrouille_id, aankomst_positie)
     VALUES (?, ?, ?, ?)`,
    [jurymomentId, stationId, patrouilleId, aankomstPositie]
  );
  const [rows] = await db.execute(
    `SELECT * FROM patrouille_bezoeken WHERE station_id=? AND patrouille_id=?`,
    [stationId, patrouilleId]
  );
  return rows[0] ?? null;
}

// Startpost terugkomst registreren (rondje-route): UPDATE bestaand bezoek
async function registreerTerugkomst(jurymomentId, stationId, patrouilleId, aankomstPositie = null) {
  await db.execute(
    `UPDATE patrouille_bezoeken
     SET terugkomst_tijd = NOW(), aankomst_positie = COALESCE(aankomst_positie, ?)
     WHERE station_id=? AND patrouille_id=? AND terugkomst_tijd IS NULL`,
    [aankomstPositie, stationId, patrouilleId]
  );
  const [rows] = await db.execute(
    `SELECT * FROM patrouille_bezoeken WHERE station_id=? AND patrouille_id=?`,
    [stationId, patrouilleId]
  );
  return rows[0] ?? null;
}

// Tel het aantal patrouilles dat al is aangekomen bij dit station in dit moment
// (exclusief de huidige patrouille — use BEFORE registreerBezoek)
async function telAankomstenBijStation(jurymomentId, stationId) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM patrouille_bezoeken
     WHERE jurymoment_id=? AND station_id=?`,
    [jurymomentId, stationId]
  );
  return Number(n);
}

// Tel aantal terugkomsten bij de startpost (voor per_positie modus op circulaire routes)
async function telTerugkomstenBijStation(jurymomentId, stationId) {
  const [[{ n }]] = await db.execute(
    `SELECT COUNT(*) AS n FROM patrouille_bezoeken
     WHERE jurymoment_id=? AND station_id=? AND terugkomst_tijd IS NOT NULL`,
    [jurymomentId, stationId]
  );
  return Number(n);
}

// Tel het aantal bezoeken voor een patrouille in dit moment (voor per_bezoek modus, spelmiddag)
async function telBezoeken(jurymomentId, patrouilleId) {
  const [[{ n }]] = await db.execute(`
    SELECT COUNT(*) AS n
    FROM patrouille_bezoeken
    WHERE jurymoment_id=? AND patrouille_id=?
  `, [jurymomentId, patrouilleId]);
  return Number(n);
}

async function zetBezoekBezig(stationId, patrouilleId) {
  await db.execute(
    `UPDATE patrouille_bezoeken SET status='bezig'
     WHERE station_id=? AND patrouille_id=? AND status='aangekomen'`,
    [stationId, patrouilleId]
  );
}

async function vindSubkampPatrouille(patrouilleId, editieId) {
  const [rows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [editieId]
  );
  const cellen = rows[0]?.cellen
    ? (typeof rows[0].cellen === 'string' ? JSON.parse(rows[0].cellen) : rows[0].cellen)
    : {};
  for (const cel of Object.values(cellen)) {
    if (Number(cel.patrouille_id) === patrouilleId) return cel.subkamp_id ?? null;
  }
  return null;
}

// ── Station sessies (httpOnly cookie) ─────────────────────────────

const SESSIE_DUUR_MS = 60 * 60 * 1000; // 1 uur

async function maakStationSessie(stationId) {
  // Verwijder verlopen sessies voor dit station (lazy cleanup)
  await db.execute(
    `DELETE FROM rally_station_sessies WHERE verlopen_op < NOW()`
  );

  const token     = crypto.randomBytes(32).toString('hex');
  const verlopen  = new Date(Date.now() + SESSIE_DUUR_MS);
  await db.execute(
    `INSERT INTO rally_station_sessies (station_id, sessie_token, verlopen_op)
     VALUES (?, ?, ?)`,
    [stationId, token, verlopen]
  );
  return { token, verlopen_op: verlopen.toISOString() };
}

async function valideerStationSessie(sessieToken) {
  if (!sessieToken) return null;
  const [rows] = await db.execute(
    `SELECT rss.station_id, rss.verlopen_op,
            rs.naam AS station_naam, rs.jurymoment_id, rs.punten AS station_punten,
            jm.editie_id, jm.categorie_id, jm.naam AS moment_naam,
            jm.start_tijd, jm.eind_tijd, jm.handmatig_open,
            jm.aankomst_punten_modus, jm.max_duur_minuten, jm.rally_modus,
            ec.naam AS categorie_naam, ec.rally_type
     FROM rally_station_sessies rss
     JOIN rally_stations rs ON rs.id = rss.station_id
     JOIN jurymomenten jm   ON jm.id = rs.jurymoment_id
     JOIN editie_categorieen ec ON ec.id = jm.categorie_id
     WHERE rss.sessie_token = ? AND rss.verlopen_op > NOW()`,
    [sessieToken]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    station: {
      id:     r.station_id,
      naam:   r.station_naam,
      punten: r.station_punten != null ? Number(r.station_punten) : null,
    },
    moment: {
      id:                    r.jurymoment_id,
      editie_id:             r.editie_id,
      categorie_id:          r.categorie_id,
      naam:                  r.moment_naam,
      start_tijd:            r.start_tijd,
      eind_tijd:             r.eind_tijd,
      handmatig_open:        !!r.handmatig_open,
      rally_modus:           !!r.rally_modus,
      aankomst_punten_modus: r.aankomst_punten_modus || 'geen',
      max_duur_minuten:      r.max_duur_minuten != null ? Number(r.max_duur_minuten) : null,
    },
    rally_type:     r.rally_type ?? null,
    categorie_naam: r.categorie_naam,
    verlopen_op:    r.verlopen_op,
  };
}

// Patrouilles die momenteel 'op_post' zijn bij een station (voor de landingspagina)
async function patrouillesOpPost(momentId, stationId, editieId) {
  const [bezoeken] = await db.execute(`
    SELECT pb.id AS bezoek_id, pb.patrouille_id, pb.status, pb.aankomst_tijd
    FROM patrouille_bezoeken pb
    WHERE pb.jurymoment_id = ? AND pb.station_id = ?
      AND pb.status = 'op_post'
    ORDER BY pb.aankomst_tijd
  `, [momentId, stationId]);

  if (!bezoeken.length) return [];

  const [plRows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [editieId]
  );
  const cellen = plRows[0]?.cellen
    ? (typeof plRows[0].cellen === 'string' ? JSON.parse(plRows[0].cellen) : plRows[0].cellen)
    : {};

  const nummerMap = {};
  Object.values(cellen).forEach(cel => {
    if (cel.patrouille_id) {
      nummerMap[cel.patrouille_id] = cel.nummer ?? cel.patrouilleNummer ?? null;
    }
  });

  return bezoeken.map(b => ({
    bezoek_id:    b.bezoek_id,
    patrouille_id: b.patrouille_id,
    nummer:       nummerMap[b.patrouille_id] ?? null,
    aankomst_tijd: b.aankomst_tijd,
  }));
}

// Registreer startpost: aankomst + direct vertrekken (timer-start, geen op-post)
async function registreerStartpost(momentId, stationId, patrouilleId) {
  await db.execute(
    `INSERT IGNORE INTO patrouille_bezoeken
       (jurymoment_id, station_id, patrouille_id, status, vertrek_tijd)
     VALUES (?, ?, ?, 'vertrokken', NOW())`,
    [momentId, stationId, patrouilleId]
  );
  const [rows] = await db.execute(
    `SELECT * FROM patrouille_bezoeken WHERE station_id=? AND patrouille_id=?`,
    [stationId, patrouilleId]
  );
  return rows[0] ?? null;
}

// Registreer aankomst van een patrouille op post (nieuwe sessie-gebaseerde flow)
async function registreerAankomstOpPost(momentId, stationId, patrouilleId, aankomstPositie) {
  // INSERT IGNORE zodat dubbele scans geen fout geven
  await db.execute(
    `INSERT IGNORE INTO patrouille_bezoeken
       (jurymoment_id, station_id, patrouille_id, aankomst_positie, status)
     VALUES (?, ?, ?, ?, 'op_post')`,
    [momentId, stationId, patrouilleId, aankomstPositie ?? null]
  );
  const [rows] = await db.execute(
    `SELECT * FROM patrouille_bezoeken WHERE station_id=? AND patrouille_id=?`,
    [stationId, patrouilleId]
  );
  return rows[0] ?? null;
}

// Bezoek + bestaande scores ophalen (voor heropenen vanuit de lijst)
async function patrouilleBezoekMetScores(momentId, stationId, patrouilleId) {
  const [rows] = await db.execute(
    `SELECT id AS bezoek_id, status, aankomst_tijd
     FROM patrouille_bezoeken
     WHERE jurymoment_id=? AND station_id=? AND patrouille_id=?`,
    [momentId, stationId, patrouilleId]
  );
  if (!rows[0]) return null;

  const bezoek = rows[0];
  const [scores] = await db.execute(
    `SELECT criterium_id, score FROM jury_scores
     WHERE jurymoment_id=? AND patrouille_id=?`,
    [momentId, patrouilleId]
  );
  return {
    ...bezoek,
    scores: Object.fromEntries(scores.map(s => [s.criterium_id, Number(s.score)])),
  };
}

// Patrouille afmelden van post (status → vertrokken)
async function zetVertrokken(bezoekId) {
  await db.execute(
    `UPDATE patrouille_bezoeken
     SET status='vertrokken', vertrek_tijd=NOW()
     WHERE id=? AND status='op_post'`,
    [bezoekId]
  );
}

// Patrouille-info voor zelf-scan (zonder station-sessie)
async function patrouilleInfoVoorToken(token) {
  const patrouille = await vindPatrouilleToken(token);
  if (!patrouille) return null;

  const { patrouille_id, nummer } = patrouille;

  // Haal het actieve rally-moment op (meest recente moment waar de patrouille een bezoek heeft)
  const [[momentRij]] = await db.execute(`
    SELECT jm.id AS moment_id, jm.max_duur_minuten, ec.rally_type
    FROM patrouille_bezoeken pb
    JOIN jurymomenten jm        ON jm.id  = pb.jurymoment_id
    JOIN editie_categorieen ec  ON ec.id  = jm.categorie_id
    WHERE pb.patrouille_id = ?
    ORDER BY pb.aankomst_tijd DESC
    LIMIT 1
  `, [patrouille_id]).catch(() => [[]]);

  if (!momentRij) {
    // Patrouille heeft nog nooit een post bezocht
    return {
      patrouille:         { id: patrouille_id, nummer },
      huidig_post:        null,
      laatste_vertrek_post: null,
      volgende_post:      null,
      start_tijd:         null,
      eind_tijd:          null,
      tijd_resterend_sec: null,
      tijd_verstreken:    false,
    };
  }

  const momentId  = momentRij.moment_id;
  const maxDuur   = momentRij.max_duur_minuten;

  // Alle bezoeken van deze patrouille in dit moment
  const [bezoeken] = await db.execute(`
    SELECT pb.station_id, pb.status, pb.aankomst_tijd, pb.vertrek_tijd,
           rs.naam AS station_naam
    FROM patrouille_bezoeken pb
    JOIN rally_stations rs ON rs.id = pb.station_id
    WHERE pb.patrouille_id = ? AND pb.jurymoment_id = ?
    ORDER BY pb.aankomst_tijd
  `, [patrouille_id, momentId]);

  // Huidige post (op_post)
  const actief = bezoeken.find(b => b.status === 'op_post');
  const huidigPost = actief?.station_naam ?? null;

  // Laatste vertrokken post
  const vertrokkenBezoeken = bezoeken.filter(b => b.status === 'vertrokken' && b.vertrek_tijd);
  vertrokkenBezoeken.sort((a, b) => new Date(b.vertrek_tijd) - new Date(a.vertrek_tijd));
  const laatsteVertrekPost = vertrokkenBezoeken[0]?.station_naam ?? null;

  // Timer (start = MIN aankomst_tijd van alle bezoeken)
  let startTijd    = null;
  let eindTijd     = null;
  let tijdResterend  = null;
  let tijdVerstreken = false;

  if (bezoeken.length && maxDuur) {
    const startMs = Math.min(...bezoeken.map(b => new Date(b.aankomst_tijd).getTime()));
    startTijd = new Date(startMs).toISOString();
    const eindMs  = startMs + maxDuur * 60_000;
    eindTijd  = new Date(eindMs).toISOString();
    const resterendMs = eindMs - Date.now();
    tijdResterend  = Math.max(0, Math.round(resterendMs / 1000));
    tijdVerstreken = resterendMs <= 0;
  }

  // Volgende post bepalen (alleen bij tocht)
  let volgendePost = null;
  if (momentRij.rally_type === 'tocht') {
    const route = await vindPatrouilleRoute(patrouille_id, momentId);
    if (route) {
      const bezoekMap = Object.fromEntries(bezoeken.map(b => [b.station_id, b]));
      for (const pos of route.stations) {
        const b = bezoekMap[pos.station_id];
        const voltooid = !!b && b.status !== 'op_post';
        if (!voltooid) {
          if (!b) volgendePost = pos.naam;
          break;
        }
      }
    }
  }

  return {
    patrouille:           { id: patrouille_id, nummer },
    huidig_post:          huidigPost,
    laatste_vertrek_post: laatsteVertrekPost,
    volgende_post:        volgendePost,
    start_tijd:           startTijd,
    eind_tijd:            eindTijd,
    tijd_resterend_sec:   tijdResterend,
    tijd_verstreken:      tijdVerstreken,
  };
}

// ── Tracking overzicht ─────────────────────────────────────────────

async function trackingOverzicht(editieId) {
  // Rally momenten met type info
  const [momenten] = await db.execute(`
    SELECT jm.id AS moment_id, jm.naam AS moment_naam, jm.start_tijd,
           ec.naam AS categorie_naam, ec.rally_type
    FROM jurymomenten jm
    JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jm.editie_id = ? AND jm.rally_modus = 1
    ORDER BY jm.start_tijd
  `, [editieId]);

  // Alle rally stations voor deze editie
  const [stations] = await db.execute(`
    SELECT rs.id AS station_id, rs.naam AS station_naam, rs.volgorde,
           jm.id AS moment_id, jm.start_tijd,
           ec.naam AS categorie_naam, ec.rally_type
    FROM rally_stations rs
    JOIN jurymomenten jm ON jm.id = rs.jurymoment_id
    JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jm.editie_id = ? AND jm.rally_modus = 1
    ORDER BY jm.start_tijd, rs.volgorde, rs.naam
  `, [editieId]);

  // Patrouilles met nummers via plattegrond
  const [plRows] = await db.execute(
    `SELECT cellen FROM plattegronden WHERE editie_id = ?`, [editieId]
  );
  const cellen = plRows[0]?.cellen
    ? (typeof plRows[0].cellen === 'string' ? JSON.parse(plRows[0].cellen) : plRows[0].cellen)
    : {};

  const patrouilleInfo = {};
  Object.values(cellen).forEach(cel => {
    if (cel.patrouille_id) {
      patrouilleInfo[cel.patrouille_id] = {
        nummer: cel.nummer ?? cel.patrouilleNummer ?? null,
      };
    }
  });

  const patIds = Object.keys(patrouilleInfo).map(Number);
  let patrouilles = [];
  if (patIds.length) {
    const [pRows] = await db.execute(
      `SELECT id, naam FROM patrouilles WHERE id IN (${patIds.map(() => '?').join(',')})`,
      patIds
    );
    patrouilles = pRows
      .map(p => ({ ...p, ...patrouilleInfo[p.id] }))
      .sort((a, b) => (a.nummer ?? 9999) - (b.nummer ?? 9999));
  }

  // Bezoeken
  const stationIds = stations.map(s => s.station_id);
  let bezoeken = [];
  if (stationIds.length) {
    const ph = stationIds.map(() => '?').join(',');
    const [bRows] = await db.execute(
      `SELECT station_id, patrouille_id, status, aankomst_positie,
              aankomst_tijd, terugkomst_tijd, vertrek_tijd
       FROM patrouille_bezoeken WHERE station_id IN (${ph})`,
      stationIds
    );
    bezoeken = bRows;
  }

  const bezoekLookup = {};
  for (const b of bezoeken) {
    bezoekLookup[`${b.station_id}_${b.patrouille_id}`] = b;
  }

  // Routes per patrouille per moment (voor tocht-type)
  const momentIds = momenten.map(m => m.moment_id);
  let routeToewijzingen = [];
  if (momentIds.length) {
    const ph = momentIds.map(() => '?').join(',');
    const [rtRows] = await db.execute(`
      SELECT pr.patrouille_id, pr.route_id, rr.naam AS route_naam, rr.jurymoment_id
      FROM patrouille_routes pr
      JOIN rally_routes rr ON rr.id = pr.route_id
      WHERE rr.jurymoment_id IN (${ph})
    `, momentIds);
    routeToewijzingen = rtRows;
  }

  // Lookup: `${momentId}_${patrouilleId}` → route
  const routeLookup = {};
  for (const rt of routeToewijzingen) {
    routeLookup[`${rt.jurymoment_id}_${rt.patrouille_id}`] = rt;
  }

  // Route-station volgorde per moment (voor tocht tracking)
  const routeIds = [...new Set(routeToewijzingen.map(r => r.route_id))];
  let routeStations = [];
  if (routeIds.length) {
    const ph = routeIds.map(() => '?').join(',');
    const [rsRows] = await db.execute(`
      SELECT route_id, station_id, volgorde, is_start FROM rally_route_stations
      WHERE route_id IN (${ph}) ORDER BY route_id, volgorde
    `, routeIds);
    routeStations = rsRows;
  }
  const routeStationsLookup = {};
  for (const rs of routeStations) {
    if (!routeStationsLookup[rs.route_id]) routeStationsLookup[rs.route_id] = [];
    routeStationsLookup[rs.route_id].push(rs);
  }

  return {
    momenten,
    stations,
    patrouilles,
    bezoekLookup,
    routeLookup,
    routeStationsLookup,
  };
}

module.exports = {
  // Patrouille QR tokens
  genereerPatrouilleTokens,
  alleTokensVoorEditie,
  vindPatrouilleToken,
  // Rally stations
  alleStations,
  stationAanmaken,
  stationBijwerken,
  stationVerwijderen,
  criteriaInstellen,
  vindStationToken,
  // Routes (tocht)
  alleRoutes,
  routeAanmaken,
  routeBijwerken,
  routeVerwijderen,
  routeStationsInstellen,
  // Patrouille-route toewijzing
  patrouilleToewijzenRoute,
  patrouilleRouteVerwijderen,
  vindPatrouilleRoute,
  allePatrouilleRoutes,
  // Aankomstpunten per positie
  aankomstPuntenVoorMoment,
  aankomstPuntenInstellen,
  // Voortgang punten per bezoek-nr
  voortgangPuntenVoorMoment,
  voortgangPuntenInstellen,
  // Bezoeken
  registreerBezoek,
  registreerTerugkomst,
  telAankomstenBijStation,
  telTerugkomstenBijStation,
  telBezoeken,
  zetBezoekBezig,
  vindSubkampPatrouille,
  // Station sessies
  registreerStartpost,
  maakStationSessie,
  valideerStationSessie,
  patrouillesOpPost,
  registreerAankomstOpPost,
  patrouilleBezoekMetScores,
  zetVertrokken,
  patrouilleInfoVoorToken,
  // Tracking
  trackingOverzicht,
};
