// src/utils/datum.js — Backend datum/tijd hulpfuncties

/**
 * Converteert een datum/tijdwaarde naar MySQL DATETIME-formaat (UTC).
 * MySQL accepteert geen ISO 8601 strings met 'T' en 'Z'.
 *
 * Voorbeeld: '2026-03-23T12:46:00.000Z' → '2026-03-23 12:46:00'
 *
 * @param {string|Date|null} waarde
 * @returns {string|null}
 */
function naarMysqlDT(waarde) {
  if (!waarde) return null;
  return new Date(waarde).toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { naarMysqlDT };
