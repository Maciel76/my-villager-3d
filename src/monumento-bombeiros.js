import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

// The original CAD is Z-up; glTF converts its front (-Y) to the village's +Z.
export const firefightersMonument = Object.freeze({ width: 14, depth: 7, height: 8.5 });

let reflections;
function bronzeReflections() {
  if (typeof document === "undefined") return null;
  if (reflections) return reflections;
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext("2d"), sky = c.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of [[0, "#65869c"], [.43, "#e4edf0"], [.56, "#b9b6a0"], [1, "#384338"]])
    sky.addColorStop(at, color);
  c.fillStyle = sky; c.fillRect(0, 0, 512, 256);
  reflections = new THREE.CanvasTexture(canvas);
  reflections.mapping = THREE.EquirectangularReflectionMapping;
  reflections.colorSpace = THREE.SRGBColorSpace;
  return reflections;
}

export function prepareFirefightersMonument(scene, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene), origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  if (bounds.isEmpty()) throw new Error("O modelo do Monumento Corpo de Bombeiros está vazio.");
  const model = new THREE.Group();
  model.name = "Monumento Corpo de Bombeiros";
  const finishes = new Map(), env = bronzeReflections();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const source = part.material;
    if (Array.isArray(source)) throw new Error("O monumento deve ter um acabamento por malha exportada.");
    if (!finishes.has(source)) {
      const material = source.clone();
      if (material.metalness > .4 && env) {
        material.envMap = env;
        material.envMapIntensity = .65;
      }
      if (source.name.startsWith("LED ambar")) {
        material.emissiveIntensity = 0;
        markNightLight(material, 1.8);
        material.emissive.set("#ffbd6d");
      }
      finishes.set(source, material);
    }
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (!geometry.getAttribute("uv")) projectTexture(geometry);
    // Normalize attributes so the existing construction/instance batching can merge finishes.
    for (const key of Object.keys(geometry.attributes))
      if (!["position", "normal", "uv"].includes(key)) geometry.deleteAttribute(key);
    const surface = new THREE.Mesh(geometry, finishes.get(source));
    surface.name = part.userData.monumentPart || part.name;
    surface.userData.monumentSection = part.userData.monumentSection;
    surface.userData.groundCover = Boolean(part.userData.monumentGroundCover);
    surface.castShadow = !surface.userData.groundCover && !/^(Agua|Jatos de agua)/.test(source.name);
    surface.receiveShadow = true;
    model.add(surface);
  });
  // Local positions follow the same +Z-facing model through placement, rotation and reload.
  for (const x of [-5.45, 5.45]) {
    addLampEmitter(model, [x, 1.55, .72], {
      color: "#81d9ef", intensity: 5, range: 4, halo: 0,
    });
    addLampEmitter(model, [x, .9, 2.7], {
      color: "#ffc57a", intensity: 3, range: 3.2, halo: 0,
    });
  }
  addLampEmitter(model, [0, .82, 2.8], {
    color: "#ffd397", intensity: 8, range: 6, halo: 0, direction: [0, 1, -.45], angle: 1.15,
  });
  return model;
}
