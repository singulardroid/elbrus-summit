"""Shared helpers: config loading, area geometry, paths."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from pyproj import Transformer

PIPELINE_DIR = Path(__file__).resolve().parent
REPO_DIR = PIPELINE_DIR.parent
DATA_DIR = REPO_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
WORK_DIR = DATA_DIR / "work"
BUILD_DIR = DATA_DIR / "build"

USER_AGENT = "elbrus-3d-pipeline/0.1"

# All raster grids share bounds snapped to this many metres (a multiple of 10 m and 30 m).
GRID_ALIGN = 120


def load_config(path: Path | None = None) -> dict:
    with open(path or PIPELINE_DIR / "config.yaml") as f:
        return yaml.safe_load(f)


@dataclass(frozen=True)
class Area:
    """Square area on a projected CRS, centred on a lon/lat point."""

    crs: str
    center_xy: tuple[float, float]
    size_m: float

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """(minx, miny, maxx, maxy) in the projected CRS."""
        cx, cy = self.center_xy
        h = self.size_m / 2
        return (cx - h, cy - h, cx + h, cy + h)

    def bounds_snapped(self, res: float) -> tuple[float, float, float, float]:
        """Bounds snapped outward to GRID_ALIGN metres.

        Every raster product (DEM, imagery, ...) uses these identical bounds, so pixel grids of
        different resolutions cover exactly the same extent and stay aligned.
        """
        import math

        if GRID_ALIGN % res:
            raise ValueError(f"resolution {res} m must divide GRID_ALIGN={GRID_ALIGN} m")
        a = GRID_ALIGN
        minx, miny, maxx, maxy = self.bounds
        return (
            math.floor(minx / a) * a,
            math.floor(miny / a) * a,
            math.ceil(maxx / a) * a,
            math.ceil(maxy / a) * a,
        )

    def lonlat_bounds(self, pad_deg: float = 0.0) -> tuple[float, float, float, float]:
        """Lon/lat envelope of the projected square (densified edges), optionally padded."""
        t = Transformer.from_crs(self.crs, "EPSG:4326", always_xy=True)
        lon0, lat0, lon1, lat1 = t.transform_bounds(*self.bounds, densify_pts=50)
        return (lon0 - pad_deg, lat0 - pad_deg, lon1 + pad_deg, lat1 + pad_deg)

    def to_xy(self, lon: float, lat: float) -> tuple[float, float]:
        t = Transformer.from_crs("EPSG:4326", self.crs, always_xy=True)
        return t.transform(lon, lat)


def load_area(cfg: dict) -> Area:
    a = cfg["area"]
    lon, lat = a["center_lonlat"]
    t = Transformer.from_crs("EPSG:4326", a["crs"], always_xy=True)
    cx, cy = t.transform(lon, lat)
    return Area(crs=a["crs"], center_xy=(cx, cy), size_m=float(a["size_m"]))


def ensure_dirs() -> None:
    for d in (RAW_DIR, WORK_DIR, BUILD_DIR):
        d.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    cfg = load_config()
    area = load_area(cfg)
    print("CRS:", area.crs)
    print("Projected bounds:", [round(v, 1) for v in area.bounds])
    print("Lon/lat bounds:", [round(v, 4) for v in area.lonlat_bounds()])
