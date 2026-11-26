import * as THREE from 'three';

/**
 * Rain, snow and wind-blown snow in a box around the camera. Every drop and flake moves in the
 * vertex shader (positions wrap around the box), so there is no per-frame CPU work. They fall in
 * real time, even when the sky clock runs fast.
 */

const BOX = new THREE.Vector3(70, 40, 70);
const RAIN_N = 5000;
const SNOW_N = 6000;

const WRAP = /* glsl */ `
  uniform vec3 box, cam, drift;
  uniform float time, amount;
  attribute vec4 seed;
  // Position of a particle: its seed in the box, moved by drift (m/s), wrapped around the camera.
  vec3 place(vec3 extra) {
    vec3 p = seed.xyz * box + drift * time + extra;
    return cam + mod(p - cam + box * 0.5, box) - box * 0.5;
  }
`;

export class Precip {
  readonly group = new THREE.Group();
  private readonly rain: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    this.group.name = 'precip';
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

    // Rain: two vertices per drop (head, tail along the fall direction).
    const rs = new Float32Array(RAIN_N * 2 * 4), re = new Float32Array(RAIN_N * 2);
    for (let i = 0; i < RAIN_N; i++) {
      const a = [rnd(), rnd(), rnd(), rnd()];
      rs.set(a, i * 8);
      rs.set(a, i * 8 + 4);
      re[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 2 * 3), 3));
    rg.setAttribute('seed', new THREE.BufferAttribute(rs, 4));
    rg.setAttribute('tail', new THREE.BufferAttribute(re, 1));
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: this.uniforms(),
      vertexShader: /* glsl */ `
        ${WRAP}
        attribute float tail;
        varying float vA;
        void main() {
          vec3 p = place(vec3(0.0));
          p -= normalize(drift) * tail * 0.9; // a streak 0.9 m long along the fall
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float far = smoothstep(box.x * 0.5, box.x * 0.2, length(p - cam));
          vA = step(seed.w, amount) * far * mix(0.55, 0.12, tail);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(0.78, 0.82, 1.0, vA); }`,
      transparent: true, depthWrite: false, fog: false,
    }));

    // Snow: soft round flakes that sway.
    const ss = new Float32Array(SNOW_N * 4);
    for (let i = 0; i < SNOW_N * 4; i++) ss[i] = rnd();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_N * 3), 3));
    sg.setAttribute('seed', new THREE.BufferAttribute(ss, 4));
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms(), pixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        ${WRAP}
        uniform float pixelRatio;
        varying float vA;
        void main() {
          float ph = seed.w * 40.0;
          vec3 sway = vec3(sin(time * 1.3 + ph), 0.0, cos(time * 1.1 + ph * 1.7)) * 0.35;
          vec3 p = place(sway);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp((0.05 + 0.05 * fract(ph)) * pixelRatio * 900.0 / max(d, 0.5), 1.0, 24.0);
          float far = smoothstep(box.x * 0.5, box.x * 0.2, length(p - cam));
          vA = step(seed.w, amount) * far * 0.85;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, r) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.95, 0.95, 1.0, a);
        }`,
      transparent: true, depthWrite: false, fog: false,
    }));

    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.visible = false;
      o.renderOrder = 5;
      this.group.add(o);
    }
  }

  private uniforms() {
    return {
      box: { value: BOX }, cam: { value: new THREE.Vector3() }, drift: { value: new THREE.Vector3(0, -1, 0) },
      time: { value: 0 }, amount: { value: 0 },
    };
  }

  /**
   * Per frame. `rain` and `snow` are 0 … 1 (share of particles shown); `wind` is the horizontal
   * wind vector toward where it blows, in m/s.
   */
  update(cam: THREE.Vector3, time: number, rain: number, snow: number, wind: THREE.Vector2, pixelRatio: number): void {
    const set = (o: THREE.LineSegments | THREE.Points, amount: number, fall: number, windShare: number) => {
      const u = (o.material as THREE.ShaderMaterial).uniforms;
      o.visible = amount > 0.005;
      u.amount.value = amount;
      u.cam.value.copy(cam);
      u.time.value = time;
      u.drift.value.set(wind.x * windShare, -fall, wind.y * windShare);
    };
    set(this.rain, rain, 9, 0.6);
    set(this.snow, snow, 1.1, 0.8);
    this.snow.material.uniforms.pixelRatio.value = pixelRatio;
  }
}
