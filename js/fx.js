// Шейдерные эффекты машины: грязь, пена, блик полировки, капли, зазоры между панелями и ложное затенение.
// Шум берётся из одной бесшовной 3D-текстуры (несколько обращений вместо сотен вычислений на пиксель).
import * as THREE from 'three';
import { bakeNoise } from './noise.js';

let _noise = null;
export function getNoiseTexture() {
  if (_noise) return _noise;
  const N = 48;
  const t = new THREE.Data3DTexture(bakeNoise(N), N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.generateMipmaps = false; t.needsUpdate = true;
  return (_noise = t);
}

export function createFxUniforms() {
  return {
    uDirt: { value: 0 },
    uClean: { value: 9 },
    uCleanDir: { value: 1 },
    uFoam: { value: 0 },
    uFoamLine: { value: 3 },
    uFoamBand: { value: 0 },
    uSweep: { value: -9 },
    uSweepAmt: { value: 0 },
    uBeads: { value: 0 },
    uTime: { value: 0 },
    uCarInv: { value: new THREE.Matrix4() },
    uNoise: { value: getNoiseTexture() },
  };
}

const COMMON_GLSL = /* glsl */`
varying vec3 vCarPos;
varying vec2 vBUv;
uniform sampler3D uNoise;
uniform float uCleanDir, uDirt, uClean, uFoam, uFoamLine, uFoamBand, uSweep, uSweepAmt, uBeads, uTime;
const mat3 fxRot = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fxNoise(vec3 p){ return texture(uNoise, p * 0.125).a; }
float fxFbm(vec3 p){ return 0.55 * texture(uNoise, p * 0.125).r + 0.45 * texture(uNoise, fxRot * p * 0.2 + 0.37).g; }
float fxCells(vec3 p){ return texture(uNoise, p * 0.125).b; }
`;

// Линии стыков: f — расстояние до линии в единицах параметра, g — координата вдоль линии.
const PANEL_GLSL = /* glsl */`
float fxLn(float f, float hw){ float fw = max(fwidth(f), 1e-6); return 1.0 - smoothstep(hw, hw + 1.0, abs(f) / fw); }
float fxSeg(float g, float a, float b){ float fw = max(fwidth(g), 1e-6); return clamp((g - a) / fw + 0.5, 0.0, 1.0) * clamp((b - g) / fw + 0.5, 0.0, 1.0); }
float fxBox(vec2 p, vec2 c, vec2 h, float r){ vec2 d = abs(p - c) - h + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
// возвращает: x — тёмная линия стыка, y — мягкое затемнение вокруг
vec2 fxPanels(vec3 cp){
  float x = vBUv.x, sv = vBUv.y;
  float wpp = max(length(fwidth(cp)), 1e-5);
  float hw = clamp(0.0016 / wpp, 0.4, 1.25);
  float L = 0.0, S = 0.0;
  float side = cp.z > 0.0 ? 1.0 : 0.0;
  // двери (обе стороны)
  float lean = 0.045 * (sv - 3.15) / 3.5;
  float df = fxLn(x - (0.58 - lean), hw) * fxSeg(sv, 3.12, 6.95);
  float dr = fxLn(x - (-0.64 - lean), hw) * fxSeg(sv, 3.12, 6.95);
  float db = fxLn(sv - 3.15, hw) * fxSeg(x, -0.64, 0.58);
  L = max(L, max(df, max(dr, db)));
  // капот и крышка багажника
  float hoodBack = fxLn(x - 0.80, hw) * fxSeg(sv, 6.45, 10.2);
  float hoodSide = fxLn(sv - 6.45, hw) * fxSeg(x, 0.80, 1.98);
  float hoodFront = fxLn(x - 1.99, hw) * fxSeg(sv, 6.45, 10.2);
  float trunkFront = fxLn(x + 1.74, hw) * fxSeg(sv, 6.45, 10.2);
  float trunkSide = fxLn(sv - 6.45, hw) * fxSeg(x, -2.07, -1.74);
  float trunkBack = fxLn(x + 2.07, hw) * fxSeg(sv, 6.45, 10.2);
  L = max(L, max(hoodBack, max(hoodSide, hoodFront)));
  L = max(L, max(trunkFront, max(trunkSide, trunkBack)));
  // лючок бензобака (одна сторона)
  float flap = 1.0 - smoothstep(0.0, 1.2 * wpp * 6.0, abs(fxBox(vec2(x, sv), vec2(-1.36, 5.2), vec2(0.095, 0.5), 0.06)));
  L = max(L, flap * (1.0 - side) * 0.9);
  // ручка двери: углубление
  float rec = fxBox(vec2(x, sv), vec2(-0.43, 5.25), vec2(0.115, 0.34), 0.12);
  S = max(S, 1.0 - smoothstep(-0.01, 0.03, rec));
  S = max(S, L * 0.0);
  return vec2(L, S);
}
`;

const AO_GLSL = /* glsl */`
float fxAO(vec3 cp){
  float ao = mix(0.32, 1.0, smoothstep(0.2, 0.6, cp.y));
  vec2 a = vec2(cp.x - 1.38, cp.y - 0.33), b = vec2(cp.x + 1.37, cp.y - 0.33);
  float ra = length(a), rb = length(b);
  float arch = min(smoothstep(0.36, 0.66, ra), smoothstep(0.36, 0.66, rb));
  ao *= mix(0.5, 1.0, arch);
  return ao;
}
float fxWheelAO(vec3 cp){ return 0.28 + 0.72 * smoothstep(0.7, 0.92, abs(cp.z)); }
`;

export function applyFx(mat, U, kind = 'paint', opts = {}) {
  const strength = { paint: 1, glass: 0.7, rim: 1.2, tire: 0.6, trim: 0.8 }[kind] ?? 1;
  const panels = !!opts.panels;
  const wheelAO = kind === 'rim' || kind === 'tire' || !!opts.wheelAO;
  const bodyAO = kind === 'paint' || kind === 'trim' || kind === 'glass';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos;\nvarying vec2 vBUv;\nuniform mat4 uCarInv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCarPos = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvBUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON_GLSL + (panels ? PANEL_GLSL : '') + AO_GLSL)
      .replace('void main() {', `void main() {
        vec3 cp = vCarPos;
        float fxDirt = 0.0;
        if (uDirt > 0.001) {
          float washed = smoothstep(-0.07, 0.07, (cp.x - uClean) * uCleanDir);
          float low = 1.0 - smoothstep(0.15, 1.05, cp.y);
          float n = fxFbm(cp * vec3(5.0, 3.0, 5.0));
          float streak = fxFbm(vec3(cp.x * 9.0, cp.y * 1.2, cp.z * 9.0));
          float splat = smoothstep(0.45, 0.75, fxFbm(cp * 13.0 + 3.1)) * low;
          fxDirt = clamp(0.3 + n * 0.45 + low * 0.45 + streak * 0.3 * low + splat * 0.6, 0.0, 1.0);
          fxDirt *= uDirt * (1.0 - washed) * ${strength.toFixed(2)};
          fxDirt = clamp(fxDirt, 0.0, 0.97);
        }
        float fxFoam = 0.0;
        if (uFoam > 0.001 || uFoamBand > 0.001) {
          float cells = fxCells(cp * 34.0);
          float big = fxFbm(cp * vec3(4.0, 7.0, 4.0) + vec3(0.0, uTime * 0.05, 0.0));
          float drip = fxFbm(vec3(cp.x * 14.0, cp.y * 2.0 - uTime * 0.03, cp.z * 14.0));
          float cover = smoothstep(0.22, 0.42, big * 0.6 + drip * 0.45);
          float rinse = 1.0 - smoothstep(uFoamLine - 0.06, uFoamLine + 0.04, cp.y + drip * 0.12);
          fxFoam = uFoam * cover * rinse;
          float bandX = (cp.x - uClean) * uCleanDir;
          float fxBand = uFoamBand * smoothstep(0.0, 0.08, bandX) * (1.0 - smoothstep(0.35, 0.75, bandX + drip * 0.2)) * cover;
          fxFoam = max(fxFoam, fxBand);
          fxFoam *= smoothstep(0.05, 0.45, cells) * 0.22 + 0.78;
        }
        ${panels ? 'vec2 fxP = fxPanels(cp);' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 mud = mix(vec3(0.23, 0.19, 0.14), vec3(0.42, 0.36, 0.28), fxNoise(cp * 21.0));
        ${panels ? 'diffuseColor.rgb *= 1.0 - fxP.y * 0.55; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.16 + 0.004, fxP.x * 0.88);' : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, mud, fxDirt);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.97), fxFoam);
        ${kind === 'glass' ? 'diffuseColor.a = mix(diffuseColor.a, 1.0, max(fxDirt, fxFoam));' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.92, fxDirt);
        roughnessFactor = mix(roughnessFactor, 0.55, fxFoam);
        ${panels ? 'roughnessFactor = mix(roughnessFactor, 0.8, fxP.x);' : ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= (1.0 - fxDirt) * (1.0 - fxFoam);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float sw = exp(-pow((cp.x + cp.y * 0.35 - uSweep) / 0.09, 2.0)) * uSweepAmt * (1.0 - fxDirt);
        totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * sw * 0.55;
        totalEmissiveRadiance += vec3(0.1, 0.11, 0.12) * fxFoam;
        if (uBeads > 0.001) {
          float bc = fxCells(cp * 42.0);
          float bead = smoothstep(0.16, 0.05, bc) * smoothstep(0.35, 0.6, fxNoise(cp * 9.0));
          totalEmissiveRadiance += vec3(0.75, 0.82, 0.9) * smoothstep(0.07, 0.02, bc) * bead * uBeads * 0.8;
        }`);
    if (sh.fragmentShader.includes('#include <aomap_fragment>')) {
      const aoExpr = [bodyAO ? 'fxAO(cp)' : '1.0', wheelAO ? 'fxWheelAO(cp)' : '1.0'].join(' * ');
      sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float fxO = ${aoExpr}; ${panels ? 'fxO *= 1.0 - fxP.y * 0.6;' : ''}
          reflectedLight.indirectDiffuse *= fxO; reflectedLight.indirectSpecular *= mix(1.0, fxO, 0.85);
          #if defined( USE_CLEARCOAT )
            clearcoatSpecularIndirect *= mix(1.0, fxO, 0.85);
          #endif
        }`);
    }
    if (sh.fragmentShader.includes('#include <lights_physical_fragment>')) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= (1.0 - fxDirt) * (1.0 - fxFoam);
        #endif`);
    }
  };
  mat.customProgramCacheKey = () => `fx-${kind}-${panels ? 'p' : ''}-${wheelAO ? 'w' : ''}`;
  return mat;
}
