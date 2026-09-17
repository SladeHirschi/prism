'use strict';
/* ============================================================================
   PRISM — levels.js   the built-in levels

   A level is a list of steps, played in order. Each step is one orb and the
   hazards that arrive while you fetch it. `delay` is seconds from the moment
   the step starts; `warn` is how long the thing telegraphs before it turns
   lethal. Authored with small helpers — they emit nothing but plain data.
   ========================================================================== */

const R = 0, O = 1, Y = 2, G = 3, B = 4, P = 5;

const orb = (color, x, y, life) => ({ color, x, y, life: life || 6 });
const wave = (color, angle, o) => Object.assign({ type: 'wave', color, angle }, o);
const shard = (color, x, y, angle, o) => Object.assign({ type: 'shard', color, x, y, angle }, o);
const bloom = (color, x, y, o) => Object.assign({ type: 'bloom', color, x, y }, o);
const step = (o, hz, st) => ({ orb: o, hazards: hz || [], star: st || null });
/* a rainbow pickup: x, y, how long it lasts, when it shows up */
const star = (x, y, life, delay) => ({ x, y, life: life || 3.2, delay: delay || 0.4 });

/* a fan of shards from one edge */
function volley(color, edge, n, o) {
  o = o || {};
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const pos = 0.16 + f * 0.68;
    let x, y, ang;
    if (edge === 'top') { x = pos; y = -0.06; ang = 90; }
    else if (edge === 'bottom') { x = pos; y = 1.06; ang = 270; }
    else if (edge === 'left') { x = -0.05; y = pos; ang = 0; }
    else { x = 1.05; y = pos; ang = 180; }
    out.push(shard(color, x, y, ang, Object.assign({}, o, {
      delay: (o.delay || 0) + i * 0.12,
    })));
  }
  return out;
}

const BUILTIN_LEVELS = [

  /* ------------------------------------------------------------------ --
     The opening run hands out one more colour at a time. Two colours is a
     decision you can make instantly; six is a decision you have to hunt for.
     The sets are chosen for distinctness, so the first pair is red and green
     rather than red and orange.
     -------------------------------------------------------------------- */

  /* --- 2 colours: red, green ---------------------------------------- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'pair', name: 'PAIR', author: 'built-in',
    difficulty: 1, colors: 2, track: 'trailer_2',
    steps: [
      /* nothing at all: learn that you must wear the orb's colour */
      step(orb(R, 0.5, 0.5, 10), []),
      step(orb(G, 0.26, 0.34, 9.5), [wave(G, 0, { speed: 0.17, delay: 1.0, warn: 2.2 })]),
      step(orb(R, 0.74, 0.66, 9.5), [wave(R, 180, { speed: 0.17, delay: 1.0, warn: 2.2 })]),
      /* the first time the wave disagrees with the orb */
      step(orb(G, 0.3, 0.72, 9), [wave(R, 90, { speed: 0.19, delay: 0.9, warn: 2.0 })]),
      step(orb(R, 0.72, 0.3, 9), [wave(G, 270, { speed: 0.19, delay: 0.9, warn: 2.0 })]),
    ],
  }),

  /* --- 3 colours: + blue -------------------------------------------- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'trio', name: 'TRIO', author: 'built-in',
    difficulty: 1, colors: 3, track: 'trailer_2',
    steps: [
      step(orb(B, 0.5, 0.4, 9), []),
      step(orb(R, 0.24, 0.66, 9), [wave(B, 0, { speed: 0.19, delay: 0.9, warn: 2.0 })]),
      step(orb(G, 0.76, 0.34, 9), [wave(R, 270, { speed: 0.2, delay: 0.8, warn: 1.9 })]),
      /* first shards, slow and from one side */
      step(orb(B, 0.3, 0.3, 8.5), volley(G, 'left', 2, { speed: 0.24, delay: 1.0, warn: 1.7 })),
      step(orb(R, 0.7, 0.7, 8.5), [
        wave(G, 135, { speed: 0.21, delay: 0.8, warn: 1.8 }),
        ...volley(B, 'top', 2, { speed: 0.26, delay: 2.6, warn: 1.5 }),
      ]),
    ],
  }),

  /* --- 4 colours: + yellow ------------------------------------------ */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'quartet', name: 'QUARTET', author: 'built-in',
    difficulty: 2, colors: 4, track: 'trailer_2',
    steps: [
      step(orb(Y, 0.5, 0.5, 8.5), [wave(Y, 0, { speed: 0.21, delay: 0.9, warn: 1.9 })]),
      step(orb(G, 0.24, 0.3, 8.5), [wave(B, 180, { speed: 0.22, delay: 0.8, warn: 1.8 })]),
      /* first crossing pair */
      step(orb(R, 0.76, 0.7, 8), [
        wave(R, 90, { speed: 0.23, delay: 0.7, warn: 1.7 }),
        wave(R, 0, { speed: 0.23, delay: 2.2, warn: 1.7 }),
      ]),
      step(orb(B, 0.3, 0.68, 8), volley(Y, 'right', 3, { speed: 0.3, delay: 0.8, warn: 1.5 })),
      step(orb(Y, 0.7, 0.32, 8), [
        wave(G, 225, { speed: 0.24, delay: 0.7, warn: 1.6 }),
        ...volley(R, 'bottom', 2, { speed: 0.3, delay: 2.4, warn: 1.4 }),
      ]),
    ],
  }),

  /* --- 5 colours: + purple ------------------------------------------ */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'quintet', name: 'QUINTET', author: 'built-in',
    difficulty: 2, colors: 5, track: 'trailer_2',
    steps: [
      step(orb(P, 0.5, 0.36, 8), [wave(P, 90, { speed: 0.24, delay: 0.8, warn: 1.7 })]),
      step(orb(G, 0.22, 0.6, 8), [wave(Y, 0, { speed: 0.25, delay: 0.7, warn: 1.6 })]),
      /* first bloom, small and far from the orb */
      step(orb(R, 0.78, 0.4, 8), [bloom(B, 0.3, 0.7, { petals: 7, speed: 0.2, delay: 1.0, warn: 1.8 })]),
      step(orb(B, 0.3, 0.7, 7.5), volley(P, 'top', 3, { speed: 0.32, delay: 0.7, warn: 1.4 })),
      step(orb(Y, 0.7, 0.66, 7.5), [
        wave(R, 45, { speed: 0.26, delay: 0.6, warn: 1.5 }),
        wave(R, 225, { speed: 0.26, delay: 2.0, warn: 1.5 }),
      ]),
      step(orb(G, 0.5, 0.5, 7.5), [
        bloom(G, 0.5, 0.5, { petals: 8, speed: 0.22, delay: 1.2, warn: 1.7 }),
        ...volley(B, 'left', 2, { speed: 0.34, delay: 3.0, warn: 1.3 }),
      ]),
    ],
  }),

  /* --- 6 colours: the full set -------------------------------------- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'spectrum', name: 'SPECTRUM', author: 'built-in',
    difficulty: 2, colors: 6, track: 'trailer_2',
    steps: [
      step(orb(O, 0.5, 0.5, 8), [wave(O, 0, { speed: 0.25, delay: 0.8, warn: 1.7 })]),
      step(orb(P, 0.24, 0.32, 7.5), [wave(Y, 270, { speed: 0.26, delay: 0.7, warn: 1.6 })]),
      step(orb(R, 0.76, 0.68, 7.5), volley(G, 'left', 3, { speed: 0.32, delay: 0.7, warn: 1.4 })),
      step(orb(B, 0.3, 0.66, 7.5), [
        wave(P, 135, { speed: 0.28, delay: 0.6, warn: 1.5 }),
        wave(B, 315, { speed: 0.28, delay: 2.0, warn: 1.5 }),
      ]),
      step(orb(Y, 0.7, 0.34, 7), [bloom(O, 0.5, 0.5, { petals: 9, speed: 0.24, delay: 0.9, warn: 1.6 })]),
      step(orb(G, 0.5, 0.74, 7), [
        ...volley(R, 'top', 3, { speed: 0.36, delay: 0.6, warn: 1.3 }),
        wave(Y, 180, { speed: 0.3, delay: 2.6, warn: 1.4 }),
      ]),
    ],
  }),


  /* ---------------------------------------------------------------- 1 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'first-light', name: 'FIRST LIGHT', author: 'built-in',
    difficulty: 1, track: 'trailer_2',
    steps: [
      /* nothing at all for the first orb — learn the pickup rule alone */
      step(orb(B, 0.5, 0.34, 8), []),
      step(orb(Y, 0.22, 0.66, 8), [wave(Y, 0, { speed: 0.2, delay: 0.6, warn: 1.6 })]),
      step(orb(R, 0.78, 0.3, 8), [wave(R, 180, { speed: 0.2, delay: 0.6, warn: 1.6 })]),
      step(orb(G, 0.3, 0.72, 7.5), [wave(B, 90, { speed: 0.22, delay: 0.5, warn: 1.5 })],
        star(0.84, 0.2, 3.6, 0.3)),
      step(orb(P, 0.7, 0.5, 7.5), volley(P, 'left', 2, { speed: 0.28, delay: 0.7, warn: 1.2 })),
      step(orb(O, 0.2, 0.3, 7), [
        wave(O, 270, { speed: 0.24, delay: 0.4, warn: 1.4 }),
        ...volley(G, 'right', 2, { speed: 0.3, delay: 1.8, warn: 1.1 }),
      ], star(0.82, 0.76, 3.4, 0.5)),
      step(orb(B, 0.8, 0.68, 7), [
        wave(R, 45, { speed: 0.26, delay: 0.5, warn: 1.3 }),
        wave(B, 225, { speed: 0.26, delay: 2.2, warn: 1.3 }),
      ]),
      step(orb(Y, 0.5, 0.5, 7), [
        ...volley(Y, 'top', 3, { speed: 0.32, delay: 0.5, warn: 1.1 }),
        wave(G, 135, { speed: 0.28, delay: 2.4, warn: 1.3 }),
      ], star(0.12, 0.5, 3.2, 0.4)),
    ],
  }),

  /* ---------------------------------------------------------------- 2 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'crossfire', name: 'CROSSFIRE', author: 'built-in',
    difficulty: 3, track: 'trailer_2',
    steps: [
      step(orb(G, 0.5, 0.5, 6.5), [
        wave(G, 0, { speed: 0.3, delay: 0.4, warn: 1.2 }),
        wave(G, 90, { speed: 0.3, delay: 1.5, warn: 1.2 }),
      ]),
      step(orb(R, 0.18, 0.24, 6.5), volley(R, 'right', 3, { speed: 0.4, delay: 0.5, warn: 0.9, aim: 'player' }),
        star(0.86, 0.78, 3.2, 0.3)),
      step(orb(Y, 0.82, 0.72, 6.5), [
        wave(B, 180, { speed: 0.32, delay: 0.4, warn: 1.1 }),
        wave(Y, 270, { speed: 0.32, delay: 1.6, warn: 1.1 }),
      ]),
      step(orb(P, 0.5, 0.26, 6.5), volley(P, 'bottom', 4, { speed: 0.36, delay: 0.5, warn: 0.9 })),
      step(orb(O, 0.24, 0.7, 6), [
        wave(O, 45, { speed: 0.34, delay: 0.4, warn: 1.0 }),
        wave(O, 225, { speed: 0.34, delay: 1.4, warn: 1.0 }),
        ...volley(B, 'left', 2, { speed: 0.42, delay: 2.6, warn: 0.8, aim: 'player' }),
      ], star(0.5, 0.14, 3.0, 0.6)),
      step(orb(B, 0.78, 0.34, 6), [
        wave(R, 135, { speed: 0.36, delay: 0.4, warn: 1.0 }),
        wave(G, 315, { speed: 0.36, delay: 1.5, warn: 1.0 }),
      ]),
      step(orb(G, 0.22, 0.66, 6), volley(Y, 'top', 4, { speed: 0.44, delay: 0.4, warn: 0.85 })),
      step(orb(R, 0.5, 0.5, 6), [
        wave(P, 90, { speed: 0.38, delay: 0.3, warn: 0.9 }),
        wave(B, 270, { speed: 0.38, delay: 1.1, warn: 0.9 }),
        ...volley(O, 'right', 3, { speed: 0.46, delay: 2.4, warn: 0.8, aim: 'player' }),
      ], star(0.14, 0.86, 2.9, 0.5)),
      step(orb(Y, 0.5, 0.78, 5.5), [
        wave(R, 0, { speed: 0.42, delay: 0.3, warn: 0.9 }),
        wave(R, 180, { speed: 0.42, delay: 1.2, warn: 0.9 }),
      ]),
    ],
  }),

  /* ---------------------------------------------------------------- 3 --- */
  normaliseLevel({
    format: LEVEL_FORMAT, version: LEVEL_VERSION,
    id: 'full-bloom', name: 'FULL BLOOM', author: 'built-in',
    difficulty: 5, track: 'trailer_2',
    steps: [
      step(orb(P, 0.5, 0.5, 6), [bloom(P, 0.25, 0.3, { petals: 7, speed: 0.22, delay: 0.5, warn: 1.3 })]),
      step(orb(B, 0.8, 0.7, 6), [bloom(B, 0.75, 0.7, { petals: 8, speed: 0.24, delay: 0.5, warn: 1.2 })]),
      step(orb(Y, 0.2, 0.28, 6), [
        wave(Y, 0, { speed: 0.34, delay: 0.4, warn: 1.0 }),
        bloom(G, 0.5, 0.5, { petals: 10, speed: 0.26, delay: 2.0, warn: 1.2 }),
      ], star(0.86, 0.74, 3.0, 0.4)),
      step(orb(R, 0.72, 0.36, 5.5), [
        ...volley(R, 'top', 3, { speed: 0.44, delay: 0.4, warn: 0.85, aim: 'player' }),
        wave(O, 90, { speed: 0.36, delay: 2.2, warn: 1.0 }),
      ]),
      step(orb(G, 0.5, 0.22, 5.5), [
        bloom(Y, 0.3, 0.72, { petals: 9, color2: B, speed: 0.26, delay: 0.5, warn: 1.2 }),
        wave(O, 270, { speed: 0.36, delay: 2.4, warn: 1.0 }),
      ]),
      step(orb(B, 0.24, 0.52, 5.5), [
        bloom(R, 0.7, 0.28, { petals: 10, color2: G, speed: 0.28, delay: 0.4, warn: 1.1 }),
        ...volley(P, 'left', 4, { speed: 0.46, delay: 2.2, warn: 0.8 }),
      ], star(0.88, 0.86, 2.8, 0.6)),
      step(orb(O, 0.78, 0.68, 5.5), [
        wave(B, 45, { speed: 0.4, delay: 0.3, warn: 0.9 }),
        wave(B, 225, { speed: 0.4, delay: 1.3, warn: 0.9 }),
        bloom(O, 0.5, 0.5, { petals: 12, color2: P, speed: 0.3, delay: 2.6, warn: 1.1 }),
      ]),
      step(orb(P, 0.5, 0.78, 5), [
        ...volley(G, 'bottom', 4, { speed: 0.48, delay: 0.3, warn: 0.8, aim: 'player' }),
        wave(R, 135, { speed: 0.42, delay: 2.2, warn: 0.9 }),
      ]),
      step(orb(Y, 0.3, 0.4, 5), [
        bloom(P, 0.5, 0.5, { petals: 14, color2: Y, speed: 0.32, delay: 0.4, warn: 1.1 }),
        wave(Y, 315, { speed: 0.44, delay: 2.4, warn: 0.85 }),
      ], star(0.86, 0.16, 2.8, 0.5)),
      step(orb(R, 0.7, 0.6, 5), [
        bloom(R, 0.3, 0.7, { petals: 11, speed: 0.3, delay: 0.3, warn: 1.0 }),
        bloom(B, 0.7, 0.3, { petals: 11, speed: 0.3, delay: 1.6, warn: 1.0 }),
        ...volley(Y, 'right', 3, { speed: 0.5, delay: 3.0, warn: 0.75, aim: 'player' }),
      ]),
    ],
  }),
];
