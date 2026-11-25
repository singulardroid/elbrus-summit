# Elbrus 3D

Interactive, true-to-scale 3D model of Mount Elbrus and its surroundings for the web.
Visitors can orbit, pan and zoom on desktop and mobile, and click points of interest.

Built from open data (Copernicus DEM, Sentinel-2, OpenStreetMap) and rendered with Three.js.

- **Plan & architecture:** [PLAN.md](PLAN.md)
- **Data sources & licences:** [docs/data-sources.md](docs/data-sources.md)

## Layout

| Folder | What |
|---|---|
| `pipeline/` | Python offline pipeline: download DEM, imagery and POIs, then build terrain chunks and textures |
| `viewer/` | Vite + TypeScript + Three.js viewer, shipped as an embeddable web component |
| `content/` | Curated points of interest (`pois.geojson`) and routes |
| `data/` | Git-ignored working data: `raw/` downloads, `work/` intermediates, `build/` deployable output |
| `docs/` | Notes, sources, attribution |

## Status

**Direction v2:** the model is now the stage of the "250 stories" site. There's a guided climb past
250 story doors along the southern route, in a synthwave digital look (satellite as a toggle).
See [PLAN.md §0](PLAN.md#0-direction-v2-26-nov-2026-the-3d-climb-of-вершина-россии--250-историй) and [docs/climb-v2.md](docs/climb-v2.md).

The map-style model built in phases 1–5 is the "whole mountain" overview mode. Its results are in
`docs/phase1-results.md` … `docs/phase5-results.md`, and the content review is in [docs/content-review.md](docs/content-review.md).

To run it: build the data (see [pipeline/README.md](pipeline/README.md)), then `cd viewer && npm install && npm run dev`.
