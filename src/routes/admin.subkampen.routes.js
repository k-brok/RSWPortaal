// src/routes/admin.subkampen.routes.js — Subkampen CRUD (admin + organisator)

const router = require('express').Router();
const { requireRole }  = require('../middleware/auth.middleware');
const model            = require('../models/subkamp.model');

const beheer = requireRole('admin', 'organisator');

// GET ?editie_id=X
router.get('/', beheer, async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try { res.json(await model.alleSubkampen(editieId)); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', beheer, async (req, res) => {
  const { editie_id, naam, kleur, omschrijving, groep_id, vereniging_id } = req.body;
  if (!editie_id || !naam?.trim())
    return res.status(400).json({ message: 'editie_id en naam zijn verplicht' });
  try { res.status(201).json(await model.aanmaken({ editie_id, naam, kleur, omschrijving, groep_id, vereniging_id })); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/volgorde', beheer, async (req, res) => {
  const { items } = req.body; // [{ id, volgorde }]
  if (!Array.isArray(items)) return res.status(400).json({ message: 'items array vereist' });
  try { await model.bijwerkenVolgorde(items); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/:id', beheer, async (req, res) => {
  const { naam, kleur, omschrijving, groep_id, vereniging_id } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    const s = await model.bijwerken(Number(req.params.id), { naam, kleur, omschrijving, groep_id, vereniging_id });
    if (!s) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(s);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /:id/jongste — stel dit subkamp in als jongste (of wis als al jongste)
router.put('/:id/jongste', beheer, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const sub = await model.vindOpId(id);
    if (!sub) return res.status(404).json({ message: 'Niet gevonden' });
    // Toggle: was al jongste → wis; anders → stel in
    const nieuweWaarde = sub.is_jongste ? null : id;
    await model.setJongste(sub.editie_id, nieuweWaarde);
    res.json({ ok: true, is_jongste: !!nieuweWaarde });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/:id', beheer, async (req, res) => {
  try {
    const ok = await model.verwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
