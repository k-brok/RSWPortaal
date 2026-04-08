// src/controllers/auth.controller.js — Registratie, login, logout, refresh, verificatie

const bcrypt         = require('bcrypt');
const authService    = require('../services/auth.service');
const mailService    = require('../services/mail.service');
const gebruikerModel = require('../models/gebruiker.model');
const aanvraagModel  = require('../models/aanvraag.model');
const vrijwModel     = require('../models/vrijwilliger.model');
const editieModel    = require('../models/editie.model');

const BCRYPT_ROUNDS  = Number(process.env.BCRYPT_ROUNDS) || 12;
const COOKIE_OPTIES  = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dagen
  path:     '/',
};

function stuurTokens(res, gebruiker, refreshToken) {
  const payload = { id: gebruiker.id, naam: gebruiker.naam, email: gebruiker.email, rol: gebruiker.rol, groep: gebruiker.groep ?? null, groep_id: gebruiker.groep_id ?? null };
  const accessToken = authService.signAccessToken(payload);
  res.cookie('rsw_refresh', refreshToken, COOKIE_OPTIES);
  return { accessToken, user: payload };
}

// POST /api/auth/registreer
// Body: { naam, email, wachtwoord, rol?, groep_id?, vacature_id?, opmerking? }
async function registreer(req, res) {
  const { naam, email, wachtwoord, rol, groep_id, vacature_id, opmerking } = req.body;
  if (!naam?.trim() || !email?.trim() || !wachtwoord) {
    return res.status(400).json({ message: 'Naam, e-mail en wachtwoord zijn verplicht' });
  }
  if (wachtwoord.length < 8) {
    return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn' });
  }

  const gekozenRol = ['leiding', 'vrijwilliger'].includes(rol) ? rol : 'leiding';

  try {
    const hash  = await bcrypt.hash(wachtwoord, BCRYPT_ROUNDS);
    const token = authService.generateToken();

    const gebruiker = await gebruikerModel.aanmaken({
      naam: naam.trim(), email: email.toLowerCase().trim(),
      wachtwoord_hash: hash, rol: gekozenRol,
    });

    await gebruikerModel.verificatieTokenZetten(gebruiker.id, token);
    await mailService.stuurVerificatieMail(email, naam, token);

    // ── Rol-specifieke aanvraag aanmaken ──────────────────────────
    const organisatoren = await aanvraagModel.alleOrganisatoren();

    if (gekozenRol === 'leiding' && groep_id) {
      await aanvraagModel.aanmaken(gebruiker.id, Number(groep_id), opmerking ?? null);

      // Notificeer alle organisatoren
      const groepen = await gebruikerModel.alleGroepen();
      const groep = groepen.find(g => g.id === Number(groep_id));
      const groepLabel = groep?.naam ?? `Groep #${groep_id}`;

      for (const org of organisatoren) {
        await mailService.stuurNieuweAanvraagMail(
          org.email, naam, 'leiding', `Wil leiding worden bij: ${groepLabel}`
        ).catch(e => console.error('Notificatiemail mislukt:', e.message));
      }
    }

    if (gekozenRol === 'vrijwilliger') {
      // Maak een vrijwilliger-inschrijving aan als er een actieve editie is
      const editie = await editieModel.actieveEditie().catch(() => null);
      if (editie) {
        await vrijwModel.aanmelden(editie.id, gebruiker.id, {
          vacature_id: vacature_id ? Number(vacature_id) : null,
          opmerking: opmerking ?? null,
        }).catch(() => {}); // Stil falen als inschrijving niet mogelijk is
      }

      // Notificeer alle organisatoren
      for (const org of organisatoren) {
        await mailService.stuurNieuweAanvraagMail(
          org.email, naam, 'vrijwilliger',
          vacature_id ? `Heeft interesse in vacature #${vacature_id}` : null
        ).catch(e => console.error('Notificatiemail mislukt:', e.message));
      }
    }

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
  if (!ok) return res.redirect(`${process.env.APP_URL || ''}/login?verificatie=mislukt`);
  res.redirect(`${process.env.APP_URL || ''}/login?verificatie=gelukt`);
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
  // Activeer account (voor uitnodigingsflow) en invalideer sessies
  await require('../config/db').execute('UPDATE gebruikers SET geverifieerd=1 WHERE id=?', [gebruiker.id]);
  await authService.verwijderAlleRefreshTokens(gebruiker.id);
  res.json({ message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen.' });
}

module.exports = { registreer, verifieerEmail, login, logout, refresh, wachtwoordVergeten, wachtwoordReset };
