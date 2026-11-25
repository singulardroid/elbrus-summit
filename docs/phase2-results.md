# Phase 2 results: viewer prototype

Built on 2026-11-25. Run it with `cd viewer && npm install && npm run dev`.

## What works
- **True-scale 3D terrain**: 40 × 40 km, a 207k-vertex / 413k-triangle mesh simplified from
  the 30 m elevation grid (max 6 m error), textured with the 10 m Sentinel-2 image.
  It loads a 2k texture first, then swaps to 4k on desktop and higher-end phones.
- **Look**: sky gradient, distance-based haze, sunlight from the actual capture-time sun angle,
  and earth-coloured side walls so the area reads as a cut-out relief model.
- **Navigation**: orbit, pan along the ground, zoom toward the cursor, compass (tap to face north),
  reset view. Touch: one finger orbits, two fingers pinch-zoom and pan.
- **Guard rails**: the camera never goes below ground (it lifts automatically), the orbit
  target follows the terrain while panning, zoom is limited to 800 m – 90 km,
  and the view never tilts below the horizon.
- **Labels**: the 16 starter places from `content/pois.geojson` (summits, huts, lift stations,
  villages). They hide when terrain blocks the line of sight, the less important of two
  overlapping labels hides, and they fade out by distance per category.
  Clicking a label flies the camera there.
- **Render on demand**: the GPU is idle when nothing moves.
- **Attribution** footer with the required data credits.

## Verified (in the browser pane)
- Desktop size (1024×768) and phone size (375×812): layout, labels and controls.
- Orbit drag, wheel zoom, label click → fly-to (lands centred), reset, ground collision
  (camera at 1,800 m is pushed to 2,620 m over 2,506 m ground), target-follow while panning.
- No console errors. Local load ≈ 0.7 s. One ~0.3 s main-thread stall while textures upload.
- **Not yet tested on a real phone.** Touch gestures were checked only by code path,
  not by a real finger. Use `npm run dev` (it listens on the LAN) and open
  `http://<your-mac-ip>:5173` on a phone on the same Wi-Fi.

## Sizes
| Asset | Raw | Gzipped |
|---|---|---|
| App JS (incl. three.js) | 600 KB | 150 KB |
| terrain.bin | 6.2 MB | 4.3 MB |
| imagery_2k.jpg | 0.8 MB | |
| imagery_4k.jpg (desktop upgrade) | 2.5 MB | |
| First view total | | ≈ 5.3 MB |

The terrain mesh is the bulk of the download. Phase 3 (tiles + detail levels + meshopt
compression) should bring the first view down to the plan's 3–5 MB target and make
zooming in sharper.

## Bugs found and fixed while testing
- Labels drifted off their points after clicking one (see `viewer/README.md`, overflow clip).
- Fly-to stopped short because ground-following adjusted the target mid-flight.
- Ground-following never ran because camera-controls' `active` flag stays true at rest.
- The gesture hint overlapped the compass on phones and showed mouse wording.

## Known limitations (planned for later phases)
- Labels show name and height only. Info panels, deep links and categories come in phase 4.
- Hard edge at 20 km from the centre. A low-res horizon ring comes in phase 6.
- Close-up detail is limited by 10 m imagery (by design, via minimum zoom distance).
- Snow on the summit cap is slightly bright (colour tuning in phase 6).
