import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { convergence, convergenceFalls, radial } from "./convergencia.js";

const TAU = Math.PI * 2;
const SNAPSHOT_TIME = 1.7;

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
uniform float uTime;
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
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const auraFragment = `
varying vec2 vUv;
uniform float uTime;
void main(){
  vec2 v=(vUv-.5)*2.0;
  float r=length(v);
  float a=atan(v.y,v.x);
  float loops=sin(a*11.0+uTime*.72+r*23.0)*sin(a*17.0-uTime*.56+r*52.0);
  float atmosphere=(1.0-smoothstep(.34,1.0,r))*smoothstep(.24,.43,r);
  float flares=.13*max(0.0,loops)*exp(-abs(r-.49)*8.5);
  vec3 light=mix(vec3(1.0,.33,.065),vec3(1.0,.69,.24),1.0-r);
  gl_FragColor=vec4(light,atmosphere*.29+flares);
  #include <colorspace_fragment>
}`;

const beamFragment = `
varying vec2 vUv;
uniform float uTime;
uniform float uHeight;
void main(){
  float width=abs(vUv.x-.5);
  float y=vUv.y*uHeight;
  float halo=exp(-width*width*39.0)*(1.0-smoothstep(.14,.5,width));
  float sheath=exp(-width*width*395.0);
  float core=exp(-width*width*2900.0);
  float filament=exp(-pow((vUv.x-.5+.009*sin(y*2.4-uTime*3.0))/.016,2.0));
  float upwards=.84+.16*sin(y*.85-uTime*4.4+width*9.0);
  float entrance=smoothstep(0.0,2.5,y)*(1.0-smoothstep(.93,1.0,vUv.y));
  float warmth=smoothstep(28.0,55.0,y);
  vec3 aura=mix(vec3(.28,.6,1.0),vec3(1.0,.40,.096),warmth);
  vec3 color=mix(aura,vec3(1.0,.91,.71),.64*core);
  float opacity=(.13*halo+.38*sheath+.42*core+.21*filament)*upwards*entrance;
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
  const m = {
    gold: new THREE.MeshBasicMaterial({ color: "#b87b37", side: THREE.DoubleSide }),
    bronze: new THREE.MeshBasicMaterial({ color: "#754315", side: THREE.DoubleSide }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.9, 1.04, .21), toneMapped: false }),
    inscription: new THREE.MeshBasicMaterial({ color: "#ffc877", toneMapped: false }),
  };

  const ringAxes = convergence.ringRadii.map((radius, index) => {
    const ring = makeRing(radius, index ? .48 : .63, index ? .38 : .58, m);
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
      uniforms: { uTime: timeUniform }, vertexShader: starVertex, fragmentShader: starFragment,
    }));
  for (let i = 0; i < 4; i++) {
    const prominence = torus(convergence.sunRadius + .075, .026, m.led, 92);
    prominence.rotation.set(.35 + i * .63, i * .63, -.43 - i * .25);
    sunGroup.add(prominence);
  }
  sunGroup.add(sun, sparks(4.46, 1.43, 72, timeUniform));
  root.add(sunGroup);

  const aura = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 19.4), additive({
    uTime: timeUniform,
  }, auraFragment));
  aura.position.y = convergence.sunY;
  aura.renderOrder = 6;
  root.add(aura);

  const crown = new THREE.Group();
  crown.position.y = convergence.crownY;
  crown.name = "Coroa de luz";
  crown.add(torus(convergence.crownRadius, .098, m.led),
    torus(convergence.crownRadius + .28, .035, m.inscription),
    sparks(convergence.crownRadius, .27, 85, timeUniform));
  root.add(crown);

  const beamStart = 1.22;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(12.5, beamHeight - beamStart), additive({
    uTime: timeUniform, uHeight: { value: beamHeight },
  }, beamFragment));
  beam.position.y = (beamHeight + beamStart) * .5;
  beam.renderOrder = 7;
  beam.name = "Feixe até o céu";
  root.add(beam);

  convergenceFalls().forEach(({ angle, r, width, top, bottom }, index) => {
    const [x, z] = radial(r + .28, angle);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(width, top - bottom + .09), additive({
      uTime: timeUniform, uPhase: { value: index * 1.293 },
    }, fallsFragment));
    water.position.set(x, (top + bottom) * .5, z);
    water.rotation.y = Math.PI / 2 - angle;
    water.renderOrder = 4;
    root.add(water);
  });

  const cameraPosition = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const cameraDelta = new THREE.Vector3();
  function update(seconds, camera) {
    timeUniform.value = seconds;
    sunGroup.rotation.y = seconds * .297;
    sunGroup.scale.setScalar(1 + .021 * Math.sin(seconds * 1.68));
    crown.rotation.y = -seconds * .115;
    ringAxes[0].rotation.set(.11 + Math.sin(seconds * .34) * .115, seconds * .27, -.12);
    ringAxes[1].rotation.set(.60 + Math.sin(seconds * .27 + 1) * .23, -seconds * .33, .28);
    ringAxes[2].rotation.set(-.85 + Math.cos(seconds * .40) * .17, seconds * .48, -.39);
    camera.getWorldPosition(cameraPosition);
    aura.lookAt(cameraPosition);
    cameraDelta.copy(cameraPosition).sub(root.getWorldPosition(origin));
    beam.rotation.y = Math.atan2(cameraDelta.x, cameraDelta.z) - root.rotation.y;
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

  return { root, update, dispose };
}

export function createConvergenceAnimation(scene) {
  const effects = new Map();
  const bounds = new THREE.Box3();
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();

  function add(model) {
    const effect = createConvergenceEffects();
    effect.root.visible = false;
    effects.set(model, effect);
    scene.add(effect.root);
  }

  function remove(model) {
    effects.get(model)?.dispose();
    effects.delete(model);
  }

  function update(camera, time, construction, animate) {
    if (!effects.size) return false;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let visible = false;
    for (const [model, effect] of effects) {
      const { x, y, z } = model.position;
      const r = convergence.radius;
      bounds.min.set(x - r, y, z - r);
      bounds.max.set(x + r, y + convergence.beamHeight, z + r);
      const active = model.visible && !construction.has(model) && frustum.intersectsBox(bounds);
      effect.root.visible = active;
      if (!active) continue;
      effect.root.position.copy(model.position);
      effect.root.rotation.copy(model.rotation);
      effect.update(animate ? time * .001 : SNAPSHOT_TIME, camera);
      visible = true;
    }
    return visible && animate;
  }

  return { add, remove, update };
}
