import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

export function prepareSupermarketModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const market = new THREE.Group();
  market.name = "Supermercado Verde";
  const glazing = markNightLight(new THREE.MeshPhysicalMaterial({
    color: "#acc6be", transparent: true, opacity: 0.21, depthWrite: false,
    roughness: 0.11, metalness: 0.03, clearcoat: 0.75, side: THREE.DoubleSide,
  }), 0.22);
  const coldGlass = new THREE.MeshPhysicalMaterial({
    color: "#91b9b5", transparent: true, opacity: 0.26, depthWrite: false,
    roughness: 0.16, metalness: 0.03, side: THREE.DoubleSide,
  });
  const cedar = materials.cedar.clone();
  cedar.color.set("#ead5b2");
  const luminous = new Map();
  const batches = new Map();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    let material = finish === "glazing" ? glazing
      : finish === "coldGlass" ? coldGlass
      : finish === "cedar" ? cedar
      : finish === "asphalt" ? materials.asphalt
      : finish === "paving" ? materials.plaza
      : finish === "lawn" ? materials.lawn : part.material;
    if (["signWhite", "signRed", "led", "screen", "headlamp", "interiorLight"].includes(finish)) {
      if (!luminous.has(finish)) {
        const light = material.clone();
        if (finish === "interiorLight" || finish === "screen") {
          light.emissive.copy(light.color);
          light.emissiveIntensity = finish === "interiorLight" ? 0.55 : 0.32;
        } else {
          markNightLight(light, finish === "led" ? 1.6 : 0.65);
          if (finish === "signRed") light.emissive.copy(light.color);
        }
        luminous.set(finish, light);
      }
      material = luminous.get(finish);
    }
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (material.map || !geometry.getAttribute("uv")) projectTexture(geometry);
    const key = `${finish}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { finish, material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  });
  for (const { finish, material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Falha no acabamento ${finish} do supermercado`);
    geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `super-${finish}`;
    mesh.userData.groundCover = ["asphalt", "paving", "lawn", "paint", "accessible"].includes(finish);
    mesh.castShadow = !material.transparent && !mesh.userData.groundCover;
    mesh.receiveShadow = true;
    mesh.renderOrder = material.transparent ? 3 : 0;
    market.add(mesh);
  }
  // Downlights along the storefront and cafe illuminate the pedestrian apron.
  for (const x of [-13, -3, 8, 14]) addLampEmitter(market, [x, 4.1, 6.1], {
    color: "#ffe1aa", intensity: 34, range: 9, halo: 0.9,
    direction: [0, -1, 0.3], angle: 0.9,
  });
  for (const x of [-5, 3, 10]) addLampEmitter(market, [x, 4.5, -1], {
    color: "#fff1cf", intensity: 25, range: 11, halo: 0,
  });
  return market;
}
