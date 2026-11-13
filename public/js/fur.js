// 毛茸茸的毛髮：用「殼層」技術（同一個模型往外疊很多層，每層挖掉一些點，形成一根根的毛）
import * as THREE from 'three';

let SHELLS = 14;
export function setFurQuality(q) { SHELLS = q === 'high' ? 16 : q === 'medium' ? 9 : 0; }
export function furShells() { return SHELLS; }

const baseMatCache = new Map();
const shellMatCache = new Map();

// 底層：絨布質感（sheen），即使低畫質也看起來毛毛的
export function furBaseMaterial(rough = 0.9) {
  const key = rough;
  if (!baseMatCache.has(key)) {
    baseMatCache.set(key, new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: rough, metalness: 0,
      sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.3, 0.29, 0.28),
    }));
  }
  return baseMatCache.get(key);
}

export function furShellMaterial(length, density) {
  const key = `${length}_${density}_${SHELLS}`;
  if (shellMatCache.has(key)) return shellMatCache.get(key);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const uniforms = { uFurLen: { value: length }, uShells: { value: SHELLS }, uDensity: { value: density } };
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uFurLen; uniform float uShells; uniform float uDensity;
        varying float vFurH; varying vec3 vFurP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float furH = (float(gl_InstanceID) + 1.0) / uShells;
        vFurH = furH;
        vFurP = position * uDensity;
        transformed += normalize(objectNormal) * uFurLen * furH;
        transformed.y -= uFurLen * 0.45 * furH * furH;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFurH; varying vec3 vFurP;
        float furHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 cell = floor(vFurP);
          vec3 f = fract(vFurP) - 0.5;
          float rnd = furHash(cell);
          vec3 jit = vec3(furHash(cell + 17.1), furHash(cell + 31.7), furHash(cell + 7.3)) - 0.5;
          float d = length(f - jit * 0.35);
          float thick = (1.0 - vFurH) * 0.82;
          if (d > thick || rnd < vFurH * 0.85 - 0.05) discard;
          diffuseColor.rgb *= mix(0.55, 1.02, vFurH);
        }`);
  };
  mat.customProgramCacheKey = () => 'fur-shell-v1';
  shellMatCache.set(key, mat);
  return mat;
}

// 建立一個毛茸茸的部位：底層網格 + 殼層 InstancedMesh
export function furMesh(geometry, { length = 0.02, density = 80, rough = 0.9, castShadow = true } = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(geometry, furBaseMaterial(rough));
  base.castShadow = castShadow; base.receiveShadow = true;
  g.add(base);
  if (SHELLS > 0 && length > 0) {
    const shells = new THREE.InstancedMesh(geometry, furShellMaterial(length, density), SHELLS);
    const id = new THREE.Matrix4();
    for (let i = 0; i < SHELLS; i++) shells.setMatrixAt(i, id);
    shells.instanceMatrix.needsUpdate = true;
    shells.frustumCulled = false;
    shells.castShadow = false; shells.receiveShadow = true;
    g.add(shells);
  }
  return g;
}

// 依位置/法線替頂點上色
export function paint(geo, fn) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    fn(p, n, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
