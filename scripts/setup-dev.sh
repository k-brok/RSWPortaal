#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# setup-dev.sh — Eenmalige lokale ontwikkelomgeving instellen
#
# Gebruik (eenmalig na git clone of voor teamleden):
#   ./scripts/setup-dev.sh
#
# Wat dit doet:
#   1. Git flow hooks installeren (symlinks naar .git/hooks/)
#   2. gh CLI check (aanbevolen voor GitHub Releases)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_SRC="$ROOT_DIR/scripts/git-flow-hooks"
HOOKS_DST="$ROOT_DIR/.git/hooks"

echo "=== RSW Portaal — Dev setup ==="
echo ""

# ── 1. Git flow hooks installeren ─────────────────────────────────
echo "→ Git flow hooks installeren..."

HOOKS=(
  filter-flow-release-start-version
  post-flow-release-start
  post-flow-release-finish
  post-flow-hotfix-start
  post-flow-hotfix-finish
)

for hook in "${HOOKS[@]}"; do
  src="$HOOKS_SRC/$hook"
  dst="$HOOKS_DST/$hook"

  if [ ! -f "$src" ]; then
    echo "  ⚠  Bron niet gevonden: $src"
    continue
  fi

  # Verwijder bestaand bestand/link
  [ -e "$dst" ] && rm "$dst"

  # Symlink aanmaken
  ln -s "$src" "$dst"
  chmod +x "$src"
  echo "  ✓ $hook"
done

echo ""

# ── 2. gh CLI check ───────────────────────────────────────────────
echo "→ gh CLI controleren..."
if command -v gh &>/dev/null; then
  if gh auth status &>/dev/null 2>&1; then
    echo "  ✓ gh CLI beschikbaar en ingelogd"
  else
    echo "  ⚠  gh CLI gevonden maar niet ingelogd. Voer uit: gh auth login"
  fi
else
  echo "  ⚠  gh CLI niet gevonden — GitHub Releases worden niet automatisch aangemaakt."
  echo "     Installeer via: https://cli.github.com/"
fi

echo ""
echo "✓ Setup klaar."
echo ""
echo "Workflow:"
echo "  git flow feature start <naam>         → nieuwe feature branch"
echo "  git flow feature finish <naam>        → merge naar develop"
echo "  git flow release start auto           → release branch + auto-versie"
echo "  git flow release finish               → merge + tag + GitHub Release"
echo "  git flow hotfix start <versie>        → hotfix branch + patch bump"
echo "  git flow hotfix finish <versie>       → merge + tag + GitHub Release"
