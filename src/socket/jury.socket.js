// src/socket/jury.socket.js — Socket.io handlers voor jurering

const juryModel = require('../models/jury.model');
const { verifyAccessToken } = require('../services/auth.service');

// Room namen
const juryRoom      = (momentId, subkampId) => `jury:${momentId}:${subkampId}`;
const orgRoom       = (momentId) => `org:${momentId}`;
const uitslagenRoom = (editieId) => `uitslagen:${editieId}`;

function initJurySockets(io) {
  io.on('connection', (socket) => {

    // ── Jury lid verbindt via QR token ─────────────────────────────
    socket.on('jury:join', async ({ token } = {}) => {
      if (!token) {
        return socket.emit('jury:error', { message: 'Token ontbreekt' });
      }

      try {
        const data = await juryModel.vindToken(token);
        if (!data) {
          return socket.emit('jury:error', { message: 'Ongeldig token' });
        }

        if (!juryModel.isOpen(data.moment)) {
          return socket.emit('jury:error', { message: 'Dit jureermoment is gesloten' });
        }

        const kamer = juryRoom(data.moment.id, data.subkamp.id);
        socket.join(kamer);

        // Token opslaan op socket voor latere validatie
        socket.juryToken = token;
        socket.juryMomentId = data.moment.id;
        socket.jurySubkampId = data.subkamp.id;

        socket.emit('jury:ready', data);
      } catch (err) {
        console.error('[jury:join]', err.message);
        socket.emit('jury:error', { message: 'Serverfout bij verbinden' });
      }
    });

    // ── Score opslaan via socket ───────────────────────────────────
    socket.on('jury:score', async ({ token, patrouille_id, criterium_id, score } = {}, ack) => {
      if (!token || patrouille_id == null || criterium_id == null || score == null) {
        return socket.emit('jury:error', { message: 'Ongeldige score-data' });
      }

      try {
        const tokenData = await juryModel.vindToken(token);
        if (!tokenData) {
          return socket.emit('jury:error', { message: 'Ongeldig token' });
        }

        if (!juryModel.isOpen(tokenData.moment)) {
          socket.emit('jury:moment:closed', {});
          return;
        }

        const momentId  = tokenData.moment.id;
        const subkampId = tokenData.subkamp.id;

        await juryModel.slaScoreOp(momentId, subkampId, patrouille_id, criterium_id, score);

        const update = { patrouille_id, criterium_id, score };

        // Stuur naar alle jury's in dezelfde kamer
        io.to(juryRoom(momentId, subkampId)).emit('jury:score:updated', update);

        // Stuur ook naar organisator live-view
        io.to(orgRoom(momentId)).emit('org:score:updated', {
          subkamp_id: subkampId, ...update,
        });

        // Stuur naar uitslagen watchers
        const moment = await juryModel.vindMoment(momentId);
        if (moment?.editie_id) {
          io.to(uitslagenRoom(moment.editie_id)).emit('uitslagen:updated');
        }

        // Bevestiging naar afzender
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('[jury:score]', err.message);
        socket.emit('jury:error', { message: 'Score opslaan mislukt' });
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    // ── Uitslagen watcher ──────────────────────────────────────────
    socket.on('uitslagen:join', ({ editieId } = {}) => {
      if (editieId) socket.join(uitslagenRoom(editieId));
    });

    // ── Organisator verbindt voor live overzicht ───────────────────
    socket.on('org:join', async ({ momentId, authToken } = {}) => {
      if (!momentId || !authToken) {
        return socket.emit('jury:error', { message: 'momentId en authToken vereist' });
      }

      try {
        const gebruiker = verifyAccessToken(authToken);
        if (!['admin', 'organisator'].includes(gebruiker.rol)) {
          return socket.emit('jury:error', { message: 'Geen toegang' });
        }

        socket.join(orgRoom(momentId));

        const scores = await juryModel.alleScoresMoment(momentId);
        socket.emit('org:scores', { momentId, scores });
      } catch (err) {
        console.error('[org:join]', err.message);
        socket.emit('jury:error', { message: 'Verbinden als organisator mislukt' });
      }
    });
  });
}

module.exports = initJurySockets;
