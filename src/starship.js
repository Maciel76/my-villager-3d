import * as THREE from "three";
import { optimizeBuildingTemplates } from "./building-batches.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

export const starship = Object.freeze({width:72,depth:60,height:139.9,landing:[21,3.56,6.5]});
let missionClip,environment;
export const starshipMissionClip = () => missionClip;
function reflections() {
  if(environment || typeof document==='undefined') return environment;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d'),g=c.createLinearGradient(0,0,0,256);
  for(const [at,color] of [[0,'#547e9e'],[.43,'#dbe9f0'],[.53,'#f6e8c4'],[.64,'#7d897b'],[1,'#283a42']])g.addColorStop(at,color);
  c.fillStyle=g;c.fillRect(0,0,512,256);
  environment=new THREE.CanvasTexture(canvas);environment.mapping=THREE.EquirectangularReflectionMapping;
  environment.colorSpace=THREE.SRGBColorSpace;
  return environment;
}
function compactRigidPart(group,projectTexture) {
  group.updateWorldMatrix(true,true);
  const inverse=group.matrixWorld.clone().invert(),meshes=[],flat=new THREE.Group();
  group.traverse(part=>{
    if(!part.isMesh) return;
    for(let parent=part.parent;parent!==group;parent=parent.parent)
      if(/^LEG_/.test(parent.name)) return;
    meshes.push(part);
    const geometry=part.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld));
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
    if(!geometry.attributes.uv) projectTexture(geometry);
    const surface=new THREE.Mesh(geometry,part.material);
    surface.name=part.name;surface.castShadow=part.castShadow;surface.receiveShadow=part.receiveShadow;
    surface.userData={...part.userData};flat.add(surface);
  });
  optimizeBuildingTemplates({rigid:flat});
  for(const part of meshes)part.removeFromParent();
  group.add(...flat.children.slice());
}
export function prepareStarshipModel(gltf,projectTexture) {
  const model=new THREE.Group();model.add(...gltf.scene.children.slice());
  model.name='Base Starship — Porto Aurora';model.userData.hasMovingParts=true;
  missionClip=gltf.animations.find(clip=>clip.name==='StarshipMission');
  if(!missionClip) throw new Error('A animação StarshipMission não foi exportada do Blender.');
  const finishes=new Map(),env=reflections();
  model.traverse(part=>{
    if(!part.isMesh)return;
    const input=part.material;
    if(Array.isArray(input))throw new Error('Acabamento múltiplo inesperado na base Starship.');
    if(!finishes.has(input)) {
      const material=input.clone();
      if(/\| Black/.test(material.name)) material.color.multiplyScalar(2.8);
      if(material.metalness>.4 && env){material.envMap=env;material.envMapIntensity=.72;}
      if(/LightAmber|LightCyan/.test(material.name)) {
        markNightLight(material,2.2);material.emissiveIntensity=.08;
      }
      finishes.set(input,material);
    }
    part.material=finishes.get(input);
    part.userData.groundCover=/STATIC_(Foundation|Apron|ServiceRoad|LandingPad|LandingRing)/.test(part.name);
    part.castShadow=!part.userData.groundCover;part.receiveShadow=true;
  });
  // Preserve the Blender pivot nodes and their clips while merging their rigid geometry.
  for(const name of ['STATIC','BOOSTER','SHIP','ARM_L','ARM_R','QD',...Array.from({length:4},(_,i)=>`LEG_${i}`)]) {
    const node=model.getObjectByName(name);
    if(!node)throw new Error(`Pivô Starship ausente: ${name}`);
    compactRigidPart(node,projectTexture);
  }
  for(const x of [-33,33])for(const z of [-23,-7,8,23])
    addLampEmitter(model,[x,8,z],{color:'#ffd49a',intensity:28,range:13,halo:.4});
  addLampEmitter(model,[21,2,6.5],{color:'#63d9ff',intensity:12,range:12,halo:0});
  return model;
}
