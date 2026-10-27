# ROOFTOP FLOW

A first-person rooftop parkour game inspired by Mirror's Edge, built with
**Three.js + TypeScript + Vite**. Sprint, jump, slide, vault and wall-run
across a bright minimalist city — from the tutorial rooftop to the red
finish gate.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in a desktop browser (Chrome / Firefox / Edge).

For a production build:

```bash
npm run build
npm run preview
```

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look around |
| Shift | Sprint |
| Space | Jump (hold for a higher jump) |
| Ctrl / C | Slide (slide under vents, keep momentum) |
| E | Vault red obstacles |
| R | Restart from checkpoint |
| Esc | Pause |

## How to play

- Red objects mark the route (Runner Vision): vault boxes, slide vents,
  wall-run walls, checkpoints and the finish gate.
- **Momentum is distance** — sprint before every gap and chain moves together.
- Falling off the rooftops respawns you at the last checkpoint.
- Your best time is saved locally.

## The level

1. **Movement tutorial** — run, sprint, jump, vault, slide.
2. **Rooftop jumps** — sprint-jump across gaps.
3. **Sliding challenge** — a vent gauntlet.
4. **Wall run** — a 12 m gap only a red wall can solve.
5. **Combination** — vault, wall run, slide in sequence.
6. **Final sprint** — pad-to-pad jumps to the finish gate.

## Tech notes

- Custom lightweight AABB physics at a fixed 120 Hz timestep.
- Momentum-preserving (Quake-style) air acceleration, coyote time, jump buffering.
- Procedural geometry, canvas textures and Web Audio sound — zero external assets.
