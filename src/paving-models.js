import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PAVING_HEIGHT, PAVING_SIZE } from "./paving-types.js";

const half = PAVING_SIZE / 2;
const jointDepth = 0.006;

function makePaving(groutColor, buildPattern) {
  const pieces = [];
  function piece(x, z, width, depth, tint, angle = 0) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2).rotateY(angle).translate(x, PAVING_HEIGHT, z);
    const color = new THREE.Color(tint);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pieces.push(geometry);
  }
  buildPattern(piece);
  const baseHeight = PAVING_HEIGHT - jointDepth;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(PAVING_SIZE, baseHeight, PAVING_SIZE).translate(0, baseHeight / 2, 0),
    new THREE.MeshStandardMaterial({ color: groutColor, roughness: .95 }),
  );
  const stones = new THREE.Mesh(
    mergeGeometries(pieces),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .87 }),
  );
  pieces.forEach(geometry => geometry.dispose());
  base.receiveShadow = stones.receiveShadow = true;
  return new THREE.Group().add(base, stones);
}

function rows(put, columns, count, palette, gap) {
  const unit = PAVING_SIZE / columns;
  const depth = PAVING_SIZE / count;
  for (let row = 0; row < count; row++) {
    const z = -half + depth * (row + .5);
    for (let column = -1; column < columns; column++) {
      const start = -half + unit * (column + (row % 2) * .5);
      const left = Math.max(-half, start), right = Math.min(half, start + unit);
      if (right - left <= gap) continue;
      const color = palette[(row * 5 + column + 1) % palette.length];
      put((left + right) / 2, z, right - left - gap, depth - gap, color);
    }
  }
}

export function createPavingModels() {
  return {
    pavingConcrete: makePaving("#666966", put => {
      const palette = ["#a9aca9", "#b8bcb7", "#b1b5b1", "#b4b3aa"];
      for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++)
        put(-.75 + column * .5, -.75 + row * .5, .478, .478, palette[(row * 3 + column) % 4]);
    }),
    pavingMosaic: makePaving("#6c6759", put => {
      const pale = ["#ded4bb", "#c7baa1", "#e8dfc7", "#d2c8b4"];
      const dark = ["#383c3b", "#474c48", "#404048", "#53534b"];
      const step = PAVING_SIZE / 14;
      for (let row = 0; row < 14; row++) for (let column = 0; column < 14; column++) {
        const x = -half + (column + .5) * step;
        const z = -half + (row + .5) * step;
        const palette = Math.abs(x - .43 * Math.sin(Math.PI * z)) < .21 ? dark : pale;
        const shade = (row * 7 + column * 3 + row * column) % palette.length;
        put(x, z, step - .018, step - .017, palette[shade], Math.sin(row * 7 + column) * .06);
      }
    }),
    pavingBrick: makePaving("#75675b", put =>
      rows(put, 5, 10, ["#a3563d", "#b87553", "#a96147", "#bc7c5e", "#9b503d"], .022)
    ),
    pavingSlate: makePaving("#404843", put => {
      const palette = ["#58615d", "#757d75", "#505a58", "#686c62", "#83857b"];
      for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
        const x = -.75 + column * .5;
        const z = -.75 + row * .5;
        const vertical = (row + column) % 2 === 0;
        for (const shift of [-.125, .125])
          put(x + (vertical ? shift : 0), z + (vertical ? 0 : shift),
            vertical ? .229 : .478, vertical ? .478 : .229,
            palette[(row * 7 + column + (shift > 0 ? 2 : 0)) % palette.length]);
      }
    }),
  };
}
