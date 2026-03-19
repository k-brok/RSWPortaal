// src/app.js — Express server met Socket.io

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');
const http         = require('http');
const { Server }   = require('socket.io');

const app      = express();
const PORT     = process.env.PORT || 3000;
const APP_URL  = process.env.APP_URL || `http://localhost:${PORT}`;
const BASE_PATH = new URL(APP_URL).pathname.replace(/\/?$/, ''); // '' of '/proxy/3000'

// Maak HTTP server + Socket.io
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Initialiseer jury socket handlers
require('./socket/jury.socket')(io);

// Unieke versie per server-start — omzeilt proxy-caches voor JS/CSS
const BUILD_VERSION = Date.now().toString();

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// ── Statische bestanden (nooit cachen in development) ─────────────
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// app.js en config.js krijgen server-side waarden geïnjecteerd
app.get('/js/app.js', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const inhoud   = fs.readFileSync(filePath, 'utf8').replace('__RSW_VERSION__', BUILD_VERSION);
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(inhoud);
});

app.get('/js/config.js', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'js', 'config.js');
  const inhoud   = fs.readFileSync(filePath, 'utf8').replace('__RSW_BASEPATH__', BASE_PATH);
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(inhoud);
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/pdfmake', express.static(path.join(__dirname, '../node_modules/pdfmake/build')));
app.use('/vendor/socketio', express.static(path.join(__dirname, '../node_modules/socket.io/client-dist')));

// ── Standalone jury formulier pagina ──────────────────────────────
app.get('/formulier', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'formulier.html');
  const html = fs.readFileSync(filePath, 'utf8')
    .replace('<head>', `<head>\n  <base href="${BASE_PATH}/">`);
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.send(html);
});

// ── Rally scan pagina (geen header/sidebar, anoniem) ──────────────
app.get('/rally', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'rally.html');
  const html = fs.readFileSync(filePath, 'utf8')
    .replace('<head>', `<head>\n  <base href="${BASE_PATH}/">`);
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.send(html);
});

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',                 require('./routes/auth.routes'));
app.use('/api/profiel',              require('./routes/profiel.routes'));
app.use('/api/admin/edities',        require('./routes/admin.edities.routes'));
app.use('/api/admin/verenigingen',   require('./routes/admin.verenigingen.routes'));
app.use('/api/admin/editie-categorieen', require('./routes/admin.editie-categorieen.routes'));
app.use('/api/scoreformulieren',         require('./routes/scoreformulieren.routes'));
app.use('/api/admin/inschrijvingen', require('./routes/admin.inschrijvingen.routes'));
app.use('/api/subkampen',           require('./routes/admin.subkampen.routes'));
app.use('/api/plattegrond',         require('./routes/admin.plattegrond.routes'));
app.use('/api/admin/jury',          require('./routes/admin.jury.routes')(io));
app.use('/api/jury',                require('./routes/jury.routes')(io));
app.use('/api/admin',               require('./routes/admin.routes'));
app.use('/api/inschrijving',        require('./routes/inschrijving.routes'));
app.use('/api/admin/programma',     require('./routes/admin.programma.routes'));
app.use('/api/admin/vrijwilligers', require('./routes/admin.vrijwilligers.routes'));
app.use('/api/admin/vrijwilliger-vacatures', require('./routes/admin.vrijwilliger-vacatures.routes'));
app.use('/api/admin/aanvragen', require('./routes/admin.aanvragen.routes'));
app.use('/api/vrijwilliger',        require('./routes/vrijwilliger.routes'));
app.use('/api/publiek',             require('./routes/publiek.routes'));
app.use('/api/rally',               require('./routes/rally.routes'));
app.use('/api/admin/rally',         require('./routes/admin.rally.routes'));

// ── SPA fallback ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return res.status(404).json({ message: `Niet gevonden: ${req.path}` });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`RSW Portaal draait op http://localhost:${PORT}`);
  console.log(`Omgeving: ${process.env.NODE_ENV ?? 'development'}`);
});
