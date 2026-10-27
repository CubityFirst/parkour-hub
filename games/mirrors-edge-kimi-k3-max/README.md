# ROOFTOP FLOW

A Mirror's Edge-inspired **first-person parkour game** that runs entirely in the browser.
Sprint, jump, slide, vault and wall-run across a bright, minimalist city of white
rooftops and red runner-vision markers — one continuous timed route with checkpoints
and a finish line.

Built with **Three.js + TypeScript + Vite**. No external art assets: every texture is
procedural, every sound is synthesized with the Web Audio API.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>), click **START RUN**.

Production build / local preview:

```bash
npm run build
npm run preview
```

## Headless smoke tests

With the dev server running, `npm test` drives the game in headless Chrome
(via `puppeteer-core` and the system browser — no download needed):

- `test/smoke.mjs` — menu loads, run starts, player is grounded, movement/jump work
- `test/mech.mjs` — wall run, vault, slide-under-duct, fall respawn, finish trigger
- `test/gap.mjs` — real-input tutorial chain: sprint → vault → slide → gap jump

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look around |
| SHIFT | Sprint |
| SPACE | Jump (hold for higher jump) / leap off a wall run |
| CTRL / C | Slide (hold) |
| E | Vault / climb |
| R | Restart from checkpoint |
| ESC | Pause |

## The route

Six sections, ~230 m of rooftops, 60–120 s for a first successful run:

1. **The Basics** — running, jumping, a vault vent and a slide pipe.
2. **Rooftop Jumps** — sprint-jumps across gaps of increasing size.
3. **Slide Roof** — low ducts; hold CTRL to keep the slide going.
4. **Wall Run** — a 10.5 m gap crossed only by running along the red wall.
5. **Combination** — vault → gap → left wall run → slide.
6. **Final Sprint** — descending jumps to the red FINISH gate.

Falling respawns you at the latest checkpoint flag (R restarts manually).
Your best completion time is saved locally.

## Tech notes

- **Fixed-timestep (120 Hz) movement**, decoupled from rendering.
- Custom **AABB collision world**: per-axis resolution, step-up, snap-down,
  no tunneling at game speeds.
- **Momentum movement model** (Quake-style friction/accelerate), coyote time,
  jump buffering, variable jump height.
- **Parkour systems**: sliding (low-profile collider), vaulting & auto-mantle
  (short scripted moves), wall running (reduced gravity, camera tilt, wall jump,
  anti-exploit budget/cooldown).
- **Camera feel**: speed FOV, head bob, strafe lean, wallrun tilt, landing dip,
  slide height — all optional via the *Camera motion* setting.
- **Rendering**: merged static level geometry (few draw calls), instanced
  background city, procedural canvas textures, soft shadow-mapped sun,
  ACES tone mapping, gradient sky + distance haze.

## Project layout

```
src/
  main.ts                  entry point
  core/Input.ts            keyboard/mouse + pointer lock
  game/Game.ts             orchestration, state machine, fixed-step loop
  game/GameState.ts        phases, settings, best-time persistence
  player/PlayerController.ts   input → movement state machine
  player/PlayerPhysics.ts      friction/accel, integration, AABB collision
  player/ParkourSystem.ts      vault, mantle, wall running
  player/FirstPersonCamera.ts  look, bob, FOV, tilts, dips
  player/PlayerBody.ts         first-person hands
  world/Level.ts               the six-section route
  world/CityGenerator.ts       sky, lights, background city
  world/CollisionWorld.ts      AABB store & queries
  world/Checkpoints.ts         checkpoint flags & triggers
  world/materials.ts           procedural textures & materials
  ui/HUD.ts, ui/Menu.ts        interface
  audio/AudioManager.ts        synthesized sound effects
```
