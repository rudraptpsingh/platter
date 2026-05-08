#!/usr/bin/env bash
# bump-version.sh — sync the version number across all three version files
#
# Usage:
#   scripts/bump-version.sh 0.6.0
#   scripts/bump-version.sh 0.6.0 --tag    (also creates and pushes a git tag)
#
# Files updated:
#   package.json                  "version"
#   src-tauri/tauri.conf.json     "version"
#   src-tauri/Cargo.toml          version = "..."
#   landing/latest.json           "version" (placeholder — overwritten by release CI)

set -euo pipefail

VERSION="${1:-}"
DO_TAG=false
[[ "${2:-}" == "--tag" ]] && DO_TAG=true

if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/bump-version.sh <version> [--tag]"
  echo "  e.g. scripts/bump-version.sh 0.6.0"
  exit 1
fi

# Validate semver-ish
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$ ]]; then
  echo "Error: '$VERSION' doesn't look like a valid semver (expected X.Y.Z)"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

echo "Bumping to v${VERSION} ..."

# ── package.json ───────────────────────────────────────────────────────────
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.version = '${VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
  console.log('  ✓  package.json →', p.version);
"

# ── src-tauri/tauri.conf.json ──────────────────────────────────────────────
python3 -c "
import json, sys
path = 'src-tauri/tauri.conf.json'
with open(path) as f:
    d = json.load(f)
d['version'] = '${VERSION}'
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
print('  ✓  src-tauri/tauri.conf.json →', d['version'])
"

# ── src-tauri/Cargo.toml ───────────────────────────────────────────────────
# Replace only the first 'version = "..."' line (the [package] version)
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "1,/^version = \"[^\"]*\"/ s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
else
  sed -i "1,/^version = \"[^\"]*\"/ s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
fi
CARGO_VER=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
echo "  ✓  src-tauri/Cargo.toml → $CARGO_VER"

# ── landing/latest.json ────────────────────────────────────────────────────
python3 -c "
import json
path = 'landing/latest.json'
with open(path) as f:
    d = json.load(f)
d['version'] = '${VERSION}'
# Update URLs to point to the new version tag (will be overwritten by CI with real sig)
url = 'https://github.com/rudraptpsingh/platter/releases/download/v${VERSION}/platter.app.tar.gz'
for plat in d.get('platforms', {}).values():
    plat['url'] = url
    plat['signature'] = ''
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
print('  ✓  landing/latest.json → ${VERSION}')
"

echo ""
echo "Done. All version files → v${VERSION}"

# ── Verify ─────────────────────────────────────────────────────────────────
PKG=$(node -p "require('./package.json').version")
TAURI=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
CARGO=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')

if [[ "$PKG" != "$VERSION" ]] || [[ "$TAURI" != "$VERSION" ]] || [[ "$CARGO" != "$VERSION" ]]; then
  echo "Error: version mismatch after bump — check the files manually."
  exit 1
fi
echo "✓ Verified: package.json=$PKG  tauri.conf.json=$TAURI  Cargo.toml=$CARGO"

# ── Git tag ─────────────────────────────────────────────────────────────────
if [[ "$DO_TAG" == "true" ]]; then
  echo ""
  echo "Staging version files..."
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml landing/latest.json
  git commit -m "chore: bump version to v${VERSION}"
  git tag "v${VERSION}"
  echo "Created tag v${VERSION}"
  echo ""
  echo "Push with:"
  echo "  git push origin main && git push origin v${VERSION}"
else
  echo ""
  echo "Next steps:"
  echo "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml landing/latest.json"
  echo "  git commit -m 'chore: bump version to v${VERSION}'"
  echo "  git tag v${VERSION}"
  echo "  git push origin main && git push origin v${VERSION}"
fi
