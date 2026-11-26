import * as THREE from 'three';
import { fetchBinary, fetchJson, type Frame, type Manifest } from './data';
import { createApronMaterial, roundWorld, WORLD_RADIUS } from './synthwave';

/**
 * The land around the relief block, out toward the horizon (pipeline/build_horizon.py): two rings
 * of real heights from Copernicus GLO-90, about 400 m and 2 km apart, so the mountain sits in the
 * Caucasus instead of floating as a slab.
 *
 * Stitching: ring 1's inner edge takes the block's own edge heights; its outer edge follows ring 2
 * (every 5th vertex is shared, the ones between are interpolated), so there are no cracks.
 * Beyond the block the ground drops with the earth's curvature, so far ridges sink toward the
 * horizon as they really do. If the files are missing, there is simply no ring.
 */

interface RingInfo { cells: number; hole: number; x0: number; z0: number; dx: number; dz: number; offset: number }
interface HorizonFile { source: string; rings: RingInfo[] }

const EARTH_R = 6371000;

export class Horizon {
  readonly group = new THREE.Group();
  private readonly digital = createApronMaterial();
  private readonly satellite = roundWorld(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  private meshes: THREE.Mesh[] = [];

  static async load(base: string, m: Manifest, f: Frame): Promise<Horizon | null> {
    try {
      const [info, bin] = await Promise.all([
        fetchJson<HorizonFile>(`${base}horizon.json`),
        fetchBinary(`${base}horizon.bin`),
      ]);
      return new Horizon(info, new Int16Array(bin), m, f);
    } catch {
      return null; // no ring: the block alone, as before
    }
  }

  private constructor(info: HorizonFile, data: Int16Array, m: Manifest, f: Frame) {
    this.group.name = 'horizon';
    const hw = f.halfWidth, hd = f.halfDepth;
    const rings = info.rings.map((r) => ({ ...r, h: data.subarray(r.offset / 2, r.offset / 2 + (r.cells + 1) ** 2) }));

    // Ring heights as a mutable copy; stitch from the outside in.
    const heights = rings.map((r) => Float32Array.from(r.h));
    for (let k = rings.length - 2; k >= 0; k--) this.stitchToOuter(rings[k], heights[k], rings[k + 1], heights[k + 1]);
    this.stitchToBlock(rings[0], heights[0], m, f);

    rings.forEach((r, k) => {
      // Only rings that reach inside the round world (the outer one starts beyond it).
      if ((r.hole / 2) * Math.min(r.dx, r.dz) >= WORLD_RADIUS) return;
      const mesh = new THREE.Mesh(this.geometry(r, heights[k], hw, hd), this.digital);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  setLook(digital: boolean): void {
    for (const mesh of this.meshes) mesh.material = digital ? this.digital : this.satellite;
  }

  /** Ring `a`'s outer edge onto ring `b`'s hole edge (b's cells are `s` of a's). */
  private stitchToOuter(a: RingInfo, ha: Float32Array, b: RingInfo, hb: Float32Array): void {
    const n = a.cells, s = n / b.hole, nb = b.cells + 1;
    const i0 = (b.cells - b.hole) / 2; // b's hole starts at this column/row
    const hbAt = (col: number, row: number) => hb[(i0 + row) * nb + i0 + col];
    const edge = (t: number, side: 'n' | 's' | 'w' | 'e') => {
      // t in a's vertex units along the side; interpolate between b's vertices.
      const u = t / s, j = Math.min(Math.floor(u), b.hole - 1), k = u - j;
      const at = (q: number) =>
        side === 'n' ? hbAt(q, 0) : side === 's' ? hbAt(q, b.hole) : side === 'w' ? hbAt(0, q) : hbAt(b.hole, q);
      return at(j) * (1 - k) + at(j + 1) * k;
    };
    const na = n + 1;
    for (let t = 0; t <= n; t++) {
      ha[t] = edge(t, 'n');
      ha[n * na + t] = edge(t, 's');
      ha[t * na] = edge(t, 'w');
      ha[t * na + n] = edge(t, 'e');
    }
  }

  /** Ring 1's inner edge onto the block's edge heights (manifest.edges, pixel centres). */
  private stitchToBlock(r: RingInfo, h: Float32Array, m: Manifest, f: Frame): void {
    const na = r.cells + 1, i0 = (r.cells - r.hole) / 2, i1 = i0 + r.hole;
    const half = f.res / 2;
    const x0 = f.left + half - f.cx, x1 = f.right - half - f.cx;
    const zN = -(f.top - half - f.cy), zS = -(f.bottom + half - f.cy);
    const sample = (arr: number[], t: number) => {
      const u = THREE.MathUtils.clamp(t, 0, 1) * (arr.length - 1);
      const j = Math.min(Math.floor(u), arr.length - 2);
      return arr[j] + (arr[j + 1] - arr[j]) * (u - j);
    };
    const { north, south, west, east } = m.edges;
    for (let q = i0; q <= i1; q++) {
      const x = r.x0 + q * r.dx, z = r.z0 + q * r.dz;
      const tx = (x - x0) / (x1 - x0), tz = (z - zN) / (zS - zN);
      h[i0 * na + q] = sample(north, tx);
      h[i1 * na + q] = sample(south, tx);
      h[q * na + i0] = sample(west, tz);
      h[q * na + i1] = sample(east, tz);
    }
  }

  private geometry(r: RingInfo, h: Float32Array, hw: number, hd: number): THREE.BufferGeometry {
    const na = r.cells + 1, i0 = (r.cells - r.hole) / 2, i1 = i0 + r.hole;
    const pos = new Float32Array(na * na * 3), real = new Float32Array(na * na), col = new Float32Array(na * na * 3);
    const c = new THREE.Color();
    for (let row = 0; row < na; row++) {
      for (let q = 0; q < na; q++) {
        const i = row * na + q;
        const x = r.x0 + q * r.dx, z = r.z0 + row * r.dz;
        const out = Math.hypot(Math.max(Math.abs(x) - hw, 0), Math.max(Math.abs(z) - hd, 0));
        pos[i * 3] = x;
        pos[i * 3 + 1] = h[i] - (out * out) / (2 * EARTH_R);
        pos[i * 3 + 2] = z;
        real[i] = h[i];
        satelliteColor(h[i], c);
        col.set([c.r, c.g, c.b], i * 3);
      }
    }
    const idx: number[] = [];
    for (let row = 0; row < r.cells; row++) {
      for (let q = 0; q < r.cells; q++) {
        if (row >= i0 && row < i1 && q >= i0 && q < i1) continue; // the hole
        // Cells wholly beyond the round world's edge are never drawn.
        const cx = r.x0 + (q + 0.5) * r.dx, cz = r.z0 + (row + 0.5) * r.dz;
        if (Math.hypot(cx, cz) > WORLD_RADIUS + Math.hypot(r.dx, r.dz)) continue;
        const a = row * na + q, b = a + 1, d = a + na, e = d + 1;
        if ((row + q) % 2) idx.push(a, d, b, b, d, e);
        else idx.push(a, d, e, a, e, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('realH', new THREE.BufferAttribute(real, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Colours like the summer satellite photo: green valleys, brown and grey slopes, snow on top. */
const SAT = [
  [0, 0x3d4a2e], [600, 0x56643a], [1500, 0x6d7046], [2300, 0x7d7560], [3000, 0x8e8a84], [3500, 0xc9cdd3], [4000, 0xeef1f5],
] as const;
function satelliteColor(h: number, out: THREE.Color): void {
  if (h <= 0) { out.set(0x2b4a66); return; } // sea
  for (let i = 1; i < SAT.length; i++) {
    if (h < SAT[i][0] || i === SAT.length - 1) {
      const t = THREE.MathUtils.clamp((h - SAT[i - 1][0]) / (SAT[i][0] - SAT[i - 1][0]), 0, 1);
      out.set(SAT[i - 1][1]).lerp(new THREE.Color(SAT[i][1]), t);
      return;
    }
  }
}
