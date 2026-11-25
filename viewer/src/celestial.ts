import * as THREE from 'three';

/**
 * The sky of the climb: a dome with a sun on one side and a moon on the other, a star field that
 * turns around the celestial pole (Elbrus is at 43.35° N), a faint Milky Way and shooting stars.
 * Time passes with the climb: deep night at Azau, sunrise on the summit — as on a real summit push.
 */

const LAT = THREE.MathUtils.degToRad(43.35);
const POLE = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)).normalize(); // north is -Z
const rad = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;

function dirFrom(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = rad(azDeg), el = rad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export interface TimeOfDay {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  dawn: number; // 0 night … 1 sun up
  lightDir: THREE.Vector3; // dominant light on the terrain (moon at night, sun at dawn)
  lightColor: THREE.Color;
  ambient: number;
  fog: THREE.Color;
}

const NIGHT_FOG = new THREE.Color(0x2a0f50);
const DAWN_FOG = new THREE.Color(0x7a3466);
const MOON_LIGHT = new THREE.Color(0x9fb4ff);
const SUN_LIGHT = new THREE.Color(0xffb27a);

/** Time of day for a climb progress of 0 (Azau) … 1 (summit). */
export function timeOfDay(progress: number): TimeOfDay {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const sunEl = lerp(-24, 7, Math.pow(p, 1.25));
  const sunDir = dirFrom(lerp(52, 70, p), sunEl);
  const moonDir = dirFrom(lerp(236, 258, p), lerp(40, 9, p));
  const dawn = THREE.MathUtils.smoothstep(sunEl, -18, 4);
  const lightDir = new THREE.Vector3().lerpVectors(moonDir, sunDir, THREE.MathUtils.smoothstep(sunEl, -6, 3));
  lightDir.y = Math.max(lightDir.y, 0.22);
  lightDir.normalize();
  return {
    sunDir, moonDir, dawn, lightDir,
    lightColor: MOON_LIGHT.clone().lerp(SUN_LIGHT, THREE.MathUtils.smoothstep(sunEl, -8, 4)),
    ambient: lerp(0.2, 0.34, dawn),
    fog: NIGHT_FOG.clone().lerp(DAWN_FOG, dawn),
  };
}

export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly starPivot = new THREE.Group();
  private readonly meteor: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private meteorT = -1;
  private nextMeteor = 4;
  private meteorFrom = new THREE.Vector3();
  private meteorDir = new THREE.Vector3();
  private readonly skyRot = new THREE.Matrix3();

  constructor() {
    this.group.name = 'sky';
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3() },
        dawn: { value: 0 }, time: { value: 0 }, skyRot: { value: this.skyRot }, fogColor: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, moonDir, fogColor;
        uniform float dawn, time;
        uniform mat3 skyRot;
        varying vec3 vDir;

        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }

        // A thin ring of radius r around axis c, broken into rotating dashes.
        float dashedRing(vec3 d, vec3 c, float r, float w, float segs, float spin) {
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), c));
          vec3 up = cross(c, right);
          float ang = acos(clamp(dot(d, c), -1.0, 1.0));
          float phi = atan(dot(d, up), dot(d, right));
          float ring = 1.0 - smoothstep(0.0, w, abs(ang - r));
          float dash = step(0.35, fract(phi / 6.2832 * segs + spin));
          return ring * dash;
        }

        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          // Base gradient: night → dawn.
          vec3 nightZ = vec3(0.012, 0.008, 0.04), nightH = vec3(0.09, 0.035, 0.22);
          vec3 dawnZ = vec3(0.06, 0.07, 0.26), dawnH = vec3(0.95, 0.33, 0.42);
          vec3 zen = mix(nightZ, dawnZ, dawn), hor = mix(nightH, dawnH, dawn * 0.75);
          vec3 c = mix(hor, zen, smoothstep(0.0, 0.55, y));
          // Warm glow toward the sun's side of the horizon.
          float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          float glow = exp(-max(y, 0.0) * 7.0) * pow(toward, 2.5) * (0.15 + 0.85 * dawn);
          c += vec3(1.0, 0.45, 0.25) * glow * 0.9;

          // Milky Way: a faint band fixed to the turning star field.
          vec3 s = skyRot * d;
          float band = exp(-pow(dot(s, normalize(vec3(0.35, 0.2, 0.9))), 2.0) / 0.02);
          float mw = band * fbm(s * 6.0) * (1.0 - dawn) * smoothstep(0.0, 0.25, y);
          c += vec3(0.35, 0.3, 0.6) * mw * 0.35;

          // Sun: bright disc, corona, and two segmented orbit rings slowly turning.
          float as = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          float vis = smoothstep(-0.02, 0.02, y);
          vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.92, 0.75), smoothstep(0.045, 0.0, as));
          c = mix(c, sunCol, smoothstep(0.046, 0.042, as) * vis);
          c += vec3(1.0, 0.5, 0.3) * exp(-as / 0.07) * 0.55 * vis;
          c += vec3(1.0, 0.6, 0.4) * dashedRing(d, sunDir, 0.085, 0.0025, 24.0, time * 0.01) * 0.55 * vis;
          c += vec3(1.0, 0.4, 0.6) * dashedRing(d, sunDir, 0.125, 0.0018, 40.0, -time * 0.006) * 0.35 * vis;

          // Moon: a crescent lit toward the sun, with a halo.
          float am = acos(clamp(dot(d, moonDir), -1.0, 1.0));
          vec3 toSun = normalize(sunDir - moonDir * dot(sunDir, moonDir));
          vec3 shadowC = normalize(moonDir - toSun * 0.022);
          float disc = smoothstep(0.032, 0.029, am);
          float shadow = smoothstep(0.029, 0.026, acos(clamp(dot(d, shadowC), -1.0, 1.0)));
          float lit = disc * (1.0 - shadow * 0.92);
          float craters = 0.85 + 0.15 * fbm(d * 180.0);
          float mvis = smoothstep(-0.02, 0.02, y) * (1.0 - 0.6 * dawn);
          c = mix(c, vec3(0.86, 0.9, 1.0) * craters, lit * mvis);
          c += vec3(0.55, 0.6, 1.0) * exp(-am / 0.06) * 0.22 * mvis;
          c += vec3(0.6, 0.7, 1.0) * dashedRing(d, moonDir, 0.075, 0.0015, 1.0, 0.0) * 0.18 * mvis;

          // Below eye level: fade into the fog so far ridges melt into the haze.
          if (y < 0.0) c = mix(mix(hor, fogColor, 0.4), fogColor, smoothstep(0.0, -0.3, y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -3;

    // Stars over the whole sphere (those below the horizon fade out), turning with starPivot.
    const N = 3200;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tint = [new THREE.Color(0xcfdcff), new THREE.Color(0xffffff), new THREE.Color(0xffe2c2), new THREE.Color(0xffc6e8)];
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * r, u, Math.sin(a) * r], i * 3);
      size[i] = 0.7 + Math.pow(rnd(), 7) * 3.4;
      phase[i] = rnd() * 6.283;
      const t = tint[Math.floor(rnd() * tint.length)];
      col.set([t.r, t.g, t.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 }, dawn: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float time, pixelRatio, dawn;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
          vec3 w = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          float tw = 0.55 + 0.45 * sin(time * (1.1 + fract(phase) * 2.0) + phase * 3.0);
          vAlpha = tw * smoothstep(0.0, 0.18, w.y) * (1.0 - dawn * 0.85);
          vColor = color;
          gl_PointSize = size * pixelRatio * (size > 2.5 ? (0.9 + 0.3 * tw) : 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          float core = smoothstep(0.5, 0.0, d);
          float cross = max(0.0, 1.0 - abs(q.x) * 14.0) * max(0.0, 1.0 - abs(q.y) * 2.2)
                      + max(0.0, 1.0 - abs(q.y) * 14.0) * max(0.0, 1.0 - abs(q.x) * 2.2);
          gl_FragColor = vec4(vColor, (core + cross * 0.35) * vAlpha);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.starPivot.add(this.stars);

    // Shooting star: a short tapered quad on the far sphere, re-aimed every few seconds.
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    mg.setAttribute('t', new THREE.BufferAttribute(new Float32Array([1, 1, 0, 0]), 1));
    mg.setIndex([0, 1, 2, 1, 3, 2]);
    this.meteor = new THREE.Mesh(mg, new THREE.ShaderMaterial({
      uniforms: { alpha: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float t; varying float vT;
        void main() { vT = t; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float alpha; varying float vT;
        void main() { gl_FragColor = vec4(vec3(1.0, 0.92, 1.0), vT * vT * alpha); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    this.meteor.frustumCulled = false;
    this.meteor.visible = false;
    this.group.add(this.dome, this.starPivot, this.meteor);
  }

  /**
   * Per frame. `progress` is the climb (0 Azau … 1 summit); `time` is seconds (the stars keep
   * turning slowly, faster than real time, so you see time passing).
   */
  update(camera: THREE.Camera, tod: TimeOfDay, progress: number, time: number, dt: number, pixelRatio: number): void {
    this.group.position.copy(camera.position);
    this.group.scale.setScalar(1000);
    const u = this.dome.material.uniforms;
    u.sunDir.value.copy(tod.sunDir);
    u.moonDir.value.copy(tod.moonDir);
    u.dawn.value = tod.dawn;
    u.time.value = time;
    u.fogColor.value.copy(tod.fog);

    // Sky rotation: about 5 hours of night over the whole climb, plus a slow drift.
    const angle = progress * (5 / 24) * Math.PI * 2 + time * ((Math.PI * 2) / 900);
    this.starPivot.quaternion.setFromAxisAngle(POLE, -angle);
    this.skyRot.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(POLE, angle));
    const su = this.stars.material.uniforms;
    su.time.value = time;
    su.pixelRatio.value = pixelRatio;
    su.dawn.value = tod.dawn;

    this.updateMeteor(dt, tod.dawn);
  }

  private updateMeteor(dt: number, dawn: number): void {
    if (this.meteorT < 0) {
      this.nextMeteor -= dt;
      if (this.nextMeteor > 0 || dawn > 0.6) return;
      this.nextMeteor = 6 + Math.random() * 10;
      const az = Math.random() * Math.PI * 2, el = rad(25 + Math.random() * 45);
      this.meteorFrom.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const side = new THREE.Vector3(0, -1, 0).cross(this.meteorFrom).normalize();
      this.meteorDir.copy(side).multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(new THREE.Vector3(0, -1, 0), 0.5).normalize();
      this.meteorT = 0;
    }
    this.meteorT += dt / 0.9;
    if (this.meteorT > 1) {
      this.meteorT = -1;
      this.meteor.visible = false;
      return;
    }
    const head = this.meteorFrom.clone().addScaledVector(this.meteorDir, 0.35 * this.meteorT).normalize();
    const tail = head.clone().addScaledVector(this.meteorDir, -0.12).normalize();
    const w = head.clone().cross(this.meteorDir).normalize().multiplyScalar(0.0012);
    const p = this.meteor.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, head.x + w.x, head.y + w.y, head.z + w.z);
    p.setXYZ(1, head.x - w.x, head.y - w.y, head.z - w.z);
    p.setXYZ(2, tail.x, tail.y, tail.z);
    p.setXYZ(3, tail.x, tail.y, tail.z);
    p.needsUpdate = true;
    this.meteor.material.uniforms.alpha.value = Math.sin(Math.PI * this.meteorT) * 0.9;
    this.meteor.visible = true;
  }
}
