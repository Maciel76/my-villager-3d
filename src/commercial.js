import * as THREE from "three";
import { projectTexture } from "./assets.js";
import { mesh } from "./world.js";

const paint = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.86 });

export function createCommercialBuildings(materials) {
  const cream = paint("#f6dfac");
  const graphite = paint("#26302b");
  const frame = paint("#eee9d5");
  const red = paint("#a6443a");
  const green = paint("#397658");
  const blue = paint("#286882");
  const gold = paint("#d69a43");
  const leaves = paint("#63864f");
  const blossom = paint("#c46446");

  function storefront(
    depth = 6.4,
    width = 8.6,
    wall = materials.plaster,
    offsetZ = -0.9,
  ) {
    const group = new THREE.Group();
    const box = (w, h, d, material, x, y, z) => {
      const part = mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
      group.add(part);
      return part;
    };
    const front = offsetZ + depth / 2;
    const elevation = 0.26;
    box(10.8, elevation, 10.8, materials.stone, 0, elevation / 2, 0);
    const body = box(width, 4.3, depth, wall, 0, elevation + 2.15, offsetZ);
    if (wall.map) projectTexture(body.geometry);

    function window(width, height, x, y, mullions = 1) {
      box(width + 0.22, height + 0.22, 0.12, graphite, x, y, front + 0.06);
      box(width, height, 0.07, materials.glass, x, y, front + 0.14);
      for (let i = 1; i <= mullions; i++) {
        const divider = x - width / 2 + (width * i) / (mullions + 1);
        box(0.075, height, 0.09, frame, divider, y, front + 0.17);
      }
    }

    function door(x, width = 1.45) {
      window(width, 2.53, x, 1.62, width > 1.6 ? 1 : 0);
      box(0.045, 0.38, 0.06, cream, x + width * 0.28, 1.45, front + 0.23);
    }

    function sign(text, background, width, x = 0, y = 3.9) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#fff3dc";
      context.font = "bold 71px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 256, 66, 464);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const label = mesh(
        new THREE.PlaneGeometry(width, 1.0),
        new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: .82, roughness: .83 }),
        x,
        y,
        front + 0.19,
      );
      label.castShadow = false;
      group.add(label);
      box(width + 0.12, 1.12, 0.15, graphite, x, y, front + 0.08);
    }

    function awning(span, color, x = 0, stripes = 8) {
      const step = span / stripes;
      for (let i = 0; i < stripes; i++) {
        const material = i % 2 ? cream : color;
        const stripeX = x + (i + 0.5) * step - span * 0.5;
        const panel = box(
          step + 0.012,
          0.1,
          1.43,
          material,
          stripeX,
          3.28,
          front + 0.73,
        );
        panel.rotation.x = 0.25;
        box(step + 0.012, 0.19, 0.1, material, stripeX, 3.03, front + 1.4);
      }
    }

    function roof(color, height = 0.24) {
      box(
        width + 0.5,
        height,
        depth + 0.5,
        color,
        0,
        4.56 + height * 0.5,
        offsetZ,
      );
    }

    function plant(x, z) {
      box(0.64, 0.45, 0.58, blossom, x, 0.49, z);
      group.add(
        mesh(new THREE.IcosahedronGeometry(0.39, 0), leaves, x, 0.94, z),
      );
    }

    return { group, box, window, door, sign, awning, roof, plant, front };
  }

  const bakery = storefront(6.4, 8.0, materials.brick);
  bakery.door(2.48);
  bakery.window(4.25, 1.64, -0.97, 1.91, 2);
  bakery.sign("PADARIA", "#9d4437", 5.8);
  bakery.awning(5.0, red, -0.97);
  bakery.plant(3.67, 3.52);
  const gable = new THREE.Shape()
    .moveTo(-4.3, 0)
    .lineTo(0, 1.85)
    .lineTo(4.3, 0)
    .closePath();
  const bakeryRoof = projectTexture(
    new THREE.ExtrudeGeometry(gable, {
      depth: 6.95,
      bevelEnabled: false,
    }),
    true,
  );
  bakery.group.add(mesh(bakeryRoof, materials.clay, 0, 4.56, -4.38));

  const market = storefront(7.4, 9.3, materials.plaster, -0.74);
  market.roof(green, 0.4);
  market.box(9.85, 0.17, 0.22, gold, 0, 4.94, market.front + 0.28);
  market.sign("MERCADO", "#32654c", 6.2);
  market.door(0, 2.0);
  market.window(2.39, 1.68, -2.85, 2.0, 1);
  market.window(2.39, 1.68, 2.85, 2.0, 1);
  for (const x of [-2.85, 2.85]) {
    market.box(1.48, 0.52, 0.91, materials.cedar, x, 0.52, 4.15);
    market.box(1.55, 0.15, 0.95, cream, x, 0.84, 4.15);
    for (let i = -1; i <= 1; i++) {
      market.group.add(
        mesh(
          new THREE.IcosahedronGeometry(0.18, 0),
          x < 0 ? red : leaves,
          x + i * 0.39,
          1.01,
          4.15,
        ),
      );
    }
  }

  const cafe = storefront(5.15, 7.85, materials.brick, -1.9);
  cafe.roof(graphite);
  cafe.box(8.24, 0.15, 0.2, gold, 0, 4.62, cafe.front + 0.3);
  cafe.sign("CAFÉ", "#61412e", 4.7);
  cafe.door(-2.55);
  cafe.window(4, 1.76, 1.09, 1.94, 2);
  cafe.awning(4.6, gold, 1.06, 7);
  for (const x of [-2.35, 2.35]) {
    const z = 3.8;
    cafe.box(0.16, 0.91, 0.16, materials.trim, x, 0.72, z);
    cafe.group.add(
      mesh(
        new THREE.CylinderGeometry(0.59, 0.59, 0.13, 12),
        materials.cedar,
        x,
        1.16,
        z,
      ),
    );
    for (const offset of [-0.92, 0.92]) {
      cafe.box(0.15, 0.48, 0.15, materials.trim, x + offset, 0.5, z);
      cafe.box(0.48, 0.1, 0.48, cream, x + offset, 0.77, z);
    }
  }
  cafe.box(0.08, 1.25, 0.08, graphite, -2.35, 1.85, 3.8);
  cafe.group.add(
    mesh(new THREE.ConeGeometry(0.98, 0.38, 10), red, -2.35, 2.52, 3.8),
  );
  cafe.plant(3.84, 1.12);

  const pharmacy = storefront(6.7, 8.45, materials.plaster);
  pharmacy.roof(blue, 0.34);
  pharmacy.sign("FARMÁCIA", "#24637c", 5.62, -0.84);
  pharmacy.door(2.51, 1.78);
  pharmacy.window(4.8, 1.91, -1.14, 1.91, 2);
  pharmacy.box(1.15, 1.15, 0.23, frame, 3.1, 3.9, pharmacy.front + 0.16);
  pharmacy.box(0.27, 0.85, 0.11, blue, 3.1, 3.9, pharmacy.front + 0.33);
  pharmacy.box(0.85, 0.27, 0.11, blue, 3.1, 3.9, pharmacy.front + 0.33);
  pharmacy.box(5.0, 0.14, 1.08, blue, -1.1, 3.14, pharmacy.front + 0.55);
  pharmacy.box(1.93, 0.19, 1.27, graphite, -1.75, 5.0, -1.3);
  for (const x of [-2.38, -1.75, -1.12]) {
    pharmacy.box(0.47, 0.21, 0.97, materials.glass, x, 5.12, -1.3);
  }
  pharmacy.plant(-3.83, 3.67);

  return {
    bakery: bakery.group,
    market: market.group,
    cafe: cafe.group,
    pharmacy: pharmacy.group,
  };
}
