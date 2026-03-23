// pages/admin/versie.js — Versie & update beheer (admin)

import { get, post } from '../../services/api.js';
import { APP_VERSION } from '../../config.js';

let versieData = null;

// ── Render ────────────────────────────────────────────────────────

export async function render() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Versie &amp; Updates</h1>
    </div>
    <div id="versie-inhoud"><div class="loading-spinner"></div></div>
  `;
}

export async function onMount() {
  await laadVersieInfo();
}

// ── Data laden ────────────────────────────────────────────────────

async function laadVersieInfo() {
  const el = document.getElementById('versie-inhoud');
  if (!el) return;

  try {
    versieData = await get('/admin/versie');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    return;
  }

  renderPagina();
}

// ── Pagina renderen ───────────────────────────────────────────────

function renderPagina() {
  const el = document.getElementById('versie-inhoud');
  if (!el || !versieData) return;

  const { versie, commit, branch, updateModus, githubRepo, update } = versieData;
  const updateBeschikbaar = update?.updateBeschikbaar ?? false;

  el.innerHTML = `
    <div class="card" style="max-width:640px;">
      <div class="card-header">
        <h2 class="card-title">Huidige installatie</h2>
      </div>
      <div class="card-body">
        <table class="table" style="margin:0;">
          <tbody>
            <tr>
              <td style="width:40%;color:var(--color-text-muted);">Versie</td>
              <td><strong>v${versie ?? APP_VERSION}</strong></td>
            </tr>
            ${commit ? `
            <tr>
              <td style="color:var(--color-text-muted);">Git commit</td>
              <td><code style="font-size:0.85em;">${commit}</code></td>
            </tr>` : ''}
            ${branch ? `
            <tr>
              <td style="color:var(--color-text-muted);">Branch</td>
              <td><code style="font-size:0.85em;">${branch}</code></td>
            </tr>` : ''}
            <tr>
              <td style="color:var(--color-text-muted);">Update modus</td>
              <td>
                <span class="badge ${updateModus === 'direct' ? 'badge-success' : 'badge-info'}">
                  ${updateModus}
                </span>
              </td>
            </tr>
            ${githubRepo ? `
            <tr>
              <td style="color:var(--color-text-muted);">Repository</td>
              <td><code style="font-size:0.85em;">${githubRepo}</code></td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>

    ${renderUpdateKaart(update, updateBeschikbaar, updateModus)}

    <div id="update-resultaat" style="margin-top:1rem;max-width:640px;"></div>
  `;

  document.getElementById('btn-update')?.addEventListener('click', uitvoerenUpdate);
  document.getElementById('btn-herladen')?.addEventListener('click', laadVersieInfo);
}

// ── Update kaart ──────────────────────────────────────────────────

function renderUpdateKaart(update, updateBeschikbaar, modus) {
  // Fout-statussen van de GitHub API
  if (update?.fout) {
    const berichten = {
      geen_toegang: `Geen toegang tot de GitHub repository. Stel <code>GITHUB_TOKEN</code> in voor private repos (status ${update.statusCode}).`,
      api_fout:     `GitHub API gaf een fout terug (status ${update.statusCode}). Controleer <code>GITHUB_REPO</code> in je <code>.env</code>.`,
      netwerk_fout: `Kon GitHub niet bereiken: ${escHtml(update.bericht ?? '')}`,
    };
    return `
      <div class="card" style="max-width:640px;margin-top:1rem;border-color:var(--color-warning);">
        <div class="card-header"><h2 class="card-title">Updates</h2></div>
        <div class="card-body">
          <p style="color:var(--color-warning);">&#9888; ${berichten[update.fout] ?? 'Onbekende fout bij update-controle.'}</p>
          <button id="btn-herladen" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">Opnieuw controleren</button>
        </div>
      </div>
    `;
  }

  if (!update && !updateBeschikbaar) {
    return `
      <div class="card" style="max-width:640px;margin-top:1rem;">
        <div class="card-header">
          <h2 class="card-title">Updates</h2>
        </div>
        <div class="card-body">
          <p style="color:var(--color-text-muted);">Geen GitHub repository geconfigureerd (<code>GITHUB_REPO</code> niet ingesteld in <code>.env</code>).</p>
          <button id="btn-herladen" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">Opnieuw controleren</button>
        </div>
      </div>
    `;
  }

  if (updateBeschikbaar) {
    return `
      <div class="card" style="max-width:640px;margin-top:1rem;border-color:var(--color-warning);">
        <div class="card-header">
          <h2 class="card-title" style="color:var(--color-warning);">&#128280; Update beschikbaar</h2>
        </div>
        <div class="card-body">
          <p>
            Nieuwste versie: <strong>v${update.versie}</strong>
            ${update.gepubliceerdOp ? `&nbsp;&mdash;&nbsp;<span style="color:var(--color-text-muted);font-size:0.9em;">${new Date(update.gepubliceerdOp).toLocaleDateString('nl-NL')}</span>` : ''}
          </p>
          ${update.releaseUrl ? `<p><a href="${update.releaseUrl}" target="_blank" rel="noopener" style="color:var(--color-primary);">Release notes bekijken &#8599;</a></p>` : ''}
          ${update.releaseNotes ? `
            <details style="margin:0.5rem 0;">
              <summary style="cursor:pointer;color:var(--color-text-muted);font-size:0.9em;">Release notes</summary>
              <pre style="margin-top:0.5rem;padding:0.75rem;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:0.78em;white-space:pre-wrap;max-height:200px;overflow:auto;">${escHtml(update.releaseNotes)}</pre>
            </details>` : ''}

          ${modus === 'direct'
            ? `<button id="btn-update" class="btn btn-warning" style="margin-top:0.75rem;">
                &#8593; Update uitvoeren (v${update.versie})
               </button>
               <p style="margin-top:0.5rem;font-size:0.82em;color:var(--color-text-muted);">
                 De server voert <code>git pull</code> + <code>npm ci</code> uit en herstart automatisch.
               </p>`
            : renderDockerInstructies(update.versie)
          }
        </div>
      </div>
    `;
  }

  // Geen update beschikbaar maar GitHub werkt wel
  return `
    <div class="card" style="max-width:640px;margin-top:1rem;">
      <div class="card-header"><h2 class="card-title">Updates</h2></div>
      <div class="card-body">
        <p style="color:var(--color-success);">&#10003; Je draait de nieuwste versie (v${update.versie ?? versieData.versie}).</p>
        <button id="btn-herladen" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">Opnieuw controleren</button>
      </div>
    </div>
  `;
}

function renderDockerInstructies(nieuweVersie) {
  return `
    <div style="margin-top:0.75rem;">
      <p style="color:var(--color-text-muted);font-size:0.9em;margin-bottom:0.5rem;">
        Server draait in Docker/Kubernetes modus. Voer de update handmatig uit:
      </p>
      <button id="btn-update" class="btn btn-secondary btn-sm">Commando&#x27;s ophalen</button>
    </div>
  `;
}

// ── Update uitvoeren ──────────────────────────────────────────────

async function uitvoerenUpdate() {
  const btn = document.getElementById('btn-update');
  const resultEl = document.getElementById('update-resultaat');
  if (!btn || !resultEl) return;

  btn.disabled = true;
  btn.textContent = 'Bezig...';
  resultEl.innerHTML = '';

  try {
    const result = await post('/admin/versie/update', {});

    if (result.modus === 'direct') {
      resultEl.innerHTML = `
        <div class="alert alert-success">
          <strong>Update geslaagd.</strong> Server herstart automatisch&hellip;
          <pre style="margin-top:0.5rem;font-size:0.78em;white-space:pre-wrap;">${escHtml(result.uitvoer ?? '')}</pre>
          <p style="margin-top:0.5rem;">Pagina wordt over 5 seconden herladen.</p>
        </div>
      `;
      setTimeout(() => location.reload(), 5000);
    } else {
      // Docker modus — toon commando's
      resultEl.innerHTML = `
        <div class="card" style="border-color:var(--color-info);">
          <div class="card-header"><h3 class="card-title" style="font-size:1rem;">Update commando&#x27;s</h3></div>
          <div class="card-body">
            <p style="font-size:0.9em;color:var(--color-text-muted);">${escHtml(result.bericht)}</p>
            <pre style="margin-top:0.75rem;padding:0.75rem;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:0.78em;white-space:pre-wrap;">${escHtml(result.commandos ?? '')}</pre>
          </div>
        </div>
      `;
      btn.disabled = false;
      btn.textContent = "Commando's ophalen";
    }
  } catch (e) {
    resultEl.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
    btn.disabled = false;
    btn.textContent = 'Opnieuw proberen';
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function onDestroy() {}
