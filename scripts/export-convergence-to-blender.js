// Export the exact procedural monument currently used by the village.
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createConvergencia,convergenceRibs } from '../src/convergencia.js';
import { createConvergenceEffects } from '../src/convergencia-efeitos.js';
const model=createConvergencia(),fx=createConvergenceEffects();
const materials=[],seen=new Map();
const labels={'434658':'Basalt','252e42':'Graphite','747b85':'Ash','c0b2a7':'CeramicWarm','e0cfc3':'Ceramic','a16a43':'Copper','d29954':'Gold','a89682':'Paving','145777':'Water','5f9eb1':'Ripples','fdb16d':'LightAmber','64a3d8':'LightBlue','cdab82':'Lobby','8babc4':'Glass'};
let n=0,hinge=0,injector=0;
function material(m) {
  if(!seen.has(m)) {
    const index=materials.length;seen.set(m,index);
    const hex=m.color?.getHexString()??'ffbf55';
    materials.push({id:index,name:labels[hex]??(m.userData.nightGlow?'LightAmber':m.isMeshBasicMaterial?'OrbitGold':`Finish_${hex}`),
      color:m.color?.toArray()??[1,.4,.05],metalness:m.metalness??.6,roughness:m.roughness??.4,
      emissive:m.emissive?.toArray()??(m.isMeshBasicMaterial?[.7,.23,.03]:[0,0,0]),
      emissiveIntensity:m.emissiveIntensity??(m.isMeshBasicMaterial ? .8 : 0),opacity:m.opacity,
      transparent:m.transparent,basic:m.isMeshBasicMaterial??false,toneMapped:m.toneMapped,userData:m.userData});
  }
  return seen.get(m);
}
function serialize(o,name) {
  if(o.isPoints||o.material?.isShaderMaterial)return null;
  const out={name:name??(o.userData.hinge?`HINGE_${hinge++}`:o.userData.injectorArm?`INJECTOR_ARM_${injector++}`:o.name||`Mesh_${n++}`),
    position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),userData:o.userData};
  if(o.isMesh){
    const g=o.geometry;out.mesh={positions:Array.from(g.attributes.position.array),
      normals:g.attributes.normal?Array.from(g.attributes.normal.array):null,
      uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,
      indices:g.index?Array.from(g.index.array):null,material:material(o.material)};
  }
  out.children=o.children.map(child=>serialize(child)).filter(Boolean);return out;
}
const data={source:'createConvergencia() from the game',units:'metres',up:'Y',materials,
  static:serialize(model,'CONVERGENCE_STATIC'),
  orbits:[1,2,3].map(i=>serialize(fx.root.getObjectByName(`Órbita ${i}`),`EFFECT_ORBIT_${i}`)),
  crown:serialize(fx.root.getObjectByName('Coroa de luz'),'EFFECT_CROWN'),
  ribs:convergenceRibs().map(r=>({type:r.type,angle:r.angle,width:r.width,thickness:r.thickness,
    points:Array.from({length:37},(_,i)=>r.path.getPoint(i/36).toArray())})),
};
await writeFile('models/convergencia-blender/game-original.json.gz',gzipSync(JSON.stringify(data),{level:9}));
console.log(JSON.stringify({exported:'models/convergencia-blender/game-original.json.gz',materials:materials.length,hinges:hinge}));
fx.dispose();
