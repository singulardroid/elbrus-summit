import * as THREE from 'three';
import type { Frame, Manifest } from './data';

/**
 * Vertical "cut" walls around the terrain block so the model reads as a physical relief
 * model instead of a floating sheet. Built from the exact DEM edge profiles.
 */
export function buildWallsGeometry(m: Manifest, f: Frame, baseY: number): THREE.BufferGeometry {
  const half = f.res / 2;
  const x0 = f.left + half - f.cx, x1 = f.right - half - f.cx;
  const zN = -(f.top - half - f.cy), zS = -(f.bottom + half - f.cy);

  const positions: number[] = [];
  const tops: number[] = []; // 1 at the top edge, 0 at the base: used for a vertical tint
  const indices: number[] = [];

  const strip = (pts: [number, number, number][]) => {
    const start = positions.length / 3;
    for (const [x, y, z] of pts) {
      positions.push(x, y, z, x, baseY, z);
      tops.push(1, 0);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = start + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  const { north, south, west, east } = m.edges;
  const nx = north.length, ny = west.length;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  strip(north.map((h, i) => [lerp(x0, x1, i / (nx - 1)), h, zN]));
  strip(south.map((h, i) => [lerp(x0, x1, i / (nx - 1)), h, zS]));
  strip(west.map((h, i) => [x0, h, lerp(zN, zS, i / (ny - 1))]));
  strip(east.map((h, i) => [x1, h, lerp(zN, zS, i / (ny - 1))]));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colors = new Float32Array(tops.length * 3);
  const top = new THREE.Color(0x7a6a58), bottom = new THREE.Color(0x2e2721);
  tops.forEach((t, i) => {
    const c = bottom.clone().lerp(top, t);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
