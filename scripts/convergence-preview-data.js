import {writeFile} from 'node:fs/promises';
import {sampleContainmentInjection} from '../src/convergencia-injecao.js';
import {createStellarTimeline} from '../src/stellar-timeline.js';
import {stellarOrbitSpin} from '../src/convergencia-orbitas.js';
const timeline=createStellarTimeline();
const frames=Array.from({length:485},(_,i)=>{
  const wall=i/4,show=wall-12,s=timeline.sample(Math.max(0,show));
  return {wall,injection:sampleContainmentInjection(show),arms:show<0?0:s.arms,orbitSpin:show<0?wall:stellarOrbitSpin(show),orbitTilt:1-s.ringAlignment,
    crownExpansion:s.crownRetraction,crownY:40.5+(1.75-40.5)*s.crownDescent};
});
await writeFile('models/convergencia-blender/mechanical-preview.json',JSON.stringify(frames));
console.log('Blender mechanical preview: '+frames.length+' samples');
