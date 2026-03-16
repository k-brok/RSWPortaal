// src/services/auth.service.js — JWT, token-generatie en refresh-token beheer

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../config/db');

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRY  = process.env.JWT_EXPIRES_IN         || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// ── JWT ───────────────────────────────────────────────────────────

function signAccessToken(payload) {
  if (!ACCESS_SECRET) throw new Error('JWT_SECRET niet geconfigureerd');
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

function signRefreshToken(payload) {
  if (!REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET niet geconfigureerd');
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

// ── Token helpers ─────────────────────────────────────────────────

// Genereer een cryptografisch veilige random token (hex)
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Hash een token voor opslag in DB (zodat de DB-waarde nutteloos is bij een lek)
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Refresh-token opslag ──────────────────────────────────────────

async function slaRefreshTokenOp(gebruiker_id, token) {
  const token_hash  = hashToken(token);
  // Verlooptijd op basis van de REFRESH_EXPIRY string (bijv. "7d" → 7 dagen)
  const dagen = parseInt(REFRESH_EXPIRY) || 7;
  const verloopt_op = new Date(Date.now() + dagen * 24 * 60 * 60 * 1000);

  await db.execute(
    'INSERT INTO refresh_tokens (gebruiker_id, token_hash, verloopt_op) VALUES (?, ?, ?)',
    [gebruiker_id, token_hash, verloopt_op]
  );
}

async function vindEnVerwijderRefreshToken(token) {
  const token_hash = hashToken(token);
  const [rows] = await db.execute(
    `SELECT rt.*, g.id AS gebruiker_id
     FROM refresh_tokens rt
     JOIN gebruikers g ON g.id = rt.gebruiker_id
     WHERE rt.token_hash = ? AND rt.verloopt_op > NOW()`,
    [token_hash]
  );
  if (!rows[0]) return null;

  // Rotate: verwijder dit token direct na gebruik
  await db.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [token_hash]);
  return rows[0];
}

async function verwijderAlleRefreshTokens(gebruiker_id) {
  await db.execute('DELETE FROM refresh_tokens WHERE gebruiker_id = ?', [gebruiker_id]);
}

// Verwijder verlopen tokens (periodiek aan te roepen)
async function opruimenVerlopen() {
  await db.execute('DELETE FROM refresh_tokens WHERE verloopt_op <= NOW()');
}

module.exports = {
  signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken,
  generateToken, hashToken,
  slaRefreshTokenOp, vindEnVerwijderRefreshToken,
  verwijderAlleRefreshTokens, opruimenVerlopen,
};
