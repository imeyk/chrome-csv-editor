#!/usr/bin/env bash
#
# Builds a lean, publishable Chrome extension package.
# Ships ONLY the runtime files — none of the VS Code fork baggage
# (src/, docs/, images/, exampleCSV/, node_modules/, TS sources, source maps).
#
# Usage: npm run bump && npm run pack:chrome
# Output: dist/chrome-csv-editor/  (unpacked)  and  dist/chrome-csv-editor.zip
#
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/chrome-csv-editor"
# rsync reads "C:/..." as user "C" on host "/...", so hand it relative paths instead
# (we cd'ed to the repo root above)
STAGE_REL="dist/chrome-csv-editor"

# The version must already be committed. It used to be bumped right here, which meant
# uploads went out from a number that lived only in the working tree and the repo drifted
# behind the published version until the Web Store rejected an upload. Use `npm run bump`
# (which bumps AND commits), and set ALLOW_DIRTY_MANIFEST=1 for throwaway local builds.
if [ "${ALLOW_DIRTY_MANIFEST:-}" != "1" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet HEAD -- manifest.json; then
    echo "error: manifest.json differs from HEAD - the packaged version would not be in git." >&2
    echo "       run 'npm run bump' to bump and commit it, or set ALLOW_DIRTY_MANIFEST=1" >&2
    echo "       for a local build you are not going to upload." >&2
    exit 1
  fi
fi
echo "[0/4] Version: $(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")"

echo "[1/4] Building the editor (csvEditorHtml/out)…"
npx tsc -p ./csvEditorHtml/tsconfig.json

echo "[2/4] Staging runtime files into $STAGE …"
rm -rf "$DIST"
mkdir -p "$STAGE"

cp manifest.json "$STAGE/"

# Host page + logic (drop unit tests).
rsync -a --exclude='*.test.mjs' extension/ "$STAGE_REL/extension/"

# Editor: ship compiled JS + css + html only. Drop TS sources, source maps,
# the unused VS Code webview template (index.html) and the editor tsconfig.
rsync -a \
  --exclude='*.ts' \
  --exclude='*.test.mjs' \
  --exclude='*.js.map' \
  --exclude='index.html' \
  --exclude='tsconfig.json' \
  --exclude='test/' \
  --exclude='browser/' \
  csvEditorHtml/ "$STAGE_REL/csvEditorHtml/"

# Vendored libraries: ship the minified builds + licenses only.
rsync -a \
  --exclude='*.d.ts' \
  --exclude='*.ts' \
  --exclude='*.map' \
  --exclude='info.md' \
  --exclude='handsontable.js' \
  --exclude='handsontable.css' \
  thirdParty/ "$STAGE_REL/thirdParty/"

# Translations.
rsync -a _locales/ "$STAGE_REL/_locales/"

echo "[3/4] Zipping…"
ZIP="$DIST/chrome-csv-editor.zip"
if command -v zip >/dev/null 2>&1; then
  ( cd "$DIST" && zip -qr chrome-csv-editor.zip chrome-csv-editor )
elif command -v powershell.exe >/dev/null 2>&1; then
  # git bash on windows ships no zip binary
  powershell.exe -NoProfile -NonInteractive -Command \
    "Compress-Archive -Path '$(cygpath -w "$STAGE")' -DestinationPath '$(cygpath -w "$ZIP")' -Force" >/dev/null
else
  echo "  neither zip nor powershell found — skipping the archive" >&2
fi

echo "[4/4] Done."
echo "  unpacked: $(du -sh "$STAGE" | cut -f1)   ($(find "$STAGE" -type f | wc -l | tr -d ' ') files)"
if [ -f "$ZIP" ]; then
  echo "  zip:      $(du -sh "$ZIP" | cut -f1)"
fi
echo "Load unpacked from: $STAGE"
