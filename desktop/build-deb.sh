#!/usr/bin/env bash
# Builds release/PM-SIM-<version>-amd64.deb: copies the web app into a staging
# folder next to main.cjs and runs electron-builder there.
# Needs Node.js and network (or a filled npm/electron cache) for the first run.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
stage="${STAGE:-$(mktemp -d)}"

cp "$here/main.cjs" "$here/package.json" "$here/icon.png" "$stage/"
mkdir -p "$stage/web"
cp -r "$root/index.html" "$root/css" "$root/src" "$root/fixtures" "$stage/web/"

cd "$stage"
[ -d node_modules ] || npm install --no-audit --no-fund
npx electron-builder --linux deb --publish never
mkdir -p "$root/release"
cp dist/*.deb "$root/release/"
ls -l "$root/release/"*.deb
