// src/controllers/auth.controller.js — Registratie, login, logout, refresh, verificatie

const bcrypt      = require('bcrypt');
const authService = require('../services/auth.service');
const mailService = require('../services/mail.service');
const gebruikerModel = require('../models/gebruiker.model');

const BCRYPT_ROUNDS  = Number(process.env.BCRYPT_ROUNDS) || 12;
const COOKIE_OPTIES  = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dagen
  path:     '/',
};

function stuurTokens(res, gebruiker, refreshToken) {
  const payload = { id: gebruiker.id, naam: gebruiker.naam, email: gebruiker.email, rol: gebruiker.rol, groep: gebruiker.groep ?? null };
  const accessToken = authService.signAccessToken(payload);
  res.cookie('rsw_refresh', refreshToken, COOKIE_OPTIES);
  return { accessToken, user: payload };
}

// POST /api/auth/registreer
async function registreer(req, res) {
  const { naam, email, wachtwoord } = req.body;
  if (!naam?.trim() || !email?.trim() || !wachtwoord) {
    return res.status(400).json({ message: 'Naam, e-mail en wachtwoord zijn verplicht' });
  }
  if (wachtwoord.length < 8) {
    return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn' });
  }

  try {
    const hash  = await bcrypt.hash(wachtwoord, BCRYPT_ROUNDS);
    const token = authService.generateToken();
    const gebruiker = await gebruikerModel.aanmaken({
      naam: naam.trim(), email: email.toLowerCase().trim(),
      wachtwoord_hash: hash, rol: 'leiding',
    });
    await gebruikerModel.verificatieTokenZetten(gebruiker.id, token);
    await mailService.stuurVerificatieMail(email, naam, token);
    res.status(201).json({ message: 'Account aangemaakt. Controleer je e-mail om te bevestigen.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Dit e-mailadres is al in gebruik.' });
    console.error('Registratie fout:', e);
    res.status(500).json({ message: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
}

// GET /api/auth/verifieer/:token
async function verifieerEmail(req, res) {
  const ok = await gebruikerModel.verifieeren(req.params.token);
  if (!ok) return res.redirect(`${process.env.APP_URL || ''}/#/login?verificatie=mislukt`);
  res.redirect(`${process.env.APP_URL || ''}/#/login?verificatie=gelukt`);
}

// POST /api/auth/login
async function login(req, res) {
  const { email, wachtwoord } = req.body;
  if (!email || !wachtwoord) {
    return res.status(400).json({ message: 'E-mail en wachtwoord zijn verplicht' });
  }

  const gebruiker = await gebruikerModel.vindOpEmail(email.toLowerCase().trim());
  if (!gebruiker) return res.status(401).json({ message: 'Onjuist e-mailadres of wachtwoord' });

  const geldig = await bcrypt.compare(wachtwoord, gebruiker.wachtwoord_hash);
  if (!geldig) return res.status(401).json({ message: 'Onjuist e-mailadres of wachtwoord' });

  if (!gebruiker.geverifieerd) {
    return res.status(403).json({ message: 'Bevestig eerst je e-mailadres.', code: 'EMAIL_NOT_VERIFIED' });
  }

  const refreshToken = authService.generateToken();
  await authService.slaRefreshTokenOp(gebruiker.id, refreshToken);
  res.json(stuurTokens(res, gebruiker, refreshToken));
}

// POST /api/auth/logout
async function logout(req, res) {
  const token = req.cookies?.rsw_refresh;
  if (token) {
    await authService.vindEnVerwijderRefreshToken(token).catch(() => {});
  }
  res.clearCookie('rsw_refresh', { path: '/' });
  res.status(204).end();
}

// POST /api/auth/refresh
async function refresh(req, res) {
  const token = req.cookies?.rsw_refresh;
  if (!token) return res.status(401).json({ message: 'Geen actieve sessie' });

  const opgeslagen = await authService.vindEnVerwijderRefreshToken(token);
  if (!opgeslagen) return res.status(401).json({ message: 'Sessie verlopen — log opnieuw in' });

  const gebruiker = await gebruikerModel.vindOpId(opgeslagen.gebruiker_id);
  if (!gebruiker) return res.status(401).json({ message: 'Gebruiker niet gevonden' });

  const nieuwRefreshToken = authService.generateToken();
  await authService.slaRefreshTokenOp(gebruiker.id, nieuwRefreshToken);
  res.json(stuurTokens(res, gebruiker, nieuwRefreshToken));
}

// POST /api/auth/wachtwoord-vergeten
async function wachtwoordVergeten(req, res) {
  const { email } = req.body;
  // Altijd 200 teruggeven, ook als e-mail niet bestaat (security)
  if (!email) return res.status(400).json({ message: 'E-mail is verplicht' });

  const gebruiker = await gebruikerModel.vindOpEmail(email.toLowerCase().trim());
  if (gebruiker) {
    const token = authService.generateToken();
    const verloopt = new Date(Date.now() + 60 * 60 * 1000); // 1 uur
    await gebruikerModel.resetTokenZetten(gebruiker.id, token, verloopt);
    await mailService.stuurWachtwoordResetMail(gebruiker.email, gebruiker.naam, token).catch(console.error);
  }
  res.json({ message: 'Als dit e-mailadres bekend is, ontvang je een e-mail.' });
}

// POST /api/auth/wachtwoord-reset
async function wachtwoordReset(req, res) {
  const { token, wachtwoord } = req.body;
  if (!token || !wachtwoord) return res.status(400).json({ message: 'Token en wachtwoord zijn verplicht' });
  if (wachtwoord.length < 8) return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn' });

  const gebruiker = await gebruikerModel.vindOpResetToken(token);
  if (!gebruiker) return res.status(400).json({ message: 'Ongeldige of verlopen reset-link' });

  const hash = await bcrypt.hash(wachtwoord, BCRYPT_ROUNDS);
  await gebruikerModel.wachtwoordBijwerken(gebruiker.id, hash);
  await gebruikerModel.resetTokenWissen(gebruiker.id);
  // Invalideer alle actieve sessies na wachtwoord-reset
  await authService.verwijderAlleRefreshTokens(gebruiker.id);
  res.json({ message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen.' });
}

module.exports = { registreer, verifieerEmail, login, logout, refresh, wachtwoordVergeten, wachtwoordReset };
