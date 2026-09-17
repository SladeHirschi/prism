'use strict';
/* ============================================================================
   PRISM — levels.js   the built-in charts

   Authored with small helpers for readability; they emit nothing but plain
   data, so every built-in level exports and imports exactly like a custom one.
   Beats are the unit throughout. At 130 BPM one beat is 0.46s and a bar is 4.
   ========================================================================== */

const E = {
  wave: (beat, color, angle, o) => Object.assign({ type: 'wave', beat, color, angle }, o),
  shard: (beat, color, x, y, angle, o) => Object.assign({ type: 'shard', beat, color, x, y, angle }, o),
  bloom: (beat, color, x, y, o) => Object.assign({ type: 'bloom', beat, color, x, y }, o),
  orb: (beat, color, x, y, o) => Object.assign({ type: 'orb', beat, color, x, y }, o),
};
/* colour shorthands, in rainbow order */
const R = 0, O = 1, Y = 2, G = 3, B = 4, P = 5;

/* a volley of shards fanned in from one edge */
function volley(beat, color, edge, n, o) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const pos = 0.14 + f * 0.72;
    let x, y, ang;
    if (edge === 'top') { x = pos; y = -0.06; ang = 90; }
    else if (edge === 'bottom') { x = pos; y = 1.06; ang = 270; }
    else if (edge === 'left') { x = -0.05; y = pos; ang = 0; }
    else { x = 1.05; y = pos; ang = 180; }
    out.push(E.shard(beat + i * 0.25, color, x, y, ang, o));
  }
  return out;
}

const BUILTIN_LEVELS = [

  /* ---------------------------------------------------------------- 1 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'first-light', name: 'FIRST LIGHT', author: 'built-in',
    difficulty: 1, track: 'trailer_2', length: 78, leadIn: 4,
    events: [].concat(
      /* a bar of nothing, then one slow wave so the rule lands on its own */
      [E.orb(4, B, 0.5, 0.34, { life: 12 })],
      [E.wave(8, B, 0, { thickness: 0.13, speed: 0.2, telegraph: 3 })],
      [E.orb(14, Y, 0.22, 0.66, { life: 12 })],
      [E.wave(18, Y, 180, { thickness: 0.13, speed: 0.2, telegraph: 3 })],
      [E.orb(24, R, 0.78, 0.3, { life: 12 })],
      [E.wave(28, G, 90, { thickness: 0.12, speed: 0.22, telegraph: 2.5 })],
      /* first shards */
      volley(32, P, 'left', 2, { speed: 0.26, telegraph: 2 }),
      [E.orb(36, P, 0.5, 0.7, { life: 11 })],
      [E.wave(40, P, 270, { thickness: 0.12, speed: 0.24, telegraph: 2.5 })],
      volley(44, O, 'right', 2, { speed: 0.28, telegraph: 2 }),
      [E.orb(48, O, 0.2, 0.3, { life: 11 })],
      [E.wave(52, R, 0, { thickness: 0.13, speed: 0.26, telegraph: 2 })],
      [E.orb(58, G, 0.8, 0.66, { life: 11 })],
      [E.wave(60, G, 45, { thickness: 0.12, speed: 0.26, telegraph: 2 })],
      volley(64, B, 'top', 3, { speed: 0.3, telegraph: 2 }),
      [E.orb(68, B, 0.5, 0.5, { life: 10 })],
      [E.wave(72, Y, 135, { thickness: 0.13, speed: 0.28, telegraph: 2 })]
    ),
  }),

  /* ---------------------------------------------------------------- 2 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'crossfire', name: 'CROSSFIRE', author: 'built-in',
    difficulty: 3, track: 'trailer_2', length: 78, leadIn: 4,
    events: [].concat(
      [E.orb(4, G, 0.5, 0.5, { life: 10 })],
      /* crossing pairs from the very start */
      [E.wave(8, G, 0, { thickness: 0.1, speed: 0.3, telegraph: 2 }),
       E.wave(10, G, 90, { thickness: 0.1, speed: 0.3, telegraph: 2 })],
      [E.orb(13, R, 0.18, 0.24, { life: 10 })],
      volley(16, R, 'right', 3, { speed: 0.36, telegraph: 1.5, aim: 'player' }),
      [E.wave(20, B, 180, { thickness: 0.1, speed: 0.32, telegraph: 1.75 }),
       E.wave(22, Y, 270, { thickness: 0.1, speed: 0.32, telegraph: 1.75 })],
      [E.orb(25, Y, 0.82, 0.72, { life: 10 })],
      volley(28, P, 'bottom', 4, { speed: 0.34, telegraph: 1.5 }),
      [E.orb(33, P, 0.5, 0.26, { life: 10 })],
      [E.wave(36, O, 45, { thickness: 0.11, speed: 0.34, telegraph: 1.75 }),
       E.wave(38, O, 225, { thickness: 0.11, speed: 0.34, telegraph: 1.75 })],
      volley(41, B, 'left', 3, { speed: 0.38, telegraph: 1.25, aim: 'player' }),
      [E.orb(45, B, 0.78, 0.34, { life: 10 })],
      [E.wave(48, R, 135, { thickness: 0.1, speed: 0.36, telegraph: 1.5 }),
       E.wave(50, G, 315, { thickness: 0.1, speed: 0.36, telegraph: 1.5 })],
      [E.orb(53, G, 0.22, 0.7, { life: 10 })],
      volley(56, Y, 'top', 4, { speed: 0.4, telegraph: 1.25 }),
      [E.wave(60, P, 90, { thickness: 0.1, speed: 0.38, telegraph: 1.5 }),
       E.wave(61.5, B, 270, { thickness: 0.1, speed: 0.38, telegraph: 1.5 })],
      [E.orb(64, O, 0.5, 0.5, { life: 9 })],
      volley(68, O, 'right', 4, { speed: 0.42, telegraph: 1.25, aim: 'player' }),
      [E.wave(72, R, 0, { thickness: 0.12, speed: 0.4, telegraph: 1.5 }),
       E.wave(73.5, R, 180, { thickness: 0.12, speed: 0.4, telegraph: 1.5 })]
    ),
  }),

  /* ---------------------------------------------------------------- 3 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'full-bloom', name: 'FULL BLOOM', author: 'built-in',
    difficulty: 5, track: 'trailer_2', length: 78, leadIn: 4,
    events: [].concat(
      [E.orb(4, P, 0.5, 0.5, { life: 9 })],
      [E.bloom(8, P, 0.25, 0.3, { petals: 7, speed: 0.22, telegraph: 2.5 })],
      [E.orb(12, B, 0.8, 0.7, { life: 9 })],
      [E.bloom(14, B, 0.75, 0.7, { petals: 8, speed: 0.24, telegraph: 2 })],
      [E.wave(18, Y, 0, { thickness: 0.1, speed: 0.34, telegraph: 1.75 })],
      [E.orb(21, Y, 0.2, 0.28, { life: 9 })],
      [E.bloom(24, G, 0.5, 0.5, { petals: 10, speed: 0.26, telegraph: 2 })],
      volley(27, R, 'top', 3, { speed: 0.4, telegraph: 1.25, aim: 'player' }),
      [E.orb(31, R, 0.72, 0.36, { life: 9 })],
      [E.wave(34, O, 90, { thickness: 0.1, speed: 0.36, telegraph: 1.5 }),
       E.wave(35.5, O, 270, { thickness: 0.1, speed: 0.36, telegraph: 1.5 })],
      [E.bloom(38, Y, 0.3, 0.72, { petals: 9, color2: B, speed: 0.26, telegraph: 2 })],
      [E.orb(42, G, 0.5, 0.22, { life: 9 })],
      [E.bloom(45, R, 0.7, 0.28, { petals: 10, color2: G, speed: 0.28, telegraph: 1.75 })],
      volley(48, P, 'left', 4, { speed: 0.42, telegraph: 1.25 }),
      [E.wave(52, B, 45, { thickness: 0.1, speed: 0.4, telegraph: 1.5 }),
       E.wave(53.5, B, 225, { thickness: 0.1, speed: 0.4, telegraph: 1.5 })],
      [E.orb(56, B, 0.24, 0.52, { life: 9 })],
      [E.bloom(58, O, 0.5, 0.5, { petals: 12, color2: P, speed: 0.3, telegraph: 1.75 })],
      volley(62, G, 'bottom', 4, { speed: 0.44, telegraph: 1.25, aim: 'player' }),
      [E.orb(65, O, 0.78, 0.68, { life: 9 })],
      [E.wave(68, R, 135, { thickness: 0.1, speed: 0.42, telegraph: 1.25 }),
       E.wave(69, Y, 315, { thickness: 0.1, speed: 0.42, telegraph: 1.25 })],
      [E.bloom(72, P, 0.5, 0.5, { petals: 14, color2: Y, speed: 0.32, telegraph: 1.75 })],
      [E.orb(74, P, 0.5, 0.78, { life: 8 })]
    ),
  }),
];
