export const PAVING_SIZE = 2;
export const PAVING_HEIGHT = 0.12;

export const PAVING_TYPES = {
  pavingConcrete: { label: "Placas de concreto" },
  pavingMosaic: { label: "Pedra portuguesa" },
  pavingBrick: { label: "Tijolinho terracota" },
  pavingSlate: { label: "Lajota grafite" },
};

export function snapPaving(value) {
  return Math.round(value / PAVING_SIZE) * PAVING_SIZE || 0;
}

export function pavingHeightAt(x, z, blocks) {
  const centerX = snapPaving(x);
  const centerZ = snapPaving(z);
  const half = PAVING_SIZE / 2;
  const height = blocks.get(`${centerX},${centerZ}`) ?? 0;
  if (x !== centerX - half && z !== centerZ - half) return height;
  // A point exactly on a seam can rest on either block.
  const xs = x === centerX - half ? [centerX, centerX - PAVING_SIZE] : [centerX];
  const zs = z === centerZ - half ? [centerZ, centerZ - PAVING_SIZE] : [centerZ];
  return Math.max(0, ...xs.flatMap(cx => zs.map(cz => blocks.get(`${cx},${cz}`) ?? 0)));
}
