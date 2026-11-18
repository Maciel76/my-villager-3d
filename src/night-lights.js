import * as THREE from "three";

export function addLampEmitter(model, position, options) {
  (model.userData.lampEmitters ??= []).push({ position, ...options });
}

function makeHaloTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const x = (i % size + 0.5) / size * 2 - 1;
    const y = (Math.floor(i / size) + 0.5) / size * 2 - 1;
    const spread = Math.max(0, 1 - Math.hypot(x, y));
    pixels.set([255, 255, 255, Math.round(255 * spread ** 3.8)], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createNightLights(scene) {
  const pointSlots = Array.from({ length: 9 }, () => new THREE.PointLight());
  const spotSlots = Array.from({ length: 3 }, () => new THREE.SpotLight());
  const haloMap = makeHaloTexture();
  const createSlot = (light) => {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloMap,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    light.visible = halo.visible = false;
    scene.add(light, halo);
    if (light.isSpotLight) scene.add(light.target);
    return { light, halo };
  };
  const points = pointSlots.map(createSlot);
  const spots = spotSlots.map(createSlot);
  const projected = new THREE.Vector3();
  const direction = new THREE.Vector3();

  function update(houses, camera, target, power) {
    const candidates = [];
    if (power > 0.015) {
      camera.updateMatrixWorld();
      for (const { model } of houses) {
        const emitters = model.userData.lampEmitters;
        if (!model.visible || !emitters) continue;
        model.updateMatrixWorld();
        for (const emitter of emitters) {
          const point = new THREE.Vector3(...emitter.position).applyMatrix4(model.matrixWorld);
          projected.copy(point).project(camera);
          if (projected.z < -1 || projected.z > 1 ||
              Math.abs(projected.x) > 1.4 || Math.abs(projected.y) > 1.4) continue;
          const score = point.distanceToSquared(target) * 0.54 +
            110 * (projected.x ** 2 + projected.y ** 2);
          candidates.push({ emitter, model, point, score });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
    }
    const countPerModel = new Map();
    const activePoints = [];
    const activeSpots = [];
    for (const candidate of candidates) {
      const { model, emitter } = candidate;
      const list = emitter.direction ? activeSpots : activePoints;
      const limit = emitter.direction ? spots.length : points.length;
      const chosen = countPerModel.get(model) ?? 0;
      if (list.length >= limit || chosen >= 4) continue;
      list.push(candidate);
      countPerModel.set(model, chosen + 1);
    }

    function apply(slots, active) {
      slots.forEach(({ light, halo }, index) => {
        const candidate = active[index];
        // Keep a fixed light count while lit so moving the camera reuses shaders.
        light.visible = active.length > 0;
        light.intensity = 0;
        halo.visible = false;
        if (!candidate) return;
        const { emitter, model, point } = candidate;
        light.color.set(emitter.color);
        light.intensity = power * emitter.intensity;
        light.distance = emitter.range;
        light.position.copy(point);
        if (light.isSpotLight) {
          direction.set(...emitter.direction).transformDirection(model.matrixWorld);
          light.target.position.copy(point).add(direction);
          light.angle = emitter.angle ?? 0.84;
          light.penumbra = 0.78;
        }
        halo.visible = Boolean(emitter.halo);
        if (halo.visible) {
          // Give the bloom room to show around the glass without washing out its cage.
          halo.position.copy(point).lerp(camera.position, 0.003);
          halo.scale.setScalar(emitter.halo);
          halo.material.color.copy(light.color);
          halo.material.opacity = power * 0.52;
        }
      });
    }
    apply(points, activePoints);
    apply(spots, activeSpots);
  }

  return { update };
}
