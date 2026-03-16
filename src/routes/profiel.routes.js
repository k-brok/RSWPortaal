// src/routes/profiel.routes.js

const router     = require('express').Router();
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/profiel.controller');

router.get( '/',                        requireAuth, controller.getProfiel);
router.post('/wachtwoord-wijzigen',     requireAuth, controller.wijzigWachtwoord);
router.post('/email-wijzigen',          requireAuth, controller.vraagEmailWijziging);
router.get( '/email-bevestigen/:token',              controller.bevestigEmailWijziging);

module.exports = router;
