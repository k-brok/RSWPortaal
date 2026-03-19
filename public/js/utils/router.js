// router.js — Lichtgewichte hash-router (geen circulaire afhankelijkheden)

export function navigate(hash) {
  location.hash = hash;
}

export function currentRoute() {
  const hash = location.hash || '#/';
  // Strip query-params (?...) zodat de router alleen het pad vergelijkt.
  // De params zijn nog steeds beschikbaar via location.hash in de pagina zelf.
  const pad = hash.slice(1).split('?')[0];
  return pad || '/';
}
