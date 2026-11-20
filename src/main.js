import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  LOT_SIZE,
  DECORATION_STEP,
  placementBounds,
  canPlace,
  footprint,
  overlapsLot,
  insideBuildArea,
  isBuilding,
  isLamp,
  isFreeLight,
  isLightHeight,
  FREE_LIGHT_MIN_Y,
  FREE_LIGHT_MAX_Y,
  FREE_LIGHT_DEFAULT_Y,
  isDecoration,
  isPaving,
  isTree,
  isPlantingBed,
  plantingBedUnder,
  pavingUnderBuilding,
  isLargeFootprint,
  readSave,
} from "./placement.js";
import { setPavingGroundCover } from "./ground-cover.js";
import { createHouse, createWorld, terrainHeight } from "./world.js";
import { buildArea, EXPANSION_LIMIT, EXPANSION_SIZE } from "./village-area.js";
import { loadBuildingModels, loadMaterials } from "./assets.js";
import { createMiranteOriental } from "./mirante-oriental.js";
import { createEdificioOrion } from "./edificio-orion.js";
import { createConvergencia, createUnlitConvergence } from "./convergencia.js";
import { createConvergenceAnimation } from "./convergencia-efeitos.js";
import {
  STELLAR_ALTITUDE, STELLAR_DRAIN_DURATION, STELLAR_EVENT_DURATION, STELLAR_GRID_RESTORE_DURATION,
  STELLAR_REACTIVATION_DURATION, STELLAR_REACTIVATION_PRICE, STELLAR_REACTIVATION_TOTAL, STELLAR_SHUTDOWN,
  isStellarNight, stellarBusy, stellarElapsed, stellarShowElapsed,
} from "./stellar-event.js";
import { createStellarTimeline } from "./stellar-timeline.js";
import { createStellarAudio } from "./stellar-audio.js";
import { NEBULA_CYCLE_SECONDS } from "./ceu-nebuloso.js";
import { createMeteorShower } from "./chuva-de-meteoros.js";
import { createFerrisWheel, createFerrisWheelAnimation } from "./roda-gigante.js";
import { createLexCorpAnimation } from "./torre-lexcorp.js";
import { createPoliceStationAnimation } from "./posto-policial.js";
import { DEFAULT_AREA_SIZE, getBuildAreaSize, nextAreaSize, setBuildAreaSize } from "./build-area.js";
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
import { createPavingModels } from "./paving-models.js";
import { PAVING_HEIGHT, pavingHeightAt } from "./paving-types.js";
import { planPavingLine } from "./paving-line.js";
import {
  canBuildHouse,
  canBuildRoad,
  canMoveRoad,
  canRemoveRoad,
  houseSite,
  lampRestHeight,
  readRoads,
  roadLots,
  roadMask,
  snapTile,
  tileKey,
} from "./road-layout.js";
import { createStreetLayer } from "./street.js";
import { createWalker } from "./walking.js";
import { createTraffic } from "./traffic.js";
import {
  advanceEconomy, cityEconomy, economyProfile, formatCoins, formatNumber, startingBalance,
  ECONOMY_CYCLE_MS, EXPANSION_PRICE, MAX_BALANCE, ROAD_PRICE,
} from "./economy.js";
import { createVillageStore, loadVillage } from "./village-storage.js";
import { villageOverview } from "./camera-framing.js";
import { optimizeBuildingTemplates, createBuildingBatches } from "./building-batches.js";
import { registerDecorationObstacles, decorationSurfaceHeight } from "./decoration-obstacles.js";
import "./style.css";

const categoryCopy = {
  residential: {
    noun: "Casa",
    ending: "a",
  },
  apartments: {
    noun: "Prédio",
    ending: "o",
  },
  commercial: {
    noun: "Comércio",
    ending: "o",
  },
  landmarks: {
    noun: "Monumento",
    ending: "o",
  },
  lighting: {
    noun: "Poste",
    ending: "o",
  },
  decoration: {
    noun: "Decoração",
    ending: "a",
  },
  paving: {
    noun: "Bloco",
    ending: "o",
  },
};

const categoryFor = (type) => isFreeLight(type) ? { noun: "Luz", ending: "a" } : categoryCopy[BUILDING_TYPES[type].category];
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
  let preparing = true;
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
  setBuildAreaSize(saved.world?.areaSize ?? DEFAULT_AREA_SIZE);
  const saveState = element("save-state");
  const store = createVillageStore(saved.revision, (message, failed = false) => {
    saveState.textContent = message;
    saveState.toggleAttribute("data-error", failed);
  });
  saveState.textContent = saved.world || saved.hour
    ? "✓ Salvo no MongoDB"
    : "Salvamento automático";
  let expansion = saved.world?.expansion ?? {};
  let area = buildArea(expansion);
  const terrainAt = (x, z) => terrainHeight(x, z, area);

  const materials = await loadMaterials(renderer);
  const buildingTemplates = {
    [DEFAULT_HOUSE]: createHouse(materials),
    ...(await loadBuildingModels(materials)),
    miranteOriental: createMiranteOriental(),
    edificioOrion: createEdificioOrion(),
    convergencia: createConvergencia(),
    rodaGigante: createFerrisWheel(),
    ...createCommercialBuildings(materials),
    ...createLampModels(),
    ...createPavingModels(),
  };
  addUrbanDetails(buildingTemplates);
  addSakuraGarden(buildingTemplates.sakura, materials);
  addOrientalGarden(buildingTemplates.oriental, materials);
  addChurchDetails(buildingTemplates.church, materials);
  registerDecorationObstacles(buildingTemplates);
  optimizeBuildingTemplates(buildingTemplates);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c6dfd9");
  const viewDistance = 410;
  scene.fog = new THREE.Fog("#c6dfd9", 165, viewDistance);
  const camera = new THREE.PerspectiveCamera(47, 1, 0.5, viewDistance);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.minDistance = 24;
  const catalogViewDistance = Math.max(245, ...Object.values(BUILDING_TYPES).map(details => (details.height ?? 0) * 2.7));
  controls.maxDistance = catalogViewDistance;
  controls.minPolarAngle = 0.13;
  controls.maxPolarAngle = Math.PI * 0.43;

  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const daylight = createDaylight(scene, renderer, buildingTemplates);
  const meteorShower = createMeteorShower(daylight.sky);
  const nightLights = createNightLights(scene, { clustered: true });
  Object.values(buildingTemplates).forEach(model => nightLights.bind(model));
  const unlitConvergence = createUnlitConvergence(buildingTemplates.convergencia);
  nightLights.bind(unlitConvergence.model);
  const buildingBatches = createBuildingBatches(scene, buildingTemplates);
  const stellarTimeline = createStellarTimeline();
  const stellarAudio = createStellarAudio();
  const convergenceAnimation = createConvergenceAnimation(scene, stellarTimeline, unlitConvergence.materials);
  const nebulaDirection = new THREE.Vector3(0, 1, 0);
  const nebulaViewDirection = new THREE.Vector3();
  let nebulaSeconds = 0;
  let drainLayout = -1;
  let drainSource = null;
  let drainExtent = 0;
  let stellarSkyAt = saved.world?.stellarSkyAt;
  let convergenceReserve = saved.world?.convergenceReserve;
  let stellarMonument = null;
  let stellarWasRunning = false;
  const ferrisWheelAnimation = createFerrisWheelAnimation();
  const lexCorpAnimation = createLexCorpAnimation(scene,{groundHeight:terrainAt});
  const policeAnimation = createPoliceStationAnimation(scene,{groundHeight:terrainAt});

  const {
    ground,
    grid,
    roadGrid,
    setArea: setWorldArea,
    update: updateWorld,
    updatePaving,
  } = createWorld(scene, materials, area);
  const streets = createStreetLayer(materials);
  scene.add(streets.roadsLayer, streets.plotsLayer);
  let roads = new Map();
  const pavingBlocks = new Map();
  const traffic = createTraffic(scene, (x, z) => Math.max(
    streets.surfaceHeight(x, z, roads) ?? 0, pavingHeightAt(x, z, pavingBlocks),
  ));
  const walker = createWalker(
    (x, z) => Math.max(
      streets.surfaceHeight(x, z, roads) ?? 0, terrainAt(x, z),
      pavingHeightAt(x, z, pavingBlocks),
    ),
    viewDistance,
  );
  const walkButton = element("walk-button");
  const walkPad = element("walk-pad");
  const flightButton = element("flight-toggle");
  const flightButtons = document.querySelectorAll(".flight-touch");
  const expansionButton = element("extend-button");
  const expansionPanel = element("expansion-panel");
  const expansionOptions = [...expansionPanel.querySelectorAll("[data-expand]")];
  let expanding = false;
  const expansionOutline = new THREE.LineLoop(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3)),
    new THREE.LineBasicMaterial({ color: "#ffe199", depthTest: false }),
  );
  expansionOutline.frustumCulled = false;
  expansionOutline.visible = false;
  scene.add(expansionOutline);
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
  const pavingLineGeometry = new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2);
  const pavingLineMaterial = new THREE.MeshBasicMaterial({
    transparent: true, opacity: .5, depthTest: false, depthWrite: false,
  });
  let pavingLineGhost, drawnPavingLine;
  const pavingLineMatrix = new THREE.Matrix4();
  const pavingLineColor = new THREE.Color();

  function updatePavingLineGhost(plan) {
    if (!plan?.cells.length) {
      if (pavingLineGhost) pavingLineGhost.visible = false;
      drawnPavingLine = null;
      return;
    }
    if (pavingLineGhost) pavingLineGhost.visible = true;
    if (drawnPavingLine === plan) return;
    if (!pavingLineGhost || pavingLineGhost.instanceMatrix.count < plan.cells.length) {
      if (pavingLineGhost) { pavingLineGhost.removeFromParent(); pavingLineGhost.dispose(); }
      pavingLineGhost = new THREE.InstancedMesh(pavingLineGeometry, pavingLineMaterial,
        THREE.MathUtils.ceilPowerOfTwo(plan.cells.length));
      pavingLineGhost.renderOrder = 5;
      pavingLineGhost.raycast = () => {};
      scene.add(pavingLineGhost);
    }
    plan.cells.forEach((cell, index) => {
      pavingLineMatrix.makeTranslation(cell.x, cell.y + PAVING_HEIGHT + .09, cell.z);
      pavingLineGhost.setMatrixAt(index, pavingLineMatrix);
      pavingLineColor.set(cell.state === "ready" ? "#b8ed86" : cell.state === "blocked" ? "#ef806b" : "#efbd68");
      pavingLineGhost.setColorAt(index, pavingLineColor);
    });
    pavingLineGhost.count = plan.cells.length;
    pavingLineGhost.visible = true;
    pavingLineGhost.instanceMatrix.needsUpdate = true;
    pavingLineGhost.instanceColor.needsUpdate = true;
    pavingLineGhost.computeBoundingSphere();
    drawnPavingLine = plan;
  }

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
  raycaster.layers.enable(1);
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
  let layoutVersion = 0;
  let dirty = true;
  let framePending = false;
  let lastFrame = 0;
  let lastRenderedFrame = 0;
  const hasConvergence = () => houses.some(({ type }) => type === "convergencia");
  const convergenceLimit = "Limite de uma Convergência por vila.";

  const shop = createShop(
    renderer,
    buildingTemplates,
    beginPlacement,
    invalidate,
    nightLights,
    type => type === "convergencia" && hasConvergence() ? convergenceLimit : "",
  );
  const hourPicker = element("village-hour");
  const nightOption = hourPicker.querySelector('option[value="23"]');
  const stellarAction = element("stellar-action");
  const stellarStart = element("stellar-start");
  const stellarHint = element("stellar-hint");
  const soundToggle = element("sound-toggle");
  soundToggle.addEventListener("click", () => {
    const muted = soundToggle.getAttribute("aria-pressed") === "true";
    soundToggle.setAttribute("aria-pressed", String(!muted));
    stellarAudio.setMuted(muted);
    if (!muted) stellarAudio.unlock();
    invalidate();
  });
  function unlockCurrentStellarAudio() {
    if (stellarBusy(stellarMonument, Date.now())) stellarAudio.unlock();
  }
  window.addEventListener("pointerdown", unlockCurrentStellarAudio, { passive: true });
  window.addEventListener("keydown", unlockCurrentStellarAudio);
  window.addEventListener("pagehide", stellarAudio.stop);
  if (saved.hour) hourPicker.value = saved.hour;
  daylight.setHour(Number(hourPicker.value));
  hourPicker.addEventListener("change", () => {
    daylight.setHour(Number(hourPicker.value));
    updateStellarAction();
    invalidate();
    store({ hour: hourPicker.value });
  });

  const help = element("help-dialog");
  const extend = element("extend-dialog");

  function updateExtensionInfo() {
    const format = bounds => `${(bounds.maxX - bounds.minX + 6).toLocaleString("pt-BR")} × ${(bounds.maxZ - bounds.minZ + 6).toLocaleString("pt-BR")} m`;
    element("current-area").textContent = format(area);
    element("next-area").textContent = format(buildArea(expansion, nextAreaSize(getBuildAreaSize())));
  }

  function showExtension() {
    clearMovement();
    expanding = true;
    updateExpansionOutline();
    updateExtensionInfo();
    updateActions();
    if (!extend.open) extend.showModal();
  }

  function expandArea() {
    if (!charge(EXPANSION_PRICE)) return;
    undoHistory.push({ expansion, areaSize: getBuildAreaSize(), paid: EXPANSION_PRICE });
    setBuildAreaSize(nextAreaSize(getBuildAreaSize()));
    setExpansion(expansion);
    updateWorld(walker.active ? walker.camera : camera, walker.active ? walker.camera.position : controls.target);
    nightLights.bind(scene);
    saveWorld();
    extend.close();
    canvas.focus({ preventScroll: true });
    setStatus(`Terreno ampliado para ${element("next-area").textContent}. Continue construindo!`);
    invalidate();
  }

  function updateGhostModel(type) {
    const preview = buildingTemplates[type].clone();
    preview.traverse((part) => {
      if (part.isMesh) {
        part.material = ghostMaterial;
        part.castShadow = false;
        if (part.userData.groundCover) part.visible = false;
      }
    });
    ghost.traverse((part) => { if (part.isInstancedMesh) part.dispose(); });
    ghost.clear().add(preview);
  }

  function scheduleFrame() {
    if (!preparing && !framePending) {
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

  function syncModel(house) {
    const { model, x, z, rotation, type, order } = house;
    const raised = isBuilding(type) || isLamp(type) || isDecoration(type) || isPaving(type);
    model.position.set(x, isFreeLight(type) ? house.y ?? FREE_LIGHT_DEFAULT_Y : raised ? placementHeight(x, z, type, rotation, order) : 0, z);
    if (isBuilding(type)) setPavingGroundCover(model, houses.some(block =>
      isPaving(block.type) && overlapsLot(block.x, block.z, footprint(block.type), house)), animations.has(model));
    model.rotation.y = (rotation * Math.PI) / 2;
    model.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  function attachHouse(house) {
    scene.add(house.model);
    if (house.type === "convergencia") {
      if (convergenceReserve) {
        delete house.stellarAt;
        delete house.stellarReactivatedAt;
        Object.assign(house, convergenceReserve);
        convergenceReserve = undefined;
      }
      convergenceAnimation.add(house.model, house.stellarAt, house.stellarReactivatedAt);
      const timestamp = house.stellarAt ?? house.stellarReactivatedAt ?? 0;
      if (timestamp > (stellarMonument?.stellarAt ?? stellarMonument?.stellarReactivatedAt ?? 0)) stellarMonument = house;
    }
    if (house.type === "rodaGigante") ferrisWheelAnimation.add(house.model);
    if (house.type === "lexCorp") lexCorpAnimation.add(house.model);
    if (house.type === "policeStation") policeAnimation.add(house.model);
    syncModel(house);
  }

  function addHouse(data, animate = false) {
    const model = buildingTemplates[data.type].clone();
    const house = { order: nextOrder, ...data,
      ...(isFreeLight(data.type) ? { y: data.y ?? FREE_LIGHT_DEFAULT_Y } : {}), model };
    nextOrder = Math.max(nextOrder, house.order + 1);
    houses.push(house);
    attachHouse(house);
    if (animate && !isLamp(data.type) && !isPaving(data.type) && !reduceMotion.matches)
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
    if (house.type === "convergencia" && !hasConvergence()) convergenceReserve = stellarSnapshot(house);
    if (house === stellarMonument) {
      stellarMonument = houses.find(entry => entry.stellarAt || entry.stellarReactivatedAt) ?? null;
    }
    finishHouseAnimation(house);
    convergenceAnimation.remove(house.model);
    ferrisWheelAnimation.remove(house.model);
    lexCorpAnimation.remove(house.model);
    policeAnimation.remove(house.model);
    scene.remove(house.model);
    renderer.shadowMap.needsUpdate = true;
    return index;
  }

  function stellarSnapshot({ stellarAt, stellarReactivatedAt }) {
    if (stellarAt) return { stellarAt };
    return stellarReactivatedAt ? { stellarReactivatedAt } : {};
  }

  function saveWorld(layoutChanged = true, hour) {
    if (layoutChanged) {
      metrics = cityEconomy(houses);
      traffic.setDemand(metrics.residents, metrics.employed);
      lexCorpAnimation.setCity(houses);
      policeAnimation.setCity(houses);
      if (walker.active) walker.updateObstacles(houses, buildingTemplates);
    }
    showEconomy();
    store({ ...(hour ? { hour } : {}), world: {
      version: 1,
      areaSize: getBuildAreaSize(),
      houses: houses.map(house => {
        const { x, y, z, rotation, type } = house;
        return { x, z, rotation, type, ...(isFreeLight(type) ? { y } : {}), ...stellarSnapshot(house) };
      }),
      houseOrder: houses.map((house) => house.order),
      roads: [...roads.values()],
      economy: { ...treasury },
      ...(stellarSkyAt !== undefined ? { stellarSkyAt } : {}),
      ...(convergenceReserve ? { convergenceReserve } : {}),
      ...(Object.keys(expansion).length ? { expansion } : {}),
    } });
  }

  const initial = saved.world ? readSave(saved.world, area) : STARTER_HOUSES;
  // Older saves recorded a launch only on its monument.
  if (stellarSkyAt === undefined) stellarSkyAt = initial.reduce((first, { stellarAt }) =>
    stellarAt && (!first || stellarAt < first) ? stellarAt : first, convergenceReserve?.stellarAt);
  if (!convergenceReserve && stellarSkyAt && !initial.some(({ type }) => type === "convergencia")) {
    convergenceReserve = { stellarAt: stellarSkyAt };
  }
  let metrics = cityEconomy(initial);
  const treasury = {
    coins: saved.world?.economy?.coins ?? startingBalance(metrics.residents),
    progressMs: saved.world?.economy?.progressMs ?? 0,
  };
  const balanceLabel = element("city-coins");
  const populationLabel = element("city-population");
  const incomeLabel = element("city-income");
  const revenueProgress = element("city-revenue-progress");
  const expansionCost = element("expansion-cost");
  const actionCost = element("action-cost");
  const priceLabel = (price) => formatCoins(price) + (price > treasury.coins ? " · saldo insuficiente" : "");

  function showEconomy() {
    balanceLabel.textContent = formatCoins(treasury.coins);
    populationLabel.textContent = formatNumber(metrics.residents);
    incomeLabel.textContent = `+${formatNumber(metrics.income)}`;
    incomeLabel.title = `${formatCoins(metrics.residents)} de moradores + ${formatCoins(metrics.commerceIncome)} do comércio (${formatNumber(metrics.employed)} vagas preenchidas de ${formatNumber(metrics.jobs)}).`;
    revenueProgress.value = treasury.progressMs / 1000;
    const canAffordExpansion = treasury.coins >= EXPANSION_PRICE;
    element("expand-area").disabled = !canAffordExpansion;
    element("expand-area").textContent = `Estender terreno · ${priceLabel(EXPANSION_PRICE)}`;
    expansionCost.textContent = `+3 lotes · ${priceLabel(EXPANSION_PRICE)}`;
    expansionCost.classList.toggle("unaffordable", !canAffordExpansion);
    for (const button of expansionOptions) {
      button.disabled = !canAffordExpansion || (expansion[button.dataset.expand] ?? 0) >= EXPANSION_LIMIT;
    }
    updateStellarAction();
  }

  function placementPrice() {
    if (!placement || placement.moving || placement.movingRoad || placement.erasing) return 0;
    return placement.road ? ROAD_PRICE : economyProfile(placement.type).price;
  }

  function charge(price) {
    if (treasury.coins < price) {
      setStatus(`Saldo insuficiente. Esta ação custa ${formatCoins(price)}.`);
      return false;
    }
    treasury.coins -= price;
    return true;
  }

  const viewCamera = () => walker.active ? walker.camera : camera;

  function updateStellarAction() {
    const monument = selection?.type === "convergencia" ? selection : null;
    stellarAction.hidden = !monument;
    if (!monument) return;
    const now = Date.now();
    const spent = Boolean(monument.stellarAt);
    const night = isStellarNight(hourPicker.value);
    const running = stellarBusy(stellarMonument, now);
    const inProgress = running && stellarMonument === monument;
    const action = inProgress ? "Em andamento" : spent ? "Reativar Convergência" : "Explosão Estelar";
    if (stellarStart.dataset.action !== action) {
      stellarStart.dataset.action = action;
      stellarStart.lastChild.textContent = ` ${action}`;
    }
    stellarStart.disabled = running || animations.has(monument.model) ||
      (spent ? treasury.coins < STELLAR_REACTIVATION_PRICE : !night);
    stellarHint.textContent = inProgress ? "" : spent
      ? `${priceLabel(STELLAR_REACTIVATION_PRICE)} · restaura a energia da vila`
      : night ? `Grátis · ${STELLAR_EVENT_DURATION} s` : "Grátis · disponível à noite";
  }

  function activateStellarShow() {
    const monument = selection;
    if (monument?.type !== "convergencia") return;
    const now = Date.now();
    if (stellarBusy(stellarMonument, now) || animations.has(monument.model)) return;
    const reactivating = Boolean(monument.stellarAt);
    if (reactivating) {
      if (!charge(STELLAR_REACTIVATION_PRICE)) return;
      delete monument.stellarAt;
      monument.stellarReactivatedAt = now;
      stellarSkyAt = null;
      hourPicker.value = "23";
      daylight.setHour(23);
    } else {
      if (!isStellarNight(hourPicker.value)) return;
      delete monument.stellarReactivatedAt;
      monument.stellarAt = now;
      stellarSkyAt ??= now;
    }
    stellarMonument = monument;
    convergenceAnimation.setEvent(monument.model, monument.stellarAt, monument.stellarReactivatedAt);
    stellarAudio.unlock();
    saveWorld(false, hourPicker.value);
    updateActions();
    setStatus(reactivating ? "Reativando a Convergência." : "A Convergência está recolhendo a energia da vila.");
    invalidate();
  }

  initial.forEach((house) => addHouse(house));
  roads = readRoads(saved.world?.roads, houses, nextOrder, area);
  for (const { order } of roads.values())
    nextOrder = Math.max(nextOrder, order + 1);
  syncStreets();
  traffic.setDemand(metrics.residents, metrics.employed);
  showEconomy();
  setStatus("Abra a Loja ou escolha Ruas para construir.");

  function syncParcels() {
    layoutVersion++;
    pavingBlocks.clear();
    for (const house of houses) {
      const { x, z, type, rotation, order, model } = house;
      if (!isBuilding(type)) continue;
      model.position.y = placementHeight(x, z, type, rotation, order);
      model.updateMatrixWorld();
      setPavingGroundCover(model, houses.some(block => isPaving(block.type) &&
        overlapsLot(block.x, block.z, footprint(block.type), house)), animations.has(model));
    }
    for (const { x, z, type, order, model } of houses) {
      if (!isPaving(type)) continue;
      model.position.y = placementHeight(x, z, type, 0, order);
      model.updateMatrixWorld();
      pavingBlocks.set(tileKey(x, z), model.position.y + PAVING_HEIGHT);
    }
    for (const { x, z, type, rotation, model } of houses) {
      if (isFreeLight(type) || (!isLamp(type) && !isDecoration(type))) continue;
      model.position.y = placementHeight(x, z, type, rotation);
      model.updateMatrixWorld();
    }
    updatePaving((x, z) => pavingHeightAt(x, z, pavingBlocks) > 0 ||
      streets.covers(x, z, roads));
    renderer.shadowMap.needsUpdate = true;
    parcels = roadLots(roads, area);
    for (const [key, { x, z }] of parcels) {
      const alignedHouse = houses.some(
        (house) => house.x === x && house.z === z,
      );
      if (!alignedHouse && !canPlace(x, z, houses, null, undefined, 0, area)) parcels.delete(key);
    }
    streets.updatePlots([...parcels.values()]);
    streets.plotsLayer.visible = !walker.active && (Boolean(placement) || showGrid);
  }

  function syncStreets() {
    streets.updateRoads(roads);
    traffic.setRoads(roads);
    syncParcels();
    invalidate();
  }

  function placementSite(x, z, type = placement?.type) {
    return placement?.road
      ? { x: snapTile(x), z: snapTile(z) }
      : houseSite(x, z, parcels, type, placement?.rotation);
  }

  function placementHeight(x, z, type, rotation = 0, order = nextOrder) {
    if (isFreeLight(type)) return placement?.height ?? FREE_LIGHT_DEFAULT_Y;
    const terrain = terrainAt(x, z);
    if (isBuilding(type)) {
      const building = { x, z, type, rotation, order };
      return houses.some(block => isPaving(block.type) && pavingUnderBuilding(block, building))
        ? terrain + PAVING_HEIGHT : 0;
    }
    if (isPaving(type)) {
      const block = { x, z, type, order };
      if (houses.some(house => isBuilding(house.type) && pavingUnderBuilding(block, house))) return terrain;
      return Math.max(terrain, decorationSurfaceHeight(x, z, houses));
    }
    const paved = pavingHeightAt(x, z, pavingBlocks);
    if (isLamp(type)) return Math.max(terrain, paved, lampRestHeight(x, z, roads));
    if (isTree(type)) {
      const bed = plantingBedUnder({ type, x, z, rotation }, houses);
      if (bed) return placementHeight(bed.x, bed.z, bed.type, bed.rotation) + BUILDING_TYPES[bed.type].plantingBed.height;
    }
    if (isDecoration(type)) return Math.max(
      terrain, paved, streets.surfaceHeight(x, z, roads) ?? 0,
      decorationSurfaceHeight(x, z, houses),
    );
    return terrain;
  }

  function castRay(x, y) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((y - bounds.top) / bounds.height) * 2,
    );
    const view = viewCamera();
    view.updateMatrixWorld();
    raycaster.setFromCamera(pointer, view);
  }

  function pointLot(x, y) {
    castRay(x, y);
    const freeLight = isFreeLight(placement?.type);
    const targets = freeLight
      ? [...ground.children, ...houses.filter(h => !isFreeLight(h.type) && h !== placement.moving).map(h => h.model)]
      : isTree(placement?.type)
      ? [...ground.children, ...houses.filter(house => isPlantingBed(house.type)).map(house => house.model)]
      : ground.children;
    const hit = raycaster.intersectObjects(targets, freeLight || isTree(placement?.type))[0];
    if (!hit || (walker.active && hit.distance > (walker.flying ? 180 : 60))) return null;
    let point = hit.point;
    if (freeLight && hit.face) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
      point = point.clone().addScaledVector(normal, .2);
    }
    const site = placementSite(point.x, point.z);
    const height = freeLight
      ? placement.heightLocked ? placement.height : THREE.MathUtils.clamp(point.y, FREE_LIGHT_MIN_Y, FREE_LIGHT_MAX_Y)
      : isBuilding(placement?.type) || isLamp(placement?.type) || isDecoration(placement?.type) || isPaving(placement?.type)
      ? placementHeight(site.x, site.z, placement.type, placement.rotation, siteOrder(site.x, site.z))
      : hit.point.y;
    return { ...site, y: height };
  }

  function siteOrder(x, z) {
    const moving = placement?.moving;
    return moving?.x === x && moving.z === z ? moving.order : nextOrder;
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
    const bounds = canvas.getBoundingClientRect();
    const following = walker.active && placement?.followView;
    let target = placement && (following
      ? pointLot(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      : aim ? pointLot(aim.x, aim.y) : placement.target);
    const freeLight = isFreeLight(placement?.type);
    if (target && freeLight && placement.heightLocked) target = { ...target, y: placement.height };
    element("walk-reticle").hidden = !following;
    const roadMode = Boolean(placement?.road);
    const linePlan = placement?.lineStart && target ? pavingLinePlan(target) : null;
    const price = linePlan ? linePlan.cost : placementPrice();
    const affordable = price <= treasury.coins;
    actionCost.hidden = price === 0;
    if (price) actionCost.textContent = linePlan ? `${linePlan.ready.length} blocos · ${priceLabel(price)}` : priceLabel(price);
    actionCost.classList.toggle("unaffordable", !affordable);
    const active = placement ?? selection;
    const [width, depth] = footprint(active?.type, active?.rotation);
    lot.scale.set(width / LOT_SIZE, depth / LOT_SIZE, 1);
    border.scale.set(width / LOT_SIZE, 1, depth / LOT_SIZE);
    if (target) {
      const { x, z, y } = target;
      const erasing = placement.erasing;
      const valid = roadMode
        ? placement.movingRoad
          ? canMoveRoad(x, z, placement.movingRoad, houses, roads, area)
          : erasing
            ? canRemoveRoad(x, z, houses, roads)
            : canBuildRoad(x, z, houses, roads, area)
        : canBuildHouse(
            x,
            z,
            houses,
            roads,
            parcels,
            placement.moving,
            placement.type,
            placement.rotation,
            area,
          ) && (!walker.active || walker.canBuildAt(placement.type, x, z, placement.rotation, buildingTemplates, y)) && (!freeLight || isLightHeight(y));
      candidate = { x, y, z, valid };
      if (roadMode) {
        const previewRoads = placement.movingRoad ? new Map(roads) : roads;
        if (placement.movingRoad)
          previewRoads.delete(tileKey(placement.movingRoad.x, placement.movingRoad.z));
        const mask = roadMask(x, z, previewRoads);
        if (mask !== roadGhostMask) {
          roadGhost.clear().add(streets.preview(mask, roadGhostMaterial));
          roadGhostMask = mask;
        }
        roadGhost.position.set(x, y + 0.035, z);
        roadGhostMaterial.color.set(valid && affordable && !erasing ? "#e8f4b4" : "#ff9a75");
      } else {
        ghost.position.set(x, y + (freeLight ? 0 : 0.08), z);
        ghost.rotation.y = (placement.rotation * Math.PI) / 2;
        ghostMaterial.color.set(valid && affordable ? "#e8ffcb" : "#ffab8e");
      }
      const highlight = valid && affordable && !erasing;
      lot.position.set(x, y + (roadMode ? 0.157 : 0.065), z);
      const borderHeight = roadMode ? 0.185 : isPaving(active?.type) ? PAVING_HEIGHT + 0.09 : 0.105;
      border.position.set(x, y + borderHeight, z);
      plotLines.position.copy(border.position);
      updatePlotLines(width, depth);
      lotMaterial.color.set(highlight ? "#c4f58f" : "#dd5d41");
      border.material.color.set(highlight ? "#e3ffad" : "#ffb08a");
    } else {
      candidate = null;
      if (selection) {
        const height = selection.road ? 0.185
          : selection.model.position.y + (isPaving(selection.type) ? PAVING_HEIGHT + 0.04 : 0.11);
        border.position.set(selection.x, height, selection.z);
        border.material.color.set("#ffcf79");
      }
    }
    lot.visible = Boolean(candidate) && !freeLight && !placement?.lineStart;
    ghost.visible = Boolean(candidate) && !roadMode && !placement?.lineStart;
    roadGhost.visible = Boolean(candidate) && roadMode;
    border.visible = Boolean(candidate || selection) && !placement?.lineStart;
    plotLines.visible = Boolean(candidate && isLargeFootprint(active?.type));
    updatePavingLineGhost(linePlan);
    element("place-button").disabled = linePlan ? !linePlan.ready.length : !candidate?.valid || !affordable;
    updateLightHeightControls();
  }

  function pavingLinePlan(target) {
    const { lineStart, type, rotation } = placement;
    const key = [lineStart.x, lineStart.z, target.x, target.z, type, rotation, layoutVersion, treasury.coins].join(":");
    if (placement.linePreview?.key === key) return placement.linePreview.plan;
    const plan = planPavingLine(lineStart, target, {
      bounds: placementBounds(type, rotation, area),
      canBuild: (x, z) => canBuildHouse(x, z, houses, roads, parcels, null, type, rotation, area),
      unitPrice: economyProfile(type).price,
      balance: treasury.coins,
    });
    const heights = new Map();
    for (const cell of plan.ready) {
      cell.y = placementHeight(cell.x, cell.z, type, rotation);
      heights.set(tileKey(cell.x, cell.z), cell.y);
    }
    for (const cell of plan.cells) cell.y = heights.get(tileKey(cell.x, cell.z)) ?? terrainAt(cell.x, cell.z);
    placement.linePreview = { key, plan };
    return plan;
  }

  function fillPavingLine(target) {
    const plan = pavingLinePlan(target);
    if (!plan.ready.length) {
      setStatus(plan.unaffordable ? "Saldo insuficiente para preencher esta linha." : "Nenhum bloco livre nesta linha. Escolha outro ponto final.");
      return;
    }
    if (!charge(plan.cost)) return;
    const { type, rotation } = placement;
    const pavingBatch = plan.ready.map(({ x, z }) => addHouse({ x, z, type, rotation }));
    undoHistory.push({ pavingBatch, paid: plan.cost });
    placement.lineStart = placement.linePreview = null;
    aim = null;
    placement.lastSite = { ...target };
    placement.target = null;
    placement.followView = walker.active;
    syncParcels();
    saveWorld();
    updateActions();
    canvas.focus({ preventScroll: true });
    const skipped = plan.blocked + plan.unaffordable;
    setStatus(`${pavingBatch.length} blocos de calçada colocados${skipped ? `; ${skipped} pulados` : ""}. Ctrl+Z desfaz a linha. Shift+clique inicia outra.`);
  }

  function lightHeightValue() {
    return placement && isFreeLight(placement.type)
      ? placement.heightLocked ? placement.height : candidate?.y ?? placement.target?.y ?? placement.lastSite?.y ?? placement.height
      : selection?.y ?? FREE_LIGHT_DEFAULT_Y;
  }

  function updateLightHeightControls() {
    const free = isFreeLight((placement || selection)?.type);
    element("light-height-controls").hidden = !free;
    if (!free) return;
    const y = lightHeightValue();
    const input = element("light-height");
    if (document.activeElement !== input) input.value = Number(y.toFixed(2));
    element("light-lower").disabled = y <= FREE_LIGHT_MIN_Y;
    element("light-raise").disabled = y >= FREE_LIGHT_MAX_Y;
  }

  function setLightHeight(value) {
    if (!isFreeLight((placement || selection)?.type)) return;
    if (!isLightHeight(value)) {
      element("light-height").value = lightHeightValue();
      setStatus(`Use uma altura entre ${FREE_LIGHT_MIN_Y} e ${FREE_LIGHT_MAX_Y} metros.`);
      return;
    }
    if (placement) {
      placement.height = value;
      placement.heightLocked = true;
      if (placement.target) placement.target.y = value;
    } else if (selection.y !== value) {
      undoHistory.push({ house: selection, previous: { y: selection.y } });
      selection.y = value;
      syncModel(selection);
      saveWorld();
    }
    refreshPreview();
    invalidate();
  }

  function stepLightHeight(delta) {
    setLightHeight(THREE.MathUtils.clamp(lightHeightValue() + delta, FREE_LIGHT_MIN_Y, FREE_LIGHT_MAX_Y));
  }

  function updateActions() {
    const target = placement || selection;
    const roadMode = Boolean(target?.road);
    const editing = Boolean(placement);
    const moving = choosingHouse || Boolean(placement?.moving || placement?.movingRoad);
    document.body.classList.toggle("placing", editing);
    document.body.classList.toggle("selecting", Boolean(selection));
    document.body.classList.toggle("expanding", expanding);
    element("action-tray").hidden = !target;
    element("move-selected").hidden = !selection;
    element("delete-selected").hidden = !selection;
    const monumentLocked = stellarBusy(selection, Date.now());
    for (const id of ["move-selected", "delete-selected", "rotate-left", "rotate-button"]) {
      element(id).disabled = monumentLocked;
    }
    element("rotate-left").hidden = element("rotate-button").hidden =
      !target || roadMode || isFreeLight(target.type);
    element("road-erase").hidden = !placement?.road || Boolean(placement.movingRoad);
    element("road-erase").setAttribute(
      "aria-pressed",
      Boolean(placement?.erasing),
    );
    element("road-button").setAttribute("aria-pressed", Boolean(placement?.road));
    element("place-button").textContent = placement?.erasing
      ? "Retirar trecho"
      : placement?.lineStart ? "Preencher linha" : "Confirmar";
    element("place-button").hidden = !editing;
    expansionPanel.hidden = !expanding;
    expansionButton.setAttribute("aria-expanded", expanding);
    expansionButton.classList.toggle("active", expanding);
    expansionOutline.visible = expanding;
    element("move-button").setAttribute("aria-pressed", moving);
    if (roadMode) {
      element("action-title").textContent = "Trecho de rua";
      element("action-mode").textContent = !placement
        ? "Rua selecionada"
        : placement.movingRoad
          ? "Mover trecho"
          : placement.erasing
            ? "Remover rua"
            : "Rua modular";
    } else if (target) {
      const { noun, ending } = categoryFor(target.type);
      element("action-title").textContent = BUILDING_TYPES[target.type].label;
      element("action-mode").textContent = placement
        ? placement.moving
          ? "Novo local"
          : isPaving(target.type) ? placement.lineStart ? "Calçada em linha" : "Montar calçada"
            : isDecoration(target.type) ? "Decorar a vila" : "Nova construção"
        : `${noun} selecionad${ending}`;
    }
    canvas.style.cursor = editing || choosingHouse ? "crosshair" : "grab";
    updateStellarAction();
    grid.visible = !walker.active && !roadMode && (showGrid || editing);
    roadGrid.visible = roadMode;
    streets.plotsLayer.visible = !walker.active && (editing || showGrid);
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
    expanding = false;
    aim = null;
    updateActions();
  }

  function explore() {
    stopWalking();
    clearAction();
    setStatus("Clique em uma construção ou trecho de rua para selecionar.");
  }

  function updateExpansionOutline(bounds = area) {
    const { minX, maxX, minZ, maxZ } = bounds;
    const edge = LOT_SIZE / 2;
    const p = expansionOutline.geometry.attributes.position;
    p.setXYZ(0, minX - edge, 0.22, minZ - edge);
    p.setXYZ(1, minX - edge, 0.22, maxZ + edge);
    p.setXYZ(2, maxX + edge, 0.22, maxZ + edge);
    p.setXYZ(3, maxX + edge, 0.22, minZ - edge);
    p.needsUpdate = true;
    invalidate();
  }

  function setExpansion(next) {
    expansion = next;
    area = buildArea(expansion);
    setWorldArea(area);
    syncParcels();
    updateExpansionOutline();
    renderer.shadowMap.needsUpdate = true;
  }

  function expandVillage(side) {
    const steps = expansion[side] ?? 0;
    if (!expanding || steps >= EXPANSION_LIMIT) return;
    if (!charge(EXPANSION_PRICE)) return;
    undoHistory.push({ expansion, paid: EXPANSION_PRICE });
    setExpansion({ ...expansion, [side]: steps + 1 });
    updateExtensionInfo();
    saveWorld();
    setStatus("Terreno liberado para ruas e construções.");
  }

  function cancelAction() {
    if (placement?.lineStart) {
      placement.lineStart = placement.linePreview = null;
      updateActions();
      setStatus("Linha cancelada. Shift+clique marca um novo início; Esc encerra a calçada.");
      return;
    }
    if (walker.active && (placement || selection || choosingHouse)) {
      clearAction();
      canvas.focus({ preventScroll: true });
      setStatus("Você continua caminhando. Abra a Loja para construir ou Esc para sair do passeio.");
    } else explore();
  }

  function beginPlacement(type, moving = null) {
    if (type === "convergencia" && !moving && hasConvergence()) {
      setStatus(convergenceLimit);
      return;
    }
    if (stellarBusy(moving, Date.now())) {
      setStatus("Aguarde a sequência da Convergência terminar para mover o monumento.");
      return;
    }
    clearAction();
    if (moving) {
      finishHouseAnimation(moving);
      moving.model.visible = false;
      renderer.shadowMap.needsUpdate = true;
    }
    const site = moving
      ? { x: moving.x, z: moving.z }
      : placementSite(
          walker.active ? walker.camera.position.x : controls.target.x,
          walker.active ? walker.camera.position.z : controls.target.z,
          type,
        );
    placement = {
      type,
      moving,
      rotation: moving?.rotation ?? 0,
      target: { ...site, y: placementHeight(site.x, site.z, type, moving?.rotation, moving?.order) },
      ...(isFreeLight(type) ? { height: moving?.y ?? FREE_LIGHT_DEFAULT_Y, heightLocked: Boolean(moving) } : {}),
      followView: walker.active,
    };
    updateGhostModel(type);
    updateActions();
    canvas.focus({ preventScroll: true });
    const [width, depth] = footprint(type);
    setStatus(
      isFreeLight(type)
        ? "Clique em uma superfície ou ajuste a Altura. Page Up/Down sobe e desce a luz; Esc termina."
        : isPaving(type) && !moving
        ? "Clique para assentar um bloco. Shift+clique marca o início de uma linha; depois clique no final. Esc cancela."
        : walker.active
        ? "Mire no chão e clique para construir; Enter também confirma. Arraste para olhar. Esc cancela."
        : moving
        ? "Escolha o novo local para a construção."
        : isLamp(type)
          ? "Instale vários postes seguidos. Use Esc ou × para terminar."
          : isPaving(type)
            ? "Assente os blocos na área verde, lado a lado. Esc ou × termina a calçada."
            : isDecoration(type)
            ? isPlantingBed(type)
              ? "Coloque o canteiro no meio da rua. Depois escolha uma árvore e plante dentro dele."
              : "Decore jardins, calçadas e espaços entre casas. As setas ajustam 25 cm; R gira a peça."
          : isLargeFootprint(type)
            ? `Escolha ${(width * depth) / LOT_SIZE ** 2} lotes livres em uma área de ${width / LOT_SIZE} × ${depth / LOT_SIZE}.`
            : "Escolha um espaço livre para construir.",
    );
  }

  function chooseRoad() {
    if (placement?.road) {
      cancelAction();
      return;
    }
    clearAction();
    const focus = walker.active ? walker.camera.position : controls.target;
    const x = snapTile(focus.x);
    const z = snapTile(focus.z);
    placement = {
      road: true,
      erasing: false,
      target: { x, z, y: terrainAt(x, z) },
      followView: walker.active,
    };
    updateActions();
    canvas.focus({ preventScroll: true });
    setStatus("Coloque os trechos lado a lado para ligar as ruas.");
  }

  function toggleRoadErase() {
    if (!placement?.road || placement.movingRoad) return;
    placement.erasing = !placement.erasing;
    updateActions();
    setStatus(
      placement.erasing
        ? "Escolha um trecho de rua para retirar."
        : "Coloque os trechos lado a lado para ligar as ruas.",
    );
  }

  function beginRoadMove(road) {
    clearAction();
    placement = {
      road: true,
      movingRoad: roads.get(tileKey(road.x, road.z)),
      target: { x: road.x, z: road.z, y: terrainAt(road.x, road.z) },
      followView: walker.active,
    };
    updateActions();
    canvas.focus({ preventScroll: true });
    setStatus("Escolha o novo local do trecho e confirme. Esc cancela a mudança.");
  }

  function chooseMove() {
    if (placement?.moving || placement?.movingRoad || choosingHouse) {
      cancelAction();
      return;
    }
    if (selection) {
      if (selection.road) beginRoadMove(selection);
      else beginPlacement(selection.type, selection);
      return;
    }
    clearAction();
    choosingHouse = true;
    updateActions();
    setStatus("Clique ou toque na construção ou no trecho de rua que você quer mover.");
  }

  function selectHouse(x, y) {
    castRay(x, y);
    const lightHandle = raycaster.intersectObjects(houses.filter(h => isFreeLight(h.type)).map(h => h.model), true)[0];
    const hit = lightHandle ?? raycaster.intersectObjects(
      [...houses.map(({ model }) => model), ...convergenceAnimation.pickable(), streets.roadsLayer],
      true,
    )[0];
    let model = convergenceAnimation.ownerOf(hit?.object) ?? hit?.object;
    while (model && model.parent !== scene) model = model.parent;
    selection = houses.find((house) => house.model === model) ?? null;
    if (model === streets.roadsLayer) {
      const road = roads.get(tileKey(snapTile(hit.point.x), snapTile(hit.point.z)));
      if (road) selection = { ...road, road: true };
    }
    if (selection && choosingHouse) {
      if (selection.road) beginRoadMove(selection);
      else beginPlacement(selection.type, selection);
    } else {
      updateActions();
      setStatus(
        selection
          ? selection.road
            ? "Use Mover ou Excluir para editar este trecho de rua."
            : selection.type === "convergencia"
              ? selection.stellarAt ? "Reative a Convergência para preparar outra Explosão Estelar." : "Selecione Explosão Estelar à noite."
              : "Use os botões para mover, girar ou excluir."
          : choosingHouse
            ? "Escolha a construção ou o trecho de rua que você quer mover."
            : "Selecione uma construção ou trecho de rua, ou abra a Loja.",
      );
    }
  }

  function placeConstruction(options = {}) {
    if (!placement) return;
    if (placement.type === "convergencia" && !placement.moving && hasConvergence()) {
      setStatus(convergenceLimit);
      return;
    }
    refreshPreview();
    if (isPaving(placement.type) && !placement.moving && (options.shiftKey || placement.lineStart)) {
      if (!candidate) { setStatus("Escolha um ponto no terreno para a linha de calçada."); return; }
      if (placement.lineStart) fillPavingLine(candidate);
      else {
        placement.lineStart = { x: candidate.x, z: candidate.z };
        updateActions();
        setStatus("Início marcado. Clique no final: trechos vermelhos serão pulados. Esc cancela a linha.");
      }
      return;
    }
    if (
      !candidate ||
      !insideBuildArea(candidate.x, candidate.z, placement.type, placement.rotation, area)
    ) {
      setStatus("Escolha um lote dentro da grade de construção.");
      return;
    }
    if (!candidate.valid) {
      setStatus(
        placement.movingRoad
          ? "Escolha um local onde a rua não cubra construções, postes ou blocos de calçada."
          : placement.erasing
            ? "Escolha um trecho de rua existente."
            : isPaving(placement.type)
              ? "Escolha uma área verde ou a borda da rua. O bloco precisa de espaço livre."
              : isLamp(placement.type)
              ? "Escolha uma calçada ou um espaço livre para o poste."
              : isDecoration(placement.type)
                ? "Aproxime a peça de um espaço livre, sem atravessar paredes ou outra decoração."
              : isLargeFootprint(placement.type)
                ? "Todos os lotes da construção precisam estar livres de ruas e construções."
                : "Este lote está ocupado ou faz parte de outra divisão.",
      );
      return;
    }

    const { x, y, z } = candidate;
    const price = placementPrice();
    if (!charge(price)) return;
    if (placement.road) {
      placeRoad(x, z, price);
      return;
    }
    const { type, rotation, moving } = placement;
    if (moving) {
      if (moving.x !== x || moving.z !== z || moving.rotation !== rotation || (isFreeLight(type) && moving.y !== y)) {
        undoHistory.push({
          house: moving,
          previous: { x: moving.x, z: moving.z, rotation: moving.rotation, order: moving.order, ...(isFreeLight(type) ? { y: moving.y } : {}) },
        });
        const changesLayer = (moving.x !== x || moving.z !== z) && (isBuilding(type) || isPaving(type));
        const order = changesLayer ? nextOrder++ : moving.order;
        Object.assign(moving, { x, z, rotation, order, ...(isFreeLight(type) ? { y } : {}) });
        syncModel(moving);
      }
    } else {
      const house = addHouse({ x, z, rotation, type, ...(isFreeLight(type) ? { y } : {}) }, true);
      undoHistory.push({ house, paid: price });
    }
    syncParcels();
    saveWorld();
    if ((isPaving(type) || isLamp(type) || isDecoration(type)) && !moving) {
      aim = null;
      placement.lastSite = { x, z, y: isFreeLight(type) ? y : placementHeight(x, z, type, rotation) };
      placement.target = null;
      placement.followView = walker.active;
      updateActions();
      canvas.focus({ preventScroll: true });
      setStatus(isFreeLight(type)
        ? "Luz colocada. Escolha outro ponto ou ajuste a altura. Esc termina."
        : isPaving(type)
        ? "Bloco assentado. Shift+clique inicia uma linha; outro clique preenche. Esc ou × termina."
        : isDecoration(type)
        ? "Decoração colocada. Escolha o próximo local. Esc ou × para terminar."
        : "Poste instalado. Escolha o próximo local. Esc ou × para terminar.");
      return;
    }
    clearAction();
    const { noun, ending } = categoryFor(type);
    setStatus(`${noun} ${moving ? "movid" : "construíd"}${ending}.`);
  }

  function placeRoad(x, z, price) {
    const key = tileKey(x, z);
    const source = placement.movingRoad;
    if (source) {
      if (source.x !== x || source.z !== z) {
        undoHistory.push({ roadMove: { source, destinationKey: key } });
        roads.delete(tileKey(source.x, source.z));
        roads.set(key, { ...source, x, z });
      }
      clearAction();
      syncStreets();
      saveWorld();
      setStatus("Trecho de rua movido.");
      return;
    }
    if (placement.erasing) {
      removeRoad(key);
      setStatus("Trecho de rua excluído.");
    } else {
      undoHistory.push({ roadKey: key, paid: price });
      roads.set(key, { x, z, order: nextOrder++ });
      setStatus("Trecho colocado. Escolha o próximo bloco.");
    }
    aim = null;
    placement.lastSite = { x, z, y: 0 };
    placement.target = null;
    syncStreets();
    saveWorld();
  }

  function removeRoad(key) {
    undoHistory.push({ roadKey: key, previousRoad: roads.get(key) });
    roads.delete(key);
  }

  function deleteSelection() {
    if (!selection) return;
    if (stellarBusy(selection, Date.now())) return;
    if (selection.road) {
      const { x, z } = selection;
      const key = tileKey(x, z);
      removeRoad(key);
      clearAction();
      syncStreets();
      saveWorld();
      canvas.focus({ preventScroll: true });
      setStatus("Trecho de rua excluído.");
      return;
    }
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
    if (placement?.lineStart) { cancelAction(); return; }
    if (!houses.length && !roads.size && !undoHistory.length) return;
    clearAction();
    let change = undoHistory.at(-1);
    if (!change) {
      let latestRoad = null;
      for (const road of roads.values()) {
        if (!latestRoad || road.order > latestRoad.order) latestRoad = road;
      }
      const lastHouse = houses.reduce((last, house) => !last || house.order > last.order ? house : last, null);
      change =
        latestRoad && (!lastHouse || latestRoad.order > lastHouse.order)
          ? { roadKey: tileKey(latestRoad.x, latestRoad.z) }
          : { house: lastHouse };
    }
    if (change.removedIndex !== undefined && change.house.type === "convergencia" && hasConvergence()) {
      setStatus(convergenceLimit);
      return;
    }
    if (stellarBusy(change.house, Date.now())) {
      setStatus("Aguarde a sequência da Convergência terminar para desfazer esta ação.");
      return;
    }
    if (undoHistory.length) undoHistory.pop();
    if (change.expansion) {
      if (change.areaSize !== undefined) setBuildAreaSize(change.areaSize);
      setExpansion(change.expansion);
      setStatus("Expansão desfeita.");
    } else if (change.roadMove) {
      const { source, destinationKey } = change.roadMove;
      roads.delete(destinationKey);
      roads.set(tileKey(source.x, source.z), source);
      syncStreets();
      setStatus("O trecho voltou ao local anterior.");
    } else if (change.roadKey) {
      if (change.previousRoad) roads.set(change.roadKey, change.previousRoad);
      else roads.delete(change.roadKey);
      syncStreets();
      setStatus(
        change.previousRoad
          ? "Trecho restaurado."
          : "O último trecho foi retirado.",
      );
    } else if (change.pavingBatch) {
      for (const house of change.pavingBatch) removeHouse(house);
      setStatus("Linha de calçada desfeita.");
    } else if (change.removedIndex !== undefined) {
      const { house, removedIndex } = change;
      houses.splice(removedIndex, 0, house);
      attachHouse(house);
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
    if (!change.roadKey && !change.roadMove && !change.expansion) syncParcels();
    if (change.paid) treasury.coins = Math.min(MAX_BALANCE, treasury.coins + change.paid);
    saveWorld();
    invalidate();
  }

  function rotateHouse(turn) {
    if (stellarBusy(selection, Date.now())) return;
    if (isFreeLight((placement || selection)?.type)) return;
    if (placement?.road || selection?.road) return;
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
      const target = candidate || placement.target || placement.lastSite;
      const site = placementSite(target.x, target.z, type);
      placement.target = { ...site, y: placementHeight(site.x, site.z, type, house.rotation, siteOrder(site.x, site.z)) };
      setStatus(width !== depth && placement.moving
        ? "Escolha e confirme o lote para girar a construção."
        : "Prévia girada.");
    } else {
      undoHistory.push({ house, previous: { rotation } });
      syncModel(house);
      if (isBuilding(type)) syncParcels();
      saveWorld();
      const { noun, ending } = categoryFor(type);
      setStatus(`${noun} girad${ending}.`);
    }
    invalidate();
  }

  function toggleGrid() {
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
    flightButton.hidden = !walker.active;
    flightButton.textContent = walker.flying && !walker.landing ? "Pousar" : "Voar";
    for (const button of flightButtons) button.hidden = !walker.flying || walker.landing;
    element("zoom-in").hidden = element("zoom-out").hidden = walker.active;
  }

  function toggleFlight() {
    if (!walker.active) return;
    clearMovement();
    walker.toggleFlight();
    updateWalkingControls();
    canvas.focus({ preventScroll: true });
    setStatus(walker.landing ? "Pousando. Pressione F ou toque em Voar para voltar ao voo."
      : touchControls.matches ? "Use as setas para se mover e os botões laterais para subir ou descer."
        : "WASD ou setas para voar. Espaço sobe, Shift desce e F pousa. Arraste para olhar.");
    invalidate();
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
      area,
    );
    controls.enabled = false;
    updateWalkingControls();
    clearAction();
    canvas.focus({ preventScroll: true });
    setStatus(touchControls.matches
      ? "Use as setas para andar, arraste para olhar ou toque em Voar."
      : "WASD ou setas para andar. Arraste para olhar. F voa, Esc sai do passeio.");
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
    const overview = villageOverview(houses, roads.values(), canvas.clientWidth / canvas.clientHeight);
    if (overview) {
      controls.target.copy(overview.target);
      camera.position.copy(overview.position);
    }
    controls.maxDistance = Math.max(catalogViewDistance, overview?.distance * 1.25 || 0);
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
    renderer.setPixelRatio(window.devicePixelRatio || 1);
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
      const wasFlying = walker.flying;
      const vertical = (key) => movementKeys.has(key) || [...touchDirections.values()].includes(key);
      const lift = Number(vertical("space")) - Number(vertical("shift"));
      if (walker.advance(readMovement(), delta, lift)) dirty = true;
      if (wasFlying && !walker.flying) {
        updateWalkingControls();
        setStatus("Pouso concluído. Use WASD ou as setas para caminhar.");
      }
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
          if (selection?.model === model) updateStellarAction();
          renderer.shadowMap.needsUpdate = true;
        }
      }
      dirty = true;
    }
    const now = Date.now();
    if (convergenceAnimation.syncPower(now)) dirty = true;
    const night = isStellarNight(hourPicker.value);
    const elapsed = stellarMonument?.stellarAt ? stellarShowElapsed(stellarMonument.stellarAt, now) : 0;
    const reactivationAt = stellarMonument?.stellarReactivatedAt;
    const reactivation = reactivationAt ? stellarElapsed(reactivationAt, now) : undefined;
    const reactivating = reactivation < STELLAR_REACTIVATION_DURATION;
    const restoringGrid = reactivation >= STELLAR_REACTIVATION_DURATION && reactivation < STELLAR_REACTIVATION_TOTAL;
    const running = stellarBusy(stellarMonument, now);
    const runningChanged = running !== stellarWasRunning;
    stellarAudio.sync(running && !document.hidden ? stellarMonument : null, now);
    if (runningChanged) {
      stellarWasRunning = running;
      dirty = true;
      hourPicker.disabled = preparing || running;
      if (!running) setStatus(reactivationAt ? "A energia voltou a toda a vila. A Convergência está pronta."
        : "A vila está sem energia. Reative a Convergência para reacender as luzes.");
      updateActions();
    }
    const skyElapsed = stellarSkyAt ? stellarShowElapsed(stellarSkyAt, now) : 0;
    const skyForming = night && Boolean(stellarSkyAt) && skyElapsed >= 0 && skyElapsed < STELLAR_SHUTDOWN;
    const skyReady = skyElapsed >= STELLAR_SHUTDOWN || reactivating;
    const nightLabel = skyReady ? "Céu nebuloso · 23:00" : "Noite · 23:00";
    if (nightOption.textContent !== nightLabel) nightOption.textContent = nightLabel;
    const nebula = night && reactivating ? 1 - THREE.MathUtils.smoothstep(reactivation, 13, STELLAR_REACTIVATION_DURATION)
      : skyReady && night ? 1 : skyForming ? stellarTimeline.sample(skyElapsed).nebula : 0;
    const stellarState = stellarMonument?.stellarAt && running && elapsed >= 0 ? stellarTimeline.sample(elapsed) : null;
    const draining = stellarMonument?.stellarAt && elapsed < 0;
    const gridTransition = draining || restoringGrid;
    const drain = nightLights.uniforms.cityDrain.value;
    if (gridTransition) {
      const { x, z } = stellarMonument;
      if (drainSource !== stellarMonument || drainLayout !== layoutVersion) {
        drainLayout = layoutVersion;
        drainSource = stellarMonument;
        drainExtent = 40;
        for (const house of houses) {
          const [width, depth] = footprint(house.type, house.rotation);
          drainExtent = Math.max(drainExtent, Math.hypot(house.x - x, house.z - z) + Math.hypot(width, depth) / 2);
        }
        for (const road of roads.values()) drainExtent = Math.max(drainExtent, Math.hypot(road.x - x, road.z - z) + LOT_SIZE);
      }
      const feather = 1.65;
      const progress = restoringGrid ? (reactivation - STELLAR_REACTIVATION_DURATION) / STELLAR_GRID_RESTORE_DURATION
        : -elapsed / STELLAR_DRAIN_DURATION;
      const radius = THREE.MathUtils.lerp(-feather, drainExtent + feather, progress);
      drain.set(x, z, radius, feather);
    } else drain.w = 0;
    const blackout = reactivating || (Boolean(stellarSkyAt) && skyElapsed >= 0);
    const darkness = night ? stellarState?.darkness ?? 0 : 0;
    const flash = night ? (stellarState?.dayFlash ?? 0) * (reduceMotion.matches ? .25 : 1) : 0;
    const gridChanged = daylight.setStellarLighting(blackout, darkness, flash, stellarMonument?.model.position);
    if (gridChanged) dirty = true;
    if (gridChanged && running && stellarState && blackout) setStatus("A Explosão Estelar começou.");
    if (restoringGrid && (gridChanged || runningChanged))
      setStatus("A energia está voltando das ruas próximas até os bairros mais distantes.");
    const view = viewCamera();
    if (skyForming && stellarMonument?.stellarAt === stellarSkyAt) {
      nebulaDirection.copy(stellarMonument.model.position);
      nebulaDirection.y += STELLAR_ALTITUDE;
      nebulaDirection.sub(view.position).normalize();
    }
    const horizonAngle = THREE.MathUtils.degToRad(view.fov / 2 + 5);
    const nebulaMoving = nebula > 0 && !reduceMotion.matches && !document.hidden &&
      view.getWorldDirection(nebulaViewDirection).y > -Math.sin(horizonAngle);
    if (nebulaMoving) nebulaSeconds = (nebulaSeconds + delta) % NEBULA_CYCLE_SECONDS;
    meteorShower.update(night && skyReady && nebula > .75 && !reduceMotion.matches, nebulaMoving ? delta : 0);
    const skyChanged = daylight.setNebula(nebula, nebulaDirection, nebulaSeconds / NEBULA_CYCLE_SECONDS * Math.PI * 2);
    daylight.setStellarWaves(night ? stellarState?.waves : undefined, reduceMotion.matches ? .40 : 1);
    const sceneChanged = dirty || cameraChanged;
    if (sceneChanged) {
      const target = walker.active ? view.position : controls.target;
      if (!walker.active) {
        const height = terrainAt(target.x, target.z);
        camera.position.y += height - target.y;
        target.y = height;
      }
      daylight.positionLights(target);
      daylight.sky.position.copy(view.position);
      const overviewDistance = walker.flying
        ? Math.max(0, view.position.y - terrainAt(target.x, target.z)) * 2
        : walker.active ? 0 : view.position.distanceTo(target);
      const worldFar = Math.max(viewDistance, overviewDistance + 190);
      const skyFar = night && stellarMonument?.stellarAt && elapsed >= 0 && elapsed < STELLAR_SHUTDOWN ? Math.hypot(view.position.x - stellarMonument.x,
        view.position.y - stellarMonument.model.position.y - STELLAR_ALTITUDE, view.position.z - stellarMonument.z) + 255 : 0;
      const far = Math.max(worldFar, skyFar);
      if (view.far !== far) {
        view.far = far;
        view.updateProjectionMatrix();
      }
      scene.fog.near = Math.max(165, overviewDistance + 10);
      scene.fog.far = worldFar;
      if (updateWorld(view, target)) {
        renderer.shadowMap.needsUpdate = true;
        nightLights.bind(scene);
      }
      refreshPreview();
      buildingBatches.sync(houses, animations, view);
      nightLights.update(houses, view, daylight.lampPower);
      dirty = false;
    }
    const convergenceMoving = convergenceAnimation.update(view, time, animations, !reduceMotion.matches, now, night, blackout);
    const wheelMoving = ferrisWheelAnimation.update(view, time, animations, !reduceMotion.matches, !blackout, nightLights.supplyAt);
    const lexCorpMoving = lexCorpAnimation.update(view, time, animations, !reduceMotion.matches,
      daylight.lampPower, !blackout, nightLights.supplyAt);
    const policeMoving = policeAnimation.update(view, time, animations, !reduceMotion.matches,
      daylight.lampPower, !blackout, nightLights.supplyAt);
    const trafficFocus = walker.active ? view.position : controls.target;
    const trafficZoom = walker.active
      ? Math.max(0, view.position.y - terrainAt(view.position.x, view.position.z)) * 2
      : view.position.distanceTo(controls.target);
    const trafficMoving = traffic.update(trafficFocus, trafficZoom, delta, !reduceMotion.matches, !blackout,
      gridTransition ? nightLights.supplyAt : undefined);
    const effectsAnimated = skyForming || running || nebulaMoving || convergenceMoving || wheelMoving || lexCorpMoving || policeMoving || trafficMoving;
    const effectFrame = effectsAnimated && time - lastRenderedFrame >= 1000 / 30 - 2;
    if (sceneChanged || effectFrame || (skyChanged && !skyForming)) {
      renderer.render(scene, view);
      lastRenderedFrame = time;
    }
    if (cameraChanged || movementKeys.size || touchDirections.size || walker.inTransition || animations.size || effectsAnimated)
      scheduleFrame();
  }

  controls.addEventListener("change", invalidate);
  reduceMotion.addEventListener("change", invalidate);
  canvas.style.cursor = "grab";
  function clickWorld(event) {
    if (expanding) clearAction();
    if (!placement) {
      selectHouse(event.clientX, event.clientY);
      return;
    }
    aim = null;
    placement.followView = false;
    placement.target = pointLot(event.clientX, event.clientY);
    if (event.pointerType === "touch" && !placement.lineStart && !event.shiftKey) {
      refreshPreview();
      const price = placementPrice();
      setStatus(candidate?.valid
        ? price > treasury.coins ? `Você precisa de ${formatCoins(price)} para construir.`
          : "Confirme a seleção ou toque em outro lugar."
        : placement.erasing ? "Escolha um trecho de rua existente."
          : "Escolha um espaço livre dentro da grade e longe dos seus pés.");
      invalidate();
    } else placeConstruction({ shiftKey: event.shiftKey });
  }
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
      walkLook = {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, moved: false,
      };
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
      if (walkLook?.id === event.pointerId) {
        if (Math.hypot(event.clientX - walkLook.startX, event.clientY - walkLook.startY) > 5)
          walkLook.moved = true;
        if (walkLook.moved) {
          walker.look(event.clientX - walkLook.x, event.clientY - walkLook.y);
          aim = null;
          if (placement) placement.followView = true;
          invalidate();
        }
        walkLook.x = event.clientX;
        walkLook.y = event.clientY;
      } else if (placement && event.pointerType !== "touch") {
        aim = { x: event.clientX, y: event.clientY };
        placement.followView = false;
        invalidate();
      }
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
    if (walker.active) {
      const clicked = walkLook?.id === event.pointerId && !walkLook.moved;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      walkLook = null;
      canvas.style.cursor = placement || choosingHouse ? "crosshair" : "grab";
      if (clicked) clickWorld(event);
      return;
    }
    pointers.delete(event.pointerId);
    canvas.style.cursor = placement || choosingHouse ? "crosshair" : "grab";
    if (gesture?.id === event.pointerId && !gesture.moved && !pointers.size) {
      clickWorld(event);
    }
    if (!pointers.size) gesture = null;
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (walkLook?.id === event.pointerId) walkLook = null;
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

  for (const button of document.querySelectorAll("[data-walk]")) {
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

  const readyButtons = [
    "shop-button",
    "extend-button",
    "move-button",
    "road-button",
    "grid-button",
    "walk-button",
    "reset-camera",
    "zoom-in",
    "zoom-out",
    "help-button",
  ];
  for (const button of expansionOptions) {
    const side = button.dataset.expand;
    button.onclick = () => expandVillage(side);
    const preview = () => {
      const steps = expansion[side] ?? 0;
      if (expanding && steps < EXPANSION_LIMIT)
        updateExpansionOutline(buildArea({ ...expansion, [side]: steps + 1 }));
    };
    button.addEventListener("pointerenter", preview);
    button.addEventListener("focus", preview);
    button.addEventListener("pointerleave", () => updateExpansionOutline());
    button.addEventListener("blur", () => updateExpansionOutline());
  }
  element("shop-button").addEventListener("click", () => {
    if (expanding) clearAction();
  });
  element("extend-button").onclick = showExtension;
  element("close-extend").onclick = () => extend.close();
  extend.addEventListener("close", () => { expanding = false; updateActions(); });
  element("expand-area").onclick = expandArea;
  element("cancel-button").onclick = cancelAction;
  element("road-button").onclick = chooseRoad;
  element("road-erase").onclick = toggleRoadErase;
  element("move-button").onclick = chooseMove;
  element("move-selected").onclick = chooseMove;
  element("rotate-left").onclick = () => rotateHouse(1);
  element("rotate-button").onclick = () => rotateHouse(-1);
  element("delete-selected").onclick = deleteSelection;
  stellarStart.onclick = activateStellarShow;
  element("place-button").onclick = placeConstruction;
  element("light-height").onchange = event => setLightHeight(event.target.valueAsNumber);
  element("light-lower").onclick = () => stepLightHeight(-.25);
  element("light-raise").onclick = () => stepLightHeight(.25);
  element("grid-button").onclick = toggleGrid;
  element("reset-camera").onclick = resetCamera;
  walkButton.onclick = toggleWalking;
  flightButton.onclick = toggleFlight;
  element("zoom-in").onclick = () => zoom(0.83);
  element("zoom-out").onclick = () => zoom(1.2);
  element("help-button").onclick = () => help.showModal();
  element("close-help").onclick = () => help.close();
  for (const dialog of [shop, help, extend]) {
    dialog.addEventListener("focusin", clearMovement);
  }

  window.addEventListener("keydown", (event) => {
    if (preparing) return;
    if (
      help.open ||
      shop.open ||
      extend.open ||
      event.altKey ||
      (event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select, [contenteditable]"))
    )
      return;
    const key = event.code === "Space" ? "space" : event.key.toLowerCase();
    if ((key === "pageup" || key === "pagedown") && isFreeLight((placement || selection)?.type)) {
      event.preventDefault();
      stepLightHeight((key === "pageup" ? 1 : -1) * (event.shiftKey ? 1 : .25));
      return;
    }
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
    if (walker.flying && (key === "space" || (key === "shift" && !(isPaving(placement?.type) && !placement.moving)))) {
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
      const decoration = isDecoration(placement.type) || isFreeLight(placement.type);
      const paving = isPaving(placement.type);
      const lamp = isLamp(placement.type) || decoration;
      const scale = decoration ? DECORATION_STEP / 2 : lamp ? 0.5 : !paving && (placement.road || onParcel || large) ? LOT_SIZE / 2 : 1;
      const target =
        (aim && pointLot(aim.x, aim.y)) ||
        placement.target ||
        placement.lastSite ||
        controls.target;
      const { minX, maxX, minZ, maxZ } = placementBounds(placement.type, placement.rotation, area);
      const [width, depth] = footprint(placement.type, placement.rotation);
      const step = 2 * scale;
      const clampOnGrid = (value, min, max, offset) => THREE.MathUtils.clamp(
        value,
        Math.ceil((min - offset) / step) * step + offset,
        Math.floor((max - offset) / step) * step + offset,
      );
      const site = placementSite(
        clampOnGrid(target.x + dx * scale, minX, maxX, large ? (width - LOT_SIZE) / 2 : 0),
        clampOnGrid(target.z + dz * scale, minZ, maxZ, large ? (depth - LOT_SIZE) / 2 : 0),
      );
      aim = null;
      if (isFreeLight(placement.type)) {
        placement.height = target.y;
        placement.heightLocked = true;
      }
      placement.target = { ...site, y: placementHeight(site.x, site.z, placement.type, placement.rotation, siteOrder(site.x, site.z)) };
      invalidate();
      return;
    }
    if (event.repeat) return;
    if (key === "1") showExtension();
    if (key === "escape") cancelAction();
    if (key === "2") element("shop-button").click();
    if (key === "3") chooseRoad();
    if (key === "4") toggleWalking();
    if (key === "f") toggleFlight();
    if (key === "m") chooseMove();
    if (key === "r") rotateHouse(event.shiftKey ? 1 : -1);
    if (key === "delete" && selection) {
      event.preventDefault();
      deleteSelection();
    }
    if (key === "g") toggleGrid();
    if (key === "home") resetCamera();
    if (
      key === "enter" &&
      placement &&
      !(event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      placeConstruction({ shiftKey: event.shiftKey });
    }
  });
  window.addEventListener("keyup", (event) =>
    movementKeys.delete(event.code === "Space" ? "space" : event.key.toLowerCase()),
  );
  window.addEventListener("blur", clearMovement);
  window.addEventListener("resize", resize);
  lexCorpAnimation.setCity(houses);
  policeAnimation.setCity(houses);
  resetCamera();
  resize();
  setStatus("Preparando a cidade…");
  camera.far = Math.max(viewDistance, camera.position.distanceTo(controls.target) + 190);
  camera.updateProjectionMatrix();
  updateWorld(camera, controls.target);
  convergenceAnimation.syncPower(Date.now());
  buildingBatches.sync(houses, animations, camera);
  convergenceAnimation.update(camera, 0, animations, false);
  nightLights.bind(scene);
  // Warm both lighting variants asynchronously. A saved night-time city uses
  // the same small shaders, and changing hour does not compile hundreds of lights.
  const chosenHour = Number(hourPicker.value);
  for (const hour of [7.5, 23]) {
    daylight.setHour(hour);
    daylight.positionLights(controls.target);
    nightLights.update(houses, camera, daylight.lampPower);
    scene.updateMatrixWorld(true);
    await renderer.compileAsync(scene, camera);
  }
  daylight.setHour(chosenHour);
  daylight.positionLights(controls.target);
  nightLights.update(houses, camera, daylight.lampPower);
  preparing = false;
  readyButtons.forEach(id => { element(id).disabled = false; });
  soundToggle.disabled = !stellarAudio.supported;
  hourPicker.disabled = stellarBusy(stellarMonument, Date.now());
  let lastEconomyTick = Math.floor(performance.now());
  document.addEventListener("visibilitychange", () => {
    lastEconomyTick = Math.floor(performance.now());
    if (document.hidden) stellarAudio.stop();
    else invalidate();
  });
  setInterval(() => {
    const now = Math.floor(performance.now());
    const elapsed = Math.min(now - lastEconomyTick, 5000);
    lastEconomyTick = now;
    if (document.hidden) return;
    if (advanceEconomy(treasury, elapsed, metrics.income)) {
      saveWorld(false);
      invalidate();
    } else {
      revenueProgress.value = treasury.progressMs / 1000;
    }
  }, 1000);
  setStatus("Abra a Loja ou escolha Ruas para construir.");
  renderer.shadowMap.needsUpdate = true;
  invalidate();
}
