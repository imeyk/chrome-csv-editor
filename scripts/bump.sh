#!/usr/bin/env bash
#
# Bumps the extension version in manifest.json AND commits it.
#
# The Web Store refuses an upload whose version is not strictly greater than the
# published one. Bumping at build time (which pack:chrome used to do) meant the new
# number lived only in the working tree, so uploads happened from versions that were
# never committed and the repo drifted behind what was live — four patch versions, at
# one point, until an upload was rejected. Committing the bump is the whole point of
# this script, which is why pack:chrome now refuses to package an uncommitted version.
#
# Usage:
#   npm run bump            # 0.1.8 -> 0.1.9
#   npm run bump -- 0.2.0   # explicit, e.g. to get ahead of a published version
#
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git work tree, refusing to bump without being able to commit" >&2
  exit 1
fi

# Only the version substring is rewritten, so the rest of manifest.json is untouched.
NEW_VERSION="$(TARGET="$TARGET" python3 - <<'PY'
import os, re, sys

path = "manifest.json"
source = open(path, encoding="utf-8").read()

match = re.search(r'"version":\s*"(\d+)\.(\d+)\.(\d+)"', source)
if not match:
    sys.exit('manifest.json has no x.y.z "version"')

target = os.environ.get("TARGET", "").strip()
if target:
    if not re.fullmatch(r"\d+\.\d+\.\d+", target):
        sys.exit('version must look like x.y.z, got "%s"' % target)
    new = target
else:
    major, minor, patch = match.groups()
    new = "%s.%s.%d" % (major, minor, int(patch) + 1)

old = "%s.%s.%s" % match.groups()
if new == old:
    sys.exit("manifest.json is already at %s" % new)

open(path, "w", encoding="utf-8").write(
    source[:match.start()] + '"version": "%s"' % new + source[match.end():])
print(new)
PY
)"

git commit --only manifest.json -q -m "build: bump extension version to $NEW_VERSION"

echo "manifest.json -> $NEW_VERSION  (committed as $(git rev-parse --short HEAD))"
echo "next: npm run pack:chrome, upload dist/chrome-csv-editor.zip, then push this commit"
