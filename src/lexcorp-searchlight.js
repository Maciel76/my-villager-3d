import * as THREE from "three";

function glareTexture() {
  const pixels=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const d=Math.hypot((x-15.5)/16,(y-15.5)/16),i=(y*32+x)*4;
    pixels.set([230,245,255,Math.round(Math.max(0,1-d)**3*255)],i);
  }
  const texture=new THREE.DataTexture(pixels,32,32);texture.needsUpdate=true;return texture;
}

export function addLexCorpSearchlightFixture(helicopter) {
  if(helicopter.getObjectByName("LexCorp searchlight mount"))return;
  const mount=new THREE.Group();mount.name="LexCorp searchlight mount";mount.position.set(0,.4,1.1);
  const housing=new THREE.Mesh(new THREE.SphereGeometry(.19,16,10),new THREE.MeshStandardMaterial({color:"#26343d",roughness:.4,metalness:.55}));
  housing.name="LexCorp searchlight housing";mount.add(housing);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.045,24),new THREE.MeshBasicMaterial({color:"#ecf7ff",toneMapped:false}));
  lens.name="LexCorp searchlight lens";lens.position.y=-.17;mount.add(lens);
  const glare=new THREE.Sprite(new THREE.SpriteMaterial({map:glareTexture(),color:"#d9eeff",transparent:true,depthWrite:false,toneMapped:false,opacity:0,blending:THREE.AdditiveBlending}));
  glare.name="LexCorp searchlight glare";glare.position.y=-.2;glare.scale.setScalar(1.1);mount.add(glare);
  helicopter.add(mount);
}

export function createLexCorpSearchlight(scene, helicopter, {groundHeight=()=>0}={}) {
  addLexCorpSearchlightFixture(helicopter);
  const mount=helicopter.getObjectByName("LexCorp searchlight mount"),lens=mount.getObjectByName("LexCorp searchlight lens"),glare=mount.getObjectByName("LexCorp searchlight glare");
  const originalLens=lens.material,originalGlare=glare.material;
  lens.material=originalLens.clone();glare.material=originalGlare.clone();
  const root=new THREE.Group();root.name="Holofote de busca LexCorp";scene.add(root);
  const light=new THREE.SpotLight("#e3f2ff",0,180,.17,.5,2);light.name="Refletor móvel LexCorp";
  // Keep the light in the shader with zero intensity while parked. This avoids
  // recompiling every city material at each takeoff and touchdown.
  light.visible=true;light.castShadow=false;root.add(light,light.target);
  const power={value:0},time={value:0};
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.007,1,1,40,1,true).translate(0,-.5,0),new THREE.ShaderMaterial({
    uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),power,time},
    vertexShader:`varying vec2 beamUv; varying vec3 beamNormal, beamView;
      #include <fog_pars_vertex>
      void main(){beamUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);beamNormal=normalize(normalMatrix*normal);beamView=-mvPosition.xyz;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float power,time; varying vec2 beamUv; varying vec3 beamNormal,beamView;
      #include <fog_pars_fragment>
      void main(){float face=pow(abs(dot(normalize(beamNormal),normalize(beamView))),.7);
        float distanceFade=pow(max(.0,beamUv.y),.22);float grain=.94+.06*sin(beamUv.y*155.+time*.4);
        gl_FragColor=vec4(.76,.88,1.,power*face*distanceFade*grain);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,fog:true,
  }));
  beam.name="Facho visível do refletor LexCorp";beam.renderOrder=5;root.add(beam);
  const source=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3();
  const down=new THREE.Vector3(0,-1,0),parentRotation=new THREE.Quaternion(),headRotation=new THREE.Quaternion(),ray=new THREE.Raycaster();
  const status={source:new THREE.Vector3(),target:new THREE.Vector3(),intensity:0,distance:0,hit:null};
  function hide() {light.intensity=0;beam.visible=false;glare.material.opacity=0;lens.material.color.set("#000000");status.intensity=0;}
  function update(pose,seconds,nightPower=1,surfaces=[]) {
    if(!pose||pose.landed||pose.rotorSpeed<.1){hide();return;}
    mount.updateWorldMatrix(true,false);
    // Aim in world space: bank and heading changes never point the light into the sky.
    source.set(0,0,0).applyMatrix4(mount.matrixWorld);
    const side=Math.sin(seconds*.62)*14,forward=7+Math.sin(seconds*.31)*7;
    target.set(source.x+Math.sin(pose.yaw)*forward+Math.cos(pose.yaw)*side,0,source.z+Math.cos(pose.yaw)*forward-Math.sin(pose.yaw)*side);
    target.y=groundHeight(target.x,target.z)+.035;
    direction.copy(target).sub(source);const groundDistance=direction.length();direction.normalize();source.addScaledVector(direction,.2);
    ray.set(source,direction);ray.near=.04;ray.far=groundDistance;
    let hit=null;
    if(surfaces.length) {
      const hits=ray.intersectObjects(surfaces.filter(surface=>surface.visible),true);
      hit=hits.find(candidate=>candidate.object.isMesh&&candidate.object.visible&&(!candidate.object.material?.transparent||candidate.object.material.opacity>.6));
      if(hit)target.copy(hit.point);
    }
    direction.copy(target).sub(source);const distance=direction.length();direction.normalize();
    helicopter.getWorldQuaternion(parentRotation);headRotation.setFromUnitVectors(down,direction);
    mount.quaternion.copy(parentRotation).invert().multiply(headRotation);mount.updateWorldMatrix(false,true);
    // A short cutoff at the first roof or wall keeps the beam from continuing
    // through that surface and illuminating a street underneath it.
    const clearance=THREE.MathUtils.smoothstep(distance,.5,4),brightness=(.45+.55*nightPower)*clearance;
    light.position.copy(source);light.target.position.copy(target);light.distance=distance+Math.min(6,distance*.1);
    light.intensity=36000*brightness*Math.min(1,(distance/18)**2);
    beam.visible=brightness>.001;beam.position.copy(source);beam.quaternion.setFromUnitVectors(down,direction);
    beam.scale.set(Math.tan(light.angle)*distance,distance,Math.tan(light.angle)*distance);
    power.value=(.026+.11*nightPower)*clearance;time.value=seconds;
    glare.material.opacity=brightness*.85;lens.material.color.setRGB(.65+.35*brightness,.78+.22*brightness,1);
    status.source.copy(source);status.target.copy(target);status.intensity=light.intensity;status.distance=distance;status.hit=hit?.object??null;
  }
  function dispose() {
    root.removeFromParent();light.dispose();beam.geometry.dispose();beam.material.dispose();
    lens.material.dispose();glare.material.dispose();lens.material=originalLens;glare.material=originalGlare;
  }
  hide();return{root,light,beam,update,hide,dispose,status};
}
