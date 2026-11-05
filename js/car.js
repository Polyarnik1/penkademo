// Процедурная 3D-модель оригинального спорт-купе (без привязки к реальным маркам).
// Кузов — лофт по сечениям; стёкла, фары, фонари, решётка и номера — накладки, спроецированные на поверхность;
// колёса — токарные профили и экструзии. Шейдер краски показывает грязь, пену, блик полировки и зазоры панелей.
import * as THREE from 'three';
import { mergeGeometries } from './../vendor/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from './../vendor/addons/geometries/RoundedBoxGeometry.js';
import { applyFx, createFxUniforms } from './fx.js';
import { DIM, clamp, lerp, surfPoint, surfNormal, buildBodyGeometry, endX } from './body.js';
import { sidePatch, topPatch, facePatch } from './skin.js';
import * as TX from './textures.js';
export { DIM, surfPoint, surfNormal, applyFx, createFxUniforms };
export { studioEnvScene } from './env.js';

// ---------- Колесо ----------
function latheArc(points, segs) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  // v — по длине дуги профиля
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = cum[cum.length - 1];
  const uv = g.attributes.uv;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < points.length; j++) uv.setY(i * points.length + j, cum[j] / total);
  g.rotateX(Math.PI / 2);
  g.userData.arc = { cum, total };
  return g;
}
function lathe(points, segs = 96) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.rotateX(Math.PI / 2);
  return g;
}
function smoothProfile(pts, n) {
  const c = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getPoints(n).map((p) => [p.x, p.y]);
}
// равномерный цвет вершин; индексные геометрии приводим к неиндексным для слияния
function colored(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const RIM_FACE = [0.09, 0.095, 0.105], RIM_EDGE = [0.78, 0.8, 0.83];

function spokeGeo(off, K = 10) {
  const r0 = 0.062, r1 = 0.238;
  const sh = new THREE.Shape();
  const L = [], Rr = [];
  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const r = lerp(r0, r1, t);
    const ang = off * Math.pow(t, 1.5);
    const hw = lerp(0.019, 0.0112, Math.sin(t * Math.PI) * 0.55 + t * 0.35) + (t > 0.88 ? (t - 0.88) * 0.16 : 0);
    L.push([Math.cos(ang + hw / r) * r, Math.sin(ang + hw / r) * r]);
    Rr.push([Math.cos(ang - hw / r) * r, Math.sin(ang - hw / r) * r]);
  }
  sh.moveTo(L[0][0], L[0][1]);
  for (let k = 1; k <= K; k++) sh.lineTo(L[k][0], L[k][1]);
  for (let k = K; k >= 0; k--) sh.lineTo(Rr[k][0], Rr[k][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.0055, bevelSize: 0.0045, bevelSegments: 2, curveSegments: 2 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i));
    const t = clamp((r - r0) / (r1 - r0), 0, 1);
    p.setZ(i, p.getZ(i) + lerp(-0.03, 0.032, Math.pow(t, 0.8)));
  }
  g.computeVertexNormals();
  // машинная обработка кромок: грани, не смотрящие наружу, светлее
  const n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = n.getZ(i) > 0.72 ? RIM_FACE : RIM_EDGE;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildWheelParts(lowDetail) {
  const seg = lowDetail ? 56 : 92;
  const tireProf = smoothProfile([
    [0.2355, -0.112], [0.2455, -0.1215], [0.262, -0.1275], [0.29, -0.1285], [0.312, -0.1225], [0.3255, -0.108], [0.3305, -0.0915],
    [0.3318, -0.06], [0.3322, 0], [0.3318, 0.06], [0.3305, 0.0915], [0.3255, 0.108], [0.312, 0.1225], [0.29, 0.1285], [0.262, 0.1275], [0.2455, 0.1215], [0.2355, 0.112],
  ], lowDetail ? 16 : 24);
  const tire = latheArc(tireProf, seg);
  const { cum, total } = tire.userData.arc;
  let a = 0, b = tireProf.length - 1;
  for (let i = 0; i < tireProf.length; i++) { if (tireProf[i][1] >= -0.093) { a = i; break; } }
  for (let i = tireProf.length - 1; i >= 0; i--) { if (tireProf[i][1] <= 0.093) { b = i; break; } }
  tire.userData.tread = [cum[a] / total, cum[b] / total];

  const barrel = lathe([[0.2365, -0.116], [0.229, -0.094], [0.2225, -0.03], [0.2225, 0.03], [0.229, 0.07], [0.2365, 0.093]], seg);
  const lip = lathe([[0.2355, 0.082], [0.2425, 0.098], [0.2478, 0.108], [0.2498, 0.1145], [0.2468, 0.1205], [0.2405, 0.1222], [0.2345, 0.1185]], seg);

  const rim = [];
  for (let k = 0; k < 5; k++) for (const off of [-0.17, 0.17]) {
    const g = spokeGeo(off);
    g.rotateZ((k / 5) * Math.PI * 2);
    g.translate(0, 0, 0.066);
    rim.push(g);
  }
  const hubProf = smoothProfile([[0.0, 0.113], [0.03, 0.113], [0.038, 0.109], [0.058, 0.101], [0.074, 0.088], [0.078, 0.062], [0.066, 0.034]], 10);
  rim.push(colored(lathe(hubProf, 32), RIM_FACE));
  rim.push(colored(new THREE.TorusGeometry(0.0765, 0.0045, 6, 32).translate(0, 0, 0.088), RIM_EDGE));
  const rimG = mergeGeometries(rim);

  const chrome = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.CylinderGeometry(0.0105, 0.012, 0.022, 6);
    g.rotateX(Math.PI / 2);
    const ang = (k / 5) * Math.PI * 2 + 0.3;
    g.translate(Math.cos(ang) * 0.047, Math.sin(ang) * 0.047, 0.108);
    chrome.push(g.toNonIndexed());
  }
  chrome.push(new THREE.TorusGeometry(0.0205, 0.0022, 8, 40).translate(0, 0, 0.121).toNonIndexed());
  const valve = new THREE.CylinderGeometry(0.0045, 0.0055, 0.03, 10);
  valve.rotateX(Math.PI / 2); valve.translate(0.222, 0.0, 0.1);
  chrome.push(valve.toNonIndexed());
  const chromeG = mergeGeometries(chrome);

  const dark = [];
  const cap = new THREE.CylinderGeometry(0.0255, 0.028, 0.008, 40); cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.1175);
  dark.push(cap);
  const hat = new THREE.CylinderGeometry(0.105, 0.11, 0.06, 48); hat.rotateX(Math.PI / 2);
  dark.push(hat);
  // подвеска за диском: поворотный кулак, рычаг, рулевая тяга, стойка
  const knuckle = new RoundedBoxGeometry(0.07, 0.2, 0.06, 2, 0.015); knuckle.translate(0, 0.02, -0.095); dark.push(knuckle);
  const arm = new RoundedBoxGeometry(0.46, 0.035, 0.045, 2, 0.012); arm.translate(0.04, -0.12, -0.3); arm.rotateY(-0.28); dark.push(arm);
  const tie = new THREE.CylinderGeometry(0.011, 0.011, 0.4, 10); tie.rotateX(Math.PI / 2); tie.translate(-0.1, 0.01, -0.32); dark.push(tie);
  const strut = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 14); strut.translate(0.03, 0.2, -0.12); dark.push(strut);
  const darkG = mergeGeometries(dark.map((g) => g.index ? g.toNonIndexed() : g));

  const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.028, lowDetail ? 40 : 72, 1, false);
  disc.rotateX(Math.PI / 2); disc.translate(0, 0, -0.03);

  const cs = new THREE.Shape();
  const a0 = -0.62, a1 = 0.62, ro = 0.212, ri = 0.13;
  cs.absarc(0, 0, ro, a0, a1, false);
  cs.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
  cs.absarc(0, 0, ri, a1, a0, true);
  cs.closePath();
  const caliper = new THREE.ExtrudeGeometry(cs, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4, curveSegments: 20 });
  caliper.translate(0, 0, -0.066);

  return { tire, barrel, lip, rimG, chromeG, darkG, disc, caliper };
}

// ориентация объекта по поверхности: ось X вдоль машины, Z — по нормали
function placeOnSurface(mesh, x, s, off = 0, twist = 0) {
  const p = surfPoint(x, s), n = surfNormal(x, s);
  const tx = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
  const ty = new THREE.Vector3().crossVectors(n, tx).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tx, ty, n));
  if (twist) mesh.rotateZ(twist);
  mesh.position.copy(p).addScaledVector(n, off);
  return mesh;
}

// ---------- Сборка машины ----------
export function buildCar(opts = {}) {
  const U = opts.uniforms || createFxUniforms();
  const low = opts.detail === 'low';
  const paintColor = new THREE.Color(opts.paint ?? 0x1c2430);
  const accent = new THREE.Color(opts.accent ?? 0xf2a541);
  const boost = opts.lightBoost ?? 3;
  const root = new THREE.Group();
  root.name = 'car';

  const flake = TX.flakeNormalTex();
  flake.repeat.set(40, 18);

  const paintProps = () => ({
    color: paintColor.clone(), metalness: opts.metalness ?? 0.55, roughness: opts.roughness ?? 0.32,
    clearcoat: 1, clearcoatRoughness: 0.03, normalMap: flake, normalScale: new THREE.Vector2(0.1, 0.1),
    envMapIntensity: opts.envPaint ?? 1.15,
  });
  const M = {
    paint: applyFx(new THREE.MeshPhysicalMaterial(paintProps()), U, 'paint', { panels: true }),
    paintPart: applyFx(new THREE.MeshPhysicalMaterial(paintProps()), U, 'paint'),
    trim: applyFx(new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.15, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25 }), U, 'trim'),
    under: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.1 }),
    tire: applyFx(new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.78, metalness: 0 }), U, 'tire'),
    rim: applyFx(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.92, roughness: 0.26, clearcoat: 0.5, clearcoatRoughness: 0.12 }), U, 'rim'),
    lip: applyFx(new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 1, roughness: 0.14 }), U, 'rim'),
    barrel: applyFx(new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.8, roughness: 0.55 }), U, 'rim'),
    disc: applyFx(new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.4 }), U, 'rim'),
    caliper: applyFx(new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.1, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08 }), U, 'rim'),
    dark: applyFx(new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.7, metalness: 0.3 }), U, 'rim'),
  };
  M.disc.map = TX.discTex();

  // Кузов
  const body = new THREE.Mesh(buildBodyGeometry(low ? 'low' : 'high'), [M.paint, M.trim, M.under, M.under]);
  body.name = 'body';
  root.add(body);

  // ---- Накладки: стёкла ----
  const decalProps = { alphaTest: 0.5, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const glassMat = (tex) => applyFx(new THREE.MeshPhysicalMaterial({
    map: tex.map, roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1, color: 0xffffff,
    clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: opts.envGlass ?? 1.5, ...decalProps,
  }), U, 'glass');
  const sideT = TX.sideGlassTex(), windT = TX.windshieldTex(), backT = TX.backlightTex();
  const gm1 = glassMat(sideT), gm2 = glassMat(windT), gm3 = glassMat(backT);
  const decals = [];
  for (const sign of [1, -1]) {
    decals.push(new THREE.Mesh(sidePatch({ x0: sideT.x0, x1: sideT.x1, y0: sideT.y0, y1: sideT.y1, sign, nu: low ? 40 : 64, nv: low ? 8 : 14 }), gm1));
  }
  decals.push(new THREE.Mesh(topPatch({ x0: windT.x0, x1: windT.x1, z0: -0.84, z1: 0.84, nu: low ? 16 : 28, nv: low ? 36 : 64 }), gm2));
  decals.push(new THREE.Mesh(topPatch({ x0: backT.x0, x1: backT.x1, z0: -0.8, z1: 0.8, nu: low ? 14 : 22, nv: low ? 28 : 48 }), gm3));

  // ---- Накладки: свет ----
  const lightMat = (tex, k) => applyFx(new THREE.MeshPhysicalMaterial({
    map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: k,
    roughnessMap: tex.rm, metalnessMap: tex.rm, roughness: 1, metalness: 1, bumpMap: tex.bump || null, bumpScale: 1.2,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3, ...decalProps,
  }), U, 'glass');
  const headT = TX.headlightTex();
  const headM = lightMat(headT, boost * 1.1);
  for (const sgn of [1, -1]) {
    decals.push(new THREE.Mesh(facePatch({ z0: sgn * headT.z0, z1: sgn * headT.z1, y0: headT.y0, y1: headT.y1, nu: low ? 20 : 34, nv: low ? 8 : 14 }), headM));
  }
  const tailT = TX.taillightTex();
  const tailM = lightMat(tailT, boost * 0.95);
  decals.push(new THREE.Mesh(facePatch({ rear: true, z0: tailT.z0, z1: tailT.z1, y0: tailT.y0, y1: tailT.y1, nu: low ? 40 : 72, nv: low ? 6 : 10 }), tailM));

  // Решётка и номера
  const grT = TX.grilleTex();
  const grM = new THREE.MeshPhysicalMaterial({ map: grT.map, roughnessMap: grT.rm, metalnessMap: grT.rm, roughness: 1, metalness: 1, envMapIntensity: 1.0, ...decalProps });
  decals.push(new THREE.Mesh(facePatch({ z0: -0.46, z1: 0.46, y0: 0.262, y1: 0.462, nu: low ? 14 : 24, nv: low ? 6 : 10 }), grM));
  const plateM = new THREE.MeshStandardMaterial({ map: TX.plateTex(opts.plate || 'ГЛЯНЕЦ'), roughness: 0.4, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  decals.push(new THREE.Mesh(facePatch({ rear: true, z0: -0.26, z1: 0.26, y0: 0.5, y1: 0.612, nu: 12, nv: 5, off: 0.004 }), plateM));
  decals.forEach((d, i) => { d.renderOrder = 1; d.name = 'decal' + i; root.add(d); });

  // ---- Мелкие детали по поверхности ----
  const onSurf = (x, s, off) => surfPoint(x, s).add(surfNormal(x, s).multiplyScalar(off));
  const tube = (pts, radius, mat, seg = 12) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, radius, 6, false), mat);
    root.add(m); return m;
  };

  for (const z of [1, -1]) {
    const sOf = (sv) => (z > 0 ? sv : 20 - sv);
    // ручка двери
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.022, 0.014, 3, 0.0065), M.paintPart);
    placeOnSurface(h, -0.43, sOf(5.25), 0.0045, z > 0 ? 0.04 : -0.04);
    root.add(h);
    // зеркало: яйцевидный корпус со срезом сзади, внутри — зеркальный элемент
    const mirror = new THREE.Group();
    const hg = new THREE.SphereGeometry(0.1, low ? 16 : 24, low ? 10 : 14);
    hg.scale(0.62, 0.6, 1.08);
    { const p = hg.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, Math.max(p.getX(i), -0.034)); hg.computeVertexNormals(); }
    const housing = new THREE.Mesh(hg, M.paintPart);
    housing.position.set(0.0, 0.1, z * 0.14);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.0835, 24), M.chrome);
    face.scale.set(1, 0.58, 1); face.rotation.y = -Math.PI / 2; face.position.set(-0.0345, 0.1, z * 0.14);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0865, 0.0032, 5, 24), M.trim);
    ring.scale.set(1, 0.58, 1); ring.rotation.y = -Math.PI / 2; ring.position.copy(face.position);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.026, 0.12, 2, 0.01), M.trim);
    arm.position.set(0.005, 0.045, z * 0.055);
    mirror.add(housing, face, ring, arm);
    mirror.position.copy(onSurf(0.52, sOf(7.1), 0.0));
    root.add(mirror);
  }

  // Плавник антенны
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8), M.trim);
  fin.scale.set(1, 0.4, 0.26);
  fin.position.copy(surfPoint(-0.95, 10));
  root.add(fin);

  // Щётки стеклоочистителя
  tube([onSurf(0.69, 8.7, 0.012), onSurf(0.67, 9.4, 0.013), onSurf(0.66, 10.1, 0.012)], 0.0045, M.trim, 8);
  tube([onSurf(0.69, 10.5, 0.012), onSurf(0.67, 11.2, 0.013), onSurf(0.66, 11.9, 0.012)], 0.0045, M.trim, 8);

  // Сплиттер
  const carbon = TX.carbonTex(); carbon.repeat.set(8, 3);
  const carbonM = new THREE.MeshStandardMaterial({ map: carbon, color: 0x707070, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.5 });
  const spl = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.012, 1.46, 2, 0.005), carbonM);
  spl.position.set(2.08, 0.226, 0);
  root.add(spl);

  // Диффузор и патрубки
  for (let k = -3; k <= 3; k++) {
    const z = k * 0.12;
    const f = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.075, 0.008, 2, 0.003), M.dark);
    f.position.set(endX(0.31, z) + 0.19, 0.3, z);
    root.add(f);
  }
  for (const z of [-0.52, -0.4, 0.4, 0.52]) {
    const ex = endX(0.345, z);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.037, 0.12, 24, 1, true), M.chrome);
    tip.rotation.z = Math.PI / 2; tip.position.set(ex + 0.045, 0.345, z);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.037, 24), M.under);
    inner.rotation.y = -Math.PI / 2; inner.position.set(ex + 0.002, 0.345, z);
    const lipR = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.0035, 6, 24), M.chrome);
    lipR.rotation.y = Math.PI / 2; lipR.position.set(ex - 0.014, 0.345, z);
    root.add(tip, inner, lipR);
  }

  // Колёса
  const W = buildWheelParts(low);
  const [tv0, tv1] = W.tire.userData.tread;
  M.tire.bumpMap = TX.tireBumpTex(tv0, tv1);
  M.tire.bumpScale = 2.2;
  const wheels = [];
  for (const [ax, front] of [[DIM.axleF, true], [DIM.axleR, false]]) {
    for (const side of [1, -1]) {
      const wheel = new THREE.Group();
      const spin = new THREE.Group();
      spin.add(
        new THREE.Mesh(W.tire, M.tire), new THREE.Mesh(W.barrel, M.barrel), new THREE.Mesh(W.lip, M.lip),
        new THREE.Mesh(W.rimG, M.rim), new THREE.Mesh(W.chromeG, M.chrome), new THREE.Mesh(W.disc, M.disc),
      );
      const fixed = new THREE.Mesh(W.darkG, M.dark);
      const cal = new THREE.Mesh(W.caliper, M.caliper);
      cal.rotation.z = front ? Math.PI * 0.78 : Math.PI * 0.72;
      wheel.add(spin, fixed, cal);
      wheel.position.set(ax, DIM.wheelY, side * DIM.track);
      if (side < 0) { wheel.rotation.y = Math.PI; cal.rotation.z = Math.PI - cal.rotation.z; }
      root.add(wheel);
      wheels.push({ wheel, spin, front, side });
    }
  }

  // Контактная тень
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.8), new THREE.MeshBasicMaterial({ map: TX.shadowTex(), transparent: true, depthWrite: false, opacity: opts.shadowOpacity ?? 1 }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.003;
  root.add(sh);

  let roll = 0;
  const physical = [M.paint, M.paintPart, M.trim, M.rim, M.caliper, gm1, gm2, gm3, headM, tailM];
  physical.forEach((m) => { m.userData.cc = m.clearcoat; });
  return {
    root, body, wheels, materials: M, uniforms: U,
    setPaint(hex) { M.paint.color.set(hex); M.paintPart.color.set(hex); },
    setSteer(a) { for (const w of wheels) if (w.front) w.wheel.rotation.y = (w.side < 0 ? Math.PI : 0) + a; },
    roll(dist) {
      roll += dist / DIM.wheelR;
      for (const w of wheels) w.spin.rotation.z = w.side > 0 ? -roll : roll;
    },
    update(t) {
      U.uTime.value = t;
      root.updateWorldMatrix(true, false);
      U.uCarInv.value.copy(root.matrixWorld).invert();
    },
    // облегчённый режим без клир-коута (одним обращением к среде меньше на каждый пиксель)
    setClearcoat(on) { for (const m of physical) { m.clearcoat = on ? m.userData.cc : 0; m.needsUpdate = true; } },
  };
}
