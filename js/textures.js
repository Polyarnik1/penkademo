// Процедурные текстуры: стёкла и фары (накладки), шина, диск, решётка, номерной знак.
import * as THREE from 'three';
import { surfPoint, lerp, clamp, sstep, DIM } from './body.js';

export function canvasTex(w, h, draw, { srgb = false, aniso = 4, repeat = false, mip = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

const rgb = (r, g, b, a = 1) => `rgba(${r},${g},${b},${a})`;

// ---------- Лак ----------
export function flakeNormalTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const nx = (Math.random() - 0.5) * 70, ny = (Math.random() - 0.5) * 70;
      img.data[i * 4] = 128 + nx; img.data[i * 4 + 1] = 128 + ny; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
}

// ---------- Накладки: остекление ----------
// Холст рисуется в метрах: ppm пикселей на метр. toPx переводит координаты домена в пиксели.
function decalCanvas(wm, hm, ppm) {
  const w = Math.round(wm * ppm), h = Math.round(hm * ppm);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  return { w, h, color: mk(), rm: mk() };
}
function toTex(cv, srgb) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function poly(g, pts, close = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
}

// возвращает { map, rm } — цвет+альфа и (G — шероховатость, B — металл)
function paintGlass(dc, shapePx, { frame, tint = null, extra = null }) {
  const gc = dc.color.getContext('2d'), gr = dc.rm.getContext('2d');
  gr.fillStyle = rgb(0, 255 * 0.55, 0); gr.fillRect(0, 0, dc.w, dc.h);
  gc.clearRect(0, 0, dc.w, dc.h);
  // рамка (чёрный сатин)
  gc.lineJoin = 'round'; gr.lineJoin = 'round';
  gc.fillStyle = gc.strokeStyle = rgb(9, 10, 12); gc.lineWidth = frame;
  poly(gc, shapePx); gc.stroke(); gc.fill();
  gr.fillStyle = gr.strokeStyle = rgb(0, 255 * 0.5, 0); gr.lineWidth = frame;
  poly(gr, shapePx); gr.stroke(); gr.fill();
  // стекло
  const inset = shapePx;
  gc.fillStyle = rgb(4, 7, 11); poly(gc, inset); gc.fill();
  gr.fillStyle = rgb(0, 255 * 0.035, 0); poly(gr, inset); gr.fill();
  if (tint) tint(gc);
  if (extra) extra(gc, gr);
}

export function sideGlassTex() {
  // домен: x ∈ [-1.6, 0.8], y ∈ [0.84, 1.38]
  const x0 = -1.6, x1 = 0.8, y0 = 0.84, y1 = 1.38, ppm = 520;
  const dc = decalCanvas(x1 - x0, y1 - y0, ppm);
  const X = (x) => (x - x0) * ppm, Y = (y) => (y1 - y) * ppm;
  const rail = (x) => surfPoint(x, 8.0).y, belt = (x) => surfPoint(x, 7.0).y;
  const top = (x) => rail(x) - 0.026, bot = (x) => belt(x) + 0.022;
  const pts = [];
  const xf = 0.62, xt = -0.96, xr = -1.46;
  // нижняя кромка: от кормы к носу
  pts.push([X(xr), Y(bot(xr))]);
  for (let x = xr; x <= xf; x += 0.04) pts.push([X(x), Y(bot(x))]);
  // верхняя кромка: от носа к корме, там, где окно имеет высоту
  const upper = [];
  for (let x = xf; x >= xt; x -= 0.03) if (top(x) - bot(x) > 0.012) upper.push([X(x), Y(top(x))]);
  pts.push(...upper);
  pts.push([X(xr + 0.12), Y(bot(xr) + 0.14)]);
  paintGlass(dc, pts, {
    frame: 0.022 * ppm,
    extra: (gc, gr) => {
      // хромированный молдинг по линии пояса
      gc.strokeStyle = rgb(206, 211, 218); gc.lineWidth = 0.011 * ppm; gc.lineCap = 'round';
      gr.strokeStyle = rgb(0, 255 * 0.2, 255); gr.lineWidth = 0.011 * ppm; gr.lineCap = 'round';
      for (const g of [gc, gr]) {
        g.beginPath();
        for (let x = -1.56; x <= 0.56; x += 0.05) { const px = X(x), py = Y(belt(x) + 0.006); x === -1.56 ? g.moveTo(px, py) : g.lineTo(px, py); }
        g.stroke();
      }
    },
  });
  return { map: toTex(dc.color, true), rm: toTex(dc.rm, false), x0, x1, y0, y1 };
}

export function windshieldTex() {
  // домен: x ∈ [-0.02, 0.80], z ∈ [-0.95, 0.95]; u — x, v — z
  const x0 = -0.02, x1 = 0.8, z0 = -0.84, z1 = 0.84, ppm = 520;
  const dc = decalCanvas(x1 - x0, z1 - z0, ppm);
  const X = (x) => (x - x0) * ppm, Z = (z) => (z1 - z) * ppm;
  const hw = (x) => lerp(0.54, 0.78, sstep(0.07, 0.735, x));
  const pts = [];
  for (let x = 0.08; x <= 0.735; x += 0.03) pts.push([X(x), Z(hw(x))]);
  pts.push([X(0.735), Z(hw(0.735))]);
  pts.push([X(0.735), Z(-hw(0.735))]);
  for (let x = 0.735; x >= 0.08; x -= 0.03) pts.push([X(x), Z(-hw(x))]);
  paintGlass(dc, pts, {
    frame: 0.02 * ppm,
    tint: (gc) => {
      const grd = gc.createLinearGradient(X(0.08), 0, X(0.26), 0);
      grd.addColorStop(0, rgb(40, 110, 140, 0.55)); grd.addColorStop(1, rgb(40, 110, 140, 0));
      gc.fillStyle = grd; poly(gc, pts); gc.fill();
    },
  });
  return { map: toTex(dc.color, true), rm: toTex(dc.rm, false), x0, x1, z0, z1 };
}

export function backlightTex() {
  const x0 = -1.72, x1 = -0.85, z0 = -0.8, z1 = 0.8, ppm = 520;
  const dc = decalCanvas(x1 - x0, z1 - z0, ppm);
  const X = (x) => (x - x0) * ppm, Z = (z) => (z1 - z) * ppm;
  const hw = (x) => lerp(0.43, 0.7, sstep(-0.98, -1.62, x));
  const pts = [];
  for (let x = -0.99; x >= -1.63; x -= 0.03) pts.push([X(x), Z(hw(x))]);
  pts.push([X(-1.63), Z(hw(-1.63))]); pts.push([X(-1.63), Z(-hw(-1.63))]);
  for (let x = -1.63; x <= -0.99; x += 0.03) pts.push([X(x), Z(-hw(x))]);
  paintGlass(dc, pts, { frame: 0.02 * ppm });
  return { map: toTex(dc.color, true), rm: toTex(dc.rm, false), x0, x1, z0, z1 };
}

// ---------- Накладки: фары и фонари ----------
// Фара (левая): u — z от 0.28 до 0.82, v — y от 0.44 до 0.66
export function headlightTex(accentLed = [235, 245, 255]) {
  const z0 = 0.28, z1 = 0.82, y0 = 0.44, y1 = 0.66, ppm = 1500;
  const w = Math.round((z1 - z0) * ppm), h = Math.round((y1 - y0) * ppm);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const C = mk(), E = mk(), R = mk(), B = mk();
  const gc = C.getContext('2d'), ge = E.getContext('2d'), gr = R.getContext('2d'), gb = B.getContext('2d');
  const Zp = (z) => (z - z0) * ppm, Yp = (y) => (y1 - y) * ppm;
  // контур «клинка»: внутренний край тоньше
  const hi = (z) => lerp(0.51, 0.655, sstep(0.28, 0.80, z) ** 0.8);
  const lo = (z) => lerp(0.47, 0.455, sstep(0.28, 0.82, z));
  const shape = [];
  for (let z = 0.28; z <= 0.82; z += 0.02) shape.push([Zp(z), Yp(hi(z))]);
  for (let z = 0.82; z >= 0.28; z -= 0.02) shape.push([Zp(z), Yp(lo(z))]);
  gr.fillStyle = rgb(0, 60, 0); gr.fillRect(0, 0, w, h);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  gc.clearRect(0, 0, w, h);
  // корпус и хромированная кромка
  gc.lineJoin = 'round';
  gc.fillStyle = gc.strokeStyle = rgb(9, 11, 14); gc.lineWidth = 0.008 * ppm; poly(gc, shape); gc.stroke(); gc.fill();
  gr.fillStyle = gr.strokeStyle = rgb(0, 25, 90); gr.lineWidth = 0.008 * ppm; poly(gr, shape); gr.stroke(); gr.fill();
  // тёмная внутренняя область с градиентом
  const grd = gc.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, rgb(22, 28, 36)); grd.addColorStop(1, rgb(6, 8, 11));
  gc.fillStyle = grd; poly(gc, shape); gc.fill();
  // рефлектор: тонкие ступени
  gc.save(); poly(gc, shape); gc.clip();
  gc.strokeStyle = rgb(90, 100, 112, 0.35); gc.lineWidth = 1.5;
  for (let z = 0.3; z < 0.82; z += 0.018) { gc.beginPath(); gc.moveTo(Zp(z), Yp(hi(z))); gc.lineTo(Zp(z + 0.01), Yp(lo(z + 0.01))); gc.stroke(); }
  gc.restore();
  // проекторы
  const proj = [[0.60, 0.545, 0.024], [0.71, 0.55, 0.026]];
  for (const [pz, py, r] of proj) {
    const cx = Zp(pz), cy = Yp(py), R_ = r * ppm;
    const ring = gc.createRadialGradient(cx, cy, R_ * 0.6, cx, cy, R_ * 1.18);
    ring.addColorStop(0, rgb(30, 34, 40)); ring.addColorStop(0.7, rgb(190, 196, 204)); ring.addColorStop(1, rgb(40, 44, 50));
    gc.fillStyle = ring; gc.beginPath(); gc.arc(cx, cy, R_ * 1.18, 0, 7); gc.fill();
    const lens = gc.createRadialGradient(cx - R_ * 0.3, cy - R_ * 0.3, 1, cx, cy, R_);
    lens.addColorStop(0, rgb(120, 160, 190)); lens.addColorStop(0.35, rgb(14, 28, 40)); lens.addColorStop(1, rgb(2, 4, 7));
    gc.fillStyle = lens; gc.beginPath(); gc.arc(cx, cy, R_, 0, 7); gc.fill();
    gr.fillStyle = rgb(0, 20, 255); gr.beginPath(); gr.arc(cx, cy, R_ * 1.18, 0, 7); gr.fill();
    gr.fillStyle = rgb(0, 6, 0); gr.beginPath(); gr.arc(cx, cy, R_, 0, 7); gr.fill();
    ge.fillStyle = rgb(180, 210, 255); gr; ge.beginPath(); ge.arc(cx, cy, R_ * 0.36, 0, 7); ge.fill();
    gb.fillStyle = '#e0e0e0'; gb.beginPath(); gb.arc(cx, cy, R_ * 1.2, 0, 7); gb.fill();
    gb.fillStyle = '#404040'; gb.beginPath(); gb.arc(cx, cy, R_, 0, 7); gb.fill();
  }
  // ДХО — светящаяся линия вдоль верхней кромки
  ge.lineCap = 'round'; gc.lineCap = 'round';
  const [lr, lg, lb] = accentLed;
  ge.strokeStyle = rgb(lr, lg, lb); ge.lineWidth = 0.0065 * ppm;
  gc.strokeStyle = rgb(lr, lg, lb); gc.lineWidth = 0.0065 * ppm;
  ge.beginPath(); gc.beginPath();
  for (let z = 0.31; z <= 0.8; z += 0.02) { const px = Zp(z), py = Yp(hi(z) - 0.0085); z === 0.31 ? (ge.moveTo(px, py), gc.moveTo(px, py)) : (ge.lineTo(px, py), gc.lineTo(px, py)); }
  ge.stroke(); gc.stroke();
  // вторая, более короткая линия
  ge.strokeStyle = rgb(lr * 0.7, lg * 0.7, lb * 0.7); ge.lineWidth = 0.004 * ppm;
  ge.beginPath();
  for (let z = 0.44; z <= 0.8; z += 0.02) { const px = Zp(z), py = Yp(hi(z) - 0.021); z === 0.44 ? ge.moveTo(px, py) : ge.lineTo(px, py); }
  ge.stroke();
  // светодиодная матрица внизу
  for (let i = 0; i < 9; i++) {
    const z = 0.33 + i * 0.045, y = lo(z) + 0.016;
    ge.fillStyle = rgb(120, 150, 200); ge.beginPath(); ge.arc(Zp(z), Yp(y), 0.0035 * ppm, 0, 7); ge.fill();
    gc.fillStyle = rgb(110, 130, 160); gc.beginPath(); gc.arc(Zp(z), Yp(y), 0.0035 * ppm, 0, 7); gc.fill();
  }
  // указатель поворота: янтарные сегменты у внешнего края
  for (let i = 0; i < 5; i++) {
    const z = 0.735 + i * 0.016, y = lo(z) + 0.034;
    gc.fillStyle = rgb(190, 90, 10); gc.fillRect(Zp(z), Yp(y) - 0.0035 * ppm, 0.011 * ppm, 0.007 * ppm);
  }
  return {
    map: toTex(C, true), emissive: toTex(E, true), rm: toTex(R, false), bump: toTex(B, false),
    z0, z1, y0, y1,
  };
}

// Задний фонарь во всю ширину: u — z от −0.86 до 0.86, v — y от 0.70 до 0.89
export function taillightTex() {
  const z0 = -0.86, z1 = 0.86, y0 = 0.7, y1 = 0.89, ppm = 900;
  const w = Math.round((z1 - z0) * ppm), h = Math.round((y1 - y0) * ppm);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const C = mk(), E = mk(), R = mk();
  const gc = C.getContext('2d'), ge = E.getContext('2d'), gr = R.getContext('2d');
  const Zp = (z) => (z - z0) * ppm, Yp = (y) => (y1 - y) * ppm;
  gr.fillStyle = rgb(0, 60, 0); gr.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  gc.clearRect(0, 0, w, h);
  const hi = (z) => 0.875 - 0.02 * sstep(0.12, 0.84, Math.abs(z));
  const lo = (z) => lerp(0.8, 0.735, sstep(0.14, 0.84, Math.abs(z)));
  const shape = [];
  for (let z = z0; z <= z1 + 1e-6; z += 0.02) shape.push([Zp(z), Yp(hi(z))]);
  for (let z = z1; z >= z0 - 1e-6; z -= 0.02) shape.push([Zp(z), Yp(lo(z))]);
  gc.lineJoin = 'round';
  const grd = gc.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, rgb(72, 6, 10)); grd.addColorStop(1, rgb(34, 3, 6));
  gc.fillStyle = gc.strokeStyle = grd; gc.lineWidth = 0.006 * ppm; poly(gc, shape); gc.stroke(); gc.fill();
  gr.fillStyle = gr.strokeStyle = rgb(0, 14, 0); gr.lineWidth = 0.006 * ppm; poly(gr, shape); gr.stroke(); gr.fill();
  // светодиодные полосы
  const bar = (zs, ze, off, wd, k) => {
    for (const [g, col] of [[ge, rgb(255 * k, 24 * k, 18 * k)], [gc, rgb(255 * k, 40 * k, 30 * k)]]) {
      g.strokeStyle = col; g.lineWidth = wd * ppm; g.lineCap = 'round'; g.beginPath();
      for (let z = zs; z <= ze + 1e-6; z += 0.02) { const px = Zp(z), py = Yp(hi(z) - off); z === zs ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.stroke();
    }
  };
  for (const sgn of [-1, 1]) {
    const a = sgn > 0 ? 0.1 : -0.84, b = sgn > 0 ? 0.84 : -0.1;
    bar(a, b, 0.012, 0.0075, 1);
    bar(sgn > 0 ? 0.3 : -0.84, sgn > 0 ? 0.84 : -0.3, 0.03, 0.0045, 0.65);
  }
  // центральная связка
  bar(-0.1, 0.1, 0.012, 0.0055, 0.55);
  // вертикальные элементы-«зубцы» внутри клинка
  for (let i = 0; i < 9; i++) for (const sgn of [-1, 1]) {
    const z = sgn * (0.34 + i * 0.058);
    const ya = lo(z) + 0.018, yb = Math.min(hi(z) - 0.045, ya + 0.032);
    for (const [g, col] of [[ge, rgb(150, 14, 10)], [gc, rgb(160, 24, 18)]]) {
      g.strokeStyle = col; g.lineWidth = 0.0032 * ppm; g.lineCap = 'round';
      g.beginPath(); g.moveTo(Zp(z), Yp(ya)); g.lineTo(Zp(z), Yp(yb)); g.stroke();
    }
  }
  return { map: toTex(C, true), emissive: toTex(E, true), rm: toTex(R, false), z0, z1, y0, y1 };
}

// ---------- Решётка / карбон / номер ----------
export function grilleTex() {
  // решётка (z ±0.42, y 0.27..0.47): тёмные соты и хромированная рамка
  const w = 768, h = 360;
  const C = document.createElement('canvas'); C.width = w; C.height = h;
  const R = document.createElement('canvas'); R.width = w; R.height = h;
  const g = C.getContext('2d'), gr = R.getContext('2d');
  gr.fillStyle = rgb(0, 100, 150); gr.fillRect(0, 0, w, h);
  const rr = (ctx, x, y, ww, hh, r) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); };
  g.clearRect(0, 0, w, h);
  g.fillStyle = rgb(20, 21, 24); rr(g, 2, 2, w - 4, h - 4, 70); g.fill();
  g.strokeStyle = rgb(170, 176, 184); g.lineWidth = 7; rr(g, 6, 6, w - 12, h - 12, 66); g.stroke();
  gr.strokeStyle = rgb(0, 40, 255); gr.lineWidth = 7; rr(gr, 6, 6, w - 12, h - 12, 66); gr.stroke();
  // соты
  g.save(); rr(g, 14, 14, w - 28, h - 28, 58); g.clip();
  const r = 17;
  for (let row = 0; row * r * 1.5 < h + r; row++) for (let col = 0; col * r * 1.74 < w + r; col++) {
    const cx = col * r * 1.74 + (row % 2 ? r * 0.87 : 0), cy = row * r * 1.5;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (r - 2.2), cy + Math.sin(a) * (r - 2.2)); }
    g.closePath(); g.fillStyle = rgb(7, 8, 10); g.fill();
    g.strokeStyle = rgb(118, 124, 134); g.lineWidth = 2.6; g.stroke();
  }
  g.restore();
  return { map: toTex(C, true), rm: toTex(R, false) };
}

export function carbonTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, w, h);
    const s = 16;
    for (let j = 0; j < h / s; j++) for (let i = 0; i < w / s; i++) {
      const horiz = (i + j) % 2 === 0;
      const grd = horiz ? g.createLinearGradient(i * s, 0, i * s + s, 0) : g.createLinearGradient(0, j * s, 0, j * s + s);
      grd.addColorStop(0, 'rgba(255,255,255,0.02)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.2)'); grd.addColorStop(1, 'rgba(255,255,255,0.02)');
      g.fillStyle = grd; g.fillRect(i * s, j * s, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.strokeRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
    }
  }, { srgb: true, repeat: true, aniso: 8 });
}

export function plateTex(text = 'ГЛЯНЕЦ') {
  return canvasTex(1040, 224, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill();
    g.strokeStyle = '#16181c'; g.lineWidth = 8; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 16); g.stroke();
    g.fillStyle = '#16181c'; g.font = '700 118px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  }, { srgb: true, aniso: 8 });
}

// ---------- Колесо ----------
export function discTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grd.addColorStop(0, '#2c2c2e'); grd.addColorStop(0.56, '#2c2c2e'); grd.addColorStop(0.57, '#a2a5a9'); grd.addColorStop(1, '#868a90');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    for (let r = w * 0.29; r < w * 0.5; r += 2.4) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#121214';
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      for (const rr of [0.33, 0.395, 0.46]) {
        const ao = a + (rr === 0.395 ? Math.PI / 40 : 0);
        g.beginPath(); g.arc(cx + Math.cos(ao) * w * rr, cy + Math.sin(ao) * w * rr, 4.4, 0, Math.PI * 2); g.fill();
      }
    }
    // тормозная пыль у кромки
    const dust = g.createRadialGradient(cx, cy, w * 0.44, cx, cy, w * 0.5);
    dust.addColorStop(0, 'rgba(60,50,40,0)'); dust.addColorStop(1, 'rgba(60,50,40,.35)');
    g.fillStyle = dust; g.fillRect(0, 0, w, h);
  }, { srgb: true, aniso: 8 });
}

// Бамп шины: окружность по u (2048 px), профиль по v (512 px); treadV0/1 — границы протектора
export function tireBumpTex(treadV0, treadV1, label = 'ROADMASTER SPORT 245/40 R19 98Y TUBELESS') {
  return canvasTex(2048, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    // микрошероховатость резины
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) { const n = (Math.random() - 0.5) * 16; img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n; }
    g.putImageData(img, 0, 0);
    const y0 = treadV0 * h, y1 = treadV1 * h, th = y1 - y0;
    // протектор слегка выше
    g.fillStyle = '#9a9a9a'; g.fillRect(0, y0, w, th);
    // продольные канавки
    g.fillStyle = '#161616';
    for (const f of [0.2, 0.4, 0.6, 0.8]) g.fillRect(0, y0 + th * f - 5, w, 10);
    // поперечные канавки блоков
    g.strokeStyle = '#1b1b1b'; g.lineCap = 'round';
    const step = 28;
    for (let x = 0; x < w; x += step) {
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x + 18, y0 + th * 0.2); g.stroke();
      g.beginPath(); g.moveTo(x + 6, y1 - 2); g.lineTo(x - 12, y0 + th * 0.8); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(x + 4, y0 + th * 0.4); g.lineTo(x + 12, y0 + th * 0.6); g.stroke();
      g.beginPath(); g.moveTo(x + 16, y0 + th * 0.2); g.lineTo(x + 8, y0 + th * 0.4); g.stroke();
      g.beginPath(); g.moveTo(x + 10, y0 + th * 0.6); g.lineTo(x + 2, y0 + th * 0.8); g.stroke();
      // тонкие ламели
      g.lineWidth = 2; g.strokeStyle = '#222';
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) { g.beginPath(); g.moveTo(x + 5, y0 + th * f); g.lineTo(x + 14, y0 + th * (f + 0.05)); g.stroke(); }
      g.strokeStyle = '#1b1b1b';
    }
    // боковина: два ряда рельефных надписей и защитный буртик у диска
    g.fillStyle = '#b8b8b8';
    g.font = '600 34px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle';
    const tv1 = y0 - (y0) * 0.42, tv2 = y1 + (h - y1) * 0.42;
    const draw = (txt, y, x0) => { g.save(); g.translate(x0, y); g.fillText(txt, 0, 0); g.restore(); };
    for (let k = 0; k < 2; k++) {
      draw(label, tv1, 60 + k * 1024);
      draw('DOT 4C 3H · MADE IN EU · MAX LOAD 750 kg', tv2, 260 + k * 1024);
    }
    // ребро защиты диска
    g.fillStyle = '#b0b0b0'; g.fillRect(0, h * 0.045, w, 7); g.fillRect(0, h * 0.955 - 7, w, 7);
    // «рёбра» боковины
    g.fillStyle = '#929292';
    for (let x = 0; x < w; x += 12) { g.fillRect(x, y0 * 0.38, 4, y0 * 0.18); g.fillRect(x, y1 + (h - y1) * 0.44, 4, (h - y1) * 0.18); }
  }, { aniso: 8, repeat: true });
}

export function shadowTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const blob = (x, y, rx, ry, a) => {
      g.save(); g.translate(x, y); g.scale(rx, ry);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(0.6, `rgba(0,0,0,${a * 0.35})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
    };
    blob(w / 2, h / 2, w * 0.47, h * 0.45, 0.5);
    blob(w / 2, h / 2, w * 0.4, h * 0.34, 0.55);
    blob(w / 2, h / 2, w * 0.33, h * 0.25, 0.4);
    const ax = (x) => w / 2 + (x / 5.6) * w;
    for (const x of [DIM.axleF, DIM.axleR]) for (const z of [-1, 1]) blob(ax(x), h / 2 + z * h * 0.29, w * 0.05, h * 0.09, 0.9);
  });
}
