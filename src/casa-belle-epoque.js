import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";

export function prepareBelleEpoqueModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const building = new THREE.Group();
  building.name = "Casa Belle Époque";
  const slate = materials.darkShingle.clone();
  slate.map = null;
  slate.color.set("#394148");
  slate.normalScale.set(0.22, 0.22);
  const lightRoof = materials.darkShingle.clone();
  lightRoof.map = null;
  lightRoof.color.set("#b8bcb8");
  lightRoof.normalScale.set(0.15, 0.15);
  const glass = markNightLight(new THREE.MeshStandardMaterial({
    color: "#506468", roughness: 0.24, metalness: 0.18,
  }), 0.95);
  const lamp = markNightLight(new THREE.MeshStandardMaterial({
    color: "#f4d4a2", roughness: 0.4,
  }), 1.7);
  const batches = new Map();
  scene.traverse((part) => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    const material = finish === "glass" ? glass : finish === "lamp" ? lamp
      : finish === "slate" ? slate : finish === "lightRoof" ? lightRoof
      : finish === "lawn" ? materials.lawn
      : finish === "paving" ? materials.plaza : part.material;
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (material.map || !geometry.getAttribute("uv"))
      projectTexture(geometry, ["slate", "lightRoof"].includes(finish) ? "z" : false);
    const key = `${finish}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { finish, material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  });
  for (const { finish, material, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Não foi possível preparar ${finish} da Belle Époque`);
    geometries.forEach((source) => source.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `belle-${finish}`;
    mesh.userData.groundCover = ["lawn", "paving"].includes(finish);
    mesh.castShadow = !mesh.userData.groundCover;
    mesh.receiveShadow = true;
    building.add(mesh);
  }
  return building;
}
