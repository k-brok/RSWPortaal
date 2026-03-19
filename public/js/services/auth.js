// auth.js — Authenticatie service (JWT access token in memory, refresh via httpOnly cookie)

import { BASE_PATH } from '../config.js';

const AUTH_KEY = 'rsw_user'; // alleen niet-gevoelige gebruikersdata in sessionStorage

let accessToken = null;

// ── Token beheer ──────────────────────────────────────────────────

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

// ── Gebruiker (niet-gevoelige data) ──────────────────────────────

export function setUser(user) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
  // Stuur event zodat header/sidebar zich kunnen bijwerken
  window.dispatchEvent(new CustomEvent('rsw:auth-changed', { detail: { user } }));
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  sessionStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new CustomEvent('rsw:auth-changed', { detail: { user: null } }));
}

// ── Auth status ───────────────────────────────────────────────────

export function isLoggedIn() {
  return accessToken !== null && getUser() !== null;
}

export function hasRole(...roles) {
  const user = getUser();
  if (!user) return false;
  return roles.includes(user.rol);
}

// ── Login / logout ────────────────────────────────────────────────

export async function login(email, wachtwoord) {
  const res = await fetch(`${BASE_PATH}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // nodig voor httpOnly refresh cookie
    body: JSON.stringify({ email, wachtwoord }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Inloggen mislukt');
  }

  const data = await res.json();
  setAccessToken(data.accessToken);
  setUser(data.user);
  return data.user;
}

export async function logout() {
  try {
    await fetch(`${BASE_PATH}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    clearAccessToken();
    clearUser();
  }
}

// ── Token vernieuwen (silent refresh) ────────────────────────────
// Wordt aangeroepen bij app-start en wanneer een API-call 401 teruggeeft

export async function refreshToken() {
  const res = await fetch(`${BASE_PATH}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    clearAccessToken();
    clearUser();
    return false;
  }

  const data = await res.json();
  setAccessToken(data.accessToken);

  // Gebruikersdata meegegeven bij refresh? Dan opslaan.
  if (data.user) {
    setUser(data.user);
  }

  return true;
}

// ── Initialisatie bij app-start ───────────────────────────────────
// Probeert de sessie te herstellen via de httpOnly refresh cookie.

export async function initAuth() {
  const ok = await refreshToken();
  return ok;
}
