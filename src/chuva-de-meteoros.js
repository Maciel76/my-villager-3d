import * as THREE from "three";

const METEORS_PER_WAVE = 50;
const WAVE_SECONDS = 14;

const meteorVertex = `
attribute vec3 aOrigin, aCourse, aStyle;
attribute vec4 aTiming;
uniform float uSeconds;
varying vec2 vTrail;
varying vec2 vLight;

void main() {
  float age=(uSeconds-aTiming.x)/aTiming.y;
  vTrail=uv;
  if (age<=0.0 || age>=1.0) {
    vLight=vec2(0.0);
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    return;
  }
  float trail=min(aTiming.w,aTiming.z*age+.009);
  float angle=aTiming.z*age-(uv.y-.14)/.86*trail;
  vec3 direction=aOrigin*cos(angle)+aCourse*sin(angle);
  vec3 normal=cross(aOrigin,aCourse);
  float taper=mix(1.0,.36,smoothstep(.14,1.0,uv.y));
  direction=normalize(direction+normal*(uv.x*2.0-1.0)*aStyle.x*taper);
  vLight=vec2(aStyle.z*smoothstep(0.0,.16,age)*(1.0-smoothstep(.60,1.0,age)),aStyle.y);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(direction*94.0,1.0);
}`;

const meteorFragment = `
varying vec2 vTrail;
varying vec2 vLight;

void main() {
  float crossTrail=abs(vTrail.x*2.0-1.0);
  float remaining=1.0-smoothstep(.14,1.0,vTrail.y);
  float wake=smoothstep(.035,.145,vTrail.y)*remaining;
  float spine=exp(-crossTrail*crossTrail*39.0)*wake*remaining;
  float mist=exp(-crossTrail*crossTrail*6.0)*wake*.19;
  float tip=exp(-pow((vTrail.y-.14)/.052,2.0)-crossTrail*crossTrail*13.0);
  float fade=(1.0-smoothstep(.83,1.0,crossTrail))*smoothstep(0.0,.065,vTrail.y);
  vec3 color=mix(vec3(.37,.67,1.0),vec3(1.0,.64,.32),vLight.y);
  gl_FragColor=vec4(mix(color,vec3(1.0,.96,.90),tip*.85),
    (spine*.58+mist+tip*.94)*fade*vLight.x);
  #include <colorspace_fragment>
}`;

export function createMeteorShower(sky) {
  const ribbon = new THREE.PlaneGeometry(2, 2, 1, 6);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = ribbon.index;
  geometry.attributes.position = ribbon.attributes.position;
  geometry.attributes.uv = ribbon.attributes.uv;
  geometry.instanceCount = METEORS_PER_WAVE;
  const origin = new THREE.InstancedBufferAttribute(new Float32Array(METEORS_PER_WAVE * 3), 3);
  const course = origin.clone();
  const style = origin.clone();
  const timing = new THREE.InstancedBufferAttribute(new Float32Array(METEORS_PER_WAVE * 4), 4);
  geometry.setAttribute("aOrigin", origin);
  geometry.setAttribute("aCourse", course);
  geometry.setAttribute("aStyle", style);
  geometry.setAttribute("aTiming", timing);
  const seconds = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { uSeconds: seconds },
    vertexShader: meteorVertex,
    fragmentShader: meteorFragment,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    // Draw with the opaque sky so buildings can occlude the trails.
    transparent: false,
  });
  const meteors = new THREE.Mesh(geometry, material);
  meteors.name = "Chuva de meteoros";
  meteors.renderOrder = sky.renderOrder + 1;
  meteors.frustumCulled = false;
  meteors.visible = false;
  sky.add(meteors);

  let waveReady = false;
  function fillWave() {
    const tangent = new THREE.Vector3();
    for (let i = 0; i < METEORS_PER_WAVE; i++) {
      const azimuth = THREE.MathUtils.randFloat(0, Math.PI * 2);
      const y = THREE.MathUtils.randFloat(.11, .90);
      const horizontal = Math.sqrt(1 - y * y);
      const x = Math.cos(azimuth);
      const z = Math.sin(azimuth);
      origin.setXYZ(i, x * horizontal, y, z * horizontal);
      // Start in either direction along the horizon, with varying downward slopes.
      const slope = THREE.MathUtils.randFloat(.12, .63);
      const lateral = Math.random() < .5 ? -1 : 1;
      tangent.set(y * x * slope - z * lateral, -horizontal * slope, y * z * slope + x * lateral).normalize();
      course.setXYZ(i, tangent.x, tangent.y, tangent.z);
      const delay = (i + Math.random()) * (WAVE_SECONDS - .9) / METEORS_PER_WAVE;
      timing.setXYZW(i, delay, THREE.MathUtils.randFloat(.42, .84), THREE.MathUtils.randFloat(.19, .46),
        THREE.MathUtils.randFloat(.049, .127));
      style.setXYZ(i, THREE.MathUtils.randFloat(.0024, .0043), Math.random() ** 2, THREE.MathUtils.randFloat(.65, 1.25));
    }
    for (const attribute of [origin, course, style, timing]) attribute.needsUpdate = true;
    waveReady = true;
  }

  return {
    update(visible, elapsed) {
      meteors.visible = visible;
      if (!visible) return;
      seconds.value += elapsed;
      if (!waveReady || seconds.value >= WAVE_SECONDS) {
        seconds.value %= WAVE_SECONDS;
        fillWave();
      }
    },
  };
}
