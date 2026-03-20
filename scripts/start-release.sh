#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# start-release.sh — Git Flow release branch aanmaken
#
# Gebruik:
#   ./scripts/start-release.sh            → versie uit package.json
#   ./scripts/start-release.sh 1.2.0      → directe versie opgeven
#
# Workflow:
#   develop → release/v{x.y.z} → (review) → master + tag v{x.y.z} + merge back develop
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./package.json').version")
fi

BRANCH="release/v$VERSION"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "Release branch aanmaken: $BRANCH"
echo ""

# Zorg dat we op develop zitten en up-to-date zijn
if [ "$CURRENT_BRANCH" != "develop" ]; then
  echo "Switch naar develop..."
  git checkout develop
fi

git pull origin develop

# Branch aanmaken
git checkout -b "$BRANCH"

echo "✓ Branch '$BRANCH' aangemaakt vanuit develop"
echo ""
echo "Volgende stappen:"
echo "  1. Test de release kandidaat"
echo "  2. Fix eventuele bugs direct op deze branch (bugfix commits)"
echo "  3. Merge naar master + tag:"
echo "     ./scripts/finish-release.sh"
