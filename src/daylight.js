import * as THREE from "three";
import { createNebulaNoise, nebulaGLSL } from "./ceu-nebuloso.js";
import { STELLAR_ALTITUDE, STELLAR_WAVES } from "./stellar-event.js";

export function markNightLight(material, strength = 1.35) {
  const base = material.emissive.getHex() ? material.emissiveIntensity : 0;
  material.userData.nightGlow = { strength, base };
  material.emissive.set("#ffb365");
  material.emissiveIntensity = base;
  return material;
}

// The sky colors are specified in sRGB and interpolated in linear light.
const skyStops = [
  [0, "#121d3c", "#283754"],
  [4.5, "#172344", "#394060"],
  [6, "#556c99", "#f4b196"],
  [7.5, "#6babc9", "#f3dbc1"],
  [10, "#61abd6", "#d1e6df"],
  [14, "#6aafd2", "#d0e6e2"],
  [17, "#70a1b8", "#f6d6ab"],
  [18.6, "#6d7fa9", "#ffb177"],
  [20, "#233253", "#66506d"],
  [22, "#121d3c", "#283754"],
  [24, "#121d3c", "#283754"],
].map(([hour, zenith, horizon]) => [
  hour,
  new THREE.Color(zenith),
  new THREE.Color(horizon),
]);

const skyVertex = `
  varying vec3 skyRay;
  void main() {
    skyRay = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = `
  uniform vec3 zenith, horizon, sunDirection, moonDirection;
  uniform float sunVisibility, moonVisibility, night, cloudPhase;
  uniform float stellarFlash, skyExposure;
  uniform vec2 stellarWaves[${STELLAR_WAVES.length}];
  varying vec3 skyRay;

  float hash(vec2 cell) {
    vec3 value = fract(vec3(cell.xyx) * .1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  ${nebulaGLSL}

  float bell(float distance, float width) {
    float spread = distance / width;
    return exp(-spread * spread);
  }

  vec3 reflectedWave(vec3 ray, float angle, vec2 wave, vec3 tint, float width) {
    if (wave.y <= 0.0) return vec3(0.0);
    float behind = wave.x - angle;
    float glint = .82 + .18 * sin(ray.x * 17.0 + ray.z * 13.0);
    float crest = bell(behind, width);
    float reflection = bell(behind - .11, .21);
    return tint * wave.y * (.85 * crest * glint + .25 * reflection);
  }

  vec3 illuminateSky(vec3 ray, vec3 color) {
    color *= skyExposure;
    if (stellarFlash <= 0.0 && stellarWaves[0].y + stellarWaves[1].y + stellarWaves[2].y <= 0.0) return color;
    float alignment = clamp(dot(ray, nebulaOrigin), -1.0, 1.0);
    float angle = acos(alignment);
    float altitude = pow(max(0.0, ray.y), .42);
    vec3 flashSky = mix(vec3(.88,.81,.69), vec3(.36,.58,.88), altitude);
    flashSky = mix(flashSky, vec3(1.0,.97,.89), .58 * exp(-(1.0 - alignment) * 6.0));
    color = mix(color, flashSky, stellarFlash * .95);
    color += reflectedWave(ray, angle, stellarWaves[0], vec3(1.0,.90,.75), .061);
    color += reflectedWave(ray, angle, stellarWaves[1], vec3(.65,.84,1.0), .084);
    color += reflectedWave(ray, angle, stellarWaves[2], vec3(.72,.57,.98), .11);
    return color;
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(hash(cell), hash(cell + vec2(1, 0)), blend.x),
               mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1)), blend.x), blend.y);
  }

  void main() {
    vec3 ray = normalize(skyRay);
    if (nebulaAmount >= 1.0) {
      gl_FragColor = vec4(illuminateSky(ray, nebulaSkyColor(ray)), 1.0);
      #include <colorspace_fragment>
      return;
    }
    float altitude = max(ray.y, 0.0);
    vec3 color = mix(horizon, zenith, pow(clamp(altitude, 0.0, 1.0), .46));

    // Project a sparse star field onto the upper hemisphere.
    vec2 starPoint = ray.xz / (1.0 + altitude) * 230.0;
    vec2 cell = floor(starPoint);
    float seed = hash(cell);
    vec2 starCenter = vec2(hash(cell + 19.0), hash(cell - 57.0)) * .65 + .175;
    float star = (1.0 - smoothstep(.055, .28, length(fract(starPoint) - starCenter)));
    color += vec3(.53, .67, .92) * star * step(.978, seed)
      * night * smoothstep(.01, .20, ray.y);

    float sunDot = dot(ray, sunDirection);
    float sunRim = 1.0 - sunDot;
    float solarGlow = exp(-sunRim * 22.0) * sunVisibility;
    color += vec3(.60, .22, .06) * solarGlow;
    float sunDisc = smoothstep(.99926, .99942, sunDot) * sunVisibility;
    color = mix(color, vec3(1.0, .91, .67), sunDisc);

    float moonDot = dot(ray, moonDirection);
    float moonDisc = smoothstep(.99946, .99957, moonDot) * moonVisibility;
    color += vec3(.10, .15, .25) * exp(-(1.0 - moonDot) * 60.0) * moonVisibility;
    if (moonDisc > 0.0) {
      vec3 right = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, moonDirection);
      vec2 surface = vec2(dot(ray, right), dot(ray, up)) / .034;
      float maria = noise(surface * 2.7 + vec2(14.4, 87.2));
      maria = smoothstep(.43, .65, maria);
      vec3 moonColor = mix(vec3(.77, .87, 1.0), vec3(.44, .59, .80), maria * .57);
      color = mix(color, moonColor, moonDisc);
    }

    // Keep the cloud pattern fixed until a new hour is selected.
    if (ray.y > .025) {
      vec2 cloudUv = ray.xz / (ray.y + .28) * vec2(2.9, 5.2) + vec2(sin(cloudPhase), cos(cloudPhase)) * .56 + vec2(0.0, 2.42);
      float cloud = noise(cloudUv) * .59 + noise(cloudUv * 2.48) * .29
        + noise(cloudUv * 6.31) * .12;
      cloud = smoothstep(.55, .72, cloud) * smoothstep(.025, .23, ray.y);
      vec3 tint = mix(horizon * 1.2 + vec3(.10), horizon * .52 + vec3(.015), night);
      color = mix(color, tint, cloud * .52 * (1.0 - sunDisc) * (1.0 - moonDisc));
    }

    if (nebulaAmount > 0.0) {
      float reveal = nebulaReveal(ray);
      if (reveal > 0.0) color = mix(color, nebulaSkyColor(ray), reveal);
    }
    gl_FragColor = vec4(illuminateSky(ray, color), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createDaylight(scene, renderer, buildings) {
  const sun = new THREE.DirectionalLight("#fff0cf", 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -145,
    right: 145,
    top: 145,
    bottom: -145,
    far: 365,
  });
  sun.shadow.normalBias = 0.55;
  const moon = new THREE.DirectionalLight("#9cb6ff", 0.0);
  const blast = new THREE.DirectionalLight("#fff4df", 0);
  blast.name = "Clarão da Explosão Estelar";
  const ambient = new THREE.HemisphereLight("#eef8ff", "#a38a55", 1.9);
  scene.add(sun, sun.target, moon, moon.target, blast, blast.target, ambient);

  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const uniforms = {
    sunDirection: { value: sunDirection },
    moonDirection: { value: moonDirection },
    zenith: { value: zenith },
    horizon: { value: horizon },
    sunVisibility: { value: 0 },
    moonVisibility: { value: 0 },
    night: { value: 0 },
    cloudPhase: { value: 0 },
    nebulaAmount: { value: 0 },
    nebulaOrigin: { value: new THREE.Vector3(0, 1, 0) },
    nebulaNoise: { value: createNebulaNoise() },
    nebulaPhase: { value: 0 },
    stellarFlash: { value: 0 },
    stellarWaves: { value: STELLAR_WAVES.map(() => new THREE.Vector2()) },
    skyExposure: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 20),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  const luminous = new Map();
  const reflections = new Map();
  for (const template of Object.values(buildings)) {
    template.traverse((part) => {
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
        if (material?.emissive?.getHex()) luminous.set(material, material.emissiveIntensity);
        if (material?.envMap) reflections.set(material, material.envMapIntensity);
      }
    });
  }
  const daySky = new THREE.Color("#ebf7ff");
  const nightSky = new THREE.Color("#99aeef");
  const dayGround = new THREE.Color("#a29261");
  const nightGround = new THREE.Color("#556278");
  const warmSun = new THREE.Color("#ffb470");
  const whiteSun = new THREE.Color("#fff3db");
  const fogBase = new THREE.Color();
  const ambientSkyBase = new THREE.Color();
  const nebulaFog = new THREE.Color("#372035");
  const nebulaAmbient = new THREE.Color("#d58aa8");
  const flashFog = new THREE.Color("#dbe6ee");
  const ambientGroundBase = new THREE.Color();
  let lightingChanged = true;
  let hourLampPower = 0;
  let gridAvailable = true;
  let ambientBase = 0;

  function tintAtmosphere() {
    const amount = uniforms.nebulaAmount.value;
    const flash = uniforms.stellarFlash.value;
    scene.fog.color.copy(fogBase).lerp(nebulaFog, amount)
      .multiplyScalar(THREE.MathUtils.lerp(.15, 1, uniforms.skyExposure.value))
      .lerp(flashFog, flash * .82);
    ambient.color.copy(ambientSkyBase).lerp(nebulaAmbient, amount * .48).lerp(daySky, flash * .87);
    ambient.groundColor.copy(ambientGroundBase).lerp(dayGround, flash * .88);
  }

  function powerFixtures() {
    for (const [material, intensity] of luminous) {
      const glow = material.userData.nightGlow;
      material.emissiveIntensity = gridAvailable ? (glow ? glow.base + glow.strength * hourLampPower : intensity) : 0;
    }
  }

  function setStellarLighting(blackout, darkness, flash, source) {
    const gridChanged = gridAvailable === blackout;
    if (gridChanged) {
      gridAvailable = !blackout;
      powerFixtures();
    }
    const night = uniforms.night.value;
    // A blackout removes electric light even by day, without dimming the sun.
    const exposure = 1 - darkness * .985;
    if (uniforms.skyExposure.value !== exposure || uniforms.stellarFlash.value !== flash) {
      uniforms.skyExposure.value = exposure;
      uniforms.stellarFlash.value = flash;
      tintAtmosphere();
    }
    if (gridChanged || lightingChanged) for (const [material, intensity] of reflections) {
      material.envMapIntensity = intensity * (blackout ? 1 - .94 * night : 1);
    }
    const nightAttenuation = 1 - (1 - darkness) ** 2;
    ambient.intensity = ambientBase * (1 - .92 * night * nightAttenuation) + flash * 1.45;
    moon.intensity = .35 * night * (1 - .985 * nightAttenuation);
    blast.intensity = 2.6 * flash;
    if (flash && source) {
      blast.position.copy(source);
      blast.position.y += STELLAR_ALTITUDE;
      blast.target.position.copy(source);
    }
    return gridChanged;
  }

  function setHour(hour) {
    lightingChanged = true;
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    // Match the position of the sun and moon to the selected hour.
    sunDirection
      .set(-Math.cos(angle), 0.83 * Math.sin(angle), -0.56 * Math.sin(angle))
      .normalize();
    moonDirection.copy(sunDirection).negate();
    const height = sunDirection.y;
    const daylight = THREE.MathUtils.smoothstep(height, -0.17, 0.35);
    const direct = THREE.MathUtils.smoothstep(height, -0.035, 0.42);
    const night = 1 - THREE.MathUtils.smoothstep(height, -0.34, -0.04);

    let index = 1;
    while (skyStops[index][0] < hour) index++;
    const [from, fromZenith, fromHorizon] = skyStops[index - 1];
    const [to, toZenith, toHorizon] = skyStops[index];
    const mix = THREE.MathUtils.smoothstep(hour, from, to);
    zenith.copy(fromZenith).lerp(toZenith, mix);
    horizon.copy(fromHorizon).lerp(toHorizon, mix);
    uniforms.sunVisibility.value = THREE.MathUtils.smoothstep(
      height,
      -0.1,
      0.01,
    );
    uniforms.moonVisibility.value =
      THREE.MathUtils.smoothstep(-height, -0.03, 0.17) * (0.28 + night * 0.72);
    uniforms.night.value = night;
    uniforms.cloudPhase.value = angle;

    fogBase.copy(horizon).multiplyScalar(THREE.MathUtils.lerp(0.72, 0.91, daylight));
    ambientSkyBase.copy(nightSky).lerp(daySky, daylight);
    ambientGroundBase.copy(nightGround).lerp(dayGround, daylight);
    tintAtmosphere();
    ambientBase = THREE.MathUtils.lerp(0.57, 1.95, daylight);
    ambient.intensity = ambientBase;
    sun.color.copy(warmSun).lerp(whiteSun, direct);
    sun.intensity = 2.45 * direct;
    sun.castShadow = sun.intensity > 0;
    moon.intensity = 0.35 * night;

    hourLampPower = 1 - THREE.MathUtils.smoothstep(height, -0.28, 0.075);
    powerFixtures();
  }

  function positionLights(target) {
    const x = Math.round(target.x / 48) * 48;
    const z = Math.round(target.z / 48) * 48;
    const centerChanged =
      sun.target.position.x !== x || sun.target.position.z !== z;
    if (!centerChanged && !lightingChanged) return;
    sun.target.position.set(x, 0, z);
    sun.position
      .copy(sunDirection)
      .multiplyScalar(192)
      .add(sun.target.position);
    moon.target.position.copy(sun.target.position);
    moon.position
      .copy(moonDirection)
      .multiplyScalar(192)
      .add(moon.target.position);

    renderer.shadowMap.needsUpdate = true;
    lightingChanged = false;
  }

  return {
    setHour, positionLights, sky,
    setStellarLighting,
    setStellarWaves(waves, multiplier) {
      for (const [index, uniform] of uniforms.stellarWaves.value.entries()) {
        const wave = waves?.[index];
        uniform.set(wave?.radius ?? 0, (wave?.power ?? 0) * multiplier);
      }
    },
    setNebula(amount, origin, phase) {
      uniforms.nebulaOrigin.value.copy(origin);
      uniforms.nebulaPhase.value = phase;
      if (uniforms.nebulaAmount.value === amount) return false;
      uniforms.nebulaAmount.value = amount;
      tintAtmosphere();
      return true;
    },
    get lampPower() { return gridAvailable ? hourLampPower : 0; },
  };
}
