"""Step 3: fetch points of interest and lift lines from OpenStreetMap (Overpass API).

Outputs:
  data/raw/osm.json              raw Overpass response
  data/work/osm_pois.geojson     points (peaks, saddles, huts, viewpoints, places, lift stations, glaciers)
  data/work/osm_lines.geojson    lines (aerialways, mountain paths)

These are *seed* data. The curated list lives in content/pois.geojson.
"""
from __future__ import annotations

import json
import sys
import time

import requests

from common import RAW_DIR, USER_AGENT, WORK_DIR, ensure_dirs, load_area, load_config

QUERY = """
[out:json][timeout:120];
(
  node["natural"~"^(peak|volcano|saddle)$"]({bbox});
  nwr["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|hotel|guest_house)$"]({bbox});
  nwr["amenity"="shelter"]({bbox});
  node["place"~"^(village|hamlet|locality|isolated_dwelling)$"]({bbox});
  node["aerialway"="station"]({bbox});
  way["aerialway"]({bbox});
  way["natural"="glacier"]["name"]({bbox});
  relation["natural"="glacier"]["name"]({bbox});
  way["highway"~"^(path|track)$"]["sac_scale"]({bbox});
);
out tags center geom;
"""


def category(tags: dict) -> str | None:
    n = tags.get("natural")
    if n in ("peak", "volcano"):
        return "summit"
    if n == "saddle":
        return "saddle"
    if n == "glacier":
        return "glacier"
    t = tags.get("tourism")
    if t in ("alpine_hut", "wilderness_hut") or tags.get("amenity") == "shelter":
        return "hut"
    if t == "viewpoint":
        return "viewpoint"
    if t in ("hotel", "guest_house"):
        return "lodging"
    if tags.get("aerialway") == "station":
        return "lift"
    if tags.get("place"):
        return "village"
    return None


def names(tags: dict) -> dict:
    out = {}
    for lang in ("en", "ru"):
        if tags.get(f"name:{lang}"):
            out[lang] = tags[f"name:{lang}"]
    if tags.get("name"):
        out.setdefault("local", tags["name"])
    return out


def parse_ele(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(v.replace("m", "").replace(",", ".").split(";")[0].strip())
    except ValueError:
        return None


MIRRORS = ["https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter"]


def overpass(cfg: dict, query: str) -> dict:
    """POST the query, retrying and falling back to public mirrors (servers are often busy)."""
    urls = [cfg["osm"]["overpass_url"], *MIRRORS]
    last = None
    for attempt in range(2):
        for url in urls:
            try:
                r = requests.post(url, data={"data": query}, timeout=180,
                                  headers={"User-Agent": USER_AGENT})
                if r.status_code == 200:
                    print(f"Overpass OK via {url}")
                    return r.json()
                last = f"{url}: HTTP {r.status_code}"
            except requests.RequestException as e:
                last = f"{url}: {e}"
            print(f"  failed {last}")
        time.sleep(10)
    raise RuntimeError(f"All Overpass endpoints failed; last error {last}")


def main() -> int:
    cfg = load_config()
    area = load_area(cfg)
    ensure_dirs()

    lon0, lat0, lon1, lat1 = area.lonlat_bounds()
    bbox = f"{lat0:.5f},{lon0:.5f},{lat1:.5f},{lon1:.5f}"
    data = overpass(cfg, QUERY.format(bbox=bbox))
    (RAW_DIR / "osm.json").write_text(json.dumps(data))
    elements = data["elements"]
    print(f"Overpass: {len(elements)} elements")

    points, lines = [], []
    for el in elements:
        tags = el.get("tags", {})
        osm_id = f"osm:{el['type']}/{el['id']}"
        is_line = el["type"] == "way" and (tags.get("aerialway") not in (None, "station")
                                           or tags.get("highway"))
        if is_line and "geometry" in el:
            lines.append({
                "type": "Feature",
                "geometry": {"type": "LineString",
                             "coordinates": [[p["lon"], p["lat"]] for p in el["geometry"]]},
                "properties": {"source": osm_id, "name": names(tags),
                               "kind": tags.get("aerialway") or tags.get("highway"),
                               "sac_scale": tags.get("sac_scale")},
            })
            continue
        cat = category(tags)
        if not cat:
            continue
        if el["type"] == "node":
            lon, lat = el["lon"], el["lat"]
        elif "center" in el:
            lon, lat = el["center"]["lon"], el["center"]["lat"]
        else:
            continue
        nm = names(tags)
        if not nm and cat not in ("summit", "lift", "hut"):
            continue
        points.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": {"source": osm_id, "category": cat, "name": nm,
                           "elevation_osm_m": parse_ele(tags.get("ele"))},
        })

    for name, feats in (("osm_pois", points), ("osm_lines", lines)):
        (WORK_DIR / f"{name}.geojson").write_text(json.dumps(
            {"type": "FeatureCollection", "features": feats}, ensure_ascii=False, indent=1))

    by_cat: dict[str, int] = {}
    for p in points:
        by_cat[p["properties"]["category"]] = by_cat.get(p["properties"]["category"], 0) + 1
    print(f"Points: {len(points)} {dict(sorted(by_cat.items()))}")
    print(f"Lines: {len(lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
