// src/models/rally.model.js — Rally scan systeem: patrouille QR tokens + bezoeken

const db      = require('../config/db');
const crypto  = require('crypto');
const QRCode  = require('qrcode');

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ── Patrouille QR tokens ────────────────────────────────────────────

// Genereert tokens voor alle patrouilles die gekoppeld zijn aan de editie.
// INSERT IGNORE = bestaande tokens blijven ongewijzigd.
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

  // Bouw nummer-map uit plattegrond cellen
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

// Valideert patrouille token en geeft patrouille + editie info terug
async function vindPatrouilleToken(token) {
  const [rows] = await db.execute(`
    SELECT pqt.patrouille_id, pqt.editie_id,
           p.naam AS patrouille_naam, p.editie_id AS p_editie_id
    FROM patrouille_qr_tokens pqt
    JOIN patrouilles p ON p.id = pqt.patrouille_id
    WHERE pqt.token = ?
  `, [token]);

  if (!rows[0]) return null;
  const r = rows[0];

  // Nummer ophalen via plattegrond
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
    SELECT rs.id, rs.naam, rs.token, rs.volgorde,
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

async function stationBijwerken(id, { naam, volgorde }) {
  await db.execute(
    `UPDATE rally_stations SET naam=?, volgorde=? WHERE id=?`,
    [naam.trim(), volgorde ?? 0, id]
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

// Stel de criteria in voor een station (vervangt bestaande criteria volledig)
async function criteriaInstellen(stationId, criteria) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM rally_station_criteria WHERE station_id=?', [stationId]);
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      await conn.execute(
        `INSERT INTO rally_station_criteria (station_id, criterium_id, aankomst_punten, is_aankomst, volgorde)
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

// Valideert station token en geeft alle benodigde info voor het scoreformulier terug
async function vindStationToken(token) {
  const [rows] = await db.execute(`
    SELECT rs.id AS station_id, rs.naam AS station_naam, rs.jurymoment_id,
           jm.categorie_id, jm.editie_id, jm.rally_modus,
           jm.start_tijd, jm.eind_tijd, jm.handmatig_open, jm.naam AS moment_naam,
           ec.naam AS categorie_naam
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
    station:        { id: r.station_id, naam: r.station_naam },
    moment: {
      id:            r.jurymoment_id,
      editie_id:     r.editie_id,
      categorie_id:  r.categorie_id,
      start_tijd:    r.start_tijd,
      eind_tijd:     r.eind_tijd,
      handmatig_open: !!r.handmatig_open,
      naam:          r.moment_naam,
      rally_modus:   !!r.rally_modus,
    },
    categorie_naam: r.categorie_naam,
    criteria,
  };
}

// ── Bezoeken ───────────────────────────────────────────────────────

// Registreert aankomst van patrouille bij rally station.
// Bij dubbele scan: geef bestaand bezoek terug.
async function registreerBezoek(jurymomentId, stationId, patrouilleId) {
  await db.execute(
    `INSERT IGNORE INTO patrouille_bezoeken (jurymoment_id, station_id, patrouille_id)
     VALUES (?, ?, ?)`,
    [jurymomentId, stationId, patrouilleId]
  );
  const [rows] = await db.execute(
    `SELECT * FROM patrouille_bezoeken WHERE station_id=? AND patrouille_id=?`,
    [stationId, patrouilleId]
  );
  return rows[0] ?? null;
}


async function zetBezoekBezig(stationId, patrouilleId) {
  await db.execute(
    `UPDATE patrouille_bezoeken SET status='bezig'
     WHERE station_id=? AND patrouille_id=? AND status='aangekomen'`,
    [stationId, patrouilleId]
  );
}

// Zoek subkamp_id van een patrouille via de plattegrond-cellen
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

// Overzicht per patrouille: welke stations al bezocht
async function trackingOverzicht(editieId) {
  // Alle rally stations voor deze editie
  const [stations] = await db.execute(`
    SELECT rs.id AS station_id, rs.naam AS station_naam, rs.volgorde,
           jm.id AS moment_id, jm.start_tijd,
           ec.naam AS categorie_naam
    FROM rally_stations rs
    JOIN jurymomenten jm ON jm.id = rs.jurymoment_id
    JOIN editie_categorieen ec ON ec.id = jm.categorie_id
    WHERE jm.editie_id = ? AND jm.rally_modus = 1
    ORDER BY jm.start_tijd, rs.volgorde, rs.naam
  `, [editieId]);

  // Alle patrouilles met nummers via plattegrond
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

  // Bezoeken via station_id
  const stationIds = stations.map(s => s.station_id);
  let bezoeken = [];
  if (stationIds.length) {
    const ph = stationIds.map(() => '?').join(',');
    const [bRows] = await db.execute(
      `SELECT station_id, patrouille_id, status, aankomst_tijd, vertrek_tijd
       FROM patrouille_bezoeken WHERE station_id IN (${ph})`,
      stationIds
    );
    bezoeken = bRows;
  }

  // Lookup: `${stationId}_${patrouilleId}` → bezoek
  const bezoekLookup = {};
  for (const b of bezoeken) {
    bezoekLookup[`${b.station_id}_${b.patrouille_id}`] = b;
  }

  return { stations, patrouilles, bezoekLookup };
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
  // Bezoeken
  registreerBezoek,
  zetBezoekBezig,
  vindSubkampPatrouille,
  // Tracking
  trackingOverzicht,
};
