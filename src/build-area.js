export const LEGACY_AREA_SIZE = 180;
export const DEFAULT_AREA_SIZE = 360;
export const AREA_EXPANSION_STEP = 180;

export const isAreaSize = size => Number.isSafeInteger(size) && size >= LEGACY_AREA_SIZE && size % AREA_EXPANSION_STEP === 0;
export const areaBuildLimit = size => size / 2 - 3;

let areaSize = DEFAULT_AREA_SIZE;
export let BUILD_LIMIT = areaBuildLimit(areaSize);
export const getBuildAreaSize = () => areaSize;

export function setBuildAreaSize(size) {
  if (!isAreaSize(size)) throw new Error("Tamanho de terreno inválido.");
  areaSize = size;
  BUILD_LIMIT = areaBuildLimit(size);
}

export function nextAreaSize(size) {
  const next = size + AREA_EXPANSION_STEP;
  if (!isAreaSize(size) || !isAreaSize(next)) throw new Error("Não foi possível ampliar o terreno.");
  return next;
}
