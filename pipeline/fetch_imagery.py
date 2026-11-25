"""Step 2: pick the clearest Sentinel-2 L2A acquisition over the area and build a true-colour image.

Scenes are grouped by acquisition date (one satellite pass = several MGRS tiles, possibly in
two UTM zones). Each date is scored by the fraction of the area that is clear according to the
scene classification layer (SCL). The best date's tiles are mosaicked and reprojected to the
area grid.

Outputs:
  data/work/s2_reflectance.tif  uint16 x3 (B04, B03, B02), L2A digital numbers
  data/work/imagery.tif         uint8 RGB, tone-mapped, ready for texturing
  data/work/imagery.json        chosen scene metadata (dates, item ids, scores)

Options:
  --date YYYY-MM-DD   force a specific acquisition date
  --list              only print the ranked candidate dates
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict

import numpy as np
import rasterio
from pystac_client import Client
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from common import WORK_DIR, ensure_dirs, load_area, load_config

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

# SCL classes that make a pixel unusable: no data, defective, cloud shadow, clouds, cirrus.
SCL_BAD = (0, 1, 3, 8, 9, 10)
SCL_SNOW = 11
SCORE_RES = 120.0  # metres; coarse grid for fast scoring
BANDS = ("red", "green", "blue")


def grid(area, res):
    minx, miny, maxx, maxy = area.bounds_snapped(res)
    w = int(round((maxx - minx) / res))
    h = int(round((maxy - miny) / res))
    return from_origin(minx, maxy, res, res), w, h


def read_to_grid(href, crs, transform, w, h, resampling, dtype):
    with rasterio.open(href) as src:
        with WarpedVRT(src, crs=crs, transform=transform, width=w, height=h,
                       resampling=resampling, src_nodata=0, nodata=0) as vrt:
            return vrt.read(1, out_dtype=dtype)


def search(cfg, area):
    im = cfg["imagery"]
    client = Client.open(im["stac_url"])
    months = im["months"]
    items = []
    for year in im["years"]:
        dt = f"{year}-{min(months):02d}-01/{year}-{max(months):02d}-30"
        res = client.search(
            collections=[im["collection"]],
            bbox=area.lonlat_bounds(),
            datetime=dt,
            query={"eo:cloud_cover": {"lt": 40}},
        )
        items.extend(res.items())
    by_date = defaultdict(list)
    for it in items:
        by_date[it.properties["datetime"][:10]].append(it)
    return by_date


def score_date(area, items):
    """Return (clear fraction, snow fraction) over the area for one date."""
    transform, w, h = grid(area, SCORE_RES)
    clear = np.zeros((h, w), bool)
    snow = np.zeros((h, w), bool)
    for it in items:
        scl = read_to_grid(it.assets["scl"].href, area.crs, transform, w, h,
                           Resampling.nearest, "uint8")
        ok = ~np.isin(scl, SCL_BAD)
        new = ok & ~clear
        snow |= new & (scl == SCL_SNOW)
        clear |= ok
    return float(clear.mean()), float(snow.mean())


def tone_map(refl: np.ndarray, gain: float = 1.15, gamma: float = 2.2, sat: float = 1.2) -> np.ndarray:
    """Surface reflectance (0..~1) -> 8-bit sRGB-ish.

    Snow/glacier (~0.75) lands near 0.9 so it keeps texture; rock/grass (~0.05-0.15) is lifted by
    the gamma curve. Mild saturation boost because L2A true colour looks washed out.
    """
    x = np.clip(refl * gain, 0, 1) ** (1 / gamma)
    lum = x.mean(axis=0, keepdims=True)
    x = np.clip(lum + (x - lum) * sat, 0, 1)
    return (x * 255 + 0.5).astype(np.uint8)


def write_imagery(rgb: np.ndarray, profile: dict, scale: float, offset: float) -> None:
    refl = rgb.astype(np.float32) * scale + offset
    img = tone_map(refl)
    img[:, rgb[0] == 0] = 0
    with rasterio.open(WORK_DIR / "imagery.tif", "w", count=3, dtype="uint8",
                       photometric="RGB", **profile) as f:
        f.write(img)


def radiometry(item) -> tuple[float, float]:
    """(scale, offset) to turn DN into reflectance.

    Earth Search v1 already subtracts the baseline-04.00 BOA offset from the pixel values
    (property `earthsearch:boa_offset_applied`), while the asset metadata still lists
    offset=-0.1. Applying it again would make dark surfaces negative.
    """
    meta = item.assets["red"].extra_fields.get("raster:bands", [{}])[0]
    scale = meta.get("scale", 1e-4)
    offset = 0.0 if item.properties.get("earthsearch:boa_offset_applied") else meta.get("offset", 0.0)
    return scale, offset


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--tone-only", action="store_true",
                    help="re-run tone mapping from the cached s2_reflectance.tif (no downloads)")
    args = ap.parse_args()

    if args.tone_only:
        meta = json.loads((WORK_DIR / "imagery.json").read_text())
        with rasterio.open(WORK_DIR / "s2_reflectance.tif") as f:
            rgb = f.read()
            profile = dict(driver="GTiff", width=f.width, height=f.height, crs=f.crs,
                           transform=f.transform, compress="deflate", tiled=True,
                           blockxsize=512, blockysize=512)
        write_imagery(rgb, profile, meta["scale"], meta["offset"])
        print("Re-toned data/work/imagery.tif")
        return 0

    cfg = load_config()
    area = load_area(cfg)
    ensure_dirs()

    by_date = search(cfg, area)
    print(f"Candidate dates: {len(by_date)}")
    pinned = args.date or (None if args.list else cfg["imagery"].get("date"))
    if pinned:
        pinned = str(pinned)
        if pinned not in by_date:
            print(f"No scenes on {pinned}", file=sys.stderr)
            return 1
        dates = [pinned]
    else:
        # Pre-rank by the worst tile-level cloud cover, then score the best few precisely.
        dates = sorted(by_date, key=lambda d: max(i.properties["eo:cloud_cover"] for i in by_date[d]))
        dates = dates[:10]

    scored = []
    for d in dates:
        clear, snow = score_date(area, by_date[d])
        ids = [i.id for i in by_date[d]]
        scored.append({"date": d, "clear": clear, "snow": snow, "items": ids})
        print(f"  {d}  clear {clear:6.1%}  snow {snow:5.1%}  tiles {len(ids)}")
    # Clearest first; among (near-)equally clear dates, least snow = late-summer look.
    scored.sort(key=lambda s: (-round(s["clear"], 3), s["snow"]))
    if args.list:
        return 0

    best = scored[0]
    print(f"Using {best['date']} (clear {best['clear']:.1%})")
    items = sorted(by_date[best["date"]], key=lambda i: i.properties["eo:cloud_cover"])
    # Prefer tiles in the area's own UTM zone (no reprojection = sharper).
    zone = area.crs.split(":")[1]
    items.sort(key=lambda i: str(i.properties.get("proj:code", i.properties.get("proj:epsg"))).endswith(zone) is False)

    res = float(cfg["imagery"]["resolution_m"])
    transform, w, h = grid(area, res)
    rgb = np.zeros((3, h, w), np.uint16)
    for it in items:
        filled = rgb[0] > 0
        if filled.all():
            break
        print(f"  reading {it.id}")
        for b, name in enumerate(BANDS):
            band = read_to_grid(it.assets[name].href, area.crs, transform, w, h,
                                Resampling.bilinear, "uint16")
            rgb[b] = np.where(filled, rgb[b], band)
    missing = float((rgb[0] == 0).mean())
    print(f"Mosaic {w}x{h} @ {res} m, missing {missing:.2%}")

    profile = dict(driver="GTiff", width=w, height=h, crs=area.crs, transform=transform,
                   compress="deflate", tiled=True, blockxsize=512, blockysize=512)
    with rasterio.open(WORK_DIR / "s2_reflectance.tif", "w", count=3, dtype="uint16",
                       nodata=0, predictor=2, **profile) as f:
        f.write(rgb)

    scale, offset = radiometry(items[0])
    write_imagery(rgb, profile, scale, offset)

    meta = {"chosen": best, "candidates": scored, "resolution_m": res,
            "missing_fraction": missing, "scale": scale, "offset": offset,
            "sun_azimuth_deg": items[0].properties.get("view:sun_azimuth"),
            "sun_elevation_deg": items[0].properties.get("view:sun_elevation")}
    (WORK_DIR / "imagery.json").write_text(json.dumps(meta, indent=2))
    print("Wrote data/work/s2_reflectance.tif, imagery.tif, imagery.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
