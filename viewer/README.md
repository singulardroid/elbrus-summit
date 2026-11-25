# Viewer

Vite + TypeScript + Three.js. Renders the pipeline's web export (`data/build/elbrus/`) as an
interactive, true-to-scale 3D model.

## Run

The data must be built first (`pipeline/run_all.sh`, or just `pipeline/build_web.py` if
`data/work/` already exists).

```bash
cd viewer
npm install
npm run dev          # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm run build        # type-check + production build into dist/ (app + data, static files)
```

`vite.config.ts` serves `../data/build` as the public folder, so the data lands at `/elbrus/`
and is copied into `dist/` on build.

## Code map

| File | What |
|---|---|
| `src/ElbrusMap.ts` | Main class: renderer, camera controls, ground collision, labels, render-on-demand loop |
| `src/tiles.ts` | `TileSet`: quadtree level-of-detail selection, streaming (glTF + meshopt, ImageBitmap textures), LRU eviction under a GPU memory budget |
| `src/labels.ts` | POI labels: distance limits, terrain occlusion, decluttering, selection |
| `src/panel.ts` | Place and route panels / bottom sheet, list, nearby, share, elevation profile |
| `src/routes.ts` | Route lines (Line2: draped walking sections, cable-car spans), selection, profile marker |
| `src/urlState.ts` | `#poi=` / `#view=` deep links |
| `src/icons.ts` | Category and UI icons (inline SVG) |
| `src/terrain.ts` | Side walls of the relief block |
| `src/data.ts` | Manifest types, fetch helpers, `CollisionGrid` (height lookup for the camera) |
| `src/sky.ts` | Gradient sky dome (matches the fog colour) |
| `src/hud.ts` | Loading screen, compass, reset button, altitude readout, attribution, gesture hint |
| `src/main.ts` | Mounts `ElbrusMap` into `#app` |

Embedding API (for now): `new ElbrusMap(element, { dataUrl, urlState }).load()`. Set
`urlState: false` if the host page uses the URL hash itself. The `<elbrus-map>` web
component comes in phase 7.

## Deep links

- `#poi=<id>`: open a place (ids from `content/pois.geojson`)
- `#route=<id>`: open a route (ids from `content/routes.yaml`)
- `#view=<lat>,<lon>,<distance m>,<heading°>,<tilt°>`: a camera view. Heading is the compass
  direction the camera looks toward; tilt is 0 = straight down, 90 = horizon.

## Debug URL flags

- `?debug`: tile stats (drawn per level, loading/queued, GPU memory, downloaded bytes)
- `?debug&tint`: colours tiles by level (red 0, yellow 1, green 2, blue 3)

## Hosting

Static files only. Serve `elbrus/manifest.json` with a short cache or revalidation (it changes with
content edits; tiles can be cached long). Make sure the host compresses `.glb` (gzip or brotli). The meshes shrink by
about 27 %. The browser console also exposes `window.elbrus` for debugging.

## Controls

| | Desktop | Touch |
|---|---|---|
| Orbit | left-drag | one finger |
| Pan along the ground | right-drag | two fingers |
| Zoom (towards the cursor) | wheel | pinch |
| Open a place | click its label, or the list button | tap its label, or the list button |
| Close the panel | Esc, ✕, or click the map | ✕, drag the sheet down, or tap the map |
| Terrain readout | hover (height and lat/lon) | |

Limits: 800 m – 90 km from the target, never below the horizon, the camera stays above
the terrain, and the orbit target stays on the ground and inside the model.

## Scene conventions

X = east, Y = up, Z = south (north is −Z), metres, origin at the grid centre. True scale: no
vertical exaggeration. The sun light uses the satellite's sun angle at capture time
(azimuth 157°, elevation 56°), so 3D shading matches the shadows in the imagery.

## Known gotchas

- The label layer must be `overflow: clip`, not `hidden`. Clicking a label focuses it, and the
  browser scrolls a hidden-overflow box to show it, which shifts every label off its point.
- camera-controls' `active` flag stays true at rest, so user interaction is tracked through
  `controlstart`/`controlend`.
- camera-controls' TypeScript types omit `TOUCH_DOLLY_SCREEN_PAN`, though it works at runtime (cast in code).
