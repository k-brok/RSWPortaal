// src/routes/scoreformulieren.routes.js — Score formulier data voor print

const router       = require('express').Router();
const { requireRole, requireAuth } = require('../middleware/auth.middleware');
const patModel     = require('../models/patrouille.model');
const platModel    = require('../models/plattegrond.model');
const catModel     = require('../models/editie-categorie.model');
const editieModel  = require('../models/editie.model');
const db           = require('../config/db');

// Bouw gecombineerde data: patrouilles met nummer + categorieen met criteria
async function bouwFormulierData(editieId, patrouilleIds = null) {
  const [editie, nummerMap, alleP, categorieen] = await Promise.all([
    editieModel.vindOpId(editieId),
    platModel.patrouilleNummerMap(editieId),
    patModel.allePatrouilles(editieId),
    catModel.categorieMetDetails(editieId),
  ]);

  // Haal subkampen op voor naam + kleur
  const [subkampen] = await db.execute(
    'SELECT id, naam, kleur FROM subkampen WHERE editie_id = ?', [editieId]
  );
  const subkampMap = Object.fromEntries(subkampen.map(s => [s.id, s]));

  // Filter en verrijk patrouilles
  let patrouilles = alleP
    .filter(p => patrouilleIds ? patrouilleIds.includes(p.id) : true)
    .map(p => {
      const info = nummerMap[p.id] || {};
      const sub  = subkampMap[info.subkamp_id] || {};
      return {
        id:            p.id,
        naam:          p.naam,
        groep_naam:    p.groep_naam,
        nummer:        info.nummer ?? null,
        subkamp_id:    info.subkamp_id ?? null,
        subkamp_naam:  sub.naam ?? null,
        subkamp_kleur: sub.kleur ?? null,
      };
    })
    .sort((a, b) => (a.nummer ?? 9999) - (b.nummer ?? 9999));

  return { editie, patrouilles, categorieen };
}

// ── Organisator / Admin ────────────────────────────────────────────

// GET /api/scoreformulieren/admin?editie_id=X
router.get('/admin', requireRole('admin', 'organisator'), async (req, res) => {
  const editieId = Number(req.query.editie_id);
  if (!editieId) return res.status(400).json({ message: 'editie_id vereist' });
  try {
    res.json(await bouwFormulierData(editieId));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Leiding ────────────────────────────────────────────────────────

// GET /api/scoreformulieren/leiding  (actieve editie, eigen patrouilles)
router.get('/leiding', requireAuth, async (req, res) => {
  const groepId = req.gebruiker?.groep_id;
  if (!groepId) return res.status(403).json({ message: 'Geen groep gekoppeld aan uw account' });

  try {
    const editie = await editieModel.actieveEditie();
    if (!editie) return res.status(404).json({ message: 'Geen actieve editie' });

    const eigenPatrouilles = await patModel.patrouillesVoorGroep(groepId, editie.id);
    const ids = eigenPatrouilles.map(p => p.id);

    res.json(await bouwFormulierData(editie.id, ids));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
