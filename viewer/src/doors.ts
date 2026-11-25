import * as THREE from 'three';
import { num, t } from './i18n';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Journey } from './data';

/**
 * The 250 story doors as seen from afar: a light per door (a string of lights up the slope),
 * the trail as lines for the overview, and number badges near the climber. The doors next to
 * the climber are built as full portals (portals.ts), and their far lights are switched off.
 *
 * Story states follow the "250 stories" design: closed, next, opened last, opened.
 */

export type DoorState = 'open' | 'last' | 'next' | 'closed';

const GLOW: Record<DoorState, { color: number; px: number }> = {
  open: { color: 0xfff1d6, px: 5 },
  last: { color: 0xff7a3d, px: 13 },
  next: { color: 0xff4fd8, px: 9 },
  closed: { color: 0xb39cff, px: 4.5 },
};
const LIGHT_HEIGHT = 6;

export class Doors {
  readonly group = new THREE.Group();
  private readonly glows: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly trailDone: Line2;
  private readonly trailTodo: Line2;
  private readonly trailGlow: Line2;
  private readonly lineMats: LineMaterial[] = [];
  private readonly badges: { obj: CSS2DObject; el: HTMLButtonElement; n: number }[] = [];
  private opened = 0;
  private near: [number, number] = [0, -1];
  private readonly tmpV = new THREE.Vector3();

  constructor(private readonly j: Journey, opened: number, private readonly onPick: (n: number) => void) {
    this.group.name = 'doors';
    const N = j.doors.length;
    const glowPos = new Float32Array(N * 3);
    j.doors.forEach((d, i) => glowPos.set([d.p[0], d.p[1] + LIGHT_HEIGHT, d.p[2]], i * 3));
    const glowGeom = new THREE.BufferGeometry();
    glowGeom.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    glowGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    glowGeom.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.glows = new THREE.Points(glowGeom, new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 }, time: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        uniform float pixelRatio, time;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.85 + 0.15 * sin(time * 2.0 + position.x * 0.05);
          gl_PointSize = size * tw * pixelRatio * clamp(400.0 / -mv.z, 1.0, 2.2);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-(q.x + q.y) * (q.x + q.y) * 2.5); // diamond-shaped: low-poly lights
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glows.frustumCulled = false;

    // Trail lines for the overview (in the climb the trail is painted into the ground instead).
    this.trailGlow = this.line(0xff4fd8, 9, 0.18);
    this.trailDone = this.line(0xffd2b0, 3.5, 1);
    this.trailTodo = this.line(0xff4fd8, 2.2, 0.75);
    this.setLine(this.trailGlow, j.path);
    this.group.add(this.trailGlow, this.trailTodo, this.trailDone, this.glows);

    for (let k = 0; k < 9; k++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'door-badge';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      const badge = { obj: new CSS2DObject(el), el, n: 0 };
      el.addEventListener('click', () => badge.n && this.onPick(badge.n));
      badge.obj.center.set(0.5, 1);
      badge.obj.visible = false;
      this.badges.push(badge);
      this.group.add(badge.obj);
    }
    this.setOpened(opened);
  }

  stateOf(n: number): DoorState {
    if (n === this.opened) return 'last';
    if (n < this.opened) return 'open';
    if (n === this.opened + 1) return 'next';
    return 'closed';
  }

  get openedCount(): number {
    return this.opened;
  }

  /** How many doors are open; colours and the lit part of the overview trail follow. */
  setOpened(opened: number): void {
    this.opened = THREE.MathUtils.clamp(Math.round(opened), 0, this.j.doors.length);
    this.writeGlows();
    const split = this.opened > 0 ? this.j.doors[this.opened - 1].d : 0;
    let iSplit = this.j.pathD.findIndex((v) => v >= split);
    if (iSplit < 0) iSplit = this.j.path.length - 1;
    this.setLine(this.trailDone, this.j.path.slice(0, iSplit + 1));
    this.setLine(this.trailTodo, this.j.path.slice(iSplit));
  }

  /** Doors [from, to] are built as portals: switch their far lights off. */
  setNear(from: number, to: number): void {
    if (from === this.near[0] && to === this.near[1]) return;
    this.near = [from, to];
    this.writeGlows();
  }

  /** Trail lines: shown in the overview, hidden in the climb (where the ground carries the trail). */
  setTrailLines(visible: boolean): void {
    this.trailGlow.visible = visible;
    this.trailDone.visible = visible && this.opened > 0;
    this.trailTodo.visible = visible;
  }

  /** Per frame: badges over the doors around `current`, placed by `badgeAt`. */
  update(current: number, camera: THREE.Camera, time: number, pixelRatio: number, showBadges: boolean,
    badgeAt: (n: number) => THREE.Vector3 | undefined): void {
    const u = this.glows.material.uniforms;
    u.pixelRatio.value = pixelRatio;
    u.time.value = time;
    const span = Math.floor(this.badges.length / 2);
    for (const [k, b] of this.badges.entries()) {
      const n = current - span + k + 2;
      const p = showBadges && n >= 1 && n <= this.j.doors.length ? badgeAt(n) : undefined;
      if (!p) {
        b.obj.visible = false;
        continue;
      }
      if (b.n !== n || b.el.dataset.state !== this.stateOf(n)) {
        b.n = n;
        b.el.innerHTML = `<span>${n}</span>`;
        b.el.dataset.state = this.stateOf(n);
        b.el.setAttribute('aria-label', t('stationN', { n: num(n) }));
      }
      b.el.classList.toggle('is-current', n === current);
      b.obj.position.copy(p);
      b.obj.visible = p.distanceTo(camera.position) < 400;
    }
  }

  /** Door nearest to a screen point (within `maxPx`), for clicks. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera, viewport: { w: number; h: number }, maxPx = 26): number | undefined {
    let best: number | undefined, bestD = maxPx;
    for (const d of this.j.doors) {
      this.tmpV.set(d.p[0], d.p[1] + LIGHT_HEIGHT, d.p[2]).project(camera);
      if (this.tmpV.z > 1) continue;
      const dx = ((this.tmpV.x - ndc.x) / 2) * viewport.w, dy = ((this.tmpV.y - ndc.y) / 2) * viewport.h;
      const dist = Math.hypot(dx, dy);
      if (dist < bestD) [best, bestD] = [d.n, dist];
    }
    return best;
  }

  setResolution(w: number, h: number): void {
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  private writeGlows(): void {
    const colors = this.glows.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizes = this.glows.geometry.getAttribute('size') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (const [i, d] of this.j.doors.entries()) {
      const st = GLOW[this.stateOf(d.n)];
      c.set(st.color);
      colors.setXYZ(i, c.r, c.g, c.b);
      sizes.setX(i, d.n >= this.near[0] && d.n <= this.near[1] ? 0 : st.px);
    }
    colors.needsUpdate = sizes.needsUpdate = true;
  }

  private setLine(l: Line2, pts: [number, number, number][]): void {
    l.visible = pts.length >= 2;
    if (!l.visible) return;
    l.geometry.dispose();
    const g = new LineGeometry();
    g.setPositions(pts.flatMap(([x, y, z]) => [x, y + 1.5, z]));
    l.geometry = g;
    l.computeLineDistances();
  }

  private line(color: number, width: number, opacity: number): Line2 {
    const m = new LineMaterial({
      color, linewidth: width, worldUnits: false, transparent: true, opacity,
      depthWrite: false, fog: true, blending: THREE.AdditiveBlending,
    });
    this.lineMats.push(m);
    const l = new Line2(new LineGeometry(), m);
    l.frustumCulled = false;
    l.renderOrder = 5;
    return l;
  }
}
