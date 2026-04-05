// src/routes/admin.routes.js — Gebruikersbeheer (alleen admin)

const router      = require('express').Router();
const bcrypt      = require('bcrypt');
const { requireRole } = require('../middleware/auth.middleware');
const gebruikerModel  = require('../models/gebruiker.model');
const mailService     = require('../services/mail.service');
const authService     = require('../services/auth.service');

const adminOnly = requireRole('admin');

// GET /api/admin/gebruikers
router.get('/gebruikers', adminOnly, async (_req, res) => {
  try {
    res.json(await gebruikerModel.alles());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/admin/groepen
router.get('/groepen', adminOnly, async (_req, res) => {
  try {
    res.json(await gebruikerModel.alleGroepen());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/admin/gebruikers — Maak gebruiker aan + stuur welkomstmail
router.post('/gebruikers', adminOnly, async (req, res) => {
  const { naam, email, rol, groep_id } = req.body;
  if (!naam?.trim() || !email?.trim() || !rol) {
    return res.status(400).json({ message: 'Naam, e-mail en rol zijn verplicht' });
  }

  try {
    // Tijdelijk hash zodat het account bestaat maar nog niet inlogbaar is zonder activatie
    const hash = await bcrypt.hash(authService.generateToken(), Number(process.env.BCRYPT_ROUNDS) || 12);

    const nieuw = await gebruikerModel.aanmaken({
      naam: naam.trim(),
      email: email.toLowerCase().trim(),
      wachtwoord_hash: hash,
      rol,
      groep_id: groep_id || null,
    });

    // Genereer uitnodigingstoken (7 dagen geldig) en stuur activatiemail
    const token = authService.generateToken();
    const verloopt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await gebruikerModel.resetTokenZetten(nieuw.id, token, verloopt);

    await mailService.stuurUitnodigingsMail(nieuw.email, nieuw.naam, token).catch(e => {
      console.error('Uitnodigingsmail mislukt:', e.message);
    });

    res.status(201).json(nieuw);
  } catch (e) {
    const msg = e.code === 'ER_DUP_ENTRY' ? 'Dit e-mailadres is al in gebruik.' : e.message;
    res.status(400).json({ message: msg });
  }
});

// PUT /api/admin/gebruikers/:id
router.put('/gebruikers/:id', adminOnly, async (req, res) => {
  try {
    const bijgewerkt = await gebruikerModel.bijwerken(Number(req.params.id), req.body);
    if (!bijgewerkt) return res.status(404).json({ message: 'Niet gevonden' });
    res.json(bijgewerkt);
  } catch (e) {
    const msg = e.code === 'ER_DUP_ENTRY' ? 'Dit e-mailadres is al in gebruik.' : e.message;
    res.status(400).json({ message: msg });
  }
});

// POST /api/admin/gebruikers/:id/uitnodigen — Stuur nieuwe activatielink (7 dagen geldig)
router.post('/gebruikers/:id/uitnodigen', adminOnly, async (req, res) => {
  try {
    const gebruiker = await gebruikerModel.vindOpId(Number(req.params.id));
    if (!gebruiker) return res.status(404).json({ message: 'Niet gevonden' });
    if (gebruiker.geverifieerd) {
      return res.status(400).json({ message: 'Dit account is al geactiveerd.' });
    }

    const token = authService.generateToken();
    const verloopt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await gebruikerModel.resetTokenZetten(gebruiker.id, token, verloopt);
    await mailService.stuurUitnodigingsMail(gebruiker.email, gebruiker.naam, token);

    res.json({ message: `Uitnodiging verstuurd naar ${gebruiker.email}` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/admin/gebruikers/:id/wachtwoord-reset — Admin initieert wachtwoord-reset (1 uur geldig)
router.post('/gebruikers/:id/wachtwoord-reset', adminOnly, async (req, res) => {
  try {
    const gebruiker = await gebruikerModel.vindOpId(Number(req.params.id));
    if (!gebruiker) return res.status(404).json({ message: 'Niet gevonden' });
    if (!gebruiker.geverifieerd) {
      return res.status(400).json({ message: 'Account is nog niet geactiveerd. Gebruik "Uitnodiging opnieuw versturen".' });
    }

    const token = authService.generateToken();
    const verloopt = new Date(Date.now() + 60 * 60 * 1000); // 1 uur
    await gebruikerModel.resetTokenZetten(gebruiker.id, token, verloopt);
    await mailService.stuurWachtwoordResetMail(gebruiker.email, gebruiker.naam, token);

    res.json({ message: `Wachtwoord-reset verstuurd naar ${gebruiker.email}` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/admin/gebruikers/:id/sessies-beeindigen — Invalideert alle actieve sessies
router.post('/gebruikers/:id/sessies-beeindigen', adminOnly, async (req, res) => {
  try {
    const gebruiker = await gebruikerModel.vindOpId(Number(req.params.id));
    if (!gebruiker) return res.status(404).json({ message: 'Niet gevonden' });

    await authService.verwijderAlleRefreshTokens(gebruiker.id);
    res.json({ message: `Alle sessies van ${gebruiker.naam} zijn beëindigd.` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/admin/gebruikers/:id
router.delete('/gebruikers/:id', adminOnly, async (req, res) => {
  try {
    const ok = await gebruikerModel.verwijderen(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: 'Niet gevonden' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
