import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS,EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder,MeshoptEncoder } from 'meshoptimizer';
import { weld,reorder,quantize } from '@gltf-transform/functions';
import { stat,writeFile } from 'node:fs/promises';
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder,
});
const source='src/assets/models/convergencia-refinada.glb',output='src/assets/models/optimized/convergencia-refinada.glb';
const doc=await io.read(source);
await doc.transform(weld(),reorder({encoder:MeshoptEncoder,target:'size'}),quantize({
  pattern:/^(POSITION|NORMAL)$/,quantizePosition:16,quantizeNormal:12,
}));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
await io.write(output,doc);
let triangles=0;
for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())triangles+=(primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION').getCount())/3;
const report={source:'Modelo do jogo refinado no Blender',bytesBefore:(await stat(source)).size,
  bytesAfter:(await stat(output)).size,triangles,meshes:doc.getRoot().listMeshes().length,
  materials:doc.getRoot().listMaterials().length,textures:doc.getRoot().listTextures().length};
await writeFile('models/convergencia-blender/web-export.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
