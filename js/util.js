'use strict';
/* ============================================================================
   PRISM — util.js   maths, easing, colour, drawing helpers
   ========================================================================== */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
function remap(v, a, b, c, d) { return lerp(c, d, clamp01(invLerp(a, b, v))); }
function smoothstep(e0, e1, x) { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
/* frame-rate independent smoothing */
function damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); }
function shortAngle(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function dampAngle(a, b, lambda, dt) { return a + shortAngle(a, b) * (1 - Math.exp(-lambda * dt)); }

const Ease = {
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inQuint: t => t * t * t * t * t,
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  outBack: (t, s = 1.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: t => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * 2.2) + 1;
  },
  pulse: t => Math.sin(clamp01(t) * Math.PI),
};

function rand(a = 1, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function chance(p) { return Math.random() < p; }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }

function len(x, y) { return Math.hypot(x, y); }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

/* ---------------------------------------------------------------- colours */
/* Six, in rainbow order. Clean and readable — deliberately not neon. */
const HUES = [
  { name: 'RED', h: 354, s: 62, l: 60 },
  { name: 'ORANGE', h: 26, s: 66, l: 58 },
  { name: 'YELLOW', h: 48, s: 66, l: 58 },
  { name: 'GREEN', h: 142, s: 46, l: 52 },
  { name: 'BLUE', h: 206, s: 58, l: 58 },
  { name: 'PURPLE', h: 278, s: 44, l: 62 },
];
const NCOL = HUES.length;

function col(i, lMul, a) {
  const c = HUES[((i % NCOL) + NCOL) % NCOL];
  const L = c.l * (lMul === undefined ? 1 : lMul);
  return a === undefined
    ? 'hsl(' + c.h + ',' + c.s + '%,' + L.toFixed(1) + '%)'
    : 'hsla(' + c.h + ',' + c.s + '%,' + L.toFixed(1) + '%,' + a + ')';
}
function colS(i, sMul, lMul, a) {
  const c = HUES[((i % NCOL) + NCOL) % NCOL];
  return 'hsla(' + c.h + ',' + (c.s * sMul).toFixed(1) + '%,' + (c.l * lMul).toFixed(1) + '%,' + a + ')';
}
function hueOf(i) { return HUES[((i % NCOL) + NCOL) % NCOL].h; }

/* Early levels hand out fewer colours. The sets are picked so the small ones
   stay as far apart as possible — red and green before red and orange —
   because two neighbouring hues is a miserable first lesson. */
const COLOR_SETS = {
  2: [0, 3],                 // red, green
  3: [0, 3, 4],              // red, green, blue
  4: [0, 2, 3, 4],           // + yellow
  5: [0, 2, 3, 4, 5],        // + purple
  6: [0, 1, 2, 3, 4, 5],     // everything
};
function colorSet(n) { return COLOR_SETS[clamp(Math.round(n) || 6, 2, 6)]; }

/* the stick angle -> which wedge of however many are in play. Slot 0 is up. */
function angleToSlot(ang, n) {
  const a = ((ang + Math.PI / 2) % TAU + TAU) % TAU;
  return Math.round(a / (TAU / n)) % n;
}
function slotToAngle(slot, n) { return slot * (TAU / n) - Math.PI / 2; }

/* nearest available colour, by hue, so a level can never ask for one the
   player has no way to select */
function nearestInSet(ci, set) {
  if (set.indexOf(ci) >= 0) return ci;
  const want = HUES[((ci % NCOL) + NCOL) % NCOL].h;
  let best = set[0], bd = 1e9;
  for (const k of set) {
    const d = Math.abs(((HUES[k].h - want) % 360 + 540) % 360 - 180);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/* --------------------------------------------------------------- drawing */
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polyPath(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i / sides * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/* cached radial gradients, built at the origin and translated into place */
function glowGrad(ctx, r, h, s, l, a) {
  const cache = ctx.__g || (ctx.__g = new Map());
  const key = (r | 0) + '|' + (h | 0) + '|' + (s | 0) + '|' + (l | 0) + '|' + ((a * 50) | 0);
  let g = cache.get(key);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.5, r));
    g.addColorStop(0, 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')');
    g.addColorStop(0.45, 'hsla(' + h + ',' + s + '%,' + (l * 0.8) + '%,' + (a * 0.32) + ')');
    g.addColorStop(1, 'hsla(' + h + ',' + s + '%,' + (l * 0.7) + '%,0)');
    if (cache.size > 500) cache.clear();
    cache.set(key, g);
  }
  return g;
}
function softGlow(ctx, x, y, r, h, s, l, a) {
  if (r <= 0 || a <= 0.003) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = glowGrad(ctx, r, h, s, l, a);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

function pad2(n) { n = Math.max(0, Math.round(n)); return n < 10 ? '0' + n : '' + n; }
function storageGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function storageSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
