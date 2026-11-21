import * as THREE from 'three';
import {STELLAR_DRAIN_DURATION} from './stellar-event.js';
const ramp=(t,a,b)=>THREE.MathUtils.smoothstep(t,a,b);
export function sampleContainmentInjection(showTime,reactivation) {
  if(Number.isFinite(reactivation))return {
    charge:ramp(reactivation,0,4)*(1-ramp(reactivation,8,13)),
    retract:1-ramp(reactivation,0,3),
    arm:-.11*ramp(reactivation,0,3)+.35*ramp(reactivation,3,6)*(1-ramp(reactivation,15,22)),
    transfer:[0,1,2].map(i=>THREE.MathUtils.clamp((reactivation-3-i*.3)/3.2,0,1)),
    ignition:1,active:reactivation<22,
  };
  if(!Number.isFinite(showTime))return {charge:0,retract:0,arm:0,transfer:[0,0,0],ignition:1,active:false};
  const t=showTime+STELLAR_DRAIN_DURATION;
  const capture=ramp(t,0,10.5),release=ramp(t,12,15.5);
  return {
    charge:capture*(1-ramp(t,12.3,15.6)),retract:ramp(t,10.5,13.3),
    arm:-.11*capture*(1-release)+.42*release*(1-ramp(showTime,74,90)),
    transfer:[0,1,2].map(i=>THREE.MathUtils.clamp((t-9.6-i*.35)/3.5,0,1)),
    ignition:1,active:showTime<90,
  };
}
const beamFragment=`
varying vec2 vUv;uniform float uProgress,uPower;
void main(){
  float pulse=exp(-pow((vUv.x-uProgress)/.10,2.0));
  float strands=.60+.40*sin(vUv.y*50.0+vUv.x*33.0);
  gl_FragColor=vec4(vec3(.40,.80,1.0)*3.2,pulse*strands*uPower);
  #include <colorspace_fragment>
}`;
export function createContainmentInjection(model) {
  const root=new THREE.Group();root.name='Transferência dos acumuladores';
  const arms=model.children.filter(o=>o.userData.injectorArm).map(part=>({part,axis:new THREE.Vector3(...part.userData.injectorArm.axis)}));
  const pods=model.children.filter(o=>o.userData.energyPod).map(part=>{
    const materials=new Map(),originals=[];
    part.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const input=mesh.material;originals.push([mesh,input]);
      if(!materials.has(input)) {
        const material=input.clone();delete material.userData.nightGlow;
        material.userData.storedEnergy=true;
        materials.set(input,{material,color:material.color.clone(),cap:/Power/.test(material.name)});
      }
      mesh.material=materials.get(input).material;
    });
    return {part,home:part.position.clone(),scale:part.scale.clone(),materials:[...materials.values()],originals};
  });
  const beams=[];
  for(let i=0;i<3;i++) {
    const angle=Math.PI/6+i*Math.PI*2/3;
    const curve=new THREE.CubicBezierCurve3(
      new THREE.Vector3(26.8*Math.cos(angle),5.5,26.8*Math.sin(angle)),
      new THREE.Vector3(19*Math.cos(angle),8.8,19*Math.sin(angle)),
      new THREE.Vector3(6*Math.cos(angle),7.7,6*Math.sin(angle)),new THREE.Vector3(0,6.25,0));
    const material=new THREE.ShaderMaterial({uniforms:{uProgress:{value:0},uPower:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:beamFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,48,.20,6,false),material);
    mesh.name=`Pulso de energia ${i+1}`;
    const packet=new THREE.Mesh(new THREE.SphereGeometry(.60,16,10),new THREE.MeshBasicMaterial({
      color:new THREE.Color(2.5,4,5),toneMapped:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    packet.name=`Carga ejetada ${i+1}`;root.add(mesh,packet);beams.push({mesh,packet,curve});
  }
  const blue=new THREE.Color('#16aaff'),white=new THREE.Color('#f4fdff'),color=new THREE.Color();
  function update(pose,animate=true) {
    for(const {part,axis} of arms)part.quaternion.setFromAxisAngle(axis,pose.arm);
    for(const pod of pods) {
      const q=pose.retract,inward=new THREE.Vector3(-pod.home.x,0,-pod.home.z).normalize();
      pod.part.position.copy(pod.home).addScaledVector(inward,.85*q);
      pod.part.scale.set(pod.scale.x*(1-.55*q),pod.scale.y*(1-.96*q),pod.scale.z*(1-.55*q));
      const power=pose.charge*(1-.65*q);
      color.copy(blue).lerp(white,pose.charge**2);
      for(const {material,color:base,cap} of pod.materials) {
        material.color.copy(base).lerp(white,power*.38);
        material.emissive.copy(color);material.emissiveIntensity=(cap ? .22 : .015)+6*power**2;
      }
    }
    root.visible=false;
    for(const [i,{mesh,packet,curve}] of beams.entries()) {
      const progress=pose.transfer[i],visible=progress>0&&progress<1;
      mesh.visible=packet.visible=visible;
      mesh.material.uniforms.uProgress.value=progress;mesh.material.uniforms.uPower.value=animate ? .95 : .45;
      packet.position.copy(curve.getPoint(progress));root.visible||=visible;
    }
    root.userData.charge=pose.charge;root.userData.retracted=pose.retract;
  }
  function dispose() {
    for(const {part} of arms)part.quaternion.identity();
    for(const pod of pods) {
      pod.part.position.copy(pod.home);pod.part.scale.copy(pod.scale);
      for(const [mesh,original] of pod.originals)mesh.material=original;
      for(const {material} of pod.materials)material.dispose();
    }
  }
  return {root,update,dispose};
}

// Expand the radius, preserving the ring's radial thickness and vertical clearance.
export function createExpandingCrown(crown,homeRadius,landingRadius=34.7) {
  const meshes=[];
  crown.traverse(part=>{
    if(!part.isMesh)return;
    const position=part.geometry.attributes.position;
    meshes.push({part,position,original:Float32Array.from(position.array)});
  });
  let last=-1;
  return progress=>{
    const p=THREE.MathUtils.clamp(progress,0,1);if(last===p)return;
    const delta=(landingRadius-homeRadius)*p;
    for(const {part,position,original} of meshes) {
      for(let i=0;i<position.count;i++) {
        const x=original[i*3],z=original[i*3+2],r=Math.hypot(x,z),factor=r>.01?(r+delta)/r:1;
        position.setXYZ(i,x*factor,original[i*3+1],z*factor);
      }
      position.needsUpdate=true;part.geometry.computeBoundingSphere();part.geometry.computeBoundingBox();
    }
    crown.traverse(part=>{if(part.isPoints&&part.material.uniforms.uRadius)part.material.uniforms.uRadius.value=homeRadius+delta;});
    last=p;crown.userData.containmentRadius=homeRadius+delta;
  };
}
