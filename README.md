# PRISM

A small browser game. You are a cube that can be one of six colours.

- **Wear its colour to take it.** An orb can only be picked up while you match it.
- **Wear its colour to survive it.** Waves and shapes kill you unless you match them. Everything telegraphs before it arrives.
- **Dash goes through anything**, any colour, on a short cooldown.
- **Don't be slow.** Each orb has a timer. Fifteen orbs to clear, and it gets harder with every one.

Hazards spawn on the beat of the soundtrack.

## Play

Open `index.html`, or play the hosted build.

## Controls

|            | Keyboard / mouse            | Controller              |
| ---------- | --------------------------- | ----------------------- |
| Move       | `WASD` / arrows             | Left stick              |
| Pick colour| `1`–`6`, `Q`/`E`, scroll    | Right stick, or d-pad   |
| Dash       | `Space` / `Shift`           | `A` / `RB`              |
| Pause      | `Esc`                       | `Start`                 |
| Restart    | `R`                         | `Back`                  |
| Mute       | `M`                         | —                       |

Click **Play** rather than pressing a key the first time — browsers will not start
audio until there is a real interaction, and the soundtrack drives the beat that
hazards spawn on.

## Built with

Vanilla JavaScript and HTML5 Canvas. No libraries, no build step. Sound effects are
synthesised at runtime with the Web Audio API.

Music: `trailer_song_2_draft` by Slade Hirschi.
