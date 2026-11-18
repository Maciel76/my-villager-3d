import { BUILDING_TYPES } from "./house-types.js";
import { footprint, isDecoration, isLamp, overlapsLot } from "./placement.js";
import { canBuildHouse, roadLots, tileKey } from "./road-layout.js";
import { CITY_STREETS } from "./city-plan.js";

export function createGardenCityPlan() {
  const houses = [], roads = new Map();
  for (let x = -84; x <= 84; x += 12) for (let z = -84; z <= 84; z += 12)
    if (CITY_STREETS.includes(x) || CITY_STREETS.includes(z))
      roads.set(tileKey(x, z), { x, z, order: roads.size });
  const lots = roadLots(roads);
  function add(type, x, z, rotation = 0) {
    if (!BUILDING_TYPES[type]) throw new Error(`Modelo ausente: ${type}`);
    if (!canBuildHouse(x, z, houses, roads, lots, null, type, rotation))
      throw new Error(`Local inválido: ${type} em ${x},${z}`);
    // Garden layouts reserve genuinely open ground rather than depending on
    // offline readers accepting decorations inside a building's parcel.
    if (isDecoration(type) && houses.some(h => !isDecoration(h.type) && !isLamp(h.type) &&
      overlapsLot(x, z, footprint(type, rotation), h)))
      throw new Error(`Jardim invade lote: ${type} em ${x},${z}`);
    houses.push({ type, x, z, rotation });
  }
  const bedTree = (bed, tree, x, z, rotation = 0) => {
    add(bed, x, z, rotation); add(tree, x, z);
  };

  // Civic centre, distinct residential districts, an urban skyline, services,
  // and a shopping block. Entire frontage strips remain public green spaces.
  const buildings = [
    ["palace",0,6,0],
    ["oriental",-54,-54,2],["cottage",-36,-60,1],["chalet",-36,-48,1],["cafe",-60,-36,0],
    ["aurora",-6,-54,2],["mirante",12,-60,1],["varandas",12,-48,1],["market",0,-36,0],
    ["sakura",54,-54,2],["courtyard",36,-60,3],["townhouse",36,-48,3],["terrace",60,-36,0],
    ["belleEpoque",-54,-6,2],["townhouse",-36,-12,1],["cottage",-36,0,1],["bakery",-60,12,0],
    ["church",54,-6,2],["pharmacy",36,-12,3],["rotunda",36,0,3],["cottage",60,12,0],
    ["gasStation",-54,42,2],["market",-36,36,1],["pharmacy",-36,48,1],["chalet",-48,60,0],["cottage",-36,60,0],
    ["cuboVerde",-6,42,2],["modern",12,36,1],["terrace",12,48,1],["cafe",0,60,0],
    ["supermarket",48,48,0],
  ];
  buildings.forEach(b => add(...b));
  const homes = ["cottage","chalet","townhouse","modern","courtyard","terrace"];
  let n = 0;
  for (const p of [-48,-12,12,48]) {
    add(homes[n++ % homes.length],p,-84,0);
    add(homes[n++ % homes.length],p,84,2);
    add(homes[n++ % homes.length],-84,p,1);
    add(homes[n++ % homes.length],84,p,3);
  }

  // Palace promenade: symmetric cherry-tree planters, fountain and seating.
  add("decorFountain",0,-12);
  for (const sign of [-1,1]) {
    bedTree("bedRound","treeCherry",sign*12,-12);
    add("decorBench",sign*6,-8,2);
    add("decorPlanter",sign*6,-16);
    add("lampColonial",sign*17,-12);
  }
  // Tea garden and a floral pavilion in the north-west district.
  add("decorGazebo",-46,-36);
  add("treeMaple",-52,-40);
  add("decorBench",-38,-33,2);
  add("decorPlanter",-38,-39);
  add("treeIpeYellow",-32,-36);
  add("lampZen",-42,-32);
  for (const x of [-12,12]) {
    bedTree("bedSquare",x<0?"treeOak":"treeAraucaria",x,-36);
    add("decorBench",x,-32,2);
    add("lampUrban",x-4,-36);
  }
  // Eastern Japanese water garden and a footbridge facing the Sakura house.
  add("decorFountain",38,-36);
  add("decorBridge",48,-36,1);
  add("treeCherry",36,-40);
  add("lampOriental",43,-40);
  add("lampOriental",52,-40);
  add("treeCypress",52,-32);

  // Estate promenade and church square, with seats opening to the avenues.
  add("bedDouble",-48,12,1);
  add("treePalm",-49.25,12);
  add("treePalm",-46.75,12);
  add("decorFlowerCart",-36,12);
  add("decorSundial",-42,12);
  add("decorBench",-42,16,2);
  add("lampColonial",-52,16);
  add("decorFountain",48,12);
  add("decorBench",42,8);
  add("decorBench",42,16,2);
  bedTree("bedSquare","treeCypress",36,12);
  add("treeIpePurple",40,12);
  add("lampDouble",34,16);
  add("lampDouble",52,16);

  // Rural corner and modern outdoor living room.
  add("decorWell",-60,60);
  add("decorWindmill",-63.5,57);
  add("treeApple",-56,63);
  add("decorBirdbath",-56,57);
  add("decorPergola",-12,60);
  add("decorPlanter",-16,64);
  add("treePalm",-8,64);
  add("lampZen",-16,56);
  add("decorPicnic",12,60);
  add("treeOrange",16,64);
  add("decorFlowerCart",8,64);
  add("lampSolar",16,56);

  // The outer neighbourhood alternates houses and fully furnished pocket
  // parks. Anchors stay inside the 87 m placement limit at the clearing edge.
  const gardens = [];
  for (let x=-84;x<=84;x+=12) for(let z=-84;z<=84;z+=12) {
    if(Math.abs(x)!==84 && Math.abs(z)!==84)continue;
    if(roads.has(tileKey(x,z)) || houses.some(h=>!isDecoration(h.type)&&!isLamp(h.type)&&overlapsLot(x,z,[12,12],h)))continue;
    gardens.push({x:Math.abs(x)===84?Math.sign(x)*83:x,z:Math.abs(z)===84?Math.sign(z)*83:z});
  }
  gardens.forEach(({x,z},i)=>{
    switch(i%9){
      case 0:
        bedTree("bedSquare","treeIpeYellow",x,z);
        add("decorBench",x,z+4,2);add("decorPlanter",x,z-4);add("lampColonial",x+4,z);break;
      case 1:
        bedTree("bedRound","treeMaple",x,z);
        add("decorBirdbath",x+4,z-3);add("decorBench",x-2,z+4,2);add("lampZen",x-4,z);break;
      case 2:
        add("treeApple",x-3,z-2);add("treeOrange",x+3,z-2);
        add("decorPicnic",x,z+3);add("decorPlanter",x+4,z+4);add("lampSolar",x-4,z+4);break;
      case 3:
        add("decorSwing",x-2,z);add("decorSlide",x+3,z);
        bedTree("bedSquare","treeCypress",x+4,z-4);add("lampUrban",x-4,z+4);break;
      case 4:
        add("decorFountain",x,z);add("decorBench",x-4,z,1);add("decorBench",x+4,z,3);
        bedTree("bedSquare","treeIpePurple",x,z+4);add("lampDouble",x-4,z-4);break;
      case 5:
        add("decorWindmill",x-2,z-2);add("decorWell",x+3,z-2);
        add("decorMarket",x,z+3);add("treePine",x+4,z+4);add("lampColonial",x-4,z+4);break;
      case 6:
        add("decorFirepit",x,z);add("decorSeesaw",x,z+4);
        bedTree("bedCapsule","treeCypress",x,z-4,1);add("treeWillow",x-4,z-4);add("lampZen",x+4,z);break;
      case 7:
        add("decorSundial",x,z);bedTree("bedMedian","treeAraucaria",x-4,z);
        add("decorFlowerCart",x+4,z);add("decorBench",x,z+4,2);add("lampSolar",x+4,z-4);break;
      case 8:
        bedTree("bedRectangle","treeCypress",x,z-2);
        add("decorBikeRack",x,z+3);add("decorRecycling",x+4,z-2);
        add("decorSignpost",x-4,z+2);add("lampSolar",x-4,z-3);break;
    }
  });
  // Lighting of every street module, separate from park and garden lighting.
  for(const {x,z} of roads.values()){
    const v=CITY_STREETS.includes(x),h=CITY_STREETS.includes(z);
    const side=Math.abs((v?z:x)/12)%2?1:-1;
    if(v&&h)add("lampDouble",x+4,z+4);
    else if(v)add(x<0?"lampUrban":"lampSolar",x+side*4,z,side>0?2:0);
    else add(z< -24?"lampColonial":"lampUrban",x,z+side*4,side>0?1:3);
  }
  const missing=Object.keys(BUILDING_TYPES).filter(type=>!houses.some(h=>h.type===type));
  if(missing.length)throw new Error(`Catálogo sem lugar no plano: ${missing.join(", ")}`);
  return {version:1,houses,houseOrder:houses.map((_,i)=>roads.size+i),roads:[...roads.values()]};
}

export function gardenCitySummary(world) {
  const counts={};
  for(const {type} of world.houses){
    const d=BUILDING_TYPES[type];
    const category=d.family==="trees"?"trees":d.plantingBed?"plantingBeds":d.category;
    counts[category]=(counts[category]??0)+1;
  }
  return {...counts,roads:world.roads.length,total:world.houses.length};
}
