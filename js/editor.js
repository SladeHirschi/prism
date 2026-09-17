'use strict';
/* ============================================================================
   PRISM — editor.js

   Build a level start to end as a sequence of steps. A step is one orb plus
   the hazards that arrive while the player goes and gets it; collecting the
   orb starts the next step. No tempo, no beat grid — delays are seconds from
   the moment the step begins.

   Placing is a drag: press where it starts, pull in the direction it travels,
   and pull further for more speed. Everything you have placed stays drawn.

       ┌──────────── arena: the whole step, always visible ────────────┐
       └────────────────────────────────────────────────────────────────┘
       [ 1 ][ 2 ][ 3 ][ + ]          steps, in order
       ├── delay lane: each hazard at its delay, drag to retime ────────┤
   ========================================================================== */

const STRIP_H = 132;
const STEP_ROW_H = 34;
const DELAY_MAX = 12;         // seconds shown across the delay lane
const DRAG_FULL = 420;        // world px of drag that means "top speed"

class Editor {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.level = null;
    this.si = 0;
    this.sel = null;          // {kind:'orb'} | {kind:'haz', h}
    this.tool = null;
    this.color = 0;
    this.drag = null;
    this.undoStack = [];
    this.dirty = false;
  }

  /* ------------------------------------------------------------- open -- */
  open(level) {
    this.level = normaliseLevel(level ? JSON.parse(JSON.stringify(level)) : blankLevel(
      'custom-' + Date.now().toString(36), 'NEW LEVEL'));
    this.active = true;
    this.si = 0;
    this.sel = null;
    this.tool = null;
    this.undoStack = [];
    this.dirty = false;
    this.g.music.load(getTrack(this.level.track));
    this.g.music.stop();
    this.buildPalette();
    this.syncFields();
    this.refreshInspector();
  }
  close() { this.active = false; this.g.music.stop(); }

  /* the loop calls this every frame; nothing here runs on a clock */
  update(rdt) { }

  get step() { return this.level.steps[this.si]; }

  /* ------------------------------------------------------------- undo -- */
  push() {
    this.undoStack.push(JSON.stringify(this.level.steps));
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.dirty = true;
  }
  undo() {
    if (!this.undoStack.length) return;
    this.level.steps = JSON.parse(this.undoStack.pop());
    this.si = clamp(this.si, 0, this.level.steps.length - 1);
    this.sel = null;
    this.refreshInspector();
    this.flash('Undone');
  }

  /* ------------------------------------------------------------ steps -- */
  addStep(at) {
    this.push();
    const i = at === undefined ? this.level.steps.length : at;
    const s = blankStep();
    s.orb.color = this.color;
    s.orb.x = rand(0.2, 0.8);
    s.orb.y = rand(0.2, 0.8);
    this.level.steps.splice(i, 0, s);
    this.si = i;
    this.sel = { kind: 'orb' };
    this.refreshInspector();
  }
  deleteStep() {
    if (this.level.steps.length <= 1) { this.flash('A level needs at least one step'); return; }
    this.push();
    this.level.steps.splice(this.si, 1);
    this.si = clamp(this.si, 0, this.level.steps.length - 1);
    this.sel = null;
    this.refreshInspector();
  }
  duplicateStep() {
    this.push();
    const copy = JSON.parse(JSON.stringify(this.step));
    this.level.steps.splice(this.si + 1, 0, copy);
    this.si++;
    this.sel = null;
    this.refreshInspector();
  }
  moveStep(dir) {
    const j = this.si + dir;
    if (j < 0 || j >= this.level.steps.length) return;
    this.push();
    const s = this.level.steps.splice(this.si, 1)[0];
    this.level.steps.splice(j, 0, s);
    this.si = j;
  }
  selectStep(i) {
    this.si = clamp(i, 0, this.level.steps.length - 1);
    this.sel = null;
    this.refreshInspector();
  }

  /* --------------------------------------------------------- placement -- */
  /* a drag becomes a direction and a speed */
  speedFrom(type, lenWorld) {
    const r = HAZ_SPEC[type].speedRange;
    return +lerp(r[0], r[1], clamp01(lenWorld / DRAG_FULL)).toFixed(3);
  }

  place(type, wx, wy, vx, vy) {
    const A = this.g.arena;
    const spec = HAZ_SPEC[type];
    const h = fillFields(spec, null);
    h.type = type;
    h.color = this.color;
    const l = len(vx, vy);
    const ang = l > 6 ? Math.atan2(vy, vx) / DEG : 0;
    h.speed = this.speedFrom(type, l);
    if (type === 'wave') {
      h.angle = +ang.toFixed(1);
    } else {
      h.x = +clamp((wx - A.x) / A.w, -0.12, 1.12).toFixed(3);
      h.y = +clamp((wy - A.y) / A.h, -0.12, 1.12).toFixed(3);
      if (type === 'shard') h.angle = +ang.toFixed(1);
      else h.spin = +((ang + 360) % 360).toFixed(1);
    }
    /* land after whatever is already there, so ordering is sane by default */
    const last = this.step.hazards.reduce((m, q) => Math.max(m, q.delay), -1);
    h.delay = +Math.max(0, last < 0 ? 0 : last + 0.6).toFixed(2);
    this.push();
    this.step.hazards.push(h);
    this.sortHaz();
    this.sel = { kind: 'haz', h };
    this.refreshInspector();
    return h;
  }

  sortHaz() { this.step.hazards.sort((a, b) => a.delay - b.delay); }

  deleteSel() {
    if (!this.sel) return;
    if (this.sel.kind === 'orb') { this.flash('Every step needs its orb'); return; }
    this.push();
    const i = this.step.hazards.indexOf(this.sel.h);
    if (i >= 0) this.step.hazards.splice(i, 1);
    this.sel = null;
    this.refreshInspector();
  }
  duplicateSel() {
    if (!this.sel || this.sel.kind !== 'haz') return;
    this.push();
    const c = Object.assign({}, this.sel.h);
    c.delay = +(c.delay + 0.6).toFixed(2);
    this.step.hazards.push(c);
    this.sortHaz();
    this.sel = { kind: 'haz', h: c };
    this.refreshInspector();
  }

  /* -------------------------------------------------------------- draw -- */
  draw(ctx) {
    const g = this.g, W = g.w, H = g.h;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.fillStyle = '#101115';
    ctx.fillRect(0, 0, W, H);

    const top = 60, bottom = H - STRIP_H - 26;
    const availW = W - 420, availH = bottom - top;
    const s = Math.min(availW / g.arena.w, availH / g.arena.h);
    const ox = 210 + (availW - g.arena.w * s) / 2;
    const oy = top + (availH - g.arena.h * s) / 2;
    this.view = { s, ox, oy };

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    this.drawArena(ctx);
    ctx.restore();

    this.drawStrip(ctx, W, H);
  }

  drawArena(ctx) {
    const A = this.g.arena;
    ctx.fillStyle = '#25272c';
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = A.x + 80; x < A.x + A.w; x += 80) { ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); }
    for (let y = A.y + 80; y < A.y + A.h; y += 80) { ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
    ctx.stroke();

    /* the route in from the previous orb, so the flow is visible */
    if (this.si > 0) {
      const p = this.level.steps[this.si - 1].orb;
      const px = A.x + p.x * A.w, py = A.y + p.y * A.h;
      const c = this.step.orb;
      const cx = A.x + c.x * A.w, cy = A.y + c.y * A.h;
      ctx.strokeStyle = 'rgba(238,241,246,.16)';
      ctx.lineWidth = 3; ctx.setLineDash([12, 12]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(238,241,246,.2)';
      polyPath(ctx, px, py, 14, 6, 0); ctx.fill();
    }

    /* everything in this step, all at once */
    for (const h of this.step.hazards) {
      this.drawHazard(ctx, h, this.sel && this.sel.kind === 'haz' && this.sel.h === h);
    }
    if (this.step.star) this.drawStar(ctx, this.step.star, this.sel && this.sel.kind === 'star');
    this.drawOrb(ctx, this.step.orb, this.sel && this.sel.kind === 'orb');

    if (this.drag && this.drag.kind === 'place') this.drawPlacePreview(ctx);
    ctx.restore();

    ctx.strokeStyle = 'rgba(238,241,246,.2)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.stroke();
  }

  label(ctx, x, y, text, ci) {
    ctx.save();
    ctx.font = '700 18px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10,11,14,.75)';
    const w = ctx.measureText(text).width + 14;
    roundRectPath(ctx, x - w / 2, y - 13, w, 26, 6); ctx.fill();
    ctx.fillStyle = col(ci, 1.4, 1);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  arrow(ctx, x, y, ang, length, ci, a) {
    const ex = x + Math.cos(ang) * length, ey = y + Math.sin(ang) * length;
    ctx.strokeStyle = col(ci, 1.3, a);
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = col(ci, 1.4, a);
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-4, -13); ctx.lineTo(-4, 13);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawOrb(ctx, o, selected) {
    const A = this.g.arena;
    const x = A.x + o.x * A.w, y = A.y + o.y * A.h;
    ctx.strokeStyle = col(o.color, 1, 0.3);
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, 40, 0, TAU); ctx.stroke();
    ctx.fillStyle = col(o.color, 1, 0.95);
    polyPath(ctx, x, y, 21, 6, 0); ctx.fill();
    ctx.fillStyle = 'rgba(250,252,255,.85)';
    polyPath(ctx, x, y, 9, 6, 0); ctx.fill();
    this.label(ctx, x, y - 58, (this.si + 1) + ' · ' + o.life.toFixed(1) + 's', o.color);
    if (selected) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([9, 8]);
      ctx.beginPath(); ctx.arc(x, y, 56, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawStar(ctx, st, selected) {
    const A = this.g.arena;
    const x = A.x + st.x * A.w, y = A.y + st.y * A.h;
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < NCOL; i++) {
      const a0 = i / NCOL * TAU, a1 = (i + 1) / NCOL * TAU + 0.02;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 24, a0, a1); ctx.closePath();
      ctx.fillStyle = col(i, 1.05, 0.95); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(250,252,255,.95)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke();
    ctx.restore();
    this.label(ctx, x, y - 48, st.delay.toFixed(1) + 's \u00b7 ' + st.life.toFixed(1) + 's', 2);
    if (selected) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([9, 8]);
      ctx.beginPath(); ctx.arc(x, y, 54, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawHazard(ctx, h, selected) {
    const A = this.g.arena;
    const a = 0.9;
    if (h.type === 'wave') {
      const ang = h.angle * DEG;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const ext = Math.abs(A.w * 0.5 * nx) + Math.abs(A.h * 0.5 * ny);
      const th = h.thickness * A.w;
      const L = Math.hypot(A.w, A.h);
      ctx.save();
      ctx.translate(A.x + A.w / 2, A.y + A.h / 2);
      ctx.rotate(ang);
      /* parked at the edge it enters from */
      const s = -ext + th * 0.5;
      ctx.fillStyle = col(h.color, 1, 0.42);
      ctx.fillRect(s - th / 2, -L, th, L * 2);
      ctx.strokeStyle = col(h.color, 1.3, a);
      ctx.lineWidth = 4;
      ctx.strokeRect(s - th / 2, -L, th, L * 2);
      if (selected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([11, 9]);
        ctx.strokeRect(s - th / 2, -L, th, L * 2);
        ctx.setLineDash([]);
      }
      ctx.restore();
      /* an arrow across the arena showing where it goes, length = speed */
      const cx = A.x + A.w / 2 - nx * (ext - th), cy = A.y + A.h / 2 - ny * (ext - th);
      this.arrow(ctx, cx, cy, ang, 120 + h.speed * 420, h.color, a);
      this.label(ctx, cx + nx * 60, cy + ny * 60 - 34, h.delay.toFixed(1) + 's', h.color);
      return;
    }

    const x = A.x + h.x * A.w, y = A.y + h.y * A.h;
    if (h.type === 'shard') {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(h.angle * DEG);
      ctx.fillStyle = col(h.color, 1, a);
      polyPath(ctx, 0, 0, h.radius * A.w * 1.6, h.sides, 0); ctx.fill();
      ctx.strokeStyle = col(h.color, 1.4, 1); ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      this.arrow(ctx, x, y, h.angle * DEG, 60 + h.speed * 300, h.color, a * 0.8);
      if (h.aim === 'player') {
        ctx.strokeStyle = col(h.color, 1.3, 0.5);
        ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
        ctx.beginPath(); ctx.arc(x, y, 40, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (h.type === 'bloom') {
      const r = 60 + h.speed * 260;
      ctx.strokeStyle = col(h.color, 1.2, 0.7);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      for (let i = 0; i < h.petals; i++) {
        const pa = (h.spin || 0) * DEG + i / h.petals * TAU;
        const ci = (h.color2 >= 0 && i % 2) ? h.color2 : h.color;
        ctx.strokeStyle = col(ci, 1.3, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(pa) * 26, y + Math.sin(pa) * 26);
        ctx.lineTo(x + Math.cos(pa) * r, y + Math.sin(pa) * r);
        ctx.stroke();
        ctx.fillStyle = col(ci, 1, 0.9);
        polyPath(ctx, x + Math.cos(pa) * r, y + Math.sin(pa) * r, 9, 4, 0);
        ctx.fill();
      }
      ctx.fillStyle = col(h.color, 1, 1);
      polyPath(ctx, x, y, 16, 6, 0); ctx.fill();
    }
    this.label(ctx, x, y - 46, h.delay.toFixed(1) + 's', h.color);
    if (selected) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([9, 8]);
      ctx.beginPath(); ctx.arc(x, y, 54, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawPlacePreview(ctx) {
    const d = this.drag;
    const vx = d.cx - d.x0, vy = d.cy - d.y0;
    const l = len(vx, vy);
    const ang = l > 6 ? Math.atan2(vy, vx) : 0;
    const A = this.g.arena;
    const sp = this.speedFrom(d.type, l);
    if (d.type === 'wave') {
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const ext = Math.abs(A.w * 0.5 * nx) + Math.abs(A.h * 0.5 * ny);
      const th = HAZ_SPEC.wave.fields.thickness.def * A.w;
      const L = Math.hypot(A.w, A.h);
      ctx.save();
      ctx.translate(A.x + A.w / 2, A.y + A.h / 2);
      ctx.rotate(ang);
      ctx.fillStyle = col(this.color, 1, 0.3);
      ctx.fillRect(-ext, -L, th, L * 2);
      ctx.restore();
    }
    this.arrow(ctx, d.x0, d.y0, ang, Math.max(24, l), this.color, 1);
    ctx.fillStyle = 'rgba(10,11,14,.8)';
    this.label(ctx, d.x0, d.y0 - 44, 'speed ' + sp.toFixed(2), this.color);
  }

  /* ------------------------------------------------------------- strip -- */
  stripRect(W, H) { return { x: 16, y: H - STRIP_H, w: W - 32, h: STRIP_H - 10 }; }
  stepChipRect(i, r) {
    const cw = 44, gap = 6;
    return { x: r.x + 8 + i * (cw + gap), y: r.y + 6, w: cw, h: STEP_ROW_H - 6 };
  }
  delayRect(W, H) {
    const r = this.stripRect(W, H);
    return { x: r.x + 8, y: r.y + STEP_ROW_H + 12, w: r.w - 16, h: r.h - STEP_ROW_H - 20 };
  }
  delayToX(d, dr) { return dr.x + clamp01(d / DELAY_MAX) * dr.w; }
  xToDelay(x, dr) { return clamp((x - dr.x) / dr.w * DELAY_MAX, 0, DELAY_MAX); }

  drawStrip(ctx, W, H) {
    const r = this.stripRect(W, H);
    ctx.fillStyle = '#17181c';
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();

    /* --- step chips --- */
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.clip();
    this.level.steps.forEach((st, i) => {
      const c = this.stepChipRect(i, r);
      if (c.x > r.x + r.w) return;
      const on = i === this.si;
      ctx.fillStyle = on ? col(st.orb.color, 1, 0.95) : 'rgba(255,255,255,.06)';
      roundRectPath(ctx, c.x, c.y, c.w, c.h, 5); ctx.fill();
      if (!on) {
        ctx.fillStyle = col(st.orb.color, 1, 0.75);
        roundRectPath(ctx, c.x, c.y, 4, c.h, 2); ctx.fill();
      }
      ctx.fillStyle = on ? '#12131a' : '#c3c9d6';
      ctx.font = '700 12px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), c.x + c.w / 2, c.y + c.h / 2 - 3);
      ctx.font = '600 8px ui-monospace, Menlo, monospace';
      ctx.fillStyle = on ? 'rgba(18,19,26,.7)' : '#6e7486';
      ctx.fillText(st.hazards.length + '', c.x + c.w / 2, c.y + c.h - 7);
    });
    const plus = this.stepChipRect(this.level.steps.length, r);
    ctx.strokeStyle = 'rgba(238,241,246,.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    roundRectPath(ctx, plus.x, plus.y, plus.w, plus.h, 5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(238,241,246,.6)';
    ctx.font = '700 15px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', plus.x + plus.w / 2, plus.y + plus.h / 2);

    /* --- delay lane --- */
    const dr = this.delayRect(W, H);
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    roundRectPath(ctx, dr.x, dr.y, dr.w, dr.h, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(238,241,246,.08)';
    ctx.lineWidth = 1;
    ctx.font = '600 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    for (let sec = 0; sec <= DELAY_MAX; sec += 1) {
      const x = this.delayToX(sec, dr);
      ctx.beginPath(); ctx.moveTo(x, dr.y); ctx.lineTo(x, dr.y + dr.h); ctx.stroke();
      if (sec % 2 === 0) {
        ctx.fillStyle = 'rgba(238,241,246,.3)';
        ctx.fillText(sec + 's', x + 3, dr.y + 9);
      }
    }
    /* the orb's own window, so you can see what fits before it fades */
    const ox = this.delayToX(this.step.orb.life, dr);
    ctx.fillStyle = col(this.step.orb.color, 1, 0.1);
    ctx.fillRect(dr.x, dr.y, ox - dr.x, dr.h);
    ctx.strokeStyle = col(this.step.orb.color, 1.2, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, dr.y); ctx.lineTo(ox, dr.y + dr.h); ctx.stroke();

    this.step.hazards.forEach((h) => {
      const x = this.delayToX(h.delay, dr);
      const lane = ['wave', 'shard', 'bloom'].indexOf(h.type);
      const y = dr.y + 14 + lane * 13;
      const on = this.sel && this.sel.kind === 'haz' && this.sel.h === h;
      ctx.fillStyle = col(h.color, 1, on ? 1 : 0.8);
      roundRectPath(ctx, x - 5, y, 10, 11, 3); ctx.fill();
      if (on) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        roundRectPath(ctx, x - 6.5, y - 1.5, 13, 14, 4); ctx.stroke();
      }
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------- mouse -- */
  toWorld(sx, sy) {
    if (!this.view) return { x: 0, y: 0 };
    return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s };
  }

  hitArena(wx, wy) {
    const A = this.g.arena;
    const st = this.step.star;
    if (st && dist2(wx, wy, A.x + st.x * A.w, A.y + st.y * A.h) < 54 * 54) return { kind: 'star' };
    const o = this.step.orb;
    if (dist2(wx, wy, A.x + o.x * A.w, A.y + o.y * A.h) < 54 * 54) return { kind: 'orb' };
    for (let i = this.step.hazards.length - 1; i >= 0; i--) {
      const h = this.step.hazards[i];
      if (h.type === 'wave') continue;
      if (dist2(wx, wy, A.x + h.x * A.w, A.y + h.y * A.h) < 54 * 54) return { kind: 'haz', h };
    }
    /* waves last — click anywhere on the band */
    for (let i = this.step.hazards.length - 1; i >= 0; i--) {
      const h = this.step.hazards[i];
      if (h.type !== 'wave') continue;
      const ang = h.angle * DEG, nx = Math.cos(ang), ny = Math.sin(ang);
      const ext = Math.abs(A.w * 0.5 * nx) + Math.abs(A.h * 0.5 * ny);
      const th = h.thickness * A.w;
      const d = (wx - (A.x + A.w / 2)) * nx + (wy - (A.y + A.h / 2)) * ny;
      if (Math.abs(d - (-ext + th * 0.5)) < th * 0.7) return { kind: 'haz', h };
    }
    return null;
  }

  onDown(sx, sy) {
    const W = this.g.w, H = this.g.h;
    const r = this.stripRect(W, H);

    /* --- strip --- */
    if (sy >= r.y) {
      if (sy < r.y + STEP_ROW_H + 4) {
        for (let i = 0; i <= this.level.steps.length; i++) {
          const c = this.stepChipRect(i, r);
          if (sx >= c.x && sx <= c.x + c.w) {
            if (i === this.level.steps.length) this.addStep();
            else this.selectStep(i);
            return;
          }
        }
        return;
      }
      const dr = this.delayRect(W, H);
      let best = null, bd = 12;
      for (const h of this.step.hazards) {
        const d = Math.abs(this.delayToX(h.delay, dr) - sx);
        if (d < bd) { bd = d; best = h; }
      }
      if (best) {
        this.sel = { kind: 'haz', h: best };
        this.refreshInspector();
        this.push();
        this.drag = { kind: 'delay', h: best };
      }
      return;
    }

    /* --- arena --- */
    const w = this.toWorld(sx, sy);
    if (this.tool === 'star') {
      const A = this.g.arena;
      this.push();
      const nx = +clamp((w.x - A.x) / A.w, 0.03, 0.97).toFixed(3);
      const ny = +clamp((w.y - A.y) / A.h, 0.03, 0.97).toFixed(3);
      if (this.step.star && dist2(w.x, w.y, A.x + this.step.star.x * A.w, A.y + this.step.star.y * A.h) < 56 * 56) {
        this.step.star = null;
        this.sel = null;
      } else {
        this.step.star = fillFields(STAR_SPEC, { x: nx, y: ny });
        this.sel = { kind: 'star' };
      }
      this.tool = null;
      this.syncTools();
      this.refreshInspector();
      return;
    }
    if (this.tool === 'orb') {
      const A = this.g.arena;
      this.push();
      this.step.orb.x = +clamp((w.x - A.x) / A.w, 0.03, 0.97).toFixed(3);
      this.step.orb.y = +clamp((w.y - A.y) / A.h, 0.03, 0.97).toFixed(3);
      this.step.orb.color = this.color;
      this.sel = { kind: 'orb' };
      this.tool = null;
      this.syncTools();
      this.refreshInspector();
      return;
    }
    if (this.tool) {
      this.drag = { kind: 'place', type: this.tool, x0: w.x, y0: w.y, cx: w.x, cy: w.y };
      return;
    }
    const hit = this.hitArena(w.x, w.y);
    this.sel = hit;
    this.refreshInspector();
    if (hit) {
      this.push();
      const A = this.g.arena;
      if (hit.kind === 'orb') {
        this.drag = { kind: 'move-orb', dx: A.x + this.step.orb.x * A.w - w.x, dy: A.y + this.step.orb.y * A.h - w.y };
      } else if (hit.kind === 'star') {
        this.drag = { kind: 'move-star', dx: A.x + this.step.star.x * A.w - w.x, dy: A.y + this.step.star.y * A.h - w.y };
      } else if (hit.h.type !== 'wave') {
        this.drag = { kind: 'move', h: hit.h, dx: A.x + hit.h.x * A.w - w.x, dy: A.y + hit.h.y * A.h - w.y };
      }
    }
  }

  onMove(sx, sy) {
    if (!this.drag) return;
    const W = this.g.w, H = this.g.h;
    const w = this.toWorld(sx, sy);
    const A = this.g.arena;
    const d = this.drag;
    if (d.kind === 'place') { d.cx = w.x; d.cy = w.y; }
    else if (d.kind === 'move') {
      d.h.x = +clamp((w.x + d.dx - A.x) / A.w, -0.12, 1.12).toFixed(3);
      d.h.y = +clamp((w.y + d.dy - A.y) / A.h, -0.12, 1.12).toFixed(3);
      this.refreshInspector(true);
    } else if (d.kind === 'move-star' && this.step.star) {
      this.step.star.x = +clamp((w.x + d.dx - A.x) / A.w, 0.03, 0.97).toFixed(3);
      this.step.star.y = +clamp((w.y + d.dy - A.y) / A.h, 0.03, 0.97).toFixed(3);
      this.refreshInspector(true);
    } else if (d.kind === 'move-orb') {
      this.step.orb.x = +clamp((w.x + d.dx - A.x) / A.w, 0.03, 0.97).toFixed(3);
      this.step.orb.y = +clamp((w.y + d.dy - A.y) / A.h, 0.03, 0.97).toFixed(3);
      this.refreshInspector(true);
    } else if (d.kind === 'delay') {
      const dr = this.delayRect(W, H);
      d.h.delay = +this.xToDelay(sx, dr).toFixed(2);
      this.refreshInspector(true);
    }
  }

  onUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'place') {
      this.place(d.type, d.x0, d.y0, d.cx - d.x0, d.cy - d.y0);
      this.tool = null;
      this.syncTools();
    } else if (d.kind === 'delay') this.sortHaz();
  }

  onKey(code, shift, meta) {
    if (code === 'Escape') { this.tool = null; this.syncTools(); return true; }
    if (code === 'Backspace' || code === 'Delete') { this.deleteSel(); return true; }
    if (code === 'KeyZ' && meta) { this.undo(); return true; }
    if (code === 'KeyD' && meta) { this.duplicateSel(); return true; }
    if (code === 'ArrowLeft') { this.selectStep(this.si - 1); return true; }
    if (code === 'ArrowRight') { this.selectStep(this.si + 1); return true; }
    return false;
  }

  /* ---------------------------------------------------------- dom panels */
  buildPalette() {
    const U = this.g.ui;
    U.edTools.innerHTML = '';
    const head = (t) => {
      const d = document.createElement('div');
      d.className = 'edhead'; d.textContent = t;
      U.edTools.appendChild(d);
    };

    head('COLOUR');
    const sw = document.createElement('div');
    sw.className = 'edswatches';
    this.colorBtns = [];
    for (let i = 0; i < NCOL; i++) {
      const b = document.createElement('button');
      b.className = 'edsw big';
      b.style.background = col(i, 1, 1);
      b.addEventListener('click', () => { this.color = i; this.syncTools(); });
      sw.appendChild(b);
      this.colorBtns.push(b);
    }
    U.edTools.appendChild(sw);

    head('PLACE');
    this.toolBtns = {};
    const mk = (id, label, hint) => {
      const b = document.createElement('button');
      b.className = 'edbtn';
      b.innerHTML = '<span>' + label + '</span><em>' + hint + '</em>';
      b.addEventListener('click', () => {
        this.tool = this.tool === id ? null : id;
        this.syncTools();
      });
      U.edTools.appendChild(b);
      this.toolBtns[id] = b;
    };
    mk('orb', 'Orb', 'click to move this step’s orb');
    mk('wave', 'Wave', 'drag the direction it sweeps');
    mk('shard', 'Shard', 'drag from where it starts');
    mk('bloom', 'Bloom', 'drag out from the centre');

    head('STEP');
    const act = (label, hint, fn) => {
      const b = document.createElement('button');
      b.className = 'edbtn';
      b.innerHTML = '<span>' + label + '</span><em>' + hint + '</em>';
      b.addEventListener('click', fn);
      U.edTools.appendChild(b);
    };
    act('+ Add step', 'a new orb after this one', () => this.addStep(this.si + 1));
    act('Duplicate', 'copy this step', () => this.duplicateStep());
    act('← Move back', 'earlier in the level', () => this.moveStep(-1));
    act('Move on →', 'later in the level', () => this.moveStep(1));
    act('Delete step', 'remove it entirely', () => this.deleteStep());
    this.syncTools();
  }

  syncTools() {
    if (this.toolBtns) {
      for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', this.tool === k);
    }
    if (this.colorBtns) {
      this.colorBtns.forEach((b, i) => b.classList.toggle('on', i === this.color));
    }
    const hints = {
      orb: 'Click in the arena to move this step’s orb.',
      wave: 'Drag in the arena: the direction it sweeps, longer for faster.',
      shard: 'Drag from where it spawns, in the direction it flies. Longer is faster.',
      bloom: 'Drag out from the centre. Longer means the petals fly faster.',
    };
    this.g.ui.edHint.textContent = this.tool ? hints[this.tool]
      : 'Click something to select it. Drag to move it. Drag its chip below to change when it arrives.';
  }

  syncFields() {
    const U = this.g.ui, L = this.level;
    U.edName.value = L.name;
    U.edDiff.value = L.difficulty;
  }

  refreshInspector(valuesOnly) {
    const U = this.g.ui;
    const sel = this.sel;
    if (!sel) {
      U.edInspect.innerHTML = '<div class="edhead">STEP ' + (this.si + 1) + ' OF ' +
        this.level.steps.length + '</div>' +
        '<p class="edtip">Pick a colour, pick a tool, then drag in the arena. ' +
        'Everything you place stays on screen.<br><br>The bar underneath shows when each ' +
        'thing arrives, in seconds after the step starts. The bright line is when the ' +
        'orb fades.</p>';
      return;
    }
    const isOrb = sel.kind === 'orb', isStar = sel.kind === 'star';
    const obj = isOrb ? this.step.orb : isStar ? this.step.star : sel.h;
    const spec = isOrb ? ORB_SPEC : isStar ? STAR_SPEC : HAZ_SPEC[sel.h.type];
    if (!obj) { this.sel = null; return this.refreshInspector(); }

    if (valuesOnly && this._for === obj) {
      for (const k in this._inputs) {
        const el = this._inputs[k];
        if (el && document.activeElement !== el) {
          el.value = obj[k];
          if (el._out) el._out.textContent = (+obj[k]).toFixed(el._int ? 0 : 2);
        }
      }
      return;
    }
    this._for = obj;
    this._inputs = {};
    U.edInspect.innerHTML = '';

    const h = document.createElement('div');
    h.className = 'edhead';
    h.textContent = isOrb ? 'ORB · STEP ' + (this.si + 1) : (spec.label || sel.h.type).toUpperCase();
    U.edInspect.appendChild(h);

    const row = (label, node) => {
      const d = document.createElement('label');
      d.className = 'edrow';
      const s = document.createElement('span'); s.textContent = label;
      d.appendChild(s); d.appendChild(node);
      U.edInspect.appendChild(d);
      return d;
    };

    for (const k in spec.fields) {
      const f = spec.fields[k];
      if (f.type === 'color' || f.type === 'color2') {
        const wrap = document.createElement('div');
        wrap.className = 'edswatches';
        const n = f.type === 'color2' ? NCOL + 1 : NCOL;
        for (let i = 0; i < n; i++) {
          const ci = f.type === 'color2' ? i - 1 : i;
          const b = document.createElement('button');
          b.className = 'edsw' + (obj[k] === ci ? ' on' : '');
          b.style.background = ci < 0 ? 'transparent' : col(ci, 1, 1);
          if (ci < 0) b.textContent = '×';
          b.addEventListener('click', () => { obj[k] = ci; this.dirty = true; this.refreshInspector(); });
          wrap.appendChild(b);
        }
        row(k, wrap);
        continue;
      }
      if (f.type === 'enum') {
        const s2 = document.createElement('select');
        f.values.forEach(v => {
          const o = document.createElement('option'); o.value = v; o.textContent = v;
          if (obj[k] === v) o.selected = true;
          s2.appendChild(o);
        });
        s2.addEventListener('change', () => { obj[k] = s2.value; this.dirty = true; });
        row(k, s2);
        continue;
      }
      const inp = document.createElement('input');
      const slider = f.type !== 'int';
      inp.type = slider ? 'range' : 'number';
      const mn = f.min !== undefined ? f.min : (f.type === 'unit' ? -0.12 : 0);
      const mx = f.max !== undefined ? f.max : (f.type === 'unit' ? 1.12 : 20);
      inp.min = mn; inp.max = mx;
      inp.step = f.type === 'int' ? 1 : (mx - mn) / 200;
      inp.value = obj[k];
      const out = document.createElement('em');
      out.textContent = (+obj[k]).toFixed(f.type === 'int' ? 0 : 2);
      inp._out = out; inp._int = f.type === 'int';
      inp.addEventListener('input', () => {
        obj[k] = +inp.value;
        out.textContent = (+obj[k]).toFixed(f.type === 'int' ? 0 : 2);
        if (k === 'delay') this.sortHaz();
        this.dirty = true;
      });
      this._inputs[k] = inp;
      row(k, inp).appendChild(out);
    }

    if (!isOrb) {
      const del = document.createElement('button');
      del.className = 'edbtn danger';
      del.innerHTML = '<span>Delete</span>';
      del.addEventListener('click', () => {
        if (isStar) { this.push(); this.step.star = null; this.sel = null; this.refreshInspector(); }
        else this.deleteSel();
      });
      U.edInspect.appendChild(del);
    }
  }

  /* -------------------------------------------------------------- save -- */
  save() {
    this.level.name = (this.g.ui.edName.value || 'UNTITLED').toUpperCase();
    this.level.difficulty = clamp(+this.g.ui.edDiff.value || 1, 1, 5);
    LevelStore.save(this.level);
    this.dirty = false;
    this.flash('Saved');
  }

  flash(msg) {
    const el = this.g.ui.edStatus;
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
}
