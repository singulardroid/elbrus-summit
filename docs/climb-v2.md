# Direction v2: the 3D climb

## Round 4 (2026-11-26): the story view

When you step onto a stone, its story takes over the frame. The 3D stays behind it, dimmed and
blurred, slowly circling the stone. The layout follows the "Открытая история" artboard of the
design canvas:
- **Header:** "← Назад к горе", the wordmark, and previous/next story. Switching stories walks the
  camera to that stone in the background.
- **Article:** the number, opened date and rubric, title, photo or video (with credit), lead, body,
  and share / copy link.
- **"Вы здесь":** the design's mountain of 250 cells (click one to go there), altitude, km from Azau,
  the stage, and the next opening with its countdown and "Напомнить".
- **Closed stones:** "Эта дверца пока закрыта", the opening date, how many stories are still
  ahead, and "Напомнить". Opened via the card's button; they don't pop up on their own while walking.
- **Opening:** it opens after you come to rest on an opened stone you moved to (not on the first
  page load), or from "Читать историю". Esc / ← → work; the link is `#story=<n>`.
- **Content:** `content/stories.json`, copied into the build by `build_web.py`.
  - Per story: title, date, rubric, lead, body paragraphs, media.
  - For the whole set: `opened` (how many are open) and `nextOpensAt` (drives a live countdown).
  - Anything missing shows the design's placeholders.

Still placeholders:
- The story texts and media.
- The opening schedule.
- The "Напомнить" button, which needs a backend: email, push or Telegram.

## Round 3 (2026-11-26): story stones, orbit camera, sky

What changed after feedback on round 2:
- **Story points are stones, not doors.** A low-poly waypoint stone (6 shapes: rune stone, obelisk,
  slab, twin stones, boulder, menhir) with its number glowing above it and thin light along its
  edges. Nothing stands in front of the view.
- **The light show is on the ground,** painted into the terrain shader so it hugs the slope:
  - polygonal rune circles turning in opposite directions (hexagon, dashed octagon, dotted 12-gon)
  - spokes and a few rising sparks
  - pulse waves rippling out from stones you haven't reached yet
  - a shockwave when you arrive
  - colours by story state: open warm, last orange, next magenta, closed violet-blue

  Kept soft so the landscape reads through. The latest opened story sends a faint beam into the sky.
- **Camera: orbits the current story point.** Drag rotates 360° and tilts; looking up, the camera
  slides to the ground and tilts back so you see the sky. Wheel and pinch zoom from 3 to 90 m.
  ▲/▼, the arrow keys, clicking a stone light or the route strip move you between points.
  No person figure.
- **Trail: straight segments, an irregular zigzag.**
  - Points are spaced unevenly (16–90 m, median 54 m).
  - Sideways offsets are random (3–28 m) on top of a slow random drift. The side flips only ~60 %
    of the time, and some legs get an extra kink. Seeded, so the trail is the same on every build.
  - Total 13.6 km. The trail near you is painted into the ground (walked part amber, the part
    ahead dashed magenta, flowing uphill).
- **Sky: a dome where time passes.**
  - A sun (disc, corona, two segmented rings: no synthwave stripes) and a crescent moon on the
    opposite side.
  - Stars turning around the celestial pole at Elbrus's latitude, twinkling and varied in colour,
    with a faint Milky Way and shooting stars.
  - Night at Azau turns into dawn at the summit (as on a real summit push). The sky, fog and the
    light on the terrain follow it.

Not done yet:
- **The full story view** that takes over the frame when you step onto a stone. The story card is still the placeholder.
- **Fonts:** the stone numbers use the system font if Unbounded hasn't loaded yet when a stone is built.
- **Real-phone check** of touch rotate, pinch and performance.

---

## Round 2 (first version)

Built on 2026-11-26. Open `npm run dev` in `viewer/`: it starts at door № 1 at Azau.

## What's there
- **Guided climb** along the southern route (11.9 km, Azau 2,363 m → West Summit 5,625 m on the
  terrain model). 250 doors, one every 48 m.
  - **Moving:** scroll up / ▲ / ↑ / W = next door; scroll down / ▼ / ↓ / S = previous; hold ▲
    to keep climbing; Home = Azau, End = the latest opened door; click a door, a badge, a station
    or a point on the route strip to walk there.
  - **Camera:** it glides along the trail; long jumps speed up but never cut through the mountain.
    Drag to look around; it turns back up the trail when you step on (unless you just looked around).
  - **HUD:** door № / 250, altitude, km from Azau, ≈ walking time, current stage or station;
    the story card for the door you're at (open / opened last / next / closed, the design's
    placeholders); the route strip with the profile, all 250 doors coloured by state, and stations.
- **Digital look** (default) and **Satellite** (toggle), for both the climb and the overview.
- **Overview** ("Вся гора"): the free orbit from phases 2–5, with places, routes and the list panel.
  Click a door's light to start climbing there.
- **Links:** `#door=87` opens the climb at a door; `?opened=120` sets how many doors are open
  (default 87, as in the design); `?look=satellite`.
- **Russian UI**, including place labels and the place and route panels.

## Verified (browser pane, 800×1167 desktop pane and 375×812 phone)
- Climbing up and down, holding to climb, keyboard, wheel; door badges follow the doors.
- Overview ↔ climb switching, the satellite toggle, deep links.
- Phone layout: switches in a top row, status, ▲/▼, story card, strip; no overlaps.
- Render: 15 draw calls, ~150k triangles, 0.2 ms per frame on this Mac (level ≤ 2 tiles in the digital look).
  Production build: app JS 206 KB gzipped.

## Fixed while testing
- The camera looked into the slope and you couldn't see where you were going. It now looks 120 m up the
  trail, and the view is centred above the HUD.
- Door badges trailed behind while moving (a CSS transition fought the label renderer).
- Leaving the climb for the overview stopped the flight halfway: the ground guard cancelled it.
- The snow mask made soft blobs and picked up buildings. Snow is now decided per triangle (crisp facets).
- The sun hung high above the ridges with a dark band below it. It's now lower and smaller, and the
  sky fades into a haze that matches the fog.

## Not done yet
- Story content and the real opening schedule: titles, dates, photos, countdown, and the story page.
  "Читать историю" and "Напомнить" are placeholders.
- 3D structures beyond doors (huts, pylons, monuments).
- Real-phone testing (touch: one finger looks around, pinch zooms, ▲/▼ to climb).
- The lower third of the route follows the cable-car line on the ground (ski-slope corridor),
  not a mapped footpath.
