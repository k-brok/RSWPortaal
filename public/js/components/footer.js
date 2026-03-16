// footer.js — Footer component

const JAAR = new Date().getFullYear();

export function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
    <span>
      &copy; ${JAAR} RSW Portaal &mdash; Regio De Langstraat &nbsp;|&nbsp;
      Developed by <strong>CHUNKK</strong>
    </span>
  `;
}
