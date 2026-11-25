// Manifest types and loaders for the pipeline's web export (pipeline/build_web.py).
//
// Scene convention: X = east, Y = up, Z = south (north is -Z), metres, origin = grid centre.

export interface Localized { en?: string; ru?: string }

export interface Poi {
  id: string;
  name: Localized & { local?: string };
  category: string;
  elevation_m: number;
  lonlat: [number, number];
  position: [number, number, number];
  description?: Localized;
  image?: string;
  source?: string; // "osm:node/123" | "manual"
  approximate?: boolean; // position is estimated
}

export interface RouteSegment {
  mode: 'lift' | 'foot';
  name: Localized;
  lengthM: number;
  ascentM: number;
  fromM: number;
  toM: number;
  points: [number, number, number][]; // scene coordinates, draped (foot) or cable (lift)
}

export interface Route {
  id: string;
  name: Localized;
  description: Localized;
  summit?: string;
  stops: string[]; // POI ids along the route
  lengthM: number;
  footLengthM: number;
  liftLengthM: number;
  footAscentM: number;
  startM: number;
  highM: number;
  segments: RouteSegment[];
  profile: [number, number, number][]; // [distance m, elevation m, segment index]
}

interface GeoFit {
  toLonLat: { scale: number; lon: number[]; lat: number[] };
  fromLonLat: { lon0: number; lat0: number; scaleLon: number; scaleLat: number; x: number[]; z: number[] };
  maxErrorM: number;
}

export interface TileInfo {
  id: string; // "<level>-<x>-<y>", x grows east, y grows south
  level: number;
  x: number;
  y: number;
  bounds: [number, number, number, number]; // scene minX, minZ, maxX, maxZ
  minY: number;
  maxY: number;
  errorM: number; // mesh simplification error
  texelM: number; // texture pixel size on the ground
  texturePx: number;
  texturePad: number; // gutter of neighbouring imagery on each side of the texture
  vertices: number;
  meshBytes: number;
  textureBytes: number;
}

export interface JourneyDoor {
  n: number; // 1..250, from the start of the climb to the summit
  d: number; // distance along the path (m)
  p: [number, number, number]; // scene position on the ground
  heading: number; // walking direction, radians clockwise from north
  elevation_m: number;
}

export interface Journey {
  route: string;
  lengthM: number;
  stepM: number;
  path: [number, number, number][]; // ground-hugging path, every stepM
  pathD: number[]; // 3D distance along the path at each point
  doors: JourneyDoor[];
  stations: { id: string; name: Localized; d: number; elevation_m: number }[];
}

export interface Manifest {
  version: number;
  name: string;
  crs: string;
  origin: [number, number];
  bounds: [number, number, number, number]; // left, bottom, right, top (projected metres)
  grid: { width: number; height: number; resolution_m: number };
  height: { min: number; max: number; quantum_m: number };
  tiles: { levels: number; path: string; mesh: string; texture: string; list: TileInfo[] };
  collision: { url: string; width: number; height: number; cellM: number };
  edges: { north: number[]; south: number[]; west: number[]; east: number[] };
  sun: { azimuth: number; elevation: number; date: string };
  geo: GeoFit;
  pois: Poi[];
  routes?: Route[];
  journey?: Journey;
  attribution: string[];
}

/** Scene x/z <-> WGS84 lon/lat via the pipeline's cubic fit (sub-metre over the area). */
export class Geo {
  constructor(private readonly g: GeoFit) {}

  private static terms(u: number, v: number): number[] {
    return [1, u, v, u * u, u * v, v * v, u * u * u, u * u * v, u * v * v, v * v * v];
  }

  private static dot(c: number[], t: number[]): number {
    let s = 0;
    for (let i = 0; i < c.length; i++) s += c[i] * t[i];
    return s;
  }

  toLonLat(x: number, z: number): [number, number] {
    const f = this.g.toLonLat;
    const t = Geo.terms(x / f.scale, z / f.scale);
    return [Geo.dot(f.lon, t), Geo.dot(f.lat, t)];
  }

  toScene(lon: number, lat: number): [number, number] {
    const f = this.g.fromLonLat;
    const t = Geo.terms((lon - f.lon0) / f.scaleLon, (lat - f.lat0) / f.scaleLat);
    return [Geo.dot(f.x, t), Geo.dot(f.z, t)];
  }
}

export function formatLatLon(lon: number, lat: number, digits = 4): string {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Fetch a binary file, reporting progress (0..1) when the size is known. */
export async function fetchBinary(url: string, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!total || !onProgress) return r.arrayBuffer();
  const reader = r.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, got);
    got += value.length;
    onProgress(got / total);
  }
  return out.buffer;
}

/** World helpers derived from the manifest. */
export class Frame {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
  readonly cx: number;
  readonly cy: number;
  readonly res: number;

  constructor(readonly m: Manifest) {
    [this.left, this.bottom, this.right, this.top] = m.bounds;
    [this.cx, this.cy] = m.origin;
    this.res = m.grid.resolution_m;
  }

  /** Scene half-extents (x, z). */
  get halfWidth(): number { return (this.right - this.left) / 2; }
  get halfDepth(): number { return (this.top - this.bottom) / 2; }
}

/** Max-pooled height grid used to keep the camera above ground and the orbit target on it. */
export class CollisionGrid {
  private readonly h: Uint16Array;

  constructor(buf: ArrayBuffer, private readonly m: Manifest, private readonly f: Frame) {
    this.h = new Uint16Array(buf);
  }

  /** Ground height (m) under scene point (x, z); bilinear over the max-pooled grid. */
  heightAt(x: number, z: number): number {
    const { width: w, height: hgt, cellM } = this.m.collision;
    const e = x + this.f.cx;
    const n = this.f.cy - z;
    const col = Math.min(Math.max((e - this.f.left) / cellM - 0.5, 0), w - 1.001);
    const row = Math.min(Math.max((this.f.top - n) / cellM - 0.5, 0), hgt - 1.001);
    const c0 = Math.floor(col), r0 = Math.floor(row);
    const fc = col - c0, fr = row - r0;
    const i = r0 * w + c0;
    const v =
      this.h[i] * (1 - fc) * (1 - fr) + this.h[i + 1] * fc * (1 - fr) +
      this.h[i + w] * (1 - fc) * fr + this.h[i + w + 1] * fc * fr;
    return this.m.height.min + v * this.m.height.quantum_m;
  }
}
