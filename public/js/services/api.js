// api.js — Centrale API-service met automatische token-refresh bij 401

import { getAccessToken, refreshToken, clearUser } from './auth.js';
import { navigate } from '../utils/router.js';
import { BASE_PATH } from '../config.js';

// ── Basis fetch wrapper ───────────────────────────────────────────

async function request(method, path, body = null, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers, credentials: 'include' };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_PATH}/api${path}`, options);

  // Silent refresh bij verlopen access token
  if (res.status === 401 && retry) {
    const ok = await refreshToken();
    if (ok) return request(method, path, body, false);
    clearUser();
    navigate('/login');
    throw new Error('Sessie verlopen — opnieuw inloggen vereist');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API-fout ${res.status}`);
  }

  // Lege response (204 No Content)
  if (res.status === 204) return null;

  return res.json();
}

export const api = {
  get:    (path)         => request('GET', path),
  post:   (path, body)   => request('POST', path, body),
  put:    (path, body)   => request('PUT', path, body),
  patch:  (path, body)   => request('PATCH', path, body),
  delete: (path)         => request('DELETE', path),
};

// Named exports voor directe import: import { get, post } from '../services/api.js'
export const get    = (path)       => request('GET',    path);
export const post   = (path, body) => request('POST',   path, body);
export const put    = (path, body) => request('PUT',    path, body);
export const patch  = (path, body) => request('PATCH',  path, body);
export const del    = (path)       => request('DELETE', path);

// ── Publieke endpoints (geen auth vereist) ────────────────────────

export async function getActieveEditie() {
  const res = await fetch(`${BASE_PATH}/api/publiek/editie/actief`);
  if (!res.ok) return null;
  return res.json();
}

export async function getTop10(editieId) {
  const res = await fetch(`${BASE_PATH}/api/publiek/edities/${editieId}/top10`);
  if (!res.ok) return [];
  return res.json();
}

export async function getProgramma(editieId) {
  const res = await fetch(`${BASE_PATH}/api/publiek/edities/${editieId}/programma`);
  if (!res.ok) return [];
  return res.json();
}

export async function getVacatures() {
  const res = await fetch(`${BASE_PATH}/api/publiek/vacatures`);
  if (!res.ok) return [];
  return res.json();
}

export async function getGroepen() {
  const res = await fetch(`${BASE_PATH}/api/publiek/groepen`);
  if (!res.ok) return [];
  return res.json();
}

