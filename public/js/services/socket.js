// services/socket.js — Gedeelde Socket.io hulpfuncties

import { BASE_PATH } from '../config.js';

export function laadSocketScript() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = `${BASE_PATH}/vendor/socketio/socket.io.min.js`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function maakSocket(options = {}) {
  return io({
    path: BASE_PATH + '/socket.io',
    transports: ['websocket', 'polling'],
    ...options,
  });
}
