// Студийное окружение для отражений: софтбоксы с мягкими краями, длинные потолочные полосы, тёмный или светлый зал.
import * as THREE from 'three';

let _soft = null;
function softTex() {
  if (_soft) return _soft;
  const n = 128, d = new Uint8Array(n * n * 4);
  const f = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / (n - 1), v = y / (n - 1);
    const a = f(Math.min(u, 1 - u) / 0.22) * f(Math.min(v, 1 - v) / 0.22);
    const i = (y * n + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.round(255 * (0.25 + 0.75 * a) * a); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.needsUpdate = true; t.magFilter = t.minFilter = THREE.LinearFilter;
  return (_soft = t);
}

export function studioEnvScene({ dark = true, warm = 0xffb35c, cool = 0xbfe6ff } = {}) {
  const s = new THREE.Scene();
  // купол с градиентом: зенит темнее, у горизонта чуть светлее
  const top = new THREE.Color(dark ? 0x04060a : 0xcfd8e6), hor = new THREE.Color(dark ? 0x131a22 : 0xf2f5fa), bot = new THREE.Color(dark ? 0x07090d : 0xaab6c8);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: top }, hor: { value: hor }, bot: { value: bot } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, hor, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, bot, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
  }));
  s.add(dome);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: softTex(), color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...(look || [0, 0.5, 0])); s.add(m); return m;
  };
  const K = dark ? 1 : 0.55;
  // потолок: большой мягкий свет и две длинные полосы вдоль машины
  panel(10, 6, 0xffffff, dark ? 1.6 : 3.4, [0, 8, 0]);
  for (const z of [-1.9, 1.9]) panel(15, 0.8, 0xffffff, dark ? 9 : 6, [0, 6.4, z]);
  panel(15, 0.5, 0xffffff, dark ? 12 : 7, [0, 6.6, 0]);
  // боковые вертикальные софтбоксы
  panel(1.5, 4.6, 0xffffff, dark ? 5.5 : 4, [-5.5, 2.4, 7.2]);
  panel(1.5, 4.6, 0xffffff, dark ? 3.2 : 3.5, [6.2, 2.4, -7.0]);
  panel(9, 2.4, 0xffffff, dark ? 2.2 : 2.6, [0, 2.6, -9.5]);
  panel(10, 2.6, 0xffffff, dark ? 3.4 : 2.4, [-9.5, 1.7, -6.8]);
  panel(10, 2.6, 0xffffff, dark ? 2.6 : 2.4, [9.5, 1.7, -6.8]);
  panel(16, 1.1, 0xffffff, dark ? 4.5 : 3, [0, 0.9, -10.5]);
  panel(11, 2.8, 0xffffff, dark ? 2.4 : 2.2, [0, 4.6, -8.5]);
  panel(11, 2.2, 0xffffff, dark ? 1.8 : 2.2, [0, 4.0, 8.8]);
  panel(8, 2.6, 0xffffff, dark ? 1.8 : 2.4, [0, 2.4, 9.5]);
  // цветные акценты
  panel(1.2, 4.2, warm, dark ? 6 : 1.4, [9.5, 2.4, 3.8]);
  panel(1.2, 4.2, cool, dark ? 4.5 : 1.4, [-9.5, 2.4, -3.8]);
  panel(4, 1.4, 0xffffff, dark ? 1.6 : 2 * K, [-9, 4.2, 0]);
  // пол
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: dark ? 0x0a0d12 : 0xb6c0d0 }));
  fl.rotation.x = -Math.PI / 2; fl.position.y = -0.5; s.add(fl);
  return s;
}
