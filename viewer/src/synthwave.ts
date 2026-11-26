import * as THREE from 'three';

/**
 * The "digital" look: synthwave night over the real terrain.
 * Same tile meshes as the satellite look; only the material, sky and fog change.
 */

export const SYNTH = {
  low: new THREE.Color(0x1a0b3d), // valleys
  mid: new THREE.Color(0x2e1764), // slopes
  high: new THREE.Color(0x55308f), // high ground
  snow: new THREE.Color(0xd9d6ff), // glaciers (from the satellite photo)
  rim: new THREE.Color(0xff4fa3),
  contour: new THREE.Color(0xff7a3d), // dawn orange (the 250-stories palette)
  contourMajor: new THREE.Color(0xffb08a),
  grid: new THREE.Color(0x36c5ff),
  fog: new THREE.Color(0x4a1a5e), // far haze: matches the sky just below the horizon
  zenith: new THREE.Color(0x05030f),
  skyMid: new THREE.Color(0x1c0b40),
  horizon: new THREE.Color(0xff4f8b),
  sunTop: new THREE.Color(0xffd36b),
  sunBottom: new THREE.Color(0xff3f8e),
};

/** Direction toward the synthwave sun: low over the north-north-east ridge, behind the summit as you climb. */
export const SUN_DIR = new THREE.Vector3(
  Math.sin(THREE.MathUtils.degToRad(25)) * Math.cos(THREE.MathUtils.degToRad(2)),
  Math.sin(THREE.MathUtils.degToRad(2)),
  -Math.cos(THREE.MathUtils.degToRad(25)) * Math.cos(THREE.MathUtils.degToRad(2)),
).normalize();

/** Radius of the round world (m): the land fades out from 60% of it and ends at it. */
export const WORLD_RADIUS = 30000;

export const TRAIL_POINTS = 64;
export const MAX_STONES = 16;

/** Uniforms shared by every terrain tile (by reference). */
const shared = {
  lightDir: { value: new THREE.Vector3(0.35, 0.55, -0.75).normalize() },
  lightColor: { value: new THREE.Color(0xffffff) },
  ambient: { value: 0.25 },
  // Round world: beyond this distance from the centre the land is cut; it sinks and fades into the
  // haze before that, so the edge is never seen.
  worldRadius: { value: WORLD_RADIUS },
  time: { value: 0 },
  // The trail near the climber, painted into the ground: xy = scene x/z, z = walked (1) or ahead (0), w = distance along.
  trail: { value: Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector4()) },
  trailN: { value: 0 },
  trailCenter: { value: new THREE.Vector2() },
  trailRadius: { value: 0 },
  // Story stones near the camera: xy = scene x/z, z = state (0 open, 1 last, 2 next, 3 closed), w = reached.
  stones: { value: Array.from({ length: MAX_STONES }, () => new THREE.Vector4()) },
  stoneN: { value: 0 },
  // Arrival shockwave: x, z, start time, state.
  arrive: { value: new THREE.Vector4(0, 0, -100, 0) },
};

const STATE_CODE = { open: 0, last: 1, next: 2, closed: 3 } as const;

/** Stones whose rune circles to paint on the ground (up to MAX_STONES). */
export function setTerrainStones(list: { x: number; z: number; state: keyof typeof STATE_CODE; reached: boolean }[]): void {
  const n = Math.min(list.length, MAX_STONES);
  for (let i = 0; i < n; i++) shared.stones.value[i].set(list[i].x, list[i].z, STATE_CODE[list[i].state], list[i].reached ? 1 : 0);
  shared.stoneN.value = n;
}

/** Start an arrival shockwave on the ground at x/z. */
export function setTerrainArrival(x: number, z: number, time: number, state: keyof typeof STATE_CODE): void {
  shared.arrive.value.set(x, z, time, STATE_CODE[state]);
}

/** Light on the terrain (direction, colour, ambient level). */
export function setTerrainLighting(dir: THREE.Vector3, color: THREE.Color, ambient: number): void {
  shared.lightDir.value.copy(dir).normalize();
  shared.lightColor.value.copy(color);
  shared.ambient.value = ambient;
}

export function setTerrainTime(t: number): void {
  shared.time.value = t;
}

/** The trail points to paint near the climber (up to TRAIL_POINTS). */
export function setTerrainTrail(points: { x: number; z: number; walked: boolean; d: number }[]): void {
  const n = Math.min(points.length, TRAIL_POINTS);
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    shared.trail.value[i].set(points[i].x, points[i].z, points[i].walked ? 1 : 0, points[i].d);
    cx += points[i].x;
    cz += points[i].z;
  }
  shared.trailN.value = n;
  if (!n) return;
  cx /= n;
  cz /= n;
  let r = 0;
  for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(points[i].x - cx, points[i].z - cz));
  shared.trailCenter.value.set(cx, cz);
  shared.trailRadius.value = r + 12;
}

/** Terrain material for one tile (the tile's satellite texture is only used as a snow mask). */
export function createTerrainMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        map: { value: map },
        cLow: { value: SYNTH.low }, cMid: { value: SYNTH.mid }, cHigh: { value: SYNTH.high },
        cSnow: { value: SYNTH.snow }, cRim: { value: SYNTH.rim },
        cContour: { value: SYNTH.contour }, cContourMajor: { value: SYNTH.contourMajor }, cGrid: { value: SYNTH.grid },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform sampler2D map;
      uniform float worldRadius;
      varying vec3 vWorld;
      varying vec2 vUv;
      flat varying float vSnow; // one value per triangle: crisp, faceted snow patches
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        // Snow and ice from a blurred mip of the satellite photo (bright only: buildings and gravel stay terrain-coloured).
        vec3 sat = textureLod(map, uv, 4.0).rgb;
        vSnow = smoothstep(0.42, 0.5, dot(sat, vec3(0.299, 0.587, 0.114)));
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // Round world: the land sinks to a low, flat rim toward the edge (no cut ridges against the sky).
        if (worldRadius > 0.0) wp.y = mix(wp.y, 1300.0, smoothstep(worldRadius * 0.62, worldRadius * 0.95, length(wp.xz)));
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 lightDir, lightColor;
      uniform float ambient, time, worldRadius;
      uniform vec4 trail[${TRAIL_POINTS}];
      uniform int trailN;
      uniform vec2 trailCenter;
      uniform float trailRadius;
      uniform vec4 stones[${MAX_STONES}];
      uniform int stoneN;
      uniform vec4 arrive;
      uniform vec3 cLow, cMid, cHigh, cSnow, cRim, cContour, cContourMajor, cGrid;
      varying vec3 vWorld;
      varying vec2 vUv;
      flat varying float vSnow;
      #include <common>
      #include <fog_pars_fragment>

      // Anti-aliased line at every integer of v; fades out once lines get closer than a few pixels.
      float gridLine(float v, float widthPx) {
        float fw = fwidth(v);
        float d = abs(fract(v - 0.5) - 0.5) / max(fw, 1e-5);
        float line = 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, d);
        return line * (1.0 - smoothstep(0.08, 0.25, fw));
      }

      vec3 stateColor(float s) {
        return s < 0.5 ? vec3(1.0, 0.85, 0.66) : s < 1.5 ? vec3(1.0, 0.48, 0.24) : s < 2.5 ? vec3(1.0, 0.31, 0.85) : vec3(0.56, 0.62, 1.0);
      }
      // A thin polygonal ring (low-poly circle) of the given radius, rotated by rot.
      // px: ground size of one pixel (computed once, outside branches: derivatives are only
      // reliable in uniform control flow).
      float polyRing(vec2 q, float sides, float rot, float radius, float width, float px) {
        float a = atan(q.y, q.x) + rot;
        float seg = 6.2832 / sides;
        float r = length(q) * cos(mod(a, seg) - seg * 0.5) / cos(seg * 0.5);
        float w = max(width, px * 1.2);
        return (1.0 - smoothstep(w * 0.5, w * 0.5 + px, abs(r - radius))) * min(1.0, width / w * 1.5);
      }
      float dashes(vec2 q, float count, float rot, float duty) {
        return step(duty, fract((atan(q.y, q.x) + rot) / 6.2832 * count));
      }

      void main() {
        // Flat (faceted) normal from screen-space derivatives: the low-poly look.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        float h = vWorld.y;

        vec3 base = mix(cLow, cMid, smoothstep(2000.0, 3600.0, h));
        base = mix(base, cHigh, smoothstep(3600.0, 5300.0, h));
        base = mix(base, cSnow, vSnow);

        // Strong facet lighting: a low key light plus a magenta fill from the opposite side,
        // so each triangle of the terrain mesh reads as a facet.
        vec3 L = normalize(lightDir);
        float key = max(dot(n, L), 0.0);
        float fill = max(dot(n, normalize(vec3(-L.x, 0.35, -L.z))), 0.0);
        float rim = pow(1.0 - clamp(n.y, 0.0, 1.0), 2.0);
        vec3 col = base * (ambient + 1.15 * key * lightColor) + cRim * (fill * 0.22 + rim * 0.16);

        float minor = gridLine(h / 100.0, 1.0);
        float major = gridLine(h / 500.0, 1.6);
        float gx = gridLine(vWorld.x / 1000.0, 1.0);
        float gz = gridLine(vWorld.z / 1000.0, 1.0);
        col += cContour * minor * 0.28 + cContourMajor * major * 0.55;
        col += cGrid * max(gx, gz) * 0.22;

        // The trail near the climber, painted onto the ground (never floats, never sinks).
        float pxT = length(fwidth(vWorld.xz)) + 1e-4;
        if (trailN > 1 && distance(vWorld.xz, trailCenter) < trailRadius) {
          float best = 1e9, walked = 0.0, along = 0.0;
          for (int i = 0; i < ${TRAIL_POINTS - 1}; i++) {
            if (i >= trailN - 1) break;
            vec2 a = trail[i].xy, b = trail[i + 1].xy, ab = b - a;
            float t = clamp(dot(vWorld.xz - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            float dd = length(vWorld.xz - (a + ab * t));
            if (dd < best) { best = dd; walked = trail[i].z; along = mix(trail[i].w, trail[i + 1].w, t); }
          }
          float hw = max(0.16, pxT * 0.7); // ~0.3 m wide, never thinner than a pixel
          float core = 1.0 - smoothstep(hw, hw + pxT, best);
          float halo = exp(-best * best / 1.2);
          // Ahead: a dashed line that flows uphill. Walked: a steady warm glow.
          float dash = step(0.45, fract(along / 3.5 - time * 0.6));
          vec3 cWalk = vec3(1.0, 0.62, 0.36), cAhead = vec3(1.0, 0.31, 0.85);
          vec3 tc = mix(cAhead, cWalk, walked);
          float on = mix(dash * 0.9 + 0.1, 1.0, walked);
          col = mix(col, tc * 0.8, core * on * 0.8);
          col += tc * halo * 0.06;
        }

        // Rune circles around the story stones: the light show is on the ground.
        float px = length(fwidth(vWorld.xz)) + 1e-4;
        for (int i = 0; i < ${MAX_STONES}; i++) {
          if (i >= stoneN) break;
          vec2 q = vWorld.xz - stones[i].xy;
          float r = length(q);
          if (r > 7.0) continue;
          float reached = stones[i].w;
          float ph = fract(sin(dot(stones[i].xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
          float pulse = mix(0.55 + 0.45 * sin(time * 2.4 + ph), 1.0, reached);
          float g = 0.0;
          g += polyRing(q, 6.0, time * 0.25 + ph, 2.0, 0.12, px);
          g += polyRing(q, 8.0, -time * 0.18, 3.1, 0.09, px) * dashes(q, 16.0, -time * 0.18, 0.3);
          g += polyRing(q, 12.0, time * 0.1, 4.3, 0.07, px) * dashes(q, 36.0, time * 0.1, 0.55) * 0.7;
          float a = atan(q.y, q.x) + time * 0.25 + ph;
          float f = fract(a / 6.2832 * 6.0);
          float sd = min(f, 1.0 - f) * 6.2832 * r / 6.0;
          g += (1.0 - smoothstep(max(0.04, px * 0.6), max(0.04, px * 0.6) + px, sd)) * step(2.1, r) * step(r, 3.0) * 0.8;
          g += exp(-r * r / 2.0) * 0.12;
          // Stones ahead send pulse waves outward to draw you on.
          float wave = fract(time * 0.35 + ph / 6.2832);
          g += (1.0 - reached) * (1.0 - smoothstep(0.0, 0.18, abs(r - wave * 6.5))) * (1.0 - wave) * 0.9;
          col += stateColor(stones[i].z) * g * (1.0 - smoothstep(5.0, 7.0, r)) * pulse * 0.42;
        }

        // Arrival: a shockwave across the ground.
        float at = time - arrive.z;
        if (at > 0.0 && at < 1.6) {
          float r = length(vWorld.xz - arrive.xy);
          col += stateColor(arrive.w) * (1.0 - smoothstep(0.0, 0.5, abs(r - at * 9.0))) * (1.0 - at / 1.6) * 0.9;
        }

        // Round world: cut beyond the radius, fade into the haze before it. fogColor is already in
        // the output colour space, so the fade goes after the conversion (as three's own fog does).
        float edgeFade = 0.0;
        if (worldRadius > 0.0) {
          float rr = length(vWorld.xz);
          if (rr > worldRadius) discard;
          edgeFade = smoothstep(worldRadius * 0.6, worldRadius * 0.86, rr);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edgeFade);
        #endif
        #include <fog_fragment>
      }`,
    fog: true,
  });
  // Shared by reference (merge() clones values).
  Object.assign(mat.uniforms, shared);
  return mat;
}

/** Shared uniforms (light direction) for all digital tiles. */
export function setTerrainLight(dir: THREE.Vector3): void {
  shared.lightDir.value.copy(dir).normalize();
}

/**
 * Night sky: gradient dome with a striped synthwave sun and a horizon glow, plus a star field.
 * Both live at the far plane and follow the camera.
 */
export function createNightSky(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'night-sky';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: SYNTH.zenith }, mid: { value: SYNTH.skyMid }, horizon: { value: SYNTH.horizon },
        sunTop: { value: SYNTH.sunTop }, sunBottom: { value: SYNTH.sunBottom },
        sunDir: { value: SUN_DIR }, fogColor: { value: SYNTH.fog },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith, mid, horizon, sunTop, sunBottom, sunDir, fogColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = mix(mid, zenith, smoothstep(0.08, 0.7, y));
          // Horizon glow, stronger toward the sun.
          float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
          float glow = exp(-max(y, 0.0) * 9.0) * (0.45 + 0.55 * pow(toward, 3.0));
          c = mix(c, horizon, clamp(glow, 0.0, 1.0));
          // Below eye level (seen from high up): a haze that fades into the fog colour, so the
          // distant ridges melt into the glow instead of meeting a dark band.
          if (y < 0.0) c = mix(mix(horizon, fogColor, 0.35), fogColor, smoothstep(0.0, -0.3, y));

          // Synthwave sun: a disc with horizontal gaps cut into its lower half.
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), sunDir));
          vec3 up = cross(sunDir, right);
          vec2 q = vec2(dot(d, right), dot(d, up)) / 0.085; // disc radius ≈ 5°
          float r = length(q);
          if (dot(d, sunDir) > 0.0 && r < 1.0) {
            float stripes = 1.0;
            if (q.y < 0.15) {
              float band = fract((q.y + 1.0) * 6.0);
              float gap = mix(0.05, 0.45, smoothstep(0.15, -1.0, q.y));
              stripes = step(gap, band);
            }
            vec3 sun = mix(sunBottom, sunTop, smoothstep(-0.9, 0.9, q.y));
            c = mix(c, sun, stripes * smoothstep(1.0, 0.97, r));
          }
          c += horizon * 0.25 * exp(-r * 1.2) * step(0.0, dot(d, sunDir));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -2;
  group.add(dome);

  // Stars: fixed random directions on the upper hemisphere, at the far plane.
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const y = 0.04 + Math.pow(rand(), 0.8) * 0.96;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    size[i] = 0.8 + Math.pow(rand(), 6) * 2.6;
    phase[i] = rand() * 6.283;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float phase;
      uniform float time;
      uniform float pixelRatio;
      varying float vAlpha;
      void main() {
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
        vAlpha = (0.55 + 0.45 * sin(time * 1.3 + phase)) * smoothstep(0.04, 0.2, position.y);
        gl_PointSize = size * pixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.95, 1.0), a);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  stars.name = 'stars';
  group.add(stars);
  return group;
}

export function updateNightSky(sky: THREE.Group, camera: THREE.Camera, time: number, pixelRatio: number): void {
  sky.position.copy(camera.position);
  sky.scale.setScalar(1000);
  const stars = sky.getObjectByName('stars') as THREE.Points;
  const m = stars.material as THREE.ShaderMaterial;
  m.uniforms.time.value = time;
  m.uniforms.pixelRatio.value = pixelRatio;
}

/**
 * Digital look for the land around the block (horizon.ts): the same palette, facets, contour lines
 * and light as the terrain tiles, with snow by height (there is no satellite photo out there).
 */
export function createApronMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        cLow: { value: SYNTH.low }, cMid: { value: SYNTH.mid }, cHigh: { value: SYNTH.high },
        cSnow: { value: SYNTH.snow }, cRim: { value: SYNTH.rim },
        cContour: { value: SYNTH.contour }, cContourMajor: { value: SYNTH.contourMajor }, cGrid: { value: SYNTH.grid },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float realH; // height before the earth-curvature drop (for colours and contours)
      uniform float worldRadius;
      varying vec3 vWorld;
      varying float vH;
      flat varying float vSnow;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // Round world: the land sinks to a low, flat rim toward the edge (no cut ridges against the sky).
        if (worldRadius > 0.0) wp.y = mix(wp.y, 1300.0, smoothstep(worldRadius * 0.62, worldRadius * 0.95, length(wp.xz)));
        vWorld = wp.xyz;
        vH = realH;
        float jitter = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vSnow = smoothstep(3250.0, 3700.0, realH + jitter * 350.0);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 lightDir, lightColor;
      uniform float ambient, worldRadius;
      uniform vec3 cLow, cMid, cHigh, cSnow, cRim, cContour, cContourMajor, cGrid;
      varying vec3 vWorld;
      varying float vH;
      flat varying float vSnow;
      #include <common>
      #include <fog_pars_fragment>
      float gridLine(float v, float widthPx) {
        float fw = fwidth(v);
        float d = abs(fract(v - 0.5) - 0.5) / max(fw, 1e-5);
        float line = 1.0 - smoothstep(widthPx * 0.5, widthPx * 0.5 + 1.0, d);
        return line * (1.0 - smoothstep(0.08, 0.25, fw));
      }
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        float h = vH;
        vec3 base = mix(cLow, cMid, smoothstep(2000.0, 3600.0, h));
        base = mix(base, cHigh, smoothstep(3600.0, 5300.0, h));
        base = mix(base, cSnow, vSnow * 0.85);
        vec3 L = normalize(lightDir);
        float key = max(dot(n, L), 0.0);
        float fill = max(dot(n, normalize(vec3(-L.x, 0.35, -L.z))), 0.0);
        float rim = pow(1.0 - clamp(n.y, 0.0, 1.0), 2.0);
        vec3 col = base * (ambient + 1.15 * key * lightColor) + cRim * (fill * 0.22 + rim * 0.16);
        col += cContour * gridLine(h / 100.0, 1.0) * 0.22 + cContourMajor * gridLine(h / 500.0, 1.4) * 0.45;
        col += cGrid * max(gridLine(vWorld.x / 1000.0, 1.0), gridLine(vWorld.z / 1000.0, 1.0)) * 0.18;
        // Round world: cut beyond the radius, fade into the haze before it. fogColor is already in
        // the output colour space, so the fade goes after the conversion (as three's own fog does).
        float edgeFade = 0.0;
        if (worldRadius > 0.0) {
          float rr = length(vWorld.xz);
          if (rr > worldRadius) discard;
          edgeFade = smoothstep(worldRadius * 0.6, worldRadius * 0.86, rr);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edgeFade);
        #endif
        #include <fog_fragment>
      }`,
    fog: true,
  });
  Object.assign(mat.uniforms, { lightDir: shared.lightDir, lightColor: shared.lightColor, ambient: shared.ambient, worldRadius: shared.worldRadius });
  return mat;
}

/**
 * The round world for a built-in material (the satellite look): the same sinking rim, fade into
 * the haze and cut as the digital shaders, patched into three's Lambert shader.
 */
export function roundWorld<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.worldRadius = shared.worldRadius;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float worldRadius;\nvarying float vRwR;\nvoid main() {')
      .replace('#include <project_vertex>', `
        vec4 rwWorld = modelMatrix * vec4(transformed, 1.0);
        vRwR = length(rwWorld.xz);
        rwWorld.y = mix(rwWorld.y, 1300.0, smoothstep(worldRadius * 0.62, worldRadius * 0.95, vRwR));
        vec4 mvPosition = viewMatrix * rwWorld;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float worldRadius;\nvarying float vRwR;\nvoid main() {\n  if (vRwR > worldRadius) discard;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(worldRadius * 0.6, worldRadius * 0.86, vRwR));
        #endif`);
  };
  return mat;
}
