import test from "node:test";
import assert from "node:assert/strict";
import { BUILDING_TYPES } from "../src/house-types.js";
import { createGardenCityPlan, gardenCitySummary } from "../src/garden-city-plan.js";
<<<<<<< HEAD
import { footprint, isDecoration, isLamp, isPaving, readSave } from "../src/placement.js";
=======
import { footprint, isDecoration, isLamp, isFreeLight, readSave } from "../src/placement.js";
>>>>>>> 9c3bcfe (ajustando jogabilidade2)
import { canBuildHouse, readRoads, roadLots, tileKey } from "../src/road-layout.js";
import { isVillageWorld } from "../src/village-data.js";
import { BASE_AREA, buildArea, containsPoint } from "../src/village-area.js";

test("the landscaped city includes the complete catalogue and survives normal save loading", () => {
  const world=createGardenCityPlan();
  const area=buildArea(world.expansion);
  assert.equal(isVillageWorld(world),true);
  assert.equal(readSave(world).length,world.houses.length);
<<<<<<< HEAD
  assert.deepEqual(new Set(world.houses.map(h=>h.type)),new Set(Object.keys(BUILDING_TYPES)));
  assert.equal(readRoads(world.roads,world.houses,0,area).size,world.roads.length);
  const roads=new Map(world.roads.map(r=>[tileKey(r.x,r.z),r])),lots=roadLots(roads,area);
=======
  assert.deepEqual(new Set(world.houses.map(h=>h.type)),new Set(Object.keys(BUILDING_TYPES).filter(type=>!isFreeLight(type))));
  assert.equal(readRoads(world.roads,world.houses,0).size,world.roads.length);
  const roads=new Map(world.roads.map(r=>[tileKey(r.x,r.z),r])),lots=roadLots(roads);
>>>>>>> 9c3bcfe (ajustando jogabilidade2)
  for(const h of world.houses)
    assert.ok(canBuildHouse(h.x,h.z,world.houses,roads,lots,h,h.type,h.rotation,area),`${h.type}: ${h.x},${h.z}`);
});

test("the city reserves forty garden plots while all architecture fronts connected streets",()=>{
  const world=createGardenCityPlan();
  const buildings=world.houses.filter(h=>!isDecoration(h.type)&&!isLamp(h.type)&&!isPaving(h.type));
  const occupied=buildings.filter(h=>containsPoint(BASE_AREA,h.x,h.z))
    .reduce((n,h)=>n+footprint(h.type,h.rotation).reduce((a,b)=>a*b)/144,0);
  const roadsInsideRing=world.roads.filter(r=>containsPoint(BASE_AREA,r.x,r.z)).length;
  assert.equal(225-roadsInsideRing-occupied,40);
  for(const h of buildings){
    const [w,d]=footprint(h.type,h.rotation);
    const [dx,dz]=[[0,1],[1,0],[0,-1],[-1,0]][h.rotation];
    assert.ok(world.roads.some(r=>dx
      ?r.x===h.x+dx*(w/2+6)&&Math.abs(r.z-h.z)<d/2
      :r.z===h.z+dz*(d/2+6)&&Math.abs(r.x-h.x)<w/2),`${h.type} has no street entrance`);
  }
  const summary=gardenCitySummary(world);
  assert.ok(summary.trees>=40);
  assert.ok(summary.plantingBeds>=20);
  assert.ok(summary.decoration>=70);
  assert.ok(summary.lighting>=100);
});
