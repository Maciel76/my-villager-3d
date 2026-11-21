import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { stat,writeFile } from "node:fs/promises";
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder,
});
const input='src/assets/models/starship.glb',output='src/assets/models/optimized/starship.glb';
const doc=await io.read(input);
const animatedRoots=new Set(['BOOSTER','SHIP','ARM_L','ARM_R','QD']);
for(const animation of doc.getRoot().listAnimations()) {
  animation.setName('StarshipMission');
  for(const channel of animation.listChannels()) {
    const name=channel.getTargetNode()?.getName();
    if(!animatedRoots.has(name) && !(/^LEG_\d$/.test(name)&&channel.getTargetPath()==='scale')) channel.dispose();
  }
  for(const sampler of animation.listSamplers())
    if(!animation.listChannels().some(channel=>channel.getSampler()===sampler)) sampler.dispose();
  const inputs=new Set(animation.listSamplers().map(sampler=>sampler.getInput()));
  const offset=Math.min(...[...inputs].map(accessor=>accessor.getArray()[0]));
  for(const input of inputs) input.setArray(Float32Array.from(input.getArray(),time=>Math.max(0,time-offset)));
}
for(const accessor of doc.getRoot().listAccessors())
  if(accessor.listParents().every(parent=>parent.propertyType==='Root')) accessor.dispose();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
await io.write(output,doc);
const report={bytesBefore:(await stat(input)).size,bytesAfter:(await stat(output)).size,
  animations:doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length})),
  meshes:doc.getRoot().listMeshes().length};
await writeFile('models/starship/web-export.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
