import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";

export function prepareCuboVerdeModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const building = new THREE.Group();
  building.name = "Casa Cubo Verde";
  const timber = materials.cedar.clone();
  timber.color.set("#ead0af");
  timber.roughness = 0.76;
  const glazing = markNightLight(new THREE.MeshPhysicalMaterial({
    color: "#335b4e", roughness: 0.15, metalness: 0.06,
    transparent: true, opacity: 0.68, depthWrite: false,
    clearcoat: 0.65, side: THREE.DoubleSide,
  }), 0.48);
  const balustrade = new THREE.MeshPhysicalMaterial({
    color: "#92ae9b", roughness: 0.13, metalness: 0.04,
    transparent: true, opacity: 0.32, depthWrite: false,
    clearcoat: 0.8, side: THREE.DoubleSide,
  });
  const batches = new Map();
  scene.traverse((part) => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    const material = finish === "glazing" ? glazing
      : finish === "balustrade" ? balustrade
      : ["timber", "deck"].includes(finish) ? timber
      : finish === "lawn" ? materials.lawn
      : finish === "gravel" ? materials.plaza : part.material;
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    // Box primitives and the lighter garden meshes share one UV layout.
    if (material.map || !geometry.getAttribute("uv")) projectTexture(geometry);
    const key = `${finish}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { finish, material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  });
  for (const { finish, material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Não foi possível preparar ${finish} da Casa Cubo Verde`);
    geometries.forEach((source) => source.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cubo-${finish}`;
    mesh.userData.groundCover = ["lawn", "gravel"].includes(finish);
    mesh.castShadow = !material.transparent && !mesh.userData.groundCover;
    mesh.receiveShadow = true;
    mesh.renderOrder = material.transparent ? 3 : 0;
    building.add(mesh);
  }
  return building;
}
