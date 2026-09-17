'use strict';
/* ============================================================================
   PRISM — editor.js

   A chart editor. The level is a run of PHRASES (default 8 beats / 2 bars),
   each normally holding one orb plus the routine that plays while you go and
   get it. Everything is locked to the music: an event's `beat` is when it
   becomes lethal, and its telegraph is subtracted automatically.

   Layout, all drawn onto the game canvas:
       ┌──────────────── arena preview ────────────────┐
       │        schematic of the chart at the playhead  │
       └────────────────────────────────────────────────┘
       ┌──────────────── timeline ─────────────────────┐
       │  lanes: wave / shard / bloom / orb             │
       └────────────────────────────────────────────────┘
   ========================================================================== */

const LANES = ['wave', 'shard', 'bloom', 'orb'];
const TL_H = 132;          // timeline strip height, screen px
const LANE_H = 22;

class Editor {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.level = null;
    this.beat = 0;
    this.playing = false;
    this.sel = null;          // selected event
    this.tool = null;         // armed placement tool
    this.snap = 0.5;          // beats
    this.phraseLen = 8;
    this.viewStart = -4;
    this.viewBeats = 40;
    this.drag = null;
    this.clipboard = null;
    this.undoStack = [];
    this.dirty = false;
  }

  /* ------------------------------------------------------------- open -- */
  open(level) {
    this.level = normaliseLevel(level ? JSON.parse(JSON.stringify(level)) : blankLevel(
      'custom-' + Date.now().toString(36), 'NEW LEVEL'));
    this.active = true;
    this.beat = 0;
    this.sel = null;
    this.playing = false;
    this.undoStack = [];
    this.dirty = false;
    this.g.music.load(getTrack(this.level.track));
    this.g.music.stop();
    this.buildPalette();
    this.syncFields();
    this.refreshInspector();
  }

  close() {
    this.active = false;
    this.playing = false;
    this.g.music.stop();
  }

  get spb() { return this.g.music.spb || (60 / 130); }

  /* ------------------------------------------------------------- undo -- */
  push() {
    this.undoStack.push(JSON.stringify(this.level.events));
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.dirty = true;
  }
  undo() {
    if (!this.undoStack.length) return;
    this.level.events = JSON.parse(this.undoStack.pop());
    this.sel = null;
    this.refreshInspector();
  }

  /* ------------------------------------------------------- edit actions */
  addEvent(type, atBeat, opts) {
    const spec = EVENT_SPEC[type];
    if (!spec) return null;
    const e = { type, beat: this.snapBeat(atBeat === undefined ? this.beat : atBeat) };
    for (const k in spec.fields) e[k] = spec.fields[k].def;
    e.color = this.g.editorColor === undefined ? 0 : this.g.editorColor;
    if (opts) Object.assign(e, opts);
    this.push();
    this.level.events.push(e);
    this.sortEvents();
    this.sel = e;
    this.refreshInspector();
    return e;
  }

  stampPattern(id, atBeat) {
    const p = getPattern(id);
    if (!p) return;
    const b = this.snapBeat(atBeat === undefined ? this.beat : atBeat);
    const evs = p.make(b, this.g.editorColor || 0, {});
    this.push();
    for (const raw of evs) {
      const spec = EVENT_SPEC[raw.type];
      const e = { type: raw.type, beat: raw.beat };
      for (const k in spec.fields) e[k] = raw[k] === undefined ? spec.fields[k].def : raw[k];
      this.level.events.push(e);
    }
    this.sortEvents();
    this.sel = null;
    this.refreshInspector();
  }

  /* the structural move: a phrase of N beats holding an orb and a routine */
  addPhrase(patternId) {
    const start = this.snapBeat(this.beat);
    const c = this.g.editorColor || 0;
    this.push();
    /* the orb lands on the downbeat and expires just before the phrase ends */
    const spec = EVENT_SPEC.orb;
    const orb = { type: 'orb', beat: start };
    for (const k in spec.fields) orb[k] = spec.fields[k].def;
    orb.color = c;
    orb.x = rand(0.18, 0.82);
    orb.y = rand(0.2, 0.8);
    orb.life = Math.max(3, this.phraseLen - 1);
    this.level.events.push(orb);
    if (patternId) {
      const p = getPattern(patternId);
      if (p) for (const raw of p.make(start + 2, c, {})) {
        const s2 = EVENT_SPEC[raw.type];
        const e = { type: raw.type, beat: raw.beat };
        for (const k in s2.fields) e[k] = raw[k] === undefined ? s2.fields[k].def : raw[k];
        this.level.events.push(e);
      }
    }
    this.sortEvents();
    this.level.length = Math.max(this.level.length, start + this.phraseLen);
    /* the goal tracks the orbs you have placed, until you override it */
    this.level.orbGoal = this.level.events.filter(e => e.type === 'orb').length;
    this.g.ui.edGoal.value = this.level.orbGoal;
    this.sel = orb;
    this.beat = start + this.phraseLen;
    this.syncFields();
    this.refreshInspector();
  }

  deleteSel() {
    if (!this.sel) return;
    this.push();
    const i = this.level.events.indexOf(this.sel);
    if (i >= 0) this.level.events.splice(i, 1);
    this.sel = null;
    this.refreshInspector();
  }
  duplicateSel() {
    if (!this.sel) return;
    this.push();
    const c = Object.assign({}, this.sel);
    c.beat = this.snapBeat(c.beat + this.phraseLen);
    this.level.events.push(c);
    this.sortEvents();
    this.sel = c;
    this.refreshInspector();
  }
  sortEvents() { this.level.events.sort((a, b) => a.beat - b.beat); }
  snapBeat(b) { return this.snap > 0 ? Math.round(b / this.snap) * this.snap : b; }

  /* ------------------------------------------------------------- state --
     Where an event is at a given beat. Analytic, so scrubbing is instant. */
  stateAt(e, beat) {
    const tele = e.telegraph || 0;
    const d = beat - e.beat;                 // beats since it went live
    if (e.type === 'orb') {
      if (d < 0) return null;
      if (d > (e.life || 8)) return { phase: 'gone' };
      return { phase: 'live', frac: 1 - d / (e.life || 8) };
    }
    if (d < -tele) return null;
    if (d < 0) return { phase: 'tele', k: 1 + d / Math.max(0.001, tele) };
    const sec = d * this.spb;
    const A = this.g.arena;
    if (e.type === 'wave') {
      const nx = Math.cos(e.angle * DEG), ny = Math.sin(e.angle * DEG);
      const ext = Math.abs(A.w * 0.5 * nx) + Math.abs(A.h * 0.5 * ny);
      const th = e.thickness * A.w;
      const s = -(ext + th) + (e.speed * A.w) * sec;
      if (s > ext + th) return { phase: 'gone' };
      return { phase: 'live', s, nx, ny, th };
    }
    if (e.type === 'shard') {
      const a = e.angle * DEG, sp = e.speed * A.w;
      const x = A.x + e.x * A.w + Math.cos(a) * sp * sec;
      const y = A.y + e.y * A.h + Math.sin(a) * sp * sec;
      const m = 180;
      if (x < A.x - m || x > A.x + A.w + m || y < A.y - m || y > A.y + A.h + m) return { phase: 'gone' };
      return { phase: 'live', x, y };
    }
    if (e.type === 'bloom') {
      if (sec > 3.2) return { phase: 'gone' };
      return { phase: 'live', r: (e.speed * A.w) * sec };
    }
    return null;
  }

  /* -------------------------------------------------------------- loop -- */
  update(rdt) {
    if (!this.active) return;
    if (this.playing) {
      const mb = this.g.music.beatFloat();
      if (mb !== null) this.beat = mb;
      else this.beat += rdt / this.spb;
      if (this.beat > this.level.length) { this.beat = this.level.length; this.setPlaying(false); }
      /* keep the playhead in view */
      if (this.beat > this.viewStart + this.viewBeats * 0.75) {
        this.viewStart = this.beat - this.viewBeats * 0.45;
      }
    }
    this.g.ui.edBeat.textContent = this.beat.toFixed(2);
    const bar = Math.floor(this.beat / 4) + 1;
    this.g.ui.edBar.textContent = 'bar ' + bar;
  }

  setPlaying(p) {
    this.playing = p;
    const m = this.g.music;
    if (p) {
      if (m.available) {
        try { m.el.currentTime = Math.max(0, this.beat * this.spb + m.offset); } catch (e) { }
        m.start(false);
        m.duck(1);
      }
    } else m.stop();
    this.g.ui.edPlay.textContent = p ? 'Pause' : 'Play';
  }

  /* -------------------------------------------------------------- draw -- */
  draw(ctx) {
    const g = this.g, W = g.w, H = g.h;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.fillStyle = '#101115';
    ctx.fillRect(0, 0, W, H);

    /* ---- arena region ---- */
    const top = 60, bottom = H - TL_H - 34;
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

    this.drawTimeline(ctx, W, H);
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

    for (const e of this.level.events) {
      const st = this.stateAt(e, this.beat);
      if (!st || st.phase === 'gone') continue;
      this.drawEvent(ctx, e, st, e === this.sel);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(238,241,246,.2)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.stroke();
  }

  drawEvent(ctx, e, st, selected) {
    const A = this.g.arena;
    const tele = st.phase === 'tele';
    const a = tele ? 0.25 + 0.3 * st.k : 0.8;

    if (e.type === 'wave') {
      const L = Math.hypot(A.w, A.h);
      const nx = Math.cos(e.angle * DEG), ny = Math.sin(e.angle * DEG);
      const ext = Math.abs(A.w * 0.5 * nx) + Math.abs(A.h * 0.5 * ny);
      const th = e.thickness * A.w;
      const s = tele ? -(ext - th * 0.5) : st.s;
      ctx.save();
      ctx.translate(A.x + A.w / 2, A.y + A.h / 2);
      ctx.rotate(e.angle * DEG);
      ctx.fillStyle = col(e.color, 1, a * 0.5);
      ctx.fillRect(s - th / 2, -L, th, L * 2);
      ctx.strokeStyle = col(e.color, 1.3, a);
      ctx.lineWidth = 3;
      ctx.strokeRect(s - th / 2, -L, th, L * 2);
      /* travel arrow */
      ctx.fillStyle = col(e.color, 1.3, a);
      for (let y = -L * 0.3; y <= L * 0.3; y += 150) {
        ctx.beginPath();
        ctx.moveTo(s + th / 2 + 26, y); ctx.lineTo(s + th / 2 + 6, y - 11); ctx.lineTo(s + th / 2 + 6, y + 11);
        ctx.closePath(); ctx.fill();
      }
      if (selected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        ctx.strokeRect(s - th / 2, -L, th, L * 2);
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }

    const x = st.x !== undefined ? st.x : A.x + e.x * A.w;
    const y = st.y !== undefined ? st.y : A.y + e.y * A.h;

    if (e.type === 'shard') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.angle * DEG);
      ctx.fillStyle = col(e.color, 1, a);
      polyPath(ctx, 0, 0, e.radius * A.w, e.sides, 0);
      ctx.fill();
      ctx.strokeStyle = col(e.color, 1.4, a); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
      if (tele || selected) {
        const sp = 1;
        ctx.strokeStyle = col(e.color, 1, 0.3);
        ctx.setLineDash([9, 9]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(e.angle * DEG) * 1700 * sp, y + Math.sin(e.angle * DEG) * 1700 * sp);
        ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (e.type === 'bloom') {
      ctx.strokeStyle = col(e.color, 1.2, a);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, tele ? 90 : Math.max(8, st.r), 0, TAU); ctx.stroke();
      ctx.fillStyle = col(e.color, 1, a);
      polyPath(ctx, x, y, 14, 6, 0); ctx.fill();
      const pr = tele ? 70 : Math.max(10, st.r);
      for (let i = 0; i < e.petals; i++) {
        const ang = (e.spin || 0) * DEG + i / e.petals * TAU;
        const ci = (e.color2 >= 0 && i % 2) ? e.color2 : e.color;
        ctx.fillStyle = col(ci, 1, a * 0.9);
        polyPath(ctx, x + Math.cos(ang) * pr, y + Math.sin(ang) * pr, 9, 4, 0);
        ctx.fill();
      }
    } else if (e.type === 'orb') {
      ctx.strokeStyle = col(e.color, 1, 0.25);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 38, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col(e.color, 1.3, 0.95);
      ctx.beginPath();
      ctx.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + TAU * (st.frac || 1));
      ctx.stroke();
      ctx.fillStyle = col(e.color, 1, 0.95);
      polyPath(ctx, x, y, 19, 6, 0); ctx.fill();
    }

    if (selected && e.type !== 'wave') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.arc(x, y, 54, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ---------------------------------------------------------- timeline -- */
  tlRect(W, H) { return { x: 16, y: H - TL_H, w: W - 32, h: TL_H - 10 }; }
  beatToX(b, r) { return r.x + (b - this.viewStart) / this.viewBeats * r.w; }
  xToBeat(x, r) { return this.viewStart + (x - r.x) / r.w * this.viewBeats; }

  drawTimeline(ctx, W, H) {
    const r = this.tlRect(W, H);
    ctx.fillStyle = '#17181c';
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.clip();

    /* bars and phrases */
    const b0 = Math.floor(this.viewStart), b1 = Math.ceil(this.viewStart + this.viewBeats);
    for (let b = b0; b <= b1; b++) {
      const x = this.beatToX(b, r);
      const isPhrase = b % this.phraseLen === 0;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isPhrase ? 'rgba(238,241,246,.26)' : isBar ? 'rgba(238,241,246,.12)' : 'rgba(238,241,246,.05)';
      ctx.lineWidth = isPhrase ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke();
      if (isPhrase && b >= 0) {
        ctx.fillStyle = 'rgba(238,241,246,.4)';
        ctx.font = '600 9px ui-monospace, Menlo, monospace';
        ctx.fillText(String(b), x + 4, r.y + 12);
      }
    }

    /* past the end of the level */
    const ex = this.beatToX(this.level.length, r);
    if (ex < r.x + r.w) {
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      ctx.fillRect(ex, r.y, r.x + r.w - ex, r.h);
      ctx.strokeStyle = '#d9705e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex, r.y); ctx.lineTo(ex, r.y + r.h); ctx.stroke();
    }

    /* lanes */
    const laneTop = r.y + 18;
    LANES.forEach((ln, i) => {
      const y = laneTop + i * LANE_H;
      ctx.fillStyle = 'rgba(255,255,255,.02)';
      ctx.fillRect(r.x, y, r.w, LANE_H - 3);
      ctx.fillStyle = 'rgba(238,241,246,.3)';
      ctx.font = '600 8px ui-monospace, Menlo, monospace';
      ctx.fillText(ln.toUpperCase(), r.x + 4, y + 12);
    });

    /* chips */
    for (const e of this.level.events) {
      const li = LANES.indexOf(e.type);
      if (li < 0) continue;
      const x = this.beatToX(e.beat, r);
      if (x < r.x - 40 || x > r.x + r.w + 40) continue;
      const y = laneTop + li * LANE_H;
      const tele = e.telegraph || 0;
      /* the telegraph tail shows when it actually appears */
      if (tele > 0) {
        const tx = this.beatToX(e.beat - tele, r);
        ctx.fillStyle = col(e.color, 1, 0.18);
        ctx.fillRect(tx, y + 6, x - tx, LANE_H - 15);
      }
      if (e.type === 'orb') {
        const lx = this.beatToX(e.beat + (e.life || 8), r);
        ctx.fillStyle = col(e.color, 1, 0.16);
        ctx.fillRect(x, y + 6, lx - x, LANE_H - 15);
      }
      ctx.fillStyle = col(e.color, 1, e === this.sel ? 1 : 0.85);
      roundRectPath(ctx, x - 4, y + 3, 8, LANE_H - 9, 2);
      ctx.fill();
      if (e === this.sel) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        roundRectPath(ctx, x - 5.5, y + 1.5, 11, LANE_H - 6, 3);
        ctx.stroke();
      }
    }

    /* playhead */
    const px = this.beatToX(this.beat, r);
    ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + r.h); ctx.stroke();
    ctx.fillStyle = '#eef1f6';
    ctx.beginPath();
    ctx.moveTo(px - 6, r.y); ctx.lineTo(px + 6, r.y); ctx.lineTo(px, r.y + 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------- mouse -- */
  hitEventAtArena(wx, wy) {
    const A = this.g.arena;
    let best = null, bd = 60 * 60;
    for (const e of this.level.events) {
      if (e.type === 'wave') continue;
      const st = this.stateAt(e, this.beat);
      if (!st || st.phase === 'gone') continue;
      const x = st.x !== undefined ? st.x : A.x + e.x * A.w;
      const y = st.y !== undefined ? st.y : A.y + e.y * A.h;
      const d = dist2(wx, wy, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  hitChip(sx, sy, W, H) {
    const r = this.tlRect(W, H);
    if (sy < r.y) return null;
    const laneTop = r.y + 18;
    const li = Math.floor((sy - laneTop) / LANE_H);
    if (li < 0 || li >= LANES.length) return null;
    const type = LANES[li];
    let best = null, bd = 9;
    for (const e of this.level.events) {
      if (e.type !== type) continue;
      const d = Math.abs(this.beatToX(e.beat, r) - sx);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  onDown(sx, sy, button) {
    const W = this.g.w, H = this.g.h;
    const r = this.tlRect(W, H);

    /* --- timeline --- */
    if (sy >= r.y) {
      const chip = this.hitChip(sx, sy, W, H);
      if (chip) {
        this.sel = chip;
        this.refreshInspector();
        this.push();
        this.drag = { kind: 'chip', e: chip, ox: this.beatToX(chip.beat, r) - sx };
      } else {
        this.setPlaying(false);
        this.beat = Math.max(0, this.snapBeat(this.xToBeat(sx, r)));
        this.drag = { kind: 'scrub' };
      }
      return;
    }

    /* --- arena --- */
    if (!this.view) return;
    const wx = (sx - this.view.ox) / this.view.s;
    const wy = (sy - this.view.oy) / this.view.s;
    const A = this.g.arena;
    const inside = wx > A.x - 120 && wx < A.x + A.w + 120 && wy > A.y - 120 && wy < A.y + A.h + 120;
    if (!inside) return;

    if (this.tool) {
      const nx = clamp((wx - A.x) / A.w, -0.1, 1.1);
      const ny = clamp((wy - A.y) / A.h, -0.1, 1.1);
      const o = {};
      if (this.tool !== 'wave') { o.x = +nx.toFixed(3); o.y = +ny.toFixed(3); }
      this.addEvent(this.tool, this.beat, o);
      return;
    }
    const hit = this.hitEventAtArena(wx, wy);
    this.sel = hit;
    this.refreshInspector();
    if (hit && hit.type !== 'wave') {
      this.push();
      const x = A.x + hit.x * A.w, y = A.y + hit.y * A.h;
      this.drag = { kind: 'move', e: hit, dx: x - wx, dy: y - wy };
    }
  }

  onMove(sx, sy) {
    if (!this.drag) return;
    const W = this.g.w, H = this.g.h;
    const r = this.tlRect(W, H);
    if (this.drag.kind === 'scrub') {
      this.beat = Math.max(0, this.snapBeat(this.xToBeat(sx, r)));
    } else if (this.drag.kind === 'chip') {
      this.drag.e.beat = Math.max(0, this.snapBeat(this.xToBeat(sx + this.drag.ox, r)));
    } else if (this.drag.kind === 'move' && this.view) {
      const A = this.g.arena;
      const wx = (sx - this.view.ox) / this.view.s + this.drag.dx;
      const wy = (sy - this.view.oy) / this.view.s + this.drag.dy;
      this.drag.e.x = +clamp((wx - A.x) / A.w, -0.1, 1.1).toFixed(3);
      this.drag.e.y = +clamp((wy - A.y) / A.h, -0.1, 1.1).toFixed(3);
      this.refreshInspector(true);
    }
  }

  onUp() {
    if (this.drag && this.drag.kind === 'chip') this.sortEvents();
    this.drag = null;
  }

  onWheel(dy, sx, sy) {
    const W = this.g.w, H = this.g.h;
    const r = this.tlRect(W, H);
    if (sy >= r.y) {
      const at = this.xToBeat(sx, r);
      const f = dy > 0 ? 1.15 : 1 / 1.15;
      this.viewBeats = clamp(this.viewBeats * f, 8, 160);
      this.viewStart = at - (at - this.viewStart) * f;
    } else {
      this.viewStart += dy > 0 ? 2 : -2;
    }
  }

  onKey(code, shift, meta) {
    if (code === 'Space') { this.setPlaying(!this.playing); return true; }
    if (code === 'Backspace' || code === 'Delete') { this.deleteSel(); return true; }
    if (code === 'KeyD' && meta) { this.duplicateSel(); return true; }
    if (code === 'KeyZ' && meta) { this.undo(); return true; }
    if (code === 'KeyC' && meta) { this.clipboard = this.sel ? Object.assign({}, this.sel) : null; return true; }
    if (code === 'KeyV' && meta && this.clipboard) {
      this.push();
      const c = Object.assign({}, this.clipboard);
      c.beat = this.snapBeat(this.beat);
      this.level.events.push(c); this.sortEvents();
      this.sel = c; this.refreshInspector();
      return true;
    }
    if (code === 'ArrowLeft') { this.beat = Math.max(0, this.beat - this.snap); return true; }
    if (code === 'ArrowRight') { this.beat = this.beat + this.snap; return true; }
    return false;
  }

  /* ---------------------------------------------------------- dom panels */
  buildPalette() {
    const U = this.g.ui;
    U.edTools.innerHTML = '';
    const mk = (label, hint, fn, cls) => {
      const b = document.createElement('button');
      b.className = 'edbtn ' + (cls || '');
      b.innerHTML = '<span>' + label + '</span>' + (hint ? '<em>' + hint + '</em>' : '');
      b.addEventListener('click', fn);
      U.edTools.appendChild(b);
      return b;
    };

    const h = document.createElement('div');
    h.className = 'edhead'; h.textContent = 'PLACE';
    U.edTools.appendChild(h);
    this.toolBtns = {};
    LANES.forEach(t => {
      this.toolBtns[t] = mk(EVENT_SPEC[t].label, '', () => {
        this.tool = this.tool === t ? null : t;
        this.syncTools();
      });
    });

    const h2 = document.createElement('div');
    h2.className = 'edhead'; h2.textContent = 'ROUTINES';
    U.edTools.appendChild(h2);
    PATTERNS.forEach(p => mk(p.name, p.hint, () => this.stampPattern(p.id)));

    const h3 = document.createElement('div');
    h3.className = 'edhead'; h3.textContent = 'PHRASE';
    U.edTools.appendChild(h3);
    mk('+ Orb only', 'an orb and nothing else', () => this.addPhrase(null), 'wide');
    mk('+ Orb + routine', 'orb plus a random routine', () => this.addPhrase(pick(PATTERNS).id), 'wide');
    this.syncTools();
  }

  syncTools() {
    if (!this.toolBtns) return;
    for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', this.tool === k);
    this.g.ui.edHint.textContent = this.tool
      ? 'Click in the arena to place a ' + EVENT_SPEC[this.tool].label.toLowerCase()
      : 'Click an object to select it. Drag to move. Drag its chip to retime.';
  }

  syncFields() {
    const U = this.g.ui, L = this.level;
    U.edName.value = L.name;
    U.edLen.value = L.length;
    U.edGoal.value = L.orbGoal;
    U.edDiff.value = L.difficulty;
    U.edPhrase.value = this.phraseLen;
    U.edSnap.value = String(this.snap);
  }

  refreshInspector(valuesOnly) {
    const U = this.g.ui;
    const e = this.sel;
    if (!e) {
      U.edInspect.innerHTML = '<div class="edhead">NOTHING SELECTED</div>' +
        '<p class="edtip">Pick a routine on the left to stamp it at the playhead, ' +
        'or place single objects and drag them around.</p>';
      return;
    }
    if (valuesOnly && this._inspFor === e) {
      for (const k in this._inspInputs) {
        const el = this._inspInputs[k];
        if (el && el.type === 'range' && document.activeElement !== el) el.value = e[k];
      }
      return;
    }
    this._inspFor = e;
    this._inspInputs = {};
    const spec = EVENT_SPEC[e.type];
    U.edInspect.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'edhead';
    head.textContent = spec.label.toUpperCase() + ' @ ' + e.beat.toFixed(2);
    U.edInspect.appendChild(head);

    const row = (label, node) => {
      const d = document.createElement('label');
      d.className = 'edrow';
      const s = document.createElement('span'); s.textContent = label;
      d.appendChild(s); d.appendChild(node);
      U.edInspect.appendChild(d);
      return d;
    };

    /* beat first — it is the field you tweak most */
    const bi = document.createElement('input');
    bi.type = 'number'; bi.step = String(this.snap); bi.value = e.beat;
    bi.addEventListener('input', () => { e.beat = +bi.value || 0; this.sortEvents(); this.dirty = true; });
    row('beat', bi);

    for (const k in spec.fields) {
      const f = spec.fields[k];
      if (k === 'color' || k === 'color2') {
        const wrap = document.createElement('div');
        wrap.className = 'edswatches';
        const n = k === 'color2' ? NCOL + 1 : NCOL;
        for (let i = 0; i < n; i++) {
          const ci = k === 'color2' ? i - 1 : i;
          const b = document.createElement('button');
          b.className = 'edsw' + (e[k] === ci ? ' on' : '');
          b.style.background = ci < 0 ? 'transparent' : col(ci, 1, 1);
          if (ci < 0) b.textContent = '×';
          b.addEventListener('click', () => { e[k] = ci; this.dirty = true; this.refreshInspector(); });
          wrap.appendChild(b);
        }
        row(k, wrap);
        continue;
      }
      if (f.type === 'enum') {
        const sel = document.createElement('select');
        f.values.forEach(v => {
          const o = document.createElement('option'); o.value = v; o.textContent = v;
          if (e[k] === v) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => { e[k] = sel.value; this.dirty = true; });
        row(k, sel);
        continue;
      }
      const inp = document.createElement('input');
      const isSlider = f.type === 'norm' || f.type === 'unit' || f.type === 'angle';
      inp.type = isSlider ? 'range' : 'number';
      const mn = f.min !== undefined ? f.min : (f.type === 'unit' ? -0.1 : 0);
      const mx = f.max !== undefined ? f.max : (f.type === 'unit' ? 1.1 : 64);
      inp.min = mn; inp.max = mx;
      inp.step = f.type === 'int' ? 1 : (mx - mn) / 200;
      inp.value = e[k];
      const out = document.createElement('em');
      out.textContent = (+e[k]).toFixed(f.type === 'int' ? 0 : 2);
      inp.addEventListener('input', () => {
        e[k] = +inp.value;
        out.textContent = (+e[k]).toFixed(f.type === 'int' ? 0 : 2);
        this.dirty = true;
      });
      this._inspInputs[k] = inp;
      const d = row(k, inp);
      d.appendChild(out);
    }

    const del = document.createElement('button');
    del.className = 'edbtn danger wide';
    del.innerHTML = '<span>Delete</span>';
    del.addEventListener('click', () => this.deleteSel());
    U.edInspect.appendChild(del);
  }

  /* -------------------------------------------------------------- save -- */
  save() {
    this.level.name = (this.g.ui.edName.value || 'UNTITLED').toUpperCase();
    this.level.length = Math.max(4, +this.g.ui.edLen.value || 78);
    this.level.orbGoal = Math.max(1, +this.g.ui.edGoal.value || 1);
    this.level.difficulty = clamp(+this.g.ui.edDiff.value || 1, 1, 5);
    this.level.events = this.level.events.filter(e => EVENT_SPEC[e.type]);
    this.sortEvents();
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
