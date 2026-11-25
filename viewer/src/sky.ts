import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color(0x3f78c0),
  horizon: new THREE.Color(0xc9d9e8),
  ground: new THREE.Color(0xb7c4cf),
};

/** Gradient sky dome that follows the camera. Its horizon colour matches the fog. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      ground: { value: SKY.ground },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = y > 0.0
          ? mix(horizon, zenith, pow(smoothstep(0.0, 0.6, y), 0.7))
          : mix(horizon, ground, smoothstep(0.0, -0.2, y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
