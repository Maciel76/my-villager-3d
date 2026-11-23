import * as THREE from "three";
import { nebulaNoiseGLSL } from "./ceu-nebuloso.js";
import { gargantuaCoordinatesGLSL, GARGANTUA_ANGULAR_RADIUS } from "./gargantua.js";

const skyPosition = `
vec4 atSkyDepth(vec3 point) {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  clip.z = clip.w;
  return clip;
}
`;

const planetVertex = `
varying vec3 surface;
varying vec3 viewRay;
${skyPosition}
void main() {
  surface = normal;
  viewRay = -(modelMatrix * vec4(position, 1.0)).xyz + cameraPosition;
  gl_Position = atSkyDepth(position);
}
`;

const planetFragment = `
uniform vec3 rockColor, highlands, rimColor, lightDirection;
uniform float atmosphere, surfaceSeed, surfaceSpin, skyExposure;
varying vec3 surface;
varying vec3 viewRay;
${nebulaNoiseGLSL}
void main() {
  vec3 n = normalize(surface);
  vec3 view = normalize(viewRay);
  float c = cos(surfaceSpin), s = sin(surfaceSpin);
  vec3 p = vec3(c*n.x - s*n.z, n.y, s*n.x + c*n.z);
  vec3 offset = vec3(surfaceSeed, surfaceSeed * .79, 3.0);
  float tectonics = gasNoise(p * 3.8 + offset);
  float mountains = gasNoise(p * 14.5 + tectonics * 2.7 + offset);
  float grit = gasNoise(p * 51.0 + offset);
  float rock = smoothstep(.35, .70, tectonics * .63 + mountains * .29 + grit * .08);
  float bands = sin(p.y * 39.0 + tectonics * 6.0 + mountains * 1.4);
  vec3 albedo = mix(rockColor, highlands, rock) * (.66 + .33 * mountains + .14 * grit);
  albedo += rimColor * atmosphere * (.06 + .16 * smoothstep(.2, .98, bands));
  float sun = dot(n, lightDirection);
  float lit = smoothstep(-.24, .78, sun);
  float limb = pow(1.0 - max(0.0, dot(n,view)), 3.8);
  vec3 flare = mix(rimColor, vec3(1.0,.67,.40), .56);
  vec3 shade = albedo * (.055 + .83 * lit) + rimColor * .035;
  shade += flare * limb * (.04 + .53 * smoothstep(-.30,.7,sun)) * (.45 + atmosphere);
  gl_FragColor = vec4(shade * skyExposure, 1.0);
  #include <colorspace_fragment>
}
`;

const orbitGLSL = `
${gargantuaCoordinatesGLSL}
${skyPosition}
uniform float skyExposure;
attribute vec4 orbit;
attribute vec2 detail;

vec3 orbitPosition(float age, out float farSide) {
  float angle = orbit.y + gargantuaOrbit * orbit.z - age * orbit.z * .27;
  float sinus = sin(angle);
  farSide = sinus;
  vec2 radial = vec2(orbit.x * cos(angle), -.12 + (orbit.x * .165 + orbit.w) * sinus);
  vec3 point = vec3(radial * (gargantuaSize() * 6.0), 6.0 + orbit.x * .42 * sinus);
  return gargantuaFrame() * (point * (68.0 / 6.0));
}

float orbitVisibility(vec3 point, float farSide) {
  float projected = dot(normalize(point), gargantuaDirection);
  float horizon = inversesqrt(1.0 + gargantuaSize() * gargantuaSize() * .96);
  return 1.0 - smoothstep(horizon - .0006, horizon + .0006, projected) * smoothstep(-.03,.09,farSide);
}
`;

// The four angular envelopes leave the horizon clear as the bodies move in depth.
const bodies = [
  { name: "Planeta violeta", offset: [-2.35, .94], radius: .43, distance: 78, orbit: .18, rate: .074, phase: .4,
    colors: ["#28365b", "#6e72bc", "#798dff"], atmosphere: .72 },
  { name: "Planeta de cobre", offset: [2.26, .97], radius: .245, distance: 67, orbit: .15, rate: .10, phase: 1.2,
    colors: ["#4d2632", "#9b644e", "#c68762"], atmosphere: .12 },
  { name: "Lua azul distante", offset: [-1.79, 1.70], radius: .105, distance: 94, orbit: .12, rate: .083, phase: 2.8,
    colors: ["#273f5c", "#678bb4", "#a4b2ec"], atmosphere: .24 },
  { name: "Satélite rochoso", offset: [-1.55, -.99], radius: .125, distance: 88, orbit: .15, rate: .11, phase: 4.2,
    colors: ["#353043", "#877898", "#ad98c4"], atmosphere: .07 },
];

function spaceMaterial(uniforms, vertexShader, fragmentShader, options = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, toneMapped: false,
    depthTest: true, depthWrite: false, ...options,
  });
}

function makePlanets(group, uniforms) {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  return bodies.map((body, index) => {
    const [rockColor, highlands, rimColor] = body.colors.map(color => ({ value: new THREE.Color(color) }));
    const planet = new THREE.Mesh(geometry, spaceMaterial({
      rockColor, highlands, rimColor, atmosphere: { value: body.atmosphere },
      surfaceSeed: { value: 13.27 + index * 17.0 }, surfaceSpin: { value: 0 },
      lightDirection: { value: new THREE.Vector3() },
      skyExposure: uniforms.skyExposure, nebulaNoise: uniforms.nebulaNoise,
    }, planetVertex, planetFragment));
    planet.name = body.name;
    planet.frustumCulled = false;
    planet.renderOrder = 1001;
    group.add(planet);
    return { planet, body };
  });
}

function seededRandom() {
  let state = 47598312;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleOrbit(random) {
  const radius = 1.22 + random() ** .8 * 2.85;
  return [radius, random() * Math.PI * 2, 8.6 / radius ** 1.36, (random() - .5) * .16];
}

function makeDebris(group, uniforms, random) {
  const count = 220;
  const shape = new THREE.IcosahedronGeometry(1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", shape.getAttribute("position"));
  geometry.setAttribute("normal", shape.getAttribute("normal"));
  const orbits = new Float32Array(count * 4);
  const details = new Float32Array(count * 2);
  for (let index = 0; index < count; index++) {
    orbits.set(sampleOrbit(random), index * 4);
    details.set([.028 + random() ** 3 * .20, random()], index * 2);
  }
  geometry.setAttribute("orbit", new THREE.InstancedBufferAttribute(orbits, 4));
  geometry.setAttribute("detail", new THREE.InstancedBufferAttribute(details, 2));
  geometry.instanceCount = count;
  const asteroids = new THREE.Mesh(geometry, spaceMaterial(uniforms, `
    ${orbitGLSL}
    varying vec3 face, incoming;
    varying float visible, kind;
    void main() {
      float farSide;
      vec3 center = orbitPosition(0.0, farSide);
      float angle = detail.y * 12.0 + gargantuaOrbit * 2.1;
      float c = cos(angle), s = sin(angle);
      mat3 spin = mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c);
      vec3 point = center + spin * (position * vec3(1.0,.66,.82)) * detail.x * gargantuaReveal;
      face = spin * normal;
      incoming = normalize(gargantuaDirection * 68.0 - center);
      visible = orbitVisibility(center, farSide);
      kind = detail.y;
      gl_Position = atSkyDepth(point);
    }
  `, `
    varying vec3 face, incoming;
    varying float visible, kind;
    uniform float skyExposure;
    void main() {
      if (visible < .45) discard;
      float lit = max(0.0, dot(normalize(face), normalize(incoming)));
      vec3 color = mix(vec3(.021,.012,.020), vec3(.32,.112,.068), lit * (.40 + .60*kind));
      gl_FragColor = vec4(color * skyExposure, 1.0);
      #include <colorspace_fragment>
    }
  `));
  asteroids.name = "Fragmentos orbitais";
  asteroids.frustumCulled = false;
  asteroids.renderOrder = 1002;
  group.add(asteroids);
}

function makePlasma(group, uniforms, random) {
  const count = 132;
  const segments = 7;
  const orbits = [];
  const details = [];
  const trails = [];
  const trailDetails = [];
  for (let index = 0; index < count; index++) {
    const orbit = sampleOrbit(random);
    const brightness = .3 + random() ** 2 * .7;
    orbits.push(...orbit);
    details.push(brightness, 0);
    for (let segment = 0; segment < segments; segment++) {
      trails.push(...orbit, ...orbit);
      trailDetails.push(brightness, segment / segments, brightness, (segment + 1) / segments);
    }
  }

  const fragment = (points) => `
    varying float flux;
    void main() {
      float profile = ${points ? 'exp(-dot(gl_PointCoord - .5, gl_PointCoord - .5) * 14.0)' : '1.0'};
      gl_FragColor = vec4(vec3(1.0,.50,.29) * flux * profile, 1.0);
      #include <colorspace_fragment>
    }
  `;
  function orbitGeometry(parameters, properties) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(parameters.length / 4 * 3), 3));
    geometry.setAttribute("orbit", new THREE.Float32BufferAttribute(parameters, 4));
    geometry.setAttribute("detail", new THREE.Float32BufferAttribute(properties, 2));
    return geometry;
  }
  function material(points) {
    return spaceMaterial(uniforms, `
      ${orbitGLSL}
      varying float flux;
      void main() {
        float farSide;
        vec3 point = orbitPosition(detail.y, farSide);
        float pulse = .70 + .30 * sin(gargantuaOrbit * 8.0 + orbit.y * 5.0);
        float fade = 1.0 - detail.y;
        flux = gargantuaReveal * skyExposure * orbitVisibility(point, farSide)
          * detail.x * fade * fade * pulse * ${points ? '.53' : '.12'};
        gl_Position = atSkyDepth(point);
        ${points ? 'gl_PointSize = 1.5 + 2.5 * detail.x;' : ''}
      }
    `, fragment(points), { blending: THREE.AdditiveBlending, premultipliedAlpha: true });
  }
  const ribbon = new THREE.LineSegments(orbitGeometry(trails, trailDetails), material(false));
  ribbon.name = "Rastros de plasma";
  const sparks = new THREE.Points(orbitGeometry(orbits, details), material(true));
  sparks.name = "Faíscas orbitais";
  for (const object of [ribbon, sparks]) {
    object.frustumCulled = false;
    object.renderOrder = 1003;
    group.add(object);
  }
}

export function createGargantuaBodies(sky, uniforms) {
  const group = new THREE.Group();
  group.name = "Corpos celestes de Gargântua";
  group.visible = false;
  sky.add(group);
  const planets = makePlanets(group, uniforms);
  const random = seededRandom();
  makeDebris(group, uniforms, random);
  makePlasma(group, uniforms, random);

  const axis = uniforms.gargantuaDirection.value;
  const right = new THREE.Vector3().crossVectors(axis, sky.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, axis);
  const core = axis.clone().multiplyScalar(84);
  return (seconds, reveal) => {
    group.visible = reveal > .008;
    if (!group.visible) return;
    for (const { body, planet } of planets) {
      const orbit = body.phase + seconds * body.rate;
      const depth = body.distance + body.orbit * Math.sin(orbit) * 9;
      const scale = depth * GARGANTUA_ANGULAR_RADIUS;
      const x = body.offset[0] + Math.cos(orbit) * body.orbit;
      const y = body.offset[1] + Math.sin(orbit) * body.orbit * .59;
      planet.position.copy(axis).multiplyScalar(depth).addScaledVector(right, x * scale).addScaledVector(up, y * scale);
      // The geometry emerges from the gas without adding a transparent sky layer over windows.
      planet.scale.setScalar(body.radius * scale * Math.sqrt(reveal));
      planet.material.uniforms.surfaceSpin.value = orbit * 1.7;
      planet.material.uniforms.lightDirection.value.copy(core).sub(planet.position).normalize();
    }
  };
}
