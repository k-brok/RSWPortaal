// footer.js — Footer component

import { APP_VERSION } from '../config.js';

const JAAR = new Date().getFullYear();

export function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
    <span>
      &copy; ${JAAR} RSW Portaal &mdash; Regio De Langstraat &nbsp;|&nbsp;
      Developed by <strong>CHUNKK</strong> &nbsp;|&nbsp;
      <span style="color:var(--color-text-muted);font-size:0.8em;">v${APP_VERSION}</span>
    </span>
  `;
}
