import assert from "node:assert/strict";
import { readdir, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

// Keep the authored GLBs intact. Encode their original attribute bytes without
// quantization, simplification, texture changes, welding, or vertex reordering.
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder,
});
const source = resolve("src/assets/models");
const destination = resolve(source, "optimized");
await mkdir(destination, { recursive: true });
let before = 0, after = 0;
for (const name of (await readdir(source)).filter(n => n.endsWith(".glb") && n !== "palacio-oriental.glb")) {
  const original = await io.read(resolve(source, name));
  original.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });
  const path = resolve(destination, name);
  await io.write(path, original);
  const restored = await io.read(path);
  const originalMeshes = original.getRoot().listMeshes();
  const restoredMeshes = restored.getRoot().listMeshes();
  assert.equal(originalMeshes.length, restoredMeshes.length);
  originalMeshes.forEach((mesh, i) => mesh.listPrimitives().forEach((primitive, j) => {
    const decoded = restoredMeshes[i].listPrimitives()[j];
    assert.equal(primitive.getMaterial()?.getName(), decoded.getMaterial()?.getName());
    for (const semantic of primitive.listSemantics()) {
      const input = primitive.getAttribute(semantic), output = decoded.getAttribute(semantic);
      assert.deepEqual(input.getArray(), output.getArray(), `${name}: ${semantic} changed`);
      assert.equal(input.getNormalized(), output.getNormalized());
    }
    const input = primitive.getIndices()?.getArray(), output = decoded.getIndices()?.getArray();
    assert.equal(input?.length, output?.length);
    // Meshopt may cyclically rotate triangle indices (a,b,c -> c,a,b).
    // The same vertices, winding, triangle order, and all attributes remain.
    if (input) for (let k = 0; k < input.length; k += 3)
      assert.ok([0, 1, 2].some(r => [0, 1, 2].every(t => input[k + t] === output[k + (t + r) % 3])));
  }));
  const from = (await stat(resolve(source, name))).size, to = (await stat(path)).size;
  before += from; after += to;
  console.log(`${name}: ${from} → ${to} bytes; decoded geometry is identical`);
}
console.log(`Total: ${before} → ${after} bytes (${(100 * (1 - after / before)).toFixed(1)}% smaller)`);
