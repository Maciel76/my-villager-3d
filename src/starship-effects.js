import * as THREE from "three";
import { starshipMissionClip } from "./starship.js";
import { sampleStarshipMission, starshipElapsed, STARSHIP_DURATION } from "./starship-mission.js";

const plumeFragment=`
varying vec2 vUv;
uniform float uTime,uPower;
void main(){
  float along=1.0-vUv.y;
  float ribbons=.65+.35*sin(vUv.x*63.0+along*21.0-uTime*24.0);
  float diamonds=pow(.5+.5*sin(along*39.0-uTime*5.0),3.0);
  vec3 blue=mix(vec3(.10,.38,1.0),vec3(.65,.88,1.0),diamonds);
  vec3 fire=mix(vec3(1.0,.08,.008),vec3(1.0,.68,.09),ribbons);
  vec3 color=mix(blue,fire,smoothstep(.12,.85,along));
  float a=pow(1.0-along,.45)*(.25+.55*ribbons)*uPower;
  gl_FragColor=vec4(color*(1.6+.5*diamonds),a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const cloudVertex=`
attribute vec3 seed;
attribute float kind;
uniform float uTime,uSmoke,uDust,uVapor,uPixelRatio,uViewportHeight;
varying float vOpacity,vKind;
void main(){
  float power=kind<.5?uSmoke:kind<1.5?uVapor:uDust;
  float age=fract(seed.x+uTime*(kind<.5?.075:.11));
  float radius=kind<.5?5.0+age*31.0:kind<1.5?2.0+age*4.0:4.0+age*18.0;
  float angle=seed.y*6.283185;
  vec3 p=position+vec3(cos(angle)*radius,(kind<.5?age*12.0:age*5.0)+seed.z*3.0,sin(angle)*radius);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((kind<.5?15.0:kind<1.5?4.0:10.0)*uPixelRatio*uViewportHeight*.5*projectionMatrix[1][1]/max(1.0,-mv.z),1.0,255.0);
  vOpacity=power*sin(age*3.14159)*(.17+seed.z*.16);
  vKind=kind;
}`;
const cloudFragment=`
varying float vOpacity,vKind;
void main(){
  vec2 p=(gl_PointCoord-.5)*2.0;
  float r=length(p),fluff=1.0-smoothstep(.25,1.0,r);
  vec3 color=vKind>1.5?vec3(.62,.56,.43):vec3(.73,.82,.88);
  gl_FragColor=vec4(color,fluff*fluff*vOpacity);
  #include <colorspace_fragment>
}`;
function effects() {
  const root=new THREE.Group();root.name='Starship | efeitos da missão';root.matrixAutoUpdate=false;
  const flameMaterial=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uPower:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:plumeFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  });
  const jets=['booster','ship'].map(name=>{
    const group=new THREE.Group();group.name='Starship | '+name+' plume';
    const geometry=new THREE.ConeGeometry(1,1,28,8,true).translate(0,-.5,0);
    const material=flameMaterial.clone(),mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
    group.add(mesh);root.add(group);return {group,mesh,material};
  });
  flameMaterial.dispose();
  const seeds=[],positions=[],kinds=[];
  let seed=1359;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<150;i++) {
    const kind=i<90?0:i<120?1:2;
    positions.push(...(kind===0?[-5,1,0]:kind===1?[-5,58+(i%3)*18,0]:[21,1.4,6.5]));
    seeds.push(random(),random(),random());kinds.push(kind);
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
    .setAttribute('seed',new THREE.Float32BufferAttribute(seeds,3)).setAttribute('kind',new THREE.Float32BufferAttribute(kinds,1));
  const clouds=new THREE.Points(geometry,new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uSmoke:{value:0},uDust:{value:0},uVapor:{value:0},uPixelRatio:{value:Math.min(globalThis.devicePixelRatio??1,2)},uViewportHeight:{value:globalThis.innerHeight??1000}},
    vertexShader:cloudVertex,fragmentShader:cloudFragment,transparent:true,depthWrite:false,
  }));
  clouds.frustumCulled=false;root.add(clouds);
  const heat=new THREE.Mesh(new THREE.SphereGeometry(5.1,24,16),new THREE.MeshBasicMaterial({
    color:'#ff6b24',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  }));heat.scale.set(1,4.7,1);heat.frustumCulled=false;root.add(heat);
  const ring=new THREE.Mesh(new THREE.RingGeometry(1,1.1,64),new THREE.MeshBasicMaterial({
    color:'#b4eeff',side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,
  }));ring.rotation.x=-Math.PI/2;ring.position.set(21,1.4,6.5);root.add(ring);
  const light=new THREE.PointLight('#ff9b45',0,150,1.5);root.add(light);
  return {root,jets,clouds,heat,ring,light,dispose(){root.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});root.removeFromParent();}};
}
export function createStarshipAnimation(scene) {
  const bases=new Map(),v=new THREE.Vector3(),q=new THREE.Quaternion();
  function add(model,launchAt) {
    const clip=starshipMissionClip();
    if(!clip)throw new Error('Animação de voo indisponível.');
    const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    action.play();action.paused=true;
    const fx=effects();scene.add(fx.root);
    const entry={model,mixer,action,fx,launchAt,last:null};bases.set(model,entry);
    apply(entry,launchAt?STARSHIP_DURATION:0,false);
  }
  function apply(entry,t,animate=true) {
    const {model,mixer,action,fx}=entry,state=sampleStarshipMission(t);
    action.enabled=true;action.paused=true;action.time=Math.min(t,STARSHIP_DURATION);mixer.update(0);
    const airborne=t>0&&t<STARSHIP_DURATION;
    if(entry.airborne!==airborne) {
      for(const name of ['BOOSTER','SHIP']) model.getObjectByName(name).traverse(part=>{if(part.isMesh)part.castShadow=!airborne;});
      entry.airborne=airborne;
    }
    model.updateWorldMatrix(true,true);fx.root.matrix.copy(model.matrixWorld);fx.root.matrixWorldNeedsUpdate=true;
    for(const [i,key] of ['booster','ship'].entries()) {
      const jet=fx.jets[i],power=state[key+'Thrust'];
      jet.group.position.fromArray(state[key].position);
      jet.group.quaternion.setFromEuler(new THREE.Euler(...state[key].rotation));
      jet.mesh.position.set(0,-1.2,0);jet.mesh.scale.set((i?2.2:4)*power,(i?25:48)*power, (i?2.2:4)*power);
      jet.group.visible=power>.001;jet.material.uniforms.uTime.value=animate?t:0;jet.material.uniforms.uPower.value=power;
    }
    const uniforms=fx.clouds.material.uniforms;
    uniforms.uViewportHeight.value=globalThis.innerHeight??1000;
    uniforms.uTime.value=animate?t:0;uniforms.uSmoke.value=state.smoke;
    uniforms.uDust.value=state.landingDust;uniforms.uVapor.value=t<16?state.vapor:0;
    fx.heat.position.fromArray(state.ship.position);
    q.setFromEuler(new THREE.Euler(...state.ship.rotation));fx.heat.quaternion.copy(q);
    fx.heat.position.add(v.set(0,24,0).applyQuaternion(q));fx.heat.material.opacity=state.reentry*(animate?.17:.08);
    fx.ring.material.opacity=state.celebration*.55;fx.ring.scale.setScalar(12+(t-98)*5);
    fx.ring.visible=state.celebration>0;
    const landing=state.shipThrust>0&&t>82;
    fx.light.position.fromArray(landing?state.ship.position:state.booster.position);
    fx.light.intensity=landing?state.shipThrust*65:state.boosterThrust*90;
    fx.light.visible=fx.light.intensity>.01;
    entry.state=state;entry.last=t;
  }
  function update(now,construction,animate=true) {
    let running=false,changed=false;
    for(const entry of bases.values()) {
      const {model,fx,launchAt}=entry;
      if(!model.visible||construction.has(model)){fx.root.visible=false;continue;}
      const t=launchAt?Math.min(STARSHIP_DURATION,starshipElapsed(launchAt,now)):0;
      const active=Boolean(launchAt)&&t<STARSHIP_DURATION;
      fx.root.visible=active;
      if(entry.last!==t){apply(entry,t,animate);changed=true;}
      running||=active;
    }
    return {running,changed};
  }
  function setEvent(model,launchAt) {
    const entry=bases.get(model);if(!entry)return;
    entry.launchAt=launchAt;entry.last=null;apply(entry,0);
  }
  function remove(model) {
    const entry=bases.get(model);if(!entry)return;
    entry.fx.dispose();entry.mixer.stopAllAction();entry.mixer.uncacheRoot(model);bases.delete(model);
  }
  function focus(model,now) {
    const entry=bases.get(model);if(!entry)return null;
    const state=sampleStarshipMission(entry.launchAt?starshipElapsed(entry.launchAt,now):0);
    const vehicle=state.seconds<64?state.booster:state.ship;
    const height=state.seconds<34?55:state.seconds<64?32.5:25;
    const center=new THREE.Vector3(0,height,0).applyEuler(new THREE.Euler(...vehicle.rotation));
    return model.localToWorld(new THREE.Vector3(...vehicle.position).add(center));
  }
  function farDistance(camera) {
    let far=0;
    for(const entry of bases.values()) if(entry.launchAt&&entry.last<STARSHIP_DURATION) {
      for(const name of ['BOOSTER','SHIP']) {
        entry.model.getObjectByName(name).getWorldPosition(v);
        far=Math.max(far,camera.position.distanceTo(v)+180);
      }
    }
    return far;
  }
  return {add,remove,setEvent,update,focus,farDistance,state:model=>bases.get(model)?.state,entries:bases};
}
