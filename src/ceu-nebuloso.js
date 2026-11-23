import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from "three";

const NOISE_SIZE = 48;
export const NEBULA_CYCLE_SECONDS = 144;

export function createNebulaNoise() {
  const cells = new Uint8Array(NOISE_SIZE ** 3);
  let seed = 32873059;
  for (let i = 0; i < cells.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    cells[i] = seed & 255;
  }
  const texture = new Data3DTexture(cells, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  texture.format = RedFormat;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const nebulaNoiseGLSL = `
uniform highp sampler3D nebulaNoise;
float gasNoise(vec3 p) {
  vec3 f=fract(p);
  p=floor(p)+f*f*(3.0-2.0*f);
  return textureLod(nebulaNoise,(p+.5)/${NOISE_SIZE.toFixed(1)},0.0).r;
}
`;

// Sample direction directly in 3D so the gas joins across the meridian and at the zenith.
export const nebulaGLSL = `
${nebulaNoiseGLSL}
uniform float nebulaAmount;
uniform vec3 nebulaOrigin;
uniform float nebulaPhase;

float nebulaReveal(vec3 ray) {
  float arc=(1.0-dot(ray,nebulaOrigin))*.5;
  float arrival=(.83*arc+.17*gasNoise(ray*7.8+16.2))*.57;
  return smoothstep(arrival,arrival+.43,nebulaAmount);
}

float gasField(vec3 p) {
  mat3 twist=mat3(.80,.60,0.0,-.48,.64,.60,.36,-.48,.80);
  float sum=0.0, weight=.55;
  for (int i=0;i<5;i++) {
    sum+=gasNoise(p)*weight;
    p=twist*p*2.04+vec3(7.37,4.21,12.63);
    weight*=.48;
  }
  return sum;
}

vec3 stellarDust(vec2 p, float rarity, float magnitude, float size, float flare) {
  vec2 id=floor(p);
  float seed=hash(id+vec2(42.3,93.6));
  if (seed<rarity) return vec3(0.0);
  vec2 offset=vec2(hash(id+23.78),hash(id-75.16))*.52+.24;
  vec2 delta=abs(fract(p)-offset);
  float r=length(delta);
  float scale=size*mix(.55,1.0,hash(id+818.4));
  float glow=1.0-smoothstep(scale*.19,scale,r);
  float glare=exp(-r*15.0)*flare;
  float spike=exp(-min(delta.x,delta.y)*53.0-max(delta.x,delta.y)*9.0)*flare*.12;
  vec3 cool=vec3(.50,.72,1.0), warm=vec3(1.0,.69,.55);
  return mix(cool,warm,hash(id-148.53))*magnitude*(glow+glare+spike);
}

vec3 nebulaTint(vec3 base, vec3 accent, float amount) {
  // Match luminance before mixing colors, so the gas keeps its original glow.
  const vec3 luminance=vec3(.2126,.7152,.0722);
  return mix(base,accent*(dot(base,luminance)/dot(accent,luminance)),amount);
}

vec3 nebulaSkyColor(vec3 ray) {
  float drift=sin(nebulaPhase);
  float cycle=.5-.5*cos(nebulaPhase);
  vec3 p=ray*4.2+vec3(12.7,-1.4,7.5);
  p+=vec3(.25*drift,.26*cycle,-.16*drift+.08*cycle);
  vec3 curl=vec3(gasNoise(p*.59+4.7),gasNoise(p*.67-28.9),gasNoise(p*.53+13.1))-.5;
  p+=curl*3.45;
  // Advect the denser gas at a different rate from the thin, illuminated filaments.
  p+=.28*vec3(sin(nebulaPhase*2.0+ray.z*4.0),cos(nebulaPhase+ray.x*3.0),sin(nebulaPhase-ray.y*5.0));
  float mass=gasField(p);
  vec3 shear=curl*(.25*drift+.31*cycle);
  float grain=gasField(p*1.72+vec3(6.1,15.3,8.5)+shear);
  float vein=gasField(p*.91+vec3(14.1,-8.7,11.0)+curl*1.45);
  float dense=smoothstep(.40,.69,vein+.15*(grain-.5));
  float band=.47+.53*exp(-pow(dot(ray,normalize(vec3(.44,.23,-.87)))*1.35,2.0));
  float gas=smoothstep(.25,.79,mass*.82+grain*.18)*band;
  float ridges=pow(max(0.0,1.0-abs(grain-.54)*2.3),6.0);
  float edge=exp(-pow((vein-.46)*10.4,2.0))*ridges;
  float shadow=1.0-.93*dense;
  float detail=gasNoise(p*35.0)*.08+gasNoise(p*16.1)*.12;
  float ion=smoothstep(.37,.69,grain+curl.z*.37);
  vec3 charcoal=vec3(.004,.005,.011);
  vec3 cold=vec3(.006,.043,.058);
  vec3 crimson=vec3(.34,.025,.046), rose=vec3(.69,.106,.166), ember=vec3(.56,.060,.049);
  vec3 tint=mix(mix(crimson,rose,ion),ember,smoothstep(.49,.77,mass+curl.y*.27)*.35);
  // Different parts of the cloud shift at different times, keeping some of the warm red.
  float sweep=.5+.5*sin(nebulaPhase+ray.x*3.4+ray.z*2.1+grain*3.2);
  float coloredGas=mix(.74,.97,pow(cycle,.75))*mix(.68,.99,smoothstep(.24,.84,sweep));
  float cooler=smoothstep(.37,.75,ion*.48+.52*sweep);
  vec3 accent=mix(vec3(.183,.042,.38),vec3(.052,.12,.34),cooler);
  tint=nebulaTint(tint,accent,coloredGas);
  vec3 brightGas=nebulaTint(vec3(.65,.20,.22),accent,coloredGas*.8);
  vec3 color=charcoal+cold*smoothstep(.18,.63,grain)*(1.0-gas*.72)*(1.0-dense*.76);
  color+=tint*(gas*(.66+detail)*shadow+edge*gas*.32);
  color+=brightGas*pow(gas,3.0)*ridges*shadow*.46;
  float curtain = dot(ray, normalize(vec3(-.43,.22,-.87)));
  float stream = ray.y - .30 - .16 * sin(ray.x*7.8 + ray.z*5.1 + .42*sin(nebulaPhase));
  stream += (grain-.50)*.24;
  float curtainGlow = exp(-stream*stream*82.0) * smoothstep(.08,.91,curtain);
  float threads = .36 + .64*pow(.5+.5*sin(grain*67.0+ray.x*12.0-nebulaPhase*2.0),3.0);
  vec3 curtainColor = mix(vec3(.29,.025,.26),vec3(.043,.10,.38),ion);
  color += curtainColor * curtainGlow * threads * (.10+.64*gas) * shadow;

  vec2 stars=ray.xz/max(.68,1.0+ray.y);
  float veil=mix(.91,.45,dense*.7+gas*.3);
  color+=stellarDust(stars*557.0,.73,.115,.18,0.0)*veil;
  color+=stellarDust(stars*257.0+73.14,.87,.39,.205,0.0)*mix(.64,1.0,veil);
  color+=stellarDust(stars*92.0-17.3,.979,1.16,.145,.52)*mix(.78,1.0,veil);
  float altitude=smoothstep(-.11,.17,ray.y);
  vec3 horizonGlow=mix(vec3(.020,.011,.027),color,altitude);
  return mix(horizonGlow,color,.20+.80*altitude);
}
`;
