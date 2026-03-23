// src/services/versie.service.js — Versiebeheer en update-mechanisme

const { execFile } = require('child_process');
const path         = require('path');

const ROOT_DIR    = path.join(__dirname, '..', '..');
const PKG         = require('../../package.json');
const APP_VERSION = PKG.version;

const GITHUB_REPO  = (process.env.GITHUB_REPO  || '').trim();   // bv. "chunkk/rsw-portaal"
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();   // optioneel — voor private repos
const UPDATE_MODUS = (process.env.UPDATE_MODE  || 'docker').trim(); // "direct" of "docker"

// ── Git-info (éénmalig uitgelezen bij opstarten) ──────────────────

function leesSyncOrNull(cmd, args, cwd) {
  try {
    return require('child_process')
      .execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 3000 })
      .trim();
  } catch {
    return null;
  }
}

const GIT_COMMIT = leesSyncOrNull('git', ['rev-parse', '--short', 'HEAD'], ROOT_DIR);
const GIT_BRANCH = leesSyncOrNull('git', ['rev-parse', '--abbrev-ref', 'HEAD'], ROOT_DIR);

// ── Versie-informatie ─────────────────────────────────────────────

function huidig() {
  return {
    versie:      APP_VERSION,
    commit:      GIT_COMMIT,
    branch:      GIT_BRANCH,
    updateModus: UPDATE_MODUS,
    githubRepo:  GITHUB_REPO || null,
  };
}

// ── Controleer op beschikbare update via GitHub API ───────────────
// Probeert eerst Releases (GitHub UI), valt terug op Tags (git tag -a).
// finish-release.sh maakt git tags aan — nog geen GitHub Release vereist.

async function controleOpUpdate() {
  if (!GITHUB_REPO) return null;

  const headers = { 'User-Agent': 'RSW-Portaal-UpdateCheck' };
  if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;

  const opts = { headers, signal: AbortSignal.timeout(8000) };
  const base = `https://api.github.com/repos/${GITHUB_REPO}`;

  try {
    // ── Poging 1: GitHub Releases (/releases/latest) ──────────────
    const relRes = await fetch(`${base}/releases/latest`, opts);

    if (relRes.ok) {
      const data = await relRes.json();
      return bouwUpdateResultaat(
        data.tag_name, data.body ?? null, data.html_url ?? null, data.published_at ?? null
      );
    }

    if (relRes.status === 401 || relRes.status === 403) {
      console.warn(`[versie] GitHub API: geen toegang tot ${GITHUB_REPO} (status ${relRes.status}). Stel GITHUB_TOKEN in voor private repos.`);
      return { fout: 'geen_toegang', statusCode: relRes.status };
    }

    // 404 = repo bestaat of heeft nog geen releases → probeer tags
    // ── Poging 2: Git Tags (/tags) ────────────────────────────────
    const tagRes = await fetch(`${base}/tags?per_page=10`, opts);

    if (!tagRes.ok) {
      console.warn(`[versie] GitHub Tags API: ${tagRes.status} voor ${GITHUB_REPO}`);
      return { fout: 'api_fout', statusCode: tagRes.status };
    }

    const tags = await tagRes.json();
    if (!Array.isArray(tags) || tags.length === 0) {
      console.info(`[versie] Geen tags gevonden in ${GITHUB_REPO}`);
      return { versie: null, updateBeschikbaar: false, releaseNotes: null, releaseUrl: null, gepubliceerdOp: null };
    }

    // Sorteer semantisch en pak de hoogste versietag
    const versietags = tags
      .map(t => t.name.replace(/^v/, ''))
      .filter(v => /^\d+\.\d+\.\d+/.test(v))
      .sort((a, b) => -vergelijkVersie(a, b));

    if (!versietags.length) {
      return { versie: null, updateBeschikbaar: false, releaseNotes: null, releaseUrl: null, gepubliceerdOp: null };
    }

    const repoUrl = `https://github.com/${GITHUB_REPO}`;
    return bouwUpdateResultaat(
      `v${versietags[0]}`, null,
      `${repoUrl}/releases/tag/v${versietags[0]}`, null
    );

  } catch (err) {
    console.warn('[versie] Update-controle mislukt:', err.message);
    return { fout: 'netwerk_fout', bericht: err.message };
  }
}

function bouwUpdateResultaat(tagName, releaseNotes, releaseUrl, gepubliceerdOp) {
  const nieuwsteTag = tagName?.replace(/^v/, '') ?? null;
  return {
    versie:           nieuwsteTag,
    releaseNotes,
    releaseUrl,
    gepubliceerdOp,
    updateBeschikbaar: nieuwsteTag ? vergelijkVersie(APP_VERSION, nieuwsteTag) < 0 : false,
  };
}

// Vergelijkt semver strings. Geeft -1, 0 of 1 terug (net als localeCompare).
function vergelijkVersie(a, b) {
  const nummers = s => s.split('.').map(Number);
  const [aMajor, aMinor, aPatch] = nummers(a);
  const [bMajor, bMinor, bPatch] = nummers(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

// ── Update uitvoeren (alleen in "direct" modus) ───────────────────

function voerUpdateUit() {
  return new Promise((resolve, reject) => {
    if (UPDATE_MODUS !== 'direct') {
      return reject(new Error(
        'UPDATE_MODE is niet "direct". Voer de update handmatig uit via Docker of kubectl.'
      ));
    }

    // Draai update script asynchroon — antwoord terug naar client vóór de herstart.
    execFile(
      'bash',
      [path.join(ROOT_DIR, 'scripts', 'server-update.sh')],
      { cwd: ROOT_DIR, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[versie] Update mislukt:', stderr || err.message);
          reject(new Error(stderr?.trim() || err.message));
        } else {
          console.log('[versie] Update geslaagd:', stdout.trim());
          resolve(stdout.trim());
          // Server herstart na kort delay zodat de HTTP-respons de client bereikt.
          setTimeout(() => {
            console.log('[versie] Server herstart na update...');
            process.exit(0);
          }, 1500);
        }
      }
    );
  });
}

// ── Docker/K8s commando's voor handmatige update ──────────────────

function dockerCommandos(versie) {
  const image = GITHUB_REPO
    ? `${GITHUB_REPO.split('/')[0].toLowerCase()}/rsw-portaal:${versie}`
    : `rsw-portaal:${versie}`;

  return [
    `# 1. Nieuwste image ophalen`,
    `docker pull ${image}`,
    ``,
    `# 2a. Kubernetes — rolling update`,
    `kubectl set image deployment/rsw-portaal app=${image}`,
    `kubectl rollout status deployment/rsw-portaal`,
    ``,
    `# 2b. Docker Compose`,
    `docker compose pull && docker compose up -d`,
  ].join('\n');
}

module.exports = { huidig, controleOpUpdate, voerUpdateUit, dockerCommandos };
