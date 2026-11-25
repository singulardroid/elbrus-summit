#!/usr/bin/env bash
# Publish the site to GitHub Pages: build the viewer (with the 3D data from data/build/)
# and force-push the result as a single commit to the gh-pages branch of `origin`.
#
# The 3D data is not in git (it is built locally by the pipeline), so it ships only here.
# Each deploy replaces the previous one, so the data does not pile up in the history.
#
#   ./scripts/deploy-pages.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
remote="$(git -C "$root" remote get-url origin)"

[ -f "$root/data/build/elbrus/manifest.json" ] || {
  echo "No 3D data in data/build/elbrus. Build it first (see pipeline/README.md)." >&2
  exit 1
}

echo "Building the viewer…"
(cd "$root/viewer" && npm run build --silent)

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
cp -R "$root/viewer/dist/." "$out/"
touch "$out/.nojekyll" # serve files as they are, no Jekyll processing

rev="$(git -C "$root" rev-parse --short HEAD)"
git -C "$out" init -q -b gh-pages
git -C "$out" add -A
git -C "$out" -c user.name="$(git -C "$root" config user.name)" -c user.email="$(git -C "$root" config user.email)" \
  commit -q -m "Site build from $rev"
echo "Publishing to gh-pages ($(du -sh "$out" | cut -f1))…"
git -C "$out" push -q -f "$remote" gh-pages
echo "Done. GitHub Pages updates in a minute or two."
