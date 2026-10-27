/**
 * Diagnostic for wall-run -> wall-jump -> wall-run chains.
 *
 * Builds a simple canyon (right wall, then left wall) and runs the chain with
 * different look directions and jump timings, reporting how smooth each
 * transition is: wall bonks in the air, the vertical-velocity snap when the
 * second wall run starts, speed kept, and time between walls.
 *
 *   npx tsx scripts/walljump-test.ts
 */
import { Vector3 } from 'three';
import { PlayerController, type PlayerInput } from '../src/player/PlayerController';
import { PHYS } from '../src/player/PlayerPhysics';
import { CollisionWorld } from '../src/world/CollisionWorld';

function canyon(width: number): CollisionWorld {
  const w = new CollisionWorld();
  const h = width / 2;
  w.add({ minX: -6, maxX: 6, minY: -1, maxY: 0, minZ: 0, maxZ: 40 }); // runway
  w.add({ minX: h, maxX: h + 8, minY: -60, maxY: 30, minZ: -22, maxZ: 0 }); // right wall
  w.add({ minX: -h - 8, maxX: -h, minY: -60, maxY: 30, minZ: -40, maxZ: -14 }); // left wall
  w.add({ minX: -6, maxX: 6, minY: -60, maxY: -1, minZ: -80, maxZ: -44 }); // landing (1m lower)
  return w;
}

interface Result {
  label: string;
  secondRun: boolean;
  bonks: number;
  gap: number;
  vyBefore: number;
  vyAfter: number;
  speedBefore: number;
  speedAfter: number;
  landed: boolean;
  landZ: number;
}

function run(label: string, width: number, jumpZ: number, lookYaw: number, holdJump: number): Result {
  const world = canyon(width);
  const p = new PlayerController(world);
  p.respawn(new Vector3(width / 2 - 0.65, 0, 30));
  const dt = PHYS.fixedStep;
  let t = 0;
  let phase = 0; // 0 run-up, 1 first wall, 2 jumped, 3 second wall, 4 done
  let hold = 0;
  let jumpT = 0;
  const r: Result = { label, secondRun: false, bonks: 0, gap: 0, vyBefore: 0, vyAfter: 0, speedBefore: 0, speedAfter: 0, landed: false, landZ: 0 };
  let lastVy = 0;
  let lastSpeed = 0;
  while (t < 8) {
    const inp: PlayerInput = { moveX: 0, moveZ: 1, sprint: true, jumpHeld: hold > 0, jumpPressed: false, slideHeld: false, slidePressed: false, interactPressed: false, yaw: 0 };
    if (phase === 0 && p.pos.z <= 0.3) {
      inp.jumpPressed = inp.jumpHeld = true;
      hold = 0.3;
      phase = 0.5;
    }
    if (phase === 1 && p.pos.z <= jumpZ) {
      inp.jumpPressed = inp.jumpHeld = true;
      hold = holdJump;
      phase = 2;
      jumpT = t;
    }
    if (phase >= 2) inp.yaw = lookYaw;
    if (phase >= 3) inp.yaw = 0; // look back down the canyon once on the second wall
    hold = Math.max(0, hold - dt);
    lastVy = p.vel.y;
    lastSpeed = p.horizontalSpeed;
    const before = p.state;
    p.tick(dt, inp);
    t += dt;
    if (phase === 0.5 && p.state === 'wallrun') phase = 1;
    if (phase === 2 && p.state === 'air' && p.body.walls.length > 0) r.bonks++;
    if (phase === 2 && p.state === 'wallrun' && before !== 'wallrun') {
      phase = 3;
      r.secondRun = true;
      r.gap = t - jumpT;
      r.vyBefore = lastVy;
      r.vyAfter = p.vel.y;
      r.speedBefore = lastSpeed;
      r.speedAfter = p.horizontalSpeed;
    }
    if (p.grounded && phase >= 2) {
      r.landed = p.pos.y > -1.5;
      r.landZ = p.pos.z;
      break;
    }
    if (p.pos.y < -20) break;
    p.events.length = 0;
  }
  return r;
}

const rows: Result[] = [];
for (const width of [4]) {
  for (const jumpZ of [-4, -8, -12]) {
    for (const look of [0, 0.35, 0.8, 1.2]) {
      for (const hold of [0.05, 0.3]) {
        rows.push(run(`w=${width} jumpAt=${jumpZ} look=${look.toFixed(2)} hold=${hold}`, width, jumpZ, look, hold));
      }
    }
  }
}
console.log('scenario'.padEnd(40), '2nd run  bonks  gap(s)  vy before->after   speed before->after  landed');
for (const r of rows) {
  console.log(
    r.label.padEnd(40),
    (r.secondRun ? 'yes' : 'NO ').padEnd(8),
    String(r.bonks).padEnd(6),
    r.gap.toFixed(2).padEnd(7),
    `${r.vyBefore.toFixed(1).padStart(5)} -> ${r.vyAfter.toFixed(1).padStart(5)}`.padEnd(19),
    `${r.speedBefore.toFixed(1).padStart(5)} -> ${r.speedAfter.toFixed(1).padStart(5)}`.padEnd(21),
    r.landed ? `yes z=${r.landZ.toFixed(1)}` : 'NO',
  );
}
