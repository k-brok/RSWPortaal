// utils/datum.js — Gedeelde datum/tijd hulpfuncties

/**
 * Converteert een waarde uit een <input type="datetime-local"> (lokale tijd)
 * naar een UTC ISO-string. Gebruik dit altijd vóór het versturen naar de backend.
 *
 * Voorbeeld: "2026-06-14T10:00" (CEST = UTC+2) → "2026-06-14T08:00:00.000Z"
 */
export function naarUTC(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}

/**
 * Converteert een UTC datetime-string (zoals uit de API) naar het formaat
 * dat een <input type="datetime-local"> verwacht, in de lokale tijdzone.
 *
 * Voorbeeld: "2026-06-14T08:00:00.000Z" (UTC) → "2026-06-14T10:00" (CEST)
 */
export function naarLocalDT(utcStr) {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Formatteert een UTC datetime-string naar een leesbare tijd (HH:MM) in de
 * Nederlandse tijdzone (Europe/Amsterdam).
 *
 * Voorbeeld: "2026-06-14T08:00:00.000Z" → "10:00" (CEST)
 */
export function formatTijd(utcStr) {
  if (!utcStr) return '';
  return new Date(utcStr).toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  });
}
