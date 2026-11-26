#!/usr/bin/env bash
# Run the full phase-1 data pipeline. Re-runnable: DEM tiles are cached in data/raw/.
set -euo pipefail
cd "$(dirname "$0")"
PY=.venv/bin/python
[ -x "$PY" ] || { echo "Create the venv first: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; exit 1; }

$PY fetch_dem.py
$PY fetch_imagery.py
$PY fetch_osm.py
$PY previews.py
$PY build_routes.py
$PY build_web.py
$PY build_horizon.py
