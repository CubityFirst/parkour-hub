/**
 * Headless completability test.
 *
 * Drives the real PlayerController through the real level collision of every
 * level with a scripted "bot" (steering toward waypoints and pressing buttons
 * at fixed spots), using the same fixed timestep as the game.
 *
 *   npm run simulate            # all levels
 *   npm run simulate -- level3  # one level (add -v for a step log,
 *                               # --trace=<seconds> for a per-tick trace)
 *
 * Exits non-zero if the bot falls, gets stuck or fails to reach a finish.
 */
import { Vector3 } from 'three';
import { LEVELS } from '../src/levels';
import { PlayerController, type PlayerInput } from '../src/player/PlayerController';
import { PHYS } from '../src/player/PlayerPhysics';
import { CollisionWorld, overlaps } from '../src/world/CollisionWorld';
import { createCollisionWorld } from '../src/world/LevelLayout';
import { ROUTES } from './routes';

const verbose = process.argv.includes('-v');
const traceArg = process.argv.find((a) => a.startsWith('--trace='));
const traceFrom = traceArg ? Number(traceArg.slice(8)) : -1;

function runLevel(id: string): number | null {
  const entry = LEVELS.find((l) => l.id === id)!;
  const layout = entry.build();
  const route = ROUTES[id];
  if (!route) {
    console.error(`  ✗ no bot route for ${id}`);
    return null;
  }
  const world = createCollisionWorld(layout, new CollisionWorld());
  const player = new PlayerController(world);
  player.respawn(new Vector3(...layout.spawn));

  const dt = PHYS.fixedStep;
  let t = 0;
  let idx = 0;
  let jumpHold = 0;
  let slideHold = 0;
  let prevX = layout.spawn[0];
  let prevZ = layout.spawn[2];
  let bestProgress = Infinity;
  let lastProgressT = 0;
  const log: string[] = [];
  let lastState = player.state;

  const fail = (why: string) => {
    const p = player.pos;
    console.error(`  ✗ ${why} at "${route[idx].label}" pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) state=${player.state}`);
    console.error(log.slice(-16).map((l) => '      ' + l).join('\n'));
    return null;
  };

  while (t < 240) {
    const step = route[idx];
    const p = player.pos;
    // Direction of travel for this leg; the action fires once we pass the waypoint.
    let dirX = step.x - prevX;
    let dirZ = step.z - prevZ;
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl;
    dirZ /= dl;
    const passed = (p.x - step.x) * dirX + (p.z - step.z) * dirZ >= 0;
    const dist = Math.hypot(step.x - p.x, step.z - p.z);
    // Near the waypoint, aim at a point further along the same line so the
    // bot keeps a straight heading through it.
    const ax = dist < 2.5 ? step.x + dirX * 3 : step.x;
    const az = dist < 2.5 ? step.z + dirZ * 3 : step.z;
    const yaw = Math.atan2(-(ax - p.x), -(az - p.z));

    const input: PlayerInput = {
      moveX: 0,
      moveZ: 1,
      sprint: true,
      jumpHeld: jumpHold > 0,
      jumpPressed: false,
      slideHeld: slideHold > 0,
      slidePressed: false,
      interactPressed: false,
      yaw,
    };

    let advance = false;
    if (passed || (!step.action && dist < 2.5)) {
      advance = true;
      if (step.action === 'jump') {
        input.jumpPressed = input.jumpHeld = true;
        jumpHold = 0.35;
      } else if (step.action === 'slide') {
        input.slidePressed = input.slideHeld = true;
      } else if (step.action === 'vault') {
        input.interactPressed = true;
      }
      if (step.holdSlide) slideHold = step.holdSlide;
    }
    jumpHold = Math.max(0, jumpHold - dt);
    slideHold = Math.max(0, slideHold - dt);

    player.tick(dt, input);
    t += dt;
    if (traceFrom >= 0 && t >= traceFrom && t <= traceFrom + 0.8) {
      console.log(`      ${t.toFixed(3)} ${player.state} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${player.vel.x.toFixed(2)},${player.vel.y.toFixed(2)},${player.vel.z.toFixed(2)}) yaw=${yaw.toFixed(2)} in=${JSON.stringify({ j: input.jumpPressed, jh: input.jumpHeld })}`);
    }

    if (player.state !== lastState) {
      log.push(`${t.toFixed(2)}s ${lastState}->${player.state} @ (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) v=${player.horizontalSpeed.toFixed(1)}`);
      lastState = player.state;
    }
    for (const e of player.events) if (e.type !== 'land') log.push(`${t.toFixed(2)}s   ${e.type}`);
    player.events.length = 0;

    if (advance && idx < route.length - 1) {
      if (verbose) console.log(`    ✓ ${step.label.padEnd(20)} t=${t.toFixed(2)}s pos=(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}) v=${player.horizontalSpeed.toFixed(1)}`);
      prevX = step.x;
      prevZ = step.z;
      idx++;
      bestProgress = Infinity;
    }

    // Stuck detection: distance to the current waypoint must keep shrinking.
    const d = Math.hypot(route[idx].x - p.x, route[idx].z - p.z);
    if (d < bestProgress - 0.3) {
      bestProgress = d;
      lastProgressT = t;
    }
    if (p.y < layout.killY) return fail('FELL');
    if (t - lastProgressT > 4) return fail('STUCK');
    if (overlaps(player.body.aabb(), layout.finish)) return t;
  }
  return fail('TIMEOUT');
}

/** Sanity checks on the raw movement numbers used for level design. */
function measureJumps(): void {
  const world = new CollisionWorld();
  world.add({ minX: -50, maxX: 50, minY: -1, maxY: 0, minZ: -200, maxZ: 10 });
  const player = new PlayerController(world);
  for (const sprint of [false, true]) {
    player.respawn(new Vector3(0, 0, 0));
    const base: PlayerInput = { moveX: 0, moveZ: 1, sprint, jumpHeld: false, jumpPressed: false, slideHeld: false, slidePressed: false, interactPressed: false, yaw: 0 };
    for (let i = 0; i < 240; i++) player.tick(PHYS.fixedStep, base);
    const z0 = player.pos.z;
    let maxY = 0;
    player.tick(PHYS.fixedStep, { ...base, jumpPressed: true, jumpHeld: true });
    let n = 0;
    while (!player.grounded && n++ < 1000) {
      player.tick(PHYS.fixedStep, { ...base, jumpHeld: true });
      maxY = Math.max(maxY, player.pos.y);
    }
    console.log(`  ${sprint ? 'sprint' : 'run   '} jump: distance ${(z0 - player.pos.z).toFixed(2)} m, apex ${maxY.toFixed(2)} m`);
  }
}

console.log('Movement reference:');
measureJumps();
const only = process.argv.slice(2).find((a) => !a.startsWith('-'));
let failed = 0;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  console.log(`\n${level.label} (${level.id}):`);
  const time = runLevel(level.id);
  if (time === null) failed++;
  else console.log(`  ✓ finished in ${time.toFixed(2)}s (bot run)`);
}
process.exit(failed ? 1 : 0);
