'use strict';
/* ============================================================================
   PRISM — game.js
   ========================================================================== */

const TOTAL_ORBS = 15;

/* ========================================================================== */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 15;                 // collision radius
    this.half = 15;              // visual half-size
    this.maxSpeed = 430;
    this.accel = 20; this.decel = 13;
    this.colorIndex = 0;
    this.colorT = 1;             // 0..1 swap animation
    this.prevColor = 0;
    this.facing = -Math.PI / 2;
    this.tilt = 0;
    this.squash = 0;
    this.pop = 0;
    this.trail = [];
    this.dashT = 0; this.dashCool = 0;
    this.dashDur = 0.15; this.dashCd = 3.4;
    this.dashDX = 0; this.dashDY = 0;
    this.ghosts = [];
    this.invuln = 0;
    this.alive = true;
    this.spin = 0;
    this.rainbow = 0;        // 0..1 how "all colours" the body reads
    this.wasReady = true;
    this.justReady = false;
    this.readyPop = 0;
  }

  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.colorIndex = 0; this.prevColor = 0; this.colorT = 1;
    this.dashT = 0; this.dashCool = 0; this.invuln = 0;
    this.rainbow = 0; this.wasReady = true; this.justReady = false; this.readyPop = 0;
    this.trail.length = 0; this.ghosts.length = 0;
    this.alive = true; this.pop = 0; this.squash = 0;
  }

  get dashReady() { return this.dashCool <= 0; }

  setColor(i, g) {
    i = ((i % NCOL) + NCOL) % NCOL;
    if (i === this.colorIndex) return false;
    this.prevColor = this.colorIndex;
    this.colorIndex = i;
    this.colorT = 0;
    this.pop = 1;
    g.audio.swap(i);
    g.fx.ring(this.x, this.y, { r0: this.half * 1.2, r1: 56, life: 0.3, ci: i, width: 3, alpha: 0.75 });
    g.fx.burst(this.x, this.y, 7, { ci: i, speed: 190, life: 0.3, size: 4, shape: 'square', drag: 4 });
    return true;
  }

  tryDash(ix, iy, g) {
    if (this.dashCool > 0 || this.dashT > 0) return false;
    let dx = ix, dy = iy;
    if (len(dx, dy) < 0.2) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
    const l = len(dx, dy) || 1;
    this.dashDX = dx / l; this.dashDY = dy / l;
    this.dashT = this.dashDur;
    this.dashCool = this.dashCd;
    this.invuln = this.dashDur + 0.12;
    this.facing = Math.atan2(this.dashDY, this.dashDX);
    return true;
  }

  update(dt, ctrl, g) {
    const ix = ctrl.moveX, iy = ctrl.moveY;
    const mag = len(ix, iy);

    this.dashCool = Math.max(0, this.dashCool - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    /* the moment it comes back, say so */
    const ready = this.dashCool <= 0;
    this.justReady = ready && !this.wasReady;
    this.wasReady = ready;
    if (this.justReady) this.readyPop = 1;
    this.readyPop = damp(this.readyPop, 0, 5, dt);
    this.rainbow = damp(this.rainbow, (this.dashT > 0 || this.invuln > 0) ? 1 : 0,
      this.dashT > 0 ? 26 : 9, dt);
    this.colorT = Math.min(1, this.colorT + dt * 7);
    this.pop = damp(this.pop, 0, 9, dt);
    this.spin += dt * 0.6;

    const pvx = this.vx, pvy = this.vy;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = clamp01(this.dashT / this.dashDur);
      const sp = lerp(this.maxSpeed * 1.1, 1250, Ease.outQuad(k));
      this.vx = this.dashDX * sp; this.vy = this.dashDY * sp;
      this.ghostT = (this.ghostT || 0) - dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.022;
        this.ghosts.push({ x: this.x, y: this.y, t: 0, rot: this.tilt, ci: this.ghostCi = ((this.ghostCi || 0) + 1) % NCOL });
      }
    } else {
      const lam = mag > 0.01 ? this.accel : this.decel;
      this.vx = damp(this.vx, ix * this.maxSpeed, lam, dt);
      this.vy = damp(this.vy, iy * this.maxSpeed, lam, dt);
      if (mag < 0.01 && len(this.vx, this.vy) < 6) { this.vx *= 0.2; this.vy *= 0.2; }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    /* the arena is a hard box */
    const A = g.arena, m = this.half;
    if (this.x < A.x + m) { this.x = A.x + m; this.vx = Math.max(0, this.vx) * 0.4; }
    if (this.x > A.x + A.w - m) { this.x = A.x + A.w - m; this.vx = Math.min(0, this.vx) * 0.4; }
    if (this.y < A.y + m) { this.y = A.y + m; this.vy = Math.max(0, this.vy) * 0.4; }
    if (this.y > A.y + A.h - m) { this.y = A.y + A.h - m; this.vy = Math.min(0, this.vy) * 0.4; }

    /* feel */
    const sp = len(this.vx, this.vy);
    if (sp > 12) this.facing = dampAngle(this.facing, Math.atan2(this.vy, this.vx), 16, dt);
    const acc = len((this.vx - pvx) / Math.max(dt, 1e-4), (this.vy - pvy) / Math.max(dt, 1e-4));
    this.squash = damp(this.squash, clamp(acc / 7000, 0, 0.3) + (this.dashT > 0 ? 0.3 : 0), 14, dt);
    this.tilt = dampAngle(this.tilt, clamp(this.vx / this.maxSpeed, -1, 1) * 0.34, 9, dt);

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].t += dt;
      if (this.ghosts[i].t > 0.24) this.ghosts.splice(i, 1);
    }
    this.trailT = (this.trailT || 0) - dt;
    if (this.trailT <= 0 && sp > 60) {
      this.trailT = 0.02;
      this.trail.push({ x: this.x, y: this.y, t: 0, ci: this.colorIndex });
      if (this.trail.length > 16) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].t += dt;
      if (this.trail[i].t > 0.3) this.trail.splice(i, 1);
    }
  }

  draw(ctx, g) {
    const ci = this.colorIndex;
    const dashing = this.dashT > 0 || this.invuln > 0;

    /* trail */
    for (let i = 1; i < this.trail.length; i++) {
      const q = this.trail[i];
      const age = 1 - clamp01(q.t / 0.3);
      const s = this.half * 0.8 * age;
      if (s < 0.6) continue;
      ctx.fillStyle = col(q.ci, 1, 0.1 * age * age);
      roundRectPath(ctx, q.x - s, q.y - s, s * 2, s * 2, s * 0.35);
      ctx.fill();
    }
    /* dash afterimages */
    for (const gh of this.ghosts) {
      const a = (1 - gh.t / 0.24) * 0.45;
      const s = this.half * (1 + gh.t * 1.2);
      ctx.save();
      ctx.translate(gh.x, gh.y); ctx.rotate(gh.rot);
      /* each afterimage takes the next colour, so a dash smears a rainbow */
      ctx.fillStyle = col(gh.ci, 1, a * 0.5);
      roundRectPath(ctx, -s, -s, s * 2, s * 2, s * 0.32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,244,250,' + (a * 0.7) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    const pop = 1 + this.pop * 0.3;
    const sx = (1 + this.squash) * pop;
    const sy = (1 - this.squash * 0.62) * pop;

    ctx.save();
    ctx.translate(this.x, this.y);

    /* a soft pool so the cube sits on the floor rather than over it */
    softGlow(ctx, 0, 6, this.half * 4.6, hueOf(ci), 55, 52, 0.2);

    ctx.rotate(this.facing);
    ctx.scale(sx, sy);
    ctx.rotate(-this.facing);
    ctx.rotate(this.tilt);

    const s = this.half;
    /* drop shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRectPath(ctx, -s + 2, -s + 5, s * 2, s * 2, s * 0.34);
    ctx.fill();

    /* body — cross-fades on a colour swap so the change reads as motion */
    if (this.colorT < 1) {
      ctx.fillStyle = col(this.prevColor, 1, 1);
      roundRectPath(ctx, -s, -s, s * 2, s * 2, s * 0.34);
      ctx.fill();
      ctx.globalAlpha = Ease.outQuad(this.colorT);
    }
    ctx.fillStyle = col(ci, 1, 1);
    roundRectPath(ctx, -s, -s, s * 2, s * 2, s * 0.34);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* dashing means every colour at once — so wear every colour at once */
    if (this.rainbow > 0.01) {
      const a = g.time * 3.2;
      const gx = Math.cos(a) * s, gy = Math.sin(a) * s;
      const grd = ctx.createLinearGradient(-gx, -gy, gx, gy);
      for (let i = 0; i <= NCOL; i++) grd.addColorStop(i / NCOL, col(i % NCOL, 1.08, 1));
      ctx.globalAlpha = this.rainbow;
      ctx.fillStyle = grd;
      roundRectPath(ctx, -s, -s, s * 2, s * 2, s * 0.34);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* inner facet catches the light */
    ctx.fillStyle = this.rainbow > 0.5 ? 'rgba(255,255,255,0.5)' : col(ci, 1.3, 0.55);
    roundRectPath(ctx, -s * 0.55, -s * 0.62, s * 1.1, s * 0.5, s * 0.16);
    ctx.fill();

    ctx.strokeStyle = dashing ? 'rgba(246,248,252,0.95)' : col(ci, 1.45, 0.95);
    ctx.lineWidth = dashing ? 3.4 : 2.6;
    roundRectPath(ctx, -s, -s, s * 2, s * 2, s * 0.34);
    ctx.stroke();
    ctx.restore();

    /* ---- dash state, spelled out around the body ---- */
    const R = this.half * 1.95;
    if (!this.dashReady) {
      /* charging: a dim track with an arc that fills */
      const k = 1 - this.dashCool / this.dashCd;
      ctx.strokeStyle = 'rgba(232,236,244,0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,236,244,0.4)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(this.x, this.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      /* ready: a dotted ring that rotates, so it reads even mid-chaos */
      const pop = 1 + this.readyPop * 0.45;
      const rr = R * pop;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(g.time * 1.5);
      ctx.strokeStyle = 'rgba(244,247,252,' + (0.7 + this.readyPop * 0.3) + ')';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.setLineDash([2.5, 11]);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      /* a counter-rotating inner set makes it unmistakably "armed" */
      ctx.rotate(-g.time * 2.6);
      ctx.strokeStyle = 'rgba(244,247,252,0.3)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 14]);
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.82, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.restore();
      if (this.readyPop > 0.02) {
        ctx.strokeStyle = 'rgba(244,247,252,' + (this.readyPop * 0.5) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, R * (1 + (1 - this.readyPop) * 0.9), 0, TAU);
        ctx.stroke();
      }
    }
  }
}

/* ========================================================================== */
class Orb {
  constructor(x, y, ci, life) {
    this.x = x; this.y = y; this.ci = ci;
    this.life = life; this.maxLife = life;
    this.t = 0; this.born = 0;
    this.r = 19;
    this.alive = true;
    this.spin = rand(0, TAU);
    this.taken = false;
    this.pullT = 0;
  }
  get frac() { return clamp01(this.life / this.maxLife); }

  update(dt, g) {
    this.t += dt;
    this.born = Math.min(1, this.born + dt * 3.4);
    this.spin += dt * 0.9;

    if (this.taken) {
      this.pullT += dt;
      const k = clamp01(this.pullT / 0.13);
      this.x = lerp(this.px, g.player.x, Ease.inQuint(k));
      this.y = lerp(this.py, g.player.y, Ease.inQuint(k));
      if (k >= 1) { this.alive = false; return 'done'; }
      return false;
    }

    this.life -= dt;
    if (this.life <= 0) return 'expired';

    const P = g.player;
    const d = dist(this.x, this.y, P.x, P.y);
    const match = P.colorIndex === this.ci;
    if (match && d < 150) {
      /* it leans toward you once you are wearing it */
      const pull = (1 - d / 150) * 150 * dt;
      this.x += (P.x - this.x) / (d || 1) * pull;
      this.y += (P.y - this.y) / (d || 1) * pull;
    }
    if (d < this.r + P.r) {
      if (match) { this.taken = true; this.px = this.x; this.py = this.y; this.pullT = 0; return false; }
      return 'reject';
    }
    return false;
  }

  draw(ctx, g) {
    if (!this.alive) return;
    const match = g.player.colorIndex === this.ci;
    const b = Ease.outBack(this.born);
    const beat = 1 + Math.sin(this.t * 4.2) * 0.05;
    const r = this.r * b * beat;
    const urgent = this.frac < 0.3 ? (0.5 + 0.5 * Math.sin(this.t * 16)) : 0;

    softGlow(ctx, this.x, this.y, r * 4.4, hueOf(this.ci), 60, 56, 0.2 + urgent * 0.12);

    /* the timer ring */
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = col(this.ci, 1, 0.16);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col(this.ci, 1.25, 0.9);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, -Math.PI / 2, -Math.PI / 2 + TAU * this.frac);
    ctx.stroke();
    ctx.lineCap = 'butt';

    /* the core */
    ctx.rotate(this.spin);
    ctx.fillStyle = col(this.ci, 1, 0.95);
    polyPath(ctx, 0, 0, r, 6, 0);
    ctx.fill();
    ctx.strokeStyle = col(this.ci, 1.45, 1);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(250,252,255,' + (match ? 0.85 : 0.35) + ')';
    polyPath(ctx, 0, 0, r * 0.42, 6, 0);
    ctx.fill();
    ctx.restore();

    /* when you are not wearing it, say so */
    if (!match) {
      ctx.save();
      ctx.strokeStyle = col(this.ci, 1, 0.3);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -this.t * 30;
      ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

/* ========================================================================== */
class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ui = ui;
    this.input = new InputManager(canvas);
    this.audio = new AudioEngine();
    this.fx = new Particles();
    this.shake = new Shaker();
    this.floats = [];

    this.arena = { x: 0, y: 0, w: 1280, h: 800, cx: 640, cy: 400 };
    this.player = new Player(640, 400);
    this.hazards = [];
    this.director = new Director(this);
    this.orb = null;

    this.state = 'title';
    this.mode = 'arcade';        // 'arcade' = endless ramp, 'level' = a chart
    this.runner = null;
    this.level = null;
    this.songBeat = 0;
    this.secPerBeat = 60 / 130;
    this.time = 0;
    this.lastTS = 0;
    this.timeScale = 1;
    this.freeze = 0;
    this.flash = 0;
    this.flashCi = 0;
    this.flashWhite = 1;
    this.vignette = 0.5;
    this.deathT = 0;
    this.collected = 0;
    this.best = storageGet('prism.best', 0);
    this.failReason = '';

    this.music = new Music(ui.music);
    this.editor = new Editor(this);
    this.editorColor = 0;
    this.testing = false;
    this._bindEditor();
    /* one clock drives the level: the soundtrack if we have it, the
       procedural pulse if not, and a plain timer if there is no audio at all */
    this.music.onBeat = (i) => this.director.onBeat(i);
    this.audio.onBeat = (i) => { if (!this.music.playing) this.director.onBeat(i); };
    this.input.onFirstInput = () => { this.audio.init(); this.audio.resume(); };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(true); });

    this.resize();
    this._bindUI();
    this.resetRun();
    this._raf = this._loop.bind(this);
    requestAnimationFrame(this._raf);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    /* fit the arena with a margin so the frame is always fully visible */
    this.scale = Math.min(w / (this.arena.w + 150), h / (this.arena.h + 150));
    this._vig = null;
  }

  /* -------------------------------------------------------------- editor */
  _bindEditor() {
    const U = this.ui, ed = this.editor, cv = this.canvas;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('mousedown', (e) => {
      if (this.state !== 'edit') return;
      const p = pos(e); ed.onDown(p.x, p.y); e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'edit') return;
      const p = pos(e); ed.onMove(p.x, p.y);
    });
    window.addEventListener('mouseup', () => { if (this.state === 'edit') ed.onUp(); });
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'edit') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (ed.onKey(e.code, e.shiftKey, e.metaKey || e.ctrlKey)) e.preventDefault();
    });

    U.edSave.addEventListener('click', () => ed.save());
    U.edBack.addEventListener('click', () => {
      if (ed.dirty && !confirm('Close without saving?')) return;
      ed.close(); this.showSelect();
    });
    U.edTest.addEventListener('click', () => {
      ed.save();
      this.testing = true;
      ed.close();
      this.startLevel(ed.level);
    });
    U.edExport.addEventListener('click', () => {
      const code = LevelStore.encode(ed.level);
      navigator.clipboard.writeText(code).then(
        () => ed.flash('Code copied — paste it to a friend'),
        () => window.prompt('Copy this level code:', code));
    });
    U.edImport.addEventListener('click', () => {
      const code = window.prompt('Paste a level code:');
      if (!code) return;
      const lv = LevelStore.decode(code);
      if (!lv) { ed.flash('That code did not parse'); return; }
      ed.open(lv); ed.flash('Imported ' + lv.name);
    });
    U.edName.addEventListener('input', () => { ed.dirty = true; });
    U.edDiff.addEventListener('input', () => { ed.dirty = true; });
  }

  openEditor(level) {
    this.state = 'edit';
    this.music.stop();
    this.ui.select.classList.add('hidden');
    this.ui.over.classList.add('hidden');
    this.ui.won.classList.add('hidden');
    this.ui.title.classList.add('hidden');
    this.ui.howto.classList.add('hidden');
    this.ui.hud.classList.remove('visible');
    this.ui.prog.classList.remove('visible');
    this.ui.editor.classList.add('on');
    this.editor.open(level);
  }

  /* ---------------------------------------------------------------- run -- */
  resetRun() {
    this.player.reset(this.arena.cx, this.arena.cy);
    this.hazards.length = 0;
    this.fx.clear();
    this.floats.length = 0;
    this.director.reset();
    this.collected = 0;
    this.chain = 0;
    this.timeScale = 1;
    this.freeze = 0;
    this.deathT = 0;
    this.flash = 0;
    this.failReason = '';
    this.orb = null;
    this.audio.resetBeat();
    this.audio.setIntensity(0);
    this._fbBeat = 0; this._fbIdx = 0;
    this.updateHUD(true);
  }

  allLevels() {
    return BUILTIN_LEVELS.concat(LevelStore.allCustom());
  }

  /* Linear unlock, but only across the built-ins — a level you made yourself
     is always playable, otherwise the editor would be gated behind the game. */
  unlockedCount() {
    const ls = BUILTIN_LEVELS;
    let n = 1;
    for (let i = 0; i < ls.length - 1; i++) {
      if (LevelStore.progressFor(ls[i].id).cleared) n++; else break;
    }
    return Math.min(n, ls.length);
  }
  isLocked(lv, i) {
    return lv.author === 'built-in' && i >= this.unlockedCount();
  }

  /* Start goes straight into the furthest level you have unlocked, so the
     shortest path from the rules page is still one button to playing. */
  playNext() {
    const n = this.unlockedCount();
    const open = BUILTIN_LEVELS.slice(0, n);
    const next = open.find(l => !LevelStore.progressFor(l.id).cleared) || open[n - 1];
    this.startLevel(next);
  }

  showTitle() {
    this.state = 'title';
    this.testing = false;
    this.ui.editor.classList.remove('on');
    this.ui.select.classList.add('hidden');
    this.ui.howto.classList.add('hidden');
    this.ui.over.classList.add('hidden');
    this.ui.won.classList.add('hidden');
    this.ui.title.classList.remove('hidden');
  }

  showSelect() {
    this.state = 'select';
    this.testing = false;
    this.music.stop();
    this.ui.editor.classList.remove('on');
    this.ui.title.classList.add('hidden');
    this.ui.howto.classList.add('hidden');
    this.ui.over.classList.add('hidden');
    this.ui.won.classList.add('hidden');
    this.ui.select.classList.remove('hidden');
    this.buildLevelSelect();
  }

  buildLevelSelect() {
    const grid = this.ui.levelGrid;
    grid.innerHTML = '';
    const ls = this.allLevels();

    ls.forEach((lv, i) => {
      const p = LevelStore.progressFor(lv.id);
      const locked = this.isLocked(lv, i);
      const card = document.createElement('button');
      card.className = 'lvl' + (p.cleared ? ' done' : '') + (locked ? ' locked' : '');
      const dots = Array.from({ length: 5 },
        (_, d) => '<i class="' + (d < lv.difficulty ? 'on' : '') + '"></i>').join('');
      card.innerHTML =
        '<span class="nm">' + (locked ? 'LOCKED' : lv.name) + '</span>' +
        '<div class="bar"><span style="width:' + (locked ? 0 : p.best) + '%"></span></div>' +
        '<div class="meta"><span class="diff">' + dots + '</span>' +
        '<span>' + (locked ? '—' : p.best + '%') + '</span></div>';
      if (!locked) card.addEventListener('click', () => this.startLevel(lv));
      grid.appendChild(card);

      /* your own levels can be opened in the editor */
      if (lv.author !== 'built-in') {
        const ed = document.createElement('button');
        ed.className = 'btn small';
        ed.style.cssText = 'margin:0;padding:.45em 1em;font-size:9px;';
        ed.textContent = 'Edit ' + lv.name;
        ed.addEventListener('click', () => this.openEditor(lv));
        grid.appendChild(ed);
      }
    });

    /* the procedural mode lives here too, always available */
    const card = document.createElement('button');
    card.className = 'lvl endless';
    card.innerHTML =
      '<span class="nm">ENDLESS</span>' +
      '<div class="bar"><span style="width:' + Math.round(this.best / TOTAL_ORBS * 100) + '%"></span></div>' +
      '<div class="meta"><span>PROCEDURAL</span><span>' + this.best + ' / ' + TOTAL_ORBS + '</span></div>';
    card.addEventListener('click', () => this.start());
    grid.appendChild(card);

    const nw = document.createElement('button');
    nw.className = 'lvl endless';
    nw.innerHTML = '<span class="nm">+ NEW LEVEL</span>' +
      '<div class="bar"><span style="width:0%"></span></div>' +
      '<div class="meta"><span>EDITOR</span><span>BUILD ONE</span></div>';
    nw.addEventListener('click', () => this.openEditor(null));
    grid.appendChild(nw);
  }

  /* how far through a level you are, measured in the thing you actually do */
  levelPercent() {
    if (!this.runner) return 0;
    return this.runner.percent;
  }

  /* back to wherever you came from */
  leaveRun() {
    if (this.testing) { this.testing = false; this.openEditor(this.editor.level); }
    else this.showSelect();
  }

  replay() {
    if (this.mode === 'level' && this.level) this.startLevel(this.level);
    else this.start();
  }

  /* a single page of rules, then straight in — retries skip it */
  showHowTo() {
    this.audio.init(); this.audio.resume();
    this.state = 'howto';
    this.ui.title.classList.add('hidden');
    this.ui.howto.classList.remove('hidden');
  }

  /* the endless ramp */
  start() {
    this.mode = 'arcade';
    this.level = null;
    this.runner = null;
    this.music.load(getTrack('trailer_2'));
    this.secPerBeat = this.music.spb;
    this._begin();
  }

  /* a designed chart */
  startLevel(level) {
    this.mode = 'level';
    this.level = normaliseLevel(level);
    this.music.load(getTrack(this.level.track));
    this.secPerBeat = this.music.spb;
    this.runner = new LevelRunner(this.level, this);
    this._begin();
    this.runner.begin();
  }

  _begin() {
    this.ui.editor.classList.remove('on');
    this.audio.init(); this.audio.resume();
    this.ui.howto.classList.add('hidden');
    this.ui.select.classList.add('hidden');
    /* the track restarts with every run, so a chart always opens on bar 1 */
    if (this.music.start(true)) this.audio.musicMode = true;
    this.music.duck(1);
    this.resetRun();
    this.state = 'play';
    this.ui.title.classList.add('hidden');
    this.ui.over.classList.add('hidden');
    this.ui.won.classList.add('hidden');
    this.ui.title.classList.add('hidden');
    this.songBeat = 0;
    if (this.runner) this.runner.reset();
    if (this.mode === 'arcade') this.spawnOrb();
    this.audio.setIntensity(0.1);
    this.updateHUD(true);
  }

  spawnOrb() {
    const A = this.arena, P = this.player;
    let x = 0, y = 0, best = -1;
    for (let i = 0; i < 16; i++) {
      const px = rand(A.x + 120, A.x + A.w - 120);
      const py = rand(A.y + 120, A.y + A.h - 120);
      const d = dist(px, py, P.x, P.y);
      /* far enough to be a journey, near enough to be fair */
      const score = d > 620 ? 620 - (d - 620) : d;
      if (score > best) { best = score; x = px; y = py; }
    }
    const r = this.director.ramp;
    const life = lerp(11, 5.4, r);
    let ci = randInt(0, NCOL - 1);
    if (this.orb) for (let i = 0; i < 4 && ci === this.orb.ci; i++) ci = randInt(0, NCOL - 1);
    this.orb = new Orb(x, y, ci, life);
    this.fx.ring(x, y, { r0: 8, r1: 80, life: 0.5, ci, width: 3, alpha: 0.6 });
    this.audio.blip(520 + ci * 30, 0.06, 0.18, 'sine');
  }

  /* a chart places its own orbs, at a beat, in a colour, with a lifetime */
  placeOrb(x, y, ci, lifeSec) {
    /* only one at a time: a second orb would make "miss it and die" unfair */
    this.orb = new Orb(x, y, ci, lifeSec);
    this.fx.ring(x, y, { r0: 8, r1: 80, life: 0.5, ci, width: 3, alpha: 0.6 });
    this.audio.blip(520 + ci * 30, 0.06, 0.18, 'sine');
  }

  /* --------------------------------------------------------------- loop -- */
  _loop(ts) {
    requestAnimationFrame(this._raf);
    if (!this.lastTS) this.lastTS = ts;
    let rdt = (ts - this.lastTS) / 1000;
    this.lastTS = ts;
    if (!isFinite(rdt) || rdt < 0) rdt = 0;
    rdt = Math.min(rdt, 1 / 20);

    this.input.update();
    this._keys();
    this.audio.tick();
    this.music.update(rdt);

    /* one continuous beat position, from the track when we have it */
    if (this.state === 'play') {
      const mb = this.music.beatFloat();
      if (mb !== null) { this.songBeat = mb; this.secPerBeat = this.music.spb; }
      else this.songBeat += (rdt * this.timeScale) / this.secPerBeat;
    }

    if (this.state === 'edit') {
      this.editor.update(rdt);
      this.editor.draw(this.ctx);
      this.input.endFrame();
      return;
    }

    if (!this.paused) {
      /* hit-stop, then whatever slow motion the state wants */
      this.freeze = Math.max(0, this.freeze - rdt);
      let ts2 = this.freeze > 0 ? 0.02 : this.timeScale;
      const dt = rdt * ts2;
      this.time += dt;
      this.realTime = (this.realTime || 0) + rdt;
      this.update(dt, rdt);
    }

    this.draw();
    this.input.endFrame();
  }

  _keys() {
    const I = this.input;
    if (I.hit('KeyM')) {
      const on = this.audio.toggleMute();
      this.music.setMuted(!on);
      document.body.classList.toggle('muted', !on);
    }
    if (this.state === 'title' && I.confirmPressed) this.showHowTo();
    if (this.state === 'howto' && I.confirmPressed) this.playNext();
    if (this.state === 'select' && I.padHit(1)) this.showTitle();
    if ((this.state === 'over' || this.state === 'won') && I.confirmPressed) this.replay();
    if (this.state === 'play') {
      if (I.hit('KeyR') || I.padHit(8)) this.die('RESTARTED', true);
      if (I.hit('Escape', 'KeyP') || I.padHit(9)) this.pause(!this.paused);
    } else if (this.paused && (I.hit('Escape', 'KeyP') || I.padHit(9))) this.pause(false);
  }

  pause(p) {
    if (this.state !== 'play') p = false;
    if (p === this.paused) return;
    this.paused = p;
    this.music.pause(p);
    this.ui.pause.classList.toggle('hidden', !p);
  }

  update(dt, rdt) {
    if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'dying') this.updateDying(rdt);
    else if (this.state === 'winning') this.updateWinning(rdt);
    else if (this.state === 'title' || this.state === 'howto' || this.state === 'select') this.updateTitle(dt);

    for (const h of this.hazards) if (!h.dead) h.update(dt, this);
    for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].dead) this.hazards.splice(i, 1);

    this.fx.update(dt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].update(dt);
      if (!this.floats[i].alive) this.floats.splice(i, 1);
    }
    this.shake.update(rdt);
    this.flash = Math.max(0, this.flash - rdt * 3.4);
    this.updateHUD(false);
  }

  updateTitle(dt) {
    /* a calm idle demo behind the menu */
    this.player.x = this.arena.cx + Math.cos(this.time * 0.6) * 150;
    this.player.y = this.arena.cy + Math.sin(this.time * 0.9) * 90;
    this.player.colorIndex = Math.floor(this.time * 0.6) % NCOL;
    this.player.update(dt, { moveX: 0, moveY: 0 }, this);
  }

  updatePlay(dt) {
    const I = this.input, P = this.player;

    /* The beat normally comes from the audio clock. If audio is muted,
       blocked or unsupported, run our own so the level still happens. */
    if (!this.audio.live && !this.music.playing) {
      this._fbBeat = (this._fbBeat || 0) - dt;
      if (this._fbBeat <= 0) {
        const bpm = 96 + this.director.ramp * 42;
        this._fbBeat = 60 / bpm;
        this.director.onBeat(this._fbIdx = (this._fbIdx || 0) + 1);
      }
    }

    /* ---- colour ---- */
    if (I.stickAngle !== null) {
      P.setColor(angleToIndex(I.stickAngle), this);
    } else if (I.colorIndex !== null) {
      P.setColor(I.colorIndex, this);
    } else if (I.colorStep) {
      P.setColor(P.colorIndex + I.colorStep, this);
    }
    if (I.dashPressed && P.tryDash(I.moveX, I.moveY, this)) this.onDash();

    P.update(dt, { moveX: I.moveX, moveY: I.moveY }, this);
    if (P.justReady) {
      this.audio.blip(880, 0.05, 0.1, 'sine');
      this.fx.ring(P.x, P.y, { r0: P.half * 2.6, r1: P.half * 1.9, life: 0.28, white: 1, width: 2, alpha: 0.7 });
    }

    /* ---- the level: steps, in order, in seconds ---- */
    if (this.mode === 'level' && this.runner) this.runner.update(dt);

    /* ---- orb ---- */
    if (this.orb) {
      const res = this.orb.update(dt, this);
      if (res === 'done') this.collect();
      else if (res === 'expired') this.die('THE ORB FADED');
      else if (res === 'reject') this.rejectOrb();
    }

    /* ---- hazards vs player ---- */
    for (const h of this.hazards) {
      if (h.dead || h.state !== 'live') continue;
      const hit = h.hits(P.x, P.y, P.r, this);
      if (!hit) { h.touched = false; continue; }
      const safe = P.colorIndex === h.ci || P.invuln > 0;
      if (safe) {
        if (!h.touched) { h.touched = true; this.onPhase(h); }
      } else {
        this.die(h instanceof Wave ? 'CAUGHT BY A WAVE' : 'HIT BY A SHARD');
        return;
      }
    }

    this.audio.setIntensity(0.1 + this.director.ramp * 0.9);
    this.vignette = damp(this.vignette, 0.42 + this.director.ramp * 0.16, 2, dt);
  }

  /* -------------------------------------------------------------- events */
  onDash() {
    const P = this.player;
    this.audio.dash();
    this.shake.add(0.07);
    this.input.rumble(80, 0.35, 0.25);
    const a = Math.atan2(P.dashDY, P.dashDX) + Math.PI;
    /* one spark per colour: the dash is every colour at once */
    for (let i = 0; i < NCOL; i++) {
      this.fx.burst(P.x, P.y, 3, {
        ci: i, speed: 270, life: 0.34, size: 4, shape: 'spark',
        dir: a, spread: 1.3, drag: 3.6,
      });
    }
    this.fx.burst(P.x, P.y, 6, {
      white: 1, speed: 300, life: 0.3, size: 4, shape: 'spark',
      dir: a, spread: 1.0, drag: 3.6,
    });
    for (let i = 0; i < NCOL; i++) {
      this.fx.ring(P.x, P.y, {
        r0: P.half * (0.8 + i * 0.12), r1: P.half * (2.6 + i * 0.4),
        life: 0.26 + i * 0.03, ci: i, width: 2, alpha: 0.5,
      });
    }
  }

  onPhase(h) {
    const P = this.player;
    this.audio.phase();
    this.shake.add(0.05);
    this.input.rumble(50, 0.2, 0.15);
    this.fx.burst(P.x, P.y, 10, {
      ci: h.ci, speed: 220, life: 0.35, size: 4, shape: 'spark', drag: 3.4,
    });
    this.fx.ring(P.x, P.y, { r0: P.half, r1: 70, life: 0.3, ci: h.ci, width: 3, alpha: 0.7 });
    this.flash = 0.1; this.flashCi = h.ci; this.flashWhite = 0;
  }

  rejectOrb() {
    if (this._rejT > 0) return;
    this._rejT = 0.4;
    const o = this.orb, P = this.player;
    const a = Math.atan2(P.y - o.y, P.x - o.x);
    P.vx += Math.cos(a) * 160; P.vy += Math.sin(a) * 160;
    this.audio.blip(150, 0.06, 0.1, 'square');
    this.shake.add(0.04);
    this.fx.burst(o.x, o.y, 6, { ci: o.ci, speed: 150, life: 0.25, size: 3, shape: 'dot', drag: 5 });
    this.floats.push(new FloatText(o.x, o.y - 34, 'WRONG COLOUR', o.ci, 13, 0.8));
  }

  collect() {
    const P = this.player, o = this.orb;
    this.collected++;
    this.chain++;
    if (this.mode === 'arcade') this.director.level = this.collected;

    this.audio.pickup(this.chain);
    this.shake.add(0.13);
    this.freeze = 0.05;
    this.input.rumble(110, 0.4, 0.45);
    this.flash = 0.16; this.flashCi = o.ci; this.flashWhite = 0;
    P.pop = 1;

    this.fx.burst(P.x, P.y, 24, { ci: o.ci, speed: 340, life: 0.6, size: 5, shape: 'spark', len: 20, drag: 2.6 });
    this.fx.burst(P.x, P.y, 10, { ci: o.ci, speed: 150, life: 0.8, size: 5, shape: 'square', drag: 2 });
    this.fx.ring(P.x, P.y, { r0: 10, r1: 130, life: 0.45, ci: o.ci, width: 4, alpha: 0.85 });
    this.fx.ring(P.x, P.y, { r0: 6, r1: 70, life: 0.3, white: 1, width: 3, alpha: 0.6 });
    this.floats.push(new FloatText(P.x, P.y - 40, this.collected + ' / ' + TOTAL_ORBS, o.ci, 19, 1.1));

    this.ui.count.classList.remove('pulse');
    void this.ui.count.offsetWidth;
    this.ui.count.classList.add('pulse');

    this.orb = null;
    if (this.mode === 'arcade') {
      if (this.collected >= TOTAL_ORBS) { this.win(); return; }
      this.spawnOrb();
    } else if (this.runner.orbCollected()) {
      this.win();
      return;
    }
  }

  die(reason, silent) {
    if (this.state !== 'play') return;
    this.state = 'dying';
    /* pin what this result is about now — starting another run while this
       sequence plays out must not write progress against the new level */
    this._resLevel = this.level;
    this._resPct = this.mode === 'level' ? this.levelPercent() : 0;
    this.failReason = reason;
    this.deathT = 0;
    this.freeze = 0.14;
    this.player.alive = false;
    this.shake.add(1);
    this.flash = 0.85; this.flashWhite = 1;
    this.input.rumble(600, 1, 1);
    this.music.duck(0.18);
    if (!silent) this.audio.death();

    const P = this.player;
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), sp = rand(80, 620);
      this.fx.spawn({
        x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        drag: rand(1.2, 2.6), maxLife: rand(0.7, 1.8),
        size: rand(4, 11), size1: 0, ci: P.colorIndex,
        white: i % 4 === 0 ? 1 : 0, shape: 'square', vr: rand(-10, 10),
      });
    }
    this.fx.ring(P.x, P.y, { r0: 10, r1: 320, life: 0.7, white: 1, width: 6, alpha: 0.9 });
    this.fx.ring(P.x, P.y, { r0: 6, r1: 190, life: 0.5, ci: P.colorIndex, width: 4, alpha: 0.8 });
  }

  updateDying(rdt) {
    this.deathT += rdt;
    /* everything winds down, then the screen arrives */
    this.timeScale = lerp(1, 0.06, Ease.outCubic(clamp01(this.deathT / 1.1)));
    this.vignette = damp(this.vignette, 0.95, 3, rdt);
    if (this.deathT > 1.5 && this.state === 'dying') {
      this.state = 'over';
      if (this.mode === 'level' && this._resLevel) {
        const pc = this._resPct;
        const p = LevelStore.record(this._resLevel.id, pc, false);
        this.ui.overCount.textContent = Math.round(pc) + '%';
        this.ui.overBest.textContent = p.best + '%';
        this.ui.overCountLabel.textContent = 'Reached';
        this.ui.overBestLabel.textContent = 'Best';
        this.ui.overLevelsBtn.textContent = this.testing ? 'Back to editor' : 'Levels';
      } else {
        this.best = Math.max(this.best, this.collected);
        storageSet('prism.best', this.best);
        this.ui.overCount.textContent = this.collected + ' / ' + TOTAL_ORBS;
        this.ui.overBest.textContent = this.best + ' / ' + TOTAL_ORBS;
        this.ui.overCountLabel.textContent = 'Orbs';
        this.ui.overBestLabel.textContent = 'Best';
      }
      this.ui.overWhy.textContent = this.failReason;
      this.ui.over.classList.remove('hidden');
    }
  }

  win() {
    this.state = 'winning';
    this._resLevel = this.level;
    this.deathT = 0;
    this.music.duck(0.5);
    this.audio.win();
    this.shake.add(0.5);
    this.flash = 0.6; this.flashWhite = 1;
    this.input.rumble(500, 0.5, 0.8);
    const P = this.player;
    for (let i = 0; i < 6; i++) {
      this.fx.ring(P.x, P.y, { r0: 10, r1: 180 + i * 110, life: 0.7 + i * 0.12, ci: i, width: 5 - i * 0.5, alpha: 0.7 });
    }
    this.fx.burst(P.x, P.y, 60, { ci: 3, speed: 520, life: 1.1, size: 6, shape: 'spark', len: 26, drag: 1.8 });
    /* clear the board */
    for (const h of this.hazards) h.dead = true;
  }

  updateWinning(rdt) {
    this.deathT += rdt;
    this.timeScale = lerp(1, 0.25, Ease.outCubic(clamp01(this.deathT / 1.2)));
    if (this.deathT > 1.6 && this.state === 'winning') {
      this.state = 'won';
      if (this.mode === 'level' && this._resLevel) {
        LevelStore.record(this._resLevel.id, 100, true);
        this.ui.wonTitle.textContent = this._resLevel.name + ' CLEARED';
        this.ui.wonCount.textContent = '100%';
        this.ui.wonCountLabel.textContent = 'Complete';
      } else {
        this.best = Math.max(this.best, this.collected);
        storageSet('prism.best', this.best);
        this.ui.wonTitle.textContent = 'CLEARED';
        this.ui.wonCount.textContent = '15 / 15';
        this.ui.wonCountLabel.textContent = 'All orbs';
      }
      this.ui.wonTime.textContent = (this.realTime || 0).toFixed(1) + 's';
      this.ui.wonLevelsBtn.textContent = this.testing ? 'Back to editor' : 'Levels';
      this.ui.won.classList.remove('hidden');
    }
  }

  /* --------------------------------------------------------------- draw -- */
  draw() {
    const ctx = this.ctx, A = this.arena;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#131417';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2 + this.shake.x * this.scale, this.h / 2 + this.shake.y * this.scale);
    ctx.rotate(this.shake.rot);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-A.cx, -A.cy);

    this._drawArena(ctx);

    ctx.save();
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.clip();

    if (this.orb) this.orb.draw(ctx, this);
    for (const h of this.hazards) if (!h.dead && h.state === 'tele') h.drawTele(ctx, this);
    for (const h of this.hazards) if (!h.dead && h.state === 'live') h.draw(ctx, this);
    this.fx.draw(ctx);
    if (this.player.alive) this.player.draw(ctx, this);
    for (const f of this.floats) f.draw(ctx);

    ctx.restore();

    /* frame drawn last so nothing spills over it */
    ctx.strokeStyle = 'rgba(236,240,248,0.16)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.stroke();
    ctx.restore();

    this._drawWheel(ctx);
    this._drawPost(ctx);
  }

  _drawArena(ctx) {
    const A = this.arena;
    ctx.save();
    roundRectPath(ctx, A.x, A.y, A.w, A.h, 18);
    ctx.fillStyle = '#25272c';
    ctx.fill();
    ctx.clip();
    /* a quiet grid for a sense of speed */
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = A.x + 80; x < A.x + A.w; x += 80) { ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); }
    for (let y = A.y + 80; y < A.y + A.h; y += 80) { ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
    ctx.stroke();
    /* centre mark */
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(A.cx, A.cy, 60, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* the six wedges, so a stick direction is never a guess */
  _drawWheel(ctx) {
    if (this.state === 'title' || this.state === 'howto' || this.state === 'select') return;
    const R = Math.max(42, Math.min(62, this.h * 0.075));
    const cx = this.w - R - 34, cy = this.h - R - 34;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(14,15,18,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, R * 1.32, 0, TAU); ctx.fill();
    const sel = this.player.colorIndex;
    for (let i = 0; i < NCOL; i++) {
      const a0 = indexToAngle(i) - Math.PI / NCOL;
      const a1 = indexToAngle(i) + Math.PI / NCOL;
      const on = i === sel;
      const rr = R * (on ? 1.12 : 0.9);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rr, a0 + 0.03, a1 - 0.03);
      ctx.closePath();
      ctx.fillStyle = col(i, on ? 1.1 : 0.66, on ? 1 : 0.4);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = 'rgba(246,248,252,0.9)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#1b1d21';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, TAU); ctx.fill();
    ctx.fillStyle = col(sel, 1, 1);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawPost(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    /* vignette */
    if (!this._vig || this._vigK !== Math.round(this.vignette * 30)) {
      const r = Math.hypot(this.w, this.h) * 0.5;
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, r * 0.42, this.w / 2, this.h / 2, r);
      g.addColorStop(0, 'rgba(8,9,11,0)');
      g.addColorStop(1, 'rgba(8,9,11,' + (0.55 * this.vignette + 0.15).toFixed(3) + ')');
      this._vig = g; this._vigK = Math.round(this.vignette * 30);
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.flash > 0.003) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.flashWhite
        ? 'rgba(236,240,248,' + Math.min(1, this.flash) + ')'
        : col(this.flashCi, 1, Math.min(1, this.flash));
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    /* the world drains of colour as it slows */
    if (this.state === 'dying' || this.state === 'over') {
      const k = clamp01(this.deathT / 1.2);
      ctx.fillStyle = 'rgba(10,11,14,' + (k * 0.45) + ')';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /* ----------------------------------------------------------------- ui -- */
  _bindUI() {
    this.ui.playBtn.addEventListener('click', () => this.showHowTo());
    this.ui.startBtn.addEventListener('click', () => this.playNext());
    this.ui.toLevelsBtn.addEventListener('click', () => this.showSelect());
    this.ui.selBackBtn.addEventListener('click', () => this.showTitle());
    this.ui.retryBtn.addEventListener('click', () => this.replay());
    this.ui.againBtn.addEventListener('click', () => this.replay());
    this.ui.overLevelsBtn.addEventListener('click', () => this.leaveRun());
    this.ui.wonLevelsBtn.addEventListener('click', () => this.leaveRun());
    this.ui.resumeBtn.addEventListener('click', () => this.pause(false));
    this.ui.bestLabel.textContent = this.best + ' / ' + TOTAL_ORBS;
  }

  updateHUD(force) {
    const U = this.ui;
    const inPlay = this.state === 'play' || this.state === 'dying' || this.state === 'winning';
    U.hud.classList.toggle('visible', inPlay);

    /* how far through the chart you are — the thing you actually chase */
    const showProg = inPlay && this.mode === 'level' && this.runner;
    U.prog.classList.toggle('visible', showProg);
    if (showProg) {
      const goal = this.runner.total;
      U.progFill.style.width = this.levelPercent().toFixed(1) + '%';
      const t = this.runner.done + ' / ' + goal + ' ORBS';
      if (this._pp !== t) { this._pp = t; U.progPct.textContent = t; }
      if (this._pn !== this.level.name) { this._pn = this.level.name; U.progName.textContent = this.level.name; }
    }
    const txt = this.collected + ' / ' + TOTAL_ORBS;
    if (force || this._c !== txt) { this._c = txt; U.count.textContent = txt; }
    const dk = this.player.dashReady ? 1 : 1 - this.player.dashCool / this.player.dashCd;
    U.dashFill.style.width = (dk * 100).toFixed(1) + '%';
    U.dash.classList.toggle('ready', this.player.dashReady);
    if (this._rejT > 0) this._rejT -= 1 / 60;
  }
}
