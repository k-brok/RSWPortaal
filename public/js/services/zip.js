// services/zip.js — Lazy loader voor JSZip (browser build)

export function laadJSZip() {
  return new Promise((resolve, reject) => {
    if (typeof JSZip !== 'undefined') { resolve(); return; }
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload  = resolve;
    s.onerror = () => reject(new Error('JSZip kon niet worden geladen.'));
    document.head.appendChild(s);
  });
}
