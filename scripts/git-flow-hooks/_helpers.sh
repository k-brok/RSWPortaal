#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# _helpers.sh — Gedeelde functies voor git flow hooks
# Niet direct uitvoeren — wordt ge-sourcet door de andere hooks.
# ─────────────────────────────────────────────────────────────────

ROOT_DIR="$(git rev-parse --show-toplevel)"

# ── Versie-detectie vanuit commit messages ────────────────────────
# Analyseert commits (Conventional Commits) én branch-namen
# Geeft "major", "minor" of "patch" terug

detecteer_bump_type() {
  local laatste_tag bump="patch"

  laatste_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

  local ref_range="${laatste_tag:+${laatste_tag}..}HEAD"

  # Breaking change → major
  if git log $ref_range --no-merges --format="%s%n%b" 2>/dev/null \
       | grep -qiE "^(BREAKING.CHANGE:|[a-z]+(\(.+\))?!:)"; then
    bump="major"
  # feat: → minor
  elif git log $ref_range --no-merges --format="%s" 2>/dev/null \
         | grep -qE "^feat(\(.+\))?:"; then
    bump="minor"
  fi

  # Feature-branchmerges → minimaal minor (ook als commits niet geclassificeerd zijn)
  if [ "$bump" = "patch" ] && \
     git log $ref_range --merges --format="%s" 2>/dev/null \
       | grep -qE "feature/"; then
    bump="minor"
  fi

  echo "$bump"
}

# ── Nieuwe versienummer berekenen ─────────────────────────────────
# Gebruik: bereken_versie <bump_type>    → bijv. bereken_versie minor

bereken_versie() {
  local bump="$1"
  local huidig
  huidig=$(node -p "require('${ROOT_DIR}/package.json').version" 2>/dev/null \
           || cat "${ROOT_DIR}/package.json" | grep '"version"' \
              | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')

  IFS='.' read -r MAJOR MINOR PATCH <<< "$huidig"
  case "$bump" in
    major) echo "$((MAJOR + 1)).0.0" ;;
    minor) echo "${MAJOR}.$((MINOR + 1)).0" ;;
    *)     echo "${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  esac
}

# ── Versie ophogen in package.json en committen ───────────────────

bump_package_json() {
  local versie="$1"
  cd "$ROOT_DIR"
  npm version "$versie" --no-git-tag-version --silent
  git add package.json package-lock.json 2>/dev/null || true
  git commit -m "chore: bump versie naar $versie" --quiet
  echo "✓ package.json bijgewerkt naar $versie"
}

# ── Release notes genereren vanuit commits ────────────────────────

genereer_release_notes() {
  local laatste_tag ref_range
  laatste_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  ref_range="${laatste_tag:+${laatste_tag}..}HEAD"

  local breaking feat fix overig notes=""

  breaking=$(git log $ref_range --no-merges --format="%s" 2>/dev/null \
    | grep -E "^[a-z]+(\(.+\))?!:" || true)
  feat=$(git log    $ref_range --no-merges --format="%s" 2>/dev/null \
    | grep -E "^feat(\(.+\))?:"     || true)
  fix=$(git log     $ref_range --no-merges --format="%s" 2>/dev/null \
    | grep -E "^fix(\(.+\))?:"      || true)
  overig=$(git log  $ref_range --no-merges --format="%s" 2>/dev/null \
    | grep -vE "^(feat|fix|chore|refactor|perf|test|docs|style|ci|build|release)(\(.+\))?:?" \
    | grep -v "^$" || true)

  [ -n "$breaking" ] && notes+=$'\n## ⚠️ Breaking Changes\n'"$(echo "$breaking" | sed 's/^/- /')"
  [ -n "$feat"     ] && notes+=$'\n## ✨ Nieuwe functies\n'"$(echo "$feat" | sed 's/^feat[^:]*: //' | sed 's/^/- /')"
  [ -n "$fix"      ] && notes+=$'\n## 🐛 Bugfixes\n'"$(echo "$fix"  | sed 's/^fix[^:]*: //'  | sed 's/^/- /')"
  [ -n "$overig"   ] && notes+=$'\n## 📝 Overig\n'"$(echo "$overig" | sed 's/^/- /')"
  [ -z "$notes"    ] && notes=$'\nGeen geclassificeerde commits gevonden.'

  echo "$notes"
}

# ── GitHub Release aanmaken ───────────────────────────────────────

maak_github_release() {
  local tag="$1" notes="$2"

  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    gh release create "$tag" \
      --title "Release $tag" \
      --notes "$notes" \
      --latest \
      2>&1 && echo "✓ GitHub Release aangemaakt: $tag" && return 0
  fi

  echo "⚠  gh CLI niet beschikbaar of niet ingelogd."
  local remote_url
  remote_url=$(git remote get-url origin 2>/dev/null \
    | sed 's/git@github.com:/https:\/\/github.com\//' \
    | sed 's/\.git$//')
  if [ -n "$remote_url" ]; then
    echo "   Maak de release handmatig aan:"
    echo "   ${remote_url}/releases/new?tag=${tag}"
  fi
}
