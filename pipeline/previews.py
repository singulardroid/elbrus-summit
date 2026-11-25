"""Step 4: preview images + sanity checks for the phase-1 data.

Outputs (data/work/previews/):
  hillshade.png   shaded relief from the DEM
  imagery.png     true-colour Sentinel-2 mosaic (downscaled)
  overlay.png     imagery x hillshade with key POIs and lift lines
  report.json     DEM checks (summit height and position, error vs OSM-surveyed summit heights)

Exit code 1 if the DEM fails the configured sanity check.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFont
from rasterio.enums import Resampling

from common import WORK_DIR, load_area, load_config

OUT = WORK_DIR / "previews"
PREVIEW_PX = 2000

KEY_POIS = {
    "Mount Elbrus (West Summit)": "West Summit",
    "Mount Elbrus (East Summit)": "East Summit",
    "Azau": "Azau",
    "Krugosor": "Krugosor",
    "Mir": "Mir",
    "Garabashi": "Garabashi",
    "Cheget": "Cheget",
    "Donguzorun Glavni": "Donguzorun",
    "Nakratau": "Nakratau",
}


def hillshade(z: np.ndarray, res: float, azimuth=315.0, altitude=40.0, zf=1.0) -> np.ndarray:
    """Lambertian shading of a north-up grid. Azimuth is clockwise from north, in degrees."""
    gy, gx = np.gradient(z * zf, res)          # gy: d/d(row) = southward
    dzdx, dzdy = gx, -gy                       # east, north
    n = np.stack([-dzdx, -dzdy, np.ones_like(z)])
    n /= np.linalg.norm(n, axis=0)
    az, alt = math.radians(azimuth), math.radians(altitude)
    light = np.array([math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)])
    return np.clip(np.tensordot(light, n, axes=1), 0, 1)


def font(size: int):
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def main() -> int:
    cfg = load_config()
    area = load_area(cfg)
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {}

    # --- DEM -----------------------------------------------------------------------------
    with rasterio.open(WORK_DIR / "dem.tif") as f:
        dem = f.read(1)
        dem_t = f.transform
        dem_res = f.res[0]
        bounds = f.bounds
    iy, ix = np.unravel_index(np.nanargmax(dem), dem.shape)
    max_x, max_y = dem_t * (ix + 0.5, iy + 0.5)
    report["dem"] = {
        "shape": list(dem.shape), "resolution_m": dem_res,
        "min_m": round(float(dem.min()), 1), "max_m": round(float(dem.max()), 1),
        "max_xy": [round(max_x, 1), round(max_y, 1)],
    }

    # --- OSM summit heights vs DEM ---------------------------------------------------------
    pois = json.loads((WORK_DIR / "osm_pois.geojson").read_text())["features"]
    diffs = []
    for p in pois:
        props = p["properties"]
        ele = props.get("elevation_osm_m")
        x, y = area.to_xy(*p["geometry"]["coordinates"])
        col, row = ~dem_t * (x, y)
        r, c = int(row), int(col)
        if not (0 <= r < dem.shape[0] and 0 <= c < dem.shape[1]):
            continue
        props["_xy"] = (x, y)
        props["_dem"] = float(dem[r, c])
        if props["category"] == "summit" and ele and ele > 1000:
            # Peak in DEM = max within ~1 px radius (OSM node vs grid offset).
            win = dem[max(r - 1, 0):r + 2, max(c - 1, 0):c + 2]
            diffs.append(float(win.max()) - ele)
    d = np.array(diffs)
    report["summits_vs_osm"] = {
        "n": int(d.size),
        "median_diff_m": round(float(np.median(d)), 1),
        "mean_diff_m": round(float(d.mean()), 1),
        "p10_p90_m": [round(float(np.percentile(d, 10)), 1), round(float(np.percentile(d, 90)), 1)],
        "note": "DEM minus OSM-surveyed summit height; negative = DEM lower (30 m grid flattens sharp peaks)",
    }
    west = next((p for p in pois if (p["properties"]["name"].get("en") or "").startswith("Mount Elbrus (West")), None)
    if west:
        wx, wy = west["properties"]["_xy"]
        report["dem"]["max_offset_from_osm_west_summit_m"] = round(math.hypot(max_x - wx, max_y - wy), 1)

    lo, hi = cfg["dem"]["sanity_check"]["max_elevation_m"]
    ok = lo <= report["dem"]["max_m"] <= hi
    report["dem"]["sanity_check"] = {"expected_max_range_m": [lo, hi], "pass": ok}

    # --- Hillshade -------------------------------------------------------------------------
    hs = hillshade(dem.astype(np.float64), dem_res)
    hs_img = Image.fromarray((hs * 255).astype(np.uint8)).resize((PREVIEW_PX, PREVIEW_PX * dem.shape[0] // dem.shape[1]), Image.LANCZOS)
    hs_img.save(OUT / "hillshade.png")

    # --- Imagery ---------------------------------------------------------------------------
    with rasterio.open(WORK_DIR / "imagery.tif") as f:
        h = PREVIEW_PX * f.height // f.width
        rgb = f.read(out_shape=(3, h, PREVIEW_PX), resampling=Resampling.average)
    img = Image.fromarray(np.moveaxis(rgb, 0, -1))
    img.save(OUT / "imagery.png")

    # --- Overlay ---------------------------------------------------------------------------
    hs_r = np.asarray(hs_img.resize(img.size, Image.LANCZOS), dtype=np.float32) / 255
    base = np.asarray(img, dtype=np.float32) / 255
    # Imagery already contains real sun shadows, so only a light relief accent here.
    blend = base * (0.8 + 0.3 * hs_r[..., None])
    over = Image.fromarray((np.clip(blend, 0, 1) * 255).astype(np.uint8))
    draw = ImageDraw.Draw(over)
    sx = img.size[0] / (bounds.right - bounds.left)
    sy = img.size[1] / (bounds.top - bounds.bottom)

    def px(x, y):
        return ((x - bounds.left) * sx, (bounds.top - y) * sy)

    lines = json.loads((WORK_DIR / "osm_lines.geojson").read_text())["features"]
    for ln in lines:
        if ln["properties"]["kind"] in ("path", "track"):
            continue
        pts = [px(*area.to_xy(lon, lat)) for lon, lat in ln["geometry"]["coordinates"]]
        draw.line(pts, fill=(255, 210, 0), width=3)

    f_big = font(30)
    seen = set()
    for p in pois:
        props = p["properties"]
        en = props["name"].get("en") or props["name"].get("local") or ""
        label = KEY_POIS.get(en)
        if not label or label in seen or "_xy" not in props:
            continue
        seen.add(label)
        x, y = px(*props["_xy"])
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(230, 40, 40), outline="white", width=3)
        draw.text((x + 14, y - 18), label, font=f_big, fill="white", stroke_width=4, stroke_fill="black")
    # scale bar: 5 km
    bar = 5000 * sx
    x0, y0 = 40, img.size[1] - 60
    draw.rectangle((x0, y0, x0 + bar, y0 + 12), fill="white", outline="black", width=2)
    draw.text((x0, y0 - 40), "5 km", font=f_big, fill="white", stroke_width=4, stroke_fill="black")
    draw.text((img.size[0] - 70, 30), "N ↑", font=f_big, fill="white", stroke_width=4, stroke_fill="black")
    over.save(OUT / "overlay.png")

    (OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Previews in {OUT}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
