#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# server-update.sh — In-place server update via git pull
#
# Wordt aangeroepen door versie.service.js wanneer UPDATE_MODE=direct.
# Vereist: git, npm aanwezig in PATH; app draait als een git-checkout.
#
# Na afloop roept versie.service.js process.exit(0) aan zodat de
# process manager (Docker restartPolicy, pm2, supervisor) herstart.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== RSW Portaal Server Update ==="
echo "Tijdstip : $(date)"
echo "Werkmap  : $(pwd)"
echo ""

# ── 1. Controleer of er geen lokale wijzigingen zijn ──────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "FOUT: Er zijn niet-gecommitte wijzigingen aanwezig."
  echo "Commit of stash deze eerst voor een update."
  git status --short
  exit 1
fi

# ── 2. Haal laatste code op van master ───────────────────────────
echo "→ git fetch..."
git fetch origin master

VOOR=$(git rev-parse --short HEAD)
ACHTER=$(git rev-parse --short FETCH_HEAD)

if [ "$VOOR" = "$ACHTER" ]; then
  echo "✓ Al op de nieuwste versie ($VOOR). Geen update nodig."
  exit 0
fi

echo "→ git pull (${VOOR} → ${ACHTER})..."
git pull origin master

# ── 3. Installeer dependencies (alleen productie) ────────────────
echo ""
echo "→ npm ci --omit=dev..."
npm ci --omit=dev

echo ""
echo "✓ Update geslaagd (${VOOR} → ${ACHTER})"
echo "  Server herstart automatisch via versie.service.js"
