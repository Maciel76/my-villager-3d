import * as THREE from "three";

const DURATION = 1080;

export function startConstruction(model) {
  const modelBounds = new THREE.Box3().setFromObject(model);
  const height = modelBounds.max.y - modelBounds.min.y;
  const parts = [];

  for (const part of model.children) {
    const bounds = new THREE.Box3().setFromObject(part);
    const top = bounds.max.y - modelBounds.min.y;
    const center = (bounds.min.y + bounds.max.y) / 2 - modelBounds.min.y;
    let delay = 0.24;
    if (top < height * 0.16) delay = 0;
    else if (center > height * 0.63) delay = 0.59;

    parts.push({ part, delay, finalY: part.position.y });
    part.visible = false;
  }

  return { parts, started: performance.now() };
}

export function updateConstruction(sequence, time) {
  const progress = (time - sequence.started) / DURATION;
  for (const { part, delay, finalY } of sequence.parts) {
    const phase = THREE.MathUtils.clamp((progress - delay) / 0.41, 0, 1);
    part.visible = phase > 0 && !part.userData.hiddenByPaving;
    part.position.y = finalY + Math.pow(1 - phase, 3) * (delay === 0 ? 1.4 : 6);
  }
  return progress >= 1;
}

export function finishConstruction(sequence) {
  for (const { part, finalY } of sequence.parts) {
    part.visible = !part.userData.hiddenByPaving;
    part.position.y = finalY;
  }
}
