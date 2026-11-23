import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { stat, writeFile } from 'node:fs/promises';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const source = 'src/assets/models/base-bombeiros.glb';
const target = 'src/assets/models/optimized/base-bombeiros.glb';
const doc = await io.read(source);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: .15, error: .0008 }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 16, quantizeNormal: 12 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(target, doc);
let triangles = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives())
  triangles += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
const report = { source: 'SolidCraft — quartel de bombeiros',
  bytesBefore: (await stat(source)).size, bytesAfter: (await stat(target)).size,
  meshes: doc.getRoot().listMeshes().length, materials: doc.getRoot().listMaterials().length, triangles };
await writeFile('models/base-bombeiros/web-export.json', JSON.stringify(report, null, 2));
console.log(report);
