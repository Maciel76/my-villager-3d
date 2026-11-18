import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

function lanternBounds(geometry) {
  // The export batches separate lanterns into a single mesh. Weld coincident
  // vertices and follow triangle connectivity to recover each luminous body.
  const position = geometry.attributes.position;
  const vertices = [];
  const parents = [];
  const welded = new Map();
  const ids = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = point.toArray().map((value) => Math.round(value * 10000)).join(",");
    if (!welded.has(key)) {
      welded.set(key, vertices.length);
      parents.push(vertices.length);
      vertices.push(point);
    }
    ids[i] = welded.get(key);
  }
  function root(id) {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  }
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const a = root(ids[index ? index.getX(i) : i]);
    const b = root(ids[index ? index.getX(i + 1) : i + 1]);
    const c = root(ids[index ? index.getX(i + 2) : i + 2]);
    parents[b] = parents[c] = a;
  }
  const bounds = new Map();
  vertices.forEach((point, id) => {
    const component = root(id);
    if (!bounds.has(component)) bounds.set(component, new THREE.Box3());
    bounds.get(component).expandByPoint(point);
  });
  return bounds.values();
}

export function addPalaceLights(building) {
  const luminous = new Set();
  building.traverse((part) => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    if (finish !== "lantern" && finish !== "window") return;
    if (!luminous.has(part.material)) {
      markNightLight(part.material, finish === "lantern" ? 3.6 : 1.55);
      luminous.add(part.material);
    }
    if (finish !== "lantern") return;
    for (const bounds of lanternBounds(part.geometry)) {
      const center = bounds.getCenter(new THREE.Vector3());
      addLampEmitter(building, center.toArray(), {
        color: "#ffbd70", intensity: 30, range: 7, halo: 2.5,
      });
    }
  });
}
