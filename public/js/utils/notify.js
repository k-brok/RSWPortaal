// utils/notify.js — Centraal toast-notificatiesysteem
// Gebruik: notify.success('Opgeslagen') | notify.error('Fout') | notify.info(...) | notify.warning(...)

const MAX_TOASTS = 5;
const DURATIES   = { success: 4000, info: 4000, warning: 0, error: 6000 };
const ICONEN     = { success: 'check_circle', info: 'info', warning: 'warning', error: 'error' };

let container = null;

function getContainer() {
  if (!container || !container.isConnected) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function toon(type, tekst, duur) {
  const c = getContainer();

  // Verwijder oudste toast als het maximum bereikt is
  while (c.children.length >= MAX_TOASTS) {
    verwijder(c.firstElementChild);
  }

  // Bouw toast op via DOM (geen innerHTML voor tekst — voorkomt XSS)
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon material-icons';
  iconEl.textContent = ICONEN[type];

  const tekstEl = document.createElement('span');
  tekstEl.className = 'toast-tekst';
  tekstEl.textContent = tekst;

  const sluitEl = document.createElement('button');
  sluitEl.className = 'toast-sluit';
  sluitEl.setAttribute('aria-label', 'Sluiten');
  sluitEl.innerHTML = '<span class="material-icons">close</span>';
  sluitEl.addEventListener('click', () => verwijder(el));

  el.append(iconEl, tekstEl, sluitEl);

  if (duur) {
    const progressEl = document.createElement('div');
    progressEl.className = 'toast-progress';
    const balkEl = document.createElement('div');
    balkEl.className = 'toast-progress-balk';
    balkEl.style.animationDuration = `${duur}ms`;
    progressEl.appendChild(balkEl);
    el.appendChild(progressEl);
  }

  c.appendChild(el);

  // Force reflow zodat de CSS-transitie triggert
  void el.offsetHeight;
  el.classList.add('toast-zichtbaar');

  if (duur) setTimeout(() => verwijder(el), duur);

  return el;
}

function verwijder(el) {
  if (!el?.isConnected) return;
  el.classList.remove('toast-zichtbaar');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

export const notify = {
  success: (tekst, duur = DURATIES.success) => toon('success', tekst, duur),
  error:   (tekst, duur = DURATIES.error)   => toon('error',   tekst, duur),
  info:    (tekst, duur = DURATIES.info)    => toon('info',    tekst, duur),
  warning: (tekst, duur = DURATIES.warning) => toon('warning', tekst, duur),
};
