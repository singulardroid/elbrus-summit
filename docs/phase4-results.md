# Phase 4 results: places and interaction

Built on 2026-11-26.

## What's new
- **Place panel**: click or tap a label (or pick from a list) to open the place's details. It shows:
  - category, name in English and Russian, elevation, lat/lon
  - photo and description (once the content exists, in phase 5)
  - **Fly here**, **Share** (native share sheet on phones, copy link on desktop) and an OpenStreetMap link
  - the 4 **nearest places**, with distances, one tap away
- **Layout**: a side panel on wide screens; a bottom sheet on phones (≤ 700 px). Tap the handle
  to expand, drag down to collapse or close.
- **View stays centred** on the selected place in the part of the screen the panel doesn't cover.
  This uses an off-centre projection (`setViewOffset`) with an fov correction, so the scale doesn't jump.
- **Places list** (new list button under the compass): all places grouped by category. This is also
  the way to reach places whose labels are hidden behind terrain, by keyboard or screen reader.
- **Labels** now carry category icons. The selected place is highlighted and always shown,
  dimmed when behind terrain.
- **Deep links** in the URL hash:
  - `#poi=garabashi` opens a place directly
  - `#view=<lat>,<lon>,<distance m>,<heading°>,<tilt°>` reproduces a camera view
  - The URL updates as you move, without filling the browser history. Editing the hash
    (or pressing back) applies it. The host page can turn this off with `urlState: false`.
- **Hover readout** (mouse only): the terrain height and lat/lon under the cursor.
- **Dismiss**: Esc, the close button, or a tap/click on the map.

## Pipeline
- `manifest.json` (v3) now carries each place's lat/lon, description, image and source, plus a
  cubic **lat/lon ↔ scene fit**. Its error is under 1 cm over the area, so the viewer needs no
  projection library.
- `build_web.py --skip-tiles` refreshes only the manifest (≈ 1 s), for content edits in phase 5.

## Verified (browser pane, 1280×800 and 375×812)
- Click label → panel opens, camera flies, place centred in the free area, label highlighted, URL `#poi=…`.
- Nearby list and Places list → select works. Close button / map tap → panel closes, URL becomes `#view=…`.
- Deep link `#poi=cheget` on a fresh load opens straight on Cheget with the panel open.
- `#view=` round-trip: same target, distance, and angles within the link's 1° rounding.
- Bottom sheet: centring above the sheet, tap to expand (374 → 547 px), drag down to collapse, then to close.
- Hover pick: 3.5 ms median, 8 ms max; limited to 20 picks per second.
- Production build: app JS 186 KB gzipped (+5 KB).
- No console errors from the app.

## Bugs found and fixed
- POI labels were drawn over the HUD (attribution box). The label layer now has its own stacking context.
- A pointer-capture failure could break the sheet drag gesture. It's now guarded.

## Not done / later
- Place descriptions and photos are empty until phase 5 (the panel hides those sections).
- Routes (e.g. the south ascent line) come with the content in phase 5.
- Not tested with real touch on a real phone (the sheet gestures were tested with emulated pointer events).
