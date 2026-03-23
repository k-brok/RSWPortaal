#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# start-release.sh — Git Flow release branch aanmaken
#
# Gebruik:
#   ./scripts/start-release.sh            → auto-detectie op basis van commits
#   ./scripts/start-release.sh 1.2.0      → versie direct opgeven (override)
#
# Workflow:
#   develop → release/v{x.y.z} → (review + bugfixes) → finish-release.sh
#
# Commit conventies (Conventional Commits):
#   fix:           patch bump  (0.1.0 → 0.1.1)
#   feat:          minor bump  (0.1.0 → 0.2.0)
#   feat!:         major bump  (0.1.0 → 1.0.0)
#   BREAKING CHANGE: in commit body → major bump
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

OVERRIDE_VERSION="${1:-}"

# ── Zorg dat we op develop zitten ────────────────────────────────
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "develop" ]; then
  echo "Switch naar develop..."
  git checkout develop
fi
git pull origin develop

HUIDIGE_VERSIE=$(node -p "require('./package.json').version")

# ── Versie bepalen ────────────────────────────────────────────────

if [ -n "$OVERRIDE_VERSION" ]; then
  # Directe opgave — geen auto-detectie
  NIEUWE_VERSIE="$OVERRIDE_VERSION"
  echo "Versie handmatig opgegeven: $NIEUWE_VERSIE"
else
  # Auto-detectie op basis van commits en merges sinds de laatste tag

  LAATSTE_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

  if [ -z "$LAATSTE_TAG" ]; then
    echo "Geen eerdere tag gevonden — gebruik patch bump als minimum."
    COMMITS=$(git log --oneline --no-merges)
    MERGES=$(git log --oneline --merges)
  else
    echo "Analyse van commits sinds $LAATSTE_TAG..."
    COMMITS=$(git log "${LAATSTE_TAG}..HEAD" --oneline --no-merges)
    MERGES=$(git log  "${LAATSTE_TAG}..HEAD" --oneline --merges)
  fi

  # Detecteer bump type vanuit commit messages (Conventional Commits)
  BUMP="patch"  # minimum

  # Breaking change → major
  if echo "$COMMITS" | grep -qiE "^[a-f0-9]+ [a-z]+(\(.+\))?!:" || \
     git log "${LAATSTE_TAG:-}${LAATSTE_TAG:+..}HEAD" --format="%B" 2>/dev/null \
       | grep -qi "^BREAKING CHANGE:"; then
    BUMP="major"
  # feat: → minor (als nog geen major)
  elif echo "$COMMITS" | grep -qE "^[a-f0-9]+ feat(\(.+\))?:"; then
    BUMP="minor"
  fi

  # Overschrijf op basis van branch-namen in merges (feature/* → minimaal minor)
  if [ "$BUMP" = "patch" ] && echo "$MERGES" | grep -qE "feature/"; then
    BUMP="minor"
  fi

  # Bereken nieuwe versie
  IFS='.' read -r MAJOR MINOR PATCH <<< "$HUIDIGE_VERSIE"
  case "$BUMP" in
    major) NIEUWE_VERSIE="$((MAJOR + 1)).0.0" ;;
    minor) NIEUWE_VERSIE="$MAJOR.$((MINOR + 1)).0" ;;
    patch) NIEUWE_VERSIE="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  esac

  echo ""
  echo "Gedetecteerd: $BUMP bump"
  if [ -n "$COMMITS" ]; then
    echo ""
    echo "Commits sinds ${LAATSTE_TAG:-begin}:"
    echo "$COMMITS" | head -20 | sed 's/^/  /'
    TOTAAL=$(echo "$COMMITS" | wc -l | tr -d ' ')
    [ "$TOTAAL" -gt 20 ] && echo "  ... en $((TOTAAL - 20)) meer"
  fi
fi

echo ""
echo "Versie: $HUIDIGE_VERSIE → $NIEUWE_VERSIE"
echo ""
read -rp "Doorgaan met v$NIEUWE_VERSIE? [j/n/versie]: " BEVESTIG

case "$BEVESTIG" in
  j|J|"") ;;                          # akkoord
  n|N) echo "Afgebroken."; exit 0 ;;
  *)   NIEUWE_VERSIE="$BEVESTIG"      # eigen versie ingetypt
       echo "Override naar $NIEUWE_VERSIE"
       ;;
esac

BRANCH="release/v$NIEUWE_VERSIE"

# ── Branch aanmaken + versie ophogen ─────────────────────────────
git checkout -b "$BRANCH"

npm version "$NIEUWE_VERSIE" --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump versie naar $NIEUWE_VERSIE"

echo ""
echo "✓ Branch '$BRANCH' aangemaakt"
echo "✓ package.json bijgewerkt naar $NIEUWE_VERSIE"
echo ""
echo "Volgende stappen:"
echo "  1. Test de release kandidaat"
echo "  2. Commit eventuele last-minute fixes direct op deze branch"
echo "  3. Rond de release af:"
echo "     ./scripts/finish-release.sh"
