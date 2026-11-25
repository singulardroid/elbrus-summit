import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Route } from './data';

/**
 * Routes drawn as screen-space-width lines: red on foot, dark for cable cars, each with a white
 * halo. Each line is drawn twice: normally, and faintly through the terrain, so parts hidden
 * behind a ridge (or under a coarse tile) still read as one continuous route.
 */

const STYLE = {
  foot: { color: 0xd63a2f, width: 3, lift: 8 },
  lift: { color: 0x1d2a36, width: 2.2, lift: 0 },
};
const HALO = 0xffffff;

interface Drawn {
  route: Route;
  mats: { main: LineMaterial; halo: LineMaterial; xray: LineMaterial; baseWidth: number }[];
  polyline: { p: THREE.Vector3; d: number }[]; // for positionAt(distance)
}

export class Routes {
  readonly group = new THREE.Group();
  private readonly drawn = new Map<string, Drawn>();
  private readonly materials: LineMaterial[] = [];
  private readonly marker: CSS2DObject;
  private selectedId?: string;

  constructor(routes: Route[]) {
    this.group.name = 'routes';
    for (const route of routes) {
      const d: Drawn = { route, mats: [], polyline: [] };
      let dist = 0;
      for (const seg of route.segments) {
        const style = STYLE[seg.mode];
        const pts = seg.points.map(([x, y, z]) => new THREE.Vector3(x, y + style.lift, z));
        const positions = pts.flatMap((p) => [p.x, p.y, p.z]);
        const geom = new LineGeometry();
        geom.setPositions(positions);

        const halo = this.mat(HALO, style.width + 3, { depthTest: true, opacity: 0.9 });
        const main = this.mat(style.color, style.width, { depthTest: true, opacity: 1 });
        const xray = this.mat(style.color, style.width * 0.8, { depthTest: false, opacity: 0.28 });
        // Render order: x-ray first (under everything else that draws later), then halo, then line.
        this.group.add(this.line(geom, xray, 10), this.line(geom, halo, 11), this.line(geom, main, 12));
        d.mats.push({ main, halo, xray, baseWidth: style.width });

        // Distances along the original (unlifted) points, matching the pipeline's profile.
        seg.points.forEach(([x, y, z], i) => {
          const p = new THREE.Vector3(x, y, z);
          // A segment starts where the previous one ended, so only in-segment steps count.
          if (i > 0) dist += p.distanceTo(d.polyline[d.polyline.length - 1].p);
          d.polyline.push({ p, d: dist });
        });
      }
      this.drawn.set(route.id, d);
    }

    const dot = document.createElement('div');
    dot.className = 'route-marker';
    this.marker = new CSS2DObject(dot);
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  /** Line materials need the canvas size (in CSS pixels) for their pixel widths. */
  setResolution(w: number, h: number): void {
    for (const m of this.materials) m.resolution.set(w, h);
  }

  setSelected(id?: string): void {
    this.selectedId = id;
    for (const [rid, d] of this.drawn) {
      const sel = rid === id;
      const dim = !!id && !sel;
      for (const m of d.mats) {
        const w = m.baseWidth * (sel ? 1.6 : 1);
        m.main.linewidth = w;
        m.halo.linewidth = w + 3;
        m.xray.linewidth = w * 0.8;
        m.main.opacity = dim ? 0.45 : 1;
        m.halo.opacity = dim ? 0.35 : 0.9;
        m.xray.opacity = dim ? 0.1 : sel ? 0.45 : 0.28;
      }
    }
    if (!id) this.showMarker(undefined);
  }

  get selected(): string | undefined {
    return this.selectedId;
  }

  /** Show a marker on the route at a distance from its start (from the elevation profile). */
  showMarker(routeId?: string, distance?: number): void {
    const d = routeId ? this.drawn.get(routeId) : undefined;
    if (!d || distance === undefined) {
      this.marker.visible = false;
      return;
    }
    const pl = d.polyline;
    let i = 1;
    while (i < pl.length - 1 && pl[i].d < distance) i++;
    const a = pl[i - 1], b = pl[i];
    const t = b.d > a.d ? THREE.MathUtils.clamp((distance - a.d) / (b.d - a.d), 0, 1) : 0;
    this.marker.position.lerpVectors(a.p, b.p, t);
    this.marker.visible = true;
  }

  /** Bounding box of a route (for framing the camera). */
  box(routeId: string): THREE.Box3 | undefined {
    const d = this.drawn.get(routeId);
    if (!d) return undefined;
    return new THREE.Box3().setFromPoints(d.polyline.map((x) => x.p));
  }

  private mat(color: number, width: number, o: { depthTest: boolean; opacity: number }): LineMaterial {
    const m = new LineMaterial({
      color, linewidth: width, worldUnits: false, transparent: true, opacity: o.opacity,
      depthTest: o.depthTest, depthWrite: false, fog: false,
    });
    this.materials.push(m);
    return m;
  }

  private line(geom: LineGeometry, mat: LineMaterial, order: number): Line2 {
    const l = new Line2(geom, mat);
    l.computeLineDistances();
    l.renderOrder = order;
    l.frustumCulled = false;
    return l;
  }
}
