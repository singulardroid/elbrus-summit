import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Manifest, TileInfo } from './data';
import { createTerrainMaterial } from './synthwave';

export type Look = 'digital' | 'satellite';

/**
 * Quadtree terrain: picks a level of detail per tile from its on-screen error, streams tiles in,
 * and evicts least-recently-used ones over a GPU memory budget.
 *
 * Rule that prevents holes: a tile is replaced by its children only when every child that is
 * inside the view frustum is loaded. Until then the (already loaded) parent is drawn.
 */

type State = 'idle' | 'loading' | 'ready' | 'error';

interface Tile {
  info: TileInfo;
  parent?: Tile;
  children?: Tile[];
  box: THREE.Box3;
  state: State;
  object?: THREE.Mesh;
  satellite?: THREE.MeshLambertMaterial;
  digital?: THREE.ShaderMaterial;
  ground?: GroundIndex;
  bytes: number;
  lastUsed: number;
  refined: boolean; // hysteresis: was split last time it was visited
}

export interface TileSetOptions {
  baseUrl: string;
  /** Refine when a texel or the mesh error covers more than this many CSS pixels. */
  texelPx?: number;
  meshErrorPx?: number;
  maxConcurrent?: number;
  budgetBytes?: number;
  anisotropy?: number;
  /** Tint tiles by level (debugging LOD selection and seams). */
  debugTint?: boolean;
  look?: Look;
  /** Called when a tile finishes loading (the scene should be re-rendered). */
  onChange?: () => void;
}

/** Triangles of one tile bucketed on a grid in x/z, for fast height queries. */
interface GroundIndex {
  g: number;
  minX: number;
  minZ: number;
  cell: number;
  pos: Float32Array; // world-space vertex positions
  tri: ArrayLike<number>; // vertex indices, 3 per triangle
  offsets: Uint32Array; // per cell: start in `cells`, length G*G+1
  cells: Uint32Array; // triangle ids
}

export interface TileStats {
  ready: number;
  loading: number;
  queued: number;
  drawn: number;
  drawnByLevel: number[];
  gpuBytes: number;
  loadedBytes: number;
}

export class TileSet {
  readonly group = new THREE.Group();
  private readonly root: Tile;
  private readonly byId = new Map<string, Tile>();
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly images = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' });
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly opts: Required<Omit<TileSetOptions, 'onChange'>> & Pick<TileSetOptions, 'onChange'>;
  private frameNo = 0;
  private inFlight = 0;
  private wanted: { tile: Tile; priority: number }[] = [];
  private drawn: Tile[] = [];
  private gpuBytes = 0;
  private loadedBytes = 0;

  constructor(private readonly m: Manifest, opts: TileSetOptions) {
    this.opts = {
      texelPx: 1.4, meshErrorPx: 2.5, maxConcurrent: 6, budgetBytes: 400e6, anisotropy: 4, debugTint: false, look: 'satellite', ...opts,
    };
    this.images.setPath(opts.baseUrl);
    this.gltf.setPath(opts.baseUrl);
    this.group.name = 'terrain-tiles';
    for (const info of m.tiles.list) {
      const t: Tile = {
        info,
        box: new THREE.Box3(
          new THREE.Vector3(info.bounds[0], info.minY - 200, info.bounds[1]),
          new THREE.Vector3(info.bounds[2], info.maxY, info.bounds[3]),
        ),
        state: 'idle', bytes: 0, lastUsed: -1, refined: false,
      };
      this.byId.set(info.id, t);
    }
    for (const t of this.byId.values()) {
      const { level, x, y } = t.info;
      if (level + 1 < m.tiles.levels) {
        t.children = [0, 1, 2, 3].map((i) => this.byId.get(`${level + 1}-${2 * x + (i & 1)}-${2 * y + (i >> 1)}`)!);
        t.children.forEach((c) => (c.parent = t));
      }
    }
    this.root = this.byId.get('0-0-0')!;
  }

  get look(): Look {
    return this.opts.look;
  }

  /** Switch every loaded tile (and future ones) between the satellite and the digital material. */
  setLook(look: Look): void {
    this.opts.look = look;
    for (const t of this.byId.values()) if (t.object) t.object.material = this.materialFor(t);
  }

  private maxLevel = Infinity;

  /** Change the level-of-detail thresholds (CSS pixels) and the finest level used. */
  setDetail(texelPx: number, meshErrorPx: number, maxLevel = Infinity): void {
    this.opts.texelPx = texelPx;
    this.opts.meshErrorPx = meshErrorPx;
    this.maxLevel = maxLevel;
  }

  private materialFor(t: Tile): THREE.Material {
    if (this.opts.look === 'digital') {
      t.digital ??= createTerrainMaterial(t.satellite!.map!);
      return t.digital;
    }
    return t.satellite!;
  }

  /** Load the coarsest tile; the model is usable once this resolves. */
  async loadRoot(): Promise<void> {
    await this.load(this.root);
    if (this.root.state !== 'ready') throw new Error('terrain root tile failed to load');
  }

  /**
   * Choose tiles for this camera, start loads, evict over budget.
   * Returns true when the set of drawn tiles changed.
   */
  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number): boolean {
    this.frameNo++;
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    // Pixels per metre at 1 m distance. Read from the projection matrix so it stays right when
    // the view is shifted with setViewOffset (side panel / bottom sheet padding).
    const k = (viewportHeightPx * camera.projectionMatrix.elements[5]) / 2;

    const prev = this.drawn;
    this.drawn = [];
    this.wanted = [];
    if (this.root.state === 'ready') this.select(this.root, camera.position, k);

    let changed = prev.length !== this.drawn.length || prev.some((t, i) => t !== this.drawn[i]);
    if (changed) {
      for (const t of prev) if (t.object) t.object.visible = false;
      for (const t of this.drawn) if (t.object) t.object.visible = true;
    }
    this.startLoads();
    this.evict();
    return changed;
  }

  /**
   * Height of the rendered terrain at scene x/z (the finest drawn tile there), or undefined when
   * no drawn tile covers the point. Fast: a per-tile triangle grid, built on first use.
   */
  heightAt(x: number, z: number): number | undefined {
    let best: Tile | undefined;
    for (const t of this.drawn) {
      const [a, b, c, d] = t.info.bounds;
      if (t.object && x >= a && x <= c && z >= b && z <= d && (!best || t.info.level > best.info.level)) best = t;
    }
    if (!best) return undefined;
    const g = (best.ground ??= this.buildGround(best));
    const i = Math.min(g.g - 1, Math.max(0, Math.floor((x - g.minX) / g.cell)));
    const j = Math.min(g.g - 1, Math.max(0, Math.floor((z - g.minZ) / g.cell)));
    const k = j * g.g + i;
    const P = g.pos, T = g.tri;
    for (let c = g.offsets[k]; c < g.offsets[k + 1]; c++) {
      const t = g.cells[c] * 3;
      const a = T[t] * 3, b = T[t + 1] * 3, e = T[t + 2] * 3;
      const ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cx = P[e], cz = P[e + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-6) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-4 && l2 >= -1e-4 && l3 >= -1e-4) return l1 * P[a + 1] + l2 * P[b + 1] + l3 * P[e + 1];
    }
    return undefined;
  }

  private buildGround(t: Tile): GroundIndex {
    const mesh = t.object!;
    const attr = mesh.geometry.getAttribute('position');
    const pos = new Float32Array(attr.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrix);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const tri = mesh.geometry.index!.array;
    const [minX, minZ, maxX, maxZ] = t.info.bounds;
    const G = 32, cell = Math.max(maxX - minX, maxZ - minZ) / G;
    const lists: number[][] = Array.from({ length: G * G }, () => []);
    for (let f = 0; f < tri.length / 3; f++) {
      const a = tri[f * 3] * 3, b = tri[f * 3 + 1] * 3, c = tri[f * 3 + 2] * 3;
      const area = Math.abs((pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]) - (pos[c] - pos[a]) * (pos[b + 2] - pos[a + 2]));
      if (area < 0.05) continue; // skirts are vertical: no footprint
      const x0 = Math.min(pos[a], pos[b], pos[c]), x1 = Math.max(pos[a], pos[b], pos[c]);
      const z0 = Math.min(pos[a + 2], pos[b + 2], pos[c + 2]), z1 = Math.max(pos[a + 2], pos[b + 2], pos[c + 2]);
      const i0 = Math.max(0, Math.floor((x0 - minX) / cell)), i1 = Math.min(G - 1, Math.floor((x1 - minX) / cell));
      const j0 = Math.max(0, Math.floor((z0 - minZ) / cell)), j1 = Math.min(G - 1, Math.floor((z1 - minZ) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lists[j * G + i].push(f);
    }
    const offsets = new Uint32Array(G * G + 1);
    let n = 0;
    lists.forEach((l, k) => { offsets[k] = n; n += l.length; });
    offsets[G * G] = n;
    const cells = new Uint32Array(n);
    lists.forEach((l, k) => cells.set(l, offsets[k]));
    return { g: G, minX, minZ, cell, pos, tri, offsets, cells };
  }

  /**
   * Ray vs the drawn tiles: tests tile boxes nearest-first and stops once no remaining box can
   * hold a closer hit, so usually only one or two meshes are tested.
   */
  raycast(rc: THREE.Raycaster): THREE.Intersection | null {
    const hits: { t: Tile; d: number }[] = [];
    const p = new THREE.Vector3();
    for (const t of this.drawn) {
      if (!t.object) continue;
      if (t.box.containsPoint(rc.ray.origin)) hits.push({ t, d: 0 });
      else if (rc.ray.intersectBox(t.box, p)) hits.push({ t, d: p.distanceTo(rc.ray.origin) });
    }
    hits.sort((a, b) => a.d - b.d);
    let best: THREE.Intersection | null = null;
    for (const { t, d } of hits) {
      if (best && d > best.distance) break;
      const r = rc.intersectObject(t.object!, false)[0];
      if (r && (!best || r.distance < best.distance)) best = r;
    }
    return best;
  }

  get pending(): number {
    return this.inFlight + this.wanted.length;
  }

  stats(): TileStats {
    let ready = 0;
    for (const t of this.byId.values()) if (t.state === 'ready') ready++;
    const drawnByLevel = Array.from({ length: this.m.tiles.levels }, () => 0);
    this.drawn.forEach((t) => drawnByLevel[t.info.level]++);
    return {
      ready, loading: this.inFlight, queued: this.wanted.length, drawn: this.drawn.length,
      drawnByLevel, gpuBytes: this.gpuBytes, loadedBytes: this.loadedBytes,
    };
  }

  dispose(): void {
    for (const t of this.byId.values()) this.unload(t);
  }

  // --- selection --------------------------------------------------------------------------

  private select(t: Tile, cam: THREE.Vector3, k: number): void {
    t.lastUsed = this.frameNo;
    if (!this.frustum.intersectsBox(t.box)) return;

    const dist = Math.max(t.box.distanceToPoint(cam), 1);
    const texelPx = (t.info.texelM * k) / dist;
    const meshPx = (t.info.errorM * k) / dist;
    // Hysteresis: split at 100 % of the threshold, merge back below 80 %.
    const f = t.refined ? 0.8 : 1;
    const refine = !!t.children && t.info.level < this.maxLevel &&
      (texelPx > this.opts.texelPx * f || meshPx > this.opts.meshErrorPx * f);
    t.refined = refine;

    if (refine) {
      let ready = true;
      for (const c of t.children!) {
        if (!this.frustum.intersectsBox(c.box)) continue;
        if (c.state !== 'ready') {
          ready = false;
          if (c.state === 'idle') this.wanted.push({ tile: c, priority: c.info.level * 1e6 + dist });
        }
      }
      if (ready) {
        for (const c of t.children!) this.select(c, cam, k);
        return;
      }
    }
    this.drawn.push(t);
  }

  // --- loading ----------------------------------------------------------------------------

  private startLoads(): void {
    if (this.inFlight >= this.opts.maxConcurrent || !this.wanted.length) return;
    this.wanted.sort((a, b) => a.priority - b.priority);
    for (const { tile } of this.wanted) {
      if (this.inFlight >= this.opts.maxConcurrent) break;
      if (tile.state === 'idle') void this.load(tile);
    }
  }

  private async load(t: Tile): Promise<void> {
    t.state = 'loading';
    this.inFlight++;
    const path = this.m.tiles.path + t.info.id;
    try {
      const [gltf, bitmap] = await Promise.all([
        this.gltf.loadAsync(path + this.m.tiles.mesh),
        this.images.loadAsync(path + this.m.tiles.texture) as Promise<ImageBitmap>,
      ]);
      const mesh = gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined;
      if (!mesh) throw new Error(`no mesh in ${t.info.id}`);
      mesh.removeFromParent();
      mesh.updateMatrix();
      this.addUvs(mesh, t.info);

      const tex = new THREE.Texture(bitmap);
      tex.flipY = false; // glTF convention: v = 0 is the image's top (north) row
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.opts.anisotropy;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;

      const mat = new THREE.MeshLambertMaterial({ map: tex });
      if (this.opts.debugTint) mat.color.setHSL([0, 0.15, 0.33, 0.6][t.info.level % 4], 0.9, 0.7);
      t.satellite = mat;
      mesh.material = this.materialFor(t);
      mesh.visible = false;
      mesh.name = `tile-${t.info.id}`;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);

      const g = mesh.geometry;
      t.bytes = bitmap.width * bitmap.height * 4 * 1.34 +
        Object.values(g.attributes).reduce((s, a) => s + (a as THREE.BufferAttribute).array.byteLength, 0) +
        (g.index?.array.byteLength ?? 0);
      this.gpuBytes += t.bytes;
      this.loadedBytes += t.info.meshBytes + t.info.textureBytes;
      t.object = mesh;
      t.state = 'ready';
    } catch (err) {
      console.warn(`tile ${t.info.id} failed`, err);
      t.state = 'error';
    } finally {
      this.inFlight--;
      this.opts.onChange?.();
    }
  }

  /**
   * UVs from positions: u east across the tile, v north→south (matches the texture),
   * mapped into the texture's inner area (inside the gutter).
   */
  private addUvs(mesh: THREE.Mesh, info: TileInfo): void {
    const pos = mesh.geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    const [minX, minZ, maxX, maxZ] = info.bounds;
    const off = info.texturePad / info.texturePx;
    const scale = 1 - 2 * off;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      uv[i * 2] = off + scale * (v.x - minX) / (maxX - minX);
      uv[i * 2 + 1] = off + scale * (v.z - minZ) / (maxZ - minZ);
    }
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // --- memory -----------------------------------------------------------------------------

  private evict(): void {
    if (this.gpuBytes <= this.opts.budgetBytes) return;
    const candidates = [...this.byId.values()]
      .filter((t) => t.state === 'ready' && t !== this.root && t.lastUsed < this.frameNo)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const t of candidates) {
      if (this.gpuBytes <= this.opts.budgetBytes * 0.85) break;
      this.unload(t);
    }
  }

  private unload(t: Tile): void {
    if (!t.object) return;
    const mat = t.satellite!;
    mat.map?.dispose();
    (mat.map?.image as ImageBitmap | undefined)?.close?.();
    mat.dispose();
    t.digital?.dispose();
    t.satellite = t.digital = undefined;
    t.ground = undefined;
    t.object.geometry.dispose();
    t.object.removeFromParent();
    t.object = undefined;
    this.gpuBytes -= t.bytes;
    t.bytes = 0;
    t.state = 'idle';
  }
}
