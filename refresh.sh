#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is needed to refresh. Install it from https://nodejs.org"; exit 1; }
[ -d node_modules ] || { echo "Installing tools, one time only..."; npm install --silent; }
node tools/build.mjs --only pdf --report
echo "Done. Reload index.html in your browser."
