// src/routes/inschrijving.routes.js — Patrouille-inschrijving voor leiding

const router   = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const editieModel    = require('../models/editie.model');
const patModel       = require('../models/patrouille.model');

// Alleen ingelogde leiding (+ admin/org mogen ook beheren)
router.use(requireAuth);

// ── Hulpfunctie: haal actieve editie op of stuur fout ─────────────

async function getActieveEditieOfFout(res) {
  const editie = await editieModel.actieveEditie();
  if (!editie) {
    res.status(404).json({ message: 'Geen actieve editie gevonden' });
    return null;
  }
  return editie;
}

// ── Historische edities (alle niet-actieve edities met eigen patrouilles) ──

router.get('/historisch', async (req, res) => {
  const groepId = req.gebruiker.groep_id;
  if (!groepId) return res.json([]);
  try {
    const [edities] = await require('../config/db').execute(
      'SELECT id, naam, jaar, lsw_datum, locatie, uitslagen_gepubliceerd FROM edities WHERE actief = 0 ORDER BY jaar DESC'
    );
    const result = await Promise.all(edities.map(async (e) => {
      const patrouilles = await patModel.patrouillesVoorGroep(groepId, e.id);
      return { editie: e, patrouilles };
    }));
    res.json(result.filter(r => r.patrouilles.length > 0));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Status ophalen (editie + fase + eigen patrouilles) ────────────

router.get('/status', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const fase    = editieModel.bepaalFase(editie);
    const groepId = req.gebruiker.groep_id;

    if (!groepId && !['admin','organisator'].includes(req.gebruiker.rol)) {
      return res.json({ editie, fase, patrouilles: [],
        melding: 'Jouw account is nog niet gekoppeld aan een scouting-groep. Neem contact op met de organisatie om dit te laten instellen.' });
    }

    const patrouilles = groepId
      ? await patModel.patrouillesVoorGroep(groepId, editie.id)
      : [];

    res.json({ editie, fase, patrouilles });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Detail van één patrouille (inclusief deelnemers)
router.get('/patrouilles/:id', async (req, res) => {
  try {
    const p = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });
    // Leiding mag alleen eigen patrouilles zien
    if (req.gebruiker.rol === 'leiding' && p.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }
    res.json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Patrouille aanmaken (alleen in voorinschrijving) ──────────────

router.post('/patrouilles', requireRole('leiding', 'admin', 'organisator'), async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const fase = editieModel.bepaalFase(editie);
    if (fase !== 'voorinschrijving' && !['admin','organisator'].includes(req.gebruiker.rol)) {
      return res.status(403).json({ message: 'Voorinschrijving is gesloten' });
    }

    const { naam, jongste } = req.body;
    if (!naam?.trim()) return res.status(400).json({ message: 'Naam is verplicht' });

    const groepId = req.body.groep_id ?? req.gebruiker.groep_id;
    if (!groepId) return res.status(400).json({ message: 'Geen groep gekoppeld aan uw account' });

    const p = await patModel.aanmaken({ editie_id: editie.id, groep_id: groepId, naam, jongste });
    res.status(201).json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Patrouille bijwerken ──────────────────────────────────────────

router.put('/patrouilles/:id', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const p = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });

    if (req.gebruiker.rol === 'leiding' && p.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const fase         = editieModel.bepaalFase(editie);
    const isAdmin      = ['admin','organisator'].includes(req.gebruiker.rol);
    const { naam, jongste } = req.body;

    if (fase === 'gesloten' && !isAdmin) {
      return res.status(403).json({ message: 'Inschrijving is gesloten' });
    }

    // Jongste mag alleen in voorinschrijving worden gewijzigd
    const updates = { naam };
    if (fase === 'voorinschrijving' || isAdmin) updates.jongste = jongste;

    const bijgewerkt = await patModel.bijwerken(Number(req.params.id), updates);
    res.json(bijgewerkt);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Patrouille verwijderen (alleen in voorinschrijving) ───────────

router.delete('/patrouilles/:id', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const p    = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });

    if (req.gebruiker.rol === 'leiding' && p.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const fase    = editieModel.bepaalFase(editie);
    const isAdmin = ['admin','organisator'].includes(req.gebruiker.rol);
    if (fase !== 'voorinschrijving' && !isAdmin) {
      return res.status(403).json({ message: 'Patrouilles kunnen niet meer worden verwijderd' });
    }

    await patModel.verwijder(Number(req.params.id));
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Deelnemer toevoegen (alleen tijdens inschrijving) ─────────────

router.post('/patrouilles/:id/deelnemers', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const p = await patModel.vindOpId(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });

    if (req.gebruiker.rol === 'leiding' && p.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const fase    = editieModel.bepaalFase(editie);
    const isAdmin = ['admin','organisator'].includes(req.gebruiker.rol);
    if (!['inschrijving'].includes(fase) && !isAdmin) {
      return res.status(403).json({ message: 'Scouts toevoegen is alleen mogelijk tijdens de inschrijvingsperiode' });
    }

    const { voornaam, achternaam, geboortedatum } = req.body;
    if (!voornaam?.trim()) return res.status(400).json({ message: 'Voornaam is verplicht' });
    if (!achternaam?.trim()) return res.status(400).json({ message: 'Achternaam is verplicht' });
    if (!geboortedatum) return res.status(400).json({ message: 'Geboortedatum is verplicht' });

    const deelnemer = await patModel.voegDeelnemerToe(p.id, { voornaam, achternaam, geboortedatum });
    const bm        = await patModel.herbereken(p.id, editie);
    res.status(201).json({ deelnemer, buiten_mededinging: bm.buiten, bm_reden: bm.reden });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Deelnemer bijwerken ───────────────────────────────────────────

router.put('/deelnemers/:id', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const [[huidig]] = await require('../config/db').execute(
      'SELECT d.id, d.patrouille_id, p.groep_id FROM deelnemers d JOIN patrouilles p ON p.id = d.patrouille_id WHERE d.id=?',
      [Number(req.params.id)]
    );
    if (!huidig) return res.status(404).json({ message: 'Niet gevonden' });

    if (req.gebruiker.rol === 'leiding' && huidig.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const fase    = editieModel.bepaalFase(editie);
    const isAdmin = ['admin','organisator'].includes(req.gebruiker.rol);
    if (fase === 'gesloten' && !isAdmin) {
      return res.status(403).json({ message: 'Inschrijving is gesloten' });
    }

    const { voornaam, achternaam, geboortedatum } = req.body;
    if (!voornaam?.trim()) return res.status(400).json({ message: 'Voornaam is verplicht' });
    if (!achternaam?.trim()) return res.status(400).json({ message: 'Achternaam is verplicht' });
    if (!geboortedatum) return res.status(400).json({ message: 'Geboortedatum is verplicht' });

    const bijgewerkt = await patModel.bijwerkenDeelnemer(Number(req.params.id), { voornaam, achternaam, geboortedatum });
    const bm = await patModel.herbereken(huidig.patrouille_id, editie);
    res.json({ deelnemer: bijgewerkt, buiten_mededinging: bm.buiten, bm_reden: bm.reden });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Deelnemer verwijderen ─────────────────────────────────────────

router.delete('/deelnemers/:id', async (req, res) => {
  try {
    const editie = await getActieveEditieOfFout(res);
    if (!editie) return;

    const patrouilleId = await patModel.verwijderDeelnemer(Number(req.params.id));
    if (patrouilleId === null) return res.status(404).json({ message: 'Niet gevonden' });

    const bm = await patModel.herbereken(patrouilleId, editie);
    res.json({ buiten_mededinging: bm.buiten, bm_reden: bm.reden });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Scorekaart data (voor PDF-export bij prijsuitreiking) ─────────

router.get('/patrouilles/:id/scorekaart', async (req, res) => {
  try {
    const patrouilleId = Number(req.params.id);
    const p = await patModel.vindOpId(patrouilleId);
    if (!p) return res.status(404).json({ message: 'Niet gevonden' });

    // Leiding mag alleen eigen patrouilles
    if (req.gebruiker.rol === 'leiding' && p.groep_id !== req.gebruiker.groep_id) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    const editie = await editieModel.vindOpId(p.editie_id);
    if (!editie) return res.status(404).json({ message: 'Editie niet gevonden' });

    // Leeftijden toevoegen
    if (editie.lsw_datum) {
      p.deelnemers = p.deelnemers.map(d => ({
        ...d,
        leeftijd_lsw: patModel.berekenLeeftijd(d.geboortedatum, editie.lsw_datum),
      }));
    }

    // Uitslagen (gepubliceerd = false zodat org ook kan previewen)
    const juryModel = require('../models/jury.model');
    const { resultaten } = await juryModel.berekenUitslagen(editie.id, false);
    const uitslag   = resultaten.find(u => u.patrouille_id === patrouilleId) || null;

    res.json({
      patrouille: {
        id:                 p.id,
        naam:               p.naam,
        groep_naam:         uitslag?.groep_naam ?? p.groep_naam ?? null,
        vereniging_naam:    uitslag?.vereniging_naam ?? null,
        jongste:            !!p.jongste,
        buiten_mededinging: !!p.buiten_mededinging,
        bm_label:           editie.bm_label ?? null,
        deelnemers:         p.deelnemers,
        nummer:             uitslag?.nummer ?? null,
        subkamp:            uitslag?.subkamp ?? null,
        positie:            uitslag?.positie ?? null,
        jongste_positie:    uitslag?.jongste_positie ?? null,
        eindscore:          uitslag?.eindscore ?? null,
        categorieScores:    uitslag?.categorieScores ?? [],
      },
      editie: {
        id:                     editie.id,
        naam:                   editie.naam,
        jaar:                   editie.jaar,
        lsw_datum:              editie.lsw_datum,
        locatie:                editie.locatie ?? null,
        uitslagen_gepubliceerd: !!editie.uitslagen_gepubliceerd,
      },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
