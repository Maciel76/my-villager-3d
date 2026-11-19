import { BufferAttribute, BufferGeometry } from "three";

// A model may share one grass mesh between its lawn and rooftop gardens.
// Keep the low ground separate so paving never removes the upper gardens.
export function splitGroundCover(geometry, groundCover) {
  if (!groundCover) return [{ geometry, low: false }];
  geometry.computeBoundingBox();
  if (geometry.boundingBox.max.y <= .6) return [{ geometry, low: true }];
  if (geometry.boundingBox.min.y > .6) return [{ geometry, low: false }];
  const positions = geometry.getAttribute("position");
  const low = [], upper = [];
  const indices = geometry.index;
  for (let i = 0, count = indices?.count ?? positions.count; i < count; i += 3) {
    const triangle = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
    const target = triangle.every(index => positions.getY(index) <= .6) ? low : upper;
    target.push(...triangle);
  }
  if (!low.length) return [{ geometry, low: false }];
  if (!upper.length) return [{ geometry, low: true }];
  const parts = [];
  for (const [ids, isLow] of [[low, true], [upper, false]]) {
    if (!ids.length) continue;
    const part = new BufferGeometry();
    const used = [...new Set(ids)];
    const remap = new Map(used.map((index, i) => [index, i]));
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new Float32Array(used.length * attribute.itemSize);
      used.forEach((index, i) => {
        for (let c = 0; c < attribute.itemSize; c++) values[i * attribute.itemSize + c] = attribute.getComponent(index, c);
      });
      part.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
    }
    part.setIndex(ids.map(index => remap.get(index)));
    parts.push({ geometry: part, low: isLow });
  }
  geometry.dispose();
  return parts;
}

export function setPavingGroundCover(model, covered, animated = false) {
  if (model.userData.pavedGround === covered) return;
  model.userData.pavedGround = covered;
  // Force picking layers to follow this change even when the root never moved.
  model.userData.renderLayer = undefined;
  model.traverse(part => {
    if (!part.userData.lowGroundCover) return;
    part.userData.hiddenByPaving = covered;
    if (covered) { part.visible = false; part.layers.set(2); }
    else { part.layers.set(0); if (!animated) part.visible = true; }
  });
}
