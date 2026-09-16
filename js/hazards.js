'use strict';
/* ============================================================================
   PRISM — hazards.js
   Everything that is thrown at you. Each one wears a colour: wear the same
   colour and it passes straight through you, otherwise it kills you.
   Everything telegraphs first — nothing is ever a surprise.
   ========================================================================== */

class Hazard {
  constructor(ci, tele) {
    this.ci = ci;
    this.state = 'tele';
    this.t = 0;
    this.tele = tele;
    this.dead = false;
    this.touched = false;     // already resolved against the player
  }
  update(dt, g) {
    this.t += dt;
    if (this.state === 'tele') {
      if (this.t >= this.tele) { this.state = 'live'; this.t = 0; this.onLive(g); }
      return;
    }
    this.live(dt, g);
  }
  onLive(g) { }
  live(dt, g) { }
  hits(px, py, pr) { return false; }
  drawTele(ctx, g) { }
  draw(ctx, g) { }
}

/* ==========================================================================
   WAVE — a band that sweeps the whole arena. The signature hazard.
   ========================================================================== */
class Wave extends Hazard {
  constructor(ci, ang, thickness, speed, tele) {
    super(ci, tele);
    this.ang = ang;
    this.nx = Math.cos(ang); this.ny = Math.sin(ang);
    this.th = thickness;
    this.speed = speed;
    this.span = 0;
    this.s = 0;
    this.phased = false;
  }
  /* how far the arena reaches along this wave's direction of travel */
  _ext(g) {
    return Math.abs(g.arena.w * 0.5 * this.nx) + Math.abs(g.arena.h * 0.5 * this.ny);
  }
  onLive(g) {
    this.span = this._ext(g) + this.th;
    this.s = -this.span;
  }
  live(dt, g) {
    this.s += this.speed * dt;
    if (this.s > this.span) this.dead = true;
  }
  _d(px, py, g) {
    return (px - g.arena.cx) * this.nx + (py - g.arena.cy) * this.ny;
  }
  hits(px, py, pr, g) {
    if (this.state !== 'live') return false;
    return Math.abs(this._d(px, py, g) - this.s) < this.th * 0.5 + pr * 0.55;
  }
  _band(ctx, g, s, th) {
    const L = Math.hypot(g.arena.w, g.arena.h);
    ctx.save();
    ctx.translate(g.arena.cx, g.arena.cy);
    ctx.rotate(this.ang);
    ctx.beginPath();
    ctx.rect(s - th * 0.5, -L, th, L * 2);
    ctx.restore();
  }
  drawTele(ctx, g) {
    const k = clamp01(this.t / this.tele);
    const ext = this._ext(g);
    const a = 0.22 + 0.2 * Math.abs(Math.sin(k * Math.PI * 4));
    /* a ghost of the band, parked just INSIDE the edge it will come from,
       so the warning is always on screen */
    this._band(ctx, g, -ext + this.th * 0.5, this.th);
    ctx.fillStyle = col(this.ci, 1, a);
    ctx.fill();
    /* the leading edge, drawn hard so it reads at a glance */
    ctx.save();
    ctx.translate(g.arena.cx, g.arena.cy);
    ctx.rotate(this.ang);
    const L = Math.hypot(g.arena.w, g.arena.h);
    const ex = -ext + this.th;
    ctx.strokeStyle = col(this.ci, 1.25, 0.55 + 0.4 * k);
    ctx.lineWidth = 3.5;
    ctx.setLineDash([16, 12]);
    ctx.lineDashOffset = -this.t * 60;
    ctx.beginPath(); ctx.moveTo(ex, -L); ctx.lineTo(ex, L); ctx.stroke();
    ctx.setLineDash([]);
    /* arrows showing which way it will travel */
    ctx.fillStyle = col(this.ci, 1.25, 0.5 + 0.4 * k);
    for (let y = -L * 0.45; y <= L * 0.45; y += 120) {
      const ox = ex + 18 + Math.sin(this.t * 6 + y * 0.01) * 5;
      ctx.beginPath();
      ctx.moveTo(ox + 14, y); ctx.lineTo(ox, y - 9); ctx.lineTo(ox, y + 9);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  draw(ctx, g) {
    const safe = g.player.colorIndex === this.ci || g.player.invuln > 0;
    this._band(ctx, g, this.s, this.th);
    ctx.fillStyle = col(this.ci, 1, safe ? 0.24 : 0.5);
    ctx.fill();
    /* crisp edges so the hitbox is unambiguous */
    ctx.save();
    ctx.translate(g.arena.cx, g.arena.cy);
    ctx.rotate(this.ang);
    const L = Math.hypot(g.arena.w, g.arena.h);
    ctx.strokeStyle = col(this.ci, 1.3, safe ? 0.5 : 0.95);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.s - this.th * 0.5, -L); ctx.lineTo(this.s - this.th * 0.5, L);
    ctx.moveTo(this.s + this.th * 0.5, -L); ctx.lineTo(this.s + this.th * 0.5, L);
    ctx.stroke();
    /* inner hatching gives it body without noise */
    ctx.strokeStyle = col(this.ci, 1.25, safe ? 0.12 : 0.22);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = -L; y < L; y += 26) {
      ctx.moveTo(this.s - this.th * 0.5, y);
      ctx.lineTo(this.s + this.th * 0.5, y + this.th * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ==========================================================================
   SHARD — a shape hurled across the arena on a straight line.
   ========================================================================== */
class Shard extends Hazard {
  constructor(ci, x, y, vx, vy, r, tele, sides) {
    super(ci, tele);
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r;
    this.sides = sides || 3;
    this.rot = Math.atan2(vy, vx);
    this.spin = rand(-2.4, 2.4);
    this.trail = [];
  }
  live(dt, g) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    this.trail.push({ x: this.x, y: this.y, t: 0 });
    if (this.trail.length > 10) this.trail.shift();
    for (const q of this.trail) q.t += dt;
    const m = 220;
    if (this.x < g.arena.x - m || this.x > g.arena.x + g.arena.w + m ||
      this.y < g.arena.y - m || this.y > g.arena.y + g.arena.h + m) this.dead = true;
  }
  hits(px, py, pr) {
    if (this.state !== 'live') return false;
    return dist2(px, py, this.x, this.y) < (this.r + pr * 0.7) * (this.r + pr * 0.7);
  }
  drawTele(ctx, g) {
    const k = clamp01(this.t / this.tele);
    const a = 0.35 + 0.45 * Math.abs(Math.sin(k * Math.PI * 5));
    const sp = Math.hypot(this.vx, this.vy) || 1;
    /* aim line, drawn from the muzzle */
    ctx.save();
    ctx.strokeStyle = col(this.ci, 1.1, 0.26 + 0.28 * k);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -this.t * 90;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + this.vx / sp * 1700, this.y + this.vy / sp * 1700);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    /* the muzzle itself */
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = col(this.ci, 1.2, a);
    ctx.lineWidth = 2.5;
    polyPath(ctx, 0, 0, this.r * (1 + (1 - k) * 0.7), this.sides, 0);
    ctx.stroke();
    ctx.restore();
  }
  draw(ctx, g) {
    const safe = g.player.colorIndex === this.ci || g.player.invuln > 0;
    for (let i = 1; i < this.trail.length; i++) {
      const q = this.trail[i];
      const a = (i / this.trail.length) * 0.2 * (safe ? 0.4 : 1);
      ctx.fillStyle = col(this.ci, 1, a);
      polyPath(ctx, q.x, q.y, this.r * (0.3 + 0.5 * i / this.trail.length), this.sides, this.rot);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = col(this.ci, 1, safe ? 0.34 : 0.92);
    polyPath(ctx, 0, 0, this.r, this.sides, 0);
    ctx.fill();
    ctx.strokeStyle = col(this.ci, 1.35, safe ? 0.5 : 1);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}

/* ==========================================================================
   BLOOM — a seed that opens into a ring of shards travelling outward.
   ========================================================================== */
class Bloom extends Hazard {
  constructor(ci, x, y, petals, speed, tele, twoTone) {
    super(ci, tele);
    this.x = x; this.y = y;
    this.petals = petals;
    this.speed = speed;
    this.twoTone = twoTone;
    this.ci2 = twoTone ? (ci + 3) % NCOL : ci;
    this.offset = rand(0, TAU);
  }
  onLive(g) {
    for (let i = 0; i < this.petals; i++) {
      const a = this.offset + i / this.petals * TAU;
      const ci = (this.twoTone && i % 2) ? this.ci2 : this.ci;
      const s = new Shard(ci, this.x, this.y,
        Math.cos(a) * this.speed, Math.sin(a) * this.speed, 13, 0, 4);
      s.state = 'live'; s.t = 0;
      g.hazards.push(s);
    }
    g.fx.ring(this.x, this.y, { r0: 10, r1: 150, life: 0.45, ci: this.ci, width: 5, alpha: 0.8 });
    g.fx.burst(this.x, this.y, 16, { ci: this.ci, speed: 300, life: 0.5, size: 5, shape: 'spark' });
    g.shake.add(0.14);
    g.audio.warn(this.ci);
    this.dead = true;
  }
  drawTele(ctx, g) {
    const k = clamp01(this.t / this.tele);
    const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 6);
    ctx.save();
    ctx.translate(this.x, this.y);
    /* the closing ring says exactly when it will open */
    ctx.strokeStyle = col(this.ci, 1, 0.22);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 96, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col(this.ci, 1.2, 0.5 + 0.4 * k);
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, lerp(96, 16, Ease.inQuad(k)), 0, TAU); ctx.stroke();
    ctx.fillStyle = col(this.ci, 1, 0.3 + 0.5 * pulse);
    polyPath(ctx, 0, 0, 12 + pulse * 4, 6, this.t * 2);
    ctx.fill();
    /* the petal directions, faintly */
    ctx.strokeStyle = col(this.ci, 1, 0.1 + 0.16 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.petals; i++) {
      const a = this.offset + i / this.petals * TAU;
      ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      ctx.lineTo(Math.cos(a) * 78, Math.sin(a) * 78);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ==========================================================================
   DIRECTOR — decides what arrives and when. Everything lands on the beat.
   ========================================================================== */
class Director {
  constructor(game) {
    this.g = game;
    this.reset();
  }
  reset() {
    this.level = 0;
    this.sinceWave = 0;
    this.sinceShard = 0;
    this.sinceBloom = 0;
    this.beat = 0;
  }

  /* 0 at the start of the level, 1 at the end */
  get ramp() { return clamp01(this.level / 14); }

  onBeat(i) {
    const g = this.g;
    if (g.state !== 'play') return;
    this.beat++;
    const r = this.ramp;
    this.sinceWave++; this.sinceShard++; this.sinceBloom++;

    /* how many events may be in flight at once */
    const budget = 1 + Math.floor(r * 3.4);
    const liveCount = g.hazards.filter(h => !h.dead).length;
    if (liveCount > budget * 4) return;

    /* --- waves: the backbone, from the very first pickup --- */
    const waveGap = Math.max(2, Math.round(lerp(7, 2.6, r)));
    if (this.sinceWave >= waveGap) {
      this.sinceWave = 0;
      this.spawnWave();
      /* later on they come in crossing pairs */
      if (this.level >= 9 && chance(0.35 + r * 0.3)) {
        setTimeout(() => { if (g.state === 'play') this.spawnWave(true); }, 260);
      }
    }

    /* --- shards --- */
    if (this.level >= 2) {
      const gap = Math.max(2, Math.round(lerp(6, 2, r)));
      if (this.sinceShard >= gap) {
        this.sinceShard = 0;
        const n = 1 + Math.floor(r * 3 + (chance(0.3) ? 1 : 0));
        this.spawnVolley(n);
      }
    }

    /* --- blooms --- */
    if (this.level >= 6) {
      const gap = Math.max(3, Math.round(lerp(9, 3.5, r)));
      if (this.sinceBloom >= gap) {
        this.sinceBloom = 0;
        this.spawnBloom();
        if (this.level >= 12 && chance(0.4)) {
          setTimeout(() => { if (g.state === 'play') this.spawnBloom(); }, 420);
        }
      }
    }
  }

  /* pick a colour — often the one the player is NOT wearing, so they have
     to choose between the orb's colour and staying alive */
  pickColor(pressure) {
    const g = this.g;
    if (chance(pressure === undefined ? 0.55 : pressure)) {
      let c = randInt(0, NCOL - 1);
      for (let i = 0; i < 4 && c === g.player.colorIndex; i++) c = randInt(0, NCOL - 1);
      return c;
    }
    return randInt(0, NCOL - 1);
  }

  spawnWave(cross) {
    const g = this.g, r = this.ramp;
    const ci = this.pickColor(0.5 + r * 0.25);
    /* axis-aligned early; diagonals once they can handle it */
    let ang;
    if (this.level < 5) ang = pick([0, Math.PI, Math.PI / 2, -Math.PI / 2]);
    else if (this.level < 10) ang = pick([0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75]);
    else ang = rand(0, TAU);
    if (cross) ang += Math.PI / 2;
    const th = lerp(150, 92, r) * rand(0.85, 1.15);
    const sp = lerp(230, 430, r) * rand(0.9, 1.1);
    const tele = lerp(1.5, 0.85, r);
    g.hazards.push(new Wave(ci, ang, th, sp, tele));
    g.audio.warn(ci);
  }

  spawnVolley(n) {
    const g = this.g, r = this.ramp;
    const ci = this.pickColor(0.55 + r * 0.2);
    const tele = lerp(1.0, 0.55, r);
    const speed = lerp(330, 560, r);
    /* fire from one edge, fanned toward where the player is now */
    const edge = randInt(0, 3);
    const A = g.arena;
    for (let i = 0; i < n; i++) {
      let x, y;
      const m = 70;
      if (edge === 0) { x = rand(A.x, A.x + A.w); y = A.y - m; }
      else if (edge === 1) { x = A.x + A.w + m; y = rand(A.y, A.y + A.h); }
      else if (edge === 2) { x = rand(A.x, A.x + A.w); y = A.y + A.h + m; }
      else { x = A.x - m; y = rand(A.y, A.y + A.h); }
      const tx = g.player.x + rand(-80, 80);
      const ty = g.player.y + rand(-80, 80);
      const a = Math.atan2(ty - y, tx - x);
      g.hazards.push(new Shard(ci, x, y, Math.cos(a) * speed, Math.sin(a) * speed,
        rand(13, 17), tele + i * 0.07, pick([3, 4])));
    }
    g.audio.warn(ci);
  }

  spawnBloom() {
    const g = this.g, r = this.ramp;
    const A = g.arena;
    const ci = this.pickColor(0.5);
    /* never right on top of the player */
    let x = 0, y = 0, best = -1;
    for (let i = 0; i < 8; i++) {
      const px = rand(A.x + 140, A.x + A.w - 140);
      const py = rand(A.y + 140, A.y + A.h - 140);
      const d = dist(px, py, g.player.x, g.player.y);
      if (d > best) { best = d; x = px; y = py; }
    }
    const petals = 6 + Math.floor(r * 6);
    const speed = lerp(230, 360, r);
    const twoTone = this.level >= 11 && chance(0.45);
    g.hazards.push(new Bloom(ci, x, y, petals, speed, lerp(1.3, 0.85, r), twoTone));
    g.audio.warn(ci);
  }
}
