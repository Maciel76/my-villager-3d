import * as THREE from 'three';
import { ASPHALT_Y } from './road-layout.js';
import { fireTruckHomes, updateFireSignals } from './fire-station.js';

function roundedPath(points) {
  const path = new THREE.CurvePath(); let cursor = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const center = points[i], before = points[i - 1], after = points[i + 1];
    const radius = Math.min(3.2, center.distanceTo(before) * .4, center.distanceTo(after) * .4);
    const entry = center.clone().addScaledVector(before.clone().sub(center).normalize(), radius);
    const exit = center.clone().addScaledVector(after.clone().sub(center).normalize(), radius);
    path.add(new THREE.LineCurve3(cursor, entry));
    path.add(new THREE.QuadraticBezierCurve3(entry, center, exit)); cursor = exit;
  }
  path.add(new THREE.LineCurve3(cursor, points.at(-1))); path.arcLengthDivisions = 160;
  return path;
}

export function fireDepartureCurve(name, matrix, roadHeight = ASPHALT_Y) {
  const home = fireTruckHomes[name];
  const points = [new THREE.Vector3(...home), new THREE.Vector3(home[0], .57, 13.5)];
  if (name !== 'truck0') points.push(new THREE.Vector3(-23.9, .57, 13.5));
  points.push(new THREE.Vector3(-23.9, .57, 20), new THREE.Vector3(-23.9, 0, 24));
  const world = points.map(p => p.applyMatrix4(matrix)); world.at(-1).y = roadHeight;
  return roundedPath(world);
}

// Uses the same road engine and junction reservations as civilian/police cars.
export function createFireFleet(engine, { random = Math.random, heightAt = () => ASPHALT_Y } = {}) {
  const stations = new Map(), local = new THREE.Vector3(); let tiles = [];
  function restore(state) {
    for (const car of state.cars) engine.remove(car); state.cars = [];
    if (state.exitTile) engine.removeAccess(state.exitTile);
    state.exitTile = null;
    for (const [name, position] of Object.entries(fireTruckHomes)) {
      const part = state.model.getObjectByName(name);
      if (part) { part.position.fromArray(position); part.rotation.set(0, 0, 0); }
    }
    for (let i = 0; i < 4; i++) {
      const door = state.model.getObjectByName(`Fire garage door ${i}`);
      if (door) door.scale.y = 1;
    }
    state.open = [0, 0, 0, 0]; updateFireSignals(state.model, engine.time, false);
  }
  function initialize(state) {
    restore(state); state.model.updateWorldMatrix(true, false);
    state.matrix = state.model.matrixWorld.clone(); state.inverse = state.matrix.clone().invert();
    state.yaw = new THREE.Euler().setFromQuaternion(state.model.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    const gate = new THREE.Vector3(-23.9, 0, 24).applyMatrix4(state.matrix);
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(state.matrix);
    const candidates = tiles.filter(tile => {
      const dx = tile.x - gate.x, dz = tile.z - gate.z;
      const along = dx * forward.x + dz * forward.z, across = Math.abs(dx * forward.z - dz * forward.x);
      return tile.neighbors.length && along > 3 && along < 9 && across < 5.7;
    }).sort((a, b) => Math.hypot(a.x - gate.x, a.z - gate.z) - Math.hypot(b.x - gate.x, b.z - gate.z));
    const exitTile = candidates[0]; if (!exitTile) return;
    state.exitTile = exitTile; engine.addAccess(exitTile);
    const access = { x: exitTile.x - Math.round(forward.x) * 12,
      z: exitTile.z - Math.round(forward.z) * 12, entryPoint: gate };
    let delay = 1.5;
    for (const name of Object.keys(fireTruckHomes)) {
      const part = state.model.getObjectByName(name); if (!part) continue;
      const surface = heightAt(gate.x, gate.z) ?? ASPHALT_Y;
      state.cars.push(engine.addDeparture({ kind: 'fire', name, model: part, station: state.model,
        exitTile, access, curve: fireDepartureCurve(name, state.matrix, surface),
        speed: 5.5 + random() * 1.5, readyAt: engine.time + delay,
        halfLength: 3.55, halfWidth: 1.32, groundOffset: 0 }));
      delay += 17 + random() * 4;
    }
  }
  return {
    get states() { return [...stations.values()]; },
    add(model) {
      if (!stations.has(model)) stations.set(model, { model, matrix: null, cars: [], open: [0, 0, 0, 0] });
    },
    remove(model) {
      const state = stations.get(model); if (!state) return;
      restore(state); stations.delete(model);
    },
    setTiles(next, preserve = false) {
      tiles = next;
      for (const state of stations.values()) {
        if (preserve && state.cars.length) {
          state.exitTile = tiles.find(t => t.x === state.exitTile.x && t.z === state.exitTile.z); continue;
        }
        restore(state); state.matrix = null;
      }
    },
    prepare(dt, construction = new Map()) {
      let active = false;
      for (const state of stations.values()) {
        if (!state.model.visible || construction.has(state.model)) {
          if (state.matrix) { restore(state); state.matrix = null; } continue;
        }
        state.model.updateWorldMatrix(true, false);
        if (!state.matrix?.equals(state.model.matrixWorld)) initialize(state);
        if (!state.cars.length) continue; active = true;
        for (const car of state.cars) {
          const index = Number(car.name.at(-1)); local.copy(car.position).applyMatrix4(state.inverse);
          const opening = car.mode !== 'road' && engine.time + 1.2 >= car.readyAt && local.z < 8;
          state.open[index] = THREE.MathUtils.damp(state.open[index], Number(opening), 4, Math.min(dt, .15));
          const door = state.model.getObjectByName(`Fire garage door ${index}`);
          if (door) door.scale.y = 1 - .94 * state.open[index];
          car.stopAt = index > 0 && local.z < 5 && state.open[index] < .96 ? car.distance : undefined;
        }
      }
      return active;
    },
    sync() {
      for (const state of stations.values()) {
        if (!state.matrix) continue;
        for (const car of state.cars) {
          car.model.position.copy(car.position).applyMatrix4(state.inverse);
          car.model.rotation.y = car.yaw - state.yaw;
        }
        updateFireSignals(state.model, engine.time, state.cars.some(c => c.mode !== 'parked'));
      }
    },
  };
}
