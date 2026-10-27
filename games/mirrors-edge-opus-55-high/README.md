# ROOFTOP FLOW

A first-person rooftop parkour game for the browser, inspired by the movement and look of Mirror's Edge.
It's built with **Three.js + TypeScript + Vite** and needs no engine, assets or backend: every mesh, material and sound is generated procedurally.

**Play online:** https://parkour.cubityfir.st/opus/ (part of the [parkour hub](../parkour-hub))

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Click **START RUN**. Your mouse is captured (pointer lock), and **Esc** pauses the game.

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Shift | Sprint |
| Space | Jump (hold for higher), wall jump, vault when next to a low obstacle |
| C / Ctrl | Slide while running, crouch otherwise |
| E | Vault / climb |
| R | Restart from the last checkpoint |
| T | Restart the level (also resets the timer) |
| Esc | Pause / release the mouse |

Ledges are climbed automatically: jump at them while holding **W**. To wall run, jump while running alongside a wall (the red panels mark the intended ones).

## Levels

| # | Level | Theme |
|---|---|---|
| 0 | Tutorial | Six teaching sections: running, jumps, sliding, wall running, combinations, final sprint |
| 1 | Downtown Dash | Flowing route with two turns, a left wall run, ledge climb, beam and a big drop |
| 2 | Glass District | Morning light; chained wall runs (right wall → wall jump → left wall), beams around a pillar |
| 3 | Construction Yard | Golden hour; girders, container stacks, a broken beam |
| 4 | The Descent | Sunset; a descent of big drops, landing slides and a wall climb |
| 5 | Skyline | 80 m up; everything combined |

Finishing a level unlocks the next one. **LEVEL SELECT** (on the main menu, pause menu and finish screen) lets you jump to any unlocked level. Unlocks and best times are saved locally in your browser.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run simulate` | Headless test: a scripted bot runs every level with the real physics and collision and fails if any can't be finished (`npm run simulate -- level3 -v` for one level with a step log) |
| `npx tsx scripts/walljump-test.ts` | Diagnostic for wall-run → wall-jump → wall-run chains (bonks, speed kept, vertical snaps) |
| `npm run deploy` | Build and deploy to Cloudflare Workers (`npx wrangler deploy`) |

## Project layout

```
src/
  main.ts                    entry point
  game/Game.ts               renderer, main loop (fixed 120 Hz physics + interpolated rendering), flow control
  game/GameState.ts          phase, run timer
  game/Progress.ts           level unlocks and per-level best times (localStorage)
  game/Input.ts              keyboard + pointer-lock mouse, buffered button presses
  game/PostFX.ts             bloom, edge speed blur, tone mapping output
  game/Settings.ts           persisted options (sensitivity, FOV, camera motion, quality...)
  player/PlayerPhysics.ts    movement tuning + AABB move-and-collide (substepped, step-up, ground snap)
  player/PlayerController.ts movement state machine: run, sprint, jump, slide, wall run, vault, mantle
  player/ParkourSystem.ts    environment queries: runnable walls, vault targets, ledges
  player/FirstPersonCamera.ts head bob, FOV kick, roll, landing dips, vault/mantle camera
  player/PlayerBody.ts       low-poly arms (view model) and legs
  levels/                    level definitions: tutorial.ts, level1-5.ts, LevelBuilder.ts (authoring helpers), index.ts (unlock order)
  world/LevelLayout.ts       level data types and lighting themes (pure data, shared with the simulation)
  world/Level.ts             level meshes (merged per material), flags, billboards
  world/CollisionWorld.ts    AABB collision world with a spatial grid
  world/CityGenerator.ts     instanced background city and cranes
  world/Checkpoints.ts       checkpoints, hint zones, finish trigger
  world/Materials.ts         procedural world-space facade / concrete shaders
  world/Sky.ts               sky dome with sun and clouds, environment map
  ui/HUD.ts, ui/Menu.ts      HUD, main/pause/controls/finish screens
  audio/AudioManager.ts      Web Audio synthesised sound effects
scripts/simulate.ts          headless completability test
scripts/routes.ts            bot routes for each level
worker/index.ts              Cloudflare Worker (serves dist/ via static assets, adds headers)
```

## Deployment

The game is served by a Cloudflare Worker using Workers Static Assets (`wrangler.jsonc`), on the custom domain `opus55-parkour.cubityfir.st` (the shared `parkour.cubityfir.st` site is deployed from `../parkour-hub`):

```bash
npm run build
npx wrangler deploy
```

## Notes

- Use the **Performance** graphics preset on weak GPUs. It disables bloom and blur, uses smaller shadow maps and caps the pixel ratio.
- Choose **Reduced** camera motion if head bob, tilt and FOV changes bother you.
- Some browsers close the tab on **Ctrl+W**, so **C** is the safer slide key. The game asks before leaving mid-run.
