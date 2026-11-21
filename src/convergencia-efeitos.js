import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { convergence, convergenceFalls, createUnlitConvergence, radial } from "./convergencia.js";
import { createStellarEffects } from "./explosao-estelar.js";
import { cloneConvergenceHardware, powerConvergenceHardware } from "./convergencia-hardware.js";
import { sampleContainmentInjection, createContainmentInjection, createExpandingCrown } from "./convergencia-injecao.js";
import { stellarOrbitSpin } from "./convergencia-orbitas.js";
import { STELLAR_ARRIVAL, STELLAR_BEAM_RETURN, STELLAR_BURST, STELLAR_DURATION, STELLAR_LAUNCH, STELLAR_LIFT_HEIGHT,
  STELLAR_REACTIVATION_DURATION, STELLAR_RELIGHT, STELLAR_SHUTDOWN, stellarElapsed, stellarShowElapsed } from "./stellar-event.js";

const TAU = Math.PI * 2;
const SNAPSHOT_TIME = 1.7;
const { lerp, smoothstep } = THREE.MathUtils;
const beltDocks = [
  { radius: 7.65, y: 4.48 }, { radius: 6.65, y: 4.38 }, { radius: 4.94, y: 4.96 },
];
const beltLiftOffsets = [3.2, -2.8, -6.2];
const beltThrustHeights = [13, 22, 30];
const crownDock = { radius: 34.7, y: 1.75 };

function lowerRing(ring, home, dock, descent, radiusScale, opensBelow) {
  const y = lerp(home.y, dock.y, descent);
  // Open again below the narrow tips of the three entry ribs.
  const opening = 1 - smoothstep(y, dock.y, opensBelow);
  const radius = lerp(radiusScale, dock.radius / home.radius, opening);
  ring.position.y = y;
  ring.scale.set(radius, 1, radius);
}

const planeVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const starVertex = `
varying vec3 vPosition, vNormal, vEye;
void main() {
  vPosition = normalize(position);
  vNormal = normalize(normalMatrix * normal);
  vec4 vertex = modelViewMatrix * vec4(position, 1.0);
  vEye = normalize(-vertex.xyz);
  gl_Position = projectionMatrix * vertex;
}`;

const starFragment = `
uniform float uTime, uCharge, uLuminosity;
varying vec3 vPosition, vNormal, vEye;
float hash(vec3 v) { return fract(sin(dot(v,vec3(127.1,311.7,74.7))) * 43758.5453); }
float clouds(vec3 p) {
  vec3 a=floor(p), t=fract(p);
  t=t*t*(3.0-2.0*t);
  float lower=mix(mix(hash(a),hash(a+vec3(1,0,0)),t.x),
    mix(hash(a+vec3(0,1,0)),hash(a+vec3(1,1,0)),t.x),t.y);
  float upper=mix(mix(hash(a+vec3(0,0,1)),hash(a+vec3(1,0,1)),t.x),
    mix(hash(a+vec3(0,1,1)),hash(a+vec3(1,1,1)),t.x),t.y);
  return mix(lower,upper,t.z);
}
void main() {
  vec3 p=normalize(vPosition)*4.6;
  vec3 flow=vec3(clouds(p+uTime*.055),clouds(p*1.77-uTime*.085), clouds(p*.61+28.03));
  float plasma=.55*clouds(p+flow*3.11)+.30*clouds(p*2.7+flow*5.0)+.15*clouds(p*7.7+flow*4.4);
  float filaments=pow(1.0-abs(sin((plasma+.36*flow.x)*15.0)),5.8);
  float grains=clouds(p*31.2+flow*3.1);
  float limb=pow(1.0-abs(dot(normalize(vNormal),normalize(vEye))),2.35);
  vec3 orange=mix(vec3(1.0,.19,.014),vec3(2.0,1.07,.16),smoothstep(.27,.85,plasma));
  vec3 color=orange+vec3(2.1,1.15,.25)*(filaments*.43 + limb*.52 + grains*.16);
  vec3 fusion=mix(vec3(.64,.43,2.0),vec3(2.7,3.4,4.8),plasma*.65+filaments*.25);
  color=mix(color,fusion*(1.05+.6*limb),uCharge*.91);
  gl_FragColor=vec4(color*uLuminosity,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const auraFragment = `
varying vec2 vUv;
uniform float uTime, uCharge, uLuminosity;
void main(){
  vec2 v=(vUv-.5)*2.0;
  float r=length(v);
  float a=atan(v.y,v.x);
  float loops=sin(a*11.0+uTime*.72+r*23.0)*sin(a*17.0-uTime*.56+r*52.0);
  float atmosphere=(1.0-smoothstep(.34,1.0,r))*smoothstep(.24,.43,r);
  float flares=.13*max(0.0,loops)*exp(-abs(r-.49)*8.5);
  vec3 light=mix(vec3(1.0,.33,.065),vec3(1.0,.69,.24),1.0-r);
  light=mix(light,mix(vec3(.47,.31,1.0),vec3(.62,.91,1.0),1.0-r),uCharge);
  gl_FragColor=vec4(light,(atmosphere*.29+flares)*(1.0+uCharge*1.3)*uLuminosity);
  #include <colorspace_fragment>
}`;

const beamFragment = `
varying vec2 vUv;
uniform float uTime, uHeight, uCharge, uBeamPower, uReach;
void main(){
  float width=abs(vUv.x-.5)/(1.0+uCharge*.56);
  float y=vUv.y*uHeight;
  float halo=exp(-width*width*39.0)*(1.0-smoothstep(.14,.5,width));
  float sheath=exp(-width*width*395.0);
  float core=exp(-width*width*2900.0);
  float filament=exp(-pow((vUv.x-.5+.009*sin(y*2.4-uTime*3.0))/.016,2.0));
  float upwards=.84+.16*sin(y*.85-uTime*4.4+width*9.0);
  float entrance=smoothstep(0.0,2.5,y)*(1.0-smoothstep(uReach-.006,uReach,vUv.y));
  float warmth=smoothstep(28.0,55.0,y);
  vec3 aura=mix(vec3(.28,.6,1.0),vec3(1.0,.40,.096),warmth);
  aura=mix(aura,mix(vec3(.48,.20,1.0),vec3(.20,.81,1.0),warmth),uCharge);
  vec3 color=mix(aura,mix(vec3(1.0,.91,.71),vec3(.87,.96,1.0),uCharge),.64*core);
  float opacity=(.13*halo+.38*sheath+.42*core+.21*filament)*upwards*entrance*uBeamPower;
  gl_FragColor=vec4(color,opacity);
  #include <colorspace_fragment>
}`;

const fallsFragment = `
varying vec2 vUv;
uniform float uTime;
uniform float uPhase;
void main(){
  float edge=smoothstep(0.0,.055,vUv.x)*(1.0-smoothstep(.945,1.0,vUv.x));
  float stream=pow(.5+.5*sin(vUv.x*101.0+.32*sin(vUv.y*5.2+uPhase)),2.6);
  float flecks=.5+.5*sin(vUv.x*61.0+uPhase);
  float flow=.72+.28*sin(vUv.y*17.0+uTime*6.4+2.1*sin(vUv.x*39.0)+uPhase);
  float spill=(.31+.41*stream+.09*flecks)*flow;
  float foam=.25*exp(-vUv.y*15.0)+.11*exp(-(1.0-vUv.y)*21.0);
  vec3 color=mix(vec3(.16,.49,.83),vec3(.83,.94,1.0),spill+foam);
  gl_FragColor=vec4(color,edge*(spill+foam+.15));
  #include <colorspace_fragment>
}`;

const sparkVertex = `
attribute vec2 seed;
uniform float uTime;
uniform float uRadius;
uniform float uCloud;
varying float vGlow;
void main(){
  float a=seed.x+uTime*(.22+seed.y*.35);
  float spread=uRadius+.23*sin(seed.y*93.0+uTime*1.6);
  float y=sin(a*2.0+seed.y*48.0+uTime*.8)*uCloud;
  vec3 p=vec3(cos(a)*spread,y,sin(a)*spread);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((9.0+7.0*seed.y)*53.0/max(1.0,-mv.z),2.0,14.0);
  vGlow=.43+.35*sin(a*11.0+seed.y*59.0+uTime*2.1);
}`;

const sparkFragment = `
varying float vGlow;
void main(){
  float r=length(gl_PointCoord-.5)*2.0;
  float a=exp(-r*r*5.0)*(1.0-smoothstep(.6,1.0,r))*vGlow;
  gl_FragColor=vec4(1.0,.69,.30,a);
  #include <colorspace_fragment>
}`;

function additive(uniforms, fragmentShader, vertexShader = planeVertex) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

function torus(radius, tube, material, segments = 120) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, segments).rotateX(Math.PI / 2), material);
}

function makeRing(radius, width, level, m) {
  const rings = new THREE.Group();
  const outside = radius + width / 2, inside = radius - width / 2;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(outside, outside, level, 112, 1, true), m.gold);
  const insideBelt = new THREE.Mesh(new THREE.CylinderGeometry(inside, inside, level, 112, 1, true), m.bronze);
  rings.add(belt, insideBelt);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.RingGeometry(inside, outside, 112).rotateX(-Math.PI / 2), m.gold);
    edge.position.y = side * level * .5;
    rings.add(edge);
    const inlay = torus(side < 0 ? inside - .012 : outside + .015, .048, m.led);
    inlay.position.y = side * level * .5;
    rings.add(inlay);
  }

  const marks = [];
  const size = level * .56;
  const pattern = new THREE.BoxGeometry();
  const count = Math.round(radius * 5.2);
  for (let i = 0; i < count; i++) {
    const angle = TAU * i / count;
    const [x, z] = radial(outside + .018, angle);
    const rotate = Math.PI / 2 - angle;
    const stamp = (u, y, w, h, tilt = 0) => {
      marks.push(pattern.clone().scale(w, h, .027).rotateZ(tilt).translate(u, y, 0)
        .rotateY(rotate).translate(x, 0, z));
    };
    stamp(-.03, 0, .032, size, (i % 4 - 1) * .22);
    stamp(.02, size * .37, size * .62, .034);
    if (i % 3 !== 1) stamp(.04, -size * .30, size * .54, .034, .25 * (i % 2 ? 1 : -1));
    if (i % 4 === 0) stamp(.13, .0, .031, size * .76);
  }
  const lettering = mergeGeometries(marks);
  marks.forEach(mark => mark.dispose());
  pattern.dispose();
  rings.add(new THREE.Mesh(lettering, m.inscription));
  return rings;
}

function sparks(radius, cloud, count, moment) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    seeds[i * 2] = TAU * i / count;
    seeds[i * 2 + 1] = ((i + 7) * 173 % 269) / 269;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 2));
  const particles = new THREE.Points(geometry, additive({
    uRadius: { value: radius }, uCloud: { value: cloud }, uTime: moment,
  }, sparkFragment, sparkVertex));
  particles.frustumCulled = false;
  return particles;
}

export function createConvergenceEffects({ beamHeight = convergence.beamHeight } = {}) {
  const root = new THREE.Group();
  root.name = "Luz da Convergência";
  const timeUniform = { value: SNAPSHOT_TIME };
  const charge = { value: 0 };
  const luminosity = { value: 1 };
  const beamPower = { value: 1 };
  const beamReach = { value: 1 };
  const m = {
    gold: new THREE.MeshBasicMaterial({ color: "#b87b37", side: THREE.DoubleSide }),
    bronze: new THREE.MeshBasicMaterial({ color: "#754315", side: THREE.DoubleSide }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 1.04, .21), toneMapped: false }),
    inscription: new THREE.MeshBasicMaterial({ color: "#ffc877", toneMapped: false }),
  };

  const containmentOrbits = [];
  const ringAxes = convergence.ringRadii.map((radius, index) => {
    const component = cloneConvergenceHardware(`ORBIT_${index + 1}`);
    containmentOrbits.push(component);
    const ring = component?.model ?? makeRing(radius, index ? .48 : .63, index ? .38 : .58, m);
    ring.name = `Órbita ${index + 1}`;
    ring.position.y = convergence.sunY;
    root.add(ring);
    return ring;
  });

  const sunGroup = new THREE.Group();
  sunGroup.name = "Mini-sol";
  sunGroup.position.y = convergence.sunY;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(convergence.sunRadius, 56, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: timeUniform, uCharge: charge, uLuminosity: luminosity }, vertexShader: starVertex, fragmentShader: starFragment,
    }));
  for (let i = 0; i < 4; i++) {
    const prominence = torus(convergence.sunRadius + .075, .026, m.led, 92);
    prominence.rotation.set(.35 + i * .63, i * .63, -.43 - i * .25);
    sunGroup.add(prominence);
  }
  sunGroup.add(sun, sparks(4.46, 1.43, 72, timeUniform));
  root.add(sunGroup);

  const aura = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 19.4), additive({
    uTime: timeUniform, uCharge: charge, uLuminosity: luminosity,
  }, auraFragment));
  aura.position.y = convergence.sunY;
  aura.renderOrder = 6;
  root.add(aura);

  const crown = new THREE.Group();
  crown.position.y = convergence.crownY;
  crown.name = "Coroa de luz";
  const crownLights = [
    torus(convergence.crownRadius, .098, m.led.clone()),
    torus(convergence.crownRadius + .28, .035, m.inscription.clone()),
    sparks(convergence.crownRadius, .27, 85, timeUniform),
  ];
  const crownRest = new THREE.MeshStandardMaterial({ color: "#816342", metalness: .28, roughness: .64 });
  const crownCore = torus(convergence.crownRadius, .085, crownRest);
  crown.add(crownCore, ...crownLights);
  const containmentCrown = cloneConvergenceHardware("CROWN");
  if (containmentCrown) crown.add(containmentCrown.model);
  const expandCrown = createExpandingCrown(crown, convergence.crownRadius, crownDock.radius);
  root.add(crown);

  const pulses = new THREE.Group();
  pulses.name = "Pulsos de reativação";
  pulses.visible = false;
  for (const color of ["#ffc57d", "#bc9dff", "#83d8ff"]) {
    pulses.add(torus(1, .012, new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    }), 76));
  }
  root.add(pulses);

  const beamStart = 1.22;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(12.5, beamHeight - beamStart), additive({
    uTime: timeUniform, uHeight: { value: beamHeight }, uCharge: charge, uBeamPower: beamPower, uReach: beamReach,
  }, beamFragment));
  beam.position.y = (beamHeight + beamStart) * .5;
  beam.renderOrder = 7;
  beam.name = "Feixe até o céu";
  root.add(beam);

  const illuminatedWater = new THREE.Group();
  illuminatedWater.name = "Cascatas iluminadas";
  root.add(illuminatedWater);
  convergenceFalls().forEach(({ angle, r, width, top, bottom }, index) => {
    const [x, z] = radial(r + .28, angle);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width, top - bottom + .09), additive({
      uTime: timeUniform, uPhase: { value: index * 1.293 },
    }, fallsFragment));
    water.position.set(x, (top + bottom) * .5, z);
    water.rotation.y = Math.PI / 2 - angle;
    water.renderOrder = 4;
    illuminatedWater.add(water);
  });

  const cameraPosition = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const cameraDelta = new THREE.Vector3();
  let stellarEffects;
  function update(seconds, camera, { elapsed, reactivation, state, rearm, injection, animate = true, night = true, blackout = false } = {}) {
    const triggered = elapsed !== undefined;
    const restoring = rearm && reactivation < STELLAR_REACTIVATION_DURATION;
    const burnt = (triggered && elapsed >= STELLAR_SHUTDOWN) || (restoring && reactivation < STELLAR_RELIGHT);
    const spinning = triggered && (animate || burnt);
    const showSeconds = Math.min(elapsed ?? 0, STELLAR_SHUTDOWN);
    const brake = Math.max(0, showSeconds - (STELLAR_SHUTDOWN - 4));
    const speedTime = Math.min(Math.max((elapsed ?? 0) - 10, 0), 45);
    const resetSpin = STELLAR_SHUTDOWN - 2 + 45 ** 2 * .070;
    const spin = spinning ? showSeconds - brake ** 2 / 8 + speedTime ** 2 * .070
      : rearm ? resetSpin + (animate ? reactivation : 0) : seconds;
    const orbitResetSpin = stellarOrbitSpin(STELLAR_SHUTDOWN);
    const orbitSpin = spinning ? stellarOrbitSpin(showSeconds)
      : rearm ? orbitResetSpin + (animate ? reactivation : 0) : seconds;
    const liftHeight = lerp(convergence.sunY, STELLAR_LIFT_HEIGHT, state?.lift ?? 0);
    const sunHeight = triggered && elapsed >= STELLAR_ARRIVAL ? beamHeight : lerp(liftHeight, beamHeight, state?.launch ?? 0);
    const arrived = triggered && elapsed >= STELLAR_BURST;
    const motion = (progress) => animate ? progress : Math.floor(progress);
    const crownDescent = rearm ? 1 - motion(rearm.crownLift) : motion(state?.crownDescent ?? 0);
    const crownRetraction = rearm ? 1 - motion(rearm.crownOpen) : motion(state?.crownRetraction ?? 0);
    const ignition = injection?.ignition ?? 1;
    const core = (rearm?.core ?? 1) * ignition;
    const rearmGlow = rearm ? 1 - smoothstep(reactivation, STELLAR_BEAM_RETURN, STELLAR_REACTIVATION_DURATION) : 0;
    const solarFocus = triggered && !arrived ? lerp(.65, 1, smoothstep(elapsed, 0, 6))
      : core ** 1.65 * rearmGlow;
    luminosity.value = 1 + solarFocus * (animate ? .88 : .34);
    charge.value = (state?.charge ?? (restoring ? .43 * core * (1 - rearm.crownLight) : 0)) * (animate ? 1 : .7);
    beamReach.value = rearm?.beam ?? 1;
    beamPower.value = restoring ? smoothstep(reactivation, STELLAR_BEAM_RETURN, 20.4)
      : burnt ? 0 : arrived ? charge.value * .33 : 1 + 1.15 * charge.value;
    beamPower.value *= ignition;
    timeUniform.value = seconds + (spinning ? speedTime * .8 : 0);
    sunGroup.visible = aura.visible = !arrived && core > .005;
    sunGroup.position.y = aura.position.y = sunHeight;
    sunGroup.rotation.y = spin * .297;
    const breath = animate ? lerp(.021, .004, rearmGlow) * Math.sin(seconds * 1.68) : 0;
    sunGroup.scale.setScalar(core * (1 + (triggered ? charge.value * .21 : 0) + breath));
    aura.scale.setScalar(core * (1 + charge.value * .68 + solarFocus * .31));
    beam.visible = beamPower.value > .003;
    illuminatedWater.visible = !burnt && !blackout;
    const crownSpin = rearm && animate ? resetSpin + Math.max(0, reactivation - rearm.crownLiftStartsAt) : spin;
    crown.rotation.y = -crownSpin * .115;
    expandCrown(crownRetraction);
    crown.position.y = lerp(convergence.crownY, crownDock.y, crownDescent);
    crown.scale.setScalar(1);
    const crownLight = rearm?.crownLight ?? Number(!burnt);
    crownCore.visible = crownLight < .85;
    const crownGlow = state?.crown ?? 0;
    crownLights[0].visible = crownLight > .02;
    crownLights[1].visible = crownLight > .32;
    crownLights[2].visible = crownLight > .58;
    crownLights[0].material.color.setRGB(2.9 + crownGlow, 1.04 + crownGlow * .5, .21 + crownGlow * 2.3)
      .multiplyScalar(crownLight);
    m.gold.color.setHex(burnt && !restoring ? 0x4b3825 : 0xb87b37).multiplyScalar(restoring ? lerp(.34, 1, core) : 1);
    m.bronze.color.setHex(burnt ? 0x2d241b : 0x754315);
    const ringGlow = restoring ? .62 * core + .38 * crownLight : Number(!burnt);
    containmentOrbits.forEach(component => powerConvergenceHardware(component, ringGlow));
    powerConvergenceHardware(containmentCrown, crownLight);
    const discharge = (state?.ringDischarge ?? 0) * (animate ? 1 : .25);
    m.led.color.setRGB(2.9 + .45 * discharge, 1.04 + 1.55 * discharge, .21 + 2 * discharge)
      .multiplyScalar(ringGlow);
    m.inscription.color.setHex(burnt ? 0x3a3025 : 0xffc877);
    // Keep the normal rotation running underneath the temporary acceleration.
    const [outerSpin, middleSpin, innerSpin] = rearm && animate
      ? rearm.orbits.map(orbit => orbitResetSpin + Math.max(0, reactivation - orbit.liftStartsAt))
      : [orbitSpin, orbitSpin, orbitSpin];
    const angles = [
      [.11 + Math.sin(outerSpin * .34) * .115, outerSpin * .27, -.12],
      [.60 + Math.sin(middleSpin * .27 + 1) * .23, -middleSpin * .33, .28],
      [-.85 + Math.cos(innerSpin * .40) * .17, innerSpin * .48, -.39],
    ];
    const spacing = animate ? state?.ringSpacing ?? 0 : 0;
    const thrust = animate ? state?.ringThrust ?? 0 : 0;
    for (const [index, ring] of ringAxes.entries()) {
      const orbit = rearm?.orbits[index];
      const tilt = orbit ? motion(orbit.tilt) : 1 - motion(state?.ringAlignment ?? 0);
      const descent = orbit ? 1 - motion(orbit.lift) : motion(state?.ringDescent ?? 0);
      const turn = orbit && animate ? orbit.turn * (index === 1 ? -1 : 1) : 0;
      const [x, y, z] = angles[index];
      ring.rotation.set((x + .17 * Math.sin(turn * .73)) * tilt, y + turn, (z + .15 * Math.sin(turn * 1.1)) * tilt);
      const height = convergence.sunY + beltLiftOffsets[index] * spacing + beltThrustHeights[index] * thrust;
      lowerRing(ring, { y: height, radius: convergence.ringRadii[index] }, beltDocks[index], descent,
        lerp(1, .105, smoothstep(descent, .04, .38)), 10.5);
    }
    pulses.visible = restoring && animate && reactivation >= 15;
    if (pulses.visible) for (const [index, pulse] of pulses.children.entries()) {
      const age = (reactivation - 15 - index * 1.4) / 3.4;
      pulse.visible = age > 0 && age < 1;
      if (!pulse.visible) continue;
      pulse.position.y = lerp(5.7, convergence.crownY, age);
      pulse.scale.setScalar(lerp(2, 12.7, Math.sin(age * Math.PI / 2)));
      pulse.material.opacity = Math.sin(age * Math.PI) * .7;
    }
    camera.getWorldPosition(cameraPosition);
    aura.lookAt(cameraPosition);
    cameraDelta.copy(cameraPosition).sub(root.getWorldPosition(origin));
    beam.rotation.y = Math.atan2(cameraDelta.x, cameraDelta.z) - root.rotation.y;
    if (triggered && !burnt && night) {
      if (!stellarEffects) {
        stellarEffects = createStellarEffects();
        root.add(stellarEffects.root);
      }
      stellarEffects.root.visible = true;
      stellarEffects.update(elapsed, state, cameraPosition, sunHeight, animate);
    } else if (stellarEffects) stellarEffects.root.visible = false;
    root.updateMatrixWorld(true);
    const flight = state?.launch ?? 0;
    // The beam's source rises, widening its pool of light before it fades in the sky.
    const projection = (1 + 16 * flight) * (1 - smoothstep(flight, .18, 1));
    return night ? ignition * solarFocus * lerp(8000, 22600, charge.value) * projection : 0;
  }

  function dispose() {
    const materials = new Set();
    root.traverse(part => {
      part.geometry?.dispose();
      if (part.material) materials.add(part.material);
    });
    for (const material of materials) material.dispose();
    root.removeFromParent();
  }

  return { root, sun, update, dispose };
}

export function createConvergenceAnimation(scene, timeline, unlitMaterials) {
  const effects = new Map();
  const owners = new WeakMap();
  const installation = new WeakMap();
  const warmCore = new THREE.Color("#ffd691");
  const hotCore = new THREE.Color("#a7d8ff");
  const siteLight = new THREE.PointLight(warmCore, 0, 185, 2);
  siteLight.name = "Luz do mini-sol";
  scene.add(siteLight);
  const bounds = new THREE.Box3();
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();

  function add(model, startedAt, reactivatedAt) {
    const effect = createConvergenceEffects();
    effect.root.visible = false;
    effect.startedAt = startedAt;
    effect.reactivatedAt = reactivatedAt;
    effect.injection = createContainmentInjection(model);
    effect.root.add(effect.injection.root);
    if (!installation.has(model)) {
      unlitMaterials ??= createUnlitConvergence(model).materials;
      const fixtures = [];
      model.traverse(part => {
        for (let parent = part; parent; parent = parent.parent) if (parent.userData.energyPod) return;
        if (unlitMaterials.has(part.material)) fixtures.push({ part, lit: part.material, unlit: unlitMaterials.get(part.material) });
      });
      const arms = model.children.filter(part => part.userData.hinge).map(part => ({
        part, axis: new THREE.Vector3(...part.userData.hinge.axis), travel: part.userData.hinge.travel,
      }));
      installation.set(model, { fixtures, arms, emitters: model.userData.lampEmitters, opening: 0, unlit: false });
    }
    effects.set(model, effect);
    owners.set(effect.sun, model);
    scene.add(effect.root);
  }

  function remove(model) {
    effects.get(model)?.injection?.dispose();
    effects.get(model)?.dispose();
    effects.delete(model);
  }

  function syncPower(now) {
    let changed = false;
    for (const [model, { startedAt, reactivatedAt }] of effects) {
      const unlit = (Boolean(startedAt) && stellarShowElapsed(startedAt, now) >= STELLAR_SHUTDOWN) ||
        (Boolean(reactivatedAt) && stellarElapsed(reactivatedAt, now) < STELLAR_RELIGHT);
      const installed = installation.get(model);
      if (unlit === installed.unlit) continue;
      installed.unlit = unlit;
      if (unlit) delete model.userData.lampEmitters;
      else model.userData.lampEmitters = installed.emitters;
      for (const fixture of installed.fixtures) fixture.part.material = unlit ? fixture.unlit : fixture.lit;
      changed = true;
    }
    return changed;
  }

  function update(camera, time, construction, animate, now = Date.now(), night = true, blackout = false) {
    siteLight.intensity = 0;
    if (!effects.size) return false;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let moving = false;
    for (const [model, effect] of effects) {
      const { x, y, z } = model.position;
      const showTime = effect.startedAt ? stellarShowElapsed(effect.startedAt, now) : undefined;
      const elapsed = showTime >= 0 ? showTime : undefined;
      const reactivation = effect.reactivatedAt ? stellarElapsed(effect.reactivatedAt, now) : undefined;
      const injection = sampleContainmentInjection(effect.startedAt ? showTime : undefined, reactivation);
      const spent = elapsed >= STELLAR_SHUTDOWN;
      const inShow = elapsed !== undefined && !spent && night;
      const restoring = reactivation < STELLAR_REACTIVATION_DURATION;
      const launching = night && elapsed >= STELLAR_LAUNCH && elapsed < STELLAR_ARRIVAL;
      const r = launching ? 835 : inShow ? 280 : restoring ? 185 : convergence.radius;
      bounds.min.set(x - r, y, z - r);
      bounds.max.set(x + r, y + (spent ? convergence.crownY + 1 : convergence.beamHeight + (inShow ? 230 : 0)), z + r);
      const active = model.visible && !construction.has(model) && frustum.intersectsBox(bounds);
      effect.root.visible = active;
      if (!active) continue;
      effect.injection.update(injection, animate);
      effect.root.position.copy(model.position);
      effect.root.rotation.copy(model.rotation);
      const state = elapsed !== undefined ? timeline.sample(elapsed) : undefined;
      const rearm = reactivation !== undefined ? timeline.reactivationPose(reactivation) : undefined;
      const installed = installation.get(model);
      const opening = animate ? state?.arms ?? rearm?.arms ?? 0 : 0;
      if (opening !== installed.opening) {
        for (const { part, axis, travel } of installed.arms) part.quaternion.setFromAxisAngle(axis, travel * opening);
        installed.opening = opening;
      }
      const intensity = effect.update(animate ? time * .001 : SNAPSHOT_TIME, camera,
        { elapsed, reactivation, state, rearm, injection, animate, night, blackout });
      if (intensity > siteLight.intensity) {
        effect.sun.getWorldPosition(siteLight.position);
        siteLight.color.copy(warmCore).lerp(hotCore, (state?.charge ?? 0) * .74);
        siteLight.distance = lerp(185, 835, state?.launch ?? 0);
        siteLight.intensity = intensity;
      }
      moving ||= elapsed === undefined ? animate : elapsed < STELLAR_DURATION;
    }
    return moving;
  }

  return {
    add, remove, update, syncPower,
    setEvent(model, startedAt, reactivatedAt) {
      Object.assign(effects.get(model), { startedAt, reactivatedAt });
    },
    pickable: () => [...effects.values()].filter(({ root, sun }) => root.visible && sun.parent.visible).map(({ sun }) => sun),
    ownerOf: (object) => owners.get(object),
  };
}
