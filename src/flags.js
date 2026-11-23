import * as THREE from "three";
import { FLAG_COUNTRIES } from "./flag-types.js";
import { optimizeBuildingTemplates } from "./building-batches.js";

export const FLAG_WIDTH = 2.35;
export const FLAG_TOP = 6.22;
const CLOTH_NAME = "Tecido da bandeira";
const FRAME_MS = 1000 / 30;

// A travelling wind wave grows from the fixed hoist toward the loose edge.
// Calculate normals from the deformed surface so folds respond to village light.
export function poseFlagCloth(geometry, aspect, seconds, phase = 0) {
  const position = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  const height = FLAG_WIDTH / aspect;
  const gust = .82 + .18 * Math.sin(seconds * .61 + phase);
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i), v = uv.getY(i), envelope = Math.pow(u, .85);
    const wave = u * 7.8 - seconds * 2.8 + phase;
    const ripple = Math.sin(u * 16.5 - seconds * 4.6 + v * 3.3 + phase * .7);
    position.setXYZ(i,
      FLAG_WIDTH * u - .065 * u * u * (1 - Math.cos(wave)),
      (v - .5) * height - .105 * u * u * (1 + .3 * Math.sin(wave + v * 2)),
      envelope * gust * (.215 * Math.sin(wave + v * .9) + .055 * ripple),
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function createMast() {
  const mast = new THREE.Group();
  const aluminium = new THREE.MeshStandardMaterial({ color: "#c9d4d5", metalness: .78, roughness: .34 });
  const stone = new THREE.MeshStandardMaterial({ color: "#aeb5aa", roughness: .96 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3c514b", metalness: .55, roughness: .54 });
  const gold = new THREE.MeshStandardMaterial({ color: "#d8b963", metalness: .7, roughness: .32 });
  const rope = new THREE.MeshStandardMaterial({ color: "#e3d9bc", roughness: .95 });
  function add(geometry, material, x, y, z, name) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = name; mast.add(mesh); return mesh;
  }
  add(new THREE.CylinderGeometry(.36, .4, .12, 16), stone, 0, .06, 0, "Base de concreto");
  add(new THREE.CylinderGeometry(.18, .23, .11, 16), dark, 0, .175, 0, "Sapata do mastro");
  add(new THREE.CylinderGeometry(.027, .052, 6.18, 12), aluminium, 0, 3.32, 0, "Mastro de alumínio");
  add(new THREE.SphereGeometry(.085, 12, 8), gold, 0, 6.49, 0, "Ponteira dourada");
  for (const x of [-.14, .14]) for (const z of [-.14, .14])
    add(new THREE.CylinderGeometry(.018, .018, .035, 6), gold, x, .244, z, "Parafuso da base");
  for (const z of [-.055, -.078])
    add(new THREE.CylinderGeometry(.006, .006, 5.08, 6), rope, .025, 3.71, z, "Adriça");
  add(new THREE.BoxGeometry(.09, .045, .09), dark, .025, 1.17, -.055, "Cunho da adriça");
  add(new THREE.SphereGeometry(.025, 8, 6), gold, .045, FLAG_TOP, .025, "Fixação superior");
  optimizeBuildingTemplates({ mast });
  return mast;
}

export function createFlagModels(textures = {}) {
  const mast = createMast();
  const clipGeometry = new THREE.SphereGeometry(.025, 8, 6);
  const clipMaterial = new THREE.MeshStandardMaterial({ color: "#d8b963", metalness: .7, roughness: .32 });
  return Object.fromEntries(FLAG_COUNTRIES.map(({ type, code, country, aspect }, index) => {
    const model = new THREE.Group();
    model.name = `Bandeira ${country}`;
    model.userData.hasMovingParts = true;
    model.userData.flagCountry = code;
    model.userData.flagAspect = aspect;
    model.userData.flagPhase = index * .43;
    model.add(...mast.children.map(part => part.clone()));
    const clip = new THREE.Mesh(clipGeometry, clipMaterial);
    clip.name = "Fixação inferior";
    clip.position.set(.045, FLAG_TOP - FLAG_WIDTH / aspect, .025);
    clip.castShadow = clip.receiveShadow = true;
    model.add(clip);
    const geometry = new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_WIDTH / aspect, 28, 14);
    geometry.getAttribute("position").setUsage(THREE.DynamicDrawUsage);
    poseFlagCloth(geometry, aspect, .8, index * .43);
    // Conservative bounds include every wind pose, for picking and culling.
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(0, -FLAG_WIDTH / aspect / 2 - .15, -.31),
      new THREE.Vector3(FLAG_WIDTH, FLAG_WIDTH / aspect / 2, .31)).expandByScalar(.001);
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: "#ffffff", map: textures[code] ?? null, side: THREE.DoubleSide,
      roughness: .91, metalness: 0,
    }));
    cloth.name = CLOTH_NAME;
    cloth.position.set(.065, FLAG_TOP - FLAG_WIDTH / aspect / 2, .025);
    // Keep the city's cached shadow map static while the fabric moves.
    cloth.castShadow = false; cloth.receiveShadow = true;
    model.add(cloth);
    return [type, model];
  }));
}

export function createFlagAnimation() {
  const flags = new Map();
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), worldBounds = new THREE.Box3();
  function add(model) {
    if (flags.has(model) || !model.userData.flagCountry) return;
    const cloth = model.getObjectByName(CLOTH_NAME);
    if (!cloth) return;
    // Cloned village objects must have independent fabric, including after undo.
    cloth.geometry = cloth.geometry.clone();
    cloth.geometry.getAttribute("position").setUsage(THREE.DynamicDrawUsage);
    model.updateMatrixWorld(true);
    flags.set(model, { cloth, seconds: .8, lastTime: null,
      bounds: new THREE.Box3(new THREE.Vector3(-.41, 0, -.41), new THREE.Vector3(2.5, 6.6, .41)) });
  }
  function update(camera, time, construction, animate = true) {
    if (!flags.size) return false;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let moving = false;
    for (const [model, flag] of flags) {
      worldBounds.copy(flag.bounds).applyMatrix4(model.matrixWorld);
      if (!animate || !model.visible || construction.has(model) || !frustum.intersectsBox(worldBounds)) {
        flag.lastTime = null; continue;
      }
      moving = true;
      if (flag.lastTime === null) { flag.lastTime = time; continue; }
      const elapsed = time - flag.lastTime;
      if (elapsed < FRAME_MS - 2) continue;
      flag.seconds += Math.min(elapsed, 100) / 1000;
      flag.lastTime = time;
      const phase = model.userData.flagPhase + model.position.x * .13 + model.position.z * .09;
      poseFlagCloth(flag.cloth.geometry, model.userData.flagAspect, flag.seconds, phase);
    }
    return moving;
  }
  function remove(model) {
    const flag = flags.get(model);
    if (!flag) return;
    flag.cloth.geometry.dispose();
    flags.delete(model);
  }
  return { add, update, remove, get count() { return flags.size; } };
}
