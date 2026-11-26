import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CollisionGrid, Frame, Geo, fetchBinary, fetchJson, formatLatLon, type Manifest, type Poi, type Route } from './data';
import { buildWallsGeometry } from './terrain';
import { TileSet, type Look } from './tiles';
import { Doors } from './doors';
import { Climb } from './climb';
import { ClimbHud } from './climbHud';
import { setTerrainLighting, setTerrainTime, setTerrainTrail, setTerrainStones, setTerrainArrival, TRAIL_POINTS } from './synthwave';
import { Sky, skyAt, timeOfDay, type SkyFx, type SkyState, type TimeOfDay } from './celestial';
import { WeatherFeed, type Weather } from './weather';
import { Precip } from './precip';
import { Horizon } from './horizon';
import { ClimbMarkers } from './climbMarkers';
import { SkyChip, SkyClock } from './skyClock';
import { ClimbRig } from './rig';
import { Stones } from './stones';
import { StoryView, type StoriesFile } from './storyView';
import { Labels } from './labels';
import { Routes } from './routes';
import { Panel } from './panel';
import { createSky, SKY } from './sky';
import { langInfo, metres, onLang } from './i18n';
import { Tour, tourSeen } from './tour';
import { createHud, type Hud } from './hud';
import { formatHash, parseHash, writeHash, type UrlState } from './urlState';

CameraControls.install({
  THREE: {
    Vector2: THREE.Vector2, Vector3: THREE.Vector3, Vector4: THREE.Vector4,
    Quaternion: THREE.Quaternion, Matrix4: THREE.Matrix4, Spherical: THREE.Spherical,
    Box3: THREE.Box3, Sphere: THREE.Sphere, Raycaster: THREE.Raycaster,
  },
});

export interface ElbrusMapOptions {
  /** Base URL of the pipeline export (folder containing manifest.json). */
  dataUrl?: string;
  /** Read/write the selected place and camera view in the URL hash (default true). */
  urlState?: boolean;
  /** How many of the 250 story doors are open (default 87, or ?opened= in the URL). */
  opened?: number;
  /** Start look (default digital, or ?look=satellite). */
  look?: Look;
}

type Mode = 'climb' | 'overview';

const BASE_FOV = 45;
const CLIMB_FOV = 60; // wider, closer: the climb is at person scale
const rad = THREE.MathUtils.degToRad;
/**
 * The overview camera lives under a dome over the mountain: 20 km across at ground level, 12 km
 * high over the centre. Going up brings you closer; you can never leave it. (The world itself is
 * WORLD_RADIUS round, so its faded edge always stays far off.)
 */
const DOME_RADIUS = 20000;
const DOME_TOP = 12000;
const MAX_ORBIT = DOME_RADIUS;
/** The point the overview turns around sits this high: low, inside the mountain. */
const PIVOT_Y = 3400;
/** The orbit target stays within this distance of the centre. */
const TARGET_RADIUS = 10000;
/** The deepest tilt: below horizontal, so you can stand low and look up; the ground is the floor. */
const MAX_TILT = rad(100);
/** Haze swallows everything by this distance, well inside the horizon ring's edge (~180 km out). */
const FOG_MAX = 150000;
const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
const deg = THREE.MathUtils.radToDeg;

export class ElbrusMap {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 10, 600000);
  private readonly controls: CameraControls;
  private readonly timer = new THREE.Timer();
  private readonly sky = createSky();
  private readonly hud: Hud;
  private readonly resizeObserver: ResizeObserver;
  private readonly dataUrl: string;
  private readonly urlState: boolean;
  private readonly debug = new URLSearchParams(location.search).has('debug');

  private collision?: CollisionGrid;
  private tiles?: TileSet;
  private labels?: Labels;
  private panel?: Panel;
  private geo?: Geo;
  private routes?: Routes;
  private pois: Poi[] = [];
  private routeList: Route[] = [];
  private selected?: Poi;
  private selectedRoute?: Route;
  private home?: { pos: THREE.Vector3; target: THREE.Vector3 };
  private homeDir: 'ltr' | 'rtl' = 'ltr';

  // The guided climb (250 story doors) and the synthwave look.
  private mode: Mode = 'overview';
  private look: Look;
  private opened: number;
  private readonly openedFromUrl: boolean;
  private storyView?: StoryView;
  private userMoved = false; // auto-open stories only after the visitor has moved
  private tour?: Tour;
  private tourActive = false; // the first-visit guide is on screen: no stories open by themselves
  private idleSpin = false; // the overview turns slowly behind the guide's welcome
  private restSince = 0;
  private storyShownFor = 0;
  private doors?: Doors;
  private climb?: Climb;
  private climbHud?: ClimbHud;
  private readonly skyDome = new Sky();
  private rig?: ClimbRig;
  private stones?: Stones;
  private readonly skyClock = new SkyClock();
  private skyChip?: SkyChip;
  private skyTickAt = 0;
  private prCap = 2;
  private prSamples: number[] = [];
  private prLastFrame = 0;
  private prFast = 0;
  private readonly weather = new WeatherFeed();
  private readonly precip = new Precip();
  private wx?: Weather; // the weather now shown (eased toward the data)
  private readonly fx: SkyFx = { cloud: 0, cloudOffset: new THREE.Vector2(), cloudMorph: 0, storm: 0, flash: 0, haze: 0 };
  private rainAmt = 0;
  private snowAmt = 0;
  private nextFlash = 3;
  private readonly windVec = new THREE.Vector2();
  private skyState: SkyState = skyAt(this.skyClock.instant);
  private tod: TimeOfDay = timeOfDay(this.skyState);
  private arrivedAt = 0;
  private trailAt = -1e9;
  private portalsKey = '';
  private fov = BASE_FOV;
  private walls?: THREE.Mesh;
  private horizon?: Horizon;
  private markers?: ClimbMarkers;

  private dirty = true;
  private interacting = false; // pointer/touch drag in progress
  private size = { w: 1, h: 1 };
  private padding = { left: 0, right: 0, top: 0, bottom: 0 };
  private hoverRequest?: { x: number; y: number };
  private lastHoverPick = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  constructor(private readonly container: HTMLElement, opts: ElbrusMapOptions = {}) {
    this.dataUrl = (opts.dataUrl ?? './elbrus/').replace(/\/?$/, '/');
    this.urlState = opts.urlState ?? true;
    const q = new URLSearchParams(location.search);
    this.openedFromUrl = q.has('opened') || opts.opened !== undefined;
    this.opened = THREE.MathUtils.clamp(Number(q.get('opened') ?? opts.opened ?? 87) || 0, 0, 250);
    this.look = (q.get('look') as Look) === 'satellite' ? 'satellite' : opts.look ?? 'digital';
    container.classList.add('elbrus-map');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Render scale: start at most 1.5 on phones (2 on desktops); adaptResolution() lowers it on
    // slow GPUs (measured on a Galaxy A33: 14 fps at 1.75, the sky and terrain shaders fill-bound).
    this.prCap = Math.min(window.devicePixelRatio, isCoarsePointer() ? 1.5 : 2);
    this.renderer.setPixelRatio(this.prCap);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'elbrus-labels';
    // 'clip' instead of the renderer's default 'hidden': a hidden-overflow box is still a
    // scroll container, and focusing a clicked label would scroll it, shifting every label.
    this.labelRenderer.domElement.style.overflow = 'clip';
    // Labels are placed by transform from the layer's top-left; in right-to-left pages an
    // absolutely placed element would start from the right edge instead.
    this.labelRenderer.domElement.dir = 'ltr';
    container.appendChild(this.labelRenderer.domElement);
    // The wheel over a place label zooms the map too (labels sit above the canvas and would
    // otherwise swallow it, so scrolling over the summit's label did nothing).
    this.labelRenderer.domElement.addEventListener('wheel', (e) => {
      if (e.target === this.renderer.domElement) return;
      e.preventDefault();
      this.renderer.domElement.dispatchEvent(new WheelEvent('wheel', e));
    }, { passive: false });

    this.scene.fog = new THREE.Fog(SKY.horizon, 30000, 200000);
    this.scene.add(this.sky);
    this.skyDome.group.visible = false;
    this.scene.add(this.skyDome.group);
    this.scene.add(this.precip.group);


    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    const A = CameraControls.ACTION;
    this.controls.mouseButtons.left = A.ROTATE;
    this.controls.mouseButtons.right = A.TRUCK; // pan across the map; the pivot keeps its height
    this.controls.mouseButtons.middle = A.DOLLY;
    this.controls.mouseButtons.wheel = A.DOLLY;
    this.controls.touches.one = A.TOUCH_ROTATE;
    // Pinch to zoom + drag to pan along the ground. Supported at runtime; missing from the
    // library's multiTouchAction type union.
    this.controls.touches.two = A.TOUCH_DOLLY_TRUCK;
    this.controls.touches.three = A.TOUCH_TRUCK;
    this.controls.verticalDragToForward = true; // panning moves along the ground, not up and down
    this.controls.dollyToCursor = false; // zoom toward the mountain (the pivot)
    this.controls.minDistance = 800; // closer than this the 10 m imagery turns to blur
    this.controls.maxDistance = MAX_ORBIT;
    this.controls.maxPolarAngle = MAX_TILT;
    this.controls.smoothTime = 0.25;
    this.controls.draggingSmoothTime = 0.08;
    this.controls.addEventListener('update', () => (this.dirty = true));
    this.controls.addEventListener('controlstart', () => {
      this.interacting = true;
      this.idleSpin = false;
      this.hud.setHover(null);
    });
    this.controls.addEventListener('controlend', () => {
      this.interacting = false;
      this.dirty = true;
    });
    this.controls.addEventListener('rest', () => this.writeUrl());

    this.hud = createHud(container, {
      onReset: () => this.resetView(),
      onNorth: () => this.faceNorth(),
      onPlaces: () => this.togglePlaces(),
    });
    this.skyChip = new SkyChip(container, this.skyClock, () => (this.dirty = true));
    this.weather.start(() => (this.dirty = true));

    this.setupPointer();
    window.addEventListener('keydown', this.onKeyDown);
    if (this.urlState) window.addEventListener('hashchange', this.onHashChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => this.frame());
  }

  async load(): Promise<void> {
    const url = (p: string) => this.dataUrl + p;
    const m = await fetchJson<Manifest>(url('manifest.json'));
    const f = new Frame(m);
    this.geo = new Geo(m.geo);
    this.pois = m.pois;
    this.routeList = m.routes ?? [];
    this.hud.setAttribution(m.attribution);

    this.collision = new CollisionGrid(await fetchBinary(url(m.collision.url)), m, f);

    // Terrain: quadtree tiles, coarsest first; detail streams in as the camera needs it.
    const coarse = isCoarsePointer();
    this.tiles = new TileSet(m, {
      baseUrl: this.dataUrl,
      texelPx: coarse ? 1.8 : 1.4,
      meshErrorPx: coarse ? 3 : 2.5,
      budgetBytes: coarse ? 160e6 : 500e6,
      anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      debugTint: new URLSearchParams(location.search).has('tint'),
      onChange: () => (this.dirty = true),
    });
    this.scene.add(this.tiles.group);
    await this.tiles.loadRoot();

    // Side walls of the relief block
    const walls = new THREE.Mesh(
      buildWallsGeometry(m, f, m.height.min - 600),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    this.walls = walls;
    this.scene.add(walls);

    // The land around the block, out to the horizon (loads in the background; optional).
    void Horizon.load(this.dataUrl, m, f).then((h) => {
      if (!h) return;
      this.horizon = h;
      h.setLook(this.look === 'digital');
      walls.visible = false; // the land around covers the block's edges now
      this.scene.add(h.group);
      this.dirty = true;
    });
    this.setupLights(m);

    this.routes = new Routes(this.routeList);
    this.routes.setResolution(this.size.w, this.size.h);
    this.scene.add(this.routes.group);
    this.labels = new Labels(m.pois, (poi) => this.select(poi));
    this.scene.add(this.labels.group);
    this.panel = new Panel(this.container, m.pois, this.routeList, {
      onSelect: (poi) => this.select(poi),
      onSelectRoute: (route) => this.selectRoute(route),
      onFlyTo: (poi) => this.flyTo(poi),
      onClose: () => this.select(undefined),
      shareUrl: (item) => location.href.split('#')[0] + formatHash(item),
      onProfileHover: (route, d) => {
        this.routes?.showMarker(route.id, d);
        this.dirty = true;
      },
      onLayout: () => this.applyPanelPadding(),
    });

    // The guided climb: 250 story points along the journey route, and their stories.
    if (m.journey) {
      const stories = await fetchJson<StoriesFile>(url('stories.json')).catch(() => ({} as StoriesFile));
      if (!this.openedFromUrl && typeof stories.opened === 'number') {
        this.opened = THREE.MathUtils.clamp(stories.opened, 0, m.journey.doors.length);
      }
      this.climb = new Climb(m.journey);
      // Whole-mountain view: where the climb starts and where you are; click to go back.
      this.markers = new ClimbMarkers(m.journey, (n) => this.enterClimb(n));
      this.scene.add(this.markers.group);
      this.doors = new Doors(m.journey, this.opened, (n) => this.goToDoor(n));
      this.doors.setResolution(this.size.w, this.size.h);
      this.scene.add(this.doors.group);
      this.climbHud = new ClimbHud(this.container, m.journey, {
        onStep: (delta) => this.stepDoor(delta),
        onJump: (n) => this.goToDoor(n),
        onMode: (mode) => (mode === 'climb' ? this.enterClimb(this.climb!.door) : this.enterOverview()),
        onLook: (look) => this.setLook(look),
        onRead: () => this.openStory(this.climb!.door),
        onHelp: () => this.tour?.start(),
      });
      this.storyView = new StoryView(this.container, stories, {
        onClose: () => this.closeStory(),
        onGo: (n) => this.openStory(n),
        shareUrl: (n) => location.href.split('#')[0] + formatHash({ kind: 'story', n }),
      });
      this.climbHud.setStates((n) => this.doors!.stateOf(n));
      this.stones = new Stones(m.journey.doors, (n) => this.doors!.stateOf(n), (x, z) => this.groundAt(x, z));
      this.scene.add(this.stones.group);
      this.rig = new ClimbRig(this.camera, this.renderer.domElement, (x, z) => this.groundAt(x, z), () => (this.dirty = true));
      this.tour = new Tour(this.container, {
        showMountain: () => this.showMountain(),
        showStation: (n) => {
          this.closeStory();
          this.enterClimb(n);
        },
        walkTo: (n) => {
          if (this.mode !== 'climb') this.enterClimb(n);
          this.goToDoor(n);
        },
        opened: () => this.opened,
        setActive: (on) => {
          this.tourActive = on;
          if (!on) this.idleSpin = false;
        },
        phonePanels: (menu, pill) => {
          this.climbHud?.setMenu(menu);
          this.climbHud?.setPill(pill);
        },
      });
    }
    this.applyLook();

    // Keep the orbit target near the mountain, well inside the round world.
    const tr = Math.min(TARGET_RADIUS, f.halfWidth, f.halfDepth);
    this.controls.setBoundary(new THREE.Box3(
      new THREE.Vector3(-tr, m.height.min - 500, -tr),
      new THREE.Vector3(tr, m.height.max + 500, tr),
    ));
    this.controls.boundaryFriction = 0.2;

    this.computeHome(m);
    const { pos, target } = this.home!;
    // In another language the route reads the other way (Arabic: right to left).
    onLang(() => {
      const dir = this.homeDir;
      this.computeHome(m);
      if (dir !== this.homeDir && this.mode === 'overview' && this.idleSpin) this.showMountain();
    });

    const fromUrl = this.urlState ? parseHash(location.hash) : { kind: 'none' as const };
    // First visit (no shared link to follow): the mountain view and the guide. `?tour` forces it.
    const wantTour = !!this.tour && (new URLSearchParams(location.search).has('tour') || (!tourSeen() && fromUrl.kind === 'none'));
    if (wantTour) {
      this.setMode('overview');
      await this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
      this.idleSpin = true;
    } else if (!this.applyUrlState(fromUrl, false)) {
      // Default: start the climb at the bottom, at Azau.
      if (this.climb) this.enterClimb(1, false);
      else await this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
    } else if (fromUrl.kind !== 'station') {
      this.setMode('overview');
    }

    this.dirty = true;
    await this.waitForFirstView();
    this.hud.setProgress(1);
    this.hud.hideLoading();
    if (wantTour) this.tour!.start();
  }

  /**
   * The opening view of the whole mountain: the route seen side-on, start to summit reading in the
   * language's direction (Azau on the left, the summit on the right; mirrored for Arabic), framed
   * to fit the screen, from a little above the summit, turning around a pivot low in the mountain.
   */
  private computeHome(m: Manifest): void {
    this.homeDir = langInfo().dir === 'rtl' ? 'rtl' : 'ltr';
    const summitPoi = m.pois.find((p) => p.id === 'west-summit')?.position ?? [0, m.height.max, 0];
    const a = this.climb ? this.climb.pointAt(0) : new THREE.Vector3(summitPoi[0] + 3000, 2350, summitPoi[2] + 9000);
    const b = this.climb ? this.climb.pointAt(this.climb.j.lengthM) : new THREE.Vector3(...summitPoi);
    const target = new THREE.Vector3((a.x + b.x) / 2, PIVOT_Y, (a.z + b.z) / 2);
    // Screen right should point along the route (rtl: against it). Camera azimuth from the target,
    // measured from +Z (south) toward +X (east), as in orbitPosition().
    const r = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const len = r.length();
    r.normalize();
    if (this.homeDir === 'rtl') r.negate();
    const aspect = Math.max(this.container.clientWidth, 1) / Math.max(this.container.clientHeight, 1);
    const halfH = Math.atan(Math.tan(rad(BASE_FOV / 2)) * aspect);
    let azimuth = Math.atan2(-r.y, r.x);
    let polar = rad(72); // high enough to see Azau over the ridges in front of it
    // Fit the route's length across the screen with some margin.
    let want = ((len / 2) * 1.5) / Math.tan(halfH) + 2500;
    if (this.homeDir === 'rtl') {
      // Arabic: the view chosen by hand (2026-11-26): summit upper left, the route coming down to
      // Azau at the lower right, seen from higher and turned 48° further round; 10.1 km away in a
      // 1015 x 859 window, scaled to fit other screens the same way.
      azimuth += rad(47.7);
      polar = rad(62);
      want = (10100 * Math.tan(Math.atan(Math.tan(rad(BASE_FOV / 2)) * (1015 / 859)))) / Math.tan(halfH);
    }
    const dir = orbitPosition(new THREE.Vector3(), 1, azimuth, polar);
    const dist = THREE.MathUtils.clamp(want, 6000, domeReach(target, dir) * 0.97);
    this.home = { pos: orbitPosition(target, dist, azimuth, polar), target };
  }

  /** The whole mountain from the home view, turning slowly (the guide's backdrop). */
  private showMountain(): void {
    if (!this.home) return;
    this.closeStory();
    if (this.mode === 'climb') this.enterOverview();
    else {
      this.select(undefined);
      this.panel?.close();
      const { pos, target } = this.home;
      void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
    }
    this.idleSpin = true;
  }

  // --- public actions --------------------------------------------------------------------

  /** Select a place (opens its panel and flies there), or clear the selection. */
  select(poi: Poi | undefined, opts: { fly?: boolean; animate?: boolean } = {}): void {
    const { fly = true, animate = true } = opts;
    if (poi && this.mode === 'climb') this.setMode('overview');
    this.selected = poi;
    this.selectedRoute = undefined;
    this.routes?.setSelected(undefined);
    this.labels?.setEmphasis();
    this.labels?.setSelected(poi?.id);
    if (poi) {
      this.panel?.showPlace(poi);
      if (fly) this.flyTo(poi, animate);
    } else if (this.panel && (this.panel.state === 'place' || this.panel.state === 'route')) {
      this.panel.close();
    }
    this.writeUrl();
    this.dirty = true;
  }

  /** Select a route: highlight it, open its panel and frame it. */
  selectRoute(route: Route, animate = true): void {
    if (this.mode === 'climb') this.setMode('overview');
    this.selected = undefined;
    this.selectedRoute = route;
    this.labels?.setSelected(undefined);
    this.labels?.setEmphasis(route.stops);
    this.routes?.setSelected(route.id);
    this.panel?.showRoute(route);
    this.frameRoute(route, animate);
    this.writeUrl();
    this.dirty = true;
  }

  private frameRoute(route: Route, animate: boolean): void {
    const box = this.routes?.box(route.id);
    if (!box) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2;
    // Fit to the part of the screen the panel leaves free, using its narrower side (portrait
    // phones are much narrower than the 45° vertical field of view suggests).
    const { w, h } = this.size;
    const freeW = w - this.padding.left - this.padding.right;
    const freeH = h - this.padding.top - this.padding.bottom;
    const focalPx = h / 2 / Math.tan(rad(BASE_FOV) / 2);
    const fitPx = Math.max(120, Math.min(freeW, freeH)) / 2;
    const dist = THREE.MathUtils.clamp((radius * focalPx) / fitPx * 1.15, 3000, 80000);
    const target = new THREE.Vector3(c.x, this.collision?.heightAt(c.x, c.z) ?? c.y, c.z);
    const pos = orbitPosition(target, dist, this.controls.azimuthAngle, rad(52));
    void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate);
  }

  togglePlaces(): void {
    if (!this.panel) return;
    if (this.panel.state === 'list') this.panel.close();
    else {
      if (this.mode === 'climb') this.setMode('overview');
      this.selected = undefined;
      this.selectedRoute = undefined;
      this.labels?.setSelected(undefined);
      this.labels?.setEmphasis();
      this.routes?.setSelected(undefined);
      this.panel.showList();
      this.writeUrl();
    }
    this.dirty = true;
  }

  resetView(): void {
    if (this.mode === 'climb' && this.climb) return this.enterClimb(this.climb.door);
    if (!this.home) return;
    const { pos, target } = this.home;
    void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
  }

  // --- the guided climb ------------------------------------------------------------------

  /** Switch the camera rig and controls between the guided climb and the free overview. */
  private setMode(mode: Mode): void {
    this.mode = mode;
    const A = CameraControls.ACTION;
    const c = this.controls;
    this.container.classList.toggle('mode-climb', mode === 'climb');
    this.climbHud?.setMode(mode);
    this.applyPanelPadding();
    c.enabled = mode !== 'climb';
    if (this.rig) this.rig.enabled = mode === 'climb';
    this.doors?.setTrailLines(mode !== 'climb');
    this.fov = mode === 'climb' ? CLIMB_FOV : BASE_FOV;
    this.updateProjection();
    this.updateDetail();
    if (mode === 'climb') {
      c.minDistance = 25;
      c.maxDistance = 900;
      c.maxPolarAngle = rad(88);
      c.mouseButtons.right = A.NONE;
      c.mouseButtons.middle = A.NONE;
      c.mouseButtons.wheel = A.NONE; // the wheel climbs
      c.touches.two = A.TOUCH_DOLLY;
      c.touches.three = A.NONE;
      c.dollyToCursor = false;
      this.select(undefined);
      this.panel?.close();
      if (this.climb) this.labels?.setEmphasis(this.climb.j.stations.map((st) => st.id));
    } else {
      c.minDistance = 800;
      c.maxDistance = MAX_ORBIT;
      c.minPolarAngle = 0;
      c.maxPolarAngle = MAX_TILT;
      c.mouseButtons.right = A.TRUCK;
      c.mouseButtons.middle = A.DOLLY;
      c.mouseButtons.wheel = A.DOLLY;
      c.touches.two = A.TOUCH_DOLLY_TRUCK;
      c.touches.three = A.TOUCH_TRUCK;
      c.dollyToCursor = false;
      this.labels?.setEmphasis();
      this.labels?.setHideNear(undefined);
    }
    this.dirty = true;
  }

  /** Enter the guided climb at story point n: the camera swoops down to orbit it. */
  enterClimb(n: number, _animate = true): void {
    if (!this.climb || !this.rig) return;
    this.setMode('climb');
    this.climb.goTo(n, true);
    this.rig.reset();
    this.rig.pitch = -0.38;
    this.rig.dist = 16;
    this.rig.faceDirection(this.climb.directionAt(this.climb.d, new THREE.Vector3(), 20), true);
    this.arrivedAt = 0;
    this.writeUrl();
    this.dirty = true;
  }

  /** Open story n: the camera walks there in the background while the story takes the frame. */
  openStory(n: number): void {
    if (!this.climb || !this.storyView || !this.doors) return;
    n = THREE.MathUtils.clamp(Math.round(n), 1, this.climb.doorCount);
    if (this.mode !== 'climb') this.enterClimb(n);
    else if (this.climb.door !== n) this.climb.goTo(n);
    this.storyShownFor = n;
    const target = this.climb.j.doors[n - 1];
    const st = this.climb.stats(target.d);
    this.storyView.open({
      n, total: this.climb.doorCount, state: this.doors.stateOf(n), opened: this.opened,
      elevation: st.elevation, distance: st.distance, stage: this.climb.stage(target.d),
      stateOf: (k) => this.doors!.stateOf(k),
    });
    this.container.classList.add('story-open');
    if (this.rig) {
      this.rig.enabled = false;
      this.rig.spin = 0.05;
      this.rig.pitch = -0.3;
    }
    this.writeUrl();
    this.dirty = true;
  }

  closeStory(): void {
    if (!this.storyView?.isOpen) return;
    this.storyView.close();
    this.container.classList.remove('story-open');
    if (this.rig) {
      this.rig.spin = 0;
      this.rig.enabled = this.mode === 'climb';
    }
    this.writeUrl();
    this.dirty = true;
  }

  enterOverview(): void {
    if (!this.home) return;
    this.closeStory();
    // Hand the current camera pose to the orbit controls, then fly out.
    const look = this.climb ? this.climb.pointAt(this.climb.d) : this.camera.position;
    const cam = this.camera.position;
    void this.controls.setLookAt(cam.x, cam.y, cam.z, look.x, look.y + 1.5, look.z, false);
    this.setMode('overview');
    const { pos, target } = this.home;
    void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
    this.writeUrl();
  }

  /** Walk to door n along the trail (in the overview: enter the climb there). */
  goToDoor(n: number): void {
    if (!this.climb) return;
    this.userMoved = true;
    if (this.mode !== 'climb') return this.enterClimb(n);
    this.climb.goTo(n);
    this.rig?.faceDirection(this.climb.directionAt(this.climb.standAt(this.climb.door), new THREE.Vector3(), 20));
    this.writeUrl();
    this.dirty = true;
  }

  private stepDoor(delta: number): void {
    if (!this.climb) return;
    if (this.mode !== 'climb') return this.enterClimb(this.climb.door);
    this.goToDoor(this.climb.door + delta);
  }

  /** Height of the rendered terrain (what you see), falling back to the coarse grid. */
  private groundAt(x: number, z: number): number | undefined {
    return this.tiles?.heightAt(x, z) ?? this.collision?.heightAt(x, z);
  }

  /** Terrain detail: big facets for the low-poly look from afar, finer under the climber's feet. */
  private updateDetail(): void {
    const coarse = isCoarsePointer();
    if (this.look === 'digital') this.tiles?.setDetail(999, coarse ? 7 : 5, this.mode === 'climb' ? 3 : 2);
    else this.tiles?.setDetail(coarse ? 1.8 : 1.4, coarse ? 3 : 2.5);
  }

  setLook(look: Look): void {
    this.look = look;
    this.applyLook();
    this.writeUrl();
  }

  private applyLook(): void {
    const digital = this.look === 'digital';
    this.tiles?.setLook(this.look);
    this.updateDetail();
    this.sky.visible = !digital;
    this.skyDome.group.visible = digital;
    this.precip.group.visible = digital;
    if (!digital) (this.scene.fog as THREE.Fog).color.copy(SKY.horizon);
    if (this.routes) this.routes.group.visible = !digital;
    (this.walls?.material as THREE.MeshLambertMaterial | undefined)?.color.set(digital ? 0x6a4a9e : 0xffffff);
    this.horizon?.setLook(digital);
    this.container.classList.toggle('look-digital', digital);
    this.climbHud?.setLook(this.look);
    this.dirty = true;
  }

  faceNorth(): void {
    const turns = Math.round(this.controls.azimuthAngle / (Math.PI * 2));
    void this.controls.rotateAzimuthTo(turns * Math.PI * 2, true);
  }

  /** Fly to a place, keeping the current viewing direction. */
  flyTo(poi: Poi, animate = true): void {
    const distance = poi.category === 'summit' ? 6500 : poi.category === 'village' ? 5000 : 4000;
    const target = new THREE.Vector3(...poi.position);
    const pos = orbitPosition(target, distance, this.controls.azimuthAngle, rad(62));
    void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('hashchange', this.onHashChange);
    this.controls.dispose();
    this.tiles?.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  // --- loading ---------------------------------------------------------------------------

  /** Keep the loading screen up until the first view's detail arrives (max 1.5 s; the rest streams in visibly). */
  private async waitForFirstView(): Promise<void> {
    const start = performance.now();
    let peak = 1;
    while (this.tiles && performance.now() - start < 1500) {
      await new Promise((r) => setTimeout(r, 100));
      const { ready, loading, queued } = this.tiles.stats();
      const pending = loading + queued;
      peak = Math.max(peak, ready + pending);
      this.hud.setProgress(0.2 + 0.8 * (ready / peak));
      if (pending === 0 && performance.now() - start > 200) break;
    }
  }

  private setupLights(m: Manifest): void {
    // Light from where the sun was when the satellite took the picture, so 3D shading
    // agrees with the shadows already baked into the imagery.
    const az = rad(m.sun.azimuth ?? 157);
    const el = rad(m.sun.elevation ?? 55);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
    sun.position.copy(dir.multiplyScalar(100000));
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a7d6e, 1.25));
  }

  // --- URL state -------------------------------------------------------------------------

  private currentUrlState(): UrlState {
    if (this.storyView?.current) return { kind: 'story', n: this.storyView.current };
    if (this.mode === 'climb' && this.climb) return { kind: 'station', n: this.climb.door };
    if (this.selected) return { kind: 'poi', id: this.selected.id };
    if (this.selectedRoute) return { kind: 'route', id: this.selectedRoute.id };
    if (!this.geo) return { kind: 'none' };
    const t = this.controls.getTarget(this.tmpA, true);
    const [lon, lat] = this.geo.toLonLat(t.x, t.z);
    return {
      kind: 'view', lat, lon, dist: this.controls.distance,
      heading: -deg(this.controls.azimuthAngle), tilt: deg(this.controls.polarAngle),
    };
  }

  private writeUrl(): void {
    if (this.urlState && this.home) writeHash(formatHash(this.currentUrlState()));
  }

  /** Apply a deep link. Returns false when there was nothing to apply. */
  private applyUrlState(s: UrlState, animate: boolean): boolean {
    if (s.kind === 'story') {
      if (!this.climb) return false;
      if (this.mode !== 'climb') this.enterClimb(s.n, animate);
      this.openStory(s.n);
      return true;
    }
    if (s.kind === 'station') {
      this.closeStory();
      if (!this.climb) return false;
      if (this.mode === 'climb') this.goToDoor(s.n);
      else this.enterClimb(s.n, animate);
      return true;
    }
    if (s.kind === 'poi') {
      const poi = this.pois.find((p) => p.id === s.id);
      if (!poi) return false;
      this.select(poi, { animate });
      return true;
    }
    if (s.kind === 'route') {
      const route = this.routeList.find((r) => r.id === s.id);
      if (!route) return false;
      this.selectRoute(route, animate);
      return true;
    }
    if (s.kind === 'view' && this.geo && this.collision) {
      if (this.mode === 'climb') this.setMode('overview');
      const [x, z] = this.geo.toScene(s.lon, s.lat);
      const target = new THREE.Vector3(x, this.collision.heightAt(x, z), z);
      const dist = THREE.MathUtils.clamp(s.dist, this.controls.minDistance, this.controls.maxDistance);
      const polar = THREE.MathUtils.clamp(rad(s.tilt), 0, this.controls.maxPolarAngle);
      const pos = orbitPosition(target, dist, -rad(s.heading), polar);
      void this.controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate);
      return true;
    }
    return false;
  }

  private readonly onHashChange = () => {
    const s = parseHash(location.hash);
    if (formatHash(s) !== formatHash(this.currentUrlState())) this.applyUrlState(s, true);
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (this.storyView?.isOpen) return; // the story view handles its own keys
    if (this.mode === 'climb' && this.climb && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
      const k = e.key;
      const step = k === 'ArrowUp' || k === 'w' || k === 'PageUp' ? 1 : k === 'ArrowDown' || k === 's' || k === 'PageDown' ? -1 : 0;
      if (step) {
        e.preventDefault();
        return this.stepDoor(step);
      }
      if (k === 'Home') return this.goToDoor(1);
      if (k === 'End') return this.goToDoor(Math.max(1, this.opened));
    }
    if (e.key === 'Escape' && this.panel && this.panel.state !== 'closed') {
      if (this.selected || this.selectedRoute) this.select(undefined);
      else this.panel.close();
    }
  };

  // --- view padding (keeps the view centred in the area not covered by the panel) ---------

  private applyPanelPadding(): void {
    const pad = { left: 0, right: 0, top: 0, bottom: 0 };
    if (this.mode === 'climb' && this.climbHud) {
      // Centre the climb view above what sits at the bottom: the route strip (and a wide card), or
      // on phones the pill. Only what is visible counts (on phones the strip is inside the pill's
      // panel, which opens over the view without moving it).
      const c = this.container.getBoundingClientRect();
      let top = c.bottom;
      for (const sel of ['.ch-strip', '.ch-card', '.ch-pill']) {
        const e = this.climbHud.el.querySelector(sel) as HTMLElement | null;
        if (!e || e.closest('.ch-pop')) continue;
        const r = e.getBoundingClientRect();
        if (!r.height || (sel === '.ch-card' && r.width <= c.width * 0.6)) continue;
        top = Math.min(top, r.top);
      }
      pad.bottom = Math.max(0, c.bottom - top);
    } else if (this.panel && this.panel.state !== 'closed') {
      const c = this.container.getBoundingClientRect();
      const r = this.panel.el.getBoundingClientRect();
      if (this.panel.isSheet) pad.bottom = Math.max(0, c.bottom - r.top);
      else pad.left = Math.max(0, r.right - c.left);
    }
    this.container.classList.toggle('has-panel', !!this.panel && this.panel.state !== 'closed');
    const same = (Object.keys(pad) as (keyof typeof pad)[]).every((k) => Math.abs(pad[k] - this.padding[k]) < 1);
    if (same) return;
    this.padding = pad;
    this.updateProjection();
  }

  /**
   * Shift the principal point to the centre of the unpadded area with setViewOffset, and widen
   * the full view's fov so the on-screen scale doesn't change.
   */
  private updateProjection(): void {
    const { w, h } = this.size;
    const dx = (this.padding.left - this.padding.right) / 2;
    const dy = (this.padding.top - this.padding.bottom) / 2;
    if (!dx && !dy) {
      this.camera.clearViewOffset();
      this.camera.fov = this.fov;
      this.camera.aspect = w / h;
    } else {
      const fullW = w + 2 * Math.abs(dx), fullH = h + 2 * Math.abs(dy);
      this.camera.fov = deg(2 * Math.atan(Math.tan(rad(this.fov) / 2) * (fullH / h)));
      this.camera.aspect = fullW / fullH;
      this.camera.setViewOffset(fullW, fullH, Math.abs(dx) - dx, Math.abs(dy) - dy, w, h);
    }
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // --- pointer: hover readout, tap to dismiss --------------------------------------------

  private setupPointer(): void {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; t: number } | undefined;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350;
      down = undefined;
      if (tap && this.doors) {
        const r = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const n = this.doors.pick(ndc, this.camera, this.size);
        if (n) return this.goToDoor(n);
      }
      if (tap && this.panel && this.panel.state !== 'closed') {
        if (this.selected || this.selectedRoute) this.select(undefined);
        else this.panel.close();
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.interacting) return;
      this.hoverRequest = { x: e.clientX, y: e.clientY };
      this.dirty = true;
    });
    el.addEventListener('pointerleave', () => {
      this.hoverRequest = undefined;
      this.hud.setHover(null);
    });
  }

  private updateHover(): void {
    const req = this.hoverRequest;
    if (!req || !this.tiles || !this.geo) return;
    // A pick costs a few ms; 20 per second is plenty for a readout.
    const now = performance.now();
    if (now - this.lastHoverPick < 50) {
      this.dirty = true; // try again next frame
      return;
    }
    this.lastHoverPick = now;
    this.hoverRequest = undefined;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((req.x - r.left) / r.width) * 2 - 1, -((req.y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.tiles.raycast(this.raycaster);
    if (!hit) return this.hud.setHover(null);
    const [lon, lat] = this.geo.toLonLat(hit.point.x, hit.point.z);
    this.hud.setHover(`▲ ${metres(hit.point.y)} · ${formatLatLon(lon, lat)}`);
  }

  // --- frame loop ------------------------------------------------------------------------

  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.routes?.setResolution(w, h);
    this.doors?.setResolution(w, h);
    this.padding = { left: -1, right: 0, top: 0, bottom: 0 }; // force a projection update
    this.applyPanelPadding();
  }

  /**
   * Weather for the sky's time at altitude `alt`, eased so changes (and the loop back to the start
   * of the data) blend over a few seconds; then clouds, haze, rain, snow and lightning from it.
   */
  private updateWeather(alt: number, dt: number, skyDt: number): void {
    const target = this.weather.at(this.skyClock.instant, alt);
    const k = 1 - Math.exp(-dt * 0.7);
    const w = this.wx ?? (this.wx = { ...target });
    for (const key of ['temp', 'precip', 'cloud', 'cloudLow', 'visibility', 'wind', 'gust'] as const) w[key] += (target[key] - w[key]) * k;
    const dWind = ((target.windFrom - w.windFrom + 540) % 360) - 180;
    w.windFrom = (w.windFrom + dWind * k + 360) % 360;
    w.code = target.code;
    w.snow = target.snow;

    // Wind: toward where it blows (north is -Z). Clouds drift with it, faster when the sky runs fast.
    const from = THREE.MathUtils.degToRad(w.windFrom);
    const ms = w.wind / 3.6;
    this.windVec.set(-Math.sin(from), Math.cos(from)).multiplyScalar(Math.min(ms, 25));
    const drift = Math.min((ms / 700) * skyDt, 0.3 * dt);
    this.fx.cloudOffset.x -= -Math.sin(from) * drift;
    this.fx.cloudOffset.y -= Math.cos(from) * drift;
    this.fx.cloudMorph += Math.min(skyDt / 3600, dt * 0.05) * (0.2 + ms / 40);

    const storm = w.code >= 95;
    this.fx.cloud = Math.min(1, Math.max(w.cloud, w.cloudLow));
    this.fx.storm = storm ? 1 : Math.min(1, w.precip / 4) * w.cloud * 0.6;
    const fogged = w.code === 45 || w.code === 48 ? 0.75 : 0;
    this.fx.haze = Math.max(fogged, THREE.MathUtils.smoothstep(8000 - w.visibility, 0, 7500) * 0.85,
      THREE.MathUtils.smoothstep(30000 - w.visibility, 0, 22000) * 0.4);

    const fall = Math.pow(Math.min(w.precip / 4, 1), 0.6);
    const spindrift = w.temp < 0 ? THREE.MathUtils.clamp((w.wind - 40) / 60, 0, 0.3) : 0;
    this.rainAmt = w.snow ? 0 : fall;
    this.snowAmt = w.snow ? Math.max(fall, spindrift) : spindrift;

    // Lightning: a flash every few seconds in a thunderstorm, sometimes a double one.
    this.fx.flash = Math.max(0, this.fx.flash - dt * 5);
    if (storm) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.fx.flash = 1;
        this.nextFlash = Math.random() < 0.3 ? 0.18 : 3 + Math.random() * 9;
      }
    }
    this.skyChip?.setWeather(this.weather.active ? w : null, alt);
  }

  /**
   * Dynamic resolution: every ~60 rendered frames, look at the median frame time. Frames come in
   * whole vsync steps (16.7 ms, 33.3 ms on a 60 Hz screen), so a median over 25 ms means most frames
   * miss a refresh: render at a lower scale (down to 0.85). Back at full speed twice in a row: step
   * up toward the starting scale. Frames after a pause (hidden tab, idle) are not counted.
   */
  private adaptResolution(time: number): void {
    const dt = time - this.prLastFrame;
    this.prLastFrame = time;
    if (dt <= 0 || dt > 0.25) return;
    this.prSamples.push(dt);
    if (this.prSamples.length < 60) return;
    const med = this.prSamples.sort((a, b) => a - b)[this.prSamples.length >> 1];
    this.prSamples.length = 0;
    const pr = this.renderer.getPixelRatio();
    let next = pr;
    if (med > 1 / 40 && pr > 0.85) {
      next = Math.max(0.85, pr - 0.25);
      this.prCap = Math.max(next, Math.min(this.prCap, pr - 0.125)); // never retry a scale that proved too slow
    }
    else if (med < 1 / 55 && pr < this.prCap && ++this.prFast >= 2) next = Math.min(this.prCap, pr + 0.125);
    if (med >= 1 / 55) this.prFast = 0;
    if (next !== pr) {
      this.prFast = 0;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const time = performance.now() / 1000;
    // The sky runs on wall-clock time, not frame time (slow frames must not slow it down);
    // a long gap (hidden tab) counts as one second.
    const realDt = Math.min(time - (this.skyTickAt || time), 1);
    this.skyTickAt = time;
    this.skyClock.tick(realDt);
    const skyDt = realDt * this.skyClock.speed;
    const climbing = this.mode === 'climb' && !!this.climb && !!this.rig;
    if (!climbing && this.idleSpin && !this.interacting) this.controls.rotate(dt * 0.045, 0, true);
    if (!climbing && this.controls.update(dt)) this.dirty = true;
    if (this.look === 'digital') this.dirty = true; // the sky, portals and trail are animated
    if (climbing && this.climb!.update(dt)) this.dirty = true;
    if (!this.dirty) return; // render on demand: idle = no GPU work
    this.adaptResolution(time);
    this.dirty = false;

    this.skyState = skyAt(this.skyClock.instant);
    this.tod = timeOfDay(this.skyState);
    this.skyChip?.update(this.tod.sunEl > -0.8);
    const cam = this.camera.position;
    let dist: number;

    if (climbing) {
      const c = this.climb!;
      const feet = c.pointAt(c.d, this.tmpA);
      const g = this.groundAt(feet.x, feet.z);
      if (g !== undefined) feet.y = g;
      const walking = c.moving;
      // Step onto a stone and its story opens (after a short rest, once the visitor has moved).
      if (walking) this.restSince = time;
      else if (this.userMoved && !this.tourActive && this.storyShownFor !== c.door && time - this.restSince > 0.6 && !this.storyView?.isOpen) {
        this.storyShownFor = c.door;
        const st = this.doors?.stateOf(c.door);
        if (st === 'open' || st === 'last') this.openStory(c.door); // closed ones: the card says so
      }
      if (this.storyView?.isOpen) {
        const st = c.stats(c.d);
        this.storyView.updatePosition({ elevation: st.elevation, distance: st.distance, stage: c.stage(c.d) });
      }
      if (walking) this.rig!.faceDirection(c.directionAt(c.d, new THREE.Vector3(), 20));
      this.rig!.update(feet, dt);
      dist = this.rig!.dist;
      if (!walking && this.arrivedAt !== c.door) {
        this.arrivedAt = c.door;
        const d = c.j.doors[c.door - 1];
        setTerrainArrival(d.p[0], d.p[2], time, this.doors!.stateOf(c.door));
      }
      if (this.camera.near !== 0.25) {
        this.camera.near = 0.25;
        this.camera.far = 150000;
        this.camera.updateProjectionMatrix();
      }
    } else {
      const target = this.controls.getTarget(this.tmpA);
      dist = cam.distanceTo(target);
      if (this.collision) {
        // The dome: in this direction the camera may be at most this far from the target. Going
        // up shortens it, so you come closer to the mountain. Only the distance is touched
        // (dollyTo leaves a rotation in progress alone), so nothing freezes mid-gesture.
        // Checked on where the camera is heading (the end of a flight or gesture), not on the
        // positions it passes through: a flight to the home view must not be cut short.
        const endT = this.controls.getTarget(this.tmpC, true);
        const endP = this.controls.getPosition(this.tmpD, true);
        const endDist = endP.distanceTo(endT);
        const toCam = endP.sub(endT).divideScalar(Math.max(endDist, 1));
        const reach = Math.max(this.controls.minDistance, domeReach(endT, toCam));
        this.controls.maxDistance = reach;
        if (endDist > reach + 1) {
          void this.controls.dollyTo(reach, false);
          this.controls.update(0);
          this.dirty = true;
        }
        // Never let the camera dip below the terrain. During a camera flight only step in when it
        // would actually go underground: a correction cancels the flight (setPosition is instant).
        const ground = this.collision.heightAt(cam.x, cam.z);
        const flying = this.controls.getPosition(this.tmpB, true).distanceTo(cam) > 1;
        // While the camera is headed somewhere above the ground (a flight to the home view, whose
        // path may dip through the slope since the pivot sits inside the mountain), let it pass:
        // a correction would cancel the flight. Dragging into the ground is still stopped.
        const clearance = Math.max(25, dist * 0.004); // low enough to stand in a valley
        const end = this.controls.getPosition(this.tmpD, true);
        const passing = flying && end.y > this.collision.heightAt(end.x, end.z) + clearance;
        if (!passing && cam.y < ground + clearance) {
          void this.controls.setPosition(cam.x, ground + clearance, cam.z, false);
          this.controls.update(0);
        }
        this.camera.near = THREE.MathUtils.clamp((cam.y - ground) * 0.2, 5, 500);
        this.camera.far = 600000;
        this.camera.updateProjectionMatrix();
        this.hud.setReadout(cam.y, dist);
      }
    }

    // Aerial perspective: haze scales with viewing distance.
    const fog = this.scene.fog as THREE.Fog;
    const pr = this.renderer.getPixelRatio();
    if (this.look === 'digital') {
      const alt = climbing ? cam.y : this.controls.getTarget(this.tmpB).y;
      this.updateWeather(alt, realDt, skyDt);
      const haze = this.fx.haze;
      fog.color.copy(this.tod.fog);
      fog.near = (climbing ? 1200 : Math.min(dist * 0.7 + 900, 50000)) * (1 - 0.9 * haze);
      fog.far = (climbing ? 26000 : Math.min(dist * 5 + 24000, FOG_MAX)) * (1 - 0.88 * haze);
      this.skyDome.update(this.camera, this.skyState, this.tod, this.fx, time, dt, pr);
      this.precip.update(cam, time, this.rainAmt, this.snowAmt, this.windVec, pr);
      const cover = this.fx.cloud;
      const light = this.tod.lightColor.clone().multiplyScalar(1 - 0.55 * cover - 0.25 * this.fx.storm);
      setTerrainLighting(this.tod.lightDir, light, this.tod.ambient + 0.05 * cover + this.fx.flash * 0.9);
      setTerrainTime(time);
    } else {
      fog.near = Math.min(dist * 1.1 + 4000, 60000);
      fog.far = Math.min(dist * 6 + 60000, FOG_MAX);
      this.sky.position.copy(cam);
      this.sky.scale.setScalar(1000);
    }

    if (this.doors && this.climb && this.stones) {
      const c = this.climb;
      this.updateTrailPaint();
      const key = `${c.door}|${this.opened}`;
      if (key !== this.portalsKey) {
        this.portalsKey = key;
        this.stones.sync(c.door, this.opened);
        this.doors.setNear(c.door - 4, c.door + 8);
        setTerrainStones(this.stones.list().map((st) => ({
          x: st.door.p[0], z: st.door.p[2], state: st.state, reached: st.reached,
        })));
      }
      this.stones.update(time, pr);
      // The stones carry their own numbers: no floating badges.
      this.doors.update(c.door, this.camera, time, pr, false, () => undefined);
      if (climbing) {
        this.labels?.setHideNear(c.pointAt(c.d, this.tmpB), 200);
        const st = c.stats(c.d);
        this.climbHud?.update({
          door: c.door, total: c.doorCount, state: this.doors.stateOf(c.door),
          opened: this.opened, elevation: st.elevation, distance: st.distance, walkMinutes: st.walkMinutes,
          stage: c.stage(c.d),
        });
      }
    }

    if (this.tiles) {
      this.tiles.update(this.camera, this.size.h);
      if (this.debug) this.hud.setDebug(this.tiles.stats());
    }
    this.labels?.update(this.camera, this.collision);
    if (this.climb) this.markers?.update(this.mode === 'overview', this.climb.door);
    this.hud.setHeading(climbing ? -this.rig!.yaw : this.controls.azimuthAngle);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.labels?.declutter(this.markers?.boxes());
    if (!climbing) this.updateHover();
  }

  /** Paint the trail near the climber into the terrain (walked part warm, the rest flowing ahead). */
  private updateTrailPaint(): void {
    const c = this.climb!;
    if (Math.abs(c.d - this.trailAt) < 2) return;
    this.trailAt = c.d;
    const from = Math.max(0, c.d - 110), to = Math.min(c.j.lengthM, c.d + 270);
    const step = (to - from) / (TRAIL_POINTS - 1);
    const pts = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const d = from + i * step;
      c.pointAt(d, v);
      pts.push({ x: v.x, z: v.z, walked: d <= c.d + 0.5, d });
    }
    setTerrainTrail(pts);
  }
}

/** Camera position orbiting `target` (azimuth: camera-controls convention, 0 = camera south of target). */
/**
 * How far from target t the camera may go in unit direction v before leaving the dome (an
 * ellipsoid over the centre: DOME_RADIUS across at sea level, DOME_TOP high).
 */
function domeReach(t: THREE.Vector3, v: THREE.Vector3): number {
  const qx = t.x / DOME_RADIUS, qy = t.y / DOME_TOP, qz = t.z / DOME_RADIUS;
  const wx = v.x / DOME_RADIUS, wy = v.y / DOME_TOP, wz = v.z / DOME_RADIUS;
  const a = wx * wx + wy * wy + wz * wz;
  const b = qx * wx + qy * wy + qz * wz;
  const c = qx * qx + qy * qy + qz * qz - 1;
  const disc = b * b - a * c;
  return c >= 0 || disc <= 0 ? 0 : (-b + Math.sqrt(disc)) / a;
}

function orbitPosition(target: THREE.Vector3, dist: number, azimuth: number, polar: number): THREE.Vector3 {
  return new THREE.Vector3(
    target.x + dist * Math.sin(polar) * Math.sin(azimuth),
    target.y + dist * Math.cos(polar),
    target.z + dist * Math.sin(polar) * Math.cos(azimuth),
  );
}
