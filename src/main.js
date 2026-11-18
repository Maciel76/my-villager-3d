import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BUILD_LIMIT,
  LOT_SIZE,
  buildLimit,
  canPlace,
  footprint,
  insideBuildArea,
  isLamp,
  isLargeFootprint,
  readSave,
  snap,
} from "./placement.js";
import { createHouse, createWorld, terrainHeight } from "./world.js";
import { loadBuildingModels, loadMaterials } from "./assets.js";
import {
  BUILDING_TYPES,
  DEFAULT_HOUSE,
  STARTER_HOUSES,
} from "./house-types.js";
import { createCommercialBuildings } from "./commercial.js";
import { addUrbanDetails } from "./urban-details.js";
import { addSakuraGarden } from "./sakura-garden.js";
import { addOrientalGarden } from "./oriental-garden.js";
import { addChurchDetails } from "./church-details.js";
import {
  startConstruction,
  updateConstruction,
  finishConstruction,
} from "./construction.js";
import { createShop } from "./shop.js";
import { createDaylight } from "./daylight.js";
import { createLampModels } from "./lamp-models.js";
import { createNightLights } from "./night-lights.js";
import {
  canBuildHouse,
  canBuildRoad,
  canRemoveRoad,
  houseSite,
  lampSiteHeight,
  readRoads,
  roadLots,
  roadMask,
  snapTile,
  tileKey,
} from "./road-layout.js";
import { createStreetLayer } from "./street.js";
import { createWalker } from "./walking.js";
import { createVillageStore, loadVillage } from "./village-storage.js";
import "./style.css";

const categoryCopy = {
  residential: {
    counter: "house-count",
    noun: "Casa",
    plural: "casas",
    ending: "a",
  },
  apartments: {
    counter: "apartment-count",
    noun: "Prédio",
    plural: "prédios",
    ending: "o",
  },
  commercial: {
    counter: "commerce-count",
    noun: "Comércio",
    plural: "comércios",
    ending: "o",
  },
  landmarks: {
    counter: "landmark-count",
    noun: "Monumento",
    plural: "monumentos",
    ending: "o",
  },
  lighting: {
    counter: "lamp-count",
    noun: "Poste",
    plural: "postes",
    ending: "o",
  },
};

const categoryFor = (type) => categoryCopy[BUILDING_TYPES[type].category];
const element = (id) => document.getElementById(id);
const canvas = element("world");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  console.error(error);
  element("error").hidden = false;
}
if (renderer)
  startGame(renderer).catch((error) => {
    console.error(error);
    element("error-title").textContent =
      "Não foi possível carregar a Vila Verde";
    element("error-description").textContent =
      "Recarregue a página para tentar de novo.";
    element("error").hidden = false;
  });

async function startGame(renderer) {
  let saved;
  try {
    saved = await loadVillage();
  } catch (error) {
    console.error(error);
    element("error-title").textContent = "Não foi possível carregar a vila salva";
    element("error-description").textContent =
      "Verifique se o MongoDB local e o servidor do jogo estão rodando. Depois recarregue a página.";
    element("error").hidden = false;
    return;
  }
  const saveState = element("save-state");
  const store = createVillageStore(saved.revision, (message, failed = false) => {
    saveState.textContent = message;
    saveState.toggleAttribute("data-error", failed);
  });
  saveState.textContent = saved.world || saved.hour
    ? "✓ Salvo no MongoDB"
    : "Salvamento automático";

  const materials = await loadMaterials(renderer);
  const buildingTemplates = {
    [DEFAULT_HOUSE]: createHouse(materials),
    ...(await loadBuildingModels(materials)),
    ...createCommercialBuildings(materials),
    ...createLampModels(),
  };
  addUrbanDetails(buildingTemplates);
  addSakuraGarden(buildingTemplates.sakura, materials);
  addOrientalGarden(buildingTemplates.oriental, materials);
  addChurchDetails(buildingTemplates.church, materials);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c6dfd9");
  const viewDistance = 410;
  scene.fog = new THREE.Fog("#c6dfd9", 165, viewDistance);
  const camera = new THREE.PerspectiveCamera(47, 1, 0.5, viewDistance);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.minDistance = 24;
  controls.maxDistance = 245;
  controls.minPolarAngle = 0.13;
  controls.maxPolarAngle = Math.PI * 0.43;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const daylight = createDaylight(scene, renderer, buildingTemplates);
  const nightLights = createNightLights(scene);

  const {
    ground,
    grid,
    update: updateWorld,
    updatePaving,
  } = createWorld(scene, materials);
  const streets = createStreetLayer(materials);
  const roadGrid = new THREE.GridHelper(180, 15, "#efe5b0", "#efe5b0");
  roadGrid.position.y = 0.036;
  roadGrid.material.transparent = true;
  roadGrid.material.opacity = 0.42;
  roadGrid.visible = false;
  scene.add(streets.roadsLayer, streets.plotsLayer, roadGrid);
  let roads = new Map();
  const walker = createWalker(
    (x, z) => streets.surfaceHeight(x, z, roads) ?? terrainHeight(x, z),
    viewDistance,
  );
  const walkButton = element("walk-button");
  const walkPad = element("walk-pad");
  const touchControls = window.matchMedia("(any-pointer: coarse)");
  let parcels = new Map();
  let nextOrder = 0;
  const roadGhost = new THREE.Group();
  const roadGhostMaterial = new THREE.MeshBasicMaterial({
    color: "#e8f4b4",
    opacity: 0.54,
    transparent: true,
    depthWrite: false,
  });
  roadGhost.visible = false;
  let roadGhostMask = null;
  scene.add(roadGhost);
  const houses = [];
  const undoHistory = [];
  const animations = new Map();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ghost = new THREE.Group();
  const ghostMaterial = new THREE.MeshBasicMaterial({
    color: "#ddf9c1",
    transparent: true,
    opacity: 0.58,
  });
  ghost.visible = false;
  scene.add(ghost);

  const lotShape = new THREE.PlaneGeometry(LOT_SIZE, LOT_SIZE);
  const lotMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.35,
  });
  const lot = new THREE.Mesh(lotShape, lotMaterial);
  lot.rotation.x = -Math.PI / 2;
  lot.visible = false;
  scene.add(lot);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-LOT_SIZE / 2, 0, -LOT_SIZE / 2),
      new THREE.Vector3(-LOT_SIZE / 2, 0, LOT_SIZE / 2),
      new THREE.Vector3(LOT_SIZE / 2, 0, LOT_SIZE / 2),
      new THREE.Vector3(LOT_SIZE / 2, 0, -LOT_SIZE / 2),
    ]),
    new THREE.LineBasicMaterial(),
  );
  const plotLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    border.material,
  );
  let plotWidth;
  let plotDepth;
  plotLines.visible = false;
  border.visible = false;
  scene.add(border, plotLines);

  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const movementKeys = new Set();
  const touchDirections = new Map();
  const lotSteps = {
    arrowleft: [-2, 0],
    arrowright: [2, 0],
    arrowup: [0, -2],
    arrowdown: [0, 2],
  };
  const pointers = new Set();
  let gesture = null;
  let walkLook = null;
  let aim = null;
  let selection = null;
  let choosingHouse = false;
  let placement = null;
  let candidate = null;
  let showGrid = false;
  let dirty = true;
  let framePending = false;
  let lastFrame = 0;

  const shop = createShop(
    renderer,
    buildingTemplates,
    beginPlacement,
    invalidate,
  );
  const hourPicker = element("village-hour");
  if (saved.hour) hourPicker.value = saved.hour;
  daylight.setHour(Number(hourPicker.value));
  hourPicker.disabled = false;
  hourPicker.addEventListener("change", () => {
    daylight.setHour(Number(hourPicker.value));
    invalidate();
    store({ hour: hourPicker.value });
  });

  const help = element("help-dialog");

  function updateGhostModel(type) {
    const preview = buildingTemplates[type].clone();
    preview.traverse((part) => {
      if (part.isMesh) {
        part.material = ghostMaterial;
        part.castShadow = false;
        if (part.userData.groundCover) part.visible = false;
      }
    });
    ghost.clear().add(preview);
  }

  function scheduleFrame() {
    if (!framePending) {
      framePending = true;
      requestAnimationFrame(draw);
    }
  }

  function invalidate() {
    dirty = true;
    scheduleFrame();
  }

  function setStatus(message) {
    const status = element("status");
    if (status.textContent !== message) status.textContent = message;
  }

  function updateCount() {
    const counts = {
      residential: 0,
      apartments: 0,
      commercial: 0,
      landmarks: 0,
      lighting: 0,
    };
    for (const { type } of houses) counts[BUILDING_TYPES[type].category]++;
    for (const [key, { counter, noun, plural }] of Object.entries(
      categoryCopy,
    )) {
      const count = counts[key];
      const node = element(counter);
      node.hidden = count === 0 && key !== "residential";
      node.textContent = `${count} ${count === 1 ? noun.toLowerCase() : plural}`;
    }
  }

  function syncModel(house) {
    const { model, x, z, rotation } = house;
    model.position.set(x, isLamp(house.type) ? lampBaseHeight(x, z) : 0, z);
    model.rotation.y = (rotation * Math.PI) / 2;
    model.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  function addHouse(data, animate = false) {
    const model = buildingTemplates[data.type].clone();
    const house = { order: nextOrder, ...data, model };
    nextOrder = Math.max(nextOrder, house.order + 1);
    houses.push(house);
    scene.add(model);
    syncModel(house);
    if (animate && !isLamp(data.type) && !reduceMotion.matches)
      animations.set(model, startConstruction(model));
    return house;
  }

  function finishHouseAnimation(house) {
    const animation = animations.get(house.model);
    if (!animation) return;
    finishConstruction(animation);
    animations.delete(house.model);
  }

  function removeHouse(house) {
    const index = houses.indexOf(house);
    houses.splice(index, 1);
    finishHouseAnimation(house);
    scene.remove(house.model);
    renderer.shadowMap.needsUpdate = true;
    return index;
  }

  function saveWorld() {
    store({ world: {
      version: 1,
      houses: houses.map(({ x, z, rotation, type }) => ({ x, z, rotation, type })),
      houseOrder: houses.map((house) => house.order),
      roads: [...roads.values()],
    } });
    updateCount();
  }

  const initial = saved.world ? readSave(saved.world) : STARTER_HOUSES;
  initial.forEach((house) => addHouse(house));
  roads = readRoads(saved.world?.roads, houses, nextOrder);
  for (const { order } of roads.values())
    nextOrder = Math.max(nextOrder, order + 1);
  syncStreets();
  updateCount();
  setStatus("Abra a Loja ou escolha Ruas para construir.");

  function syncParcels() {
    parcels = roadLots(roads);
    for (const [key, { x, z }] of parcels) {
      const alignedHouse = houses.some(
        (house) => house.x === x && house.z === z,
      );
      if (!alignedHouse && !canPlace(x, z, houses)) parcels.delete(key);
    }
    streets.updatePlots([...parcels.values()]);
  }

  function syncStreets() {
    streets.updateRoads(roads);
    updatePaving((x, z) => streets.covers(x, z, roads));
    for (const { type, x, z, model } of houses) {
      if (isLamp(type)) model.position.y = lampBaseHeight(x, z);
    }
    renderer.shadowMap.needsUpdate = true;
    syncParcels();
    invalidate();
  }

  function placementSite(x, z, type = placement?.type) {
    return placement?.road
      ? { x: snapTile(x), z: snapTile(z) }
      : houseSite(x, z, parcels, type, placement?.rotation);
  }

  function lampBaseHeight(x, z) {
    const sidewalk = lampSiteHeight(x, z, roads);
    return sidewalk || terrainHeight(x, z);
  }

  function placementHeight(x, z, type) {
    return isLamp(type) ? lampBaseHeight(x, z) : terrainHeight(x, z);
  }

  function castRay(x, y) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((y - bounds.top) / bounds.height) * 2,
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
  }

  function pointLot(x, y) {
    castRay(x, y);
    const hit = raycaster.intersectObjects(ground.children, false)[0];
    if (!hit) return null;
    const site = placementSite(hit.point.x, hit.point.z);
    const height = isLamp(placement?.type)
      ? lampBaseHeight(site.x, site.z)
      : hit.point.y;
    return { ...site, y: height };
  }

  function updatePlotLines(width, depth) {
    if (width === plotWidth && depth === plotDepth) return;
    plotWidth = width;
    plotDepth = depth;
    const points = [];
    for (let x = LOT_SIZE - width / 2; x < width / 2; x += LOT_SIZE) {
      points.push(new THREE.Vector3(x, 0, -depth / 2), new THREE.Vector3(x, 0, depth / 2));
    }
    for (let z = LOT_SIZE - depth / 2; z < depth / 2; z += LOT_SIZE) {
      points.push(new THREE.Vector3(-width / 2, 0, z), new THREE.Vector3(width / 2, 0, z));
    }
    plotLines.geometry.dispose();
    plotLines.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  function refreshPreview() {
    const target =
      placement && (aim ? pointLot(aim.x, aim.y) : placement.target);
    const roadMode = Boolean(placement?.road);
    const active = placement ?? selection;
    const [width, depth] = footprint(active?.type, active?.rotation);
    lot.scale.set(width / LOT_SIZE, depth / LOT_SIZE, 1);
    border.scale.set(width / LOT_SIZE, 1, depth / LOT_SIZE);
    if (target) {
      const { x, z, y } = target;
      const erasing = placement.erasing;
      const valid = roadMode
        ? erasing
          ? canRemoveRoad(x, z, houses, roads)
          : canBuildRoad(x, z, houses, roads)
        : canBuildHouse(
            x,
            z,
            houses,
            roads,
            parcels,
            placement.moving,
            placement.type,
            placement.rotation,
          );
      candidate = { x, z, valid };
      if (roadMode) {
        const mask = roadMask(x, z, roads);
        if (mask !== roadGhostMask) {
          roadGhost.clear().add(streets.preview(mask, roadGhostMaterial));
          roadGhostMask = mask;
        }
        roadGhost.position.set(x, y + 0.035, z);
        roadGhostMaterial.color.set(valid && !erasing ? "#e8f4b4" : "#ff9a75");
      } else {
        ghost.position.set(x, y + 0.08, z);
        ghost.rotation.y = (placement.rotation * Math.PI) / 2;
        ghostMaterial.color.set(valid ? "#e8ffcb" : "#ffab8e");
      }
      const highlight = valid && !erasing;
      lot.position.set(x, y + (roadMode ? 0.157 : 0.065), z);
      border.position.set(x, y + (roadMode ? 0.185 : 0.105), z);
      plotLines.position.copy(border.position);
      updatePlotLines(width, depth);
      lotMaterial.color.set(highlight ? "#c4f58f" : "#dd5d41");
      border.material.color.set(highlight ? "#e3ffad" : "#ffb08a");
    } else {
      candidate = null;
      if (selection) {
        border.position.set(selection.x, selection.model.position.y + 0.11, selection.z);
        border.material.color.set("#ffcf79");
      }
    }
    lot.visible = Boolean(candidate);
    ghost.visible = lot.visible && !roadMode;
    roadGhost.visible = lot.visible && roadMode;
    border.visible = Boolean(candidate || selection);
    plotLines.visible = Boolean(candidate && isLargeFootprint(active?.type));
    element("place-button").disabled = !candidate?.valid;
  }

  function updateActions() {
    const target = placement || selection;
    const roadMode = Boolean(placement?.road);
    const editing = Boolean(placement);
    const moving = choosingHouse || Boolean(placement?.moving);
    document.body.classList.toggle("placing", editing);
    document.body.classList.toggle("selecting", Boolean(selection));
    element("action-tray").hidden = !target;
    element("move-selected").hidden = !selection;
    element("delete-selected").hidden = !selection;
    element("rotate-left").hidden = element("rotate-button").hidden =
      !target || roadMode;
    element("road-erase").hidden = !roadMode;
    element("road-erase").setAttribute(
      "aria-pressed",
      Boolean(placement?.erasing),
    );
    element("road-button").setAttribute("aria-pressed", roadMode);
    element("place-button").textContent = placement?.erasing
      ? "Retirar trecho"
      : "Confirmar";
    element("place-button").hidden = !editing;
    const exploring = !walker.active && !editing && !moving;
    element("explore-button").setAttribute("aria-pressed", exploring);
    element("explore-button").classList.toggle("active", exploring);
    element("move-button").setAttribute("aria-pressed", moving);
    if (roadMode) {
      element("action-title").textContent = placement.erasing
        ? "Trecho de rua"
        : "Asfalto e calçada";
      element("action-mode").textContent = placement.erasing
        ? "Remover rua"
        : "Rua modular";
    } else if (target) {
      const { noun, ending } = categoryFor(target.type);
      element("action-title").textContent = BUILDING_TYPES[target.type].label;
      element("action-mode").textContent = placement
        ? placement.moving
          ? "Novo lote"
          : "Nova construção"
        : `${noun} selecionad${ending}`;
    }
    canvas.style.cursor = editing || choosingHouse ? "crosshair" : "grab";
    grid.visible = !walker.active && !roadMode && (showGrid || editing);
    roadGrid.visible = roadMode;
    streets.plotsLayer.visible = !walker.active;
    refreshPreview();
    invalidate();
  }

  function clearAction() {
    if (placement?.moving) {
      placement.moving.model.visible = true;
      renderer.shadowMap.needsUpdate = true;
    }
    placement = null;
    selection = null;
    choosingHouse = false;
    aim = null;
    updateActions();
  }

  function explore() {
    stopWalking();
    clearAction();
    setStatus("Clique em uma construção para selecioná-la.");
  }

  function beginPlacement(type, moving = null) {
    stopWalking();
    clearAction();
    if (moving) {
      finishHouseAnimation(moving);
      moving.model.visible = false;
      renderer.shadowMap.needsUpdate = true;
    }
    const site = moving
      ? { x: moving.x, z: moving.z }
      : placementSite(controls.target.x, controls.target.z, type);
    placement = {
      type,
      moving,
      rotation: moving?.rotation ?? 0,
      target: { ...site, y: placementHeight(site.x, site.z, type) },
    };
    updateGhostModel(type);
    updateActions();
    canvas.focus({ preventScroll: true });
    const [width, depth] = footprint(type);
    setStatus(
      moving
        ? "Escolha o novo local para a construção."
        : isLamp(type)
          ? "Escolha uma calçada ou um espaço livre para o poste."
          : isLargeFootprint(type)
            ? `Escolha ${(width * depth) / LOT_SIZE ** 2} lotes livres em uma área de ${width / LOT_SIZE} × ${depth / LOT_SIZE}.`
            : "Escolha um espaço livre para construir.",
    );
  }

  function chooseRoad() {
    stopWalking();
    if (placement?.road) {
      explore();
      return;
    }
    clearAction();
    const x = snapTile(controls.target.x);
    const z = snapTile(controls.target.z);
    placement = {
      road: true,
      erasing: false,
      target: { x, z, y: terrainHeight(x, z) },
    };
    updateActions();
    canvas.focus({ preventScroll: true });
    setStatus("Coloque os trechos lado a lado para ligar as ruas.");
  }

  function toggleRoadErase() {
    if (!placement?.road) return;
    placement.erasing = !placement.erasing;
    updateActions();
    setStatus(
      placement.erasing
        ? "Escolha um trecho de rua para retirar."
        : "Coloque os trechos lado a lado para ligar as ruas.",
    );
  }

  function chooseMove() {
    stopWalking();
    if (placement?.moving || choosingHouse) {
      explore();
      return;
    }
    if (selection) {
      beginPlacement(selection.type, selection);
      return;
    }
    clearAction();
    choosingHouse = true;
    updateActions();
    setStatus("Clique ou toque na construção que você quer mover.");
  }

  function selectHouse(x, y) {
    castRay(x, y);
    const hit = raycaster.intersectObjects(
      houses.map(({ model }) => model),
      true,
    )[0];
    let model = hit?.object;
    while (model && model.parent !== scene) model = model.parent;
    selection = houses.find((house) => house.model === model) ?? null;
    if (selection && choosingHouse) {
      beginPlacement(selection.type, selection);
    } else {
      updateActions();
      setStatus(
        selection
          ? "Use os botões para mover, girar ou excluir."
          : choosingHouse
            ? "Clique ou toque na construção que você quer mover."
            : "Abra a Loja para construir ou selecione uma construção.",
      );
    }
  }

  function placeConstruction() {
    if (!placement) return;
    refreshPreview();
    if (
      !candidate ||
      !insideBuildArea(candidate.x, candidate.z, placement.type, placement.rotation)
    ) {
      setStatus("Escolha um lote dentro da grade de construção.");
      return;
    }
    if (!candidate.valid) {
      setStatus(
        placement.erasing
          ? roads.has(tileKey(candidate.x, candidate.z))
            ? "Mova o poste da calçada antes de retirar este trecho."
            : "Escolha um trecho de rua existente."
          : isLamp(placement.type)
            ? "Escolha uma calçada ou um espaço livre para o poste."
            : isLargeFootprint(placement.type)
              ? "Todos os lotes da construção precisam estar livres de ruas e construções."
              : "Este lote está ocupado ou faz parte de outra divisão.",
      );
      return;
    }

    const { x, z } = candidate;
    if (placement.road) {
      placeRoad(x, z);
      return;
    }
    const { type, rotation, moving } = placement;
    if (moving) {
      if (moving.x !== x || moving.z !== z || moving.rotation !== rotation) {
        undoHistory.push({
          house: moving,
          previous: { x: moving.x, z: moving.z, rotation: moving.rotation },
        });
        Object.assign(moving, { x, z, rotation });
        syncModel(moving);
      }
    } else {
      const house = addHouse({ x, z, rotation, type }, true);
      undoHistory.push({ house });
    }
    saveWorld();
    clearAction();
    syncParcels();
    const { noun, ending } = categoryFor(type);
    setStatus(`${noun} ${moving ? "movid" : "construíd"}${ending}.`);
  }

  function placeRoad(x, z) {
    const key = tileKey(x, z);
    const previousRoad = roads.get(key);
    undoHistory.push({ roadKey: key, previousRoad });
    if (placement.erasing) {
      roads.delete(key);
      setStatus("Trecho retirado.");
    } else {
      roads.set(key, { x, z, order: nextOrder++ });
      setStatus("Trecho colocado. Escolha o próximo bloco.");
    }
    aim = null;
    placement.lastSite = { x, z, y: 0 };
    placement.target = null;
    syncStreets();
    saveWorld();
  }

  function deleteSelectedHouse() {
    if (!selection) return;
    const house = selection;
    const removedIndex = removeHouse(house);
    undoHistory.push({ house, removedIndex });
    clearAction();
    syncParcels();
    saveWorld();
    canvas.focus({ preventScroll: true });
    const { noun, ending } = categoryFor(house.type);
    setStatus(`${noun} excluíd${ending}.`);
  }

  function undoConstruction() {
    if (!houses.length && !roads.size && !undoHistory.length) return;
    stopWalking();
    clearAction();
    let change = undoHistory.pop();
    if (!change) {
      let latestRoad = null;
      for (const road of roads.values()) {
        if (!latestRoad || road.order > latestRoad.order) latestRoad = road;
      }
      const lastHouse = houses.at(-1);
      change =
        latestRoad && (!lastHouse || latestRoad.order > lastHouse.order)
          ? { roadKey: tileKey(latestRoad.x, latestRoad.z) }
          : { house: lastHouse };
    }
    if (change.roadKey) {
      if (change.previousRoad) roads.set(change.roadKey, change.previousRoad);
      else roads.delete(change.roadKey);
      syncStreets();
      setStatus(
        change.previousRoad
          ? "Trecho restaurado."
          : "O último trecho foi retirado.",
      );
    } else if (change.removedIndex !== undefined) {
      const { house, removedIndex } = change;
      houses.splice(removedIndex, 0, house);
      scene.add(house.model);
      syncModel(house);
      const { noun, ending } = categoryFor(house.type);
      setStatus(`${noun} restaurad${ending}.`);
    } else if (change.previous) {
      Object.assign(change.house, change.previous);
      syncModel(change.house);
      setStatus(
        Object.hasOwn(change.previous, "x")
          ? "A construção voltou ao lote anterior."
          : "A construção voltou à orientação anterior.",
      );
    } else {
      removeHouse(change.house);
      setStatus("A última construção foi removida.");
    }
    if (!change.roadKey) syncParcels();
    saveWorld();
    invalidate();
  }

  function rotateHouse(turn) {
    if (placement?.road) return;
    let house = placement ?? selection;
    if (!house) return;
    const { rotation, type } = house;
    const [width, depth] = footprint(type);
    if (!placement && width !== depth) {
      beginPlacement(type, house);
      house = placement;
    }
    house.rotation = (rotation + turn + 4) % 4;
    if (placement) {
      const target = placement.target;
      const site = placementSite(target.x, target.z, type);
      placement.target = { ...site, y: placementHeight(site.x, site.z, type) };
      setStatus(width !== depth && placement.moving
        ? "Escolha e confirme o lote para girar a construção."
        : "Prévia girada.");
    } else {
      undoHistory.push({ house, previous: { rotation } });
      syncModel(house);
      saveWorld();
      const { noun, ending } = categoryFor(type);
      setStatus(`${noun} girad${ending}.`);
    }
    invalidate();
  }

  function toggleGrid() {
    if (walker.active) explore();
    showGrid = !showGrid;
    grid.visible = !placement?.road && (Boolean(placement) || showGrid);
    element("grid-button").setAttribute("aria-pressed", showGrid);
    invalidate();
  }

  function clearMovement() {
    movementKeys.clear();
    touchDirections.clear();
    if (walkLook) {
      if (canvas.hasPointerCapture(walkLook.id))
        canvas.releasePointerCapture(walkLook.id);
      walkLook = null;
      canvas.style.cursor = "grab";
    }
  }

  function updateWalkingControls() {
    walkButton.setAttribute("aria-pressed", walker.active);
    walkPad.hidden = !walker.active;
    element("zoom-in").hidden = element("zoom-out").hidden = walker.active;
  }

  function toggleWalking() {
    if (walker.active) {
      explore();
      return;
    }
    clearMovement();
    pointers.clear();
    gesture = null;
    walker.enter(
      controls.target,
      camera.getWorldDirection(forward),
      houses,
      buildingTemplates,
      roads.values(),
    );
    controls.enabled = false;
    updateWalkingControls();
    clearAction();
    canvas.focus({ preventScroll: true });
    setStatus(touchControls.matches
      ? "Use as setas para andar. Arraste para olhar ao redor."
      : "WASD ou setas para andar. Arraste para olhar. Esc sai do passeio.");
  }

  function stopWalking() {
    if (!walker.active) return;
    walker.leave();
    clearMovement();
    controls.enabled = true;
    updateWalkingControls();
    invalidate();
  }

  function resetCamera() {
    if (walker.active) explore();
    controls.reset();
    controls.target.set(0, 0, 0);
    const scale = window.innerWidth / window.innerHeight < 0.8 ? 1.22 : 1;
    camera.position.set(88 * scale, 82 * scale, 93 * scale);
    controls.update();
    controls.saveState();
    invalidate();
  }

  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    invalidate();
  }

  function resize() {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    const aspect = canvas.clientWidth / canvas.clientHeight;
    for (const view of [camera, walker.camera]) {
      view.aspect = aspect;
      view.updateProjectionMatrix();
    }
    invalidate();
  }

  function readMovement() {
    movement.set(0, 0, 0);
    if (!movementKeys.size && !touchDirections.size) return movement;
    const view = walker.active ? walker.camera : camera;
    view.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, view.up);
    const touchKeys = [...touchDirections.values()];
    const pressed = (key, arrow) => movementKeys.has(key) ||
      (walker.active && (movementKeys.has(arrow) || touchKeys.includes(key)));
    if (pressed("w", "arrowup")) movement.add(forward);
    if (pressed("s", "arrowdown")) movement.sub(forward);
    if (pressed("d", "arrowright")) movement.add(right);
    if (pressed("a", "arrowleft")) movement.sub(right);
    return movement.normalize();
  }

  function draw(time) {
    framePending = false;
    const delta = Math.min((time - lastFrame) / 1000, 0.04);
    lastFrame = time;
    if (walker.active) {
      if (walker.advance(readMovement(), delta)) dirty = true;
    } else if (movementKeys.size) {
      const offset = readMovement().multiplyScalar(
        delta * Math.max(25, camera.position.distanceTo(controls.target) * 0.4),
      );
      camera.position.add(offset);
      controls.target.add(offset);
      dirty = true;
    }
    const cameraChanged = !walker.active && controls.update(delta);
    if (animations.size) {
      for (const [model, sequence] of animations) {
        if (reduceMotion.matches || updateConstruction(sequence, time)) {
          finishConstruction(sequence);
          animations.delete(model);
          renderer.shadowMap.needsUpdate = true;
        }
      }
      dirty = true;
    }
    if (dirty || cameraChanged) {
      const view = walker.active ? walker.camera : camera;
      const target = walker.active ? view.position : controls.target;
      if (!walker.active) {
        const height = terrainHeight(target.x, target.z);
        camera.position.y += height - target.y;
        target.y = height;
      }
      daylight.positionLights(target);
      daylight.sky.position.copy(view.position);
      if (updateWorld(view)) renderer.shadowMap.needsUpdate = true;
      refreshPreview();
      nightLights.update(houses, view, target, daylight.lampPower);
      renderer.render(scene, view);
      dirty = false;
    }
    if (cameraChanged || movementKeys.size || touchDirections.size || animations.size)
      scheduleFrame();
  }

  controls.addEventListener("change", invalidate);
  canvas.style.cursor = "grab";
  for (const type of ["touchstart", "touchmove"]) {
    canvas.addEventListener(type, (event) => {
      // In first person, pointer events handle the drag instead of browser gestures.
      if (walker.active) event.preventDefault();
    }, { passive: false });
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (walker.active) {
      if (event.button !== 0 || walkLook) return;
      event.preventDefault();
      walkLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }
    canvas.style.cursor = "grabbing";
    pointers.add(event.pointerId);
    gesture =
      pointers.size === 1 && event.button === 0
        ? {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          }
        : null;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (walker.active) {
      if (walkLook?.id !== event.pointerId) return;
      walker.look(event.clientX - walkLook.x, event.clientY - walkLook.y);
      walkLook.x = event.clientX;
      walkLook.y = event.clientY;
      invalidate();
      return;
    }
    if (
      gesture &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5
    )
      gesture.moved = true;
    if (placement && event.pointerType !== "touch") {
      aim = { x: event.clientX, y: event.clientY };
      invalidate();
    }
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (walkLook?.id !== event.pointerId) return;
    walkLook = null;
    canvas.style.cursor = "grab";
  });
  canvas.addEventListener("pointerup", (event) => {
    if (walker.active) return;
    pointers.delete(event.pointerId);
    canvas.style.cursor = placement || choosingHouse ? "crosshair" : "grab";
    if (gesture?.id === event.pointerId && !gesture.moved && !pointers.size) {
      if (!placement) {
        selectHouse(event.clientX, event.clientY);
      } else {
        aim = null;
        placement.target = pointLot(event.clientX, event.clientY);
        if (event.pointerType === "touch") {
          refreshPreview();
          setStatus(
            candidate?.valid
              ? "Confirme a seleção ou toque em outro lugar."
              : placement.erasing
                ? "Escolha um trecho de rua existente."
                : "Escolha um espaço livre dentro da grade.",
          );
          invalidate();
        } else {
          placeConstruction();
        }
      }
    }
    if (!pointers.size) gesture = null;
  });
  canvas.addEventListener("pointercancel", (event) => {
    pointers.delete(event.pointerId);
    gesture = null;
    canvas.style.cursor = placement || choosingHouse ? "crosshair" : "grab";
  });
  canvas.addEventListener("pointerleave", () => {
    if (!placement || !aim) return;
    placement.target = pointLot(aim.x, aim.y);
    aim = null;
    invalidate();
  });

  for (const button of walkPad.querySelectorAll("[data-walk]")) {
    button.addEventListener("pointerdown", (event) => {
      if (!walker.active || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchDirections.set(event.pointerId, button.dataset.walk);
      invalidate();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, (event) => {
        if (touchDirections.delete(event.pointerId)) invalidate();
      });
    }
  }

  for (const id of [
    "shop-button",
    "explore-button",
    "move-button",
    "road-button",
    "grid-button",
    "walk-button",
    "reset-camera",
    "zoom-in",
    "zoom-out",
    "help-button",
  ])
    element(id).disabled = false;
  element("explore-button").onclick = explore;
  element("cancel-button").onclick = explore;
  element("road-button").onclick = chooseRoad;
  element("road-erase").onclick = toggleRoadErase;
  element("move-button").onclick = chooseMove;
  element("move-selected").onclick = chooseMove;
  element("rotate-left").onclick = () => rotateHouse(1);
  element("rotate-button").onclick = () => rotateHouse(-1);
  element("delete-selected").onclick = deleteSelectedHouse;
  element("place-button").onclick = placeConstruction;
  element("grid-button").onclick = toggleGrid;
  element("reset-camera").onclick = resetCamera;
  walkButton.onclick = toggleWalking;
  element("shop-button").addEventListener("click", () => {
    if (walker.active) explore();
  });
  element("zoom-in").onclick = () => zoom(0.83);
  element("zoom-out").onclick = () => zoom(1.2);
  element("help-button").onclick = () => help.showModal();
  element("close-help").onclick = () => help.close();
  for (const dialog of [shop, help]) {
    dialog.addEventListener("focusin", clearMovement);
  }

  window.addEventListener("keydown", (event) => {
    if (
      help.open ||
      shop.open ||
      event.altKey ||
      (event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select, [contenteditable]"))
    )
      return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === "z" && !event.shiftKey && !event.repeat) {
        event.preventDefault();
        undoConstruction();
      }
      return;
    }
    if ("wasd".includes(key) && key.length === 1) {
      movementKeys.add(key);
      invalidate();
    }
    if (walker.active && Object.hasOwn(lotSteps, key)) {
      event.preventDefault();
      movementKeys.add(key);
      invalidate();
      return;
    }
    if (placement && Object.hasOwn(lotSteps, key)) {
      event.preventDefault();
      const [dx, dz] = lotSteps[key];
      const onParcel =
        placement.target &&
        parcels.has(tileKey(placement.target.x, placement.target.z));
      const large = isLargeFootprint(placement.type);
      const lamp = isLamp(placement.type);
      const scale = lamp ? 0.5 : placement.road || onParcel || large ? LOT_SIZE / 2 : 1;
      const target =
        (aim && pointLot(aim.x, aim.y)) ||
        placement.target ||
        placement.lastSite ||
        controls.target;
      const fallbackLimit = placement.road
        ? snapTile(BUILD_LIMIT)
        : lamp ? BUILD_LIMIT : snap(BUILD_LIMIT - 1);
      const [limitX, limitZ] = large
        ? footprint(placement.type, placement.rotation).map(buildLimit)
        : [fallbackLimit, fallbackLimit];
      const site = placementSite(
        THREE.MathUtils.clamp(target.x + dx * scale, -limitX, limitX),
        THREE.MathUtils.clamp(target.z + dz * scale, -limitZ, limitZ),
      );
      aim = null;
      placement.target = { ...site, y: placementHeight(site.x, site.z, placement.type) };
      invalidate();
      return;
    }
    if (event.repeat) return;
    if (key === "1" || key === "escape") explore();
    if (key === "2") element("shop-button").click();
    if (key === "3") chooseRoad();
    if (key === "4") toggleWalking();
    if (key === "m") chooseMove();
    if (key === "r") rotateHouse(event.shiftKey ? 1 : -1);
    if (key === "delete" && selection) {
      event.preventDefault();
      deleteSelectedHouse();
    }
    if (key === "g") toggleGrid();
    if (key === "home") resetCamera();
    if (
      key === "enter" &&
      placement &&
      !(event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      placeConstruction();
    }
  });
  window.addEventListener("keyup", (event) =>
    movementKeys.delete(event.key.toLowerCase()),
  );
  window.addEventListener("blur", clearMovement);
  window.addEventListener("resize", resize);
  resetCamera();
  resize();
  renderer.shadowMap.needsUpdate = true;
}
