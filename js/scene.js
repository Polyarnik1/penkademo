// 3D-сцена «ПЕНКА»: грязная машина и моечная рамка со щётками.
// Ползунок (или автодемо) двигает рамку: за ней кузов становится чистым.
import * as THREE from 'three';
import { Quality, detectDevice, startTier } from './quality.js';
import { buildCar, studioEnvScene, DIM } from './car.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function brushTex() {
  // Ворс: синий с тонкими продольными прожилками и жёлтыми кольцами по краям — без контрастных полос, чтобы не рябило
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2b4dff'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const l = Math.random();
    g.fillStyle = l > 0.5 ? `rgba(150,175,255,${0.08 + Math.random() * 0.14})` : `rgba(10,25,130,${0.1 + Math.random() * 0.2})`;
    g.fillRect(Math.random() * 128, 0, 1 + Math.random() * 2, 128);
  }
  g.fillStyle = '#ffcf33'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 10, 128, 3); g.fillRect(0, 115, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Щётка: ядро + множество полос-ворсин вокруг
function makeBrush(length, radius, tex, n = 26) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, length + 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xdfe5ef, metalness: 0.8, roughness: 0.3 }));
  g.add(core);
  const blades = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(radius, length, 1, 1), mat);
    const a = (i / n) * Math.PI * 2;
    p.position.set(Math.cos(a) * radius / 2, 0, Math.sin(a) * radius / 2);
    p.rotation.y = -a;
    // слегка закручиваем
    p.rotation.x = 0.06;
    blades.add(p);
  }
  g.add(blades);
  g.userData.blades = blades;
  return g;
}

// Уровни качества: 0 — максимум, 4 — самый лёгкий
const TIERS = [
  { dpr: 2.0, water: 1100, cc: true },
  { dpr: 1.6, water: 700, cc: true },
  { dpr: 1.5, water: 450, cc: false },
  { dpr: 1.25, water: 300, cc: false },
  { dpr: 1.0, water: 200, cc: false },
];

export function initScene({ canvas, reduced }) {
  const dev = detectDevice();
  let tier = startTier(dev);
  let cfg = TIERS[tier];
  let renderer;
  // Если устройство не потянуло «красивые» настройки контекста — пробуем самые простые
  const ctxOpts = [
    { antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false },
    { antialias: false, alpha: true, stencil: false },
    { alpha: true },
  ];
  for (const o of ctxOpts) {
    try { renderer = new THREE.WebGLRenderer({ canvas, ...o }); break; } catch (e) { renderer = null; }
  }
  if (!renderer) return null;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvScene({ dark: false }), 0.02).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  const car = buildCar({ paint: 0xf3f5f8, accent: 0x2448ff, metalness: 0.2, roughness: 0.24, envPaint: 1.0, envGlass: 1.1, rimColor: 0xb9c0c8, leather: 0x1a2240, detail: tier >= 2 ? 'low' : 'high', lightBoost: 1.6, shadowOpacity: 0.9, plate: 'ПЕНКА' });
  scene.add(car.root);
  const U = car.uniforms;
  U.uDirt.value = 1;
  U.uFoamBand.value = 1;
  U.uClean.value = -4;
  U.uCleanDir.value = -1;

  // Пол моечного поста
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#1d3be0'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const fade = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.6, '#999'); grd.addColorStop(1, '#000');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ map: floorTex, alphaMap: fade, transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001;
  scene.add(floor);
  // направляющие колёс
  for (const z of [-DIM.track - 0.32, DIM.track + 0.32]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: 0xffcf33, roughness: 0.4 }));
    rail.position.set(0, 0.025, z); scene.add(rail);
  }

  // Моечная рамка
  const gantry = new THREE.Group();
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, clearcoat: 1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xffcf33, roughness: 0.4 });
  const postGeo = new THREE.BoxGeometry(0.22, 2.3, 0.22);
  for (const z of [-1.55, 1.55]) {
    const post = new THREE.Mesh(postGeo, frameMat); post.position.set(0, 1.15, z); gantry.add(post);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.24), accentMat); band.position.set(0, 0.35, z); gantry.add(band);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 3.34), frameMat); beam.position.set(0, 2.3, 0); gantry.add(beam);
  const beamStripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 3.35), accentMat); beamStripe.position.set(0, 2.2, 0); gantry.add(beamStripe);
  // форсунки
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x222831, metalness: 0.6, roughness: 0.3 });
  for (let i = -6; i <= 6; i++) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8), nozzleMat); n.position.set(0, 2.13, i * 0.22); gantry.add(n); }
  const tex = brushTex();
  const sideBrushes = [];
  for (const z of [-1.18, 1.18]) {
    const b = makeBrush(1.5, 0.52, tex, tier >= 2 ? 18 : 26); b.position.set(0, 0.85, z); gantry.add(b); sideBrushes.push(b);
  }
  const topBrush = makeBrush(2.2, 0.5, tex, tier >= 2 ? 18 : 26); topBrush.rotation.x = Math.PI / 2; topBrush.position.set(0, 1.72, 0); gantry.add(topBrush);
  scene.add(gantry);

  // Струи воды
  const N = 1100;
  const wp = new Float32Array(N * 3), wv = new Float32Array(N * 3), wl = new Float32Array(N);
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  wGeo.setAttribute('life', new THREE.BufferAttribute(wl, 1));
  const wMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPx: { value: 1 }, uOn: { value: 0 } },
    vertexShader: `attribute float life; uniform float uPx; varying float vL;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = (3.0 + life * 5.0) * uPx * (5.0 / -mv.z); vL = life; }`,
    fragmentShader: `uniform float uOn; varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(0.88, 0.95, 1.0, smoothstep(0.5, 0.15, d) * vL * 0.75 * uOn); }`,
  });
  wGeo.setDrawRange(0, cfg.water);
  const water = new THREE.Points(wGeo, wMat);
  water.frustumCulled = false;
  scene.add(water);
  function spawn(i, gx) {
    const z = (Math.random() - 0.5) * 2.9;
    wp[i * 3] = gx + (Math.random() - 0.5) * 0.06; wp[i * 3 + 1] = 2.1; wp[i * 3 + 2] = z;
    wv[i * 3] = (Math.random() - 0.5) * 0.6; wv[i * 3 + 1] = -2.5 - Math.random() * 2; wv[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    wl[i] = 0.4 + Math.random() * 0.6;
  }
  for (let i = 0; i < N; i++) { spawn(i, -3.4); wl[i] = Math.random(); }

  let W = 1, H = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cfg.dpr));
    renderer.setSize(W, H, false);
    wMat.uniforms.uPx.value = renderer.getPixelRatio();
    camera.aspect = W / H;
    camera.fov = W / H < 1 ? 42 : 30;
    camera.updateProjectionMatrix();
  }

  // Параллакс от указателя
  let px = 0, py = 0, tx = 0, ty = 0;
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });

  // Положение рамки: 0 — перед машиной, 1 — позади
  let target = 0, pos = 0, auto = null;
  const gx = (p) => lerp(-3.4, 4.9, p);

  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(canvas);
  let time = 0, brushSpin = 0, last = 0, started = false, frameNo = 0;
  const quality = new Quality({ tier, onChange: (t) => { tier = t; cfg = TIERS[t]; wGeo.setDrawRange(0, cfg.water); car.setClearcoat(cfg.cc); resize(); } });
  const camBase = new THREE.Vector3(6.3, 2.5, 7.4);
  const look = new THREE.Vector3(0, 0.62, 0);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dtMs = last ? now - last : 16.7;
    last = now;
    quality.tick(dtMs);
    frameNo++;
    if (tier === 4 && (frameNo & 1)) return;
    const dt = Math.min(dtMs / 1000, 0.05) * (tier === 4 ? 2 : 1);
    time += dt;
    if (auto) {
      auto.t += dt / auto.dur;
      const k = clamp(auto.t, 0, 1);
      target = lerp(auto.from, auto.to, k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      auto.onTick && auto.onTick(target);
      if (k >= 1) { const done = auto.done; auto = null; done && done(); }
    }
    const prev = pos;
    pos += (target - pos) * (reduced ? 1 : 1 - Math.pow(0.002, dt));
    const speed = Math.abs(pos - prev) / Math.max(dt, 1e-3);
    const x = gx(pos);
    gantry.position.x = x;
    U.uClean.value = x;
    // щётки крутятся, пока рамка рядом с машиной
    const near = clamp(1 - (Math.abs(x) - 2.3) / 0.8, 0, 1);
    const active = clamp(near * (0.35 + speed * 2.5), 0, 1);
    brushSpin += dt * (2 + active * 18);
    sideBrushes[0].rotation.y = brushSpin; sideBrushes[1].rotation.y = -brushSpin;
    topBrush.rotation.y = brushSpin * 0.8;
    // струи
    wMat.uniforms.uOn.value += ((near > 0.05 ? 1 : 0.25) - wMat.uniforms.uOn.value) * Math.min(1, dt * 4);
    const NW = cfg.water;
    for (let i = 0; i < NW; i++) {
      wl[i] -= dt * 1.1;
      wv[i * 3 + 1] -= 9.8 * dt;
      wp[i * 3] += wv[i * 3] * dt; wp[i * 3 + 1] += wv[i * 3 + 1] * dt; wp[i * 3 + 2] += wv[i * 3 + 2] * dt;
      if (wp[i * 3 + 1] < 0.02 || wl[i] <= 0) spawn(i, x);
    }
    wGeo.attributes.position.needsUpdate = true; wGeo.attributes.life.needsUpdate = true;
    // камера
    px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3);
    const asp = W / H;
    const k = asp < 1 ? Math.pow(1 / asp, 0.6) * 1.05 : 1;
    camera.position.set(camBase.x * k + px * 0.6, camBase.y * k - py * 0.35, camBase.z * k - px * 0.9);
    camera.lookAt(look);
    car.update(time);
    renderer.render(scene, camera);
  }
  car.setClearcoat(cfg.cc);
  resize();
  addEventListener('resize', resize);
  // Размер холста следим не только по resize окна: на телефоне блок меняется при прокрутке адресной строки и подгрузке шрифтов
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(canvas);
  // Если шейдер грязи/пены не скомпилировался на видеокарте, машина не должна исчезать: переключаем кузов на обычные материалы
  let safeMode = false;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    console.error('Shader error, switching car to plain materials');
    if (safeMode) return;
    safeMode = true;
    scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => {
        if (!m.onBeforeCompile || m.isShaderMaterial) return;
        m.onBeforeCompile = () => {};
        m.customProgramCacheKey = () => 'plain';
        if (m.clearcoat !== undefined) m.clearcoat = 0;
        m.needsUpdate = true;
      });
    });
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.documentElement.classList.add('no-gl'); });
  canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
  const go = () => { if (started) return; started = true; requestAnimationFrame(frame); };
  try { renderer.compileAsync(scene, camera).then(go, go); } catch { go(); }
  setTimeout(go, 3000);
  window.__perfInfo = () => ({ tier, dpr: renderer.getPixelRatio(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ema: Math.round(quality.ema * 10) / 10 });

  return {
    set(p) { auto = null; target = clamp(p, 0, 1); },
    play(from, to, dur, onTick, done) { auto = { from, to, dur, t: 0, onTick, done }; },
    get value() { return target; },
  };
}
