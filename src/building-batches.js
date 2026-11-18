import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const transparent = material => (Array.isArray(material) ? material : [material]).some(m => m?.transparent);

// Merge compatible parts once per catalogue model, preserving the three
// construction phases, material finishes, ground covers, and shadow flags.
export function optimizeBuildingTemplates(templates) {
  for (const template of Object.values(templates)) {
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template);
    const height = bounds.max.y - bounds.min.y;
    const groups = new Map();
    const retained = [];
    template.traverse(part => {
      if (!part.isMesh) return;
      if (Array.isArray(part.material) || transparent(part.material)) {
        const mesh = new THREE.Mesh(part.geometry.clone().applyMatrix4(part.matrixWorld), part.material);
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = part.receiveShadow;
        mesh.renderOrder = part.renderOrder;
        mesh.userData = { ...part.userData };
        mesh.name = part.name;
        retained.push(mesh);
        return;
      }
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      if (!geometry.index) {
        // Keep the original CAD index buffers. Expanding indexed trees and
        // ornaments repeats their vertices and wastes GPU work in a large city.
        const count = geometry.getAttribute("position").count;
        const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
        for (let i = 0; i < count; i++) indices[i] = i;
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      geometry.computeBoundingBox();
      const b = geometry.boundingBox;
      const phase = b.max.y < height * .16 ? 0 : (b.min.y + b.max.y) / 2 > height * .63 ? 2 : 1;
      const key = [part.material.uuid, part.castShadow, part.receiveShadow,
        Boolean(part.userData.groundCover), part.renderOrder, phase, Object.keys(geometry.attributes).sort().join(",")].join(":");
      if (!groups.has(key)) groups.set(key, { source: part, geometries: [] });
      groups.get(key).geometries.push(geometry);
    });
    template.clear();
    if (retained.length) template.add(...retained);
    for (const { source, geometries } of groups.values()) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error(`Não foi possível agrupar ${template.name}`);
      geometries.forEach(g => g.dispose());
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, source.material);
      mesh.castShadow = source.castShadow;
      mesh.receiveShadow = source.receiveShadow;
      mesh.renderOrder = source.renderOrder;
      mesh.userData = { ...source.userData };
      mesh.name = source.name;
      template.add(mesh);
    }
  }
}

// Layer 1 holds the individually selectable/collidable originals. The camera
// renders layer 0, where repeated static buildings share GPU instance buffers.
export function createBuildingBatches(scene, templates) {
  const root = new THREE.Group();
  root.name = "Construções instanciadas";
  scene.add(root);
  const batches = new Map();
  let rebuilds = 0;
  function sync(houses, animations) {
    const groups = new Map();
    for (const house of houses) {
      const animated = animations.has(house.model);
      const layer = animated ? 0 : 1;
      if (house.model.userData.renderLayer !== layer) {
        // Transparent glass keeps per-object sorting and its original draw
        // order. Instancing transparent buildings would change their blending.
        house.model.traverse(part => part.layers.set(animated || transparent(part.material) ? 0 : 1));
        house.model.userData.renderLayer = layer;
      }
      if (animated || !house.model.visible) continue;
      if (!groups.has(house.type)) groups.set(house.type, []);
      groups.get(house.type).push(house);
    }
    for (const type of new Set([...batches.keys(), ...groups.keys()])) {
      const members = groups.get(type) ?? [];
      const stamp = members.map(({ model }) => `${model.id}:${model.position.toArray()}:${model.rotation.y}`).join(";");
      let batch = batches.get(type);
      if (batch?.stamp === stamp) continue;
      if (!batch || batch.capacity < members.length) {
        if (batch) for (const mesh of batch.meshes) { mesh.removeFromParent(); mesh.dispose(); }
        const capacity = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, members.length));
        const meshes = templates[type].children.filter(source => !transparent(source.material)).map(source => {
          const mesh = new THREE.InstancedMesh(source.geometry, source.material, capacity);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = source.castShadow;
          mesh.receiveShadow = source.receiveShadow;
          mesh.renderOrder = source.renderOrder;
          mesh.name = `instances-${type}`;
          root.add(mesh);
          return mesh;
        });
        batch = { capacity, meshes };
        batches.set(type, batch);
      }
      batch.stamp = stamp;
      for (const mesh of batch.meshes) {
        mesh.count = members.length;
        mesh.visible = members.length > 0;
        members.forEach(({ model }, i) => mesh.setMatrixAt(i, model.matrixWorld));
        mesh.instanceMatrix.needsUpdate = true;
        if (members.length) mesh.computeBoundingSphere();
      }
      rebuilds++;
    }
  }
  return { root, sync, get stats() { return { rebuilds, drawBatches: root.children.length }; } };
}
