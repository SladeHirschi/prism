'use strict';
/* ============================================================================
   PRISM — patterns.js

   Reusable routines. A pattern is a function of (beat, colour) returning plain
   events, so stamping one into a chart is identical to hand-placing its parts —
   there is no "pattern" concept in the saved file, only the events it made.
   That keeps the format flat and portable while the editor stays fast to use.
   ========================================================================== */

const PATTERNS = [
  {
    id: 'sweep', name: 'Sweep', hint: 'one wave across',
    make: (b, c, o) => [
      { type: 'wave', beat: b, color: c, angle: o.angle !== undefined ? o.angle : 0,
        thickness: 0.11, speed: 0.28, telegraph: 2 },
    ],
  },
  {
    id: 'cross', name: 'Cross', hint: 'two waves, perpendicular',
    make: (b, c, o) => [
      { type: 'wave', beat: b, color: c, angle: 0, thickness: 0.1, speed: 0.3, telegraph: 2 },
      { type: 'wave', beat: b + 2, color: c, angle: 90, thickness: 0.1, speed: 0.3, telegraph: 2 },
    ],
  },
  {
    id: 'pincer', name: 'Pincer', hint: 'waves from both sides',
    make: (b, c, o) => [
      { type: 'wave', beat: b, color: c, angle: 0, thickness: 0.1, speed: 0.32, telegraph: 2 },
      { type: 'wave', beat: b, color: c, angle: 180, thickness: 0.1, speed: 0.32, telegraph: 2 },
    ],
  },
  {
    id: 'cage', name: 'Cage', hint: 'all four sides, staggered',
    make: (b, c, o) => [0, 90, 180, 270].map((a, i) => ({
      type: 'wave', beat: b + i * 1.5, color: c, angle: a,
      thickness: 0.09, speed: 0.34, telegraph: 2,
    })),
  },
  {
    id: 'volley-t', name: 'Volley ↓', hint: 'three shards from the top',
    make: (b, c, o) => volleyEvents(b, c, 'top', 3, o),
  },
  {
    id: 'volley-b', name: 'Volley ↑', hint: 'three shards from below',
    make: (b, c, o) => volleyEvents(b, c, 'bottom', 3, o),
  },
  {
    id: 'volley-l', name: 'Volley →', hint: 'three shards from the left',
    make: (b, c, o) => volleyEvents(b, c, 'left', 3, o),
  },
  {
    id: 'volley-r', name: 'Volley ←', hint: 'three shards from the right',
    make: (b, c, o) => volleyEvents(b, c, 'right', 3, o),
  },
  {
    id: 'hunt', name: 'Hunt', hint: 'four shards that aim at you',
    make: (b, c, o) => volleyEvents(b, c, 'top', 4, Object.assign({ aim: 'player', speed: 0.4 }, o)),
  },
  {
    id: 'bloom', name: 'Bloom', hint: 'a ring opening outward',
    make: (b, c, o) => [
      { type: 'bloom', beat: b, color: c, x: o.x !== undefined ? o.x : 0.5,
        y: o.y !== undefined ? o.y : 0.5, petals: 9, speed: 0.26, spin: 0, telegraph: 2, color2: -1 },
    ],
  },
  {
    id: 'twin-bloom', name: 'Twin bloom', hint: 'two rings, offset corners',
    make: (b, c, o) => [
      { type: 'bloom', beat: b, color: c, x: 0.26, y: 0.3, petals: 8, speed: 0.24, spin: 0, telegraph: 2, color2: -1 },
      { type: 'bloom', beat: b + 2, color: c, x: 0.74, y: 0.7, petals: 8, speed: 0.24, spin: 22, telegraph: 2, color2: -1 },
    ],
  },
  {
    id: 'garden', name: 'Garden', hint: 'a two-tone ring — mean',
    make: (b, c, o) => [
      { type: 'bloom', beat: b, color: c, x: 0.5, y: 0.5, petals: 12,
        speed: 0.28, spin: 0, telegraph: 2, color2: (c + 3) % NCOL },
    ],
  },
];

function volleyEvents(beat, color, edge, n, o) {
  o = o || {};
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const pos = 0.14 + f * 0.72;
    let x, y, ang;
    if (edge === 'top') { x = pos; y = -0.06; ang = 90; }
    else if (edge === 'bottom') { x = pos; y = 1.06; ang = 270; }
    else if (edge === 'left') { x = -0.05; y = pos; ang = 0; }
    else { x = 1.05; y = pos; ang = 180; }
    out.push({
      type: 'shard', beat: beat + i * 0.25, color, x, y, angle: ang,
      aim: o.aim || 'fixed', speed: o.speed || 0.34, radius: 0.012,
      sides: o.sides || 3, telegraph: o.telegraph || 1.5,
    });
  }
  return out;
}

function getPattern(id) { return PATTERNS.find(p => p.id === id); }
