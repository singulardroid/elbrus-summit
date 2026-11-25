# Phase 3 results: terrain tiles and levels of detail

Built on 2026-11-26.

## What changed
The single 6 MB mesh plus two big textures is replaced by a **quadtree of 85 tiles**. The viewer
loads only the detail the current view needs:

| Level | Tiles | Tile size | Mesh error | Texture | Ground pixel | Mesh total | Texture total |
|---|---|---|---|---|---|---|---|
| 0 | 1 | 40 km | 40 m | 1024 px | 40 m | 0.16 MB | 0.16 MB |
| 1 | 4 | 20 km | 16 m | 1024 px | 20 m | 0.53 MB | 0.54 MB |
| 2 | 16 | 10 km | 6 m | 1024 px | 10 m | 1.77 MB | 1.47 MB |
| 3 | 64 | 5 km | 2 m | 512 px | 10 m | 5.21 MB | 1.48 MB |

- **Meshes**: glTF compressed with meshopt (gltfpack), with quantized positions (0.3 m steps at level 3).
  Gzip on the server shrinks them by another 27 %.
- **Normals** come from the full-resolution DEM, not the simplified mesh, so lighting doesn't
  jump when a tile switches level.
- **Skirts** along tile edges hide cracks between neighbouring tiles at different levels.
- **Texture gutters**: every tile texture carries a border of neighbouring imagery, so filtering
  doesn't draw a line at tile borders. This was visible before the fix.
- **Level 3 is new detail**: mesh error 2 m, versus 6 m for the whole model in phase 2.

## Viewer behaviour
- A tile splits into its 4 children when a texel or the mesh error would cover more than
  1.4 / 2.5 px on screen (1.8 / 3 px on phones). Hysteresis stops tiles flickering between levels.
- A tile is replaced only when all its visible children are loaded, so there are never holes.
  Off-screen children aren't loaded at all.
- Up to 6 parallel downloads, nearest and coarsest first. Images are decoded off the main thread
  (`createImageBitmap`).
- Memory budget: 500 MB desktop, 160 MB phones. Least-recently-used tiles are evicted.
- The loading screen lifts after at most 1.5 s, and the remaining detail streams in visibly.
- Debug: `?debug` shows tile stats, `?debug&tint` colours tiles by level.

## Measurements (dev server, browser pane)
| | Desktop 1280×800 | Phone 375×812 |
|---|---|---|
| Tiles drawn (by level 0/1/2/3) | 8 (0/2/5/1) | 5 (0/2/3/0) |
| Triangles / draw calls | 240k / 10 | 154k / 7 |
| GPU memory | 69 MB | 49 MB |
| Tile download, first view | 2.97 MB (≈ 2.3 MB gzipped) | 2.10 MB (≈ 1.7 MB gzipped) |
| + app JS, manifest, collision (gzipped) | ≈ 0.4 MB | ≈ 0.4 MB |

**First view on 4G**: about 2.7 MB on desktop and 2.1 MB on phones. That's roughly 1.2–2.2 s
at 10–20 Mbit/s, plus latency, which is within the 3 s target. The model appears even sooner,
because the loading screen lifts after at most 1.5 s.
Phase 2 for comparison: 5.3 MB, and everything had to load before anything appeared.

Stress tests:
- Touring all 16 places on the phone profile: GPU memory peaked at 150 MB (budget 160 MB).
  Total download over the whole tour was 6.4 MB.
- Budget forced down to 60 MB: tiles were evicted and reloaded on return, with no holes.

**Not verified**: frame rate on a real mid-range phone. The numbers above (≤ 250k triangles,
≤ 10 draw calls) are well within what such phones handle, but a real-device check is still
needed (`npm run dev`, then open `http://<mac-ip>:5173` on the phone).

## Hosting requirement
Serve `.glb` with gzip or brotli compression (e.g. `Content-Type: model/gltf-binary` and the
host's compression enabled for it). Without it the mesh downloads are about 35 % bigger.

## Not done (later)
- GPU-compressed textures (KTX2/Basis) would cut texture GPU memory about 4–6×. That needs the
  `basisu`/`toktx` tooling, which isn't installed. WebP is used for now.
- The collision grid (210 KB) barely compresses. It could be derived from the level-1 tiles instead.
