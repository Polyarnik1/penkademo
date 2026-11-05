// Бесшовный 3D-шум, запечённый в RGBA8-текстуру.
// R — fbm (3 октавы), G — другой fbm, B — ячейки Вороного (расстояние до ближайшей точки), A — одна октава value-noise.
// Период — 8 ячеек на размер текстуры: шейдер берёт texture(uNoise, p * 0.125).

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function lattice(L, seed) {
  const r = rng(seed), a = new Float32Array(L * L * L);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

// value-noise на периодической решётке L³, координаты в ячейках
function valueAt(g, L, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const x0 = ((xi % L) + L) % L, y0 = ((yi % L) + L) % L, z0 = ((zi % L) + L) % L;
  const x1 = (x0 + 1) % L, y1 = (y0 + 1) % L, z1 = (z0 + 1) % L;
  const L2 = L * L;
  const i000 = z0 * L2 + y0 * L + x0, i100 = z0 * L2 + y0 * L + x1, i010 = z0 * L2 + y1 * L + x0, i110 = z0 * L2 + y1 * L + x1;
  const i001 = z1 * L2 + y0 * L + x0, i101 = z1 * L2 + y0 * L + x1, i011 = z1 * L2 + y1 * L + x0, i111 = z1 * L2 + y1 * L + x1;
  const a = g[i000] + (g[i100] - g[i000]) * fx, b = g[i010] + (g[i110] - g[i010]) * fx;
  const c = g[i001] + (g[i101] - g[i001]) * fx, d = g[i011] + (g[i111] - g[i011]) * fx;
  const e = a + (b - a) * fy, f = c + (d - c) * fy;
  return e + (f - e) * fz;
}

export function bakeNoise(N = 48) {
  const out = new Uint8Array(N * N * N * 4);
  const L = [8, 16, 32];
  const gR = L.map((l, i) => lattice(l, 11 + i)), gG = L.map((l, i) => lattice(l, 71 + i));
  const gA = lattice(8, 5);
  // точки Вороного: по одной на ячейку 8³
  const r = rng(99), P = new Float32Array(8 * 8 * 8 * 3);
  for (let i = 0; i < P.length; i++) P[i] = r();
  const W = [0.57, 0.29, 0.14];
  let o = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i / N) * 8, v = (j / N) * 8, w = (k / N) * 8;
    let R = 0, G = 0;
    for (let q = 0; q < 3; q++) {
      const m = L[q] / 8;
      R += W[q] * valueAt(gR[q], L[q], u * m, v * m, w * m);
      G += W[q] * valueAt(gG[q], L[q], u * m, v * m, w * m);
    }
    const A = valueAt(gA, 8, u, v, w);
    // Вороной F1
    const cx = Math.floor(u), cy = Math.floor(v), cz = Math.floor(w);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, gz = cz + dz;
      const px = ((gx % 8) + 8) % 8, py = ((gy % 8) + 8) % 8, pz = ((gz % 8) + 8) % 8;
      const pi = (pz * 64 + py * 8 + px) * 3;
      const ex = gx + P[pi] - u, ey = gy + P[pi + 1] - v, ez = gz + P[pi + 2] - w;
      const d = ex * ex + ey * ey + ez * ez;
      if (d < best) best = d;
    }
    const B = Math.min(1, Math.sqrt(best));
    // fbm сжимается к середине — растягиваем контраст
    const st = (x) => Math.max(0, Math.min(1, (x - 0.5) * 1.55 + 0.5));
    out[o++] = Math.round(st(R) * 255); out[o++] = Math.round(st(G) * 255); out[o++] = Math.round(B * 255); out[o++] = Math.round(A * 255);
  }
  return out;
}
