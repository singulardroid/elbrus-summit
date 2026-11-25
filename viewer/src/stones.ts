import * as THREE from 'three';
import type { JourneyDoor } from './data';
import type { DoorState } from './doors';

/**
 * Story stones: a low-poly waypoint stone at each story point, with its number glowing above it
 * and thin light along its edges. The light show happens on the ground around it (rune circles
 * and pulses, painted into the terrain shader — see synthwave.ts) plus a few rising sparks.
 * Nothing stands in front of the view. Only the stones around the camera are built.
 */

export type StoneShape = 'rune' | 'obelisk' | 'slab' | 'twin' | 'boulder' | 'menhir';
const SHAPES: StoneShape[] = ['rune', 'obelisk', 'slab', 'twin', 'boulder', 'menhir'];

export const STATE_COLOR: Record<DoorState, number> = {
  open: 0xffd9a8, // warm, steady
  last: 0xff7a3d, // dawn orange
  next: 0xff4fd8, // magenta
  closed: 0x8f9dff, // cool violet-blue
};

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const rand01 = (n: number) => (hash(n) % 100000) / 100000;

export function stoneShape(n: number, total: number): StoneShape {
  if (n === total) return 'obelisk';
  const k = hash(n * 7 + 3) % SHAPES.length;
  const prev = n > 1 ? hash((n - 1) * 7 + 3) % SHAPES.length : -1;
  return SHAPES[k === prev ? (k + 2) % SHAPES.length : k];
}

/** Move every vertex by a small seeded offset (same position → same offset, so faces stay closed). */
function rough(g: THREE.BufferGeometry, seed: number, amount: number): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const key = Math.round(p.getX(i) * 100) * 73856093 ^ Math.round(p.getY(i) * 100) * 19349663 ^ Math.round(p.getZ(i) * 100) * 83492791;
    const h = hash((key ^ seed) >>> 0);
    p.setXYZ(i,
      p.getX(i) + ((h % 1000) / 1000 - 0.5) * amount,
      p.getY(i) + (((h >> 10) % 1000) / 1000 - 0.5) * amount * 0.6,
      p.getZ(i) + (((h >> 20) % 1000) / 1000 - 0.5) * amount);
  }
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

function stoneGeometry(shape: StoneShape, seed: number): { parts: THREE.BufferGeometry[]; top: number } {
  switch (shape) {
    case 'rune':
      return { parts: [rough(new THREE.CylinderGeometry(0.45, 0.62, 1.5, 6, 2).translate(0, 0.65, 0), seed, 0.14)], top: 1.45 };
    case 'obelisk':
      return { parts: [rough(new THREE.CylinderGeometry(0.08, 0.42, 2.3, 4, 1).translate(0, 1.05, 0), seed, 0.06)], top: 2.2 };
    case 'slab':
      return { parts: [rough(new THREE.BoxGeometry(1.25, 1.55, 0.36, 2, 2, 1).translate(0, 0.68, 0).rotateZ(0.12), seed, 0.12)], top: 1.5 };
    case 'twin':
      return {
        parts: [
          rough(new THREE.CylinderGeometry(0.3, 0.42, 1.5, 5, 1).translate(-0.45, 0.65, 0).rotateZ(0.08), seed, 0.1),
          rough(new THREE.CylinderGeometry(0.22, 0.34, 1.0, 5, 1).translate(0.5, 0.4, 0.15).rotateZ(-0.12), seed + 1, 0.1),
        ],
        top: 1.45,
      };
    case 'boulder':
      return { parts: [rough(new THREE.IcosahedronGeometry(0.75, 0).scale(1.25, 0.8, 1).translate(0, 0.35, 0), seed, 0.18)], top: 1.0 };
    case 'menhir':
      return { parts: [rough(new THREE.CylinderGeometry(0.3, 0.55, 2.0, 5, 3).translate(0, 0.9, 0).rotateX(0.07), seed, 0.12)], top: 1.95 };
  }
}

function numberTexture(n: number, color: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "800 84px Unbounded, 'Arial Black', sans-serif";
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(10, 6, 30, 0.85)'; // dark outline: readable over bright ground
  g.strokeText(String(n), 128, 68);
  g.shadowColor = `#${color.getHexString()}`;
  g.shadowBlur = 18;
  g.fillStyle = `#${color.clone().lerp(new THREE.Color(0xffffff), 0.55).getHexString()}`;
  g.fillText(String(n), 128, 68);
  g.shadowBlur = 0;
  g.fillText(String(n), 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sparkVS = /* glsl */ `
  attribute float seed;
  uniform float time, rise, pixelRatio;
  varying float vA;
  void main() {
    float t = fract(time * rise * (0.6 + seed) + seed * 7.0);
    float ang = seed * 40.0 + time * 0.3;
    float r = 1.2 + seed * 3.2;
    vec3 p = vec3(cos(ang) * r, t * 3.5, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = sin(t * 3.1416);
    gl_PointSize = pixelRatio * clamp(40.0 / -mv.z, 1.0, 5.0);
  }`;
const sparkFS = /* glsl */ `
  uniform vec3 color;
  uniform float intensity;
  varying float vA;
  void main() {
    vec2 q = abs(gl_PointCoord - 0.5);
    float diamond = 1.0 - smoothstep(0.3, 0.5, q.x + q.y);
    gl_FragColor = vec4(color, diamond * vA * intensity);
  }`;

class Stone {
  readonly group = new THREE.Group();
  readonly top: number;
  private readonly edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly label: THREE.Sprite;
  private readonly sparks: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly beam?: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly phase: number;
  private readonly color: THREE.Color;

  constructor(readonly door: JourneyDoor, shape: StoneShape, readonly state: DoorState, private reached: boolean, scale: number) {
    this.phase = rand01(door.n) * 6.283;
    this.color = new THREE.Color(STATE_COLOR[state]);
    const { parts, top } = stoneGeometry(shape, door.n * 31);
    const rock = new THREE.MeshLambertMaterial({ color: 0x2b2452, flatShading: true });
    for (const g of parts) {
      this.group.add(new THREE.Mesh(g, rock));
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({
        color: this.color, transparent: true, opacity: 0.7,
      }));
      this.edges.push(e);
      this.group.add(e);
    }
    this.group.rotation.y = rand01(door.n * 13) * Math.PI * 2;

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: numberTexture(door.n, this.color), transparent: true, depthWrite: false, fog: true,
    }));
    this.label.scale.set(1.6, 0.8, 1);
    this.label.position.y = top + 0.75;
    this.group.add(this.label);

    const N = 28;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('seed', new THREE.BufferAttribute(Float32Array.from({ length: N }, (_, i) => rand01(door.n * 97 + i)), 1));
    this.sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, rise: { value: 0.1 }, pixelRatio: { value: 1 }, color: { value: this.color }, intensity: { value: 0.6 } },
      vertexShader: sparkVS, fragmentShader: sparkFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);

    if (state === 'last') {
      // The latest story: a faint, thin beam into the sky, visible from the whole mountain.
      this.beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.6, 800, 6, 1, true).translate(0, 400, 0),
        new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.group.add(this.beam);
    }
    this.group.scale.setScalar(scale);
    this.top = (top + 1.2) * scale;
    this.setReached(reached);
  }

  setReached(reached: boolean): void {
    this.reached = reached;
    this.sparks.material.uniforms.rise.value = reached ? 0.07 : 0.14;
  }

  update(time: number, pixelRatio: number): void {
    // Reached: steady. Ahead: a breathing pulse, offset per stone.
    const pulse = this.reached ? 1 : 0.5 + 0.5 * Math.sin(time * 2.4 + this.phase);
    for (const e of this.edges) e.material.opacity = this.reached ? 0.75 : 0.3 + 0.55 * pulse;
    (this.label.material as THREE.SpriteMaterial).opacity = this.reached ? 0.95 : 0.6 + 0.4 * pulse;
    this.label.position.y = this.top / this.group.scale.y - 1.2 + 0.75 + Math.sin(time * 1.2 + this.phase) * 0.08;
    const su = this.sparks.material.uniforms;
    su.time.value = time;
    su.pixelRatio.value = pixelRatio;
    su.intensity.value = this.reached ? 0.55 : 0.3 + 0.4 * pulse;
    if (this.beam) this.beam.material.opacity = 0.09 + 0.04 * Math.sin(time * 1.6);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && 'map' in mat) (mat as THREE.SpriteMaterial).map?.dispose();
      mat?.dispose();
    });
  }
}

/** The stones around the current story point (4 behind to 8 ahead, plus the latest opened). */
export class Stones {
  readonly group = new THREE.Group();
  private readonly active = new Map<number, Stone>();
  private readonly reachedOf = new Map<number, boolean>();

  constructor(
    private readonly doors: JourneyDoor[],
    private readonly stateOf: (n: number) => DoorState,
    private readonly groundAt: (x: number, z: number) => number | undefined,
  ) {
    this.group.name = 'stones';
  }

  sync(current: number, opened: number): void {
    const want = new Set<number>();
    for (let n = current - 4; n <= current + 8; n++) if (n >= 1 && n <= this.doors.length) want.add(n);
    if (opened >= 1) want.add(opened);
    for (const [n, s] of this.active) {
      if (!want.has(n) || s.state !== this.stateOf(n)) {
        this.group.remove(s.group);
        s.dispose();
        this.active.delete(n);
      } else if (this.reachedOf.get(n) !== n <= current) {
        s.setReached(n <= current);
      }
      this.reachedOf.set(n, n <= current);
    }
    for (const n of want) {
      if (this.active.has(n)) continue;
      const d = this.doors[n - 1];
      const s = new Stone(d, stoneShape(n, this.doors.length), this.stateOf(n), n <= current, n === this.doors.length ? 1.6 : 1);
      s.group.position.set(d.p[0], d.p[1], d.p[2]);
      this.group.add(s.group);
      this.active.set(n, s);
      this.reachedOf.set(n, n <= current);
    }
  }

  /** Stones whose ground effects should be painted (for the terrain shader). */
  list(): { door: JourneyDoor; state: DoorState; reached: boolean }[] {
    return [...this.active.values()].map((s) => ({ door: s.door, state: s.state, reached: this.reachedOf.get(s.door.n) ?? false }));
  }

  topOf(n: number): number {
    return this.active.get(n)?.top ?? 3;
  }

  update(time: number, pixelRatio: number): void {
    for (const [n, s] of this.active) {
      const d = this.doors[n - 1];
      // Sunk a little so the stone sits in the slope instead of on a point.
      s.group.position.y = (this.groundAt(d.p[0], d.p[2]) ?? d.p[1]) - 0.25;
      s.update(time, pixelRatio);
    }
  }
}
