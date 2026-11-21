import * as THREE from "three";

const CELL_SIZE = 12;

// A cell contains every emitter whose range touches it. There is no nearest-N
// cutoff: lights behind the camera and overlapping lanterns still contribute.
export function buildLightGrid(lights) {
  const minX = Math.floor(Math.min(0, ...lights.map(l => l.position.x - l.range)) / CELL_SIZE);
  const minZ = Math.floor(Math.min(0, ...lights.map(l => l.position.z - l.range)) / CELL_SIZE);
  const maxX = Math.floor(Math.max(0, ...lights.map(l => l.position.x + l.range)) / CELL_SIZE);
  const maxZ = Math.floor(Math.max(0, ...lights.map(l => l.position.z + l.range)) / CELL_SIZE);
  const width = maxX - minX + 1, height = maxZ - minZ + 1;
  const cells = Array.from({ length: width * height }, () => []);
  lights.forEach((l, id) => {
    const x0 = Math.floor((l.position.x - l.range) / CELL_SIZE) - minX;
    const x1 = Math.floor((l.position.x + l.range) / CELL_SIZE) - minX;
    const z0 = Math.floor((l.position.z - l.range) / CELL_SIZE) - minZ;
    const z1 = Math.floor((l.position.z + l.range) / CELL_SIZE) - minZ;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cells[z * width + x].push(id);
  });
  return { minX, minZ, width, height, cells, maxLights: Math.max(0, ...cells.map(c => c.length)) };
}

function dataTexture(data, width, height) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

const drainShader = `
uniform vec4 cityDrain;
float citySupply(vec2 position) {
  if (cityDrain.w <= 0.0) return 1.0;
  return 1.0 - smoothstep(cityDrain.z - cityDrain.w, cityDrain.z + cityDrain.w, distance(position, cityDrain.xy));
}
`;

const declarations = `
varying vec3 vCityPosition;
uniform sampler2D cityLights, cityCells;
uniform vec4 cityGrid;
uniform float cityPower;
${drainShader}
`;
const lighting = `
#if defined(RE_Direct)
if (cityPower > 0.015) {
  ivec2 cityCell = ivec2(floor(vCityPosition.xz / ${CELL_SIZE}.0) - cityGrid.xy);
  if (all(greaterThanEqual(cityCell, ivec2(0))) && all(lessThan(cityCell, ivec2(cityGrid.zw)))) {
    int cityRow = cityCell.y * int(cityGrid.z) + cityCell.x;
    int cityCount = int(texelFetch(cityCells, ivec2(0, cityRow), 0).r);
    // Dynamic, spatially bounded loop: adding lamps never expands the shader.
    for (int cityIndex = 0; cityIndex < cityCount; cityIndex++) {
      int cityID = int(texelFetch(cityCells, ivec2(cityIndex + 1, cityRow), 0).r);
      vec4 citySource = texelFetch(cityLights, ivec2(0, cityID), 0);
      float supply = citySupply(citySource.xz);
      if (supply <= 0.0) continue;
      vec3 cityDelta = citySource.xyz - vCityPosition;
      float cityDistance = length(cityDelta);
      if (cityDistance >= citySource.w) continue;
      vec4 cityColor = texelFetch(cityLights, ivec2(1, cityID), 0);
      vec4 cityCone = texelFetch(cityLights, ivec2(2, cityID), 0);
      float citySpot = 1.0;
      if (cityCone.w > -1.0) {
        float cityInner = texelFetch(cityLights, ivec2(3, cityID), 0).r;
        citySpot = smoothstep(cityCone.w, cityInner, dot(-normalize(cityDelta), cityCone.xyz));
      }
      IncidentLight cityDirect;
      cityDirect.direction = normalize(mat3(viewMatrix) * cityDelta);
      cityDirect.color = cityColor.rgb * cityPower * supply * citySpot * getDistanceAttenuation(cityDistance, citySource.w, 2.0);
      cityDirect.visible = true;
      RE_Direct(cityDirect, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
}
#endif
`;

export function createClusteredLights(scene, haloMap) {
  const uniforms = {
    cityLights: { value: dataTexture(new Float32Array(16), 4, 1) },
    cityCells: { value: dataTexture(new Float32Array(4), 1, 1) },
    cityGrid: { value: new THREE.Vector4(0, 0, 1, 1) },
    cityPower: { value: 0 },
    cityDrain: { value: new THREE.Vector4() },
  };
  const bound = new WeakSet();
  const cache = new Map();
  let haloMesh = null;
  let capacity = 0;
  let stats = { emitters: 0, maxLightsPerCell: 0, rebuilds: 0 };
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), haloMap: { value: haloMap },
      power: uniforms.cityPower, cityDrain: uniforms.cityDrain },
    vertexShader: `
      ${drainShader}
      varying vec3 haloColor;
      varying vec2 haloUv;
      varying float haloSupply;
      #include <fog_pars_vertex>
      void main() {
        haloColor = instanceColor;
        haloUv = uv;
        haloSupply = citySupply(instanceMatrix[3].xz);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        mvPosition.xyz *= .997;
        mvPosition.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D haloMap;
      uniform float power;
      varying vec3 haloColor;
      varying vec2 haloUv;
      varying float haloSupply;
      #include <fog_pars_fragment>
      void main() {
        vec4 halo = texture2D(haloMap, haloUv);
        gl_FragColor = vec4(haloColor, halo.a * power * haloSupply * .7);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true,
  });
  const haloGeometry = new THREE.PlaneGeometry(1, 1);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  function bind(root) {
    root.traverse(({ material }) => {
      for (const mat of (Array.isArray(material) ? material : [material])) {
        if (!mat?.isMeshStandardMaterial || bound.has(mat)) continue;
        bound.add(mat);
        const previous = mat.onBeforeCompile;
        const key = mat.customProgramCacheKey();
        const emissionGate = mat.userData.storedEnergy ? '' : 'totalEmissiveRadiance *= citySupply(vCityPosition.xz);';
        mat.onBeforeCompile = function(shader, renderer) {
          previous.call(this, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = 'varying vec3 vCityPosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
            vec4 cityWorld = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              cityWorld = batchingMatrix * cityWorld;
            #endif
            #ifdef USE_INSTANCING
              cityWorld = instanceMatrix * cityWorld;
            #endif
            vCityPosition = (modelMatrix * cityWorld).xyz;`);
          shader.fragmentShader = declarations + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
            '#include <lights_fragment_begin>\n' + emissionGate + '\n' + lighting);
        };
        mat.customProgramCacheKey = () => `village-clustered-v3:${mat.userData.storedEnergy ? 'stored' : 'grid'}:${key}`;
        mat.needsUpdate = true;
      }
    });
  }

  function rebuild(lights) {
    const grid = buildLightGrid(lights);
    const lightData = new Float32Array(Math.max(1, lights.length) * 16);
    lights.forEach((l, i) => {
      const offset = i * 16;
      color.set(l.color).multiplyScalar(l.intensity * 1.75);
      lightData.set([...l.position.toArray(), l.range, ...color.toArray(), 0,
        ...l.direction.toArray(), l.spot ? Math.cos(l.angle) : -2,
        Math.cos(l.angle * .22), 0, 0, 0], offset);
    });
    const columns = grid.maxLights + 1;
    const cellData = new Float32Array(columns * grid.cells.length * 4);
    grid.cells.forEach((ids, row) => {
      cellData[row * columns * 4] = ids.length;
      ids.forEach((id, index) => { cellData[(row * columns + index + 1) * 4] = id; });
    });
    uniforms.cityLights.value.dispose();
    uniforms.cityCells.value.dispose();
    uniforms.cityLights.value = dataTexture(lightData, 4, Math.max(1, lights.length));
    uniforms.cityCells.value = dataTexture(cellData, columns, grid.cells.length);
    uniforms.cityGrid.value.set(grid.minX, grid.minZ, grid.width, grid.height);
    const halos = lights.filter(l => l.halo);
    if (!haloMesh || capacity < halos.length) {
      if (haloMesh) { haloMesh.removeFromParent(); haloMesh.dispose(); }
      capacity = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, halos.length));
      haloMesh = new THREE.InstancedMesh(haloGeometry, haloMaterial, capacity);
      // Keep the vertex layout valid when precompiling a village with no lamps.
      haloMesh.setColorAt(0, color.set("#ffffff"));
      haloMesh.name = "Halos instanciados";
      haloMesh.frustumCulled = false;
      scene.add(haloMesh);
    }
    haloMesh.count = halos.length;
    halos.forEach((l, i) => {
      matrix.makeScale(l.halo, l.halo, l.halo).setPosition(l.position);
      haloMesh.setMatrixAt(i, matrix);
      haloMesh.setColorAt(i, color.set(l.color));
    });
    haloMesh.instanceMatrix.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
    stats = { emitters: lights.length, maxLightsPerCell: grid.maxLights, rebuilds: stats.rebuilds + 1 };
  }

  function update(houses, camera, power) {
    uniforms.cityPower.value = power;
    const present = new Set();
    let changed = false;
    for (const { model } of houses) {
      if (!model.visible || !model.userData.lampEmitters) continue;
      present.add(model);
      model.updateWorldMatrix(true, false);
      const previous = cache.get(model);
      if (previous?.matrix.equals(model.matrixWorld) && previous.emitters === model.userData.lampEmitters) continue;
      const lights = model.userData.lampEmitters.map(e => ({ ...e,
        position: new THREE.Vector3(...e.position).applyMatrix4(model.matrixWorld),
        direction: new THREE.Vector3(...(e.direction ?? [0, -1, 0])).transformDirection(model.matrixWorld),
        spot: Boolean(e.direction), angle: e.angle ?? .84,
      }));
      cache.set(model, { matrix: model.matrixWorld.clone(), emitters: model.userData.lampEmitters, lights });
      changed = true;
    }
    for (const model of cache.keys()) if (!present.has(model)) { cache.delete(model); changed = true; }
    if (changed || !haloMesh) rebuild([...cache.values()].flatMap(v => v.lights));
    haloMesh.visible = power > .015 && haloMesh.count > 0;
  }
  function supplyAt(x, z) {
    const drain = uniforms.cityDrain.value;
    if (!drain.w) return 1;
    const distance = Math.hypot(x - drain.x, z - drain.y);
    return 1 - THREE.MathUtils.smoothstep(distance, drain.z - drain.w, drain.z + drain.w);
  }

  return { update, bind, uniforms, supplyAt, get stats() { return stats; } };
}
