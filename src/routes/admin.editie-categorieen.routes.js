// src/routes/admin.editie-categorieen.routes.js — Per-editie categorieën, subcategorieën en criteria

const router = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const m = require('../models/editie-categorie.model');

const beheerder = requireRole('admin', 'organisator');

function fout(res, e) {
  const status = e.status || 500;
  res.status(status).json({ message: e.message });
}

// ── Categorieën ────────────────────────────────────────────────────

// GET  /api/admin/editie-categorieen?editie_id=X
router.get('/', beheerder, async (req, res) => {
  const { editie_id } = req.query;
  if (!editie_id) return res.status(400).json({ message: 'editie_id vereist' });
  try { res.json(await m.alleCategorieen(Number(editie_id))); }
  catch (e) { fout(res, e); }
});

// GET  /api/admin/editie-categorieen/details?editie_id=X  (genest)
router.get('/details', beheerder, async (req, res) => {
  const { editie_id } = req.query;
  if (!editie_id) return res.status(400).json({ message: 'editie_id vereist' });
  try { res.json(await m.categorieMetDetails(Number(editie_id))); }
  catch (e) { fout(res, e); }
});

// POST /api/admin/editie-categorieen
router.post('/', beheerder, async (req, res) => {
  const { editie_id, naam, omschrijving, wegingspercentage, volgorde } = req.body;
  if (!editie_id || !naam?.trim()) return res.status(400).json({ message: 'editie_id en naam zijn verplicht' });
  try { res.status(201).json(await m.categorieAanmaken({ editie_id, naam, omschrijving, wegingspercentage, volgorde })); }
  catch (e) { fout(res, e); }
});

// PUT  /api/admin/editie-categorieen/:id
router.put('/:id', beheerder, async (req, res) => {
  const { naam, omschrijving, volgorde, rally_type } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  const toegestaneTypes = ['tocht', 'spelmiddag', null, undefined, ''];
  if (!toegestaneTypes.includes(rally_type))
    return res.status(400).json({ message: 'Ongeldig rally_type' });
  try {
    await m.categorieBijwerken(Number(req.params.id), { naam, omschrijving, volgorde, rally_type: rally_type || null });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/editie-categorieen/:id
router.delete('/:id', beheerder, async (req, res) => {
  try {
    const ok = await m.categorieVerwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// PUT  /api/admin/editie-categorieen/wegingen — batch wegingspercentages bijwerken
router.put('/wegingen/batch', beheerder, async (req, res) => {
  const { items } = req.body; // [{ id, wegingspercentage }]
  if (!Array.isArray(items)) return res.status(400).json({ message: 'items[] vereist' });
  try {
    await m.bijwerkenWegingen(items);
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Import ─────────────────────────────────────────────────────────

// POST /api/admin/editie-categorieen/importeer/editie
router.post('/importeer/editie', beheerder, async (req, res) => {
  const { bron_editie_id, doel_editie_id } = req.body;
  if (!bron_editie_id || !doel_editie_id) return res.status(400).json({ message: 'bron_editie_id en doel_editie_id vereist' });
  try { res.json(await m.importeerVanEditie(Number(bron_editie_id), Number(doel_editie_id))); }
  catch (e) { fout(res, e); }
});

// ── Subcategorieën ─────────────────────────────────────────────────

// POST /api/admin/editie-categorieen/:id/subcategorieen
router.post('/:id/subcategorieen', beheerder, async (req, res) => {
  const { naam, volgorde } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    res.status(201).json(await m.subcategorieAanmaken({ categorie_id: Number(req.params.id), naam, volgorde }));
  } catch (e) { fout(res, e); }
});

// PUT  /api/admin/editie-categorieen/subcategorieen/:subId
router.put('/subcategorieen/:subId', beheerder, async (req, res) => {
  const { naam, volgorde } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    await m.subcategorieBijwerken(Number(req.params.subId), { naam, volgorde });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/editie-categorieen/subcategorieen/:subId
router.delete('/subcategorieen/:subId', beheerder, async (req, res) => {
  try {
    const ok = await m.subcategorieVerwijderen(Number(req.params.subId));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// ── Criteria ───────────────────────────────────────────────────────

// POST /api/admin/editie-categorieen/subcategorieen/:subId/criteria
router.post('/subcategorieen/:subId/criteria', beheerder, async (req, res) => {
  const { naam, omschrijving, invoer_type, max_score, min_score,
          lager_is_beter, scorerings_methode, scorerings_config, volgorde } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    res.status(201).json(await m.criteriumAanmaken({
      subcategorie_id: Number(req.params.subId), naam, omschrijving,
      invoer_type, max_score, min_score, lager_is_beter,
      scorerings_methode, scorerings_config, volgorde,
    }));
  } catch (e) { fout(res, e); }
});

// PUT  /api/admin/editie-categorieen/criteria/:critId
router.put('/criteria/:critId', beheerder, async (req, res) => {
  const { naam, omschrijving, invoer_type, max_score, min_score,
          lager_is_beter, scorerings_methode, scorerings_config, volgorde } = req.body;
  if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });
  try {
    await m.criteriumBijwerken(Number(req.params.critId), {
      naam, omschrijving, invoer_type, max_score, min_score,
      lager_is_beter, scorerings_methode, scorerings_config, volgorde,
    });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

// DELETE /api/admin/editie-categorieen/criteria/:critId
router.delete('/criteria/:critId', beheerder, async (req, res) => {
  try {
    const ok = await m.criteriumVerwijderen(Number(req.params.critId));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { fout(res, e); }
});

module.exports = router;
