import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

export function prepareRotundaModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const pavilion = new THREE.Group();
  pavilion.name = "Pavilhão Rotunda";
  const finishes = new Map();
  const groups = new Map();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    if (!finishes.has(finish)) {
      const material = part.material.clone();
      if (["marble", "floorWhite", "floorWarm"].includes(finish)) {
        material.roughness = 0.48;
        material.metalness = 0.025;
      }
      if (finish === "light") {
        markNightLight(material, 1.2);
        material.emissive.copy(material.color);
      }
      finishes.set(finish, material);
    }
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (!geometry.getAttribute("uv")) projectTexture(geometry);
    if (!groups.has(finish)) groups.set(finish, []);
    groups.get(finish).push(geometry);
  });
  for (const [finish, geometries] of groups) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Falha no acabamento ${finish} da rotunda`);
    geometries.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(geometry, finishes.get(finish));
    mesh.name = `rotunda-${finish}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pavilion.add(mesh);
  }
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const x = Math.cos(angle), z = -Math.sin(angle);
    addLampEmitter(pavilion, [x * 4.93, 0.59, z * 4.93], {
      color: "#ffe4b8", intensity: 12, range: 8, halo: 0,
      direction: [-x * 0.25, 1, -z * 0.25], angle: 0.28,
    });
  }
  addLampEmitter(pavilion, [0, 6.6, 0], {
    color: "#ffedcf", intensity: 18, range: 10, halo: 0,
  });
  return pavilion;
}
