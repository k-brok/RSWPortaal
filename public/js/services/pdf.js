// services/pdf.js — Lazy loader voor pdfMake (browser build)

import { BASE_PATH } from '../config.js';

export function laadPdfMake() {
  return new Promise((resolve, reject) => {
    if (typeof pdfMake !== 'undefined') { resolve(); return; }
    const s1 = document.createElement('script');
    s1.src    = `${BASE_PATH}/vendor/pdfmake/pdfmake.min.js`;
    s1.onerror = reject;
    s1.onload  = () => {
      const s2 = document.createElement('script');
      s2.src    = `${BASE_PATH}/vendor/pdfmake/vfs_fonts.js`;
      s2.onload  = resolve;
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}
