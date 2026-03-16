// src/routes/auth.routes.js — Auth routes met rate limiting

const router      = require('express').Router();
const rateLimit   = require('express-rate-limit');
const controller  = require('../controllers/auth.controller');

// Strikte limiet voor login/registratie (max 10 pogingen per 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Te veel pogingen. Probeer het over 15 minuten opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Soepelere limiet voor wachtwoord-vergeten (max 5 per uur)
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Te veel verzoeken. Probeer het over een uur opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/registreer',          authLimiter,  controller.registreer);
router.get( '/verifieer/:token',                  controller.verifieerEmail);
router.post('/login',               authLimiter,  controller.login);
router.post('/logout',                            controller.logout);
router.post('/refresh',                           controller.refresh);
router.post('/wachtwoord-vergeten', resetLimiter, controller.wachtwoordVergeten);
router.post('/wachtwoord-reset',                  controller.wachtwoordReset);

module.exports = router;
