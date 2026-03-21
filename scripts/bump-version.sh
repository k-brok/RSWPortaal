#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# bump-version.sh — Semver versie ophogen in package.json
#
# Gebruik:
#   ./scripts/bump-version.sh patch    → 0.1.0 → 0.1.1
#   ./scripts/bump-version.sh minor    → 0.1.0 → 0.2.0
#   ./scripts/bump-version.sh major    → 0.1.0 → 1.0.0
#   ./scripts/bump-version.sh 1.5.2    → 0.1.0 → 1.5.2  (directe versie)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

BUMP_TYPE="${1:-}"

if [ -z "$BUMP_TYPE" ]; then
  echo "Gebruik: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

# Huidige versie ophalen
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  patch)
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
  minor)
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
    ;;
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  [0-9]*.[0-9]*.[0-9]*)
    NEW_VERSION="$BUMP_TYPE"
    ;;
  *)
    echo "Ongeldig type: '$BUMP_TYPE'. Kies patch, minor, major of x.y.z"
    exit 1
    ;;
esac

echo "Versie: $CURRENT → $NEW_VERSION"

# package.json bijwerken via npm
npm version "$NEW_VERSION" --no-git-tag-version

echo "✓ package.json bijgewerkt naar $NEW_VERSION"
echo ""
echo "Volgende stap — maak een release branch:"
echo "  ./scripts/start-release.sh"
