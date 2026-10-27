# ROOFTOP FLOW

A fast, momentum-based first-person parkour game inspired by the movement,
visual language and level flow of *Mirror's Edge* — built as an original
browser game with **Three.js + TypeScript + Vite**. No external assets,
no backend: geometry, textures and sound are all procedural.

![genre](https://img.shields.io/badge/genre-first--person%20parkour-e8352a)
![stack](https://img.shields.io/badge/stack-vite%20%7C%20typescript%20%7C%20three.js-1a1e22)

## Run it

```bash
npm install
npm run dev      # start the dev server, open the printed URL in a desktop browser
npm run build    # type-check + production bundle (dist/)
npm run preview  # serve the built game
npm run verify   # headless level-completion simulation (see below)
```

## The run

One continuous rooftop level (~60–120 s), six sections that teach then chain:

1. **Tutorial roof** — run, sprint, vault (E), slide (Ctrl/C), first gap.
2. **Rooftop jumps** — sprint-jump between decks marked with red pipes.
3. **Vent run** — a slide chain under low red beams; keep your speed.
4. **Wall run + zipline** — a gap too wide to jump: run the red wall and
   jump off it, then sprint off the edge and grab the zipline over the void.
5. **Combination** — narrow bridge, vault hurdles, slide corridor.
6. **Final sprint** — rhythm jumps to the red finish gate.

Checkpoints (red doors) after every major section; falling respawns you at
the last one. Your best time is saved locally.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump (also: jump out of slides, wall-jump, release zipline) |
| Ctrl / C | Slide |
| E | Vault |
| R | Restart from checkpoint |
| Esc | Pause |

High ledges auto-mantle when you jump into them holding forward; tall red
walls start a wall run automatically when you jump near them at speed.

## Architecture

```
src/
  core/            math + input abstraction (DOM-free input state)
  player/          Movement.ts (tuning), PlayerPhysics.ts, PlayerController.ts,
                   ParkourSystem.ts (wall run / vault / mantle / zipline),
                   FirstPersonCamera.ts, BodyView.ts (arms & legs, render layer 1)
  world/           LevelData.ts (pure geometry, shared by sim & render),
                   CollisionWorld.ts (AABB sweep grid), Checkpoints.ts,
                   LevelVisuals.ts, CityGenerator.ts
  game/            GameState.ts (phases, settings), Game.ts (loop, wiring)
  ui/              HUD.ts, Menu.ts
  audio/           AudioManager.ts (Web Audio synthesis)
  verify/          simulate.ts — headless completion bot
```

Movement runs on a fixed 1/120 s timestep with axis-separated AABB sweeps,
step-up, coyote time, jump buffering and variable jump height. Background
buildings are instanced; level geometry is merged per material.

## Level verification

`npm run verify` reuses the *exact* collision and movement modules in a
headless Node bot that sprints, jumps, slides, vaults, wall-runs and rides
the zipline through all six sections — proving the route is completable and
measuring a reference time.
