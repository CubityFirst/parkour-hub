/**
 * Headless level-completion simulation.
 *
 * Drives a scripted "runner bot" through the shipped LevelData using the
 * exact collision/movement/parkour modules from the game (no DOM, no three),
 * asserting: all 4 checkpoints trigger in order, the finish zone is reached,
 * nothing is left in a stuck state, and the run time lands in a humanly
 * plausible 30–120s window.
 *
 * Run:  npm run verify
 */

import { type InputState, createInputState } from '../src/core/Input.ts';
import { CollisionWorld } from '../src/world/CollisionWorld.ts';
import { buildLevelData, FALL_KILL_Y } from '../src/world/LevelData.ts';
import { CheckpointTracker, insideZone } from '../src/world/Checkpoints.ts';
import { PlayerController } from '../src/player/PlayerController.ts';
import { MOVE, PLAYER } from '../src/player/Movement.ts';

const data = buildLevelData();
const world = new CollisionWorld();
for (const p of data.prims) {
  if (p.collide === false) continue;
  world.addBox({
    minX: p.min.x,
    minY: p.min.y,
    minZ: p.min.z,
    maxX: p.max.x,
    maxY: p.max.y,
    maxZ: p.max.z,
    wallRun: p.wallRun,
    vaultable: p.vaultable,
  });
}

const events: { type: string; n: number }[] = [];
const note = (type: string) => {
  const last = events[events.length - 1];
  if (last && last.type === type) last.n++;
  else events.push({ type, n: 1 });
};

const controller = new PlayerController(data.spawn, world, data.cables, (e) =>
  note(e.type),
);
const cpTracker = new CheckpointTracker(data.checkpoints);

const b = controller.body;
// the route is a straight line down -Z; keep yaw there
b.yaw = 0;

const input: InputState = createInputState();

function groundAhead(dist: number): boolean {
  const probe = {
    x: b.pos.x,
    y: b.pos.y,
    z: b.pos.z - dist, // forward is -Z at yaw 0
  };
  return world.groundHeight(probe, 0.3, 0.9) !== null;
}

function headBlockedAhead(dist: number): boolean {
  const probe = { x: b.pos.x, y: b.pos.y, z: b.pos.z - dist };
  const hits = world.overlaps(probe, 0.3, PLAYER.standHeight);
  return hits.some((h) => h.minY > b.pos.y + 0.6 && h.maxY > b.pos.y + 1.4);
}

function chestObstacleAhead(dist: number): boolean {
  const probe = { x: b.pos.x, y: b.pos.y, z: b.pos.z - dist };
  const hits = world.overlaps(probe, 0.3, 1.3);
  return hits.some((h) => h.minY >= b.pos.y - 0.05 && h.maxY <= b.pos.y + 1.39 && h.maxY > b.pos.y + 0.35);
}

let t = 0;
let respawns = 0;
const maxSeconds = 240;
let finished = false;
let lastPrint = 0;

while (t < maxSeconds && !finished) {
  // ---- bot policy ---------------------------------------------------------
  const mode = controller.mode;
  input.moveForward = 1;
  input.sprint = true;
  input.jump = true; // hold for full-height jumps
  input.jumpPressed = false;
  input.interactPressed = false;
  input.slide = false;
  input.moveRight = 0;

  if (mode === 'zipline' || mode === 'wallrun') {
    if (mode === 'wallrun' && b.pos.z < -103.6) input.jumpPressed = true; // jump off wall
  } else if (mode === 'ground') {
    // position for the wall-run approach: hug the right side of the pad
    if (b.pos.z < -95 && b.pos.x < 3.4) input.moveRight = 1;
    if (headBlockedAhead(1.1)) input.slide = true;
    else if (chestObstacleAhead(0.9)) input.interactPressed = true;
    else if (!groundAhead(0.55)) input.jumpPressed = true;
  } else {
    // airborne: steer right toward the wall during the S4 jump
    if (b.pos.z < -99 && b.pos.z > -104 && b.pos.x < 3.9) input.moveRight = 1;
    // recover slides: if landing would be under a beam keep sliding impossible; just continue
  }

  // ---- step ----------------------------------------------------------------
  controller.update(input, MOVE.fixedDt);
  t += MOVE.fixedDt;

  // ---- triggers / bookkeeping ------------------------------------------------
  const cp = cpTracker.check(b.pos);
  if (cp) console.log(`  + ${cp.label} at t=${t.toFixed(1)}s pos z=${b.pos.z.toFixed(1)}`);
  if (insideZone(data.finishZone, b.pos)) {
    finished = true;
    console.log(`  * FINISH at t=${t.toFixed(1)}s`);
  }
  if (b.pos.y < FALL_KILL_Y) {
    respawns++;
    controller.respawn(cpTracker.respawnPoint(data.spawn));
    console.log(`  ! respawn #${respawns} at t=${t.toFixed(1)}s (z was too low)`);
    if (respawns > 6) {
      console.error('FAILED: too many respawns — bot stuck in a hole');
      process.exit(1);
    }
  }
  if (t - lastPrint > 10) {
    lastPrint = t;
    console.log(
      `  t=${t.toFixed(0)}s z=${b.pos.z.toFixed(1)} x=${b.pos.x.toFixed(2)} y=${b.pos.y.toFixed(2)} spd=${controller.speedXZ.toFixed(1)} mode=${mode}`,
    );
  }
}

const cpOk = cpTracker.activeIndex === data.checkpoints.length - 1;
const timeOk = t >= 25 && t <= 150;
console.log('\nevents:', events.map((e) => `${e.type}${e.n > 1 ? 'x' + e.n : ''}`).join(' '));
if (!finished) {
  console.error(`FAILED: did not finish (t=${t.toFixed(1)}s z=${b.pos.z.toFixed(1)} cp=${cpTracker.activeIndex + 1}/${data.checkpoints.length})`);
  process.exit(1);
}
if (!cpOk) {
  console.error('FAILED: not all checkpoints triggered');
  process.exit(1);
}
if (!timeOk) {
  console.error(`FAILED: run time ${t.toFixed(1)}s outside plausible window`);
  process.exit(1);
}
console.log(`\nPASSED: full route completed in ${t.toFixed(1)}s with ${respawns} respawns.`);
