import * as THREE from 'three';

/**
 * The sky of the climb: a dome with the sun and the moon where they really are, a star field with
 * the bright stars and constellations, the Milky Way, Andromeda and shooting stars.
 *
 * Everything is computed for Elbrus (43.35° N, 42.44° E) at a given instant (see skyClock.ts): the
 * sun and moon from low-precision ephemerides (about a degree), the stars turned by local
 * sidereal time, the moon lit by the sun, so its phase is the real one.
 */

const LAT = THREE.MathUtils.degToRad(43.35);
const LON_DEG = 42.44;
const rad = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

// World axes: +X east, +Y up, -Z north.
const POLE = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)); // north celestial pole
const MERIDIAN = new THREE.Vector3(0, Math.cos(LAT), Math.sin(LAT)); // celestial equator due south
const WEST = new THREE.Vector3(-1, 0, 0);

/** Equatorial unit vector (x → RA 0h, y → RA 6h, z → north pole) from RA (hours) and Dec (degrees). */
function eq(raH: number, decDeg: number): THREE.Vector3 {
  const a = rad(raH * 15), d = rad(decDeg);
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}
function eclipticToEq(lon: number, lat: number, eps: number): THREE.Vector3 {
  const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
  return new THREE.Vector3(x, Math.cos(eps) * y - Math.sin(eps) * z, Math.sin(eps) * y + Math.cos(eps) * z);
}

/** Galactic north pole and centre, in equatorial coordinates (J2000). */
export const GAL_POLE = eq(12.8573, 27.128);
export const GAL_CENTER = eq(17.7603, -28.936);
const ANDROMEDA = eq(0.7123, 41.269);
const ORION_NEBULA = eq(5.588, -5.39);

export interface SkyState {
  /** Equatorial → world rotation at this instant (columns: RA 0h, RA 6h, pole). */
  eqToWorld: THREE.Matrix3;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** Lit fraction of the moon, 0 new … 1 full. */
  moonLit: number;
}

/** Sun, moon and star field over Elbrus at the instant `ms` (Unix milliseconds). */
export function skyAt(ms: number): SkyState {
  const d = ms / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const eps = rad(23.439 - 0.0000004 * d);
  // Sun.
  const g = rad(357.528 + 0.9856003 * d);
  const sunLon = rad(280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const sunEq = eclipticToEq(sunLon, 0, eps);
  // Moon (main terms only).
  const Mm = rad(134.963 + 13.064993 * d), F = rad(93.272 + 13.22935 * d);
  const D = rad(297.85 + 12.190749 * d);
  const moonLon = rad(218.316 + 13.176396 * d + 6.289 * Math.sin(Mm) + 1.274 * Math.sin(2 * D - Mm) + 0.658 * Math.sin(2 * D));
  const moonEq = eclipticToEq(moonLon, rad(5.128 * Math.sin(F)), eps);
  // Local sidereal time turns the sky.
  const lst = rad(280.46061837 + 360.98564736629 * d + LON_DEG);
  const c = Math.cos(lst), s = Math.sin(lst);
  const col0 = MERIDIAN.clone().multiplyScalar(c).addScaledVector(WEST, s);
  const col1 = MERIDIAN.clone().multiplyScalar(s).addScaledVector(WEST, -c);
  const m = new THREE.Matrix3().set(
    col0.x, col1.x, POLE.x,
    col0.y, col1.y, POLE.y,
    col0.z, col1.z, POLE.z,
  );
  const sunDir = sunEq.applyMatrix3(m).normalize();
  const moonDir = moonEq.applyMatrix3(m).normalize();
  return { eqToWorld: m, sunDir, moonDir, moonLit: (1 - sunDir.dot(moonDir)) / 2 };
}

export interface TimeOfDay {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  moonLit: number;
  sunEl: number; // degrees
  night: number; // 1 dark enough for stars … 0
  twilight: number; // warm horizon around sunrise and sunset
  day: number; // 0 … 1 full daylight
  lightDir: THREE.Vector3; // dominant light on the terrain
  lightColor: THREE.Color;
  ambient: number;
  fog: THREE.Color;
}

const NIGHT_FOG = new THREE.Color(0x2a0f50);
const DAWN_FOG = new THREE.Color(0x7a3466);
const DAY_FOG = new THREE.Color(0x5a3a94);
const MOON_LIGHT = new THREE.Color(0x9fb4ff);
const SKY_LIGHT = new THREE.Color(0x6c64c8);
const SUN_LOW = new THREE.Color(0xffb27a);
const SUN_HIGH = new THREE.Color(0xffd9c4);
const STARLIGHT_DIR = new THREE.Vector3(-0.35, 0.6, 0.7).normalize();

export function timeOfDay(sky: SkyState): TimeOfDay {
  const { sunDir, moonDir, moonLit } = sky;
  const sunEl = THREE.MathUtils.radToDeg(Math.asin(sunDir.y));
  const moonEl = THREE.MathUtils.radToDeg(Math.asin(moonDir.y));
  const night = 1 - smooth(sunEl, -16, -4);
  const day = smooth(sunEl, -2, 28);
  const twilight = smooth(sunEl, -16, -3) * (1 - smooth(sunEl, 6, 18));

  // Light: the sun when it is up, else the moon (as bright as its phase), else a dim sky glow.
  const sunW = smooth(sunEl, -5, 3);
  const moonW = smooth(moonEl, -2, 6) * (0.25 + 0.75 * moonLit);
  const nightDir = STARLIGHT_DIR.clone().lerp(moonDir, moonW).normalize();
  const lightDir = nightDir.lerp(sunDir, sunW);
  lightDir.y = Math.max(lightDir.y, 0.22);
  lightDir.normalize();
  const nightColor = SKY_LIGHT.clone().multiplyScalar(0.6).lerp(MOON_LIGHT.clone().multiplyScalar(0.72), moonW);
  const sunColor = SUN_LOW.clone().lerp(SUN_HIGH, smooth(sunEl, 6, 35)).multiplyScalar(lerp(1, 0.82, day));
  const fog = NIGHT_FOG.clone().lerp(DAY_FOG, day).lerp(DAWN_FOG, twilight * (1 - day) * 0.9);
  return {
    sunDir, moonDir, moonLit, sunEl, night, twilight, day, lightDir,
    lightColor: nightColor.lerp(sunColor, sunW),
    ambient: lerp(lerp(0.2, 0.3, twilight), 0.3, day),
    fog,
  };
}

/** The bright stars (RA hours, Dec degrees, magnitude): the constellations people know. */
const BRIGHT: [number, number, number][] = [
  [6.752, -16.716, -1.46], [14.261, 19.182, -0.05], [18.616, 38.784, 0.03], [5.278, 45.998, 0.08],
  [5.242, -8.202, 0.13], [7.655, 5.225, 0.34], [5.919, 7.407, 0.5], [19.846, 8.868, 0.77],
  [4.599, 16.509, 0.85], [16.49, -26.432, 0.96], [13.42, -11.161, 0.97], [7.755, 28.026, 1.14],
  [22.961, -29.622, 1.16], [20.69, 45.28, 1.25], [10.139, 11.967, 1.35], [7.577, 31.888, 1.58],
  [5.419, 6.35, 1.64], [5.438, 28.608, 1.65], [5.604, -1.202, 1.69], [5.679, -1.943, 1.74],
  [5.533, -0.299, 2.23], [5.796, -9.67, 2.06], [6.977, -28.972, 1.5], [7.14, -26.393, 1.83],
  [6.378, -17.956, 1.98], [6.629, 16.399, 1.93], [5.992, 44.947, 1.9], [3.405, 49.861, 1.79],
  // Big Dipper, Polaris, Little Dipper
  [11.062, 61.751, 1.79], [11.031, 56.383, 2.37], [11.897, 53.695, 2.44], [12.257, 57.033, 3.31],
  [12.9, 55.96, 1.77], [13.399, 54.925, 2.23], [13.792, 49.313, 1.86], [2.53, 89.264, 1.98],
  [14.845, 74.156, 2.08], [15.345, 71.834, 3.05],
  // Cassiopeia
  [0.675, 56.537, 2.24], [0.153, 59.15, 2.28], [0.945, 60.717, 2.47], [1.43, 60.235, 2.68], [1.907, 63.67, 3.37],
  // Pegasus, Andromeda, Perseus, Aries
  [0.14, 29.091, 2.06], [23.079, 15.205, 2.49], [23.063, 28.083, 2.42], [0.221, 15.184, 2.83],
  [1.162, 35.621, 2.05], [2.065, 42.33, 2.1], [3.136, 40.956, 2.1], [2.12, 23.462, 2.0],
  // Cygnus, Lyra, Aquila, Hercules, Corona, Ophiuchus
  [20.37, 40.257, 2.23], [20.77, 33.97, 2.48], [19.75, 45.131, 2.87], [19.512, 27.96, 3.08],
  [18.983, 32.69, 3.24], [18.835, 33.363, 3.52], [19.771, 10.613, 2.72], [19.425, 3.115, 3.36],
  [15.578, 26.715, 2.23], [17.582, 12.56, 2.08], [16.504, 21.49, 2.78], [17.244, 14.39, 3.1],
  // Scorpius, Sagittarius
  [17.56, -37.104, 1.62], [16.006, -22.622, 2.32], [16.091, -19.806, 2.62], [17.622, -42.998, 1.86],
  [18.921, -26.297, 2.05], [18.403, -34.385, 1.85], [18.35, -29.828, 2.7], [18.466, -25.422, 2.81],
  // Leo, Virgo, Boötes, Hydra, Cetus, Taurus
  [11.818, 14.572, 2.14], [10.333, 19.842, 2.08], [11.235, 20.524, 2.56], [9.46, -8.659, 1.98],
  [12.694, -1.449, 2.74], [14.75, 27.074, 2.37], [0.727, -17.987, 2.04], [3.038, 4.09, 2.54],
  [5.627, 21.143, 3.0], [4.477, 15.871, 3.4],
  // Pleiades
  [3.791, 24.105, 2.87], [3.819, 24.053, 3.62], [3.747, 24.113, 3.7], [3.763, 24.368, 3.87],
  [3.772, 23.948, 4.18], [3.753, 24.467, 4.3], [3.819, 24.137, 5.05],
];

/** Weather on the sky: clouds, haze, storm darkness and lightning (all 0 … 1 but the offsets). */
export interface SkyFx {
  cloud: number;
  cloudOffset: THREE.Vector2; // cloud field drift, in cloud-heights (moves with the wind)
  cloudMorph: number; // slow change of the cloud shapes
  storm: number;
  flash: number;
  haze: number;
}
export const NO_FX: SkyFx = { cloud: 0, cloudOffset: new THREE.Vector2(), cloudMorph: 0, storm: 0, flash: 0, haze: 0 };

/** Cloud layer: a noise field on a plane above, seen through direction d. Shared by dome and stars. */
const CLOUD_GLSL = /* glsl */ `
  uniform float cloudCover, cloudMorph;
  uniform vec2 cloudOffset;
  float cHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float cNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cHash(i), cHash(i + vec3(1,0,0)), f.x), mix(cHash(i + vec3(0,1,0)), cHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(cHash(i + vec3(0,0,1)), cHash(i + vec3(1,0,1)), f.x), mix(cHash(i + vec3(0,1,1)), cHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float cFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * cNoise(p); p *= 2.03; a *= 0.5; } return s; }
  float cloudAt(vec3 d) {
    if (cloudCover < 0.01 || d.y <= 0.0) return 0.0;
    vec2 p = d.xz / (d.y + 0.22) * 1.3 + cloudOffset;
    float n = cFbm(vec3(p, cloudMorph));
    float th = mix(0.8, 0.12, cloudCover);
    return smoothstep(th - 0.04, th + 0.14, n) * smoothstep(0.0, 0.035, d.y);
  }
`;

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
  private readonly skyRot = new THREE.Matrix3(); // world → equatorial

  constructor() {
    this.group.name = 'sky';
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3() }, moonDir: { value: new THREE.Vector3() },
        night: { value: 1 }, twilight: { value: 0 }, day: { value: 0 },
        time: { value: 0 }, skyRot: { value: this.skyRot }, fogColor: { value: new THREE.Color() },
        galPole: { value: GAL_POLE }, galCenter: { value: GAL_CENTER },
        andromeda: { value: ANDROMEDA }, orionNebula: { value: ORION_NEBULA },
        cloudCover: { value: 0 }, cloudOffset: { value: new THREE.Vector2() }, cloudMorph: { value: 0 },
        storm: { value: 0 }, flash: { value: 0 }, haze: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, moonDir, fogColor, galPole, galCenter, andromeda, orionNebula;
        uniform float night, twilight, day, time, storm, flash, haze;
        uniform mat3 skyRot;
        varying vec3 vDir;
        ${CLOUD_GLSL}

        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }

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
          // Base gradient: night, twilight, day (a bright synthwave day, still violet).
          vec3 nightZ = vec3(0.012, 0.008, 0.04), nightH = vec3(0.09, 0.035, 0.22);
          vec3 dawnZ = vec3(0.06, 0.07, 0.26), dawnH = vec3(0.95, 0.33, 0.42);
          vec3 dayZ = vec3(0.07, 0.09, 0.42), dayH = vec3(0.6, 0.32, 0.72);
          vec3 zen = mix(mix(nightZ, dayZ, day), dawnZ, twilight * (1.0 - day) * 0.85);
          vec3 hor = mix(mix(nightH, dayH, day), dawnH, twilight * 0.75);
          vec3 c = mix(hor, zen, smoothstep(0.0, 0.55, y));
          // Warm glow toward the sun's side of the horizon (strongest at sunrise and sunset).
          float toward = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-5)), 0.0);
          float glow = exp(-max(y, 0.0) * 7.0) * pow(toward, 2.5) * (0.12 + 0.88 * twilight) * smoothstep(-0.35, -0.05, sunDir.y);
          c += vec3(1.0, 0.45, 0.25) * glow * 0.9;

          // Milky Way along the real galactic plane: brighter and warmer toward the centre in
          // Sagittarius, with a dark dust lane down the middle.
          vec3 s = skyRot * d;
          float gl = dot(s, galPole);
          float core = pow(max(dot(s, galCenter), 0.0), 4.0);
          float band = exp(-gl * gl / (0.012 + 0.03 * core));
          float clouds = fbm(s * 7.0) * 0.75 + fbm(s * 23.0) * 0.4;
          float dust = 1.0 - 0.75 * exp(-pow(gl + 0.012 * (fbm(s * 11.0) - 0.5), 2.0) / 0.0009) * (0.4 + core);
          float stars = night * smoothstep(0.0, 0.2, y);
          float mw = band * clouds * dust * (0.55 + 1.6 * core) * stars;
          c += mix(vec3(0.32, 0.3, 0.7), vec3(0.95, 0.66, 0.6), core) * mw * 0.5;
          // Andromeda: a small tilted oval of light. Orion Nebula: a pink smudge under the belt.
          vec3 ar = normalize(cross(galPole, andromeda)), au = cross(andromeda, ar);
          vec3 q = s - andromeda;
          float e = pow(dot(q, ar) / 0.05, 2.0) + pow(dot(q, au) / 0.014, 2.0);
          c += vec3(0.75, 0.7, 1.0) * (exp(-e * 1.5) * 0.45 + exp(-e * 30.0) * 0.6) * (dot(s, andromeda) > 0.0 ? 1.0 : 0.0) * stars;
          float on = length(s - orionNebula);
          c += vec3(1.0, 0.4, 0.7) * exp(-on * on / 0.0002) * 0.35 * stars;

          // Sun: bright disc, corona, and two segmented orbit rings slowly turning.
          float as = acos(clamp(dot(d, sunDir), -1.0, 1.0));
          float vis = smoothstep(-0.02, 0.02, y);
          vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.92, 0.75), smoothstep(0.045, 0.0, as));
          c = mix(c, sunCol, smoothstep(0.046, 0.042, as) * vis);
          c += vec3(1.0, 0.5, 0.3) * exp(-as / 0.07) * 0.55 * vis;
          c += vec3(1.0, 0.6, 0.4) * dashedRing(d, sunDir, 0.085, 0.0025, 24.0, time * 0.01) * 0.55 * vis;
          c += vec3(1.0, 0.4, 0.6) * dashedRing(d, sunDir, 0.125, 0.0018, 40.0, -time * 0.006) * 0.35 * vis;

          // Moon: a sphere lit by the sun, so the phase is the real one; faint earthshine.
          float am = acos(clamp(dot(d, moonDir), -1.0, 1.0));
          float R = 0.032;
          vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir)), mu = cross(moonDir, mr);
          vec2 mq = vec2(dot(d, mr), dot(d, mu)) / R;
          float mz = sqrt(max(0.0, 1.0 - dot(mq, mq)));
          vec3 mn = mr * mq.x + mu * mq.y - moonDir * mz;
          float lit = smoothstep(-0.06, 0.08, dot(mn, sunDir));
          float disc = smoothstep(R, R - 0.003, am);
          float craters = 0.82 + 0.18 * fbm(d * 180.0);
          float mvis = smoothstep(-0.02, 0.02, y) * (1.0 - 0.55 * day);
          vec3 moonCol = vec3(0.86, 0.9, 1.0) * craters * (0.07 + 0.93 * lit);
          c = mix(c, moonCol + c * 0.15, disc * mvis);
          float full = clamp(0.5 - 0.5 * dot(sunDir, moonDir), 0.0, 1.0);
          c += vec3(0.55, 0.6, 1.0) * exp(-am / 0.06) * (0.08 + 0.2 * full) * mvis;
          c += vec3(0.6, 0.7, 1.0) * dashedRing(d, moonDir, 0.075, 0.0015, 1.0, 0.0) * 0.18 * mvis;

          // Clouds over everything above: lit by the sun by day, pink at sunset, moonlit at night,
          // darker the thicker and stormier they are; a bright rim near the sun and the moon.
          float cd = cloudAt(d);
          if (cd > 0.0) {
            // Bright tops, shaded violet bellies where the cloud is thick.
            vec3 lightC = mix(vec3(0.09, 0.065, 0.17), vec3(0.98, 0.93, 1.0), day);
            vec3 shadeC = mix(vec3(0.03, 0.02, 0.07), vec3(0.5, 0.4, 0.66), day);
            vec3 cc = mix(lightC, shadeC, smoothstep(0.3, 1.0, cd) * 0.8);
            cc = mix(cc, vec3(0.98, 0.5, 0.52), twilight * (1.0 - day) * 0.75);
            cc += vec3(0.2, 0.22, 0.4) * smoothstep(-0.05, 0.2, moonDir.y) * full * night * 0.6;
            cc *= 1.0 - 0.6 * storm - 0.3 * cd * cloudCover;
            float rim = exp(-as / 0.22) * vis * (1.0 - cd) * 2.0 + exp(-am / 0.12) * mvis * full * (1.0 - cd) * 0.8;
            cc += mix(vec3(0.6, 0.65, 1.0), vec3(1.0, 0.75, 0.55), vis) * rim;
            c = mix(c, cc, cd * 0.94);
          }
          // Overcast also greys the open sky; lightning lights up the clouds.
          c = mix(c, c * vec3(0.75, 0.72, 0.8) + vec3(0.04, 0.035, 0.06) * day, cloudCover * 0.5);
          c += vec3(0.75, 0.78, 1.0) * flash * (0.25 + 0.75 * cd) * smoothstep(-0.05, 0.1, y);
          // Haze and fog: the horizon first, the whole sky when it is thick.
          c = mix(c, fogColor, haze * (1.0 - smoothstep(0.0, 0.5, y)) + haze * haze * 0.6 * smoothstep(0.0, 0.5, y));

          // Below eye level: fade into the fog so far ridges melt into the haze.
          if (y < 0.0) c = mix(mix(hor, fogColor, 0.4), fogColor, smoothstep(0.0, -0.3, y));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -3;

    // Stars, in equatorial coordinates (the pivot turns them with sidereal time): the bright
    // catalogue stars, then faint ones, a third of them crowding the Milky Way.
    const FAINT = 3600;
    const N = BRIGHT.length + FAINT;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const tint = [new THREE.Color(0xcfdcff), new THREE.Color(0xffffff), new THREE.Color(0xffe2c2), new THREE.Color(0xffc6e8)];
    const gx = GAL_CENTER.clone().addScaledVector(GAL_POLE, -GAL_CENTER.dot(GAL_POLE)).normalize();
    const gy = GAL_POLE.clone().cross(gx);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      if (i < BRIGHT.length) {
        const [ra, dec, mag] = BRIGHT[i];
        v.copy(eq(ra, dec));
        size[i] = THREE.MathUtils.clamp(5.6 - mag * 1.05, 1.6, 7.2);
      } else if (rnd() < 0.36) {
        const l = gauss() * 1.3, b = gauss() * 0.09;
        v.copy(gx).multiplyScalar(Math.cos(l) * Math.cos(b)).addScaledVector(gy, Math.sin(l) * Math.cos(b)).addScaledVector(GAL_POLE, Math.sin(b));
        size[i] = 0.6 + Math.pow(rnd(), 9) * 2.2;
      } else {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        v.set(Math.cos(a) * r, Math.sin(a) * r, u);
        size[i] = 0.7 + Math.pow(rnd(), 7) * 2.6;
      }
      pos.set([v.x, v.y, v.z], i * 3);
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
      uniforms: {
        time: { value: 0 }, pixelRatio: { value: 1 }, night: { value: 1 }, haze: { value: 0 },
        cloudCover: { value: 0 }, cloudOffset: { value: new THREE.Vector2() }, cloudMorph: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float time, pixelRatio, night, haze;
        varying float vAlpha; varying vec3 vColor;
        ${CLOUD_GLSL}
        void main() {
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
          vec3 w = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          float tw = 0.55 + 0.45 * sin(time * (1.1 + fract(phase) * 2.0) + phase * 3.0);
          // Bright stars show first in the dusk and stay longest at dawn.
          float vis = clamp(night * (1.0 + size * 0.25) - size * 0.02, 0.0, 1.0);
          vAlpha = tw * smoothstep(0.0, 0.18, w.y) * vis * (1.0 - cloudAt(w) * 0.97) * (1.0 - haze * 0.8);
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
    this.starPivot.matrixAutoUpdate = false;
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

  /** Per frame. `time` is seconds (twinkle, rings); the sky itself follows `sky` and `tod`. */
  update(camera: THREE.Camera, sky: SkyState, tod: TimeOfDay, fx: SkyFx, time: number, dt: number, pixelRatio: number): void {
    this.group.position.copy(camera.position);
    this.group.scale.setScalar(1000);
    const u = this.dome.material.uniforms;
    u.sunDir.value.copy(tod.sunDir);
    u.moonDir.value.copy(tod.moonDir);
    u.night.value = tod.night;
    u.twilight.value = tod.twilight;
    u.day.value = tod.day;
    u.time.value = time;
    u.fogColor.value.copy(tod.fog);
    u.cloudCover.value = fx.cloud;
    u.cloudOffset.value.copy(fx.cloudOffset);
    u.cloudMorph.value = fx.cloudMorph;
    u.storm.value = fx.storm;
    u.flash.value = fx.flash;
    u.haze.value = fx.haze;

    const m = sky.eqToWorld.elements;
    this.starPivot.matrix.set(m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, 0, 0, 0, 1);
    this.starPivot.matrixWorldNeedsUpdate = true;
    this.skyRot.copy(sky.eqToWorld).transpose();
    const su = this.stars.material.uniforms;
    su.time.value = time;
    su.pixelRatio.value = pixelRatio;
    su.night.value = tod.night;
    su.haze.value = fx.haze;
    su.cloudCover.value = fx.cloud;
    su.cloudOffset.value.copy(fx.cloudOffset);
    su.cloudMorph.value = fx.cloudMorph;

    this.updateMeteor(dt, fx.cloud > 0.6 || fx.haze > 0.5 ? 0 : tod.night);
  }

  private updateMeteor(dt: number, night: number): void {
    if (this.meteorT < 0) {
      this.nextMeteor -= dt;
      if (this.nextMeteor > 0 || night < 0.5) return;
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
