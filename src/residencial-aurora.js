import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";

// CAD stays in models/residencial-aurora.sc. The GLB is already in metres,
// with Y up and the main entrance facing +Z, as the village expects.
export function prepareAuroraModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const building = new THREE.Group();
  building.name = "Residencial Aurora";
  const batches = new Map();
  const glass = markNightLight(new THREE.MeshStandardMaterial({
    color: "#7197a3", roughness: 0.27, metalness: 0.2,
  }), 0.85);

  scene.traverse((part) => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    const material = finish === "brick" ? materials.brick
      : finish === "lawn" ? materials.lawn
      : finish === "glass" ? glass : part.material;
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (material.map) projectTexture(geometry);
    // Over a thousand editable CAD parts become a few material batches in
    // the game, keeping balconies and railings cheap to draw and select.
    const key = `${finish}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { finish, material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  });

  for (const { finish, material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Falha ao preparar o acabamento ${finish} do Aurora`);
    for (const source of geometries) source.dispose();
    const surface = new THREE.Mesh(geometry, material);
    surface.name = `aurora-${finish}`;
    surface.userData.groundCover = ["lawn", "plaza", "paving"].includes(finish);
    surface.castShadow = !surface.userData.groundCover;
    surface.receiveShadow = true;
    building.add(surface);
  }
  return building;
}
