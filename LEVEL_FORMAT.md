# PRISM level format v1

A level is plain JSON. It contains no code, no pixels and no frame counts, so
the same file plays in the JS prototype and in a Godot port without conversion.

## Units — the part that matters for porting

| Quantity  | Unit                                   | Import as                       |
| --------- | -------------------------------------- | ------------------------------- |
| Time      | **beats** (float, sub-beats allowed)   | `beat * 60.0 / bpm` seconds     |
| Position  | **0..1 of the arena**                  | `x * arena.x`, `y * arena.y`    |
| Size/speed| **fraction of arena WIDTH**            | `v * arena.x` (per second)      |
| Angle     | **degrees**, clockwise, 0 = +X         | `deg_to_rad(a)`                 |
| Colour    | **index into `palette`**               | your own colour table           |

Time is in beats so a chart survives a tempo change and any frame rate.
Positions are normalised so it survives any resolution or arena size. Nothing
in a level file is tied to this engine.

## Top level

```json
{
  "format": "prism.level",
  "version": 1,
  "id": "first-light",
  "name": "FIRST LIGHT",
  "author": "",
  "difficulty": 1,
  "track": "trailer_2",
  "arena":   { "w": 1280, "h": 800 },
  "palette": ["RED","ORANGE","YELLOW","GREEN","BLUE","PURPLE"],
  "length":  78,
  "leadIn":  4,
  "events":  [ ... ]
}
```

`length` is where the level ends, in beats — reaching it is the win condition.
`leadIn` is quiet beats before the chart starts. `arena` is the canonical size
the level was authored against; it is informational, since geometry is
normalised. `track` names a row in the track table (id, file, bpm, offset).

## Events

Every event has `type` and `beat`. **`beat` is when the hazard becomes lethal**,
not when it appears — it is spawned `telegraph` beats earlier so that it goes
live exactly on the beat. That is what makes a chart feel locked to the music,
and any port must preserve it.

### `wave` — a band sweeping the whole arena
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | palette index |
| `angle` | 0 | direction of travel, degrees |
| `thickness` | 0.11 | × arena width |
| `speed` | 0.24 | arena widths / second |
| `telegraph` | 2 | beats of warning |

### `shard` — a shape thrown in a straight line
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | |
| `x`, `y` | 0.5, -0.06 | spawn point; outside 0..1 is fine |
| `angle` | 90 | degrees |
| `aim` | `"fixed"` | `"player"` re-aims at the player when it spawns |
| `speed` | 0.33 | arena widths / second |
| `radius` | 0.012 | × arena width |
| `sides` | 3 | 3 = triangle, 4 = diamond |
| `telegraph` | 1.5 | |

### `bloom` — a seed that opens into a ring of shards
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | |
| `color2` | -1 | −1 = single colour; otherwise petals alternate |
| `x`, `y` | 0.5, 0.5 | |
| `petals` | 8 | |
| `speed` | 0.24 | |
| `spin` | 0 | petal ring offset, degrees |
| `telegraph` | 2 | |

### `orb` — a pickup
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | must be worn to collect |
| `x`, `y` | 0.5, 0.5 | |
| `life` | 8 | beats before it fades; letting it fade ends the run |

Only one orb is live at a time — a second would make "miss it and die" unfair.

## Rules a port must reproduce

1. Contact with a hazard is lethal **unless** the player's colour index equals
   the hazard's, or the player is dashing.
2. An orb can only be collected while the player's colour matches it.
3. An orb that expires ends the run.
4. Reaching `length` beats clears the level.
5. Completion percentage is `current_beat / length`, and the best is kept.

## Storage

Custom levels live in `localStorage` under `prism.levels`; progress under
`prism.progress` as `{ levelId: { best, cleared, attempts } }`. Both are
behind `LevelStore` in `js/level.js`, so swapping to files or a server is a
one-object change. `LevelStore.encode` / `decode` produce a paste-able base64
string of a level for sharing.
