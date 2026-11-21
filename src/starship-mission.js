// A condensed cinematic flight; seconds are shared by Blender, sound and gameplay.
export const STARSHIP_DURATION = 108;
export const STARSHIP_LIFTOFF = 16;
export const STARSHIP_SEPARATION = 34;
export const STARSHIP_TOUCHDOWN = 98;
export const STARSHIP_PHASES = Object.freeze([
  [0, "Contagem regressiva"], [10, "Ignição dos 33 motores"], [16, "Decolagem"],
  [34, "Separação dos estágios"], [45, "Retorno do propulsor"], [62, "Propulsor capturado"],
  [66, "Reentrada da Starship"], [82, "Manobra de pouso"], [90, "Descida final"],
  [98, "Pouso confirmado"], [108, "Missão concluída"],
]);
export const isLaunchTimestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
export const starshipElapsed = (startedAt, now) => Math.max(0, (now - startedAt) / 1000);
export const starshipBusy = (house, now) => house?.type === "starship" && isLaunchTimestamp(house.launchAt) &&
  starshipElapsed(house.launchAt, now) < STARSHIP_DURATION;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t=clamp(x); return t*t*(3-2*t); };
const ramp = (t,a,b) => smooth((t-a)/(b-a));
const mix = (a,b,t) => a+(b-a)*t;
function path(t,keys) {
  if(t<=keys[0][0]) return keys[0].slice(1);
  for(let i=1;i<keys.length;i++) if(t<keys[i][0]) {
    const u=ramp(t,keys[i-1][0],keys[i][0]);
    return keys[i].slice(1).map((b,j)=>mix(keys[i-1][j+1],b,u));
  }
  return keys.at(-1).slice(1);
}
const pose = (position, rotation=[0,0,0]) => ({position,rotation});
export function sampleStarshipMission(seconds) {
  const t=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const lift=clamp((t-16)/18)**2;
  const ascent=[-5+32*lift,8.5+420*lift,-24*lift];
  const booster=t<=34?ascent:path(t,[[34,27,428.5,-24],[44,67,560,-45],
    [50,25,420,-22],[57,-5,95,0],[62,-5,8.5,0]]);
  const ship=t<=34?[ascent[0],ascent[1]+65,ascent[2]]:path(t,
    [[34,27,493.5,-24],[48,180,1000,-160],[60,320,1200,-220],
      [66,310,1080,-200],[82,65,180,-30],[90,21,38,6.5],[98,21,3.56,6.5]]);
  const boostTilt=t<34?-.075*lift:path(t,[[34,-.075],[44,-.2],[49,-.40],[55,.12],[59,0]])[0];
  const shipTilt=t<34?-.075*lift:path(t,[[34,-.075],[48,-.35],[60,1.28],[82,1.35],[89,0]])[0];
  const open=ramp(t,0,6)*(1-ramp(t,60,63));
  const phase=STARSHIP_PHASES.filter(([at])=>t>=at).at(-1)[1];
  return {
    seconds:t,phase,progress:clamp(t/STARSHIP_DURATION),done:t>=STARSHIP_DURATION,
    countdown:t<STARSHIP_LIFTOFF?Math.max(1,Math.ceil(STARSHIP_LIFTOFF-t)):0,
    booster:pose(booster,[0,0,boostTilt]),ship:pose(ship,[0,0,shipTilt]),
    armL:pose([-18,48+19.7*ramp(t,46,54),4],[0,-1.05*open,0]),
    armR:pose([-18,48+19.7*ramp(t,46,54),-4],[0,1.05*open,0]),
    quickDisconnect:pose([-18,75.5,0],[0,.95*ramp(t,5,10),0]),
    boosterThrust: t<34?ramp(t,10,14)*(1-ramp(t,32.5,34)):
      ramp(t,46,48)*(1-ramp(t,49,51))*.55+ramp(t,54,56)*(1-ramp(t,61,62))*.66,
    shipThrust:ramp(t,33.4,35)*(1-ramp(t,48,51))*.6+ramp(t,84,88)*(1-ramp(t,97.5,98))*.65,
    smoke:ramp(t,10,14)*(1-ramp(t,24,40)),
    vapor:(1-ramp(t,13,17))*.34,
    reentry:ramp(t,65,70)*(1-ramp(t,81,87)),
    deployment:ramp(t,85,91),
    landingDust:ramp(t,92,96)*(1-ramp(t,100,105)),
    celebration:ramp(t,98,99)*(1-ramp(t,105,108)),
  };
}
