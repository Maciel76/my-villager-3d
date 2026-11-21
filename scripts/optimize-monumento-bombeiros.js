// Keep the editable Blender and authored GLB intact; build only the web delivery asset.
import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const source = "src/assets/models/monumento-bombeiros.glb";
const output = "src/assets/models/optimized/monumento-bombeiros.glb";
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder,
});
const doc = await io.read(source), root = doc.getRoot();
let before = 0, after = 0, maxRelativeError = 0;
for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const positions = primitive.getAttribute("POSITION").getArray();
  const original = primitive.getIndices(), indices = new Uint32Array(original.getArray());
  before += indices.length / 3;
  let reduced = indices;
  if (indices.length > 960) {
    const target = Math.max(240, Math.floor(indices.length * .30 / 3) * 3);
    const normals = primitive.getAttribute("NORMAL")?.getArray();
    const result = normals
      ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3,
        [.08, .08, .08], null, target, .002, ["Permissive"])
      : MeshoptSimplifier.simplify(indices, positions, 3, target, .002, ["Permissive"]);
    [reduced] = result;
    maxRelativeError = Math.max(maxRelativeError, result[1]);
  }
  const remap = new Map(), used = [];
  const compact = Uint32Array.from(reduced, old => {
    if (!remap.has(old)) { remap.set(old, remap.size); used.push(old); }
    return remap.get(old);
  });
  for (const semantic of primitive.listSemantics()) {
    const old = primitive.getAttribute(semantic), input = old.getArray(), width = old.getElementSize();
    const data = new input.constructor(used.length * width);
    used.forEach((index, i) => data.set(input.subarray(index * width, (index + 1) * width), i * width));
    primitive.setAttribute(semantic, doc.createAccessor().copy(old).setArray(data));
  }
  primitive.setIndices(doc.createAccessor().copy(original).setArray(compact));
  after += compact.length / 3;
}
for (const accessor of root.listAccessors())
  if (accessor.listParents().every(parent => parent.propertyType === "Root")) accessor.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
});
await mkdir("src/assets/models/optimized", { recursive: true });
await io.write(output, doc);
const restored = await io.read(output);
assert.equal(restored.getRoot().listMeshes().length, root.listMeshes().length);
assert(maxRelativeError <= .00201);
const report = {
  source: "Blender MCP • monumento com esculturas revisadas", parts: root.listMeshes().length,
  trianglesBefore: before, trianglesAfter: after, maxRelativeError,
  bytesBefore: (await stat(source)).size, bytesAfter: (await stat(output)).size,
};
await writeFile("models/monumento-bombeiros/web-optimization.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
