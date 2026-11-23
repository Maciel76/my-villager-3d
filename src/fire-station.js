import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { markNightLight } from './daylight.js';
import { addLampEmitter } from './night-lights.js';

export const fireStation = Object.freeze({ footprint: [60, 48], height: 24.06, bays: 4, trucks: 4 });
export const fireTruckHomes = Object.freeze({
  truck0: [-23.9, .57, 9.1], truck1: [-16.5, .86, -4.3],
  truck2: [-9.1, .86, -4.3], truck3: [-1.7, .86, -4.3],
});
export const fireTruckScale = .84;

// Bake the CAD transforms after unpacking normalized, quantized glTF attributes.
// Applying a world matrix directly to the integer buffers would squash the site.
function bakeGeometry(part) {
  const geometry = part.geometry.clone();
  for (const name of ['position', 'normal', 'uv']) {
    const attr = geometry.getAttribute(name);
    if (!attr || attr.array instanceof Float32Array) continue;
    const values = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) for (let j = 0; j < attr.itemSize; j++)
      values[i * attr.itemSize + j] = attr.getComponent(i, j);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
  }
  for (const name of Object.keys(geometry.attributes))
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  return geometry.applyMatrix4(part.matrixWorld);
}

export function prepareFireStationModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const model = new THREE.Group();
  model.name = 'Quartel Corpo de Bombeiros';
  model.userData.hasMovingParts = true;
  model.userData.fireStation = { ...fireStation };
  const rigs = { static: model };
  for (const [name, position] of Object.entries(fireTruckHomes)) {
    const group = new THREE.Group(); group.name = name;
    group.position.fromArray(position); group.scale.setScalar(fireTruckScale);
    model.add(group); rigs[name] = group;
  }
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group(); group.name = `Fire garage door ${i}`;
    group.position.y = 5.85; model.add(group); rigs[`door${i}`] = group;
  }
  const finishes = new Map(), batches = new Map();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const isSign = /FacadeLettering|EmergencyLettering/.test(part.name);
    const finish = isSign ? 'sign' : part.name.split('-')[1];
    let rig = part.name.split('-')[0];
    const door = /BayDoor(\d)(Slat|Glazing)/.exec(part.name);
    if (door) rig = `door${door[1]}`;
    if (!finish) throw new Error(`Peça do quartel sem acabamento: ${part.name}`);
    if (!finishes.has(finish)) {
      let material = part.material.clone();
      if (finish === 'asphalt') material = materials.asphalt;
      else if (finish === 'paving') material = materials.plaza;
      else if (finish === 'warm') {
        markNightLight(material, 2);
        material.emissive.set('#ffdeaa');
      } else if (finish === 'sign') {
        material.metalness = .05; material.roughness = .55;
        markNightLight(material, .65); material.emissive.set('#fff1db');
      } else if (['glass', 'garageGlass'].includes(finish)) {
        material.color.set('#4b839d');
        material.metalness = .35; material.roughness = .24;
        markNightLight(material, .25); material.emissive.set('#82b4c9');
      } else if (finish === 'vehicleGlass') {
        material.color.set('#204756'); material.metalness = .42; material.roughness = .16;
      } else if (finish === 'siren') {
        material.emissive.copy(material.color); material.emissiveIntensity = .35;
      }
      finishes.set(finish, material);
    }
    const geometry = bakeGeometry(part);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (rig.startsWith('truck')) {
      // The CAD wheels start at 0.42 m; put their contact patch on each floor.
      const home = fireTruckHomes[rig];
      geometry.translate(-home[0], -.42, -home[2]);
    } else if (rig.startsWith('door')) geometry.translate(0, -5.85, 0);
    projectTexture(geometry);
    // Keep the slab and paving out of shadow casting, without disabling
    // shadows on the raised planters and garage floor of the same finish.
    const ground = /-(Foundation|Apron|Sidewalk)$/.test(part.name);
    const key = `${rig}:${finish}:${ground}`;
    if (!batches.has(key)) batches.set(key, { rig, finish, ground, parts: [] });
    batches.get(key).parts.push(geometry);
  });
  for (const { rig, finish, ground, parts } of batches.values()) {
    const geometry = mergeGeometries(parts);
    if (!geometry) throw new Error(`Geometria inválida no quartel: ${finish}`);
    parts.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(geometry, finishes.get(finish));
    mesh.name = `fire-station-${finish}${ground ? '-ground' : ''}`;
    mesh.userData.groundCover = ground;
    mesh.castShadow = !ground && finish !== 'warm'; mesh.receiveShadow = true;
    rigs[rig].add(mesh);
  }
  for (const x of [-28.4, 28.3]) for (const z of [20.3, -7.8, -21.4])
    addLampEmitter(model, [x, 6.28, z], { color: '#ffdeaa', intensity: 55, range: 24, halo: .55 });
  for (const x of [-23.9, -16.5, -9.1, -1.7])
    addLampEmitter(model, [x, 5.8, 4.2], { color: '#ffdeaa', intensity: 45, range: 19, halo: .3 });
  for (const x of [12.5, 22])
    addLampEmitter(model, [x, 4, 6.2], { color: '#ffdeaa', intensity: 38, range: 17, halo: .25 });
  for (const y of [6.5, 15])
    addLampEmitter(model, [-23.5, y, -14.6], { color: '#ffe2b5', intensity: 35, range: 16,
      direction: [0, .3, -1], angle: 1.15 });
  return model;
}

const signals = new WeakMap();
export function updateFireSignals(model, seconds, active) {
  if (!signals.has(model)) {
    const parts = [];
    model.traverse(part => {
      if (part.isMesh && part.name === 'fire-station-siren') {
        part.material = part.material.clone(); parts.push(part);
      }
    });
    signals.set(model, parts);
  }
  signals.get(model).forEach((part, i) => {
    const phase = (seconds * 2.7 + i * .23) % 1;
    part.material.emissiveIntensity = active && (phase < .12 || phase > .22 && phase < .34) ? 4 : .15;
  });
}
