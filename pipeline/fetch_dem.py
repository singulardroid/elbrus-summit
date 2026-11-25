"""Step 1: download Copernicus DEM GLO-30 tiles and reproject to the area grid.

Output: data/work/dem.tif (float32 metres, area CRS, `dem.resolution_m` pixels)
"""
from __future__ import annotations

import math
import sys

import numpy as np
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import reproject

from common import RAW_DIR, USER_AGENT, WORK_DIR, ensure_dirs, load_area, load_config

BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def tiles_for(lonlat_bounds) -> list[str]:
    lon0, lat0, lon1, lat1 = lonlat_bounds
    return [
        tile_name(lat, lon)
        for lat in range(math.floor(lat0), math.floor(lat1) + 1)
        for lon in range(math.floor(lon0), math.floor(lon1) + 1)
    ]


def download(name: str) -> "Path | None":
    out_dir = RAW_DIR / "dem"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.tif"
    if path.exists() and path.stat().st_size > 0:
        print(f"  cached  {path.name}")
        return path
    url = f"{BASE_URL}/{name}/{name}.tif"
    r = requests.get(url, stream=True, timeout=120, headers={"User-Agent": USER_AGENT})
    if r.status_code == 404:
        print(f"  missing {name} (ocean / no data)")
        return None
    r.raise_for_status()
    tmp = path.with_suffix(".part")
    with open(tmp, "wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
    tmp.rename(path)
    print(f"  fetched {path.name} ({path.stat().st_size / 1e6:.1f} MB)")
    return path


def main() -> int:
    cfg = load_config()
    area = load_area(cfg)
    ensure_dirs()
    res = float(cfg["dem"]["resolution_m"])

    # Pad so bilinear resampling at the edges has source pixels.
    names = tiles_for(area.lonlat_bounds(pad_deg=0.01))
    print(f"DEM tiles needed: {len(names)}")
    paths = [p for p in (download(n) for n in names) if p]
    if not paths:
        print("No DEM tiles found", file=sys.stderr)
        return 1

    srcs = [rasterio.open(p) for p in paths]
    mosaic, mosaic_transform = merge(srcs)
    src_crs = srcs[0].crs
    src_nodata = srcs[0].nodata
    for s in srcs:
        s.close()

    minx, miny, maxx, maxy = area.bounds_snapped(res)
    width = int(round((maxx - minx) / res))
    height = int(round((maxy - miny) / res))
    dst_transform = from_origin(minx, maxy, res, res)
    dst = np.full((height, width), np.nan, dtype=np.float32)

    reproject(
        source=mosaic[0].astype(np.float32),
        destination=dst,
        src_transform=mosaic_transform,
        src_crs=src_crs,
        src_nodata=src_nodata,
        dst_transform=dst_transform,
        dst_crs=area.crs,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )

    voids = ~np.isfinite(dst)
    print(f"Grid {width}x{height} @ {res} m, voids: {voids.sum()} px")
    if voids.any() and cfg["dem"].get("fill_voids", True):
        mask = (~voids).astype(np.uint8)
        dst = fillnodata(np.where(voids, 0, dst), mask=mask, max_search_distance=100)
        print(f"  voids after fill: {(~np.isfinite(dst)).sum()} px")

    out = WORK_DIR / "dem.tif"
    profile = dict(
        driver="GTiff", dtype="float32", width=width, height=height, count=1,
        crs=area.crs, transform=dst_transform, nodata=None,
        compress="deflate", predictor=3, tiled=True, blockxsize=256, blockysize=256,
    )
    with rasterio.open(out, "w", **profile) as f:
        f.write(dst, 1)

    lo, hi = float(np.nanmin(dst)), float(np.nanmax(dst))
    print(f"Wrote {out.relative_to(WORK_DIR.parent.parent)}  elevation {lo:.0f} – {hi:.0f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
