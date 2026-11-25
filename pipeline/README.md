# Pipeline

Offline Python steps that turn open data into files the viewer can use. Every step reads
[config.yaml](config.yaml) (area, CRS, resolutions, imagery date).

## Setup

```bash
cd pipeline
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install        # gltfpack (mesh compression), used by build_web.py
```

No API keys are needed. Everything is fetched from public endpoints.

## Run

```bash
./run_all.sh
```

| Step | Script | Output (in `data/`) |
|---|---|---|
| 1. Elevation | `fetch_dem.py` | `raw/dem/*.tif` (Copernicus GLO-30 tiles) → `work/dem.tif` (float32 m, UTM 38N, 30 m) |
| 2. Imagery | `fetch_imagery.py` | `work/s2_reflectance.tif` (uint16 B04/B03/B02), `work/imagery.tif` (8-bit RGB, 10 m), `work/imagery.json` |
| 3. OSM | `fetch_osm.py` | `raw/osm.json`, `work/osm_pois.geojson`, `work/osm_lines.geojson` |
| 4. Checks | `previews.py` | `work/previews/{hillshade,imagery,overlay}.png`, `report.json` (exit 1 if the DEM fails the sanity check) |
| 5. Routes | `build_routes.py` | `content/routes.geojson` from `content/routes.yaml` + OSM ways (oriented, joined, gaps reported) |
| 6. Web export | `build_web.py` | `build/elbrus/`: `manifest.json`, `tiles/<L>-<x>-<y>.{glb,webp}` (85-tile quadtree, meshopt-compressed meshes with DEM normals and skirts, WebP textures with gutters), `collision.bin`. Places come from `content/pois.geojson`, routes from `content/routes.geojson` (draped on the DEM, with stats and profile). Tile levels are set in `config.yaml` → `tiles`. `--skip-tiles` refreshes only the manifest after content edits |

Useful flags:
- `fetch_imagery.py --list` ranks candidate dates by clear-sky coverage of the area (and snow fraction).
- `fetch_imagery.py --date YYYY-MM-DD` overrides the date pinned in `config.yaml` (`imagery.date`).
- `fetch_imagery.py --tone-only` re-runs only the colour tone mapping from the cached reflectance (no download), for tuning the look.

## Grid conventions

- CRS: EPSG:32638 (UTM 38N), metres.
- All rasters share **identical bounds**, snapped to 120 m (`GRID_ALIGN` in `common.py`), so the
  30 m DEM and the 10 m imagery line up exactly pixel-for-pixel (1 DEM px = 3×3 imagery px).
- Current extent: 273 240 – 313 440 E, 4 782 840 – 4 822 920 N (40.2 × 40.08 km).

## Gotchas found so far

- **Earth Search already applies the Sentinel-2 BOA offset** (`earthsearch:boa_offset_applied: true`)
  but the asset metadata still advertises `offset: -0.1`. Applying it again makes dark pixels
  negative. `radiometry()` in `fetch_imagery.py` handles this.
- **The area spans two UTM zones of Sentinel-2 tiles** (37TGH/37TGJ + 38TLN/38TLP). Zone-38 tiles
  are used first (no resampling) and zone-37 tiles fill the western gaps.
- **Public Overpass servers are often busy (502/504).** `fetch_osm.py` retries across mirrors.
