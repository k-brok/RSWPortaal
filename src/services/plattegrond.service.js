// src/services/plattegrond.service.js — Auto-indeling en nummering logica
// Cellen zijn vrij gepositioneerd: { id, x, y, w, h, type, subkamp_id, ... }
// Afstand = Euclidisch tussen centers van cellen

function center(cel) {
  return { x: cel.x + cel.w / 2, y: cel.y + cel.h / 2 };
}

function euclidisch(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Centroïd van alle cellen in een subkamp (gewogen middelpunt)
function subkampCentroid(subkampId, cellen) {
  const sc = Object.values(cellen).filter(c => c.subkamp_id === subkampId && c.type !== 'onbruikbaar');
  if (!sc.length) return null;
  return {
    x: sc.reduce((s, c) => s + c.x + c.w / 2, 0) / sc.length,
    y: sc.reduce((s, c) => s + c.y + c.h / 2, 0) / sc.length,
  };
}

/**
 * Auto-indeling — verdeelt patrouilles over wedstrijdcellen.
 *
 * Harde constraints (in volgorde toegepast):
 *   H1. Jongste patrouilles mogen ALLEEN in het jongste subkamp.
 *   H2. Een patrouille mag NOOIT in het subkamp waar zijn eigen groep de staf is
 *       (subkamp.groep_id === patrouille.groep_id).
 *
 * Spreidingsscore per kandidaat-subkamp (hogere score = betere keuze):
 *   P1 (W=10000): minimale afstand tot geplaatste patrouilles uit dezelfde groep.
 *   P2 (W=100):   minimale afstand tot geplaatste patrouilles uit dezelfde vereniging
 *                 als de staf van het kandidaat-subkamp (subkamp.vereniging_id).
 *   P3 (W=1):     minimale afstand tot geplaatste patrouilles uit dezelfde vereniging.
 *
 * Afstand = Euclidisch tussen exacte celcentra (hemelsbreed).
 * Als er nog geen beperkende genoten geplaatst zijn, geldt MAX_DIST (→ neutraal).
 */
function autoIndeling(subkampen, patrouilles, cellen) {
  const nieuw = JSON.parse(JSON.stringify(cellen));
  for (const c of Object.values(nieuw)) c.patrouille_id = null;

  // Beschikbare wedstrijdcellen per subkamp (gesorteerd voor determinisme)
  const vrij = {};
  for (const s of subkampen) {
    vrij[s.id] = Object.values(nieuw)
      .filter(c => c.subkamp_id === s.id && c.type === 'wedstrijd')
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }

  const subMap      = Object.fromEntries(subkampen.map(s => [s.id, s]));
  const jongsteSubId = subkampen.find(s => s.is_jongste)?.id ?? null;

  const subIds = subkampen
    .sort((a, b) => a.volgorde - b.volgorde)
    .map(s => s.id)
    .filter(id => vrij[id]?.length > 0);

  if (!subIds.length) return nieuw;

  // Snelle lookups voor patrouille-eigenschappen
  const groepVan = Object.fromEntries(patrouilles.map(p => [p.id, p.groep_id]));
  const verVan   = Object.fromEntries(patrouilles.map(p => [p.id, p.vereniging_id ?? null]));

  // Geplaatste patrouilles: lijst van { patId, pos } voor afstandsberekening
  const geplaatst = [];

  const W1 = 10000, W2 = 100, W3 = 1;
  const MAX_DIST = 1e9; // neutraal als er geen genoten zijn

  // Harde constraints: geeft de toegestane subkampen terug voor pat.
  // fallback=true: jongste-restrictie vervalt (bij tweede pass als jongste subkamp vol is).
  function kandidaten(pat, fallback = false) {
    return subIds.filter(sId => {
      if (!vrij[sId]?.length) return false;
      const sub = subMap[sId];
      // H1: jongste patrouille → alleen jongste subkamp
      if (pat.jongste && !fallback) return sId === jongsteSubId;
      // H2: nooit in subkamp van eigen staf-groep
      if (sub.groep_id != null && sub.groep_id === pat.groep_id) return false;
      return true;
    });
  }

  // Gewogen spreidingsscore voor pat in kandidaat-subkamp sId.
  // Hogere score = meer gespreide plaatsing.
  function spreadScore(pat, sId) {
    const subVereniging = subMap[sId]?.vereniging_id ?? null;
    const cand = subkampCentroid(sId, nieuw); // centroid van kandidaat (proxy voor positie)
    if (!cand) return 0;

    let d1 = MAX_DIST, d2 = MAX_DIST, d3 = MAX_DIST;

    for (const { patId, pos } of geplaatst) {
      const dist = euclidisch(cand, pos);
      // P1: zelfde groep
      if (groepVan[patId] === pat.groep_id)
        d1 = Math.min(d1, dist);
      // P2: geplaatste pat heeft zelfde vereniging als staf van kandidaat-subkamp
      if (subVereniging !== null && verVan[patId] === subVereniging)
        d2 = Math.min(d2, dist);
      // P3: zelfde vereniging als te plaatsen pat
      if (pat.vereniging_id !== null && verVan[patId] === pat.vereniging_id)
        d3 = Math.min(d3, dist);
    }

    return W1 * d1 + W2 * d2 + W3 * d3;
  }

  // Kies het beste kandidaat-subkamp en wijs de cel toe.
  function plaatsPat(pat, kands) {
    const beschikbaar = kands.filter(id => vrij[id]?.length > 0);
    if (!beschikbaar.length) return false;

    let besteSubId = beschikbaar[0];
    let besteScore = -1;
    for (const sId of beschikbaar) {
      const score = spreadScore(pat, sId);
      if (score > besteScore) { besteScore = score; besteSubId = sId; }
    }

    const cel = vrij[besteSubId].shift();
    nieuw[cel.id].patrouille_id = pat.id;
    geplaatst.push({ patId: pat.id, pos: center(cel) });
    return true;
  }

  // Splits op in jongste en normale patrouilles.
  // Jongste worden ALTIJD eerst geplaatst zodat normale patrouilles geen
  // cellen in het jongste subkamp kunnen bezetten vóórdat alle jongste
  // patrouilles hun plek hebben gekregen.
  const jongsten = patrouilles.filter(p => p.jongste);
  const normalen = patrouilles.filter(p => !p.jongste);

  function roundRobin(lijst) {
    const perGroep = {};
    for (const p of lijst) (perGroep[p.groep_id] ??= []).push(p);
    const groepen = Object.values(perGroep);
    const over = [];
    while (groepen.some(g => g.length > 0)) {
      for (const groep of groepen) {
        if (!groep.length) continue;
        const pat = groep.shift();
        if (!plaatsPat(pat, kandidaten(pat))) over.push(pat);
      }
    }
    return over;
  }

  // Pass 1a: jongste patrouilles → alleen jongste subkamp
  const niePlacedJongste = roundRobin(jongsten);

  // Pass 1b: normale patrouilles → alle subkampen (inclusief jongste als er nog plek is)
  const niePlacedNormaal = roundRobin(normalen);

  // Pass 2: resterende jongste patrouilles zonder jongste-restrictie (subkamp was vol)
  for (const pat of niePlacedJongste) {
    plaatsPat(pat, kandidaten(pat, true));
  }
  // Pass 2: resterende normale patrouilles (H2-constraint te streng, geen plek gevonden)
  for (const pat of niePlacedNormaal) {
    plaatsPat(pat, kandidaten(pat, true));
  }

  return nieuw;
}

/**
 * Spreiding-scores per patrouille:
 * score = min. Euclidische afstand (via celcentra) tot dichtstbijzijnde groepgenoot.
 * Geen groepgenoten → maximale score.
 */
function berekenScores(cellen, patrouilles) {
  const posities = {};
  for (const cel of Object.values(cellen)) {
    if (cel.patrouille_id != null) posities[cel.patrouille_id] = center(cel);
  }

  const perGroep = {};
  for (const p of patrouilles) (perGroep[p.groep_id] ??= []).push(p.id);

  const scores = {};
  for (const p of patrouilles) {
    const pos = posities[p.id];
    if (!pos) { scores[p.id] = 0; continue; }
    const genoten = (perGroep[p.groep_id] ?? []).filter(id => id !== p.id && posities[id]);
    scores[p.id] = genoten.length
      ? Math.min(...genoten.map(id => euclidisch(pos, posities[id])))
      : 9999;
  }
  return scores;
}

/**
 * Ken patrouillenummers toe op basis van subkamp-volgorde.
 * Binnen elk subkamp: van boven-links naar rechts-onder.
 */
function berekenNummers(subkampen, cellen) {
  const nieuw = JSON.parse(JSON.stringify(cellen));
  for (const c of Object.values(nieuw)) c.nummer = null;

  let nr = 1;
  for (const sub of [...subkampen].sort((a, b) => a.volgorde - b.volgorde)) {
    Object.values(nieuw)
      .filter(c => c.subkamp_id === sub.id && c.type === 'wedstrijd' && c.patrouille_id != null)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(c => { c.nummer = nr++; });
  }
  return nieuw;
}

module.exports = { autoIndeling, berekenScores, berekenNummers };
