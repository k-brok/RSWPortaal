// src/controllers/profiel.controller.js — Profiel inzien, wachtwoord en e-mail wijzigen

const bcrypt         = require('bcrypt');
const authService    = require('../services/auth.service');
const mailService    = require('../services/mail.service');
const gebruikerModel = require('../models/gebruiker.model');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

// GET /api/profiel
async function getProfiel(req, res) {
  const gebruiker = await gebruikerModel.vindOpId(req.gebruiker.id);
  if (!gebruiker) return res.status(404).json({ message: 'Gebruiker niet gevonden' });
  res.json(gebruiker);
}

// POST /api/profiel/wachtwoord-wijzigen
async function wijzigWachtwoord(req, res) {
  const { huidig_wachtwoord, nieuw_wachtwoord } = req.body;
  if (!huidig_wachtwoord || !nieuw_wachtwoord) {
    return res.status(400).json({ message: 'Huidig en nieuw wachtwoord zijn verplicht' });
  }
  if (nieuw_wachtwoord.length < 8) {
    return res.status(400).json({ message: 'Nieuw wachtwoord moet minimaal 8 tekens zijn' });
  }

  // Laad volledig gebruikersobject inclusief hash
  const [rows] = await require('../config/db').execute(
    'SELECT wachtwoord_hash FROM gebruikers WHERE id=?', [req.gebruiker.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Gebruiker niet gevonden' });

  const geldig = await bcrypt.compare(huidig_wachtwoord, rows[0].wachtwoord_hash);
  if (!geldig) return res.status(400).json({ message: 'Huidig wachtwoord is onjuist' });

  const hash = await bcrypt.hash(nieuw_wachtwoord, BCRYPT_ROUNDS);
  await gebruikerModel.wachtwoordBijwerken(req.gebruiker.id, hash);

  // Invalideer alle andere sessies (behalve de huidige, die mag doorgaan)
  await authService.verwijderAlleRefreshTokens(req.gebruiker.id);

  res.json({ message: 'Wachtwoord succesvol gewijzigd' });
}

// POST /api/profiel/email-wijzigen
async function vraagEmailWijziging(req, res) {
  const { nieuw_email, wachtwoord } = req.body;
  if (!nieuw_email || !wachtwoord) {
    return res.status(400).json({ message: 'Nieuw e-mailadres en wachtwoord zijn verplicht' });
  }

  // Controleer wachtwoord
  const [rows] = await require('../config/db').execute(
    'SELECT wachtwoord_hash, naam FROM gebruikers WHERE id=?', [req.gebruiker.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Gebruiker niet gevonden' });

  const geldig = await bcrypt.compare(wachtwoord, rows[0].wachtwoord_hash);
  if (!geldig) return res.status(400).json({ message: 'Wachtwoord is onjuist' });

  // Controleer of nieuw e-mail al in gebruik is
  const bestaand = await gebruikerModel.vindOpEmail(nieuw_email.toLowerCase().trim());
  if (bestaand && bestaand.id !== req.gebruiker.id) {
    return res.status(409).json({ message: 'Dit e-mailadres is al in gebruik' });
  }

  const token   = authService.generateToken();
  const verloopt = new Date(Date.now() + 60 * 60 * 1000); // 1 uur
  await gebruikerModel.emailWijzigTokenZetten(
    req.gebruiker.id, token, nieuw_email.toLowerCase().trim(), verloopt
  );
  await mailService.stuurEmailWijzigMail(nieuw_email, rows[0].naam, token);

  res.json({ message: 'Controleer je nieuwe e-mailadres voor een bevestigingslink.' });
}

// GET /api/profiel/email-bevestigen/:token
async function bevestigEmailWijziging(req, res) {
  const record = await gebruikerModel.vindOpEmailWijzigToken(req.params.token);
  if (!record) {
    return res.redirect(`${process.env.APP_URL || ''}/profiel?email=mislukt`);
  }
  await gebruikerModel.bevestigEmailWijziging(record.id, record.nieuw_email);
  await authService.verwijderAlleRefreshTokens(record.id);
  res.redirect(`${process.env.APP_URL || ''}/login?email=gewijzigd`);
}

module.exports = { getProfiel, wijzigWachtwoord, vraagEmailWijziging, bevestigEmailWijziging };
