# Elbrus 3D — Project Plan

## 0. Direction v2 (26 Nov 2026): the 3D climb of "Вершина России · 250 историй"

The 3D model is now the stage of the **250-stories** site (design canvas "Вершина России —
250 историй Эльбруса"): 250 advent-calendar doors, one story behind each, opening one at a
time from Azau (№ 1) to the West Summit (№ 250). The map-style orbiting below stays as the
"whole mountain" overview, but the main experience is a **guided climb**:

- **Guided climb, station to station.** Scroll, swipe, the ▲/▼ buttons (hold to keep going) or
  the arrow keys move you door by door along the route; the camera follows just behind you
  looking up the trail. The trail is highlighted on the ground: lit up to the last opened
  door, magenta beyond. The HUD shows the door number, altitude, distance from Azau, an
  estimated walking time (Naismith) and the current stage. The route strip at the bottom shows
  the whole profile with every door and the stations; click anywhere to walk there.
  Size comes from the doors themselves: 4 m tall, 48 m apart, a string of lights climbing 3.3 km up.
- **Digital look by default:** synthwave night over the same terrain polygons, with flat-shaded
  facets, orange contour lines every 100 m, a cyan kilometre grid, faceted snow taken from the
  satellite photo, stars and a striped sun on the horizon. **Satellite** stays a toggle.
- **250 story stones along an irregular zigzag trail** on the southern route: low-poly numbered
  stones with the light show on the ground (rune circles, pulses), states as in the design.
  Camera: orbit 360° around the current point with zoom. Sky: sun, moon, turning stars, and
  night turning into dawn as you climb (round 3, see docs/climb-v2.md).
- **Four languages:** Russian, English, Chinese and Arabic (right-to-left), switched live from the
  top bar; `?lang=ru|en|zh|ar`, else the saved choice, else the browser. Deep links
  `#station=<n>` (old `#door=<n>` links still work), `#story=<n>`, `?opened=<count>`.

**Naming:** the 250 points are **станции / stations** everywhere users see them (they were "doors"
in the first rounds). Inside the code the climb still calls them `door` (`doors.ts`, `journey.doors`),
because `stations` already names the stops along the route (Azau, Mir, Garabashi…).

Built in this round: `viewer/src/{synthwave,doors,climb,climbHud}.ts` and the `journey` export in
`pipeline/build_web.py` (config `journey:`). Results: [docs/climb-v2.md](docs/climb-v2.md).

**Next for this direction** (to agree):
1. Story data: titles, dates, photos and the opening schedule (real `opened` count and countdown), and the story page that "Читать историю" opens.
2. Content for the 3D world: which structures besides doors (huts, cable-car pylons, flags, monuments).
3. A first-person moment at chosen stations, sound (wind, footsteps), the "door opening" ceremony for the newest story.
4. Real-phone testing and performance; embed into the site (phase 7 below).

---

*The original plan (phases 1–5 done; 5 drafted) follows. It describes the map-style model,
which is now the overview mode and the base of the climb.*

A browser-based, true-to-scale 3D model of Mount Elbrus and the surrounding area
(Baksan valley, Azau, Terskol, Cheget, north side) that visitors can orbit, pan and zoom
on desktop and mobile, with clickable points of interest. It is a "Google Earth for one
mountain": a focused, fast-loading interactive map embedded in a website, not a game world.

---

## 1. Key decision: where the 3D data comes from

### Why we can't just "extract from Google Earth"
Google Earth / Google Photorealistic 3D Tiles are licensed for **live streaming only**.
The Map Tiles API terms forbid downloading, caching, or extracting the meshes for offline use,
so pulling them out (e.g. via GPU capture tools) and hosting them ourselves is not allowed.
Also, Google's photogrammetry mesh barely exists over the Caucasus; Elbrus is shown there as
ordinary terrain plus satellite imagery, which we can build ourselves from open data.

### What we use instead (free, open, self-hostable)

| Layer | Source | Resolution | Licence |
|---|---|---|---|
| Elevation (DEM) | **Copernicus DEM GLO-30** (AWS Open Data, `s3://copernicus-dem-30m`) | ~30 m | Free, attribution required |
| Satellite imagery | **Sentinel-2 L2A** (Element84 Earth Search STAC on AWS, or Microsoft Planetary Computer) | 10 m | Free, attribution required |
| POIs, trails, huts, lifts | **OpenStreetMap** via Overpass API | vector | ODbL, attribution required |
| Optional fallback DEM | ALOS AW3D30 / NASADEM | ~30 m | Free |

Everything is processed once by an offline pipeline and served as static files from our own
host/CDN. No API keys, no per-view costs, no third-party runtime dependency.

**Honest expectation on detail:** 30 m elevation + 10 m imagery looks great from a "helicopter"
distance (roughly 1–50 km away). Very close up (under ~300 m) it gets soft. That's the realistic
ceiling for free data in this region. See §8 for upgrade paths.

### Optional alternative (not the default)
A CesiumJS + Google Photorealistic 3D Tiles mode is possible as a *streamed* layer (Google API
key, usage billing, mandatory Google attribution, heavier on mobile). We keep this as a possible
later toggle only if the self-hosted look isn't enough.

---

## 2. Area & scale

- **Core area:** ~40 × 40 km box centered on Elbrus (≈ 43.35° N, 42.45° E). Covers both
  summits, the south slope ski/climbing route (Azau → Mir → Garabashi → Pastukhov Rocks → saddle),
  Terskol, Cheget, the upper Baksan valley and the north side (Jily-Su).
  The bbox is a single config value (`pipeline/config.yaml`) — easy to enlarge.
- **Optional outer ring:** low-resolution (90–120 m) terrain out to ~100 km so the horizon shows
  the Main Caucasus Ridge instead of a hard edge.
- **Projection:** UTM zone 38N (EPSG:32638). Scene units = metres, origin at the area center,
  Y up. This keeps distances and heights true to scale with no globe-curvature maths.
- **Vertical exaggeration:** 1.0 (true scale) by default; optional 1.0–1.5 slider.

---

## 3. Architecture

```
┌────────────────── offline (run once / on update) ──────────────────┐
│ pipeline/ (Python: rasterio, GDAL, pystac-client, numpy)           │
│  1. fetch DEM tiles  → mosaic → reproject UTM 38N → clip bbox      │
│  2. fetch Sentinel-2 → pick low-cloud late-summer scene(s)          │
│                      → true-colour, colour-balance, clip           │
│  3. fetch OSM POIs   → GeoJSON (peaks, huts, lifts, trails)        │
│  4. build terrain    → split into chunks, simplify mesh per LOD    │
│                        (RTIN/Delatin), encode as compact binary    │
│  5. build textures   → tile + compress (KTX2 / WebP)               │
│  6. write manifest.json (bbox, CRS, chunks, LODs, attributions)    │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼ static files (data/build → CDN)
┌──────────────────────── browser (viewer/) ─────────────────────────┐
│ Vite + TypeScript + Three.js                                       │
│  • terrain chunks with distance-based LOD                           │
│  • camera-controls: orbit / pan / zoom, touch gestures, fly-to     │
│  • sky gradient + atmospheric fog + sun light                      │
│  • POI markers + HTML labels (occlusion-aware), click → info panel │
│  • routes as draped polylines (e.g. south-route ascent)            │
│  • packaged as an embeddable <elbrus-map> web component            │
└────────────────────────────────────────────────────────────────────┘
```

### Why a custom Three.js viewer (and not a full GIS engine)
- The area is **fixed and small**, so we don't need a whole globe streaming engine. A handful
  of pre-built terrain chunks with 2–3 LOD levels is enough. That keeps the bundle small
  (~200 KB gz) and mobile performance high.
- Full control over the look (sky, haze, snow, lighting), camera feel and UI, which matters for
  a showcase page.
- **Fallback considered:** MapLibre GL JS with our own terrain-RGB + imagery tiles. It ships
  fastest and handles map-style labels well, but has limited camera freedom (pitch ≤ 85°, no
  true orbit around the summit) and a "map" rather than "3D model" look. Kept as plan B.
- **CesiumJS** works too, but its bundle is heavy (MBs), it has a GIS look, and it's overkill
  for one mountain.

### Framework-agnostic embedding
The viewer is built as a standalone module / web component, so it can be dropped into any site
(plain HTML, React, Next, Astro, Tilda/Webflow via embed) without knowing the host stack yet.

---

## 4. Viewer features (MVP)

1. **Navigation**
   - Desktop: drag = orbit, right-drag/shift = pan, wheel = zoom.
   - Mobile: one finger = orbit, two fingers = pinch-zoom + pan.
   - Limits: no going under the terrain, max distance, soft bounds to the area.
   - "Reset view" and smooth **fly-to** animations.
2. **Points of interest**
   - Markers + labels from `content/pois.geojson` (category, name, description, photo, altitude).
   - Click/tap → info panel (side panel on desktop, bottom sheet on mobile) + fly-to.
   - Labels hide when they're behind terrain, and declutter at a distance.
3. **Routes**: e.g. the classic south route, drawn as a line draped on the terrain, with an
   elevation profile.
4. **Visuals**: true-colour satellite texture, sky gradient, distance fog, a subtle sun-lit
   normal map for relief (careful not to "double-shade" the shadows already in the imagery).
5. **Performance**: capped device pixel ratio on mobile, progressive loading (coarse first,
   detail streamed in), compressed textures, render-on-demand (no constant 60 fps loop
   when idle → saves battery).
6. **UI chrome**: compass / north-reset, altitude readout on hover, loading progress,
   attribution footer (required by data licences).
7. **Deep links**: `#poi=pastukhov-rocks` or camera state in the URL, so links can be shared.

### Later / nice-to-have
- Seasonal imagery toggle (summer vs winter snow cover)
- Vertical exaggeration slider, contour lines / slope-angle shading (avalanche terrain)
- i18n (RU / EN)
- Guided "tour" (scripted camera path through POIs)
- Optional Google Photorealistic streamed layer (§1)

---

## 5. Phases & deliverables

| # | Phase | Output | Done when |
|---|---|---|---|
| 0 | **Repo & plan** | this repo, plan, data-source notes | ✅ |
| 1 | **Data pipeline v1** | DEM + Sentinel-2 + OSM for the bbox, as GeoTIFFs and previews | ✅ Previews check out; DEM max 5,628 m, 9.6 m from the OSM West Summit (see `docs/phase1-results.md`) |
| 2 | **Viewer prototype** | Vite + Three.js app: single terrain mesh + texture + orbit controls | ✅ Orbit, pan, zoom, fly-to, ground collision; checked at desktop and phone sizes (see `docs/phase2-results.md`) |
| 3 | **Chunked terrain + LOD** | pipeline emits chunks/LODs/compressed textures + manifest; viewer streams them | ✅ 85-tile quadtree, meshopt + WebP; first view ≈ 2.1–2.7 MB gzipped (see `docs/phase3-results.md`). Real-phone frame rate not yet checked |
| 4 | **POIs & interaction** | markers, labels, info panel / bottom sheet, fly-to, deep links | ✅ Panel + bottom sheet, places list, nearby, share, `#poi=`/`#view=` links, hover readout (see `docs/phase4-results.md`) |
| 5 | **Content** | curated POI list (names, descriptions, photos), south-route line | 🟡 Drafted: 18 places (EN/RU), southern + northern routes with profiles. **Waiting for your review** (`docs/content-review.md`); photos still to come |
| 6 | **Polish** | sky/fog/lighting, loading UX, attribution, accessibility, outer ring | Visual sign-off |
| 7 | **Embed & deploy** | `<elbrus-map>` web component build, static hosting + CDN, caching headers | Embedded in the real site |

Phases 1–2 are the de-risking step: after them we'll know exactly how good open data looks
and can decide whether to invest in higher-resolution data.

---

## 6. Repo layout

```
elbrus-3d/
├── PLAN.md                 ← this file
├── README.md
├── docs/
│   └── data-sources.md     ← sources, licences, required attribution text
├── pipeline/               ← Python offline data processing
│   ├── config.yaml         ← bbox, CRS, resolutions, LOD settings
│   └── requirements.txt
├── content/
│   └── pois.geojson        ← curated points of interest (edited by hand / seeded from OSM)
├── viewer/                 ← Vite + TS + Three.js web app / web component (phase 2)
└── data/                   ← git-ignored: raw downloads, intermediate files, build output
    ├── raw/
    ├── work/
    └── build/              ← what gets deployed (manifest, terrain chunks, textures)
```

Large data stays out of git. The pipeline is reproducible from `config.yaml`.

---

## 7. Tech stack summary

- **Pipeline:** Python 3.12+, rasterio/GDAL, numpy, pystac-client, shapely, pyproj,
  `pydelatin` (terrain mesh simplification), Pillow, `toktx`/basisu for KTX2.
- **Viewer:** Vite, TypeScript, three.js, `camera-controls`, meshoptimizer decoder,
  KTX2Loader; no heavy UI framework inside the widget.
- **Hosting:** any static host + CDN (Cloudflare Pages / Netlify / S3+CloudFront).
  Total payload target: under 25 MB for the full-detail area, with only about 3–5 MB
  needed for the first view.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Clouds/seasonal snow in Sentinel-2 scenes | Search many dates; pick a late-summer (Aug–Sep) scene, or mosaic several with a cloud mask |
| DEM voids/artifacts on steep glacier faces | Fill voids, cross-check against ALOS AW3D30, light smoothing |
| 30 m/10 m too soft up close | Limit min camera distance; add a detail normal map; optional paid upgrades: Maxar/Airbus imagery (≤ 0.5 m), commercial DEMs, or our own drone photogrammetry around key spots |
| Mobile GPU memory | KTX2 textures, LOD, DPR cap, chunk unloading |
| Licensing/attribution | Attribution footer always visible; licences tracked in `docs/data-sources.md` |
| Satellite-imagery shading clashes with 3D lighting | Mostly unlit imagery + gentle normal-based relief; tune visually |

---

## 9. Open questions (defaults assumed until answered)

1. **Host website stack?** → default: framework-agnostic web component.
2. **Area size?** → default: 40 × 40 km core plus a low-res horizon ring.
3. **Languages?** → default: EN first, structure ready for RU.
4. **POI list & content**: who provides the texts and photos? → default: seed from OSM
   (peaks, huts, lifts, glaciers), then curate by hand.
5. **Budget for paid high-res data?** → default: none; open data only.
6. **Season look**: summer (rock + glaciers) or winter (full snow)? → default: late summer.
