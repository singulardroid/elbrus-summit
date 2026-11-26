# Direction v2: the 3D climb

## Round 13 (2026-11-26): phones: speed and the pill layout

**Measured on a Galaxy A33 5G** (Exynos 1280, Mali-G68, Android 13, Chrome 158) over adb and
Chrome DevTools, frame rate per scenario:

| | before | after |
|---|---|---|
| climb, standing | 14 fps | 41 fps |
| climb, walking | – | 40 fps |
| whole mountain, idle / turning | – | 58–60 fps |
| story open | – | 47 fps |

- **The main cost was the frosted glass:** 19 HUD panels with `backdrop-filter: blur()` over the
  moving canvas; the browser redoes every blur every frame (26 → 60 fps without it). Touch
  devices now get no blur and more solid panels; desktops keep it.
- **Dynamic resolution** (`adaptResolution`): phones start at 1.5× (was 1.75×); when most frames
  miss a refresh the scale steps down (to 0.85× at most) and never retries a scale that proved
  too slow; it steps back up when frames are at full speed. The A33 settles at 1.375×.
- **Cheaper shaders:** the sky's Milky Way and moon-crater noise only where it can show; the sky
  dome is drawn after the terrain (only where sky shows); the trail painting skips far segments.
- The other phones on the rack (Pixel 7a, Pixel 4, Galaxy XCover Pro ×2, A26 ×2, A05s) were
  blocked by Chrome's first-run screen (accepting its terms is the owner's call): not measured.

**Phone layout: the pill** (chosen from three drafts on the local branch
`prototype/mobile-layouts`; `climbHud.ts` `layout()`): on screens ≤ 700 px the station card,
story card and up/down buttons become one pill at the bottom (↓ № · altitude ↑); tapping it
opens the stage, the story and the route strip above it. Look, language, time/weather and help
move behind one ⚙ button. The same live elements are moved between the desktop and phone places
(and back on a resize), so nothing is duplicated. The view is centred above the pill. The guide
points at the ⚙ menu and the pill on phones, opens them for its steps, with phone wording in
all four languages. Arabic mirrors the pill.

**No Read button:** the story's title is the way in (a link-like button with a small → that
flips in Arabic), on desktop and in the pill's panel; the card is shorter for it. Closed stations
keep their one button, "Remind me when it opens", and their title is not a link. The guide says
"tap the title" (four languages).

## Round 12 (2026-11-26): the altimeter loading screen

- Five loading-screen designs were compared (sunrise poster, altimeter climb, contour map,
  250 stars, poster with facts); the prototype is kept on the local branch
  `prototype/loading-screens`. **The altimeter climb won.**
- **Inline in `index.html`**, so it shows the moment the page opens, before the ~900 kB of code
  arrives (the page used to be blank until then). A big altitude counter climbs from 2 350 m to
  5 642 m along the real route profile (81 samples of the trail), a glowing dot walks the line,
  and the station name changes as it passes (Азау … Вершина).
- **Progress:** while the code downloads it creeps up the first slopes (to 16%); then it follows
  the real loading progress (`window.elbrusBoot.set`, from `hud.ts`), eased so it never jumps;
  when the mountain is ready (`done`) it climbs to the summit and fades out, then is removed. On a
  load error it is removed at once so the error message shows.
- **Adaptive:** sizes follow the screen (phone to desktop, short landscape screens); on narrow
  screens every second station label is hidden.
- **Four languages**, chosen the same way as the app (`?lang=`, saved choice, browser); Arabic
  reads right to left (the route is mirrored, the text right-aligned, without letter-spacing).
- Accessible as a progress bar (`role="progressbar"`, `aria-valuenow`); reduced motion: no easing
  or fade, no glow.
- The old loader (`.eu-loading` in `hud.ts`) is gone.

## Round 11 (2026-11-26): the dome camera and an opening view per language

- **A dome over the mountain** (`domeReach` in `ElbrusMap.ts`): the overview camera stays under an
  ellipsoid 20 km across at sea level and 12 km high over the centre. Going up brings you closer
  to the mountain; you can never leave it. Enforced by shortening the zoom distance only
  (`dollyTo`), which leaves a rotation in progress alone. Replaces round 10's "below 5000 m"
  rule and its after-rest corrections.
- **Down to the ground:** tilt goes below horizontal (to 100°); the ground is the only floor
  (clearance 25 m, or 0.4% of the distance). You can stand in a valley and look up.
- **The pivot is low:** 3400 m, inside the mountain, no longer pulled onto the surface. Panning
  moves it across the map at that height (truck with vertical drag forward), and the wheel zooms
  toward it (not toward the cursor).
- **Opening view per language** (`computeHome`): the route seen side-on, framed to fit the
  screen, from a little above it (72°): Azau on the left and the summit on the right in Russian,
  English and Chinese; mirrored in Arabic. Switching language while the guide's mountain view is
  up turns the view around.
  - Arabic uses a view picked by hand: the summit upper left, the route coming down to the lower
    right, 62° tilt, turned 48° further round, 10.1 km away in a 1015 x 859 window (scaled to
    other screens the same way).
- **Start and "You are here" markers** (`climbMarkers.ts`) in the whole-mountain view: station 1
  and the station you last stood at; click either to go back into the climb there. Drawn above
  the place labels, which step aside where they overlap. At station 1 they merge into one.
- **Camera flights are no longer cut short:** the dome is checked on where the camera is heading,
  and the ground correction lets a flight pass when it is headed above the ground (the way from
  the climb to the home view dips through the slope now that the pivot sits inside the mountain).

## Round 10 (2026-11-26): a compact round world, a lower camera

Round 9 was too much: 72 km of zoom and land out to 180 km. Drafts at 15, 20 and 30 km radius
were compared; 30 km was chosen.
- **Round world, 30 km radius** (`WORLD_RADIUS` in `synthwave.ts`), in both looks: from 60% of
  the radius the land sinks to a low flat rim and fades into the haze colour, and it ends at the
  radius. Below the horizon the sky is that same haze colour, so the edge is never seen.
  - Only the inner ring of the surrounding land is drawn, cropped to the circle: about 16,000
    triangles instead of 218,000. The outer ring is no longer used.
  - Place labels beyond 62% of the radius stay hidden (they would float over the haze).
  - Satellite look: the same rim, fade and cut, patched into three's Lambert shader (`roundWorld`).
  - Fix: the fade happens after the colour-space conversion; three's `fogColor` is already in
    the output colour space, so fading before it gave a light ring at the edge.
- **Zoom-out at most 20 km** from the point you look at; that point stays within 10 km of the
  centre, and the camera within 24 km.
- **A lower camera:** the farther out, the flatter the view. Close up you may look down steeply;
  from 6 to 12 km out the camera is also held below 5000 m, so from afar you look up at the summit.
  - Only the allowed tilt range changes each frame (camera-controls applies it when you rotate).
    A first version forced the angle every frame; it fought the ground clearance (which lifts the
    camera with an instant move that cancels any zoom or tilt in progress) and froze both.
  - When the camera comes to rest out of range (zoomed out from a view from above, or too far
    from the centre) it glides back once (`settleCamera`), unless the ground just had to lift it.
- **Wheel over a place label zooms** (labels sit above the canvas and used to swallow it).

## Round 9 (2026-11-26): land to the horizon

- **Zoom-out limit 72 km** (was 90 km): the last 20%, where the block looked like a slab in space.
- **Real land around the block** (`pipeline/build_horizon.py` → `horizon.json` + `horizon.bin`,
  247 kB; `viewer/src/horizon.ts`): two rings of real heights from Copernicus DEM GLO-90, read at
  low resolution straight from the public files on AWS (free, also for commercial use):
  - ring 1: about 120 km square, a vertex every ~400 m; ring 2: about 360 km, every ~2 km;
  - ring 1's inner edge takes the block's own edge heights, its outer edge follows ring 2, so
    there are no cracks; the walls of the block still fill the small gaps along the edge;
  - beyond the block the ground drops with the earth's curvature (about 1.8 km at 150 km out);
  - digital look: the same palette, facets, contour lines, grid and light (day, night, weather)
    as the terrain, with snow by height; satellite look: colours by height like the summer photo.
  - The Main Caucasus Ridge to the south, the Bermamyt plateau and the plains to the north are
    real. If the files are missing, the block shows alone as before.
- **Haze closes the view at 150 km** at most, so the ring's far edge (about 180 km out) is never
  seen.
- Pipeline: `build_horizon.py` runs after `build_web.py` in `run_all.sh`.

## Round 8 (2026-11-26): real weather in the sky

- **Source: Open-Meteo** (`viewer/src/weather.ts`). Free, no key, callable straight from the
  browser. One call gets 72 hours (yesterday, today, tomorrow) of hourly weather for two points,
  Azau (2350 m) and the summit (5642 m): temperature, precipitation, snowfall, weather code,
  cloud cover, visibility, wind speed, gusts and direction.
  - **Free only for non-commercial sites.** Their terms count sites with ads or subscriptions as
    commercial; those need the paid plan (or a self-hosted Open-Meteo: change `WEATHER_URL`).
  - **Credit required (CC BY 4.0):** "Weather data by Open-Meteo.com" is in the data panel.
  - Free limits: 10,000 calls a day, counted per IP; each visitor calls at most once an hour.
  - The visitor's IP address reaches Open-Meteo (only Elbrus coordinates are sent).
- **Time and place:** the sky clock's time picks the hour; your altitude (the climber, or the
  point the overview looks at) blends Azau and the summit, so it can be clear at Azau and snowing
  on top. When the sped-up sky runs past the data, it loops back to the start. Changes ease in
  over a few seconds.
- **If the call fails** (offline, blocked, timeout, odd answer): the last good answer from this
  browser if it is under two days old, else no weather at all: the clear sky as before. Nothing
  throws, nothing is shown as an error.
- **Effects** (digital look):
  - clouds: a cloud layer drifting with the real wind direction and speed (faster when the sky
    runs fast), bright tops and violet bellies, pink at sunset, moonlit at night; they hide the
    stars, the moon and the Milky Way behind them; overcast greys the sky and dims the sunlight;
  - rain (slanted streaks) or snow (swaying flakes), as much as the forecast says; snow when it
    is below about 1 °C at your altitude; wind-blown snow in strong cold wind;
  - fog and haze from visibility (and the fog weather codes): the horizon first, then everything;
  - thunderstorms: a darker sky and lightning flashes that light up the clouds and the slopes.
- **Sky clock** shows the weather icon and the temperature at your altitude; its tooltip gives the
  conditions, wind and gusts, with the source.
- **URL:** `?weather=clear|cloudy|rain|snow|fog|haze|wind|storm` shows that weather instead of the
  real one (for demos and checks); `?weather=off` never calls the service.
- Also: the stones no longer flood the console with a three.js warning.

## Round 7 (2026-11-26): a sky on the visitor's clock

- **Local time.** The digital sky starts at the visitor's own local time: their morning is morning
  on Elbrus, their night is night (the instant is picked so Elbrus clocks, UTC+3, read the same as
  the visitor's). It no longer follows the climb (the old "night at Azau, dawn on the summit").
- **Hold, then speed up** (`viewer/src/skyClock.ts`). Real time for the first 2½ minutes, so the
  sky is what it should be right now; then over 45 s it speeds up to ×240 (one sky hour every
  15 s, a whole day in six minutes). Driven by wall-clock time, so slow frames don't slow it.
- **A real sky** (`viewer/src/celestial.ts`), computed for 43.35° N, 42.44° E:
  - sun and moon from low-precision ephemerides (about a degree; sunset on 26 Nov comes out at
    16:35, the real one is about 16:40);
  - the moon is lit by the sun, so its phase is the real one, with faint earthshine;
  - stars turn with local sidereal time; about 80 of the brightest are placed from a catalogue
    (Big Dipper, Cassiopeia, Orion, the Summer Triangle, the Pleiades…), the faint ones crowd the
    Milky Way;
  - the Milky Way lies along the real galactic plane, brighter and warmer toward the centre in
    Sagittarius, with a dust lane; Andromeda and the Orion Nebula as small glows;
  - a full day: night, twilight (pink horizon on the sun's side), and a violet synthwave day.
    The terrain light follows the sun by day and the moon at night (as bright as its phase).
- **Sky clock** (top right, digital look only): the sky time with a sun or moon icon, "now" while
  it runs in real time, "▸▸ ×240" when fast. Tap to speed up at once, tap again to go back to now.
- **URL:** `?time=21:30` starts the sky at that local time, `?speed=600` runs it that fast from
  the start (handy for checking a sunset).
- The guide's "Digital or satellite" step says this in all four languages.
- Narrow phones (≤ 400 px): the top row is tighter, so "Whole mountain" in English no longer
  pushes the "?" button off screen.

## Round 6 (2026-11-26): the first-visit guide

- **First visit** (nothing saved in the browser, and not arriving by a shared station, story or
  place link): the site opens on the whole mountain, turning slowly, with a welcome card in the
  visitor's language. It says what the site is and offers the four languages,
  "Show me around" and "Skip, go to station 1".
- **The tour** (`viewer/src/tour.ts`), 10 steps with Back / Next (← → keys, Esc closes):
  1. the whole mountain and how to move it (mouse or touch wording)
  2. the places list, compass and reset
  3. Climb / Whole mountain
  4. Digital / Satellite
  5. language
  6. then it walks down to station 1: where you are (status)
  7. the stones and what their colours mean
  8. Up / Down
  9. the story card
  10. the route strip

  Each step spotlights its control and puts the card beside it. The overlay lets clicks
  through, so people can try each control as it is explained. Every step has
  "Go to station 1".
- **The finish:** "Start at station 1" (the first story opens) or "Newest story: No. 87".
- **Afterwards:** the guide is remembered and doesn't come back by itself. The **?** button in
  the top bar replays it, and `?tour` in a link forces it.


## Round 5 (2026-11-26): stations and four languages

- **Станция / station** replaces "дверца / door" in everything users see: the HUD ("Станция 88 / 250"),
  the story card and view ("Эта станция пока закрыта"), labels and links (`#station=88`; old
  `#door=` links still open). The line under the altitude now names the nearby stop as a place
  ("Место: Гарабаши", "Участок Мир → Гарабаши") so it doesn't clash with the word "station".
- **Languages:** Russian, English, Chinese, Arabic. A language button sits next to the look switch.
  Switching is live (no reload) and remembered; `?lang=` sets it in a link.
  - All interface text is in `viewer/src/i18n.ts`, with plural rules per language and local
    number formats (Arabic uses Western digits, like the stone numbers).
  - Arabic turns the page right-to-left and loads Noto Sans Arabic. Charts (the route strip,
    the mountain of 250 cells, the elevation profile) stay left-to-right.
  - Content can be given per language: place and route names and descriptions, and every story
    field in `content/stories.json` (`"title": {"ru": "…", "en": "…", "zh": "…", "ar": "…"}`).
    A missing language falls back to English, then Russian. The panel shows the Russian name
    under the title for other languages.
- Chinese and Arabic place and route texts are machine-drafted and need a native speaker's review.


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
