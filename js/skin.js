// Накладки (декали), спроецированные на поверхность кузова: стёкла, фары, фонари.
// Сетка строится в «природных» координатах (м): сбоку — (x, y), сверху — (x, z), спереди/сзади — (z, y).
import * as THREE from 'three';
import { ctrl, crPoint, NCP, DIM, clamp, lerp } from './body.js';

const SAMP = 80;
const secCache = new Map();
function section(x) {
  const k = Math.round(x * 2500);
  let a = secCache.get(k);
  if (a) return a;
  const P = ctrl(x);
  a = new Float32Array((SAMP + 1) * 2);
  for (let j = 0; j <= SAMP; j++) {
    const s = (j / SAMP) * NCP;
    const i = Math.floor(s) % NCP, t = s - Math.floor(s);
    const q = crPoint(P[(i - 1 + NCP) % NCP], P[i], P[(i + 1) % NCP], P[(i + 2) % NCP], t);
    a[j * 2] = q[0]; a[j * 2 + 1] = q[1];
  }
  secCache.set(k, a);
  return a;
}

// Точка боковой стены на высоте y (sign = ±1): первое пересечение снизу вверх до плеча (s ≤ 8).
// Вне диапазона возвращаем ближайшую точку поверхности, чтобы сетка не «зависала» в воздухе.
function sideAt(x, y, sign, out) {
  const a = section(x);
  const j0 = Math.floor(SAMP * 0.15), j1 = Math.floor(SAMP * 0.4);
  for (let j = j0; j < j1; j++) {
    const y0 = a[j * 2], y1 = a[j * 2 + 2];
    if ((y - y0) * (y - y1) <= 0 && y1 !== y0) {
      const t = (y - y0) / (y1 - y0);
      return out.set(x, y, (a[j * 2 + 1] + (a[j * 2 + 3] - a[j * 2 + 1]) * t) * sign);
    }
  }
  const j = y > a[j1 * 2] ? j1 : j0;
  return out.set(x, a[j * 2], a[j * 2 + 1] * sign);
}

// y на поверхности сверху при боковом смещении z
function topAt(x, z) {
  const a = section(x);
  const az = Math.abs(z);
  const j0 = Math.floor(SAMP * 0.25), j1 = SAMP / 2;
  for (let j = j0; j < j1; j++) {
    const z0 = a[j * 2 + 1], z1 = a[j * 2 + 3];
    if (z0 >= az && az >= z1 && z0 !== z1) {
      const t = (az - z0) / (z1 - z0);
      return a[j * 2] + (a[j * 2 + 2] - a[j * 2]) * t;
    }
  }
  return az > a[j0 * 2 + 1] ? a[j0 * 2] : a[j1 * 2];
}

function inside(a, y, z) {
  let c = false;
  const n = SAMP;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = a[i * 2], zi = a[i * 2 + 1], yj = a[j * 2], zj = a[j * 2 + 1];
    if ((zi > z) !== (zj > z) && y < ((yj - yi) * (z - zi)) / (zj - zi) + yi) c = !c;
  }
  return c;
}
function dist(a, y, z) {
  let d = 1e9;
  for (let i = 0; i < SAMP; i++) {
    const y0 = a[i * 2], z0 = a[i * 2 + 1], y1 = a[i * 2 + 2], z1 = a[i * 2 + 3];
    const dy = y1 - y0, dz = z1 - z0, l = dy * dy + dz * dz || 1e-9;
    const t = clamp(((y - y0) * dy + (z - z0) * dz) / l, 0, 1);
    d = Math.min(d, Math.hypot(y - (y0 + dy * t), z - (z0 + dz * t)));
  }
  return d;
}
// x на носу/корме для точки (y, z)
function faceAt(y, z, rear) {
  const step = 0.005;
  let prev = null;
  for (let i = 0; i < 120; i++) {
    const x = rear ? DIM.XR + i * step : DIM.XF - i * step;
    const a = section(x);
    if (inside(a, y, z)) {
      if (!prev) return x;
      const dIn = dist(a, y, z), dOut = dist(section(prev), y, z);
      const t = dOut / Math.max(1e-6, dOut + dIn);
      return lerp(prev, x, t);
    }
    prev = x;
  }
  return rear ? -2.1 : 2.1;
}

function gridPatch(pointAt, nu, nv, dir, { off = 0.003, flipU = false, flipV = false, center = false } = {}) {
  const P = new Float32Array((nu + 1) * (nv + 1) * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    pointAt(i / nu, j / nv, v);
    const k = (i * (nv + 1) + j) * 3;
    P[k] = v.x; P[k + 1] = v.y; P[k + 2] = v.z;
  }
  const N = new Float32Array(P.length);
  const Q = new Float32Array(P);
  const at = (i, j) => { const k = (clamp(i, 0, nu) * (nv + 1) + clamp(j, 0, nv)) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  const du = new THREE.Vector3(), dv = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
    du.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]); dv.set(c[0] - d[0], c[1] - d[1], c[2] - d[2]);
    n.crossVectors(du, dv).normalize();
    // наружу: от оси кузова (бока и крыша) либо вдоль заданного направления (нос и корма)
    const k = (i * (nv + 1) + j) * 3;
    const side = center ? n.x * 0 + n.y * (P[k + 1] - 0.62) + n.z * P[k + 2] : n.dot(dir);
    if (side < 0) n.negate();
    N[k] = n.x; N[k + 1] = n.y; N[k + 2] = n.z;
    Q[k] += n.x * off; Q[k + 1] += n.y * off; Q[k + 2] += n.z * off;
  }
  // ориентация обхода относительно нормали
  const c0 = at(0, 0), c1 = at(nu, 0), c2 = at(0, nv);
  du.set(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]); dv.set(c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]);
  const mk = (Math.floor(nu / 2) * (nv + 1) + Math.floor(nv / 2)) * 3;
  const nc = new THREE.Vector3(N[mk], N[mk + 1], N[mk + 2]);
  const flip = du.cross(dv).dot(nc) < 0;
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const k = (i * (nv + 1) + j) * 2;
    uv[k] = flipU ? 1 - i / nu : i / nu; uv[k + 1] = flipV ? 1 - j / nv : j / nv;
  }
  const idx = [];
  const row = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * row + j, b = (i + 1) * row + j, cc = (i + 1) * row + j + 1, d = i * row + j + 1;
    if (flip) idx.push(a, d, b, b, d, cc); else idx.push(a, b, d, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Q, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Сбоку: прямоугольник (x0..x1, y0..y1) на стороне sign. u вдоль x, v вдоль y. flipU — зеркало для текстуры.
export function sidePatch({ x0, x1, y0, y1, sign = 1, nu = 40, nv = 12, off = 0.003, flipU = false }) {
  return gridPatch((fu, fv, out) => {
    const x = lerp(x0, x1, fu), y = lerp(y0, y1, fv);
    return sideAt(x, y, sign, out);
  }, nu, nv, new THREE.Vector3(0, 0, sign), { off, flipU, center: true });
}
// Сверху: (x0..x1, z0..z1). u вдоль x, v вдоль z.
export function topPatch({ x0, x1, z0, z1, nu = 24, nv = 24, off = 0.003 }) {
  return gridPatch((fu, fv, out) => {
    const x = lerp(x0, x1, fu), z = lerp(z0, z1, fv);
    return out.set(x, topAt(x, z), z);
  }, nu, nv, new THREE.Vector3(0, 1, 0), { off, center: true });
}
// Спереди/сзади: (z0..z1, y0..y1). u вдоль z, v вдоль y.
export function facePatch({ rear = false, z0, z1, y0, y1, nu = 32, nv = 16, off = 0.003 }) {
  return gridPatch((fu, fv, out) => {
    const z = lerp(z0, z1, fu), y = lerp(y0, y1, fv);
    return out.set(faceAt(y, z, rear), y, z);
  }, nu, nv, new THREE.Vector3(rear ? -1 : 1, 0, 0), { off });
}

export { section };
