# Phase 5 results: content (draft for review)

Built on 2026-11-26. **Status: drafted, waiting for review.** See [content-review.md](content-review.md).

## What's new
- **18 places with English and Russian descriptions** (`content/pois.geojson`). Two places are new:
  Pastukhov Rocks (estimated position) and the northern base camp (Lakkolit).
  Garabashi now points at the gondola top station (3,847 m).
- **Two routes** (`content/routes.yaml` → `content/routes.geojson`), built from OpenStreetMap ways:
  - **Southern route (classic)**: 3 cable cars + 3 walking stages to the West Summit.
    11.8 km in total, 6.6 km on foot, 1,784 m ascent on foot.
  - **Northern route**: 2 walking stages from near Jily-Su to the East Summit.
    13.6 km, 3,138 m ascent on foot.
- **On the map**: walking sections are red lines draped on the terrain, cable cars are dark cables
  between the stations. Lines stay faintly visible through ridges that hide them. A selected route is
  highlighted and the others dim.
- **Route panel**: length, distance on foot, ascent, highest point, an **elevation profile** (moving
  over it shows a marker on the 3D route), the description, a safety note, the stages
  (with lift/foot icons and heights) and the stops.
- Routes appear in the list button's panel and in the panel of every place they pass. Deep link: `#route=<id>`.
- Framing a route fits it into the part of the screen the panel leaves free, so a whole route stays
  visible on a portrait phone.
- When a route is selected, its stops win label overlaps.

## Pipeline
- `build_routes.py`: orients and joins the OSM ways listed per stage and warns about gaps
  (there are currently none).
- `build_web.py` drapes routes on the 30 m DEM (one point every 30 m on foot; cables 15 m above the
  pylons) and computes lengths, ascent and the profile. Stage end heights and the highest point use the
  stops' surveyed heights, because the DEM reads summits 10–20 m low.

## Verified (browser pane, 1280×800 and 375×812)
- `#route=south-route` and `#route=north-route` open the panel, highlight and frame the route.
- Profile hover → marker at the matching place on the 3D route.
- Place panel → "Routes" section → route. Route panel → stops → place.
- Production build: app JS 195 KB gzipped (+9 KB for routes and lines).

## Not done
- Content review (texts, facts, decisions): see `content-review.md`.
- Photos: none yet (need your own or licensed images).
