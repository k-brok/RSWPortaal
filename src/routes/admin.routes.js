// src/routes/admin.routes.js — Gebruikersbeheer (alleen admin)

const router      = require('express').Router();
const bcrypt      = require('bcrypt');
const { requireRole } = require('../middleware/auth.middleware');
const gebruikerModel  = require('../models/gebruiker.model');
const mailService     = require('../services/mail.service');

const adminOnly = requireRole('admin');

// Genereer een veilig tijdelijk wachtwoord (leesbaar maar sterk genoeg)
function tijdelijkWachtwoord() {
  const woorden = ['Scouting', 'Langstraat', 'Wedstrijd', 'Patrouille'];
  const woord   = woorden[Math.floor(Math.random() * woorden.length)];
  const getal   = Math.floor(1000 + Math.random() * 9000);
  return `${woord}${getal}!`;
}

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
    const wachtwoord = tijdelijkWachtwoord();
    const hash = await bcrypt.hash(wachtwoord, Number(process.env.BCRYPT_ROUNDS) || 12);

    const nieuw = await gebruikerModel.aanmaken({
      naam: naam.trim(),
      email: email.toLowerCase().trim(),
      wachtwoord_hash: hash,
      rol,
      groep_id: groep_id || null,
    });

    // Markeer direct als geverifieerd (admin-aanmaak) en stuur welkomstmail
    await require('../config/db').execute(
      'UPDATE gebruikers SET geverifieerd=1 WHERE id=?', [nieuw.id]
    );
    nieuw.geverifieerd = 1;

    await mailService.stuurWelkomMail(nieuw.email, nieuw.naam, wachtwoord).catch(e => {
      console.error('Welkomstmail mislukt:', e.message);
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

// POST /api/admin/gebruikers/:id/uitnodigen — Stuur nieuw wachtwoord
router.post('/gebruikers/:id/uitnodigen', adminOnly, async (req, res) => {
  try {
    const gebruiker = await gebruikerModel.vindOpId(Number(req.params.id));
    if (!gebruiker) return res.status(404).json({ message: 'Niet gevonden' });

    const wachtwoord = tijdelijkWachtwoord();
    const hash = await bcrypt.hash(wachtwoord, Number(process.env.BCRYPT_ROUNDS) || 12);
    await gebruikerModel.wachtwoordBijwerken(gebruiker.id, hash);
    await mailService.stuurWelkomMail(gebruiker.email, gebruiker.naam, wachtwoord);

    res.json({ message: `Uitnodiging verstuurd naar ${gebruiker.email}` });
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
