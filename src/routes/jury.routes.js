// src/routes/jury.routes.js — Publieke jury routes (geen auth vereist)

const juryModel = require('../models/jury.model');

// Factory export zodat io meegegeven kan worden
module.exports = (io) => {
  const router  = require('express').Router();
  const orgRoom = (momentId) => `org:${momentId}`;

  // GET /t/:token — haal jury formulier data op
  router.get('/t/:token', async (req, res) => {
    try {
      const data = await juryModel.vindToken(req.params.token);
      if (!data) return res.status(404).json({ message: 'Ongeldig token' });

      if (!juryModel.isOpen(data.moment)) {
        return res.status(403).json({ message: 'Dit jureermoment is gesloten', gesloten: true });
      }

      res.json(data);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  // PUT /t/:token/score — sla score op en emit socket event
  router.put('/t/:token/score', async (req, res) => {
    const { patrouille_id, criterium_id, score } = req.body;

    if (patrouille_id == null || criterium_id == null || score == null)
      return res.status(400).json({ message: 'patrouille_id, criterium_id en score zijn verplicht' });

    try {
      const data = await juryModel.vindToken(req.params.token);
      if (!data) return res.status(404).json({ message: 'Ongeldig token' });

      if (!juryModel.isOpen(data.moment)) {
        return res.status(403).json({ message: 'Dit jureermoment is gesloten', gesloten: true });
      }

      const momentId  = data.moment.id;
      const subkampId = data.subkamp.id;

      await juryModel.slaScoreOp(momentId, subkampId, patrouille_id, criterium_id, score);

      const update = { patrouille_id, criterium_id, score };

      // Broadcast naar jury kamer en org kamer
      if (io) {
        io.to(`jury:${momentId}:${subkampId}`).emit('jury:score:updated', update);
        io.to(orgRoom(momentId)).emit('org:score:updated', { subkamp_id: subkampId, ...update });
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  });

  return router;
};
