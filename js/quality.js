// Автоматическая подстройка качества под устройство и реальную скорость кадров.
// Уровни: 0 — максимум (десктоп), 4 — самый лёгкий. Начинаем с оценки по устройству и дальше смотрим на время кадра:
// если кадры тормозят — упрощаем, если запас большой и стабильно — осторожно возвращаем качество.

export function detectDevice() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const mobile = coarse || small || ua;
  return { mobile, cores, mem, weak: (mobile && (cores <= 6 || mem <= 3)) || cores <= 2 };
}

export function startTier(dev) {
  if (!dev.mobile) return dev.cores <= 4 ? 1 : 0;
  return dev.weak ? 3 : 2;
}

export class Quality {
  constructor({ tier = 0, min = 0, max = 4, onChange, warm = 50 } = {}) {
    this.tier = tier; this.min = min; this.max = max; this.onChange = onChange;
    this.warm = warm; this.ema = 16.7; this.n = 0; this.bad = 0; this.good = 0; this.sinceChange = 0;
    this.best = min; this.lastUp = -1e9; this.t = 0; this.locked = false; this.slow = 0; this.skip = 4;
  }
  set(tier) { tier = Math.max(this.min, Math.min(this.max, tier)); if (tier === this.tier) return; this.tier = tier; this.n = 0; this.bad = 0; this.good = 0; this.slow = 0; this.skip = 4; this.ema = 16.7; this.onChange && this.onChange(tier); }
  // dt — длительность прошлого кадра в мс; вызывать на каждом отрисованном кадре
  tick(dt) {
    if (this.locked) return;
    this.t += dt;
    if (this.skip > 0) { this.skip--; return; } // первые кадры после старта/смены уровня: компиляция шейдеров, ресайз буферов
    // очень тяжёлые кадры подряд (слабый телефон, программный рендер) — не ждём разогрева, сразу упрощаем
    if (dt > 90) {
      if (++this.slow >= 4 && this.tier < this.max) { this.best = Math.max(this.best, this.tier + 1); this.set(this.tier + 1); return; }
    } else this.slow = 0;
    if (dt > 250) { this.n = Math.min(this.n, this.warm - 10); return; } // пауза вкладки, скачок — не считаем
    this.n++;
    if (this.n < this.warm) return;
    this.ema += (dt - this.ema) * 0.08;
    if (this.ema > 25) { this.bad++; this.good = 0; } else if (this.ema < 18.5) { this.good++; this.bad = 0; } else { this.bad = Math.max(0, this.bad - 1); this.good = 0; }
    if (this.bad > 22 && this.tier < this.max) {
      if (this.t - this.lastUp < 7000) this.best = Math.max(this.best, this.tier + 1); // апгрейд не удался — выше не пытаемся
      this.set(this.tier + 1);
    } else if (this.good > 300 && this.tier > this.best && this.tier > this.min) {
      this.lastUp = this.t; this.set(this.tier - 1);
    }
  }
}
