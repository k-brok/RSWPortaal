// public/js/services/editie.js — Geselecteerde editie state (localStorage)
// De gebruiker kan schakelen tussen edities voor historische weergave.
// De door de admin ingestelde systeem-actieve editie is de standaard.

const EDITIE_KEY = 'rsw_geselecteerde_editie';

/**
 * Geeft de door de gebruiker geselecteerde editie terug, of null als er geen is.
 * Bij null wordt de systeem-actieve editie gebruikt.
 * @returns {{ id: number, naam: string } | null}
 */
export function getGeselecteerdeEditie() {
  try { return JSON.parse(localStorage.getItem(EDITIE_KEY)); }
  catch { return null; }
}

/**
 * Sla een editie op als geselecteerde editie en stuur een event.
 * @param {{ id: number, naam: string } | null} editie  null = terug naar systeem-actief
 */
export function setGeselecteerdeEditie(editie) {
  if (editie) {
    localStorage.setItem(EDITIE_KEY, JSON.stringify({ id: editie.id, naam: editie.naam }));
  } else {
    localStorage.removeItem(EDITIE_KEY);
  }
  window.dispatchEvent(new CustomEvent('rsw:editie-changed', { detail: editie }));
}
