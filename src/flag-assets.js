import * as THREE from "three";
import { FLAG_COUNTRIES } from "./flag-types.js";
import { createFlagModels } from "./flags.js";

const artwork = import.meta.glob("./assets/flags/*.svg", { eager: true, query: "?url", import: "default" });

export async function loadFlagModels() {
  const loader = new THREE.TextureLoader();
  const textures = await Promise.all(FLAG_COUNTRIES.map(async ({ code, country }) => {
    const url = artwork[`./assets/flags/${code}.svg`];
    if (!url) throw new Error(`Desenho da bandeira ausente: ${country}`);
    const texture = await loader.loadAsync(url);
    texture.name = `Bandeira ${country}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return [code, texture];
  }));
  return createFlagModels(Object.fromEntries(textures));
}
