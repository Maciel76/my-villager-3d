import * as THREE from "three";
import { footprint } from "./placement.js";

export function villageOverview(houses, roads, aspect) {
  const bounds = new THREE.Box3();
  for (const house of houses) {
    const [width, depth] = footprint(house.type, house.rotation);
    bounds.expandByPoint(new THREE.Vector3(house.x - width / 2, 0, house.z - depth / 2));
    bounds.expandByPoint(new THREE.Vector3(house.x + width / 2, 28, house.z + depth / 2));
  }
  for (const road of roads) {
    bounds.expandByPoint(new THREE.Vector3(road.x - 6, 0, road.z - 6));
    bounds.expandByPoint(new THREE.Vector3(road.x + 6, 0, road.z + 6));
  }
  if (bounds.isEmpty() || Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) <= 60)
    return null;

  const target = bounds.getCenter(new THREE.Vector3());
  target.y = 0;
  const direction = new THREE.Vector3(0.44, 0.84, 0.47).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tangent = Math.tan(THREE.MathUtils.degToRad(47 / 2));
  let distance = 152;
  // Reserve space around all eight corners for the top bar and bottom tools.
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(target);
        distance = Math.max(distance, corner.dot(direction) + Math.max(
          Math.abs(corner.dot(right)) / (tangent * aspect * 0.84),
          Math.abs(corner.dot(up)) / (tangent * 0.76),
        ));
      }
  return { target, position: direction.multiplyScalar(distance).add(target), distance };
}
