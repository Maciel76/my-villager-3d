// Usage: node scripts/optimize-decorations.js path/to/SolidCraft-export.glb
// Keep the exact editable CAD in models/decorations; reduce only game meshes.
import assert from "node:assert/strict";
import { stat, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const source = process.argv[2];
if (!source) throw new Error("Informe o GLB exportado pelo SolidCraft.");
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder,
});
const doc = await io.read(source), root = doc.getRoot();
let before = 0, after = 0, maxRelativeError = 0;
const targetError = Number(process.argv[5] ?? .003), targetRatio = Number(process.argv[6] ?? .08);
for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const positions = primitive.getAttribute("POSITION").getArray();
  const oldIndices = primitive.getIndices();
  const indices = new Uint32Array(oldIndices.getArray());
  before += indices.length / 3;
  let simplified = indices;
  let coarseError = 0;
  // Nonuniformly scaled CAD ellipsoids can contain half a million triangles
  // in one palm leaf. Reduce that redundant sampling before the normal-aware pass.
  if (indices.length > 90000) {
    const coarseTarget = Math.max(1200, Math.floor(indices.length * .01 / 3) * 3);
    [simplified, coarseError] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, coarseTarget, .003);
  }
  if (simplified.length > 240) {
    const normals = primitive.getAttribute("NORMAL")?.getArray();
    const target = Math.max(120, Math.floor(simplified.length * targetRatio / 3) * 3);
    const result = normals
      ? MeshoptSimplifier.simplifyWithAttributes(simplified, positions, 3, normals, 3, [.15, .15, .15], null, target, targetError, ["Permissive"])
      : MeshoptSimplifier.simplify(simplified, positions, 3, target, targetError, ["Permissive"]);
    simplified = result[0];
    maxRelativeError = Math.max(maxRelativeError, coarseError + result[1]);
  }
  const map = new Map(), used = [];
  const compact = Uint32Array.from(simplified, old => {
    if (!map.has(old)) { map.set(old, map.size); used.push(old); }
    return map.get(old);
  });
  for (const semantic of primitive.listSemantics()) {
    const old = primitive.getAttribute(semantic), array = old.getArray(), width = old.getElementSize();
    const data = new array.constructor(used.length * width);
    used.forEach((index, i) => data.set(array.subarray(index * width, (index + 1) * width), i * width));
    primitive.setAttribute(semantic, doc.createAccessor().copy(old).setArray(data));
  }
  primitive.setIndices(doc.createAccessor().copy(oldIndices).setArray(compact));
  after += compact.length / 3;
}
for (const accessor of root.listAccessors())
  if (accessor.listParents().every(parent => parent.propertyType === "Root")) accessor.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
});
const output = process.argv[3] ?? "src/assets/models/optimized/decorations.glb";
await io.write(output, doc);
const restored = await io.read(output);
assert.equal(restored.getRoot().listMeshes().length, root.listMeshes().length);
const report = {
  source: "SolidCraft MCP", bodies: root.listMeshes().length,
  trianglesBefore: before, trianglesAfter: after,
  maxRelativeError, bytesBefore: (await stat(source)).size, bytesAfter: (await stat(output)).size,
};
await writeFile(process.argv[4] ?? "models/decorations/optimization.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
