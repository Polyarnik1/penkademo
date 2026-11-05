// Кузов оригинального спорт-купе: лофт по сечениям + накладки (декали) по поверхности.
// Параметризация поверхности: x — вдоль машины, s — вокруг сечения [0..20): 0 — низ по центру, 10 — крыша по центру.
// Для текстур и шейдера используется симметричная пара (x, sv), sv = min(s, 20 - s).
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function spline(keys) {
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    const n = keys.length;
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (keys[i + 1][0] < x) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n - 1, i + 2)];
    const h = p2[0] - p1[0];
    const t = (x - p1[0]) / h;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h;
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

export const DIM = {
  XF: 2.3, XR: -2.3,
  axleF: 1.38, axleR: -1.37,
  wheelR: 0.33, wheelY: 0.33, track: 0.8,
  archR: 0.372,
};
export const NOSE0 = 1.96, TAIL0 = -2.1;
export const NCP = 20;

const halfW = spline([[-2.3, 0.8], [-2.18, 0.9], [-1.9, 0.962], [-1.4, 0.99], [-0.95, 0.962], [-0.3, 0.922], [0.4, 0.924], [1.1, 0.946], [1.45, 0.962], [1.85, 0.915], [2.15, 0.85], [2.3, 0.78]]);
const deckK = spline([[-2.3, 0.86], [-2.2, 0.93], [-2.06, 0.968], [-1.8, 0.955], [-1.37, 0.935], [-0.6, 0.9], [0.3, 0.884], [0.68, 0.872], [1.0, 0.85], [1.38, 0.822], [1.75, 0.762], [2.05, 0.68], [2.3, 0.6]]);
const roofRaw = spline([[-1.66, -0.02], [-1.5, 0.03], [-1.15, 0.17], [-0.72, 0.33], [-0.32, 0.405], [0.0, 0.395], [0.25, 0.3], [0.47, 0.15], [0.66, 0.02], [0.74, -0.02]]);
const baseBottom = spline([[-2.3, 0.36], [-2.05, 0.285], [-1.75, 0.262], [1.75, 0.255], [2.1, 0.235], [2.3, 0.3]]);

function roofH(x) { return x < -1.66 || x > 0.74 ? 0 : Math.max(0, roofRaw(x)); }
function cabin(x) { return clamp(roofH(x) / 0.11, 0, 1); }

function archTop(x) {
  let top = -1;
  for (const a of [DIM.axleF, DIM.axleR]) {
    const dx = Math.abs(x - a);
    const R = DIM.archR;
    if (dx < R) {
      const b = baseBottom(x);
      const lowEdge = Math.sqrt(Math.max(0, R * R - (DIM.wheelY - b) ** 2));
      const s = sstep(lowEdge + 0.004, lowEdge - 0.01, dx);
      const t = DIM.wheelY + Math.sqrt(R * R - dx * dx);
      top = Math.max(top, lerp(b, t, s));
    }
  }
  return top;
}
function zBottom(x) { return Math.max(baseBottom(x), archTop(x)); }

let _cx = NaN, _cp = null;
function ctrl(x) {
  if (x === _cx) return _cp;
  const w = halfW(x), d = deckK(x), zb = zBottom(x);
  const g = roofH(x), c = cabin(x);
  const h = Math.max(0.05, d - zb);
  // скульптура боковины: вогнутая талия дверей и выпуклое плечо; купол капота
  const door = sstep(-1.25, -0.7, x) * (1 - sstep(0.7, 1.25, x));
  const hood = sstep(0.8, 1.15, x) * (1 - sstep(1.7, 2.0, x));
  const R = [
    [zb, 0],
    [zb, w * 0.8],
    [zb + 0.016, w - 0.036],
    [zb + Math.min(0.09, h * 0.24), w - 0.002],
    [zb + h * 0.5, w - 0.002 - 0.016 * door],
    [d - Math.min(0.075, h * 0.22), w + 0.004 + 0.008 * door],
    [d - Math.min(0.013, h * 0.05), w - 0.05],
    [d + 0.008, w - 0.118],
    [d + lerp(0.012, 0.02, c) + g * 0.8 + 0.004 * hood, lerp(w * 0.62, w - 0.275, c)],
    [d + lerp(-0.002, 0.03, c) + g * 0.985 + 0.011 * hood, lerp(w * 0.3, w * 0.5, c)],
    [d + lerp(-0.008, 0.04, c) + g + 0.013 * hood, 0],
  ];
  let ky = 1, kz = 1, yc = (zb + d) * 0.5;
  if (x > NOSE0) {
    const t = clamp((x - NOSE0) / (DIM.XF - NOSE0), 0, 1);
    ky = Math.pow(1 - Math.pow(t, 2.3), 1 / 2.3);
    kz = Math.pow(1 - Math.pow(t, 3.2), 1 / 3.2);
    yc = lerp(zb, d, 0.42);
  } else if (x < TAIL0) {
    const t = clamp((TAIL0 - x) / (TAIL0 - DIM.XR), 0, 1);
    ky = Math.pow(1 - Math.pow(t, 3.2), 1 / 3.2);
    kz = Math.pow(1 - Math.pow(t, 5), 1 / 5);
    yc = lerp(zb, d, 0.5);
  }
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push([yc + (R[i][0] - yc) * ky, R[i][1] * kz]);
  for (let i = 9; i >= 1; i--) pts.push([pts[i][0], -pts[i][1]]);
  _cx = x; _cp = pts;
  return pts;
}
export { ctrl };

export function crPoint(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-5, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const A1 = mix(p0, p1, (tt - t0) / (t1 - t0));
  const A2 = mix(p1, p2, (tt - t1) / (t2 - t1));
  const A3 = mix(p2, p3, (tt - t2) / (t3 - t2));
  const B1 = mix(A1, A2, (tt - t0) / (t2 - t0));
  const B2 = mix(A2, A3, (tt - t1) / (t3 - t1));
  return mix(B1, B2, (tt - t1) / (t2 - t1));
}

export function surfPoint(x, s, out = new THREE.Vector3()) {
  const P = ctrl(x);
  const ss = ((s % NCP) + NCP) % NCP;
  const i = Math.floor(ss), t = ss - i;
  const q = crPoint(P[(i - 1 + NCP) % NCP], P[i], P[(i + 1) % NCP], P[(i + 2) % NCP], t);
  return out.set(x, q[0], q[1]);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
export function surfNormal(x, s, out = new THREE.Vector3()) {
  const e = 0.004;
  surfPoint(x + e, s, _a); surfPoint(x - e, s, _b);
  surfPoint(x, s + e * 4, _c); surfPoint(x, s - e * 4, _d);
  const tx = _a.sub(_b), ts = _c.sub(_d);
  out.crossVectors(tx, ts).normalize();
  surfPoint(x, s, _b);
  _m.set(x, 0.6, 0);
  if (out.dot(_b.sub(_m)) < 0) out.negate();
  return out;
}
export const symS = (s) => Math.min(s, NCP - s);

// Область (по триангулярным ячейкам) — границы выровнены по срезам и столбцам сетки, поэтому края гладкие.
function regionOf(xm, sm) {
  const sv = symS(sm);
  if (sv < 1.0) return 'under';
  // пороги и лёгкие накладки
  if (xm > 2.0 && sv < 1.5) return 'trim';
  if (xm < -2.0 && sv < 3.5) return 'trim';
  if (sv < 3.0 && xm > DIM.axleR + 0.28 && xm < DIM.axleF - 0.28) return 'trim';
  if (sv < 2.0 && (xm > 1.8 || xm < -1.95)) return 'trim';
  return 'paint';
}

export function sliceXs(lod = 'high') {
  const xs = new Set();
  const add = (x) => { if (x >= DIM.XR - 1e-6 && x <= DIM.XF + 1e-6) xs.add(Math.round(x * 1e4) / 1e4); };
  const dense = (a, b, step) => { for (let x = a; x <= b + 1e-9; x += step) add(x); };
  const base = lod === 'low' ? 0.08 : 0.06;
  dense(DIM.XR, DIM.XF, base);
  dense(NOSE0 - 0.08, DIM.XF, lod === 'low' ? 0.02 : 0.012);
  dense(DIM.XR, TAIL0 + 0.08, lod === 'low' ? 0.02 : 0.012);
  for (const a of [DIM.axleF, DIM.axleR]) {
    const R = DIM.archR;
    dense(a - R - 0.015, a - R + 0.03, 0.0035);
    dense(a + R - 0.03, a + R + 0.015, 0.0035);
    dense(a - R + 0.03, a + R - 0.03, 0.03);
  }
  // кромки остекления и границ областей
  dense(0.52, 0.8, lod === 'low' ? 0.014 : 0.008);
  dense(-1.72, -1.3, lod === 'low' ? 0.03 : 0.018);
  for (const x of [-2.1, -2.0, -1.95, -1.8, -1.0, 1.0, 1.8, 1.98, 2.0, 2.15]) add(x);
  add(DIM.XF); add(DIM.XR);
  return [...xs].sort((a, b) => a - b);
}

export function buildBodyGeometry(lod = 'high') {
  const X = sliceXs(lod);
  const per = lod === 'low' ? 4 : 6;
  const N = NCP * per;
  const pos = [], uv = [];
  for (const x of X) {
    const P = ctrl(x);
    for (let j = 0; j <= N; j++) {
      const s = (j / N) * NCP;
      const i = Math.floor(s) % NCP, t = s - Math.floor(s);
      const q = crPoint(P[(i - 1 + NCP) % NCP], P[i], P[(i + 1) % NCP], P[(i + 2) % NCP], t);
      pos.push(x, q[0], q[1]);
      uv.push(x, symS(s));
    }
  }
  const cols = N + 1;
  const groups = { paint: [], trim: [], under: [], grille: [] };
  for (let r = 0; r < X.length - 1; r++) {
    const xm = (X[r] + X[r + 1]) * 0.5;
    for (let j = 0; j < N; j++) {
      const sm = ((j + 0.5) / N) * NCP;
      const a = r * cols + j, b = (r + 1) * cols + j, cc = (r + 1) * cols + j + 1, d = r * cols + j + 1;
      groups[regionOf(xm, sm)].push(a, b, d, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const order = ['paint', 'trim', 'under', 'grille'];
  const total = order.reduce((n, k) => n + groups[k].length, 0);
  const index = new Uint32Array(total);
  let off = 0;
  order.forEach((k, mi) => { geo.addGroup(off, groups[k].length, mi); index.set(groups[k], off); off += groups[k].length; });
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  return geo;
}

// Накладка на поверхность: сетка по (x, s) с небольшим подъёмом вдоль нормали.
// mirrorV: u = (x - x0) / (x1 - x0), v = (s - s0) / (s1 - s0) либо отражённое для правой стороны.
export function surfacePatch({ x0, x1, s0, s1, nx = 24, ns = 12, off = 0.003, flipV = false, flipU = false }) {
  const pos = [], nor = [], uv = [], idx = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= nx; i++) {
    const fx = i / nx, x = lerp(x0, x1, fx);
    for (let j = 0; j <= ns; j++) {
      const fs = j / ns, s = lerp(s0, s1, fs);
      surfPoint(x, s, p); surfNormal(x, s, n);
      pos.push(p.x + n.x * off, p.y + n.y * off, p.z + n.z * off);
      nor.push(n.x, n.y, n.z);
      uv.push(flipU ? 1 - fx : fx, flipV ? 1 - fs : fs);
    }
  }
  const row = ns + 1;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
    const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// x задней/передней поверхности кузова на заданной высоте у центра
export function endX(y, z, rear = true) {
  const step = 0.002;
  for (let i = 0; i < 300; i++) {
    const x = rear ? DIM.XR + i * step : DIM.XF - i * step;
    const P = ctrl(x);
    let ymin = 9, ymax = -9, wmax = 0;
    for (const [py, pz] of P) { ymin = Math.min(ymin, py); ymax = Math.max(ymax, py); wmax = Math.max(wmax, Math.abs(pz)); }
    if (y > ymin + 0.01 && y < ymax && Math.abs(z) < wmax * 0.92) return x;
  }
  return rear ? -2.1 : 2.1;
}
