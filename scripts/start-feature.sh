#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# start-feature.sh — Feature branch aanmaken met issue nummer
#
# Gebruik:
#   ./scripts/start-feature.sh 42 login-systeem
#   ./scripts/start-feature.sh 17 plattegrond-editor
#
# Resultaat:
#   feature/42-login-systeem (vanuit develop)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

ISSUE_NR="${1:-}"
DESCRIPTION="${2:-}"

if [ -z "$ISSUE_NR" ] || [ -z "$DESCRIPTION" ]; then
  echo "Gebruik: $0 <issue-nummer> <beschrijving>"
  echo "Voorbeeld: $0 42 login-systeem"
  exit 1
fi

# Beschrijving normaliseren (spaties → koppeltekens, lowercase)
SLUG=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-')
BRANCH="feature/${ISSUE_NR}-${SLUG}"

echo "Feature branch aanmaken: $BRANCH"

git checkout develop
git pull origin develop
git checkout -b "$BRANCH"

echo ""
echo "✓ Branch '$BRANCH' aangemaakt vanuit develop"
echo ""
echo "Na je werk:"
echo "  git push origin $BRANCH"
echo "  Maak een Pull Request → develop"
