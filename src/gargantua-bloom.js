import * as THREE from "three";
import { nebulaNoiseGLSL } from "./ceu-nebuloso.js";
import { GARGANTUA_ANGULAR_RADIUS, gargantuaCoordinatesGLSL, gargantuaRadianceGLSL } from "./gargantua.js";

const bloomWidth = 256;
const bloomHeight = 128;
const bloomAngle = Math.atan(GARGANTUA_ANGULAR_RADIUS * Math.hypot(4.75, 2.4));
const screenVertex = `
varying vec2 sampleUv;
void main() {
  sampleUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function createGargantuaBloom(renderer, skyUniforms) {
  if (!renderer.isWebGLRenderer || !renderer.extensions.has("EXT_color_buffer_float")) return () => {};
  const viewDirection = new THREE.Vector3();
  let pass;

  function buildPass() {
    const options = { depthBuffer: false, type: THREE.HalfFloatType };
    const bright = new THREE.WebGLRenderTarget(bloomWidth, bloomHeight, options);
    const blur = new THREE.WebGLRenderTarget(bloomWidth, bloomHeight, options);
    const result = new THREE.WebGLRenderTarget(bloomWidth, bloomHeight, options);
    [bright.texture, blur.texture, result.texture].forEach((texture, index) => {
      texture.name = ["Gargântua HDR", "Gargântua bloom horizontal", "Gargântua bloom"][index];
    });

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const materialOptions = { vertexShader: screenVertex, depthTest: false, depthWrite: false, toneMapped: false };
    const emission = new THREE.ShaderMaterial({
      ...materialOptions,
      uniforms: skyUniforms,
      fragmentShader: `
        varying vec2 sampleUv;
        ${nebulaNoiseGLSL}
        ${gargantuaCoordinatesGLSL}
        ${gargantuaRadianceGLSL}
        void main() {
          vec2 p = (sampleUv - .5) * vec2(9.5, 4.8);
          float shadow = 1.0 - smoothstep(.97, .98, length(p));
          vec3 light = accretionRadiance(p, shadow).light;
          float brightness = dot(light, vec3(.2126, .7152, .0722));
          gl_FragColor = vec4(light * smoothstep(.86, 3.8, brightness), 1.0);
        }
      `,
    });
    const diffusion = new THREE.ShaderMaterial({
      ...materialOptions,
      uniforms: { source: { value: bright.texture }, stepUv: { value: new THREE.Vector2() } },
      fragmentShader: `
        uniform sampler2D source;
        uniform vec2 stepUv;
        varying vec2 sampleUv;
        void main() {
          vec3 light = texture2D(source, sampleUv).rgb * .227027;
          light += (texture2D(source, sampleUv + stepUv * 1.384615).rgb +
                    texture2D(source, sampleUv - stepUv * 1.384615).rgb) * .316216;
          light += (texture2D(source, sampleUv + stepUv * 3.230769).rgb +
                    texture2D(source, sampleUv - stepUv * 3.230769).rgb) * .070270;
          gl_FragColor = vec4(light, 1.0);
        }
      `,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), emission);
    quad.frustumCulled = false;
    scene.add(quad);
    return { bright, blur, result, scene, camera, quad, emission, diffusion, phase: -1, reveal: 0 };
  }

  return view => {
    const reveal = skyUniforms.gargantuaReveal.value;
    if (reveal <= 0) return;
    if (view?.isPerspectiveCamera) {
      const diagonal = Math.atan(Math.tan(THREE.MathUtils.degToRad(view.getEffectiveFOV() / 2)) * Math.hypot(1, view.aspect));
      if (view.getWorldDirection(viewDirection).dot(skyUniforms.gargantuaDirection.value) < Math.cos(diagonal + bloomAngle)) return;
    }
    pass ??= buildPass();
    const phase = skyUniforms.gargantuaOrbit.value;
    if (pass.phase === phase && pass.reveal === reveal) return;
    const { bright, blur, result, scene, camera, quad, emission, diffusion } = pass;
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    try {
      quad.material = emission;
      renderer.setRenderTarget(bright);
      renderer.render(scene, camera);
      quad.material = diffusion;
      diffusion.uniforms.source.value = bright.texture;
      diffusion.uniforms.stepUv.value.set(2.65 / bloomWidth, 0);
      renderer.setRenderTarget(blur);
      renderer.render(scene, camera);
      diffusion.uniforms.source.value = blur.texture;
      diffusion.uniforms.stepUv.value.set(0, 2.65 / bloomHeight);
      renderer.setRenderTarget(result);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(target, cubeFace, mipLevel);
    }
    skyUniforms.gargantuaBloom.value = result.texture;
    skyUniforms.gargantuaBloomStrength.value = .57;
    pass.phase = phase;
    pass.reveal = reveal;
  };
}
