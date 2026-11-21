import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { convergence, radial } from "./convergencia.js";
import { STELLAR_ALTITUDE, STELLAR_ARRIVAL, STELLAR_BURST, STELLAR_LAUNCH, STELLAR_LIFT_HEIGHT } from "./stellar-event.js";

const TAU = Math.PI * 2;
const { lerp, smoothstep } = THREE.MathUtils;
const unitY = new THREE.Vector3(0, 1, 0);
const filament = new THREE.Color("#ffcf84");
const violet = new THREE.Color("#9267ff");
const ice = new THREE.Color("#59dfff");

const quad = `
varying vec2 vUv;
void main() {
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const spotVertex = `
varying vec2 vUv;
varying vec3 vView, vNormal;
void main() {
  vUv=uv;
  vec4 view=modelViewMatrix*vec4(position,1.0);
  vView=-view.xyz;
  vNormal=normalMatrix*normal;
  gl_Position=projectionMatrix*view;
}`;

const spotFragment = `
varying vec2 vUv;
varying vec3 vView, vNormal;
uniform vec3 uColor;
uniform float uPower;
void main() {
  float rim=pow(1.0-abs(dot(normalize(vView),normalize(vNormal))),2.0);
  float fade=pow(clamp(vUv.y,0.0,1.0),.86)*(1.0-smoothstep(.82,1.0,vUv.y));
  float current=.86+.14*sin(vUv.y*36.0);
  gl_FragColor=vec4(uColor,fade*current*mix(.15,.45,rim)*uPower);
  #include <colorspace_fragment>
}`;

const haloFragment = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uPower, uTime;
void main() {
  vec2 p=(vUv-.5)*2.0;
  float r=length(p);
  float a=atan(p.y,p.x);
  float lens=pow(max(0.0,cos(a*4.0+.15*uTime)),16.0)
    *exp(-r*5.5)*smoothstep(.07,.27,r);
  float shine=.92*exp(-r*r*22.0)+.37*exp(-r*r*5.6)+lens*.9;
  gl_FragColor=vec4(mix(uColor,vec3(1.0,.94,.82),exp(-r*7.0)),
    shine*(1.0-smoothstep(.7,1.0,r))*uPower);
  #include <colorspace_fragment>
}`;

const fireballFragment = `
varying vec2 vUv;
uniform float uAge, uPower;
void main() {
  vec2 p=(vUv-.5)*2.0;
  float r=length(p), angle=atan(p.y,p.x);
  float expansion=1.0-exp(-uAge*.85);
  float feathers=sin(11.0*angle+uAge*1.4)*.038+cos(19.0*angle-uAge*2.0)*.027;
  float front=r-.10-expansion*.65-feathers*expansion;
  float shock=exp(-pow(front/(.023+expansion*.027),2.0));
  float gas=exp(-pow((front+.13)/(.14+expansion*.10),2.0));
  float knots=.70+.30*sin(13.0*angle+r*34.0+sin(7.0*angle+uAge)*2.8);
  float core=exp(-r*r/(.024+expansion*.045));
  float rays=pow(.5+.5*cos(9.0*angle+sin(3.0*angle)*1.9),12.0)*exp(-r*4.6);
  vec3 color=mix(vec3(.60,.25,1.0),vec3(1.0,.47,.18),clamp(knots+core*.4-.35,0.0,1.0));
  color=mix(color,vec3(.92,.93,1.0),clamp(.80*core+shock*.59,0.0,1.0));
  float alpha=(.80*shock*knots+.42*gas*knots+.85*core*exp(-uAge*.45)+.43*rays)
    *uPower*(1.0-smoothstep(.85,1.0,r));
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

const ejectaVertex = `
attribute vec4 aSeed;
uniform float uAge, uPixelRatio;
varying float vAlpha, vSeed, vRay;
varying vec2 vDirection;
void main() {
  float speed=aSeed.x;
  float travel=56.0*(1.0-exp(-uAge*.48))*speed+uAge*(2.2+speed);
  vec3 p=position*travel;
  p.y-=uAge*uAge*.155;
  p.xz+=vec2(sin(uAge*1.6+aSeed.y*44.0),cos(uAge+aSeed.y*24.0))*uAge*.64;
  vec4 eye=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*eye;
  vec4 center=projectionMatrix*modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
  vec2 direction=gl_Position.xy/gl_Position.w-center.xy/center.w;
  vDirection=normalize(direction+vec2(.00001,0.0));
  vRay=step(.79,aSeed.y)*(1.0-smoothstep(6.0,13.0,uAge));
  gl_PointSize=clamp((2.0+13.0*aSeed.z+18.0*vRay)*175.0/max(-eye.z,1.0),1.0,25.0)*uPixelRatio;
  vAlpha=(1.0-smoothstep(4.2,9.6+6.1*aSeed.w,uAge))
    *smoothstep(0.0,.22,uAge)*(.42+.55*pow(.5+.5*sin(aSeed.y*190.0+uAge*4.1),1.6));
  vSeed=aSeed.y;
}`;

const ejectaFragment = `
varying float vAlpha, vSeed, vRay;
varying vec2 vDirection;
void main() {
  vec2 p=gl_PointCoord-.5;
  float r=length(p);
  float along=dot(p,vec2(vDirection.x,-vDirection.y));
  float across=dot(p,vec2(vDirection.y,vDirection.x));
  float streak=exp(-across*across*680.0)*smoothstep(-.47,-.08,along)*(1.0-smoothstep(.16,.36,along));
  float core=exp(-r*r*39.0);
  float ray=exp(-min(abs(p.x),abs(p.y))*74.0)*exp(-r*5.0);
  vec3 color=mix(vec3(.26,.60,1.0),vec3(1.0,.47,.28),smoothstep(.10,.86,fract(vSeed*6.7)));
  color=mix(color,vec3(1.0,.93,.82),core*.76);
  gl_FragColor=vec4(color,mix(core*.81+ray*.39,streak*.93+core*.21,vRay)*vAlpha*(1.0-smoothstep(.40,.50,r)));
  #include <colorspace_fragment>
}`;

const glow = (color) => new THREE.MeshBasicMaterial({
  color, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0,
});

function shader(parameters, fragmentShader, vertexShader = quad) {
  return new THREE.ShaderMaterial({
    uniforms: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { value }])),
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
  });
}

const torus = (radius, width, arc = TAU) =>
  new THREE.TorusGeometry(radius, width, 7, 112, arc).rotateX(Math.PI / 2);

function lens(edge, y, color) {
  const material = shader({ uPower: 0, uTime: 0, uColor: new THREE.Color(color) }, haloFragment);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(edge, edge), material);
  plane.position.y = y;
  plane.renderOrder = 10;
  return plane;
}

function particles() {
  const count = 2160;
  const positions = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  let key = 5243;
  const next = () => (key = (Math.imul(key, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < count; i++) {
    const theta = i * 2.399963;
    const y = (i % 7 < 4 ? .56 : 1) * (2 * next() - 1);
    const length = Math.sqrt(1 - y * y);
    positions.set([Math.cos(theta) * length, y, Math.sin(theta) * length], i * 3);
    seed.set([.52 + next() * .98, next(), next() ** 3, next()], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  const points = new THREE.Points(geometry, shader({
    uAge: 0, uPixelRatio: Math.min(globalThis.devicePixelRatio ?? 1, 2),
  }, ejectaFragment, ejectaVertex));
  points.frustumCulled = false;
  points.renderOrder = 12;
  return points;
}

export function createStellarEffects() {
  const root = new THREE.Group();
  root.name = "Explosão Estelar";
  const reflectors = new THREE.Group();
  root.add(reflectors);
  const housing = new THREE.CylinderGeometry(.76, 1.13, .58, 12);
  const metal = new THREE.MeshStandardMaterial({ color: "#294058", roughness: .68, metalness: .26 });
  const reflectorsCount = 8;
  const spots = Array.from({ length: reflectorsCount }, (_, i) => {
    const theta = i * TAU / reflectorsCount + .12;
    const [x, z] = radial(33.34, theta);
    const fixture = new THREE.Mesh(housing, metal);
    fixture.position.set(x, 1.33, z);
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(.71, 20).rotateX(-Math.PI / 2), glow("#ffd9a5"));
    diffuser.position.set(x, 1.64, z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.58, 6.9, 1, 24, 1, true),
      shader({ uPower: 0, uColor: filament.clone() }, spotFragment, spotVertex));
    const splash = lens(10.5, 1.25, "#ffc47e");
    splash.position.set(x, 1.25, z);
    splash.rotation.x = -Math.PI / 2;
    reflectors.add(fixture, diffuser, cone, splash);
    return { diffuser, cone, splash, theta };
  });

  const escalator = new THREE.Group();
  escalator.name = "Anéis da escada estelar";
  root.add(escalator);
  const ringCount = 17;
  const ringStart = 24;
  const ringFormationTime = 1.35;
  const firstRingHeight = convergence.crownY + 17.5;
  const ringGeo = torus(1, .018);
  const firstArc = torus(1, .027, Math.PI * .47);
  const oppositeArc = firstArc.clone().rotateY(Math.PI);
  const arcGeo = mergeGeometries([firstArc, oppositeArc]);
  firstArc.dispose();
  oppositeArc.dispose();
  const elevator = Array.from({ length: ringCount }, (_, i) => {
    const fraction = i / (ringCount - 1);
    const height = lerp(firstRingHeight, STELLAR_ALTITUDE, fraction);
    const startsAt = lerp(ringStart, STELLAR_LAUNCH - 4 - ringFormationTime, fraction);
    const radius = lerp(13.4, 11.8, fraction);
    const gate = new THREE.Group();
    gate.position.y = height;
    const edge = new THREE.Mesh(ringGeo, glow("#b0bef4"));
    const tracer = new THREE.Mesh(arcGeo, glow(i % 2 ? "#e0bfff" : "#a7eaff"));
    gate.add(edge, tracer);
    escalator.add(gate);
    return { gate, edge, tracer, startsAt, radius };
  });

  const doors = new THREE.Group();
  doors.position.y = convergence.crownY;
  const petalGeo = torus(convergence.crownRadius, .14, TAU / 6 * .9);
  const petalSecondary = torus(convergence.crownRadius - .45, .062, TAU / 6 * .72);
  const petals = Array.from({ length: 6 }, (_, i) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = TAU * i / 6;
    const leaf = new THREE.Group();
    const edge = new THREE.Mesh(petalGeo, glow("#ffc989"));
    const inner = new THREE.Mesh(petalSecondary, glow("#c7acff"));
    inner.rotation.y = .10;
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(.49), glow("#fff1cb"));
    tip.position.set(convergence.crownRadius, 0, 0);
    leaf.add(edge, inner, tip);
    pivot.add(leaf);
    doors.add(pivot);
    return { leaf, edge, inner, tip };
  });
  root.add(doors);

  const trail = new THREE.Mesh(new THREE.CylinderGeometry(.95, 5.2, 1, 32, 1, true)
    .rotateZ(Math.PI), shader({ uPower: 0, uColor: ice.clone() }, spotFragment, spotVertex));
  trail.renderOrder = 9;
  trail.name = "Rastro do disparo";
  root.add(trail);
  const ignition = lens(56, STELLAR_LIFT_HEIGHT, "#92d9ff");
  ignition.name = "Impulso de luz";
  root.add(ignition);

  const sky = new THREE.Group();
  sky.name = "Explosão no alto do feixe";
  sky.position.y = STELLAR_ALTITUDE;
  sky.scale.setScalar(1.75);
  const flash = lens(122, 0, "#a6caff");
  const fireball = new THREE.Mesh(new THREE.PlaneGeometry(142, 142), shader({ uAge: 0, uPower: 0 }, fireballFragment));
  fireball.renderOrder = 9;
  const debris = particles();
  sky.add(fireball, flash, debris);
  root.add(sky);

  const origin = new THREE.Vector3();
  const target = new THREE.Vector3();
  const axis = new THREE.Vector3();
  function update(elapsed, state, cameraPosition, sunHeight, animate) {
    reflectors.visible = state.reflector > 0;
    if (reflectors.visible) {
      for (const [i, { diffuser, cone, splash, theta }] of spots.entries()) {
        const power = smoothstep(state.reflector, i / reflectorsCount, (i + .68) / reflectorsCount);
        cone.visible = splash.visible = power > 0;
        diffuser.material.opacity = power;
        if (!power) continue;
        const drift = animate ? Math.sin(elapsed * .31 + i) * .37 : 0;
        const [x, z] = radial(4.2 + state.charge * 3.4, theta + Math.PI + drift);
        origin.copy(diffuser.position);
        target.set(x, 44 + 14 * state.charge + Math.sin(i * 2.7) * 9, z);
        axis.subVectors(origin, target);
        cone.scale.y = axis.length();
        cone.position.lerpVectors(origin, target, .5);
        cone.quaternion.setFromUnitVectors(unitY, axis.normalize());
        cone.material.uniforms.uPower.value = power * (.86 + state.charge * .24);
        cone.material.uniforms.uColor.value.copy(filament).lerp(i % 2 ? violet : ice, state.charge * .68);
        splash.material.uniforms.uPower.value = power * .69;
      }
    }

    escalator.visible = elapsed >= ringStart && elapsed < 87;
    if (escalator.visible) {
      for (const [i, { gate, edge, tracer, startsAt, radius }] of elevator.entries()) {
        const forming = smoothstep(elapsed, startsAt, startsAt + ringFormationTime);
        const visible = forming * (1 - smoothstep(elapsed, 65, 87));
        gate.visible = visible > .003;
        if (!gate.visible) continue;
        const pulse = state.launch > 0 && elapsed < STELLAR_BURST
          ? Math.exp(-Math.abs(gate.position.y - sunHeight) / 26) : 0;
        gate.scale.setScalar(radius * lerp(.46, 1, forming));
        gate.rotation.y = i * .45 + (animate ? elapsed * (.14 + i * .086) * (i % 2 ? -1 : 1) : 0);
        edge.material.opacity = visible * (.62 + pulse * .32);
        tracer.material.opacity = visible * (.68 + pulse * .25);
      }
    }

    doors.visible = state.crown > 0;
    if (doors.visible) {
      doors.rotation.y = animate ? -elapsed * (.115 + state.charge * .04) : 0;
      for (const { leaf, edge, inner, tip } of petals) {
        leaf.position.x = state.doors * 6.2;
        leaf.position.y = state.doors * 2.5;
        leaf.rotation.z = state.doors * .35;
        edge.material.opacity = state.crown * .88;
        inner.material.opacity = state.crown * .68;
        tip.material.opacity = state.crown;
      }
    }

    const sinceLaunch = elapsed - STELLAR_LAUNCH;
    const release = smoothstep(sinceLaunch, 0, .065) * (1 - smoothstep(sinceLaunch, .12, .68));
    const buildUp = state.ringDischarge * (1 - smoothstep(sinceLaunch, 0, .08));
    const ignitionPower = animate ? release * 1.28 + buildUp * .32 : release * .34;
    ignition.visible = ignitionPower > .003;
    if (ignition.visible) {
      ignition.lookAt(cameraPosition);
      ignition.material.uniforms.uPower.value = ignitionPower;
    }
    trail.visible = state.launch > 0 && elapsed < STELLAR_ARRIVAL + .85;
    if (trail.visible) {
      const bottom = Math.max(STELLAR_LIFT_HEIGHT, sunHeight - lerp(112, 430, state.launch));
      trail.scale.y = Math.max(1, sunHeight - bottom);
      trail.position.y = (sunHeight + bottom) * .5;
      trail.material.uniforms.uPower.value = (1 - smoothstep(elapsed, STELLAR_ARRIVAL, STELLAR_ARRIVAL + .85)) *
        (animate ? 2.35 : .65);
    }
    const age = elapsed - STELLAR_BURST;
    sky.visible = age >= -.4 && age < 16;
    if (!sky.visible) return;
    fireball.lookAt(cameraPosition);
    flash.lookAt(cameraPosition);
    flash.visible = age < 4 && state.flare > .005;
    flash.material.uniforms.uPower.value = state.flare * (animate ? 1.48 : .48);
    flash.material.uniforms.uTime.value = animate ? elapsed : 0;
    fireball.visible = age >= 0 && age < 8;
    fireball.material.uniforms.uAge.value = Math.max(0, animate ? age : Math.min(age, 2));
    fireball.material.uniforms.uPower.value = smoothstep(age, 0, .36) * (1 - smoothstep(age, .8, 7.6)) * (animate ? 1 : .5);
    debris.visible = age > 0 && age < 16;
    debris.material.uniforms.uAge.value = animate ? age : Math.min(age, 4);
  }

  return { root, update };
}
