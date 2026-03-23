#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# finish-release.sh — Release afronden: merge → master + tag + develop
#                     + GitHub Release aanmaken (via gh CLI)
#
# Gebruik:
#   ./scripts/finish-release.sh
#
# Draai dit op de release/* of hotfix/* branch.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$CURRENT_BRANCH" != release/* ]] && [[ "$CURRENT_BRANCH" != hotfix/* ]]; then
  echo "FOUT: Je zit niet op een release/* of hotfix/* branch (huidig: $CURRENT_BRANCH)"
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

# ── Release notes genereren (vóór de merge) ───────────────────────

LAATSTE_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

genereer_notes() {
  local ref_range="${LAATSTE_TAG:+${LAATSTE_TAG}..}HEAD"

  local breaking feat fix chore overig
  breaking=$(git log $ref_range --no-merges --format="%s" \
    | grep -E "^[a-z]+(\(.+\))?!:|BREAKING CHANGE" || true)
  feat=$(git log    $ref_range --no-merges --format="%s" \
    | grep -E "^feat(\(.+\))?:" || true)
  fix=$(git log     $ref_range --no-merges --format="%s" \
    | grep -E "^fix(\(.+\))?:" || true)
  chore=$(git log   $ref_range --no-merges --format="%s" \
    | grep -E "^(chore|refactor|perf|test|docs|style|ci|build)(\(.+\))?:" || true)
  overig=$(git log  $ref_range --no-merges --format="%s" \
    | grep -vE "^(feat|fix|chore|refactor|perf|test|docs|style|ci|build)(\(.+\))?:?" || true)

  local notes=""
  [ -n "$breaking" ] && notes+=$'\n## ⚠️ Breaking Changes\n'"$(echo "$breaking" | sed 's/^/- /')"
  [ -n "$feat"     ] && notes+=$'\n## ✨ Nieuwe functies\n'"$(echo "$feat"     | sed 's/^feat\(\(.*\)\)\?: //' | sed 's/^/- /')"
  [ -n "$fix"      ] && notes+=$'\n## 🐛 Bugfixes\n'"$(echo "$fix"      | sed 's/^fix\(\(.*\)\)\?: //'  | sed 's/^/- /')"
  [ -n "$chore"    ] && notes+=$'\n## 🔧 Overige wijzigingen\n'"$(echo "$chore"    | sed 's/^/- /')"
  [ -n "$overig"   ] && notes+=$'\n## 📝 Overig\n'"$(echo "$overig"    | sed 's/^/- /')"

  if [ -z "$notes" ]; then
    notes=$'\nGeen commit-details beschikbaar.'
  fi

  echo "$notes"
}

RELEASE_NOTES=$(genereer_notes)

echo ""
echo "── Release notes ──────────────────────────────────────────"
echo "$RELEASE_NOTES"
echo "────────────────────────────────────────────────────────────"
echo ""

# ── Merge naar master ─────────────────────────────────────────────
git checkout master
git pull origin master
git merge --no-ff "$CURRENT_BRANCH" -m "release: merge $CURRENT_BRANCH naar master"

# ── Tag aanmaken ──────────────────────────────────────────────────
git tag -a "$TAG" -m "Release $TAG"

# ── Merge terug naar develop ──────────────────────────────────────
git checkout develop
git pull origin develop
git merge --no-ff "$CURRENT_BRANCH" -m "release: merge $CURRENT_BRANCH terug naar develop"

echo ""
echo "✓ Release $TAG afgerond (master + develop bijgewerkt)"
echo ""

# ── Push ──────────────────────────────────────────────────────────
read -rp "Push naar origin (master, develop, $TAG)? (j/n): " PUSH
if [ "$PUSH" = "j" ]; then
  git push origin master develop "$TAG"
  echo "✓ Gepusht"
  echo ""

  # ── GitHub Release aanmaken (via gh CLI) ─────────────────────
  if command -v gh &>/dev/null; then
    echo "→ GitHub Release aanmaken via gh CLI..."
    gh release create "$TAG" \
      --title "Release $TAG" \
      --notes "$RELEASE_NOTES" \
      --latest
    echo "✓ GitHub Release aangemaakt: $TAG"
    echo "  → Het portaal detecteert deze release bij de volgende update-controle."
  else
    echo "⚠  'gh' CLI niet gevonden — GitHub Release handmatig aanmaken:"
    REPO_URL=$(git remote get-url origin 2>/dev/null \
      | sed 's/git@github.com:/https:\/\/github.com\//' \
      | sed 's/\.git$//')
    echo "   $REPO_URL/releases/new?tag=$TAG"
    echo ""
    echo "   Of installeer de gh CLI: https://cli.github.com/"
  fi
else
  echo "Niet gepusht. Push handmatig met:"
  echo "  git push origin master develop $TAG"
fi

echo ""
echo "── Docker tags (via CI na push) ────────────────────────────"
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f1-2)
echo "  chunkk/rsw-portaal:$VERSION"
echo "  chunkk/rsw-portaal:$MINOR"
[ "$MAJOR" != "0" ] && echo "  chunkk/rsw-portaal:$MAJOR"
echo "  chunkk/rsw-portaal:latest"
echo "────────────────────────────────────────────────────────────"
