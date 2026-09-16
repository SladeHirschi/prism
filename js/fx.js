'use strict';
/* ============================================================================
   PRISM — fx.js   particles, screen shake, floating text
   ========================================================================== */

class Particle {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.ax = 0; this.ay = 0;
    this.drag = 2.2; this.life = 0; this.maxLife = 1;
    this.size = 4; this.size1 = 0; this.rot = 0; this.vr = 0;
    this.ci = 0; this.white = 0; this.alpha = 1;
    this.shape = 'spark'; this.len = 12; this.width = 3;
    this.fade = Ease.inQuad;
  }
}

class Particles {
  constructor(max = 1200) {
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = new Particle();
    this.count = 0; this.max = max;
  }
  get free() { return this.max - this.count; }
  clear() { this.count = 0; }

  spawn(cfg) {
    let p;
    if (this.count >= this.max) {
      p = this.pool[(Math.random() * this.count) | 0];
      p.reset();
    } else {
      p = this.pool[this.count++];
      p.reset();
    }
    Object.assign(p, cfg);
    p.life = 0;
    return p;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.count--;
        if (i !== this.count) { this.pool[i] = this.pool[this.count]; this.pool[this.count] = p; }
        i--; continue;
      }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx) {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      const t = p.life / p.maxLife;
      const a = p.alpha * (1 - p.fade(t));
      if (a <= 0.004) continue;
      const s = lerp(p.size, p.size1, Ease.outQuad(t));
      if (s <= 0.08) continue;
      const c = p.white > 0.5 ? 'rgba(244,246,250,' + a + ')' : col(p.ci, 1, a);

      switch (p.shape) {
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy);
          const l = Math.max(2, Math.min(p.len, sp * 0.035 + s));
          const nx = sp > 1 ? p.vx / sp : 1, ny = sp > 1 ? p.vy / sp : 0;
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(0.8, s * 0.5);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - nx * l, p.y - ny * l);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;
        }
        case 'dot':
          ctx.fillStyle = c;
          ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, 0, TAU); ctx.fill();
          break;
        case 'square':
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = c;
          ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
          ctx.restore();
          break;
        case 'ring':
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(0.6, p.width * (1 - t));
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.stroke();
          break;
      }
    }
  }

  /* ------------------------------------------------------------ helpers */
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.dir || 0) + (Math.random() - 0.5) * (o.spread === undefined ? TAU : o.spread);
      const sp = (o.speed || 240) * rand(0.35, 1.25);
      this.spawn({
        x: x + rand(-3, 3), y: y + rand(-3, 3),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        drag: o.drag === undefined ? rand(2, 4) : o.drag,
        maxLife: (o.life || 0.5) * rand(0.6, 1.3),
        size: (o.size || 5) * rand(0.6, 1.4), size1: 0,
        ci: o.ci === undefined ? 0 : o.ci,
        white: o.white || 0,
        shape: o.shape || 'spark',
        len: o.len || 14,
        alpha: o.alpha === undefined ? 1 : o.alpha,
        vr: rand(-8, 8),
      });
    }
  }
  ring(x, y, o = {}) {
    this.spawn({
      x, y, vx: 0, vy: 0, drag: 0,
      maxLife: o.life || 0.45,
      size: o.r0 === undefined ? 6 : o.r0,
      size1: o.r1 === undefined ? 70 : o.r1,
      ci: o.ci === undefined ? 0 : o.ci,
      white: o.white || 0,
      alpha: o.alpha === undefined ? 0.85 : o.alpha,
      shape: 'ring', width: o.width || 3,
      fade: o.fade || Ease.outQuad,
    });
  }
}

/* ------------------------------------------------------------------ shake */
class Shaker {
  constructor() { this.trauma = 0; this.t = 0; this.x = 0; this.y = 0; this.rot = 0; }
  add(v) { this.trauma = clamp01(this.trauma + v); }
  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const n = (k) => Math.sin(this.t * 47 + k) * 0.6 + Math.sin(this.t * 31.3 + k * 2.1) * 0.4;
      this.x = n(0) * 22 * s;
      this.y = n(5.3) * 22 * s;
      this.rot = n(11.7) * 0.016 * s;
    } else { this.x = this.y = this.rot = 0; }
  }
}

/* ------------------------------------------------------------ float text */
class FloatText {
  constructor(x, y, text, ci, size, life, white) {
    this.x = x; this.y = y; this.text = text; this.ci = ci;
    this.size = size || 16; this.life = 0; this.maxLife = life || 0.9;
    this.vy = -52; this.alive = true; this.white = white || 0;
  }
  update(dt) {
    this.life += dt;
    this.y += this.vy * dt;
    this.vy = damp(this.vy, -12, 3, dt);
    if (this.life >= this.maxLife) this.alive = false;
  }
  draw(ctx) {
    const t = this.life / this.maxLife;
    const a = (1 - Ease.inQuad(t)) * (t < 0.1 ? t / 0.1 : 1);
    const s = this.size * (1 + Ease.outBack(clamp01(t / 0.2)) * 0.25 - t * 0.1);
    ctx.save();
    ctx.font = '700 ' + s.toFixed(1) + 'px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = this.white ? 'rgba(244,246,250,' + a + ')' : col(this.ci, 1.15, a);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}
