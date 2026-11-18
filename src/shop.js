import * as THREE from "three";
import { BUILDING_TYPES } from "./house-types.js";
import { footprint, isLamp, LOT_SIZE } from "./placement.js";

function capturePreviews(renderer, templates) {
  const lighting = Object.keys(templates).every(isLamp);
  const stage = new THREE.Scene();
  stage.background = new THREE.Color(lighting ? "#384458" : "#e5dfbe");
  stage.add(new THREE.HemisphereLight("#f5faff", "#9b835e", lighting ? 1.75 : 2.4));
  const light = new THREE.DirectionalLight("#fff0ce", 2.5);
  light.position.set(-6, 11, 8);
  stage.add(light);
  if (lighting) {
    const rim = new THREE.DirectionalLight("#a5ccff", 1.2);
    rim.position.set(4, 2, -4);
    stage.add(rim);
  }
  const camera = new THREE.PerspectiveCamera(35, 1.42, 0.1, 150);
  const size = renderer.getSize(new THREE.Vector2());
  const shadowEnabled = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setSize(284, 200, false);
  const copy = document.createElement("canvas");
  copy.width = 284;
  copy.height = 200;
  const context = copy.getContext("2d");
  const lampStates = new Map();
  for (const model of Object.values(templates)) {
    model.traverse(({ material }) => {
      if (!material?.userData.nightGlow || lampStates.has(material)) return;
      lampStates.set(material, material.emissiveIntensity);
      const { base, strength } = material.userData.nightGlow;
      material.emissiveIntensity = base + (lighting ? strength * 0.74 : 0);
    });
  }

  try {
    return Object.fromEntries(
      Object.entries(templates).map(([type, template]) => {
        const model = template.clone();
        stage.add(model);
        const sphere = new THREE.Box3()
          .setFromObject(model)
          .getBoundingSphere(new THREE.Sphere());
        const palace = type === "palace";
        camera.position
          .set(palace ? 0.37 : 0.59, palace ? 0.42 : type === "lampSolar" ? 0.77 : 0.52, 0.91)
          .setLength(sphere.radius * (palace ? 2.68 : lighting ? 3.62 : 3.35))
          .add(sphere.center);
        camera.lookAt(sphere.center);
        renderer.render(stage, camera);
        context.drawImage(renderer.domElement, 0, 0, copy.width, copy.height);
        stage.remove(model);
        return [type, copy.toDataURL("image/webp", 0.86)];
      }),
    );
  } finally {
    for (const [material, intensity] of lampStates)
      material.emissiveIntensity = intensity;
    renderer.setSize(size.x, size.y, false);
    renderer.shadowMap.enabled = shadowEnabled;
  }
}

export function createShop(renderer, templates, onChoose, onRenderPreview) {
  const dialog = document.getElementById("shop-dialog");
  const catalog = document.getElementById("house-catalog");
  const countLabel = document.getElementById("catalog-count");
  const categories = [...dialog.querySelectorAll("[data-category]")];
  const close = document.getElementById("close-shop");
  const open = document.getElementById("shop-button");
  const modelButtons = new Map();
  const images = new Map();
  let activeCategory = "residential";

  function updateCatalog() {
    let count = 0;
    const previewsNeeded = {};
    for (const [type, button] of modelButtons) {
      const matches = BUILDING_TYPES[type].category === activeCategory;
      button.hidden = !matches;
      if (!matches) continue;
      count++;
      if (!images.get(type).hasAttribute("src"))
        previewsNeeded[type] = templates[type];
    }
    if (Object.keys(previewsNeeded).length) {
      const previews = capturePreviews(renderer, previewsNeeded);
      onRenderPreview();
      for (const [type, source] of Object.entries(previews))
        images.get(type).src = source;
    }
    for (const button of categories) {
      button.setAttribute(
        "aria-pressed",
        button.dataset.category === activeCategory,
      );
    }
    countLabel.textContent = `${count} ${count === 1 ? "modelo" : "modelos"}`;
  }

  for (const button of categories) {
    button.onclick = () => {
      activeCategory = button.dataset.category;
      updateCatalog();
    };
  }

  for (const [type, details] of Object.entries(BUILDING_TYPES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "house-choice";
    button.dataset.house = type;
    button.setAttribute("aria-label", `Construir: ${details.label}`);
    const image = document.createElement("img");
    images.set(type, image);
    image.alt = "";
    const label = document.createElement("strong");
    label.className = "house-name";
    label.textContent = details.label;
    const command = document.createElement("span");
    command.className = "house-command";
    const [width, depth] = footprint(type);
    command.textContent = details.lotSpan
      ? `${(width * depth) / LOT_SIZE ** 2} lotes · ${width} × ${depth} m`
      : "Posicionar";
    if (details.lotSpan)
      button.setAttribute("aria-description", command.textContent);
    button.append(image, label, command);
    button.onclick = () => {
      dialog.close();
      onChoose(type);
    };
    catalog.append(button);
    modelButtons.set(type, button);
  }

  close.onclick = () => dialog.close();
  open.onclick = () => {
    if (!dialog.open) {
      updateCatalog();
      dialog.showModal();
    }
  };
  return dialog;
}
