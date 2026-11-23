import { createTimeline } from "animejs/timeline";

export const GARGANTUA_CYCLE_SECONDS = 96;
export const GARGANTUA_ANGULAR_RADIUS = .166;
const turn = Math.PI * 2;

export function createGargantuaMotion() {
  const state = { orbit: 0, glow: 1 };
  const timeline = createTimeline({ autoplay: false });
  const pulseDuration = GARGANTUA_CYCLE_SECONDS * 250;
  timeline.add(state, { orbit: { to: turn, duration: GARGANTUA_CYCLE_SECONDS * 1000, ease: "linear" } }, 0);
  timeline.add(state, { glow: [
    { to: 1.09, duration: pulseDuration }, { to: .98, duration: pulseDuration },
    { to: 1.06, duration: pulseDuration }, { to: 1, duration: pulseDuration },
  ], ease: "inOutSine" }, 0);
  const sample = { orbit: 0, glow: 1 };
  return seconds => {
    timeline.seek((seconds % GARGANTUA_CYCLE_SECONDS) * 1000, true);
    // Keep the phase continuous even for layers with different orbital periods.
    sample.orbit = Math.floor(seconds / GARGANTUA_CYCLE_SECONDS) * turn + state.orbit;
    sample.glow = state.glow;
    return sample;
  };
}

export const gargantuaCoordinatesGLSL = `
uniform vec3 gargantuaDirection;
uniform float gargantuaReveal, gargantuaOrbit, gargantuaGlow;

float gargantuaSize() {
  return mix(.105, ${GARGANTUA_ANGULAR_RADIUS}, gargantuaReveal);
}

mat3 gargantuaFrame() {
  vec3 right = normalize(cross(gargantuaDirection, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, gargantuaDirection);
  return mat3(.978 * right + .208 * up, -.208 * right + .978 * up, gargantuaDirection);
}
`;

export const gargantuaRadianceGLSL = `
const vec3 moltenGold = vec3(1.0, .64, .30);
const vec3 plasmaEmber = vec3(1.0, .30, .12);
const vec3 whiteHotPlasma = vec3(1.0, .945, .84);

float accretionBand(float x, float width) {
  float spread = x / width;
  return exp(-spread * spread);
}

struct Accretion {
  vec3 light;
  float coverage;
};

Accretion accretionRadiance(vec2 p, float shadow) {
  float r = length(p);
  if (r > 4.45) return Accretion(vec3(0.0), 0.0);
  float angle = atan(p.y, p.x + .00001);
  float polar = angle - gargantuaOrbit * 3.2;
  float arcTurbulence = gasNoise(vec3(cos(polar) * 7.2, sin(polar) * 7.2, r * 12.0 + 8.0));
  float upper = smoothstep(-.55, .42, p.y);
  float arcDistance = r - (1.054 + .105 * upper + .031 * cos(angle * 2.0) + .023 * (arcTurbulence - .5));
  float arcFlux = .85 + .38 * sin(polar * 3.0 + arcTurbulence * 4.0) + .21 * sin(polar * 11.0);
  float ribbons = .82 + .18 * cos(135.0 * arcDistance + arcTurbulence * 3.3);
  float photonRing = accretionBand(r - 1.022, .013);
  float arc = accretionBand(arcDistance, .076) * ribbons * arcFlux;
  float arcGlow = accretionBand(arcDistance - .045, .26);
  float coverage = (1.0 - smoothstep(.065, .11, abs(arcDistance))) * (1.0 - shadow);
  float arcHeat = accretionBand(arcDistance, .105);
  vec3 arcColor = mix(plasmaEmber, moltenGold, arcHeat);
  float arcDirection = 1.0 + cos(angle) * mix(.26, -.38, upper);
  vec3 light = plasmaEmber * arcGlow * .34 * (1.0 - .98 * shadow);
  light += (arcColor * arc * (5.2 + 2.1 * upper) * arcDirection +
    moltenGold * photonRing * (1.1 + 1.2 * arcFlux)) * (1.0 - shadow);

  // Inverse perspective projection into the inclined accretion plane.
  float planeHeight = p.y + .12;
  vec2 disk = vec2(p.x, planeHeight * 6.4) / max(.48, 1.0 - .26 * planeHeight);
  float diskR = length(disk);
  if (diskR < 4.28 && diskR > .66) {
    float diskAngle = atan(disk.y, disk.x + .00001);
    float nearHalf = 1.0 - smoothstep(-.22, -.03, disk.y);
    float visibleDisc = mix(1.0, nearHalf, shadow);
    float doppler = 1.0 + .37 * tanh(-p.x * .85);
    vec3 plasma = plasmaEmber * 1.18;
    for (int i = 0; i < 4; i++) {
      float layer = float(i);
      float radius = 1.10 + layer * .65;
      float spin = diskAngle - gargantuaOrbit * (7.5 / (1.0 + layer * 1.16));
      float shear = spin - (diskR - radius) * (1.0 + .42 * layer);
      float turbulence = gasNoise(vec3(cos(shear) * (7.3 + layer), sin(shear) * (7.3 + layer), diskR * 9.2 + layer * 11.0));
      float band = accretionBand(diskR - radius + (turbulence - .5) * .17, .39 + layer * .125);
      float filaments = .61 + .19 * cos(shear * (8.0 + layer * 2.0) + diskR * 29.0 + turbulence * 4.0);
      float knots = pow(.5 + .5 * cos(shear * (4.0 + layer) + turbulence * 2.8), 8.0);
      float ridges = .66 + .34 * pow(.5 + .5 * cos(diskR * 71.0 - spin * 3.0 + turbulence * 6.0), 2.0);
      vec3 hot = mix(moltenGold, plasmaEmber, layer / 3.0);
      plasma += band * hot * (filaments * ridges + knots * (.55 + turbulence)) * (4.2 / (1.0 + 1.3 * layer));
    }
    float rim = smoothstep(.70, .96, diskR) * (1.0 - smoothstep(3.72, 4.28, diskR));
    // The near side has a continuous hot lane that thins into the outer filaments.
    float wings = smoothstep(1.0, 3.8, abs(p.x));
    float laneHeight = mix(-.184, -.075, wings) + .014 * sin(p.x * 3.2 - gargantuaOrbit * 1.8);
    float lane = accretionBand(planeHeight - laneHeight, mix(.053, .031, wings));
    float laneStrength = (1.0 - smoothstep(1.4, 4.0, abs(p.x))) * (4.3 + .9 * sin(diskAngle * 6.0 - gargantuaOrbit * 5.0));
    plasma += mix(moltenGold, whiteHotPlasma, .72) * lane * laneStrength;
    coverage = max(coverage, rim * visibleDisc);
    light += plasma * rim * doppler * visibleDisc;
  }
  light += plasmaEmber * accretionBand(planeHeight, .30) *
    (1.0 - smoothstep(1.0, 4.4, abs(p.x))) * (.07 + arcTurbulence * .16) * (1.0 - .98 * shadow);
  return Accretion(light * gargantuaReveal * gargantuaGlow, coverage * gargantuaReveal);
}
`;

export const gargantuaGLSL = `
${gargantuaCoordinatesGLSL}
${gargantuaRadianceGLSL}
uniform sampler2D gargantuaBloom;
uniform float gargantuaBloomStrength;

vec3 cosmicSkyColor(vec3 ray) {
  float facing = dot(ray, gargantuaDirection);
  if (gargantuaReveal <= 0.0 || facing < .70) return nebulaSkyColor(ray);
  mat3 frame = gargantuaFrame();
  vec2 p = vec2(dot(ray, frame[0]), dot(ray, frame[1])) / (gargantuaSize() * facing);
  float r = length(p);
  if (r > 4.75) return nebulaSkyColor(ray);

  // Deflect gas and starlight outside the horizon so the far side curls into arcs.
  float bend = .96 * (1.0 - smoothstep(1.22, 4.72, r)) / max(r * r, .69);
  vec3 tangent = frame[0] * p.x + frame[1] * p.y;
  float drag = .16 * smoothstep(.96, 1.75, r) * (1.0 - smoothstep(2.03, 4.72, r));
  vec3 curl = frame[1] * p.x - frame[0] * p.y;
  vec3 bent = normalize(ray + (curl * drag - tangent * bend) * gargantuaSize() * gargantuaReveal);
  vec3 background = nebulaSkyColor(bent) * (1.0 - .22 * accretionBand(r - 1.67, 1.24) * gargantuaReveal);
  float edge = max(fwidth(r), .004);
  float shadow = 1.0 - smoothstep(.974 - edge, .974 + edge, r);
  vec3 darkSurface = vec3(.0011, .0016, .0032);
  darkSurface += vec3(.066, .077, .100) * accretionBand(r - .952, max(.010, edge));
  vec3 color = mix(background, darkSurface, shadow * gargantuaReveal);

  Accretion plasma = accretionRadiance(p, shadow);
  // Occlude the stars and clouds where the luminous material fills the view.
  color *= 1.0 - plasma.coverage;
  vec3 emission = plasma.light;
  vec2 uv = p / vec2(9.5, 4.8) + .5;
  if (gargantuaBloomStrength > 0.0 && abs(p.x) < 4.75 && abs(p.y) < 2.4) {
    vec3 bloom = textureLod(gargantuaBloom, uv, 0.0).rgb;
    float tileEdge = (1.0 - smoothstep(.45, .5, abs(uv.x - .5))) * (1.0 - smoothstep(.40, .5, abs(uv.y - .5)));
    emission += bloom * tileEdge * gargantuaBloomStrength * (1.0 - .995 * shadow);
  }
  // Use the same temperature response across the disc, halo and scattered light.
  float peak = max(emission.r, max(emission.g, emission.b));
  vec3 tint = mix(emission / max(peak, .001), whiteHotPlasma, smoothstep(1.5, 7.4, peak) * .94);
  return color + tint * (1.0 - exp(-peak * .77)) * .995;
}
`;
