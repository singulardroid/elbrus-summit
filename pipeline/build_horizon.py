"""Step 6: the land around the relief block, out toward the horizon.

Two nested rings of real heights around the 40 km block, so the mountain no longer floats as a
slab in space when you zoom out:
  ring 1: 3x the block (about 120 km), 300 x 300 cells (about 400 m), the block cut out
  ring 2: 3x ring 1 (about 360 km), 180 x 180 cells (about 2 km), ring 1 cut out
Each ring's hole is exactly the next finer ring (or the block), and every 5th vertex of ring 1's
outer edge sits on a ring 2 vertex, so the viewer can stitch them without cracks.

Heights come from Copernicus DEM GLO-90 (free, also for commercial use), read at low resolution
straight from the public COGs on AWS (no full tiles downloaded). Missing tiles are sea: 0 m.

Needs data/build/<area>/manifest.json (run build_web.py first).

Output in data/build/<area>/:
  horizon.json   ring layout (scene metres) and offsets into horizon.bin
  horizon.bin    int16 heights in metres, ring after ring, row 0 = north, west to east
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling

from common import BUILD_DIR, load_config

GLO90 = "https://copernicus-dem-90m.s3.amazonaws.com/{n}/{n}.tif"


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_30_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


class Dem:
    """GLO-90 tiles read at a reduced size, sampled bilinearly by lon/lat."""

    def __init__(self, px_per_deg: int):
        self.n = px_per_deg
        self.tiles: dict[tuple[int, int], np.ndarray | None] = {}

    def tile(self, lat: int, lon: int) -> np.ndarray | None:
        key = (lat, lon)
        if key not in self.tiles:
            url = "/vsicurl/" + GLO90.format(n=tile_name(lat, lon))
            try:
                with rasterio.open(url) as s:
                    # Rows north → south, columns west → east, pixel-is-area over [lat, lat+1] x [lon, lon+1].
                    self.tiles[key] = s.read(1, out_shape=(self.n, self.n), resampling=Resampling.average).astype(np.float32)
                print(f"  read    {tile_name(lat, lon)} at {self.n} px")
            except rasterio.errors.RasterioIOError:
                print(f"  sea     {tile_name(lat, lon)} (no tile)")
                self.tiles[key] = None
        return self.tiles[key]

    def sample(self, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
        out = np.zeros(lon.shape, np.float32)
        tlat, tlon = np.floor(lat).astype(int), np.floor(lon).astype(int)
        for la, lo in sorted(set(zip(tlat.ravel().tolist(), tlon.ravel().tolist()))):
            a = self.tile(la, lo)
            if a is None:
                continue
            m = (tlat == la) & (tlon == lo)
            # Fractional pixel position (pixel centres at +0.5).
            fx = (lon[m] - lo) * self.n - 0.5
            fy = (la + 1 - lat[m]) * self.n - 0.5
            x0 = np.clip(np.floor(fx).astype(int), 0, self.n - 1)
            y0 = np.clip(np.floor(fy).astype(int), 0, self.n - 1)
            x1, y1 = np.minimum(x0 + 1, self.n - 1), np.minimum(y0 + 1, self.n - 1)
            tx, ty = np.clip(fx - x0, 0, 1), np.clip(fy - y0, 0, 1)
            top = a[y0, x0] * (1 - tx) + a[y0, x1] * tx
            bot = a[y1, x0] * (1 - tx) + a[y1, x1] * tx
            out[m] = top * (1 - ty) + bot * ty
        return out


def main() -> int:
    cfg = load_config()
    out_dir = BUILD_DIR / cfg["web"]["out_subdir"] if "web" in cfg and "out_subdir" in cfg["web"] else BUILD_DIR / cfg["area"]["name"]
    man_path = out_dir / "manifest.json"
    if not man_path.exists():
        print(f"No {man_path}: run build_web.py first", file=sys.stderr)
        return 1
    m = json.loads(man_path.read_text())
    left, bottom, right, top = m["bounds"]
    cx, cy = m["origin"]
    to_ll = Transformer.from_crs(m["crs"], "EPSG:4326", always_xy=True)

    rings = []
    blob = bytearray()
    # (cells per side, hole cells per side, reads per degree)
    plan = [(300, 100, 400), (180, 60, 80)]
    w, h = right - left, top - bottom  # the hole of ring 1: the block
    x0, y1 = left, top
    for cells, hole, ppd in plan:
        sx, sy = w / hole, h / hole  # cell size: the hole spans `hole` cells exactly
        ox = x0 - sx * (cells - hole) / 2  # west edge of the ring
        oy = y1 + sy * (cells - hole) / 2  # north edge
        xs = ox + np.arange(cells + 1) * sx
        ys = oy - np.arange(cells + 1) * sy
        gx, gy = np.meshgrid(xs, ys)
        lon, lat = to_ll.transform(gx, gy)
        print(f"Ring {len(rings) + 1}: {cells} cells of {sx:.0f} x {sy:.0f} m, "
              f"lon {lon.min():.2f}…{lon.max():.2f}, lat {lat.min():.2f}…{lat.max():.2f}")
        heights = Dem(ppd).sample(np.asarray(lon), np.asarray(lat))
        q = np.clip(np.round(heights), -500, 9000).astype("<i2")
        rings.append({
            "cells": cells, "hole": hole,
            # Scene coordinates (x east, z south) of the north-west corner, and the cell size.
            "x0": ox - cx, "z0": -(oy - cy), "dx": sx, "dz": sy,
            "offset": len(blob), "min": int(q.min()), "max": int(q.max()),
        })
        blob += q.tobytes()
        # The next ring's hole is this whole ring.
        w, h = sx * cells, sy * cells
        x0, y1 = ox, oy

    (out_dir / "horizon.bin").write_bytes(bytes(blob))
    (out_dir / "horizon.json").write_text(json.dumps({
        "source": "Copernicus DEM GLO-90 (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, "
                  "provided under COPERNICUS by the European Union and ESA)",
        "rings": rings,
    }, indent=1))
    print(f"Wrote horizon.bin ({len(blob) / 1e3:.0f} kB) and horizon.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
