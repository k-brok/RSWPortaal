// router.js — Lichtgewichte History API-router (geen circulaire afhankelijkheden)

import { BASE_PATH } from '../config.js';

export function navigate(pad) {
  history.pushState(null, '', BASE_PATH + pad);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function currentRoute() {
  // Strip de BASE_PATH prefix en query-params; geeft altijd een pad terug dat begint met '/'.
  const pad = location.pathname.slice(BASE_PATH.length) || '/';
  return pad.split('?')[0] || '/';
}
