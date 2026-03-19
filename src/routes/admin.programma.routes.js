// src/routes/admin.programma.routes.js — Beheer programma-items

const router           = require('express').Router();
const { requireRole }  = require('../middleware/auth.middleware');
const programmaModel   = require('../models/programma.model');

const beheer = requireRole('admin', 'organisator');

// GET /api/admin/programma?editie_id=X
router.get('/', beheer, async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await programmaModel.alleItems(editieId));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/admin/programma
router.post('/', beheer, async (req, res) => {
  const { editie_id, naam, omschrijving, start_tijd, eind_tijd } = req.body;
  if (!editie_id || !naam || !start_tijd)
    return res.status(400).json({ message: 'editie_id, naam en start_tijd zijn verplicht' });
  try {
    res.status(201).json(await programmaModel.aanmaken({ editie_id, naam, omschrijving, start_tijd, eind_tijd }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/admin/programma/:id
router.put('/:id', beheer, async (req, res) => {
  const { naam, omschrijving, start_tijd, eind_tijd } = req.body;
  if (!naam || !start_tijd)
    return res.status(400).json({ message: 'naam en start_tijd zijn verplicht' });
  try {
    const item = await programmaModel.bijwerken(Number(req.params.id), { naam, omschrijving, start_tijd, eind_tijd });
    if (!item) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(item);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/admin/programma/:id
router.delete('/:id', beheer, async (req, res) => {
  try {
    const ok = await programmaModel.verwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/admin/programma/kopieer — kopieer items van broneditie naar doeleditie
router.post('/kopieer', beheer, async (req, res) => {
  const { bron_editie_id, doel_editie_id } = req.body;
  if (!bron_editie_id || !doel_editie_id)
    return res.status(400).json({ message: 'bron_editie_id en doel_editie_id zijn verplicht' });
  if (Number(bron_editie_id) === Number(doel_editie_id))
    return res.status(400).json({ message: 'Bron- en doeleditie mogen niet hetzelfde zijn' });
  try {
    const aantalGekopieerd = await programmaModel.kopieerVanEditie(
      Number(bron_editie_id), Number(doel_editie_id)
    );
    res.json({ gekopieerd: aantalGekopieerd });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
