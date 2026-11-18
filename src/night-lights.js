import * as THREE from "three";
import { createClusteredLights } from "./clustered-lights.js";

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

export function createNightLights(scene, { clustered = false } = {}) {
  const haloMap = makeHaloTexture();
  if (clustered) return createClusteredLights(scene, haloMap);
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
  const points = [];
  const spots = [];
  const direction = new THREE.Vector3();

  function resize(slots, count, Light) {
    while (slots.length < count) slots.push(createSlot(new Light()));
    while (slots.length > count) {
      const { light, halo } = slots.pop();
      light.removeFromParent();
      if (light.isSpotLight) light.target.removeFromParent();
      halo.removeFromParent();
      halo.material.dispose();
      light.dispose();
    }
  }

  function update(houses, camera, power) {
    const activePoints = [];
    const activeSpots = [];
    for (const { model } of houses) {
      const emitters = model.userData.lampEmitters;
      if (!model.visible || !emitters) continue;
      model.updateWorldMatrix(true, false);
      for (const emitter of emitters) {
        const point = new THREE.Vector3(...emitter.position).applyMatrix4(model.matrixWorld);
        const list = emitter.direction ? activeSpots : activePoints;
        // Every emitter lights the scene, including those outside the camera whose
        // range can still reach visible surfaces. Camera movement cannot turn them off.
        list.push({ emitter, model, point });
      }
    }
    resize(points, activePoints.length, THREE.PointLight);
    resize(spots, activeSpots.length, THREE.SpotLight);

    function apply(slots, active) {
      slots.forEach(({ light, halo }, index) => {
        const { emitter, model, point } = active[index];
        light.visible = power > 0.015;
        light.color.set(emitter.color);
        light.intensity = power * emitter.intensity * 1.75;
        light.distance = emitter.range;
        light.position.copy(point);
        if (light.isSpotLight) {
          direction.set(...emitter.direction).transformDirection(model.matrixWorld);
          light.target.position.copy(point).add(direction);
          light.angle = emitter.angle ?? 0.84;
          light.penumbra = 0.78;
        }
        halo.visible = light.visible && Boolean(emitter.halo);
        if (halo.visible) {
          // Give the bloom room to show around the glass without washing out its cage.
          halo.position.copy(point).lerp(camera.position, 0.003);
          halo.scale.setScalar(emitter.halo);
          halo.material.color.copy(light.color);
          halo.material.opacity = power * 0.7;
        }
      });
    }
    apply(points, activePoints);
    apply(spots, activeSpots);
  }

  return { update };
}
