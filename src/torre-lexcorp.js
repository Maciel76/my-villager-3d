import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";
import { LEXCORP_DOCK, createLexCorpFlightPlan, applyLexCorpFlight } from "./lexcorp-flight.js";
import { addLexCorpSearchlightFixture, createLexCorpSearchlight } from "./lexcorp-searchlight.js";

export const lexCorp = Object.freeze({ height: 180, footprint: [48, 48], helicopter: [17.4, 89.5, 0], landing: LEXCORP_DOCK });
const scanTime = { value: 0 };
const scanPower = { value: 1 };
const previewFlights = new WeakMap();
const towerRadii = { glass: 12, glassMid: 9, glassTop: 4.7 };

function facadeTextures() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2048;
  const light = canvas.cloneNode();
  const c = canvas.getContext("2d"), e = light.getContext("2d");
  e.fillStyle = "#000000"; e.fillRect(0, 0, 2048, 2048);
  for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
    const seed = ((row + 1) * 127 + (col + 5) * 71 + row * col * 13) % 97;
    const x = col * 128, y = row * 128;
    const shade = 88 + seed * .48;
    c.fillStyle = `rgb(${shade * .64},${shade},${shade * 1.08})`;
    c.fillRect(x, y, 128, 128);
    const gradient = c.createLinearGradient(x, y, x + 110, y + 115);
    gradient.addColorStop(0, "#e1eef21c"); gradient.addColorStop(1, "#172f3c16");
    c.fillStyle = gradient; c.fillRect(x + 3, y + 12, 122, 113);
    c.fillStyle = "#356572"; c.fillRect(x, y, 128, 9);
    c.fillStyle = "#82aeb5"; c.fillRect(x, y + 9, 128, 2);
    c.fillStyle = "#35616a"; c.fillRect(x, y, 3, 128);
    c.fillStyle = "#97b4b7"; c.fillRect(x + 3, y + 11, 1, 116);
    if (seed % 7 < 2) {
      e.fillStyle = seed % 2 ? "#b2c6b3" : "#d5b785";
      e.fillRect(x + 5, y + 14, 119, 108);
      e.fillStyle = "#0f1b1d";
      if (seed % 3 === 0) e.fillRect(x + 58, y + 14, 4, 108);
      e.fillRect(x + 12, y + 103, 60 + seed % 30, 19);
    }
  }
  const map = new THREE.CanvasTexture(canvas), emissiveMap = new THREE.CanvasTexture(light);
  for (const texture of [map, emissiveMap]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / 24, 1 / 48);
    texture.anisotropy = 8;
  }
  return { map, emissiveMap };
}

function reflections() {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 512;
  const c = canvas.getContext("2d"), sky = c.createLinearGradient(0, 0, 0, 512);
  for (const [at, color] of [[0,"#456e87"],[.39,"#a4d3dd"],[.56,"#d8ddc5"],[.7,"#596d70"],[1,"#203741"]])
    sky.addColorStop(at, color);
  c.fillStyle = sky; c.fillRect(0, 0, 1024, 512);
  const glow = c.createRadialGradient(275, 150, 8, 275, 150, 190);
  glow.addColorStop(0,"#fff7df");glow.addColorStop(.28,"#fff8eac0");glow.addColorStop(1,"#f4f3e600");
  c.fillStyle = glow; c.fillRect(0, 0, 1024, 400);
  for (let i = 0; i < 22; i++) {
    const x = i * 53 - 20, top = 240 + (i * 19 % 61), width = 25 + i * 13 % 31;
    c.fillStyle = i % 2 ? "#37566a" : "#405b66"; c.fillRect(x, top, width, 300);
    c.fillStyle = "#b4c6c62d"; c.fillRect(x + width * .67, top, 4, 300);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addScan(material) {
  material.onBeforeCompile = shader => {
    shader.uniforms.lexTime = scanTime;
    shader.uniforms.lexGridPower = scanPower;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float lexHeight;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nlexHeight = position.y;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\nvarying float lexHeight; uniform float lexTime, lexGridPower;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float lexBand = pow(max(0.0, 1.0 - abs(lexHeight - mod(lexTime * 7.0, 183.0)) / 1.7), 2.0);
        totalEmissiveRadiance += vec3(.012, .17, .105) * lexBand * lexGridPower;`);
  };
  material.customProgramCacheKey = () => "lexcorp-facade-scan-v1";
}

export function prepareLexCorpModel(scene, materials, projectTexture) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene), origin = bounds.getCenter(new THREE.Vector3());
  origin.y = bounds.min.y;
  const model = new THREE.Group(); model.name = "Torre LexCorp"; model.userData.hasMovingParts = true;
  const architecture = new THREE.Group(); architecture.name = "LexCorp architecture";
  const helicopter = new THREE.Group(); helicopter.name = "LexCorp helicopter";
  helicopter.position.fromArray(lexCorp.landing);
  const rotor = new THREE.Group(); rotor.name = "LexCorp main rotor"; rotor.position.set(0, 2.95, 0);
  const tail = new THREE.Group(); tail.name = "LexCorp tail rotor"; tail.position.set(-.3, 2.37, -4.75);
  helicopter.add(rotor, tail); model.add(architecture, helicopter);
  const textures = facadeTextures(), environment = reflections(), finishes = new Map(), groups = new Map();
  scene.traverse(part => {
    if (!part.isMesh) return;
    const finish = part.name.split("-")[1];
    if (!finishes.has(finish)) {
      let material = part.material.clone();
      if (towerRadii[finish]) {
        material = new THREE.MeshPhysicalMaterial({
          color: finish === "glass" ? "#a7d1d8" : finish === "glassMid" ? "#b4d5db" : "#b6dce0",
          map: textures.map, emissiveMap: textures.emissiveMap, vertexColors: true,
          roughness: .23, metalness: .32, clearcoat: .8, clearcoatRoughness: .15,
          envMap: environment, envMapIntensity: .74,
        });
        markNightLight(material, .8); material.emissive.set("#d8e2c9"); addScan(material);
      } else if (["lobbyGlass", "doorGlass"].includes(finish)) {
        material = new THREE.MeshPhysicalMaterial({color:"#81abb2",transparent:true,opacity:.34,
          depthWrite:false,roughness:.12,metalness:.05,clearcoat:.8,envMap:environment,envMapIntensity:.45,side:THREE.DoubleSide});
      } else if (finish === "paving") material = materials.plaza;
      else if (["logoWhite","ribbonLight","whiteLight","helipadLight"].includes(finish)) {
        markNightLight(material, finish === "ribbonLight" ? 1.1 : .8);material.emissive.copy(material.color);
      } else if (["beacon","navRed","navGreen"].includes(finish)) {
        material.emissive.copy(material.color); material.emissiveIntensity = .45;
      } else if (finish === "gold") {material.metalness = .55; material.roughness = .31; material.envMap = environment;}
      else if (finish === "heliGlass") {material.envMap = environment;material.metalness=.35;material.roughness=.18;}
      finishes.set(finish, material);
    }
    const moving = finish.startsWith("heli") && !["helipad","helipadLight"].includes(finish) ||
      ["mainRotor","tailRotor","navRed","navGreen"].includes(finish) || part.name.includes("helicopter-beacon");
    const target = finish === "mainRotor" ? rotor : finish === "tailRotor" ? tail : moving ? helicopter : architecture;
    const offset = moving ? new THREE.Vector3(...lexCorp.helicopter) : new THREE.Vector3();
    if (target === rotor) offset.add(rotor.position); else if (target === tail) offset.add(tail.position);
    let geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
    geometry.translate(-origin.x, -origin.y, -origin.z);
    if (/helicopter-(fuselage|cockpit)$/.test(part.name)) {
      geometry.deleteAttribute("normal");geometry.deleteAttribute("uv");
      const smooth = mergeVertices(geometry, .0001); geometry.dispose(); geometry = smooth; geometry.computeVertexNormals();
    }
    if (towerRadii[finish]) {
      const uv = geometry.getAttribute("uv"), pos = geometry.getAttribute("position");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * towerRadii[finish], pos.getY(i));
      uv.needsUpdate = true;
    } else if (finishes.get(finish).map || !geometry.getAttribute("uv")) projectTexture(geometry);
    geometry.translate(-offset.x, -offset.y, -offset.z);
    const key = `${target.name}:${finish}`;
    if (!groups.has(key)) groups.set(key, { target, finish, geometries: [] });
    groups.get(key).geometries.push(geometry);
  });
  for (const {target,finish,geometries} of groups.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Falha no acabamento ${finish} da LexCorp`);
    geometries.forEach(g => g.dispose());
    const material = finishes.get(finish), mesh = new THREE.Mesh(geometry, material);
    mesh.name = `lex-${finish}`;
    mesh.castShadow = target === architecture && !material.transparent;
    mesh.receiveShadow = true;
    mesh.renderOrder = material.transparent ? 2 : 0;
    mesh.userData.groundCover = ["paving"].includes(finish);
    mesh.userData.lowGroundCover = mesh.userData.groundCover;
    target.add(mesh);
  }
  for (const x of [-15,15]) addLampEmitter(model,[x,4.5,18],{color:"#e0efd1",intensity:28,range:14,halo:0});
  addLampEmitter(model,[0,7.8,19],{color:"#e6efdb",intensity:38,range:17,halo:0});
  addLampEmitter(model,[18,90,0],{color:"#78d6a5",intensity:18,range:10,halo:0});
  addLexCorpSearchlightFixture(helicopter);
  return model;
}

function setBeaconPower(model, seconds, gridAvailable) {
  const intensity = gridAvailable ? (Math.sin(seconds * 5.8) > .76 ? 2.6 : .16) : 0;
  model.traverse(part => {
    if (part.material && part.name === "lex-beacon") part.material.emissiveIntensity = intensity;
  });
}

export function poseLexCorp(model, seconds, plan, gridAvailable = true) {
  const helicopter = model.getObjectByName("LexCorp helicopter");
  if (!helicopter) return;
  if (!plan) {
    model.updateWorldMatrix(true,false);
    if (!previewFlights.has(model) || !previewFlights.get(model).ownerMatrix.equals(model.matrixWorld))
      previewFlights.set(model,createLexCorpFlightPlan(model));
    plan = previewFlights.get(model);
  }
  const pose = applyLexCorpFlight(helicopter,plan,seconds);
  scanTime.value = seconds;
  setBeaconPower(model, seconds, gridAvailable);
  return pose;
}

export function createLexCorpAnimation(scene, options={}) {
  const towers = new Map(), projection = new THREE.Matrix4(), frustum = new THREE.Frustum();
  let city = [], surfaces=[], revision = 0;
  function setCity(buildings) {
    city = buildings;revision++;
    surfaces=buildings.map(building=>building.model?.getObjectByName("LexCorp architecture")??building.model).filter(Boolean);
  }
  function add(model) {
    if (!towers.has(model)) towers.set(model,{seconds:0,lastTime:null,plan:null,pose:null,revision:-1,
      searchlight:scene?createLexCorpSearchlight(scene,model.getObjectByName("LexCorp helicopter"),options):null});
  }
  function remove(model) {towers.get(model)?.searchlight?.dispose();towers.delete(model);}
  function update(camera, time, construction, animate, nightPower = 1, gridAvailable = true, supplyAt = () => 1) {
    scanPower.value = Number(gridAvailable);
    if (!towers.size) return false;
    camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let moving = false;
    for (const [model,state] of towers) {
      if (state.gridAvailable !== gridAvailable) {
        setBeaconPower(model, state.seconds, gridAvailable);
        state.gridAvailable = gridAvailable;
      }
      if (!model.visible || construction.has(model)) {
        state.lastTime = null;
        state.supplied = false;
        state.searchlight?.hide();
        continue;
      }
      model.updateWorldMatrix(true,false);
      const moved = state.plan && !state.plan.ownerMatrix.equals(model.matrixWorld);
      const canRefresh = state.revision !== revision && state.pose?.phase === "parked";
      if (!state.plan || moved || (state.revision !== revision && canRefresh)) {
        state.plan = createLexCorpFlightPlan(model,city);state.revision=revision;state.seconds=0;state.lastTime=null;
        state.pose=poseLexCorp(model,0,state.plan,gridAvailable);
        state.returning = false;
      }
      const supplied = gridAvailable && supplyAt(model.position.x, model.position.z) > .5;
      const visible = frustum.intersectsBox(state.plan.flightBounds);
      if (!supplied && state.pose.phase === "startup") {
        state.seconds = Math.floor(state.seconds / state.plan.duration) * state.plan.duration + .000001;
        state.pose = poseLexCorp(model, state.seconds, state.plan, gridAvailable);
      }
      if (!supplied && state.pose.phase !== "parked") state.returning = true;
      const flying = animate && (state.returning || (supplied && visible));
      let frameReady = false;
      if (flying) {
        moving = true;
        state.lastTime ??= time;
        const elapsed = time - state.lastTime;
        frameReady = elapsed >= 1000 / 30 - 2;
        if (frameReady) {
          const next = state.seconds + Math.min(elapsed, 150) / 1000;
          const landing = (Math.floor(state.seconds / state.plan.duration) + 1) * state.plan.duration + .000001;
          state.seconds = state.returning ? Math.min(next, landing) : next;
          state.lastTime = time;
          state.pose = poseLexCorp(model, state.seconds, state.plan, gridAvailable);
          if (state.pose.phase === "parked") state.returning = false;
        }
      } else {
        state.lastTime = null;
      }
      if (!supplied || !visible) state.searchlight?.hide();
      else if (frameReady || state.lastPower !== nightPower || !state.supplied) {
        state.searchlight?.update(state.pose, state.seconds, nightPower, surfaces);
      }
      state.lastPower = nightPower;
      state.supplied = supplied && visible;
    }
    return moving;
  }
  return {add,remove,update,setCity};
}
