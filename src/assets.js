import * as THREE from "three";
import { markNightLight } from "./daylight.js";
import { addPalaceLights } from "./palace-lights.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import decorationUrl from "./assets/models/optimized/decorations.glb?url";
import { prepareDecorationModels } from "./decorations.js";
import treeUrl from "./assets/models/optimized/trees.glb?url";
import { TREE_TYPES } from "./tree-types.js";
import plantingBedUrl from "./assets/models/optimized/planting-beds.glb?url";
import { PLANTING_BED_TYPES } from "./planting-bed-types.js";
import chaletUrl from "./assets/models/optimized/chalet.glb?url";
import townhouseUrl from "./assets/models/optimized/townhouse.glb?url";
import modernUrl from "./assets/models/optimized/modern.glb?url";
import courtyardUrl from "./assets/models/optimized/courtyard.glb?url";
import terraceUrl from "./assets/models/optimized/terrace.glb?url";
import varandasUrl from "./assets/models/optimized/varandas.glb?url";
import miranteUrl from "./assets/models/optimized/mirante.glb?url";
import sakuraUrl from "./assets/models/optimized/sakura.glb?url";
import orientalUrl from "./assets/models/optimized/oriental.glb?url";
import churchUrl from "./assets/models/optimized/church.glb?url";
import gasStationUrl from "./assets/models/optimized/posto-gs.glb?url";
import palaceUrl from "./assets/models/palacio-oriental.glb?url";
import auroraUrl from "./assets/models/optimized/residencial-aurora.glb?url";
import { prepareAuroraModel } from "./residencial-aurora.js";
import cuboVerdeUrl from "./assets/models/casa-cubo-verde.glb?url";
import { prepareCuboVerdeModel } from "./casa-cubo-verde.js";
import belleEpoqueUrl from "./assets/models/casa-belle-epoque.glb?url";
import { prepareBelleEpoqueModel } from "./casa-belle-epoque.js";
import supermarketUrl from "./assets/models/optimized/supermercado-verde.glb?url";
import { prepareSupermarketModel } from "./supermercado-verde.js";
import rotundaUrl from "./assets/models/optimized/pavilhao-rotunda.glb?url";
import { prepareRotundaModel } from "./pavilhao-rotunda.js";
import lexCorpUrl from "./assets/models/optimized/torre-lexcorp.glb?url";
import { prepareLexCorpModel } from "./torre-lexcorp.js";
import policeStationUrl from "./assets/models/optimized/posto-policial.glb?url";
import { preparePoliceStationModel } from "./posto-policial.js";
import grassUrl from "./assets/textures/grass.webp";
import brickUrl from "./assets/textures/brick.webp";
import brickNormalUrl from "./assets/textures/brick-normal.webp";
import cedarUrl from "./assets/textures/cedar.webp";
import cedarNormalUrl from "./assets/textures/cedar-normal.webp";
import shingleUrl from "./assets/textures/shingle.webp";
import shingleNormalUrl from "./assets/textures/shingle-normal.webp";

import asphaltUrl from "./assets/textures/asphalt.webp";
import asphaltNormalUrl from "./assets/textures/asphalt-normal.webp";
import sidewalkUrl from "./assets/textures/sidewalk.webp";
import sidewalkNormalUrl from "./assets/textures/sidewalk-normal.webp";
import fieldstoneUrl from "./assets/textures/sakura-fieldstone.webp";
import fieldstoneNormalUrl from "./assets/textures/sakura-fieldstone-normal.webp";
import redTileUrl from "./assets/textures/sakura-red-tile.webp";
import redTileNormalUrl from "./assets/textures/sakura-red-tile-normal.webp";
import limeUrl from "./assets/textures/sakura-lime.webp";
import limeNormalUrl from "./assets/textures/sakura-lime-normal.webp";
import vermilionUrl from "./assets/textures/sakura-vermilion.webp";
import vermilionNormalUrl from "./assets/textures/sakura-vermilion-normal.webp";
import churchBrickUrl from "./assets/textures/church-brick.webp";
import churchBrickNormalUrl from "./assets/textures/church-brick-normal.webp";
import zincUrl from "./assets/textures/church-zinc.webp";
import zincNormalUrl from "./assets/textures/church-zinc-normal.webp";
import goldUrl from "./assets/textures/church-gold.webp";
import goldNormalUrl from "./assets/textures/church-gold-normal.webp";

export async function loadMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  async function load(url, repeatU, repeatV, color = true) {
    const texture = await loader.loadAsync(url);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, repeatV);
    texture.anisotropy = anisotropy;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  async function surface(colorUrl, normalUrl, width, height, strength) {
    const [map, normalMap] = await Promise.all([
      load(colorUrl, 1 / width, 1 / height),
      load(normalUrl, 1 / width, 1 / height, false),
    ]);
    return {
      map,
      normalMap,
      normalScale: new THREE.Vector2(strength, strength),
    };
  }

  const [
    grass,
    brick,
    cedar,
    shingle,
    asphalt,
    sidewalk,
    fieldstone,
    redTile,
    lime,
    vermilion,
    churchBrick,
    zinc,
    gold,
  ] = await Promise.all([
    load(grassUrl, 1 / 12, 1 / 12),
    surface(brickUrl, brickNormalUrl, 2.5, 1.65, 0.32),
    surface(cedarUrl, cedarNormalUrl, 2.7, 1.85, 0.26),
    surface(shingleUrl, shingleNormalUrl, 2.9, 2.6, 0.36),
    surface(asphaltUrl, asphaltNormalUrl, 3, 3, 0.22),
    surface(sidewalkUrl, sidewalkNormalUrl, 3, 3, 0.32),
    surface(fieldstoneUrl, fieldstoneNormalUrl, 4.1, 4.1, 0.42),
    surface(redTileUrl, redTileNormalUrl, 3.7, 2.6, 0.33),
    surface(limeUrl, limeNormalUrl, 5, 5, 0.21),
    surface(vermilionUrl, vermilionNormalUrl, 3.3, 3.3, 0.18),
    surface(churchBrickUrl, churchBrickNormalUrl, 3.42, 2.65, 0.31),
    surface(zincUrl, zincNormalUrl, 4.2, 4.2, 0.26),
    surface(goldUrl, goldNormalUrl, 5.6, 5.6, 0.11),
  ]);
  const finish = (color, roughness, surface = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...surface });
  return {
    grass,
    churchBrick: finish("#ffffff", 0.86, churchBrick),
    zinc: finish("#dce5ec", 0.61, { ...zinc, metalness: 0.27 }),
    gold: finish("#ffffff", 0.43, {
      ...gold,
      metalness: 0.42,
      emissive: "#624917",
      emissiveIntensity: 0.06,
    }),
    plaza: finish("#dcd5c5", 0.93, {
      ...sidewalk,
      normalScale: new THREE.Vector2(0.13, 0.13),
    }),
    lawn: finish("#e4efd6", 0.99, { map: grass }),
    fieldstone: finish("#ffffff", 0.95, fieldstone),
    redTile: finish("#ffffff", 0.86, redTile),
    lime: finish("#ffffff", 0.94, lime),
    vermilion: finish("#ffffff", 0.78, vermilion),
    graphite: finish("#29374a", 0.76),
    roofEdge: finish("#283244", 0.62),
    paper: markNightLight(finish("#ffcd78", 0.77), 0.95),
    ink: finish("#362821", 0.86),
    water: finish("#248689", 0.26, { metalness: 0.18 }),
    sand: finish("#ddcba6", 0.94),
    asphalt: finish("#ffffff", 0.94, asphalt),
    sidewalk: finish("#ffffff", 0.91, sidewalk),
    curb: finish("#a6a293", 0.95),
    roadPaint: finish("#dfbd6c", 0.87),
    crosswalk: finish("#e8e6d7", 0.88),
    brick: finish("#ffffff", 0.91, brick),
    cedar: finish("#ffffff", 0.87, cedar),
    clay: finish("#fff1e4", 0.82, shingle),
    darkShingle: finish("#645f65", 0.88, shingle),
    stone: finish("#a9a797", 0.96),
    slate: finish("#485450", 0.8),
    plaster: finish("#f0e8d8", 0.95),
    trim: finish("#49443b", 0.78),
    glass: markNightLight(finish("#568a91", 0.36, { metalness: 0.13 })),
  };
}

// Keep texture scale in metres across parts exported by the CAD tool.
export function projectTexture(geometry, roof = false) {
  const { position, normal } = geometry.attributes;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    const horizontal = ny >= nx && ny >= nz;
    if (roof === "z" && nx < 0.75) {
      uv[index * 2] = x;
      uv[index * 2 + 1] = -Math.abs(z - 8.25);
    } else if (roof && roof !== "z" && nz < 0.75) {
      uv[index * 2] = z;
      uv[index * 2 + 1] = -Math.abs(x);
    } else {
      uv[index * 2] = horizontal || nz >= nx ? x : z;
      uv[index * 2 + 1] = horizontal ? z : y;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export async function loadBuildingModels(materials) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const sources = {
    chalet: chaletUrl,
    townhouse: townhouseUrl,
    modern: modernUrl,
    courtyard: courtyardUrl,
    terrace: terraceUrl,
    varandas: varandasUrl,
    mirante: miranteUrl,
    sakura: sakuraUrl,
    oriental: orientalUrl,
    church: churchUrl,
    gasStation: gasStationUrl,
    palace: palaceUrl,
    aurora: auroraUrl,
    cuboVerde: cuboVerdeUrl,
    belleEpoque: belleEpoqueUrl,
    supermarket: supermarketUrl,
    rotunda: rotundaUrl,
    lexCorp: lexCorpUrl,
    policeStation: policeStationUrl,
  };
  const models = await Promise.all(
    Object.entries(sources).map(async ([type, url]) => {
      const { scene } = await loader.loadAsync(url);
      if (type === "aurora") return [type, prepareAuroraModel(scene, materials, projectTexture)];
      if (type === "cuboVerde") return [type, prepareCuboVerdeModel(scene, materials, projectTexture)];
      if (type === "belleEpoque") return [type, prepareBelleEpoqueModel(scene, materials, projectTexture)];
      if (type === "supermarket") return [type, prepareSupermarketModel(scene, materials, projectTexture)];
      if (type === "rotunda") return [type, prepareRotundaModel(scene, materials, projectTexture)];
      if (type === "lexCorp") return [type, prepareLexCorpModel(scene, materials, projectTexture)];
      if (type === "policeStation") return [type, preparePoliceStationModel(scene, materials, projectTexture)];
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scene);
      const origin = bounds.getCenter(new THREE.Vector3());
      origin.y = bounds.min.y;
      const building = new THREE.Group();
      const station = type === "gasStation";
      const palace = type === "palace";

      scene.traverse((part) => {
        if (!part.isMesh) return;
        const finish = part.name.split("-")[1];
        const material = palace
          ? finish === "sod" ? materials.lawn : part.material
          : station && finish !== "asphalt" ? part.material : materials[finish];
        if (station && !material.userData.nightGlow) {
          if (finish === "lamp") markNightLight(material, 1.6);
          if (finish === "glass" || finish === "glassLight")
            markNightLight(material, 0.65);
        }
        const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
        geometry.translate(-origin.x, -origin.y, -origin.z);
        if (material.map) {
          const gable =
            finish === "clay" ||
            finish === "darkShingle" ||
            part.name.includes("telhado-alto");
          const roof = part.name.includes("telhado-do-portal") ? "z" : gable;
          projectTexture(geometry, roof);
        }
        const surface = new THREE.Mesh(geometry, material);
        surface.name = part.name;
        surface.userData.groundCover =
          finish === "lawn" || finish === "sod" || finish === "plaza" || finish === "asphalt";
        surface.castShadow = !surface.userData.groundCover;
        surface.receiveShadow = true;
        building.add(surface);
      });
      if (palace) addPalaceLights(building);
      return [type, building];
    }),
  );
  const [decorations, trees, beds] = await Promise.all([
    loader.loadAsync(decorationUrl), loader.loadAsync(treeUrl), loader.loadAsync(plantingBedUrl),
  ]);
  return { ...Object.fromEntries(models), ...prepareDecorationModels(decorations.scene),
    ...prepareDecorationModels(trees.scene, TREE_TYPES), ...prepareDecorationModels(beds.scene, PLANTING_BED_TYPES) };
}
