#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# start-hotfix.sh — Git Flow hotfix branch aanmaken vanuit master
#
# Gebruik:
#   ./scripts/start-hotfix.sh 1.2.1
#
# Workflow:
#   master → hotfix/v{x.y.z} → (fix) → master + tag v{x.y.z} + merge develop
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

NEW_VERSION="${1:-}"

if [ -z "$NEW_VERSION" ]; then
  CURRENT=$(node -p "require('./package.json').version")
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
  echo "Geen versie opgegeven — gebruik patch bump: $CURRENT → $NEW_VERSION"
fi

BRANCH="hotfix/v$NEW_VERSION"

echo "Hotfix branch aanmaken: $BRANCH"
echo ""

git checkout master
git pull origin master

git checkout -b "$BRANCH"

# Versie bijwerken in package.json
npm version "$NEW_VERSION" --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump versie naar $NEW_VERSION voor hotfix"

echo ""
echo "✓ Branch '$BRANCH' aangemaakt vanuit master"
echo "✓ package.json bijgewerkt naar $NEW_VERSION"
echo ""
echo "Fix de bug, commit, en run daarna:"
echo "  ./scripts/finish-release.sh"
