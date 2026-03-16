// router.js — Lichtgewichte hash-router (geen circulaire afhankelijkheden)

export function navigate(hash) {
  location.hash = hash;
}

export function currentRoute() {
  const hash = location.hash || '#/';
  return hash.slice(1) || '/';
}
