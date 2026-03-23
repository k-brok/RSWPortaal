// src/routes/admin.versie.routes.js — Versie & update beheer (admin only)

const router  = require('express').Router();
const { requireRole } = require('../middleware/auth.middleware');
const versieService = require('../services/versie.service');

const adminOnly = requireRole('admin');

// ── GET /api/admin/versie ─────────────────────────────────────────
// Geeft huidige versie terug + optionele GitHub-check op beschikbare updates.

router.get('/', adminOnly, async (_req, res) => {
  const info = versieService.huidig();

  try {
    const update = await versieService.controleOpUpdate();
    res.json({ ...info, update });
  } catch {
    res.json({ ...info, update: null });
  }
});

// ── POST /api/admin/versie/update ─────────────────────────────────
// Voert een in-place server update uit (alleen als UPDATE_MODE=direct).

router.post('/update', adminOnly, async (_req, res) => {
  const { updateModus } = versieService.huidig();

  if (updateModus !== 'direct') {
    const update = await versieService.controleOpUpdate().catch(() => null);
    const versie = update?.versie ?? '?';
    return res.json({
      succes: false,
      modus:  'docker',
      bericht: 'Server draait in Docker/Kubernetes modus. Voer de update handmatig uit.',
      commandos: versieService.dockerCommandos(versie),
    });
  }

  try {
    const uitvoer = await versieService.voerUpdateUit();
    res.json({ succes: true, modus: 'direct', uitvoer });
  } catch (e) {
    res.status(500).json({ succes: false, modus: 'direct', bericht: e.message });
  }
});

module.exports = router;
