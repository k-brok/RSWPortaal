#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# finish-release.sh — Release afronden: merge naar master + tag + develop
#
# Gebruik:
#   ./scripts/finish-release.sh
#
# Draai dit op de release/* branch.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$CURRENT_BRANCH" != release/* ]]; then
  echo "ERROR: Je zit niet op een release/* branch (huidig: $CURRENT_BRANCH)"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo "Release afronden: $CURRENT_BRANCH → master + develop"
echo "Tag: $TAG"
echo ""
read -rp "Doorgaan? (j/n): " CONFIRM
if [ "$CONFIRM" != "j" ]; then
  echo "Afgebroken."
  exit 0
fi

# Merge naar master
git checkout master
git pull origin master
git merge --no-ff "$CURRENT_BRANCH" -m "release: merge $CURRENT_BRANCH naar master"

# Tag aanmaken
git tag -a "$TAG" -m "Release $TAG"

# Merge ook terug naar develop
git checkout develop
git pull origin develop
git merge --no-ff "$CURRENT_BRANCH" -m "release: merge $CURRENT_BRANCH terug naar develop"

echo ""
echo "✓ Release $TAG afgerond"
echo ""
echo "Vergeet niet te pushen:"
echo "  git push origin master develop $TAG"
echo ""
echo "Docker Hub tags die automatisch worden aangemaakt door CI:"
echo "  chunkk/rsw-portaal:$VERSION"
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f1-2)
echo "  chunkk/rsw-portaal:$MINOR"
echo "  chunkk/rsw-portaal:$MAJOR  (niet bij 0.x versies)"
echo "  chunkk/rsw-portaal:latest"
