import { Vector3 } from 'three';
import type { CollisionWorld } from '../world/CollisionWorld';
import { findClimb, findOppositeWall, findWall, type ClimbTarget, type WallInfo } from './ParkourSystem';
import { hasRoom, KinematicBody, moveAndCollide, PHYS } from './PlayerPhysics';

/** Input snapshot for one fixed physics tick. */
export interface PlayerInput {
  /** -1..1, positive = right */
  moveX: number;
  /** -1..1, positive = forward */
  moveZ: number;
  sprint: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  slideHeld: boolean;
  slidePressed: boolean;
  interactPressed: boolean;
  /** Camera yaw in radians; 0 looks down -Z. */
  yaw: number;
}

export type MoveState = 'ground' | 'air' | 'slide' | 'wallrun' | 'climb';

export type PlayerEvent =
  | { type: 'jump'; speed: number }
  | { type: 'land'; impact: number; speed: number }
  | { type: 'slideStart'; speed: number }
  | { type: 'slideEnd' }
  | { type: 'wallrunStart'; side: number }
  | { type: 'wallrunEnd' }
  | { type: 'walljump'; side: number }
  | { type: 'vault' }
  | { type: 'mantle' };

interface ClimbMotion {
  kind: 'vault' | 'mantle';
  t: number;
  duration: number;
  start: Vector3;
  over: Vector3;
  end: Vector3;
  exitVel: Vector3;
  exitState: MoveState;
}

const UP_ROOM = PHYS.standHeight;

/**
 * Player movement state machine. Runs at a fixed timestep; all parkour
 * mechanics live here and use ParkourSystem for environment queries.
 */
export class PlayerController {
  readonly body = new KinematicBody();
  /** Position at the previous tick, used for render interpolation. */
  readonly prevPos = new Vector3();

  state: MoveState = 'ground';
  crouched = false;
  /** Seconds spent in the current state. */
  stateTime = 0;

  // Jump helpers
  private coyote = 0;
  private jumpBuffer = 0;
  private slideBuffer = 0;
  private jumping = false;

  // Slide
  private slideDir = new Vector3();
  private slideSpeed = 0;

  // Wall run
  wallSide = 0;
  private wall: WallInfo | null = null;
  private wallAlong = new Vector3();
  private wallSpeed = 0;
  private usedWallNormals: string[] = [];
  private wallCooldown = 0;
  /** Air steering is disabled while this is > 0 (after wall jumps). */
  private airLock = 0;
  /** True from a wall jump until the next landing / wall run: a clean, uncut arc. */
  private wallJumpFlight = false;

  // Vault / mantle
  climb: ClimbMotion | null = null;

  /** Events produced during the last ticks; drained by the game each frame. */
  readonly events: PlayerEvent[] = [];

  constructor(private world: CollisionWorld) {}

  /** Switch to another level's collision world. */
  setWorld(world: CollisionWorld): void {
    this.world = world;
  }

  get pos(): Vector3 {
    return this.body.pos;
  }

  get vel(): Vector3 {
    return this.body.vel;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.body.vel.x, this.body.vel.z);
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  /** 0..1 progress of the current vault/mantle (or -1 when not climbing). */
  get climbProgress(): number {
    return this.climb ? this.climb.t / this.climb.duration : -1;
  }

  respawn(pos: Vector3): void {
    this.body.pos.copy(pos);
    this.prevPos.copy(pos);
    this.body.vel.set(0, 0, 0);
    this.body.height = PHYS.standHeight;
    this.body.grounded = true;
    this.state = 'ground';
    this.stateTime = 0;
    this.crouched = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;
    this.wall = null;
    this.wallSide = 0;
    this.usedWallNormals.length = 0;
    this.airLock = 0;
    this.wallJumpFlight = false;
    this.wallCooldown = 0;
    this.climb = null;
    this.events.length = 0;
  }

  tick(dt: number, input: PlayerInput): void {
    this.prevPos.copy(this.body.pos);
    this.stateTime += dt;
    this.jumpBuffer = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.slideBuffer = input.slidePressed ? PHYS.jumpBuffer * 1.5 : Math.max(0, this.slideBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.airLock = Math.max(0, this.airLock - dt);

    // Horizontal look direction and desired movement direction.
    const fx = -Math.sin(input.yaw);
    const fz = -Math.cos(input.yaw);
    const rx = Math.cos(input.yaw);
    const rz = -Math.sin(input.yaw);
    let wx = fx * input.moveZ + rx * input.moveX;
    let wz = fz * input.moveZ + rz * input.moveX;
    const wishLen = Math.hypot(wx, wz);
    if (wishLen > 1e-3) {
      wx /= wishLen;
      wz /= wishLen;
    }
    const hasWish = wishLen > 1e-3;

    switch (this.state) {
      case 'climb':
        this.updateClimb(dt);
        return;
      case 'wallrun':
        this.updateWallRun(dt, input, fx, fz);
        return;
      case 'slide':
        this.updateSlide(dt, input, wx, wz, hasWish);
        return;
      default:
        this.updateMove(dt, input, fx, fz, wx, wz, hasWish);
    }
  }

  // ---------------------------------------------------------------------------
  // Ground and air movement
  // ---------------------------------------------------------------------------

  private updateMove(dt: number, input: PlayerInput, fx: number, fz: number, wx: number, wz: number, hasWish: boolean): void {
    const b = this.body;
    const v = b.vel;
    const onGround = b.grounded;
    const speed = this.horizontalSpeed;

    // --- Crouch / stand ------------------------------------------------------
    if (onGround && input.slideHeld && !this.crouched && speed <= PHYS.slideMinSpeed) this.setCrouched(true);
    if (this.crouched && (!input.slideHeld || !onGround) && hasRoom(this.world, b.pos, UP_ROOM)) this.setCrouched(false);

    // --- Actions that replace normal movement --------------------------------
    if (onGround) {
      if (this.slideBuffer > 0 && speed > PHYS.slideMinSpeed) {
        this.startSlide(v.x / speed, v.z / speed, speed);
        return;
      }
      // Jump next to a waist-high obstacle = vault (Mirror's Edge style).
      if (this.jumpBuffer > 0 && input.moveZ > 0 && this.tryClimb(fx, fz, 0.7, 0.35, 1.4, true)) return;
      if (input.interactPressed && this.tryClimb(fx, fz, 1.0, 0.3, 2.05, true)) return;
    } else {
      if (input.interactPressed && this.tryClimb(fx, fz, 0.9, 0.05, 2.05, true)) return;
      // Automatic ledge grab: moving into a ledge that's within arm reach.
      // (sliding sideways along the wall is fine; only moving clearly away isn't)
      if (input.moveZ > 0 && v.y < 4.5 && v.x * fx + v.z * fz > -0.4 * Math.hypot(v.x, v.z) - 0.5) {
        if (this.tryClimb(fx, fz, 0.42, 0.05, 2.05, true)) return;
      }
      if (this.tryStartWallRun(input)) return;
    }

    // --- Jump ------------------------------------------------------------------
    if (this.jumpBuffer > 0 && (onGround || this.coyote > 0)) {
      if (!this.crouched || hasRoom(this.world, b.pos, UP_ROOM)) {
        this.setCrouched(false);
        this.doJump(PHYS.jumpSpeed);
      }
    }

    // --- Horizontal acceleration ---------------------------------------------
    if (b.grounded) {
      const sprinting = input.sprint && input.moveZ > 0 && !this.crouched;
      const maxSpeed = this.crouched ? PHYS.crouchSpeed : sprinting ? PHYS.sprintSpeed : PHYS.walkSpeed;
      if (hasWish) {
        // Split velocity into the part along the wish direction (accelerated
        // toward max speed) and the sideways part (bled off quickly). This
        // gives grippy turns while keeping momentum along the travel line.
        let vPar = v.x * wx + v.z * wz;
        let px = v.x - wx * vPar;
        let pz = v.z - wz * vPar;
        const pLen = Math.hypot(px, pz);
        const pNew = Math.max(0, pLen - PHYS.groundSteer * dt);
        if (pLen > 0) {
          px *= pNew / pLen;
          pz *= pNew / pLen;
        }
        if (vPar < maxSpeed) {
          const accel = vPar < PHYS.walkSpeed ? PHYS.groundAccel : PHYS.sprintAccel;
          vPar = Math.min(maxSpeed, vPar + accel * dt);
        } else {
          // Momentum above the cap (from slides, drops...) decays gently.
          vPar = Math.max(maxSpeed, vPar - PHYS.overspeedDecel * dt);
        }
        v.x = wx * vPar + px;
        v.z = wz * vPar + pz;
      } else {
        const s = Math.hypot(v.x, v.z);
        const ns = Math.max(0, s - PHYS.groundFriction * dt);
        if (s > 0) {
          v.x *= ns / s;
          v.z *= ns / s;
        }
      }
    } else if (hasWish && this.airLock <= 0) {
      // Air control. Quake-style: accelerate along the wish direction only
      // until the velocity component along it reaches a small cap. This never
      // removes momentum we already have (holding W after a wall jump keeps
      // the sideways kick), while strafing or pulling back still steers.
      const along = v.x * wx + v.z * wz;
      const add = Math.min(Math.max(0, PHYS.airWishCap - along), PHYS.airAccel * dt);
      v.x += wx * add;
      v.z += wz * add;
      // Strafe keys additionally bend the travel direction a little.
      if (input.moveX !== 0) {
        const s = Math.hypot(v.x, v.z);
        if (s > 0.1) {
          const cross = (v.x / s) * wz - (v.z / s) * wx;
          const dot = (v.x / s) * wx + (v.z / s) * wz;
          const ang = Math.max(-PHYS.airTurnRate * dt, Math.min(PHYS.airTurnRate * dt, Math.atan2(cross, dot)));
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          const nx = v.x * c - v.z * sn;
          const nz = v.x * sn + v.z * c;
          v.x = nx;
          v.z = nz;
        }
      }
    }

    // --- Gravity ---------------------------------------------------------------
    if (!b.grounded) {
      let g = PHYS.gravity;
      // Wall jumps fly a consistent arc (no jump cut, no heavy fall) so they
      // reach the next wall the same way every time.
      if (this.wallJumpFlight) {
        // plain gravity
      } else if (v.y < 0) g *= PHYS.fallGravityMult;
      else if (this.jumping && !input.jumpHeld) g *= PHYS.jumpCutGravityMult; // variable jump height
      v.y = Math.max(v.y - g * dt, -PHYS.maxFallSpeed);
    } else {
      v.y = Math.min(v.y, 0) - PHYS.gravity * dt;
    }

    this.integrate(dt, input);
  }

  /** Move the body and handle landing / leaving the ground. */
  private integrate(dt: number, input: PlayerInput): void {
    const b = this.body;
    const wasGrounded = b.grounded;
    moveAndCollide(this.world, b, dt, { stepUp: true, snapToGround: !this.jumping });

    if (b.vel.y <= 0) this.jumping = false;

    if (b.grounded && !wasGrounded) {
      this.onLand(input);
    } else if (!b.grounded && wasGrounded) {
      if (!this.jumping) this.coyote = PHYS.coyoteTime;
      this.setState('air');
    }
  }

  private onLand(input: PlayerInput): void {
    const b = this.body;
    const impact = -b.landingSpeed;
    const speed = this.horizontalSpeed;
    this.jumping = false;
    this.wallJumpFlight = false;
    this.usedWallNormals.length = 0;
    this.events.push({ type: 'land', impact, speed });

    // Landing while holding slide converts the fall into a slide (keeps flow).
    if ((input.slideHeld || this.slideBuffer > 0) && speed > PHYS.slideMinSpeed) {
      this.startSlide(b.vel.x / speed, b.vel.z / speed, speed);
      return;
    }
    if (impact > PHYS.hardLandingSpeed) {
      // Hard landing: controlled friction, scaled by how hard we hit.
      const keep = Math.max(0.55, 1 - (impact - PHYS.hardLandingSpeed) * 0.04);
      b.vel.x *= keep;
      b.vel.z *= keep;
    }
    this.setState('ground');
  }

  private doJump(vy: number): void {
    const b = this.body;
    b.vel.y = vy;
    b.grounded = false;
    this.jumping = true;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.setState('air');
    this.events.push({ type: 'jump', speed: this.horizontalSpeed });
  }

  private setCrouched(on: boolean): void {
    this.crouched = on;
    this.body.height = on ? PHYS.crouchHeight : PHYS.standHeight;
  }

  private setState(s: MoveState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Slide
  // ---------------------------------------------------------------------------

  private startSlide(dx: number, dz: number, speed: number): void {
    this.setCrouched(true);
    this.slideBuffer = 0;
    this.slideDir.set(dx, 0, dz);
    this.slideSpeed = Math.min(PHYS.slideMaxSpeed, Math.max(speed + PHYS.slideBoost, speed * 1.08));
    this.setState('slide');
    this.events.push({ type: 'slideStart', speed: this.slideSpeed });
  }

  private endSlide(next: MoveState, keepCrouch = false): void {
    this.events.push({ type: 'slideEnd' });
    this.slideBuffer = 0;
    // Stand up only where there's headroom; otherwise stay crouched.
    if (!keepCrouch && hasRoom(this.world, this.body.pos, UP_ROOM)) this.setCrouched(false);
    this.setState(next);
  }

  private updateSlide(dt: number, input: PlayerInput, wx: number, wz: number, hasWish: boolean): void {
    const b = this.body;

    // Jump out of the slide, carrying its momentum.
    if (this.jumpBuffer > 0 && hasRoom(this.world, b.pos, UP_ROOM)) {
      this.endSlide('air');
      b.vel.x = this.slideDir.x * this.slideSpeed;
      b.vel.z = this.slideDir.z * this.slideSpeed;
      this.doJump(PHYS.jumpSpeed * 0.95);
      this.integrate(dt, input);
      return;
    }

    // Gentle steering toward the wish direction.
    if (hasWish) {
      const cross = this.slideDir.x * wz - this.slideDir.z * wx;
      const dot = this.slideDir.x * wx + this.slideDir.z * wz;
      if (dot > -0.2) {
        const angle = Math.max(-PHYS.slideSteer * dt, Math.min(PHYS.slideSteer * dt, Math.atan2(cross, dot)));
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = this.slideDir.x * c - this.slideDir.z * s;
        const nz = this.slideDir.x * s + this.slideDir.z * c;
        this.slideDir.set(nx, 0, nz).normalize();
      }
    }

    this.slideSpeed = Math.max(0, this.slideSpeed - PHYS.slideFriction * dt);
    b.vel.x = this.slideDir.x * this.slideSpeed;
    b.vel.z = this.slideDir.z * this.slideSpeed;
    b.vel.y = Math.min(b.vel.y, 0) - PHYS.gravity * dt;

    moveAndCollide(this.world, b, dt, { stepUp: true, snapToGround: true });

    // Hitting a wall kills the slide speed in that direction.
    if (b.walls.length > 0) {
      this.slideSpeed = Math.hypot(b.vel.x, b.vel.z);
      if (this.slideSpeed > 0.01) this.slideDir.set(b.vel.x / this.slideSpeed, 0, b.vel.z / this.slideSpeed);
    }

    if (!b.grounded) {
      // Slid off an edge: keep momentum, become airborne.
      this.endSlide('air');
      this.coyote = PHYS.coyoteTime;
      return;
    }
    if (this.slideSpeed < PHYS.slideEndSpeed) {
      this.endSlide('ground', input.slideHeld);
    }
  }

  // ---------------------------------------------------------------------------
  // Wall run
  // ---------------------------------------------------------------------------

  private tryStartWallRun(input: PlayerInput): boolean {
    const b = this.body;
    if (this.wallCooldown > 0 || input.moveZ <= 0) return false;
    const speed = this.horizontalSpeed;
    if (speed < PHYS.wallRunMinSpeed || b.vel.y < -15) return false;
    const dx = b.vel.x / speed;
    const dz = b.vel.z / speed;
    const wall = findWall(this.world, b, dx, dz, 0, PHYS.wallRunMaxApproach);
    if (!wall) return false;
    const key = `${wall.nx},${wall.nz}`;
    if (this.usedWallNormals.includes(key)) return false;

    // Don't wall run right next to the floor (e.g. stepping off a kerb).
    const floor = this.world.groundHeight(b.pos.x, b.pos.z, PHYS.radius, b.pos.y - 0.7, b.pos.y + 0.01);
    if (floor > -Infinity && !this.jumping) return false;

    this.usedWallNormals.push(key);
    this.wall = wall;
    this.wallSide = wall.side;
    // Travel direction = velocity projected onto the wall plane.
    const d = dx * wall.nx + dz * wall.nz;
    this.wallAlong.set(dx - wall.nx * d, 0, dz - wall.nz * d).normalize();
    this.wallSpeed = Math.min(PHYS.wallRunMaxRunSpeed, Math.max(PHYS.wallRunMinRunSpeed, speed));
    // Keep the current vertical speed; updateWallRun eases it into range so
    // latching on never pops the camera.
    b.vel.y = Math.max(-15, Math.min(7, b.vel.y));
    this.airLock = 0;
    this.wallJumpFlight = false;
    this.jumping = false;
    this.setCrouched(false);
    this.setState('wallrun');
    this.events.push({ type: 'wallrunStart', side: wall.side });
    return true;
  }

  private endWallRun(next: MoveState, pushOff: number, cooldown = 0.25): void {
    const b = this.body;
    if (this.wall && pushOff > 0) {
      b.vel.x += this.wall.nx * pushOff;
      b.vel.z += this.wall.nz * pushOff;
    }
    this.wall = null;
    this.wallSide = 0;
    this.wallCooldown = cooldown;
    this.setState(next);
    this.events.push({ type: 'wallrunEnd' });
  }

  private updateWallRun(dt: number, input: PlayerInput, fx: number, fz: number): void {
    const b = this.body;
    const wall = this.wall!;

    // Wall jump: kick away from the wall. If another wall faces us across a
    // gap, size the kick to land on it (wall-to-wall chains); otherwise bias
    // it toward where we're looking.
    if (this.jumpBuffer > 0) {
      const side = this.wallSide;
      const along = this.wallSpeed * 0.96;
      let hx: number;
      let hz: number;
      const opposite = findOppositeWall(this.world, b, wall.nx, wall.nz, this.wallAlong.x, this.wallAlong.z, PHYS.wallJumpAssistRange);
      if (opposite && opposite.ahead < along * 0.75) {
        // Arrive in the opposite wall's latch range in ~0.32s, or just as that
        // wall begins if it starts further ahead.
        const arrive = Math.max(0.32, Math.min(0.7, (opposite.ahead + 1) / Math.max(along, 1)));
        const out = Math.max(3.5, Math.min(11, (opposite.gap - PHYS.radius - 0.55) / arrive));
        hx = this.wallAlong.x * along + wall.nx * out;
        hz = this.wallAlong.z * along + wall.nz * out;
      } else {
        hx = this.wallAlong.x * along + wall.nx * PHYS.wallJumpOut;
        hz = this.wallAlong.z * along + wall.nz * PHYS.wallJumpOut;
        const lookAway = fx * wall.nx + fz * wall.nz;
        if (lookAway > 0.25) {
          const sp = Math.max(Math.hypot(hx, hz), 8.5);
          hx = hx * 0.4 + fx * sp * 0.6;
          hz = hz * 0.4 + fz * sp * 0.6;
        }
      }
      this.endWallRun('air', 0, 0.1);
      b.vel.x = hx;
      b.vel.z = hz;
      this.doJump(PHYS.wallJumpUp);
      this.airLock = PHYS.wallJumpLock;
      this.wallJumpFlight = true;
      this.events.push({ type: 'walljump', side });
      this.integrate(dt, input);
      return;
    }

    // Vertical motion. Right after latching on, ease vertical speed into the
    // wall-run band (a short "grip"); after that gravity is weak at first,
    // then ramps up so the run naturally ends.
    const vy = b.vel.y;
    if (this.stateTime < 0.3 && vy < PHYS.wallRunEnterVyMin) {
      b.vel.y = Math.min(PHYS.wallRunEnterVyMin, vy + PHYS.wallRunGrip * dt);
    } else if (this.stateTime < 0.3 && vy > PHYS.wallRunEnterVyMax) {
      b.vel.y = Math.max(PHYS.wallRunEnterVyMax, vy - PHYS.wallRunGrip * dt);
    } else {
      const g = this.stateTime < PHYS.wallRunMaxTime * 0.65 ? PHYS.wallRunGravity : PHYS.wallRunLateGravity;
      b.vel.y = Math.max(vy - g * dt, -8);
    }
    this.wallSpeed = Math.max(PHYS.wallRunMinSpeed, this.wallSpeed - 0.6 * dt);
    // Run along the wall while pressing into it - harder when we latched on
    // from further away, so we settle against the wall quickly.
    const pull = 1.5 + Math.min(5, Math.max(0, wall.distance) * 9);
    b.vel.x = this.wallAlong.x * this.wallSpeed - wall.nx * pull;
    b.vel.z = this.wallAlong.z * this.wallSpeed - wall.nz * pull;

    moveAndCollide(this.world, b, dt, { stepUp: false, snapToGround: false });

    if (b.grounded) {
      this.endWallRun('ground', 0);
      this.events.push({ type: 'land', impact: 0, speed: this.horizontalSpeed });
      this.usedWallNormals.length = 0;
      return;
    }

    // Blocked by something ahead?
    const alongSpeed = b.vel.x * this.wallAlong.x + b.vel.z * this.wallAlong.z;
    if (alongSpeed < this.wallSpeed * 0.5) {
      this.endWallRun('air', 1);
      return;
    }

    // Keep the velocity purely along the wall for the next tick.
    b.vel.x = this.wallAlong.x * this.wallSpeed;
    b.vel.z = this.wallAlong.z * this.wallSpeed;

    const still = findWall(this.world, b, this.wallAlong.x, this.wallAlong.z, this.wallSide);
    if (!still || still.nx !== wall.nx || still.nz !== wall.nz) {
      // Ran past the end of the wall: carry on with full momentum.
      this.endWallRun('air', 0);
      return;
    }
    this.wall = still;
    if (this.stateTime > PHYS.wallRunMaxTime || input.moveZ < 0 || b.hitCeiling) {
      this.endWallRun('air', 1.6);
    }
  }

  // ---------------------------------------------------------------------------
  // Vault / mantle (kinematic moves)
  // ---------------------------------------------------------------------------

  private tryClimb(fx: number, fz: number, maxDist: number, minRise: number, maxRise: number, allowVault: boolean): boolean {
    const target: ClimbTarget | null = findClimb(this.world, this.body, fx, fz, maxDist, minRise, maxRise, allowVault);
    if (!target) return false;
    const b = this.body;
    const speed = this.horizontalSpeed;
    const start = b.pos.clone();
    let duration: number;
    let exitVel: Vector3;
    let exitState: MoveState;
    if (target.kind === 'vault') {
      // Preserve forward momentum through the vault.
      const exitSpeed = Math.max(speed, 6.5);
      const dist = start.distanceTo(target.end);
      duration = Math.min(0.45, Math.max(0.26, dist / exitSpeed));
      exitVel = new Vector3(fx * exitSpeed, 0, fz * exitSpeed);
      exitState = 'air';
      this.events.push({ type: 'vault' });
    } else {
      const rise = target.top - start.y;
      duration = rise > 1.0 ? 0.42 : 0.28;
      const exitSpeed = rise > 1.0 ? 3.5 : Math.max(3.5, speed * 0.75);
      exitVel = new Vector3(fx * exitSpeed, 0, fz * exitSpeed);
      exitState = 'ground';
      this.events.push({ type: 'mantle' });
    }
    this.climb = { kind: target.kind, t: 0, duration, start, over: target.over, end: target.end, exitVel, exitState };
    this.jumping = false;
    this.jumpBuffer = 0;
    b.vel.set(0, 0, 0);
    this.setCrouched(true); // compact body while passing over things
    this.setState('climb');
    return true;
  }

  private updateClimb(dt: number): void {
    const c = this.climb!;
    const b = this.body;
    c.t = Math.min(c.duration, c.t + dt);
    const u = c.t / c.duration;
    const p = b.pos;
    if (c.kind === 'vault') {
      // Quadratic Bezier passing through `over` at u = 0.5.
      const cx = 2 * c.over.x - 0.5 * (c.start.x + c.end.x);
      const cy = 2 * c.over.y - 0.5 * (c.start.y + c.end.y);
      const cz = 2 * c.over.z - 0.5 * (c.start.z + c.end.z);
      const a = (1 - u) * (1 - u);
      const m = 2 * (1 - u) * u;
      const e = u * u;
      p.set(a * c.start.x + m * cx + e * c.end.x, a * c.start.y + m * cy + e * c.end.y, a * c.start.z + m * cz + e * c.end.z);
    } else {
      // Pull up first, then roll forward over the edge.
      const up = Math.min(1, u / 0.62);
      const fwd = u < 0.45 ? 0 : (u - 0.45) / 0.55;
      const eUp = 1 - (1 - up) * (1 - up);
      const eF = fwd * fwd * (3 - 2 * fwd);
      const lift = c.over.y - c.start.y;
      p.y = c.start.y + lift * eUp + (c.end.y - c.over.y) * eF;
      p.x = c.start.x + (c.end.x - c.start.x) * eF;
      p.z = c.start.z + (c.end.z - c.start.z) * eF;
    }
    if (c.t >= c.duration) {
      p.copy(c.end);
      b.vel.copy(c.exitVel);
      b.grounded = c.exitState === 'ground';
      this.climb = null;
      if (hasRoom(this.world, p, UP_ROOM)) this.setCrouched(false);
      this.setState(c.exitState);
    }
  }
}
