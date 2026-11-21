import * as THREE from 'three';
import { optimizeBuildingTemplates } from './building-batches.js';
import { markNightLight } from './daylight.js';

const hardware=new Map();
let environment;
function reflections() {
  if(environment||typeof document==='undefined')return environment;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,256);
  for(const [at,color] of [[0,'#48678c'],[.42,'#d6e9ee'],[.53,'#fff2cd'],[.67,'#788c82'],[1,'#253644']])g.addColorStop(at,color);
  c.fillStyle=g;c.fillRect(0,0,512,256);
  environment=new THREE.CanvasTexture(canvas);environment.mapping=THREE.EquirectangularReflectionMapping;environment.colorSpace=THREE.SRGBColorSpace;
  return environment;
}
function metadata(item) {
  const data=item.userData.gameUserData;
  if(typeof data==='string')Object.assign(item.userData,JSON.parse(data));
  delete item.userData.gameUserData;
}
function compact(group,projectTexture,skipHinges=false) {
  group.updateWorldMatrix(true,true);
  const inverse=group.matrixWorld.clone().invert(),flat=new THREE.Group(),old=[];
  group.traverse(part=>{
    if(!part.isMesh)return;
    if(skipHinges)for(let parent=part.parent;parent!==group;parent=parent.parent)
      if(parent.userData.hinge||parent.userData.injectorArm||parent.userData.energyPod)return;
    old.push(part);
    const geometry=part.geometry.clone();
    // Restore float attributes before baking transforms from KHR_mesh_quantization.
    for(const key of ['position','normal','uv']) {
      const input=geometry.attributes[key];if(!input||input.array instanceof Float32Array)continue;
      const values=new Float32Array(input.count*input.itemSize);
      for(let i=0;i<input.count;i++)for(let j=0;j<input.itemSize;j++)values[i*input.itemSize+j]=input.getComponent(i,j);
      geometry.setAttribute(key,new THREE.BufferAttribute(values,input.itemSize));
    }
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld));
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
    if(!geometry.attributes.uv)projectTexture(geometry);
    const mesh=new THREE.Mesh(geometry,part.material);mesh.name=part.name;
    mesh.userData={...part.userData};mesh.castShadow=part.castShadow;mesh.receiveShadow=part.receiveShadow;flat.add(mesh);
  });
  optimizeBuildingTemplates({component:flat});
  for(const part of old)part.removeFromParent();
  group.add(...flat.children.slice());
}
export function prepareRefinedConvergence(gltf,projectTexture) {
  const model=gltf.scene.getObjectByName('CONVERGENCE_STATIC');
  if(!model)throw new Error('A Convergência exportada do Blender não contém a estrutura principal.');
  gltf.scene.traverse(metadata);
  const finishes=new Map(),env=reflections();
  gltf.scene.traverse(part=>{
    if(!part.isMesh)return;
    const input=part.material;
    if(Array.isArray(input))throw new Error('Acabamentos devem estar separados no modelo da Convergência.');
    if(!finishes.has(input)) {
      const material=input.clone();metadata(material);
      if(/CONV \| Power/.test(material.name))markNightLight(material,1.6);
      if(material.metalness>.35&&env){material.envMap=env;material.envMapIntensity=.8;}
      finishes.set(input,material);
    }
    part.material=finishes.get(input);
    part.castShadow=!part.userData.groundCover&&!part.material.transparent&&!part.material.userData.nightGlow;
    part.receiveShadow=!part.material.transparent;
  });
  const hinges=model.children.filter(part=>part.userData.hinge);
  if(hinges.length!==6)throw new Error(`A Convergência precisa de seis braços articulados; recebeu ${hinges.length}.`);
  for(const hinge of hinges)compact(hinge,projectTexture);
  for(const part of model.children.filter(o=>o.userData.injectorArm||o.userData.energyPod))compact(part,projectTexture);
  compact(model,projectTexture,true);
  for(const slot of ['ORBIT_1','ORBIT_2','ORBIT_3','CROWN']) {
    const component=gltf.scene.getObjectByName('EFFECT_'+slot);
    if(!component)throw new Error('Componente de contenção ausente: '+slot);
    compact(component,projectTexture);component.removeFromParent();
    component.position.set(0,0,0);component.quaternion.identity();component.scale.setScalar(1);
    hardware.set(slot,component);
  }
  model.removeFromParent();model.name='A Convergência';model.userData.hasMovingParts=true;
  model.userData.blenderRevision='confinamento-estelar-v2';
  return model;
}

// Each effect owns its GPU resources; shop previews can be disposed independently.
export function cloneConvergenceHardware(slot) {
  const template=hardware.get(slot);if(!template)return null;
  const model=template.clone(),materials=new Map(),powered=[];
  model.name='Confinamento | '+slot;
  model.traverse(part=>{
    if(!part.isMesh)return;
    part.geometry=part.geometry.clone();part.castShadow=false;part.receiveShadow=true;
    const input=part.material;
    if(!materials.has(input)) {
      const material=input.clone();delete material.userData.nightGlow;
      materials.set(input,material);powered.push({material,color:material.color.clone(),
        emission:material.emissiveIntensity,reflection:material.envMapIntensity});
    }
    part.material=materials.get(input);
  });
  return {model,powered};
}
export function powerConvergenceHardware(component,power) {
  if(!component)return;
  const p=THREE.MathUtils.clamp(power,0,1);
  for(const {material,color,emission,reflection} of component.powered) {
    material.color.copy(color).multiplyScalar(.38+.62*p);
    material.emissiveIntensity=emission*p;
    material.envMapIntensity=reflection*(.25+.75*p);
  }
}
