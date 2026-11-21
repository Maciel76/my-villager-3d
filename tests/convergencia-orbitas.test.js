import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stellarOrbitSpin} from '../src/convergencia-orbitas.js';
import {createConvergencia} from '../src/convergencia.js';
import {createConvergenceAnimation} from '../src/convergencia-efeitos.js';
import {createStellarTimeline} from '../src/stellar-timeline.js';
import {STELLAR_LAUNCH,STELLAR_DRAIN_DURATION,STELLAR_SHUTDOWN} from '../src/stellar-event.js';

test('orbital speed grows until liftoff, slows continuously and settles before shutdown',()=>{
  const speed=t=>(stellarOrbitSpin(t+.001)-stellarOrbitSpin(t-.001))/.002;
  let previous=0;
  for(let t=1;t<STELLAR_LAUNCH;t+=.5) {
    const current=speed(t);assert(current>previous,`speed did not rise at ${t}s`);previous=current;
  }
  assert(speed(STELLAR_LAUNCH-.01)/speed(.01)>24.9);
  assert(Math.abs(speed(STELLAR_LAUNCH-.001)-speed(STELLAR_LAUNCH+.001))<.01);
  assert(speed(STELLAR_LAUNCH+1)>speed(STELLAR_LAUNCH+4));
  assert(speed(STELLAR_LAUNCH+4)>speed(STELLAR_LAUNCH+7));
  assert.equal(stellarOrbitSpin(STELLAR_SHUTDOWN),stellarOrbitSpin(STELLAR_SHUTDOWN+100));
  assert(Math.abs(speed(STELLAR_SHUTDOWN-.001))<.001);
});

test('the live sun stays visible through energy capture and all three rendered rings accelerate',()=>{
  const scene=new THREE.Scene(),model=createConvergencia();scene.add(model);
  const camera=new THREE.PerspectiveCamera(47,1.5,.5,1200);camera.position.set(40,80,180);camera.lookAt(0,25,0);
  const animation=createConvergenceAnimation(scene,createStellarTimeline()),construction=new Set();
  const started=1_800_000_000_000,show=started+STELLAR_DRAIN_DURATION*1000;
  animation.add(model,started);
  const root=scene.getObjectByName('Luz da Convergência'),sun=root.getObjectByName('Mini-sol');
  for(const wall of [0,.1,.5,1,3,6,10,11.8,12,12.3,13,14,15,16,20,40,STELLAR_LAUNCH+STELLAR_DRAIN_DURATION-.01]) {
    animation.update(camera,wall*1000,construction,true,started+wall*1000);
    assert(sun.visible&&sun.scale.x>.97,`sun disappeared or shrank at ${wall}s`);
  }
  function velocity(t) {
    const yaw=time=>{
      animation.update(camera,time*1000,construction,true,show+Math.round(time*1000));
      return [1,2,3].map(i=>root.getObjectByName('Órbita '+i).rotation.y);
    };
    const a=yaw(t-.025),b=yaw(t+.025);return b.map((v,i)=>Math.abs(v-a[i])/.05);
  }
  let previous=[0,0,0];
  for(const t of [5,15,25,35,STELLAR_LAUNCH-5,STELLAR_LAUNCH-2,STELLAR_LAUNCH-.1]) {
    const current=velocity(t);current.forEach((v,i)=>assert(v>previous[i],`ring ${i+1} stopped accelerating at ${t}s`));previous=current;
  }
  animation.remove(model);
});
