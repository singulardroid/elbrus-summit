import * as THREE from 'three';

/**
 * Orbit camera for the climb: circles the current story point at close range.
 * Drag rotates 360° around it and tilts up/down (looking up, the camera slides down to the
 * ground and tilts back, so you can see the sky); the wheel and pinch zoom in and out.
 */
export class ClimbRig {
  yaw = 0; // 0 = looking north, clockwise
  pitch = -0.38; // + looks up
  dist = 16;
  enabled = false;
  /** Slow automatic turn (rad/s), e.g. behind an open story. */
  spin = 0;
  /** Last time the visitor turned the view (ms); the rig then stops auto-facing up the trail. */
  lastUserTurn = -1e9;

  private yawS = 0;
  private pitchS = -0.38;
  private distS = 16;
  private readonly pivot = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private initialised = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private distAtPinch = 16;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly groundAt: (x: number, z: number) => number | undefined,
    private readonly onChange: () => void,
  ) {
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) dom.addEventListener(ev, this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
  }

  /** Face a walking direction (scene x/z vector), e.g. when stepping to the next door. */
  faceDirection(dir: THREE.Vector3, force = false): void {
    if (!force && performance.now() - this.lastUserTurn < 3000) return;
    const target = Math.atan2(dir.x, -dir.z);
    this.yaw = this.yaw + wrap(target - this.yaw);
  }

  /** Start from the current camera pose (no jump when entering the climb). */
  reset(): void {
    this.initialised = false;
  }

  /**
   * Place the camera around the point `anchor` (on the ground).
   * Returns true while the camera is still settling.
   */
  update(anchor: THREE.Vector3, dt: number): boolean {
    if (this.spin) this.yaw += this.spin * dt;
    const k = 1 - Math.exp(-dt * 9);
    this.yawS += wrap(this.yaw - this.yawS) * k;
    this.pitchS += (this.pitch - this.pitchS) * k;
    this.distS += (this.dist - this.distS) * k;
    this.pivot.set(anchor.x, anchor.y + 1.1, anchor.z);

    const cp = Math.cos(this.pitchS);
    const f = new THREE.Vector3(Math.sin(this.yawS) * cp, Math.sin(this.pitchS), -Math.cos(this.yawS) * cp);
    const desired = this.pivot.clone().addScaledVector(f, -this.distS);
    const g = this.groundAt(desired.x, desired.z);
    if (g !== undefined && desired.y < g + 0.45) desired.y = g + 0.45;

    if (!this.initialised) {
      this.pos.copy(this.camera.position);
      this.initialised = true;
    }
    this.pos.lerp(desired, 1 - Math.exp(-dt * 7));
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pos.clone().add(f));
    return this.pos.distanceTo(desired) > 0.02 || Math.abs(wrap(this.yaw - this.yawS)) > 1e-3 ||
      Math.abs(this.pitch - this.pitchS) > 1e-3 || Math.abs(this.dist - this.distS) > 1e-3;
  }

  // --- input ------------------------------------------------------------------------------

  private readonly onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch {
      /* not essential */
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.distAtPinch = this.dist;
    }
  };

  private readonly onMove = (e: PointerEvent) => {
    if (!this.enabled || !this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId)!;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      const s = 0.0055;
      this.yaw += dx * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s * 0.85, -1.2, 1.35);
      this.lastUserTurn = performance.now();
    } else if (this.pointers.size === 2 && this.pinchStart > 0) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.dist = THREE.MathUtils.clamp(this.distAtPinch * (this.pinchStart / Math.max(d, 1)), MIN_DIST, MAX_DIST);
    }
    this.onChange();
  };

  private readonly onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
  };

  /** Wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms. */
  private readonly onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const k = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.0015;
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * k), MIN_DIST, MAX_DIST);
    this.onChange();
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') this.yaw -= 0.25;
    else if (e.key === 'ArrowRight' || e.key === 'd') this.yaw += 0.25;
    else return;
    this.lastUserTurn = performance.now();
    this.onChange();
  };
}

const MIN_DIST = 3;
const MAX_DIST = 90;

function wrap(a: number): number {
  return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}
