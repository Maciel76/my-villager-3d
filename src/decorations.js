import * as THREE from "three";
import { DECORATION_TYPES } from "./decoration-types.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

// SolidCraft exports one named body per part. Split the workbench into the
// twenty catalogue models, bake the CAD transforms, then centre and ground each.
export function prepareDecorationModels(scene, types = DECORATION_TYPES) {
  scene.updateMatrixWorld(true);
  const models = Object.fromEntries(Object.entries(types).map(([type, details]) => {
    const model = new THREE.Group();
    model.name = details.label;
    return [type, model];
  }));
  const finishes = new Map();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const [type, finish] = part.name.split("-");
    const model = models[type];
    if (!model) return;
    const key = `${finish}:${part.material.color.getHexString()}`;
    if (!finishes.has(key)) {
      const material = part.material.clone();
      // CAD colours are authored finishes. Share them across all decorations
      // so the game's instancing can merge matching pieces efficiently.
      if (finish === "fire") markNightLight(material, 1.6);
      finishes.set(key, material);
    }
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    const mesh = new THREE.Mesh(geometry, finishes.get(key));
    mesh.name = part.name;
    mesh.castShadow = finish !== "water";
    mesh.receiveShadow = true;
    model.add(mesh);
  });
  for (const [type, model] of Object.entries(models)) {
    if (!model.children.length) throw new Error(`Decoração sem modelo: ${type}`);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
    for (const part of model.children) part.geometry.translate(-center.x, -box.min.y, -center.z);
    if (type === "decorFirepit") addLampEmitter(model, [0, .7, 0], {
      color: "#ffac46", intensity: 5, range: 7, halo: .3,
    });
    if (type === "decorSignpost" && typeof document !== "undefined") addWelcomeLettering(model);
  }
  return models;
}

function addWelcomeLettering(model) {
  const canvas = document.createElement("canvas");
  canvas.width = 768; canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#294c3e";
  context.textAlign = "center";
  context.font = "bold 58px Georgia, serif";
  context.fillText("Bem-vindo à", 384, 92);
  context.font = "bold 83px Georgia, serif";
  context.fillText("Vila Verde", 384, 187);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const lettering = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .48), new THREE.MeshStandardMaterial({
    map: texture, transparent: true, depthWrite: false, roughness: .9,
  }));
  lettering.name = "Letras da placa";
  // CAD -Y becomes glTF +Z. Account for the flowerpots in the model centre.
  lettering.position.set(.22, 1.79, .29);
  model.add(lettering);
}
