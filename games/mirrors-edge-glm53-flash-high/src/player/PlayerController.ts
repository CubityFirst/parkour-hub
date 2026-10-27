import * as THREE from 'three';
import { CollisionWorld, Collider, MoveResult } from '../world/CollisionWorld';
import { FirstPersonCamera, MotionSettings } from './FirstPersonCamera';
import { InputState } from './InputState';
import { AudioManager } from '../audio/AudioManager';

// ---------------------------------------------------------------------------
// Tuned movement constants — the whole "feel" of the game lives here.
// ---------------------------------------------------------------------------
const GRAVITY = 22;
const STAND_H = 1.8;
const SLIDE_H = 0.8;
const RADIUS = 0.35;

const WALK_SPEED = 6.2;
const SPRINT_SPEED = 10.4;
const GROUND_ACCEL = 60;
const AIR_ACCEL = 22;
const GROUND_FRICTION = 16;

const JUMP_VY = 8.8;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.15;

const SLIDE_MIN_SPEED = 4.2;
const SLIDE_END_SPEED = 2.4;
const SLIDE_FRICTION = 5.0;

const WALLRUN_TIME = 2.2;
const WALLRUN_MIN_SPEED = 4.5;
const WALLRUN_GRAVITY = 0.22;
const WALLRUN_MIN_WALL_HEIGHT = 2.5;

const KILL_Y = -28;

interface ScriptedMove {
  kind: 'vault' | 'mantle';
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  arc: number;
  exitSpeed: number;
}

/**
 * First-person player: movement physics plus every parkour action
 * (sprint, jump, slide, wall run, vault, ledge mantle).
 * Updated at a fixed timestep by Game.
 */
export class PlayerController {
  readonly pos = new THREE.Vector3();   // center of the player AABB
  readonly vel = new THREE.Vector3();
  height = STAND_H;
  grounded = false;
  sliding = false;
  /** -1..1, used by the camera for strafe lean */
  strafeLean = 0;
  hSpeed = 0;
  readonly checkpoint = new THREE.Vector3();
  respawnYaw = 0;

  // Movement state
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCut = false;
  private airTime = 0;
  private stepDistance = 0;
  private prevVy = 0;
  private slidePressed = false;

  // Wall run state
  private wallrunActive = false;
  private wallNormal = new THREE.Vector3();
  private wallTangent = new THREE.Vector3();
  private wallTime = 0;
  private wallCooldown = 0;
  private wallGrace = 0;
  private lastWallId = -1;

  // Scripted vault / mantle animation
  private scripted: ScriptedMove | null = null;

  // Scratch objects (avoid per-frame allocation)
  private readonly half = new THREE.Vector3(RADIUS, STAND_H / 2, RADIUS);
  private readonly fwd = new THREE.Vector3();
  private readonly rightV = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly probeMin = new THREE.Vector3();
  private readonly probeMax = new THREE.Vector3();
  private readonly probeBuffer: Collider[] = [];
  private readonly moveResult: MoveResult = {
    grounded: false, ceiling: false, hitWall: false, groundCollider: null
  };
  private readonly delta = new THREE.Vector3();

  constructor(
    private readonly world: CollisionWorld,
    private readonly cam: FirstPersonCamera,
    private readonly input: InputState,
    private readonly audio: AudioManager,
    private readonly onRespawn: () => void,
    private readonly onVaultAnim: () => void
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  respawn(at: THREE.Vector3, yaw: number): void {
    this.pos.copy(at);
    this.pos.y += STAND_H / 2 + 0.05;
    this.vel.set(0, 0, 0);
    this.height = STAND_H;
    this.grounded = false;
    this.sliding = false;
    this.wallrunActive = false;
    this.scripted = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airTime = 0;
    this.cam.setWallTilt(0);
    this.cam.yaw = yaw;
    this.cam.pitch = 0;
    this.checkpoint.copy(at);
  }

  respawnToCheckpoint(): void {
    this.respawn(this.checkpoint, this.respawnYaw);
    this.onRespawn();
  }

  update(dt: number, settings: MotionSettings): void {
    void settings; // camera handles motion settings; kept for symmetry
    if (this.scripted) {
      this.updateScripted(dt);
      return;
    }

    // Timers (wall cooldown keeps decaying to -1 so the last wall can be
    // re-used again roughly a second after letting go of it)
    if (this.wallCooldown > -1) this.wallCooldown -= dt;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.coyote > 0) this.coyote -= dt;

    this.readIntents();

    // Parkour attempts
    if (this.input.onPress('KeyE')) this.tryVault();
    if (!this.grounded && this.input.isDown('KeyW') && this.airTime > 0.18 && this.vel.y < 3) {
      this.tryMantle();
    }
    this.updateSlideState(dt);
    if (this.wallrunActive) this.updateWallRun(dt);
    else this.tryStartWallRun();

    // Jumping (with buffer + coyote time)
    const canJump = this.grounded || this.coyote > 0;
    if (this.jumpBuffer > 0 && canJump && !this.wallrunActive) this.doJump();

    // Horizontal acceleration
    if (!this.wallrunActive) {
      if (this.grounded) this.groundMove(dt);
      else this.airMove(dt);
    }

    // Gravity — extra gravity when rising with jump released gives
    // variable jump height; wall running uses reduced gravity.
    let g = GRAVITY;
    if (this.wallrunActive) {
      g = GRAVITY * WALLRUN_GRAVITY;
      if (this.vel.y < -3.5) this.vel.y = -3.5;
    } else if (this.vel.y > 0 && !this.input.isDown('Space') && !this.jumpCut) {
      // jump cut applied once: clamp upward velocity
      this.vel.y = 3 + (this.vel.y - 3) * 0.45;
      this.jumpCut = true;
    }
    this.vel.y -= g * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    // Integrate + collide
    this.prevVy = this.vel.y;
    this.half.y = this.height / 2;
    this.delta.copy(this.vel).multiplyScalar(dt);
    this.world.moveAABB(this.pos, this.half, this.delta, this.moveResult);

    // Ground state
    const wasGrounded = this.grounded;
    if (this.moveResult.grounded) {
      if (!wasGrounded) this.onLand();
      this.grounded = true;
      this.coyote = COYOTE_TIME;
      this.airTime = 0;
      this.vel.y = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }
    if (this.moveResult.ceiling && this.vel.y > 0) this.vel.y = 0;

    // Footsteps
    if (this.grounded && !this.sliding && this.hSpeed > 2) {
      this.stepDistance += this.hSpeed * dt;
      if (this.stepDistance > 2.3) {
        this.stepDistance = 0;
        this.audio.step();
      }
    }

    // Fell off the city
    if (this.pos.y < KILL_Y) this.respawnToCheckpoint();
  }

  // -------------------------------------------------------------------------
  // Input interpretation
  // -------------------------------------------------------------------------

  private readIntents(): void {
    const f = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const s = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
    this.strafeLean = s;

    // Basis vectors from the camera yaw (horizontal only).
    const yaw = this.cam.yaw;
    this.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.rightV.set(Math.cos(yaw), 0, -Math.sin(yaw));

    this.wish.set(0, 0, 0);
    if (f !== 0) this.wish.addScaledVector(this.fwd, f);
    if (s !== 0) this.wish.addScaledVector(this.rightV, s);
    if (this.washLengthSq(this.wish) > 0) this.wish.normalize();

    if (this.input.onPress('Space')) this.jumpBuffer = JUMP_BUFFER;
    if (
      this.input.onPress('ControlLeft') ||
      this.input.onPress('ControlRight') ||
      this.input.onPress('KeyC')
    ) {
      this.slidePressed = true;
    }
  }

  private washLengthSq(v: THREE.Vector3): number {
    return v.x * v.x + v.y * v.y + v.z * v.z;
  }

  private computeHSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // -------------------------------------------------------------------------
  // Ground / air movement (momentum-based)
  // -------------------------------------------------------------------------

  private groundMove(dt: number): void {
    if (this.sliding) {
      // Sliding: momentum decays slowly, small amount of steering.
      const sp = this.computeHSpeed();
      if (sp > 0.01) {
        const newSp = Math.max(0, sp - SLIDE_FRICTION * dt);
        this.scaleHorizontal(newSp / sp);
      }
      if (this.wish.lengthSq() > 0) this.vel.addScaledVector(this.wish, 3.5 * dt);
      return;
    }

    const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const target = sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (this.wish.lengthSq() > 0) {
      const cur = this.vel.x * this.wish.x + this.vel.z * this.wish.z;
      const add = Math.min(target - cur, GROUND_ACCEL * dt);
      if (add > 0) {
        this.vel.x += this.wish.x * add;
        this.vel.z += this.wish.z * add;
      }
    } else {
      const sp = this.computeHSpeed();
      if (sp > 0) {
        const dec = Math.min(sp, GROUND_FRICTION * dt);
        this.scaleHorizontal((sp - dec) / sp);
      }
    }
  }

  private airMove(dt: number): void {
    // Quake-style air acceleration: steering is limited along the wish
    // direction, so existing momentum (e.g. from a sprint jump) is preserved.
    if (this.wish.lengthSq() === 0) return;
    const cur = this.vel.x * this.wish.x + this.vel.z * this.wish.z;
    const add = Math.min(Math.max(SPRINT_SPEED - cur, 0), AIR_ACCEL * dt);
    if (add > 0) {
      this.vel.x += this.wish.x * add;
      this.vel.z += this.wish.z * add;
    }
  }

  private scaleHorizontal(scale: number): void {
    this.vel.x *= scale;
    this.vel.z *= scale;
  }

  // -------------------------------------------------------------------------
  // Jumping
  // -------------------------------------------------------------------------

  private doJump(): void {
    this.vel.y = JUMP_VY;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpCut = false;
    this.audio.jump();
  }

  // -------------------------------------------------------------------------
  // Sliding
  // -------------------------------------------------------------------------

  private updateSlideState(dt: number): void {
    const slideKey =
      this.input.isDown('ControlLeft') ||
      this.input.isDown('ControlRight') ||
      this.input.isDown('KeyC');

    // Start slide
    if (this.slidePressed) {
      this.slidePressed = false;
      if (this.grounded && !this.sliding && this.computeHSpeed() >= SLIDE_MIN_SPEED) {
        this.sliding = true;
      }
    }

    // Try to end slide
    if (this.sliding && (!slideKey || this.computeHSpeed() < SLIDE_END_SPEED)) {
      if (this.canStandAt(this.pos)) this.sliding = false;
      // else: stay crouched — sliding under a low obstacle
    }

    // Height interpolation; blocked headroom keeps the player small.
    const target = this.sliding ? SLIDE_H : STAND_H;
    if (target > this.height && !this.canStandAt(this.pos)) {
      this.height = SLIDE_H;
    } else {
      // Called at a fixed 120 Hz — a fast, smooth height transition.
      this.height += (target - this.height) * Math.min(1, dt * 16);
    }
  }

  private canStandAt(pos: THREE.Vector3): boolean {
    this.probeMin.set(pos.x - RADIUS + 0.02, pos.y - STAND_H / 2 + 0.02, pos.z - RADIUS + 0.02);
    this.probeMax.set(pos.x + RADIUS - 0.02, pos.y + STAND_H / 2 - 0.02, pos.z + RADIUS - 0.02);
    return this.world.overlapAny(this.probeMin, this.probeMax) === null;
  }

  // -------------------------------------------------------------------------
  // Wall running
  // -------------------------------------------------------------------------

  /** Probe for a wall beside the player in the given horizontal direction. */
  private probeWall(dirX: number, dirZ: number): { collider: Collider; normal: THREE.Vector3 } | null {
    const reach = RADIUS + 0.45;
    const cx = this.pos.x + dirX * reach;
    const cy = this.pos.y;
    const cz = this.pos.z + dirZ * reach;
    const hx = 0.3, hy = this.height * 0.45, hz = 0.3;

    this.probeMin.set(cx - hx, cy - hy, cz - hz);
    this.probeMax.set(cx + hx, cy + hy, cz + hz);
    const hits = this.world.collectOverlaps(this.probeMin, this.probeMax, this.probeBuffer);

    let best: Collider | null = null;
    let bestDist = Infinity;
    for (const c of hits) {
      // Wall must be tall enough to run on.
      if (c.max.y - c.min.y < WALLRUN_MIN_WALL_HEIGHT) continue;
      const dx = cx - (c.min.x + c.max.x) / 2;
      const dz = cz - (c.min.z + c.max.z) / 2;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (!best) return null;

    // Face normal: the axis with the smallest overlap between the probe and
    // the wall box; points from the wall toward the player.
    const depthX = Math.min(this.probeMax.x, best.max.x) - Math.max(this.probeMin.x, best.min.x);
    const depthZ = Math.min(this.probeMax.z, best.max.z) - Math.max(this.probeMin.z, best.min.z);
    const n = new THREE.Vector3();
    if (depthX < depthZ) {
      n.set(this.pos.x < (best.min.x + best.max.x) / 2 ? -1 : 1, 0, 0);
    } else {
      n.set(0, 0, this.pos.z < (best.min.z + best.max.z) / 2 ? -1 : 1);
    }
    // The wall must be beside us, not in front of / behind us.
    if (n.x * dirX + n.z * dirZ > -0.5) return null;
    return { collider: best, normal: n };
  }

  private tryStartWallRun(): void {
    if (this.grounded || this.wallCooldown > 0) return;
    if (this.computeHSpeed() < WALLRUN_MIN_SPEED || this.vel.y > 7) return;

    this.cam.getRight(this.rightV);
    for (const side of [1, -1]) {
      const hit = this.probeWall(this.rightV.x * side, this.rightV.z * side);
      if (!hit) continue;
      if (hit.collider.id === this.lastWallId && this.wallCooldown > -0.8) continue;

      this.wallrunActive = true;
      this.wallNormal.copy(hit.normal);
      // Tangent along the wall, oriented with current velocity.
      this.wallTangent.set(this.wallNormal.z, 0, -this.wallNormal.x);
      if (this.wallTangent.dot(this.vel) < 0) this.wallTangent.negate();
      this.wallTime = WALLRUN_TIME;
      this.wallGrace = 0.12;
      this.lastWallId = hit.collider.id;
      // Tilt the camera away from the wall.
      this.cam.setWallTilt(side * 0.16);
      return;
    }
  }

  private updateWallRun(dt: number): void {
    // Keep hugging the wall; end if it disappears beneath/beside us.
    const hit = this.probeWall(-this.wallNormal.x, -this.wallNormal.z);
    if (!hit) {
      this.wallGrace -= dt;
      if (this.wallGrace <= 0) this.endWallRun();
      return;
    }
    this.wallGrace = 0.12;

    this.wallTime -= dt;
    if (this.wallTime <= 0 || this.grounded) {
      this.endWallRun();
      return;
    }

    // Decay speed along the wall slightly.
    const sign = Math.sign(this.vel.dot(this.wallTangent)) || 1;
    let along = Math.abs(this.vel.dot(this.wallTangent));
    along = Math.max(3.0, along - 0.8 * dt);

    // Move along the wall with a small pull toward it.
    this.vel.x = this.wallTangent.x * along * sign - this.wallNormal.x * 1.5;
    this.vel.z = this.wallTangent.z * along * sign - this.wallNormal.z * 1.5;

    // Jump off the wall.
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      this.vel.x = this.wallNormal.x * 7.2 + this.wallTangent.x * along * sign * 0.95;
      this.vel.z = this.wallNormal.z * 7.2 + this.wallTangent.z * along * sign * 0.95;
      this.vel.y = 7.6;
      this.jumpCut = false;
      this.audio.jump();
      this.endWallRun();
      return;
    }

    if (along <= 3.01) this.endWallRun();
  }

  private endWallRun(): void {
    this.wallrunActive = false;
    this.wallCooldown = 0.3;
    this.cam.setWallTilt(0);
  }

  // -------------------------------------------------------------------------
  // Vaulting (E) and automatic ledge mantle
  // -------------------------------------------------------------------------

  /** Find a waist-high obstacle in front of the player. */
  private findVaultTarget(minTop: number, maxTop: number, maxDepth: number): { collider: Collider; target: THREE.Vector3 } | null {
    const feet = this.pos.y - this.height / 2;
    const reach = RADIUS + 0.55;
    const cx = this.pos.x + this.fwd.x * reach;
    const cz = this.pos.z + this.fwd.z * reach;
    const cy = feet + 0.75;

    this.probeMin.set(cx - 0.4, cy - 0.65, cz - 0.4);
    this.probeMax.set(cx + 0.4, cy + 0.65, cz + 0.4);
    const hits = this.world.collectOverlaps(this.probeMin, this.probeMax, this.probeBuffer);

    let best: Collider | null = null;
    let bestDist = Infinity;
    for (const c of hits) {
      const top = c.max.y;
      const rel = top - feet;
      if (rel < minTop || rel > maxTop) continue;
      if (c.min.y > feet + 0.6) continue; // floating obstacle — not vaultable from the ground
      const dx = cx - (c.min.x + c.max.x) / 2;
      const dz = cz - (c.min.z + c.max.z) / 2;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (!best) return null;

    // Reject obstacles that are too deep along the look direction (big walls).
    const alongX = Math.abs(this.fwd.x) > Math.abs(this.fwd.z);
    let nearFace: number, farFace: number;
    if (alongX) {
      nearFace = this.fwd.x > 0 ? best.min.x : best.max.x;
      farFace = this.fwd.x > 0 ? best.max.x : best.min.x;
    } else {
      nearFace = this.fwd.z > 0 ? best.min.z : best.max.z;
      farFace = this.fwd.z > 0 ? best.max.z : best.min.z;
    }
    if (Math.abs(farFace - nearFace) > maxDepth) return null;

    // Landing position just beyond the far face, on top of the obstacle.
    const tx = alongX ? farFace + this.fwd.x * 0.55 : this.pos.x;
    const tz = alongX ? this.pos.z : farFace + this.fwd.z * 0.55;
    const target = new THREE.Vector3(tx, best.max.y + STAND_H / 2 + 0.03, tz);

    // Headroom at the landing spot must be clear.
    this.probeMin.set(tx - 0.33, target.y - STAND_H / 2 + 0.02, tz - 0.33);
    this.probeMax.set(tx + 0.33, target.y + STAND_H / 2 - 0.02, tz + 0.33);
    if (this.world.overlapAny(this.probeMin, this.probeMax)) return null;

    return { collider: best, target };
  }

  private tryVault(): void {
    const found = this.findVaultTarget(0.35, 1.35, 2.5);
    if (!found) return;
    this.scripted = {
      kind: 'vault',
      t: 0,
      dur: 0.45,
      from: this.pos.clone(),
      to: found.target,
      arc: 0.35,
      exitSpeed: Math.max(this.computeHSpeed(), 6.5)
    };
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.sliding = false;
    this.audio.mantle();
    this.onVaultAnim();
  }

  private tryMantle(): void {
    const feet = this.pos.y - this.height / 2;
    const reach = RADIUS + 0.4;
    const cx = this.pos.x + this.fwd.x * reach;
    const cz = this.pos.z + this.fwd.z * reach;

    this.probeMin.set(cx - 0.35, this.pos.y - this.height * 0.55, cz - 0.35);
    this.probeMax.set(cx + 0.35, this.pos.y + this.height * 0.55, cz + 0.35);
    const hits = this.world.collectOverlaps(this.probeMin, this.probeMax, this.probeBuffer);

    for (const c of hits) {
      const top = c.max.y;
      const rel = top - feet;
      if (rel < 0.5 || rel > 2.2) continue;
      if (feet > top - 0.2) continue;

      // Distance from the player to the near face along the look direction.
      const alongX = Math.abs(this.fwd.x) > Math.abs(this.fwd.z);
      let nearFace: number;
      if (alongX) nearFace = this.fwd.x > 0 ? c.min.x : c.max.x;
      else nearFace = this.fwd.z > 0 ? c.min.z : c.max.z;
      const gap = alongX ? Math.abs(nearFace - this.pos.x) : Math.abs(nearFace - this.pos.z);
      if (gap > 1.0) continue;

      const tx = alongX ? nearFace + this.fwd.x * 0.45 : this.pos.x;
      const tz = alongX ? this.pos.z : nearFace + this.fwd.z * 0.45;
      const target = new THREE.Vector3(tx, top + STAND_H / 2 + 0.03, tz);

      this.probeMin.set(tx - 0.33, target.y - STAND_H / 2 + 0.02, tz - 0.33);
      this.probeMax.set(tx + 0.33, target.y + STAND_H / 2 - 0.02, tz + 0.33);
      if (this.world.overlapAny(this.probeMin, this.probeMax)) continue;

      this.scripted = {
        kind: 'mantle',
        t: 0,
        dur: 0.55,
        from: this.pos.clone(),
        to: target,
        arc: 0.12,
        exitSpeed: Math.max(2.5, this.computeHSpeed() * 0.5)
      };
      this.vel.set(0, 0, 0);
      this.audio.mantle();
      this.onVaultAnim();
      return;
    }
  }

  private updateScripted(dt: number): void {
    const s = this.scripted!;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    const e = k * k * (3 - 2 * k); // smoothstep
    this.pos.lerpVectors(s.from, s.to, e);
    this.pos.y += Math.sin(Math.PI * k) * s.arc;
    if (k >= 1) {
      this.pos.copy(s.to);
      this.scripted = null;
      const dx = s.to.x - s.from.x;
      const dz = s.to.z - s.from.z;
      const len = Math.hypot(dx, dz) || 1;
      this.vel.set((dx / len) * s.exitSpeed, 0, (dz / len) * s.exitSpeed);
      this.grounded = true;
      this.coyote = COYOTE_TIME;
      this.airTime = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Landing feedback
  // -------------------------------------------------------------------------

  private onLand(): void {
    const impact = THREE.MathUtils.clamp((-this.prevVy - 5) / 15, 0, 1);
    if (impact > 0.02) {
      this.cam.onLand(0.25 + impact * 0.75);
      this.audio.land(impact);
    }
  }
}
