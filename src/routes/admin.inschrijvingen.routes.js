// src/routes/admin.inschrijvingen.routes.js — Inschrijvingen-beheer voor admin/organisator (geen fase-restrictie)

const router      = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const editieModel = require('../models/editie.model');
const patModel    = require('../models/patrouille.model');
const db          = require('../config/db');

const beheerder = requireRole('admin', 'organisator');

// ── Lezen ──────────────────────────────────────────────────────────

router.get('/', beheerder, async (req, res) => {
  try {
    const editie = req.query.editie_id
      ? await editieModel.vindOpId(Number(req.query.editie_id))
      : await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen editie gevonden' });
    const fase        = editieModel.bepaalFase(editie);
    const patrouilles = await patModel.allePatrouilles(editie.id);
    res.json({ editie, fase, patrouilles });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/patrouilles/:id', beheerder, async (req, res) => {
  try {
    const p = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });
    const editie = await editieModel.vindOpId(p.editie_id);
    if (editie?.lsw_datum) {
      p.deelnemers = p.deelnemers.map(d => ({
        ...d,
        leeftijd_lsw: patModel.berekenLeeftijd(d.geboortedatum, editie.lsw_datum),
      }));
    }
    res.json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Alias voor backwards compatibiliteit
router.get('/patrouille/:id', beheerder, async (req, res) => {
  req.params.id = req.params.id;
  try {
    const p = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });
    const editie = await editieModel.vindOpId(p.editie_id);
    if (editie?.lsw_datum) {
      p.deelnemers = p.deelnemers.map(d => ({
        ...d,
        leeftijd_lsw: patModel.berekenLeeftijd(d.geboortedatum, editie.lsw_datum),
      }));
    }
    res.json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Alle groepen (plat) voor groep-selector bij aanmaken patrouille
router.get('/groepen', beheerder, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT g.id, g.naam AS groep_naam,
             v.naam AS vereniging_naam, v.afkorting
      FROM groepen g
      JOIN verenigingen v ON v.id = g.vereniging_id
      ORDER BY v.naam, g.naam
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Patrouilles CRUD (geen fase-check) ────────────────────────────

router.post('/patrouilles', beheerder, async (req, res) => {
  const { editie_id, groep_id, naam, jongste } = req.body;
  if (!editie_id || !groep_id || !naam?.trim())
    return res.status(400).json({ message: 'editie_id, groep_id en naam zijn verplicht' });
  try {
    const p = await patModel.aanmaken({ editie_id, groep_id, naam, jongste: !!jongste });
    const editie = await editieModel.vindOpId(editie_id);
    if (editie) await patModel.herbereken(p.id, editie);
    res.status(201).json(await patModel.vindOpId(p.id));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/patrouilles/:id', beheerder, async (req, res) => {
  const { naam, jongste } = req.body;
  try {
    const huidig = await patModel.vindOpId(Number(req.params.id));
    if (!huidig) return res.status(404).json({ message: 'Niet gevonden' });
    const p = await patModel.bijwerken(Number(req.params.id), {
      naam:    naam?.trim() ?? huidig.naam,
      jongste: jongste !== undefined ? !!jongste : !!huidig.jongste,
    });
    res.json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/patrouilles/:id', beheerder, async (req, res) => {
  try {
    const ok = await patModel.verwijder(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Alias oud pad
router.delete('/patrouille/:id', beheerder, async (req, res) => {
  try {
    const ok = await patModel.verwijder(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Deelnemers CRUD (geen fase-check) ─────────────────────────────

router.post('/patrouilles/:id/deelnemers', beheerder, async (req, res) => {
  const { voornaam, achternaam, geboortedatum } = req.body;
  if (!voornaam?.trim() || !achternaam?.trim() || !geboortedatum)
    return res.status(400).json({ message: 'voornaam, achternaam en geboortedatum zijn verplicht' });
  try {
    const patrouilleId = Number(req.params.id);
    const d = await patModel.voegDeelnemerToe(patrouilleId, { voornaam, achternaam, geboortedatum });
    const p = await patModel.vindOpId(patrouilleId);
    const editie = await editieModel.vindOpId(p.editie_id);
    if (editie) await patModel.herbereken(patrouilleId, editie);
    res.status(201).json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/deelnemers/:id', beheerder, async (req, res) => {
  const { voornaam, achternaam, geboortedatum } = req.body;
  if (!voornaam?.trim() || !achternaam?.trim() || !geboortedatum)
    return res.status(400).json({ message: 'voornaam, achternaam en geboortedatum zijn verplicht' });
  try {
    const d = await patModel.bijwerkenDeelnemer(Number(req.params.id), { voornaam, achternaam, geboortedatum });
    if (!d) return res.status(404).json({ message: 'Niet gevonden' });
    const p = await patModel.vindOpId(d.patrouille_id);
    const editie = await editieModel.vindOpId(p.editie_id);
    if (editie) await patModel.herbereken(d.patrouille_id, editie);
    res.json(d);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.patch('/deelnemers/:id/functie', beheerder, async (req, res) => {
  const { functie } = req.body;
  if (functie && !['PL', 'APL'].includes(functie))
    return res.status(400).json({ message: 'functie moet PL, APL of leeg zijn' });
  try {
    const patId = await patModel.stelFunctieIn(Number(req.params.id), functie || null);
    if (patId == null) return res.status(404).json({ message: 'Niet gevonden' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.patch('/deelnemers/:id/verplaats', beheerder, async (req, res) => {
  const { patrouille_id } = req.body;
  if (!patrouille_id) return res.status(400).json({ message: 'patrouille_id vereist' });
  try {
    const result = await patModel.verplaatsDeelnemer(Number(req.params.id), Number(patrouille_id));
    if (!result) return res.status(404).json({ message: 'Deelnemer niet gevonden' });
    const oudePat = await patModel.vindOpId(result.oudePatrouilleId);
    const editie  = oudePat ? await editieModel.vindOpId(oudePat.editie_id) : null;
    if (editie) {
      await Promise.all([
        patModel.herbereken(result.oudePatrouilleId, editie),
        patModel.herbereken(result.nieuwePatrouilleId, editie),
      ]);
    }
    res.json(result);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/deelnemers/:id', beheerder, async (req, res) => {
  try {
    const patrouilleId = await patModel.verwijderDeelnemer(Number(req.params.id));
    if (!patrouilleId) return res.status(404).json({ message: 'Niet gevonden' });
    const p = await patModel.vindOpId(patrouilleId);
    const editie = await editieModel.vindOpId(p.editie_id);
    if (editie) await patModel.herbereken(patrouilleId, editie);
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
