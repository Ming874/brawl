// 渲染器、天空、光源、環境反射
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const maxPR = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export const PRESETS = {
  lake: { elevation: 26, azimuth: 205, turbidity: 2.2, rayleigh: 2.0, exposure: 0.78, sun: 0xfff0d8, sunI: 2.9, hemiSky: 0xbfd8ff, hemiGround: 0x6b5a3a, hemiI: 0.8, fog: 0xb3cde3, fogNear: 90, fogFar: 380, clouds: 0.45 },
  arena: { elevation: 48, azimuth: 150, turbidity: 2.0, rayleigh: 1.6, exposure: 0.72, sun: 0xfff3e0, sunI: 2.8, hemiSky: 0xcfe6ff, hemiGround: 0x5a6a70, hemiI: 0.75, fog: 0xbcdcf2, fogNear: 90, fogFar: 520, clouds: 0.35 },
};

export class Env {
  constructor(renderer, scene, quality) {
    this.renderer = renderer; this.scene = scene; this.quality = quality;
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a3a, 0.9);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.skyScene = new THREE.Scene();
    this.skyForEnv = new Sky();
    this.skyForEnv.scale.setScalar(1000);
    this.skyScene.add(this.skyForEnv);
    scene.fog = new THREE.Fog(0xb9d3e6, 70, 330);
  }

  apply(name) {
    const p = PRESETS[name] || PRESETS.lake;
    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    for (const s of [this.sky, this.skyForEnv]) {
      const u = s.material.uniforms;
      u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
      u.sunPosition.value.copy(this.sunDir);
      if (u.cloudCoverage) { u.cloudCoverage.value = s === this.sky ? p.clouds : p.clouds * 0.25; u.cloudDensity.value = 0.5; u.cloudScale.value = 0.00025; }
    }
    if (this.skyForEnv.material.uniforms.showSunDisc) this.skyForEnv.material.uniforms.showSunDisc.value = 0;
    this.sun.color.setHex(p.sun); this.sun.intensity = p.sunI;
    this.hemi.color.setHex(p.hemiSky); this.hemi.groundColor.setHex(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.renderer.toneMappingExposure = p.exposure;
    this.scene.fog.color.setHex(p.fog); this.scene.fog.near = p.fogNear; this.scene.fog.far = p.fogFar;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.42;
  }

  // 陰影跟著玩家走，維持清晰度
  follow(pos) {
    this.sun.position.copy(pos).addScaledVector(this.sunDir, 80);
    this.sun.target.position.copy(pos);
  }

  update(t) {
    const u = this.sky.material.uniforms;
    if (u.time) u.time.value = t;
  }
}
