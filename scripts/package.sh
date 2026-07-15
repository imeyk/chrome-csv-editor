#!/usr/bin/env bash
#
# Builds a lean, publishable Chrome extension package.
# Ships ONLY the runtime files — none of the VS Code fork baggage
# (src/, docs/, images/, exampleCSV/, node_modules/, TS sources, source maps).
#
# Usage: npm run pack:chrome
# Output: dist/chrome-csv-editor/  (unpacked)  and  dist/chrome-csv-editor.zip
#
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/chrome-csv-editor"

echo "[1/4] Building the editor (csvEditorHtml/out)…"
npx tsc -p ./csvEditorHtml/tsconfig.json

echo "[2/4] Staging runtime files into $STAGE …"
rm -rf "$DIST"
mkdir -p "$STAGE"

cp manifest.json "$STAGE/"

# Host page + logic (drop unit tests).
rsync -a --exclude='*.test.mjs' extension/ "$STAGE/extension/"

# Editor: ship compiled JS + css + html only. Drop TS sources, source maps,
# the unused VS Code webview template (index.html) and the editor tsconfig.
rsync -a \
  --exclude='*.ts' \
  --exclude='*.js.map' \
  --exclude='index.html' \
  --exclude='tsconfig.json' \
  --exclude='test/' \
  --exclude='browser/' \
  csvEditorHtml/ "$STAGE/csvEditorHtml/"

# Vendored libraries: ship the minified builds + licenses only.
rsync -a \
  --exclude='*.d.ts' \
  --exclude='*.ts' \
  --exclude='*.map' \
  --exclude='info.md' \
  --exclude='handsontable.js' \
  --exclude='handsontable.css' \
  thirdParty/ "$STAGE/thirdParty/"

# Translations.
rsync -a _locales/ "$STAGE/_locales/"

echo "[3/4] Zipping…"
( cd "$DIST" && zip -qr chrome-csv-editor.zip chrome-csv-editor )

echo "[4/4] Done."
echo "  unpacked: $(du -sh "$STAGE" | cut -f1)   ($(find "$STAGE" -type f | wc -l | tr -d ' ') files)"
echo "  zip:      $(du -sh "$DIST/chrome-csv-editor.zip" | cut -f1)"
echo "Load unpacked from: $STAGE"
