// src/middleware/auth.middleware.js — JWT verificatie en rol-autorisatie

const { verifyAccessToken } = require('../services/auth.service');

// Lees JWT uit Authorization header: "Bearer <token>"
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Niet geauthenticeerd' });
  }

  const token = header.slice(7);
  try {
    req.gebruiker = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sessie verlopen', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Ongeldig token' });
  }
}

// Vereist dat de ingelogde gebruiker een van de opgegeven rollen heeft
function requireRole(...rollen) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!rollen.includes(req.gebruiker.rol)) {
        return res.status(403).json({ message: 'Geen toegang — onvoldoende rechten' });
      }
      next();
    },
  ];
}

module.exports = { requireAuth, requireRole };
