#!/usr/bin/env bash
# Stamp every local script/stylesheet URL in index.html with the current short
# git hash. Browsers (and GitHub Pages' max-age=600) may otherwise serve a
# mixed old/new module set right after a deploy — live testing produced a real
# crash from exactly that mix. Run before pushing a release; a second run on
# the same HEAD is a no-op. test/smoke.js goes red if the stamps ever diverge.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."

stamp=$(git rev-parse --short HEAD)
perl -pi -e 's{((?:src|href)="(?!https?:)[^"?]*\.(?:js|css))(\?v=[^"]*)?"}{$1?v='"$stamp"'"}g' index.html
perl -pi -e 's{^var STAMP = "[^"]*";}{var STAMP = "'"$stamp"'";}' sw.js

count=$(grep -c "?v=$stamp" index.html) || {
  echo "stamp-assets: no asset URL took the stamp — check the pattern against index.html" >&2
  exit 1
}
grep -q "var STAMP = \"$stamp\";" sw.js || {
  echo "stamp-assets: sw.js did not take the stamp — check its STAMP line" >&2
  exit 1
}
echo "index.html: $count asset URLs and sw.js stamped ?v=$stamp"
