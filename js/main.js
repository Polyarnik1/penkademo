const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const top = $('.top');
addEventListener('scroll', () => top.classList.toggle('solid', scrollY > 10), { passive: true });

// Плавный счётчик
function tween(el, to, dur = 450) {
  const from = Number(el.dataset.v ?? to);
  el.dataset.v = to;
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 3D-мойка
const range = $('#washRange');
const pct = $('#cleanPct');
const hint = $('#washHint');
let scene = null;
function paintRange(v) {
  range.style.setProperty('--p', v + '%');
  // доля чистого кузова: рамка проходит машину (x от -2.3 до 2.3) на отрезке 0.13–0.69
  const clean = Math.round(Math.min(1, Math.max(0, (v / 100 - 0.133) / 0.554)) * 100);
  pct.textContent = clean;
  range.setAttribute('aria-valuetext', `Чистота ${clean} процентов`);
  hint.textContent = clean >= 100 ? 'готово, можно ехать' : clean > 0 ? 'ещё немного' : 'тяните вправо';
}
range.addEventListener('input', () => { paintRange(Number(range.value)); scene && scene.set(range.value / 100); });
paintRange(0);

const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
if (hasGL) {
  requestAnimationFrame(async () => {
    try {
      const { initScene } = await import('./scene.js');
      scene = initScene({ canvas: $('#gl'), reduced });
      if (!scene) throw new Error('no scene');
      // автодемо: один проход, когда блок виден
      const io = new IntersectionObserver((en) => {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        if (reduced) return;
        setTimeout(() => {
          if (Number(range.value) > 0) return;
          scene.play(0, 1, 5.2, (p) => { range.value = p * 100; paintRange(p * 100); });
        }, 700);
      }, { threshold: 0.5 });
      io.observe($('#wash'));
      range.addEventListener('pointerdown', () => scene.set(range.value / 100));
    } catch (e) {
      console.error(e);
      document.documentElement.classList.add('no-gl');
    }
  });
} else document.documentElement.classList.add('no-gl');

// Тарифы и конструктор
let cls = 0, base = 1;
const names = ['Экспресс', 'Стандарт', 'Максимум'];
const baseMin = [10, 15, 20];
const prices = $$('.tariff .price').map((el) => el.dataset.p.split(',').map(Number));
function setCls(i) {
  cls = i;
  $$('#cls button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.i) === i));
  $$('.tariff .price span').forEach((el, k) => tween(el, prices[k][i]));
  calc();
}
$$('#cls button').forEach((b) => b.addEventListener('click', () => setCls(Number(b.dataset.i))));
$$('[data-pick]').forEach((b) => b.addEventListener('click', () => {
  base = Number(b.dataset.pick);
  $('#baseName').textContent = names[base];
  calc();
  $('#builder').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}));
const opts = $$('#opts input');
opts.forEach((o) => o.addEventListener('change', calc));
function calc() {
  let sum = prices[base][cls], mins = baseMin[base];
  opts.forEach((o) => { if (o.checked) { sum += Number(o.dataset.p); mins += Number(o.dataset.m); } });
  tween($('#sum'), sum);
  $('#mins').textContent = mins + ' мин';
  $('#minsBar').style.width = Math.min(100, (mins / 45) * 100) + '%';
  $('#bonus').textContent = '+' + Math.round(sum * 0.05);
}
calc();

// Табло постов (имитация)
const board = $('#board');
const posts = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, left: Math.random() < 0.35 ? 0 : Math.round(60 + Math.random() * 840), total: 900 }));
posts.forEach((p) => {
  const el = document.createElement('div');
  el.className = 'post';
  el.innerHTML = `<span class="num">${String(p.n).padStart(2, '0')}</span><span class="st"></span><span class="eta"></span><span class="pg"><i></i></span>`;
  p.el = el; board.appendChild(el);
});
function renderPosts() {
  let free = 0;
  posts.forEach((p) => {
    const busy = p.left > 0;
    if (!busy) free++;
    p.el.classList.toggle('busy', busy);
    p.el.classList.toggle('free', !busy);
    $('.st', p.el).textContent = busy ? 'Моется' : 'Свободен';
    $('.eta', p.el).textContent = busy ? `освободится через ${Math.max(1, Math.ceil(p.left / 60))} мин` : 'можно заезжать';
    $('.pg i', p.el).style.width = busy ? `${100 - (p.left / p.total) * 100}%` : '0%';
  });
  $('#freeCount').textContent = free;
}
renderPosts();
setInterval(() => {
  if (document.hidden) return;
  posts.forEach((p) => {
    if (p.left > 0) p.left = Math.max(0, p.left - 20);
    else if (Math.random() < 0.08) { p.total = 600 + Math.round(Math.random() * 600); p.left = p.total; }
  });
  renderPosts();
}, 2000);

// Пузыри в блоке абонемента
const bc = $('#bubbles');
if (bc && !reduced) {
  const g = bc.getContext('2d');
  let bw, bh, bubbles = [];
  const size = () => {
    const r = bc.getBoundingClientRect();
    bw = bc.width = r.width * Math.min(devicePixelRatio, 2); bh = bc.height = r.height * Math.min(devicePixelRatio, 2);
    bubbles = Array.from({ length: 26 }, () => ({ x: Math.random() * bw, y: Math.random() * bh, r: (8 + Math.random() * 38) * Math.min(devicePixelRatio, 2), v: 0.2 + Math.random() * 0.6, ph: Math.random() * 6 }));
  };
  size(); addEventListener('resize', size);
  let on = false;
  new IntersectionObserver((e) => { on = e[0].isIntersecting; }).observe(bc);
  const draw = (t) => {
    requestAnimationFrame(draw);
    if (!on) return;
    g.clearRect(0, 0, bw, bh);
    bubbles.forEach((b) => {
      b.y -= b.v; if (b.y < -b.r) { b.y = bh + b.r; b.x = Math.random() * bw; }
      const x = b.x + Math.sin(t / 900 + b.ph) * 10;
      const grd = g.createRadialGradient(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.05, x, b.y, b.r);
      grd.addColorStop(0, 'rgba(255,255,255,.85)'); grd.addColorStop(0.35, 'rgba(255,255,255,.18)'); grd.addColorStop(0.9, 'rgba(255,255,255,.08)'); grd.addColorStop(1, 'rgba(255,255,255,.5)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, b.y, b.r, 0, Math.PI * 2); g.fill();
    });
  };
  requestAnimationFrame(draw);
}
