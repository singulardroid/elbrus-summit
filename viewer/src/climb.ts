import * as THREE from 'three';
import type { Journey } from './data';

/**
 * The guided climb: a position along the journey path that glides from door to door.
 * Short steps take about a second; long jumps speed up but still travel along the trail,
 * so the camera never cuts through the mountain.
 */
const STAND_BEFORE = 0; // the camera orbits the story point itself

export class Climb {
  door = 1;
  d = 0; // current distance along the path (m)
  private dTarget = 0;
  private readonly pts: THREE.Vector3[];
  private readonly cumAscent: number[];
  private readonly flat: number[]; // horizontal distance along the path

  constructor(readonly j: Journey) {
    this.pts = j.path.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.cumAscent = [0];
    this.flat = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.cumAscent.push(this.cumAscent[i - 1] + Math.max(0, b.y - a.y));
      this.flat.push(this.flat[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
  }

  get doorCount(): number {
    return this.j.doors.length;
  }

  get moving(): boolean {
    return Math.abs(this.dTarget - this.d) > 0.05;
  }

  /** The point on the trail for door n (where its stone stands). */
  standAt(n: number): number {
    return Math.max(0, this.j.doors[n - 1].d - STAND_BEFORE);
  }

  goTo(n: number, instant = false): void {
    this.door = THREE.MathUtils.clamp(Math.round(n), 1, this.doorCount);
    this.dTarget = this.standAt(this.door);
    if (instant) this.d = this.dTarget;
  }

  step(delta: number): void {
    this.goTo(this.door + delta);
  }

  /** Advance toward the target. Returns true while moving. */
  update(dt: number): boolean {
    const diff = this.dTarget - this.d;
    if (Math.abs(diff) <= 0.05) {
      this.d = this.dTarget;
      return false;
    }
    const speed = Math.max(16, Math.abs(diff) * 2.2); // m/s: a brisk walk for one door, faster for jumps
    this.d += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    return true;
  }

  private index(d: number): [number, number] {
    const D = this.j.pathD;
    let lo = 0, hi = D.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (D[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = D[hi] > D[lo] ? THREE.MathUtils.clamp((d - D[lo]) / (D[hi] - D[lo]), 0, 1) : 0;
    return [lo, t];
  }

  pointAt(d: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [i, t] = this.index(d);
    return out.lerpVectors(this.pts[i], this.pts[Math.min(i + 1, this.pts.length - 1)], t);
  }

  /** Walking direction (horizontal, normalised), averaged over ±window m. */
  directionAt(d: number, out = new THREE.Vector3(), window = 60): THREE.Vector3 {
    const a = this.pointAt(Math.max(0, d - window));
    const b = this.pointAt(Math.min(this.j.lengthM, d + window));
    out.set(b.x - a.x, 0, b.z - a.z);
    return out.lengthSq() > 1e-6 ? out.normalize() : out.set(0, 0, -1);
  }

  /** Stats for the HUD at distance d. */
  stats(d: number): { elevation: number; distance: number; ascent: number; walkMinutes: number } {
    const [i, t] = this.index(d);
    const k = Math.min(i + 1, this.pts.length - 1);
    const lerp = (arr: number[]) => arr[i] + (arr[k] - arr[i]) * t;
    const ascent = lerp(this.cumAscent);
    const flatKm = lerp(this.flat) / 1000;
    // Naismith's rule: 5 km/h on the flat plus 1 h per 600 m of ascent.
    const walkMinutes = (flatKm / 5 + ascent / 600) * 60;
    return { elevation: this.pointAt(d).y, distance: d, ascent, walkMinutes };
  }

  /** The stations before and after distance d, and whether d is right at one (within 70 m). */
  stage(d: number): { at?: string; from?: string; to?: string } {
    const s = this.j.stations;
    const at = s.find((x) => Math.abs(x.d - d) < 70);
    if (at) return { at: at.id };
    let from, to;
    for (const x of s) {
      if (x.d <= d) from = x.id;
      else if (!to) to = x.id;
    }
    return { from, to };
  }

  /** Nearest door to a station. */
  doorAtStation(id: string): number {
    const st = this.j.stations.find((x) => x.id === id);
    if (!st) return 1;
    let best = 1, bd = Infinity;
    for (const door of this.j.doors) {
      const dd = Math.abs(door.d - st.d);
      if (dd < bd) [best, bd] = [door.n, dd];
    }
    return best;
  }
}
