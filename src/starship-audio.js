import { sampleStarshipMission,starshipElapsed,STARSHIP_DURATION } from "./starship-mission.js";
export function createStarshipAudio() {
  let context,master,rumble,oscillator,filter,noise,muted=false,lastSecond=-1,mission=null;
  const supported=typeof globalThis.AudioContext==='function'||typeof globalThis.webkitAudioContext==='function';
  async function unlock() {
    if(!supported)return;
    if(!context) {
      const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;context=new Audio();
      master=context.createGain();master.gain.value=muted?0:.3;master.connect(context.destination);
      const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
      let seed=17;for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=(seed/4294967296)*2-1;}
      noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
      filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=480;
      rumble=context.createGain();rumble.gain.value=0;noise.connect(filter);filter.connect(rumble);rumble.connect(master);noise.start();
      oscillator=context.createOscillator();oscillator.frequency.value=38;
      const low=context.createGain();low.gain.value=.3;oscillator.connect(low);low.connect(rumble);oscillator.start();
    }
    if(context.state==='suspended')await context.resume();
  }
  function beep(frequency,duration,level=.16) {
    if(!context||context.state!=='running')return;
    const at=context.currentTime,o=context.createOscillator(),g=context.createGain();o.frequency.value=frequency;
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level,at+.015);g.gain.exponentialRampToValueAtTime(.0001,at+duration);
    o.connect(g);g.connect(master);o.start(at);o.stop(at+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  function stop() {if(rumble)rumble.gain.setTargetAtTime(0,context.currentTime,.08);lastSecond=-1;mission=null;}
  function sync(house,now) {
    if(!context)return;
    if(!house||document.hidden){stop();return;}
    const t=starshipElapsed(house.launchAt,now),s=sampleStarshipMission(t),second=Math.floor(t);
    if(t>=STARSHIP_DURATION){stop();return;}
    if(mission!==house.launchAt){mission=house.launchAt;lastSecond=second-1;}
    const power=Math.max(s.boosterThrust,s.shipThrust);
    rumble.gain.setTargetAtTime(power*.65,context.currentTime,.12);
    filter.frequency.setTargetAtTime(160+power*900,context.currentTime,.15);
    if(second!==lastSecond) {
      if(second<16)beep(second===15?960:620,.18);
      if(second===34)beep(1180,.5,.13);
      if(second===62)beep(820,.7,.13);
      if(second===98){beep(523,1.2);beep(659,1.4,.12);beep(784,1.65,.1);}
      lastSecond=second;
    }
  }
  return {supported,unlock,sync,stop,setMuted(value){muted=value;if(master)master.gain.setTargetAtTime(muted?0:.3,context.currentTime,.03);}};
}
