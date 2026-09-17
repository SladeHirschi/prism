# PRISM level format v2

A level is plain JSON: an ordered list of **steps**, played start to end. Each
step is one orb plus the hazards that arrive while the player goes and gets it.
Collect the orb and the next step begins. Clear every step and the level is done.

There is no tempo and no beat grid. Delays are plain seconds measured from the
moment a step starts. Music is a backdrop; nothing is synced to it.

## Units — the part that matters for porting

| Quantity   | Unit                                  | Import as                      |
| ---------- | ------------------------------------- | ------------------------------ |
| Time       | **seconds**                           | as-is                          |
| Position   | **0..1 of the arena**                 | `x * arena.x`, `y * arena.y`   |
| Size/speed | **fraction of arena WIDTH** (per sec) | `v * arena.x`                  |
| Angle      | **degrees**, clockwise, 0 = +X        | `deg_to_rad(a)`                |
| Colour     | **index into `palette`**              | your own colour table          |

Nothing refers to a class, a pixel or a frame, so the same file plays here and
in a Godot port without conversion.

## Shape

```json
{
  "format": "prism.level",
  "version": 2,
  "id": "first-light",
  "name": "FIRST LIGHT",
  "author": "",
  "difficulty": 1,
  "track": "trailer_2",
  "arena":   { "w": 1280, "h": 800 },
  "palette": ["RED","ORANGE","YELLOW","GREEN","BLUE","PURPLE"],
  "steps": [
    {
      "orb": { "color": 4, "x": 0.5, "y": 0.34, "life": 8 },
      "hazards": [
        { "type": "wave", "color": 4, "angle": 0, "speed": 0.2,
          "thickness": 0.11, "delay": 0.6, "warn": 1.6 }
      ]
    }
  ]
}
```

`arena` is the canonical size the level was authored against; it is
informational, since all geometry is normalised. `track` names a row in the
track table.

## Orb

| field | default | notes |
| --- | --- | --- |
| `color` | 0 | must be worn to collect it |
| `x`, `y` | 0.5 | |
| `life` | 6 | seconds before it fades — **letting it fade ends the run** |

## Hazards

Every hazard has `delay` (seconds after its step begins) and `warn` (seconds it
telegraphs before it turns lethal).

### `wave` — a band sweeping the whole arena
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | |
| `angle` | 0 | direction of travel |
| `speed` | 0.26 | arena widths / second |
| `thickness` | 0.11 | × arena width |

### `shard` — a shape thrown in a straight line
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | |
| `x`, `y` | 0.5, −0.06 | spawn point; outside 0..1 is fine |
| `angle` | 90 | |
| `speed` | 0.36 | |
| `radius` | 0.012 | × arena width |
| `sides` | 3 | 3 = triangle, 4 = diamond |
| `aim` | `"fixed"` | `"player"` re-aims at the player as it spawns |

### `bloom` — a seed that opens into a ring of shards
| field | default | notes |
| --- | --- | --- |
| `color` | 0 | |
| `color2` | −1 | −1 = single colour; otherwise petals alternate |
| `x`, `y` | 0.5 | |
| `speed` | 0.26 | |
| `petals` | 9 | |
| `spin` | 0 | ring offset, degrees |

## Rules a port must reproduce

1. Contact with a hazard is lethal **unless** the player's colour index equals
   the hazard's, or the player is dashing.
2. An orb can only be collected while the player's colour matches it.
3. An orb that fades ends the run.
4. Collecting a step's orb immediately begins the next step.
5. **Hazards already queued are not cancelled when a step advances.** A player
   who takes the orb quickly still meets everything the level was built with —
   it simply arrives while they are on the next orb. Cancelling would let good
   play quietly delete the level.
6. Clearing the last step clears the level. Completion percentage is
   `steps_cleared / step_count`, and the best is kept.

## Storage

Custom levels live in `localStorage` under `prism.levels2`; progress under
`prism.progress2` as `{ levelId: { best, cleared, attempts } }`. Both sit behind
`LevelStore` in `js/level.js`, so swapping to files or a server touches one
object. `LevelStore.encode` / `decode` produce a paste-able base64 string of a
level for sharing.
