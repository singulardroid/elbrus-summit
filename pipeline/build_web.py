"""Step 5: export web assets for the viewer: quadtree terrain tiles + metadata.

Usage: build_web.py [--skip-tiles]   (--skip-tiles: only refresh manifest/POIs, e.g. after editing content)

Outputs in data/build/<web.out_subdir>/:
  manifest.json            grid, scene origin, tile list, sun, POIs, attribution
  tiles/<L>-<x>-<y>.glb    terrain mesh per tile (meshopt-compressed glTF via gltfpack)
                           attributes: POSITION, NORMAL (normals from the full-res DEM, so
                           lighting does not change between detail levels); skirts included
  tiles/<L>-<x>-<y>.webp   imagery for the tile (north at the top, glTF UV convention), with a
                           gutter of `texturePad` px of neighbouring imagery on every side
  collision.bin            uint16 max-pooled height grid, row 0 = north, (h - h_min) * 10

Quadtree: level 0 is the whole area; each level splits every tile into 2 x 2. Tile (L, x, y):
x grows east, y grows south. Tiles are cut on DEM grid lines, so neighbours share their
border samples. UVs are not stored: the viewer derives them from vertex positions.

Scene convention (three.js): X = east, Y = up, Z = south (north is -Z). Metres. Origin = grid centre.
"""
from __future__ import annotations

import json
import shutil
import struct
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from PIL import Image
from pydelatin import Delatin

from common import BUILD_DIR, PIPELINE_DIR, REPO_DIR, WORK_DIR, load_area, load_config

Image.MAX_IMAGE_PIXELS = None
GLTFPACK = PIPELINE_DIR / "node_modules" / ".bin" / "gltfpack"


# --- glTF writing ---------------------------------------------------------------------------

def write_glb(path, positions: np.ndarray, normals: np.ndarray, indices: np.ndarray,
              translation: list[float]) -> None:
    """Minimal GLB: one node (translated), one mesh, POSITION + NORMAL + uint32 indices."""
    pos = positions.astype(np.float32).tobytes()
    nrm = normals.astype(np.float32).tobytes()
    idx = indices.astype(np.uint32).tobytes()
    views, blob = [], b""
    for data, target in ((pos, 34962), (nrm, 34962), (idx, 34963)):
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob += data + b"\0" * ((-len(data)) % 4)
    n = len(positions)
    gltf = {
        "asset": {"version": "2.0", "generator": "elbrus-3d pipeline"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "translation": translation}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "mode": 4}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n, "type": "VEC3",
             "min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": n, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": int(indices.size), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(blob), b"BIN\0") + blob)


def gltfpack(src, dst, position_bits: int) -> None:
    cmd = [str(GLTFPACK), "-i", str(src), "-o", str(dst), "-cc", "-kv", "-vp", str(position_bits)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not dst.exists():
        raise RuntimeError(f"gltfpack failed for {src.name}: {r.stderr.strip()}")


# --- terrain helpers ------------------------------------------------------------------------

def normal_grid(dem: np.ndarray, res: float) -> np.ndarray:
    """Per-sample unit normals in scene axes (x=east, y=up, z=south)."""
    gy, gx = np.gradient(dem.astype(np.float64), res)  # gy: d/d(row) = southward
    n = np.stack([-gx, np.ones_like(gx), gy], axis=-1)  # dh/dz_scene = d/d(south) = gy
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n.astype(np.float32)


def add_skirts(pos: np.ndarray, nrm: np.ndarray, tris: np.ndarray, depth: float):
    """Hang a vertical strip below every border edge (both windings) to hide cracks."""
    edges = np.sort(np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]]), axis=1)
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    border = uniq[counts == 1]
    verts = np.unique(border)
    remap = np.full(len(pos), -1, np.int64)
    remap[verts] = np.arange(len(verts)) + len(pos)
    low = pos[verts].copy()
    low[:, 1] -= depth
    a, b = border[:, 0], border[:, 1]
    a2, b2 = remap[a], remap[b]
    skirt = np.concatenate([
        np.stack([a, b, b2], 1), np.stack([a, b2, a2], 1),   # one winding
        np.stack([a, b2, b], 1), np.stack([a, a2, b2], 1),   # and the other
    ])
    return (np.concatenate([pos, low]), np.concatenate([nrm, nrm[verts]]),
            np.concatenate([tris, skirt]).astype(np.uint32))


def fit_geo(area, cx: float, cy: float, half: float) -> dict:
    """Cubic polynomials mapping scene x/z <-> lon/lat over the area (sub-metre accurate).

    Lets the viewer show coordinates and use lat/lon in deep links without a projection library.
    Terms: [1, u, v, u², uv, v², u³, u²v, uv², v³] with normalised inputs.
    """
    from pyproj import Transformer

    to_ll = Transformer.from_crs(area.crs, "EPSG:4326", always_xy=True)
    g = np.linspace(-half * 1.05, half * 1.05, 41)
    xs, zs = np.meshgrid(g, g)
    xs, zs = xs.ravel(), zs.ravel()
    lon, lat = to_ll.transform(xs + cx, cy - zs)

    def terms(u, v):
        return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v, u ** 3, u * u * v, u * v * v, v ** 3], 1)

    s_xy = half
    a = terms(xs / s_xy, zs / s_xy)
    c_lon = np.linalg.lstsq(a, lon, rcond=None)[0]
    c_lat = np.linalg.lstsq(a, lat, rcond=None)[0]
    lon0, lat0 = float(np.mean(lon)), float(np.mean(lat))
    s_lon, s_lat = float(np.ptp(lon) / 2), float(np.ptp(lat) / 2)
    b = terms((lon - lon0) / s_lon, (lat - lat0) / s_lat)
    c_x = np.linalg.lstsq(b, xs, rcond=None)[0]
    c_z = np.linalg.lstsq(b, zs, rcond=None)[0]
    err_xy = float(np.max(np.hypot(b @ c_x - xs, b @ c_z - zs)))
    m_per_deg_lat = 111_320
    err_ll = float(np.max(np.hypot((a @ c_lon - lon) * m_per_deg_lat * np.cos(np.radians(lat)),
                                   (a @ c_lat - lat) * m_per_deg_lat)))
    print(f"Geo fit: max error {err_ll:.2f} m (scene→lon/lat), {err_xy:.2f} m (lon/lat→scene)")
    return {
        "toLonLat": {"scale": s_xy, "lon": c_lon.tolist(), "lat": c_lat.tolist()},
        "fromLonLat": {"lon0": lon0, "lat0": lat0, "scaleLon": s_lon, "scaleLat": s_lat,
                       "x": c_x.tolist(), "z": c_z.tolist()},
        "maxErrorM": round(max(err_xy, err_ll), 3),
    }


ROUTE_STEP_M = 30        # densify foot segments to the DEM spacing
LIFT_CABLE_M = 15        # draw lift cables this far above the ground at stations/pylons
PROFILE_POINTS = 240


def build_routes(area, ground, cx: float, cy: float, pois: list[dict]) -> list[dict]:
    """Drape content/routes.geojson onto the terrain; compute length, ascent and a profile.

    Lengths, ascent and the profile come from the 30 m DEM. Stage start/end heights and the
    highest point use a stop's surveyed elevation when the stop is within 300 m, because the DEM
    flattens peaks (it reads 5,625 m for the 5,642 m West Summit).
    """
    poi_ids = {p["id"] for p in pois}
    by_id = {p["id"]: p for p in pois}
    path = REPO_DIR / "content" / "routes.geojson"
    if not path.exists():
        return []
    out = []
    for feat in json.loads(path.read_text())["features"]:
        pr = feat["properties"]
        bad = [s for s in pr.get("stops", []) if s not in poi_ids]
        if bad:
            print(f"  ! route {pr['id']}: unknown stops {bad}")
        segs, profile = [], []
        dist = 0.0
        for seg, line in zip(pr["segments"], feat["geometry"]["coordinates"]):
            xy = [area.to_xy(lon, lat) for lon, lat in line]
            pts: list[tuple[float, float, float]] = []
            if seg["mode"] == "lift":
                for i, (x, y) in enumerate(xy):
                    lift = 0 if i in (0, len(xy) - 1) else LIFT_CABLE_M
                    pts.append((x, y, ground(x, y) + lift))
            else:
                for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
                    n = max(1, int(np.ceil(np.hypot(x1 - x0, y1 - y0) / ROUTE_STEP_M)))
                    for k in range(n):
                        t = k / n
                        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                        pts.append((x, y, ground(x, y)))
                pts.append((*xy[-1], ground(*xy[-1])))
            p = np.array(pts)
            step = np.linalg.norm(np.diff(p, axis=0), axis=1)
            dz = np.diff(p[:, 2])
            seg_len = float(step.sum())
            cum = dist + np.concatenate([[0], np.cumsum(step)])
            profile.extend(zip(cum.tolist(), p[:, 2].tolist(), [len(segs)] * len(p)))
            dist += seg_len
            segs.append({
                "mode": seg["mode"], "name": seg["name"],
                "lengthM": round(seg_len), "ascentM": round(float(dz[dz > 0].sum())),
                "fromM": round(float(p[0, 2])), "toM": round(float(p[-1, 2])),
                # scene coordinates: x east, y up, z south
                "points": [[round(x - cx, 1), round(z, 1), round(-(y - cy), 1)] for x, y, z in pts],
            })
        stop_pts = [by_id[s] for s in pr.get("stops", []) if s in by_id]

        def surveyed(scene_xz, fallback):
            best = min(stop_pts, key=lambda q: np.hypot(q["position"][0] - scene_xz[0], q["position"][2] - scene_xz[1]), default=None)
            if best and np.hypot(best["position"][0] - scene_xz[0], best["position"][2] - scene_xz[1]) < 300:
                return best["elevation_m"]
            return fallback

        for sg in segs:
            a, z = sg["points"][0], sg["points"][-1]
            sg["fromM"] = surveyed((a[0], a[2]), sg["fromM"])
            sg["toM"] = surveyed((z[0], z[2]), sg["toM"])
        prof = np.array(profile)
        idx = np.unique(np.linspace(0, len(prof) - 1, min(PROFILE_POINTS, len(prof))).round().astype(int))
        foot = [s for s in segs if s["mode"] == "foot"]
        out.append({
            "id": pr["id"], "name": pr["name"], "description": pr.get("description", {}),
            "summit": pr.get("summit"), "stops": pr.get("stops", []),
            "lengthM": round(dist),
            "footLengthM": sum(s["lengthM"] for s in foot),
            "liftLengthM": sum(s["lengthM"] for s in segs if s["mode"] == "lift"),
            "footAscentM": sum(s["ascentM"] for s in foot),
            "startM": segs[0]["fromM"],
            "highM": by_id[pr["summit"]]["elevation_m"] if pr.get("summit") in by_id else round(float(prof[:, 1].max())),
            "segments": segs,
            "profile": [[round(prof[i, 0]), round(prof[i, 1]), int(prof[i, 2])] for i in idx],
        })
        r = out[-1]
        print(f"Route {r['id']}: {r['lengthM'] / 1000:.1f} km ({r['footLengthM'] / 1000:.1f} km on foot), "
              f"ascent on foot {r['footAscentM']} m, {r['startM']} → {r['highM']} m")
    return out


def build_journey(cfg: dict, area, ground, cx: float, cy: float, pois: list[dict]) -> dict | None:
    """The guided climb: one ground-hugging path from the route's start to its summit, sampled
    every `step_m`, with `doors` story doors spaced evenly by distance along it.

    Cable-car stages are draped on the ground beneath the cable (the ski-slope corridor), so the
    whole climb can be walked and highlighted on the terrain.
    """
    jc = cfg.get("journey")
    path = REPO_DIR / "content" / "routes.geojson"
    if not jc or not path.exists():
        return None
    feat = next((f for f in json.loads(path.read_text())["features"] if f["properties"]["id"] == jc["route"]), None)
    if not feat:
        print(f"  ! journey route {jc['route']} not found")
        return None
    xy: list[tuple[float, float]] = []
    for line in feat["geometry"]["coordinates"]:
        pts = [area.to_xy(lon, lat) for lon, lat in line]
        if xy and np.hypot(pts[0][0] - xy[-1][0], pts[0][1] - xy[-1][1]) < 1:
            pts = pts[1:]
        xy.extend(pts)
    a = np.array(xy)
    seg = np.hypot(*np.diff(a, axis=0).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    step = float(jc.get("step_m", 10))
    d = np.arange(0, cum[-1], step)
    d = np.append(d, cum[-1])
    x = np.interp(d, cum, a[:, 0])
    y = np.interp(d, cum, a[:, 1])
    # Light smoothing of the plan view (OSM zig-zags read as noise on a camera rail); ends fixed.
    k = 5
    if len(x) > 2 * k:
        ker = np.ones(2 * k + 1) / (2 * k + 1)
        xs = np.convolve(np.pad(x, k, mode="edge"), ker, mode="valid")
        ys = np.convolve(np.pad(y, k, mode="edge"), ker, mode="valid")
        xs[0], ys[0], xs[-1], ys[-1] = x[0], y[0], x[-1], y[-1]
        x, y = xs, ys
    z = np.array([ground(px, py) for px, py in zip(x, y)])
    pts3 = np.stack([x, z, y], 1)
    d3 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts3, axis=0), axis=1))])
    length = float(d3[-1])

    def at(dist: float):
        i = int(np.clip(np.searchsorted(d3, dist) - 1, 0, len(d3) - 2))
        t = (dist - d3[i]) / max(d3[i + 1] - d3[i], 1e-6)
        px, py = x[i] + (x[i + 1] - x[i]) * t, y[i] + (y[i + 1] - y[i]) * t
        heading = float(np.arctan2(x[i + 1] - x[i], y[i + 1] - y[i]))  # radians, 0 = north (projected)
        return px, py, heading

    by_id = {p["id"]: p for p in pois}
    stations = []
    for sid in feat["properties"].get("stops", []):
        if sid not in by_id:
            continue
        px, pz = by_id[sid]["position"][0] + cx, cy - by_id[sid]["position"][2]
        i = int(np.argmin(np.hypot(x - px, y - pz)))
        stations.append({"id": sid, "name": by_id[sid]["name"], "d": round(float(d3[i])),
                         "elevation_m": by_id[sid]["elevation_m"]})

    # --- Doors and the walked trail ------------------------------------------------------
    # Low-poly trail: straight segments only. Doors are roughly evenly spaced along the base
    # route (±35 % jitter); their sideways offset mixes a slow random drift (the path wanders
    # off to one side for a while) with a random jump per door whose side only usually flips.
    # Some legs get an extra kink. All seeded, so builds are reproducible.
    n = int(jc["doors"])
    rng = np.random.default_rng(int(jc.get("seed", 250)))
    lo_amp, hi_amp = jc.get("zigzag_m", [3, 28])
    spacing = length / (n - 1)
    base_d = np.array([spacing * i for i in range(n)])
    base_d[1:-1] += rng.uniform(-0.35, 0.35, n - 2) * spacing
    base_d = np.maximum.accumulate(np.clip(base_d, 0, length))

    # Slow drift: a few low-frequency sines with random phases (asymmetric wandering).
    t = base_d / length
    drift = sum(a * np.sin(2 * np.pi * (f * t + ph))
                for a, f, ph in zip(rng.uniform(5, 14, 3), rng.uniform(3, 17, 3), rng.uniform(0, 1, 3)))
    side, offs = 1, []
    for i in range(n):
        if rng.random() < 0.62:
            side = -side
        jump = side * (lo_amp + (hi_amp - lo_amp) * rng.random() ** 1.6)
        offs.append(0.0 if i in (0, n - 1) else float(drift[i] + jump))

    def offset_point(dist: float, o: float):
        px, py, heading = at(dist)
        nx, ny = np.cos(heading), -np.sin(heading)  # sideways (normal to the walking direction)
        return np.array([px + nx * o, py + ny * o])

    door_xy = [offset_point(base_d[i], offs[i]) for i in range(n)]
    # Corner points of the trail: every door, plus an occasional kink between two doors.
    corners, is_door = [], []
    for i in range(n):
        corners.append(door_xy[i]); is_door.append(True)
        if i < n - 1 and rng.random() < 0.4:
            f = rng.uniform(0.3, 0.7)
            dmid = base_d[i] + f * (base_d[i + 1] - base_d[i])
            omid = offs[i] + f * (offs[i + 1] - offs[i]) + rng.uniform(-14, 14)
            corners.append(offset_point(dmid, omid)); is_door.append(False)

    # Densify each straight leg for terrain heights (plan view stays straight).
    zx, zy, knot_idx = [], [], []
    for c in range(len(corners) - 1):
        a, b = corners[c], corners[c + 1]
        if is_door[c]:
            knot_idx.append(len(zx))
        m = max(1, int(np.ceil(np.hypot(*(b - a)) / step)))
        for k in range(m):
            q = a + (b - a) * (k / m)
            zx.append(q[0]); zy.append(q[1])
    knot_idx.append(len(zx))
    zx.append(corners[-1][0]); zy.append(corners[-1][1])
    zx, zy = np.array(zx), np.array(zy)
    zz = np.array([ground(a, b) for a, b in zip(zx, zy)])
    zp = np.stack([zx, zz, zy], 1)
    zd = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(zp, axis=0), axis=1))])
    zlength = float(zd[-1])

    doors = []
    for i in range(n):
        j = knot_idx[i]
        a, b = max(j - 4, 0), min(j + 4, len(zx) - 1)  # average of the incoming and outgoing legs
        heading = float(np.arctan2(zx[b] - zx[a], zy[b] - zy[a]))
        doors.append({"n": i + 1, "d": round(float(zd[j]), 1),
                      "p": [round(zx[j] - cx, 1), round(float(zz[j]), 1), round(-(zy[j] - cy), 1)],
                      "heading": round(heading, 4), "elevation_m": round(float(zz[j]))})
    for st in stations:
        sid = st["id"]
        px, pz = by_id[sid]["position"][0] + cx, cy - by_id[sid]["position"][2]
        j = int(np.argmin(np.hypot(zx - px, zy - pz)))
        st["d"] = round(float(zd[j]))
        nearest = min(doors, key=lambda dd: abs(dd["d"] - st["d"]))
        nearest["station"] = sid

    print(f"Journey {jc['route']}: base {length / 1000:.2f} km, zigzag trail {zlength / 1000:.2f} km, "
          f"{len(zd)} path points, {n} doors every ~{zlength / (n - 1):.0f} m, {len(stations)} stations")
    return {
        "route": jc["route"], "lengthM": round(zlength), "stepM": step,
        "path": [[round(a - cx, 1), round(float(h), 1), round(-(b - cy), 1)] for a, h, b in zip(zx, zz, zy)],
        "pathD": [round(float(v), 1) for v in zd],
        "doors": doors, "stations": stations,
    }


def splits(n_samples: int, parts: int) -> list[int]:
    return [round(i * (n_samples - 1) / parts) for i in range(parts + 1)]


# --- main -----------------------------------------------------------------------------------

def main() -> int:
    skip_tiles = "--skip-tiles" in sys.argv  # content-only rebuild: reuse tiles from the last run
    cfg = load_config()
    area = load_area(cfg)
    tcfg, wcfg = cfg["tiles"], cfg["web"]
    if not GLTFPACK.exists():
        print("gltfpack missing: run `npm install` in pipeline/", file=sys.stderr)
        return 1
    out = BUILD_DIR / wcfg["out_subdir"]
    previous = out / "manifest.json"
    if skip_tiles and not previous.exists():
        print("--skip-tiles needs an earlier full build", file=sys.stderr)
        return 1
    if not skip_tiles:
        if out.exists():
            shutil.rmtree(out)
        (out / "tiles").mkdir(parents=True)
    raw_dir = WORK_DIR / "tiles_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with rasterio.open(WORK_DIR / "dem.tif") as f:
        dem = f.read(1).astype(np.float32)
        res = f.res[0]
        b = f.bounds
    h, w = dem.shape
    cx, cy = (b.left + b.right) / 2, (b.top + b.bottom) / 2
    h_min, h_max = float(np.floor(dem.min())), float(np.ceil(dem.max()))
    normals = normal_grid(dem, res)

    with rasterio.open(WORK_DIR / "imagery.tif") as f:
        ib = f.bounds
        rgb = np.moveaxis(f.read(), 0, -1)
        img_res = f.res[0]
    # Replicate the outer edge so tile gutters at the area border have pixels to sample.
    SRC_PAD = 64
    img = Image.fromarray(np.pad(rgb, ((SRC_PAD, SRC_PAD), (SRC_PAD, SRC_PAD), (0, 0)), mode="edge"))
    del rgb
    assert (ib.left, ib.bottom, ib.right, ib.top) == (b.left, b.bottom, b.right, b.top), "imagery/DEM bounds differ"
    k_img = res / img_res  # imagery pixels per DEM sample (3)

    def sx(col):  # scene x of a DEM sample column
        return b.left + (col + 0.5) * res - cx

    def sz(row):  # scene z of a DEM sample row
        return -(b.top - (row + 0.5) * res - cy)

    tiles, jobs = [], []
    if skip_tiles:
        tiles = json.loads(previous.read_text())["tiles"]["list"]
        print(f"Reusing {len(tiles)} tiles from the previous build")
    for level in range(0 if skip_tiles else int(tcfg["levels"])):
        n = 2 ** level
        err = float(tcfg["max_error_m"][level])
        tex_px = int(tcfg["texture_px"][level])
        skirt = max(float(tcfg["skirt_min_m"]), float(tcfg["skirt_error_factor"]) * err)
        cs, rs = splits(w, n), splits(h, n)
        for ty in range(n):
            for tx in range(n):
                c0, c1, r0, r1 = cs[tx], cs[tx + 1], rs[ty], rs[ty + 1]
                sub = dem[r0:r1 + 1, c0:c1 + 1]
                tin = Delatin(sub, max_error=err)
                v = tin.vertices
                col = v[:, 0].round().astype(np.int64)
                row = (sub.shape[0] - 1 - v[:, 1]).round().astype(np.int64)  # Delatin y grows north
                tris = tin.triangles.astype(np.uint32)
                # Counter-clockwise when seen from above (+Y) in scene x/z.
                px, pz = sx(c0 + col), sz(r0 + row)
                a, bb, c = tris[:, 0], tris[:, 1], tris[:, 2]
                cross_y = (pz[bb] - pz[a]) * (px[c] - px[a]) - (px[bb] - px[a]) * (pz[c] - pz[a])
                flip = cross_y < 0
                tris[flip] = tris[flip][:, [0, 2, 1]]

                centre = [float((sx(c0) + sx(c1)) / 2), 0.0, float((sz(r0) + sz(r1)) / 2)]
                pos = np.stack([px - centre[0], v[:, 2], pz - centre[2]], 1).astype(np.float32)
                nrm = normals[r0 + row, c0 + col]
                pos, nrm, tris = add_skirts(pos, nrm, tris, skirt)

                tid = f"{level}-{tx}-{ty}"
                raw = raw_dir / f"{tid}.glb"
                write_glb(raw, pos, nrm, tris, centre)
                jobs.append((raw, out / "tiles" / f"{tid}.glb"))

                # Texture with a gutter of real neighbouring imagery on every side, so filtering
                # and mipmaps blend across tile borders instead of showing a seam.
                pad = tex_px // 64
                inner = tex_px - 2 * pad
                x0, y0 = (c0 + 0.5) * k_img + SRC_PAD, (r0 + 0.5) * k_img + SRC_PAD
                x1, y1 = (c1 + 0.5) * k_img + SRC_PAD, (r1 + 0.5) * k_img + SRC_PAD
                gx, gy = (x1 - x0) / inner * pad, (y1 - y0) / inner * pad
                box = (x0 - gx, y0 - gy, x1 + gx, y1 + gy)
                tex = img.resize((tex_px, tex_px), Image.LANCZOS, box=box)
                tex.save(out / "tiles" / f"{tid}.webp", quality=int(tcfg["texture_quality"]), method=6)

                tiles.append({
                    "id": tid, "level": level, "x": tx, "y": ty,
                    "bounds": [round(float(sx(c0)), 2), round(float(sz(r0)), 2),
                               round(float(sx(c1)), 2), round(float(sz(r1)), 2)],  # minX, minZ, maxX, maxZ
                    "minY": round(float(sub.min()), 1), "maxY": round(float(sub.max()), 1),
                    "errorM": err,
                    "texelM": round(float((c1 - c0) * res / inner), 2),
                    "texturePx": tex_px, "texturePad": pad,
                    "vertices": int(len(v)),
                })
        print(f"Level {level}: {n * n} tiles, error {err} m, texture {tex_px} px")

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda j: gltfpack(j[0], j[1], int(tcfg["position_bits"])), jobs))
    for t in tiles if not skip_tiles else []:
        t["meshBytes"] = (out / "tiles" / f"{t['id']}.glb").stat().st_size
        t["textureBytes"] = (out / "tiles" / f"{t['id']}.webp").stat().st_size

    # --- Collision grid (max-pooled, conservative) -----------------------------------------
    k = int(wcfg["collision_cell_px"])
    ch, cw = -(-h // k), -(-w // k)
    padded = np.full((ch * k, cw * k), -np.inf, np.float32)
    padded[:h, :w] = dem
    coll = padded.reshape(ch, k, cw, k).max(axis=(1, 3))
    (out / "collision.bin").write_bytes(np.round((coll - h_min) * 10).astype(np.uint16).tobytes())

    # --- Edge profiles for the side walls (metres, west→east / north→south) ------------------
    edges = {
        "north": np.round(dem[0, :], 1).tolist(),
        "south": np.round(dem[-1, :], 1).tolist(),
        "west": np.round(dem[:, 0], 1).tolist(),
        "east": np.round(dem[:, -1], 1).tolist(),
    }

    # --- Height sampling (bilinear on the 30 m DEM) ------------------------------------------
    def ground(x: float, y: float) -> float:
        col = (x - b.left) / res - 0.5
        row = (b.top - y) / res - 0.5
        r0, c0 = int(np.clip(np.floor(row), 0, h - 2)), int(np.clip(np.floor(col), 0, w - 2))
        fr, fc = float(np.clip(row - r0, 0, 1)), float(np.clip(col - c0, 0, 1))
        return float(dem[r0, c0] * (1 - fr) * (1 - fc) + dem[r0, c0 + 1] * (1 - fr) * fc
                     + dem[r0 + 1, c0] * fr * (1 - fc) + dem[r0 + 1, c0 + 1] * fr * fc)

    # --- POIs ------------------------------------------------------------------------------
    pois = []
    for feat in json.loads((REPO_DIR / "content" / "pois.geojson").read_text())["features"]:
        pr = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"]
        x, y = area.to_xy(lon, lat)
        gnd = ground(x, y)
        desc = {k: v for k, v in (pr.get("description") or {}).items() if v}
        pois.append({
            "id": pr["id"], "name": pr["name"], "category": pr["category"],
            "elevation_m": pr.get("elevation_m") or round(gnd),
            "lonlat": [lon, lat],
            "position": [round(x - cx, 1), round(gnd, 1), round(-(y - cy), 1)],
            **({"description": desc} if desc else {}),
            **({"image": pr["image"]} if pr.get("image") else {}),
            **({"source": pr["source"]} if pr.get("source") else {}),
            **({"approximate": True} if pr.get("approximate") else {}),
        })

    # --- Routes: draped on the DEM, with stats and an elevation profile -----------------------
    routes = build_routes(area, ground, cx, cy, pois)
    journey = build_journey(cfg, area, ground, cx, cy, pois)

    imeta = json.loads((WORK_DIR / "imagery.json").read_text())
    manifest = {
        "version": 5,
        "name": cfg["area"]["name"],
        "crs": area.crs,
        "origin": [cx, cy],
        "bounds": [b.left, b.bottom, b.right, b.top],
        "grid": {"width": w, "height": h, "resolution_m": res},
        "height": {"min": h_min, "max": h_max, "quantum_m": 0.1},
        "tiles": {"levels": int(tcfg["levels"]), "path": "tiles/", "mesh": ".glb", "texture": ".webp",
                  "list": tiles},
        "collision": {"url": "collision.bin", "width": cw, "height": ch, "cellM": res * k},
        "edges": edges,
        "sun": {"azimuth": imeta.get("sun_azimuth_deg"), "elevation": imeta.get("sun_elevation_deg"),
                "date": imeta["chosen"]["date"]},
        "geo": fit_geo(area, cx, cy, max(b.right - b.left, b.top - b.bottom) / 2),
        "pois": pois,
        "routes": routes,
        "journey": journey,
        "attribution": [
            "Elevation: Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA",
            f"Imagery: contains modified Copernicus Sentinel data {imeta['chosen']['date'][:4]}",
            "Map data © OpenStreetMap contributors",
        ],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False))
    stories = REPO_DIR / "content" / "stories.json"
    if stories.exists():
        (out / "stories.json").write_text(stories.read_text())

    by_level: dict[int, list[int]] = {}
    for t in tiles:
        s = by_level.setdefault(t["level"], [0, 0, 0])
        s[0] += t["meshBytes"]; s[1] += t["textureBytes"]; s[2] += t["vertices"]
    for lv, (mb, tb, nv) in sorted(by_level.items()):
        print(f"  L{lv}: mesh {mb / 1e6:5.2f} MB, textures {tb / 1e6:5.2f} MB, {nv:,} vertices")
    print(f"Wrote {out}  ({len(tiles)} tiles, {len(pois)} POIs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
