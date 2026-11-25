import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { CollisionGrid, Poi } from './data';
import { category } from './icons';
import { lang, loc, metres, onLang } from './i18n';

/** Max distance (m) from the camera at which a label of each category is shown. */
const LABEL_RANGE: Record<string, number> = {
  summit: Infinity, saddle: 14000, hut: 14000, lift: 18000, village: 40000, viewpoint: 16000,
};

interface Label {
  poi: Poi;
  obj: CSS2DObject;
}

/**
 * POI labels (HTML, positioned by CSS2DRenderer): distance limits, terrain occlusion,
 * decluttering and selection state.
 */
export class Labels {
  readonly group = new THREE.Group();
  private readonly items: Label[] = [];
  private selectedId?: string;
  private emphasis = new Set<string>(); // e.g. the stops of the selected route
  private hideNear?: { p: THREE.Vector3; r: number };
  private readonly tmp = new THREE.Vector3();

  constructor(pois: Poi[], onClick: (poi: Poi) => void) {
    for (const poi of pois) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `poi poi--${poi.category}`;
      el.innerHTML = `<span class="poi-box"><span class="poi-row"><span class="poi-icon">${category(poi.category).icon}</span><span class="poi-name"></span></span><span class="poi-ele"></span></span><span class="poi-stem"></span>`;
      el.addEventListener('click', () => onClick(poi));
      // Keep clicks on labels from starting a camera drag.
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      const obj = new CSS2DObject(el);
      obj.position.set(...poi.position);
      obj.center.set(0.5, 1); // anchor the bottom of the stem on the point
      this.group.add(obj);
      this.items.push({ poi, obj });
    }
    // Priority order for decluttering: summits, then higher places first.
    const rank = (p: Poi) => (p.category === 'summit' ? 1e5 : 0) + p.elevation_m;
    this.items.sort((a, b) => rank(b.poi) - rank(a.poi));
    onLang(() => this.relabel(), true);
  }

  setSelected(id?: string): void {
    this.selectedId = id;
    for (const { poi, obj } of this.items) obj.element.classList.toggle('is-selected', poi.id === id);
  }

  /** Names and heights in the current language. */
  private relabel(): void {
    for (const { poi, obj } of this.items) {
      const name = loc(poi.name, poi.id);
      obj.element.querySelector('.poi-name')!.textContent = name;
      obj.element.querySelector('.poi-ele')!.textContent = metres(poi.elevation_m);
      obj.element.setAttribute('aria-label', `${name}, ${category(poi.category).label}, ${metres(poi.elevation_m)}`);
      obj.element.lang = lang();
      obj.element.dir = 'auto';
    }
  }

  /** Hide labels within r metres of p (e.g. the place the climb HUD is already naming). */
  setHideNear(p?: THREE.Vector3, r = 200): void {
    this.hideNear = p ? { p: p.clone(), r } : undefined;
  }

  /** Labels that should win overlaps (and ignore distance limits), e.g. a selected route's stops. */
  setEmphasis(ids: string[] = []): void {
    this.emphasis = new Set(ids);
  }

  /** Before rendering: visibility by distance and line of sight. */
  update(camera: THREE.Camera, collision?: CollisionGrid): void {
    const cam = camera.position;
    for (const { poi, obj } of this.items) {
      const selected = poi.id === this.selectedId;
      const d = this.tmp.set(...poi.position).distanceTo(cam);
      const inRange = this.emphasis.has(poi.id) || d < (LABEL_RANGE[poi.category] ?? 15000);
      const behind = !!collision && (inRange || selected) && isHiddenByTerrain(poi, cam, collision);
      // The selected place stays visible (dimmed when behind terrain) so it can always be found.
      const near = !!this.hideNear && this.tmp.set(...poi.position).distanceTo(this.hideNear.p) < this.hideNear.r;
      obj.visible = selected || (inRange && !behind && !near);
      obj.element.classList.toggle('is-behind', selected && behind);
    }
  }

  /** After rendering: hide labels overlapping a more important one. */
  declutter(): void {
    const placed: DOMRect[] = [];
    // Priority: the selected place, then emphasised places (route stops), then the default rank.
    const prio = (l: Label) => (l.poi.id === this.selectedId ? 0 : this.emphasis.has(l.poi.id) ? 1 : 2);
    const ordered = [...this.items].sort((a, b) => prio(a) - prio(b));
    for (const { obj } of ordered) {
      const el = obj.element;
      if (!obj.visible || el.style.display === 'none') continue;
      const box = (el.querySelector('.poi-box') as HTMLElement).getBoundingClientRect();
      const hit = placed.some((r) => box.left < r.right + 4 && box.right > r.left - 4 && box.top < r.bottom + 2 && box.bottom > r.top - 2);
      el.classList.toggle('is-occluded', hit);
      if (!hit) placed.push(box);
    }
  }
}

/**
 * Line-of-sight test from the camera to a POI, marching over the collision grid.
 * The grid is max-pooled (conservative), so the last ~3 cells before the POI are skipped,
 * otherwise a point on a ridge would be hidden by its own cell.
 */
function isHiddenByTerrain(poi: Poi, cam: THREE.Vector3, collision: CollisionGrid): boolean {
  const [px, py, pz] = poi.position;
  const ty = py + 25; // the base of the label stem, slightly above ground
  const horiz = Math.hypot(px - cam.x, pz - cam.z);
  const skip = 360;
  if (horiz <= skip) return false;
  const steps = Math.min(240, Math.ceil(horiz / 120));
  const tEnd = 1 - skip / horiz;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * tEnd;
    const x = cam.x + (px - cam.x) * t;
    const z = cam.z + (pz - cam.z) * t;
    const y = cam.y + (ty - cam.y) * t;
    if (collision.heightAt(x, z) > y) return true;
  }
  return false;
}
