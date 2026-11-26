# Direction v2: the 3D climb

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
