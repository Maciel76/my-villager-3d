import { writeFile } from "node:fs/promises";
import { sampleStarshipMission, STARSHIP_DURATION } from "../src/starship-mission.js";
const frames=Array.from({length:STARSHIP_DURATION*4+1},(_,i)=>sampleStarshipMission(i/4));
await writeFile('models/starship/mission-keyframes.json',JSON.stringify({fps:24,duration:STARSHIP_DURATION,frames}));
console.log(`${frames.length} mission samples shared with Blender`);
