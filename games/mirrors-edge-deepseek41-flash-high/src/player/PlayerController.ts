import * as THREE from 'three';
import type { Input } from '../input/Input';
import type { CollisionWorld } from '../world/CollisionWorld';
import { FirstPersonCamera } from './FirstPersonCamera';
import { ParkourSystem, type ParkourPlayer } from './ParkourSystem';
import { PlayerPhysics } from './PlayerPhysics';

const GRAVITY = 25;
const JUMP_VELOCITY = 9.25;
const WALK_SPEED = 5.7;
const SPRINT_SPEED = 11.3;
const SLIDE_HEIGHT = 0.95;
const STAND_HEIGHT = 1.8;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.16;
const MAX_FALL = 46;

export interface PlayerEvents {
  jumped: boolean;
  landed: number;
  wallRunStarted: boolean;
  wallJumped: boolean;
  vaulted: boolean;
  mantled: boolean;
  footstep: number;
  slideStarted: boolean;
  slideEnded: boolean;
}

function emptyEvents(): PlayerEvents {
  return {
    jumped: false,
    landed: 0,
    wallRunStarted: false,
    wallJumped: false,
    vaulted: false,
    mantled: false,
    footstep: 0,
    slideStarted: false,
    slideEnded: false,
  };
}

/**
 * The player.  Owns velocity/state, runs a fixed-timestep update and emits
 * gameplay events for audio and camera feedback.
 */
export class PlayerController implements ParkourPlayer {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly radius = 0.36;
  readonly physics: PlayerPhysics;
  readonly parkour: ParkourSystem;

  height = STAND_HEIGHT;
  grounded = false;
  sliding = false;
  wallRunning = false;
  wallSide: -1 | 0 | 1 = 0;
  wallNormalX = 0;
  wallNormalZ = 0;

  yaw = Math.PI;
  forwardX = 0;
  forwardZ = 1;

  sprinting = false;
  speed = 0;
  strafeInput = 0;
  forwardInput = 0;

  private jumpBuffer = 0;
  private coyote = 0;
  private jumpCut = false;
  private slideTimer = 0;
  private slideCooldown = 0;
  private airborneTime = 0;
  private stepDistance = 0;
  private wantsStand = false;

  readonly events: PlayerEvents = emptyEvents();

  constructor(
    private readonly world: CollisionWorld,
    private readonly camera: FirstPersonCamera,
  ) {
    this.physics = new PlayerPhysics(world);
    this.parkour = new ParkourSystem(world);
  }

  reset(position: THREE.Vector3, yaw: number): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.height = STAND_HEIGHT;
    this.grounded = false;
    this.sliding = false;
    this.wallRunning = false;
    this.wallSide = 0;
    this.wallNormalX = 0;
    this.wallNormalZ = 0;
    this.yaw = yaw;
    this.camera.setYaw(yaw);
    this.sprinting = false;
    this.speed = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.jumpCut = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.airborneTime = 0;
    this.stepDistance = 0;
    this.wantsStand = false;
    this.parkour.reset();
    this.events.jumped = false;
    this.events.landed = 0;
    this.events.wallRunStarted = false;
    this.events.wallJumped = false;
    this.events.vaulted = false;
    this.events.mantled = false;
    this.events.footstep = 0;
    this.events.slideStarted = false;
    this.events.slideEnded = false;
  }

  consumeEvents(): PlayerEvents {
    const copy: PlayerEvents = { ...this.events };
    this.events.jumped = false;
    this.events.landed = 0;
    this.events.wallRunStarted = false;
    this.events.wallJumped = false;
    this.events.vaulted = false;
    this.events.mantled = false;
    this.events.footstep = 0;
    this.events.slideStarted = false;
    this.events.slideEnded = false;
    return copy;
  }

  update(dt: number, input: Input, yaw: number): void {
    this.yaw = yaw;
    this.forwardX = -Math.sin(yaw);
    this.forwardZ = -Math.cos(yaw);

    this.parkour.tickCooldowns(dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    // ------------------------------------------------------ jump input buffer
    if (input.wasPressed('Space')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - dt);
    this.airborneTime = this.grounded ? 0 : this.airborneTime + dt;

    // Read movement intent in camera space.
    let f = 0;
    let r = 0;
    if (input.anyDown('KeyW', 'ArrowUp')) f += 1;
    if (input.anyDown('KeyS', 'ArrowDown')) f -= 1;
    if (input.anyDown('KeyD', 'ArrowRight')) r += 1;
    if (input.anyDown('KeyA', 'ArrowLeft')) r -= 1;
    this.forwardInput = f;
    this.strafeInput = r;

    let wishX = this.forwardX * f + Math.cos(yaw) * r;
    let wishZ = this.forwardZ * f - Math.sin(yaw) * r;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    this.sprinting = input.anyDown('ShiftLeft', 'ShiftRight') && f > 0;

    const crouchHeld = input.anyDown('ControlLeft', 'ControlRight', 'KeyC');
    const crouchPressed = input.wasPressed('KeyC') || input.wasPressed('ControlLeft') || input.wasPressed('ControlRight');

    // -------------------------------------------------- vault / mantle action
    if (this.parkour.isBusy) {
      const active = this.parkour.updateAction(this, dt);
      if (active) {
        this.speed = Math.hypot(this.velocity.x, this.velocity.z);
        return;
      }
    }

    // -------------------------------------------------------------- sliding
    if (this.sliding) {
      this.slideTimer += dt;
      if (!crouchHeld && this.slideTimer > 0.14) this.wantsStand = true;
      if (this.slideTimer > 1.6) this.wantsStand = true;
      if (this.speed < 4.6) this.wantsStand = true;
      if (this.wantsStand) {
        if (this.tryStand()) {
          this.events.slideEnded = true;
        }
        this.wantsStand = false;
      }
    }

    if (
      crouchPressed &&
      !this.sliding &&
      this.grounded &&
      this.slideCooldown <= 0 &&
      !this.wallRunning &&
      Math.hypot(this.velocity.x, this.velocity.z) > 5.2
    ) {
      this.startSlide();
    }

    if (this.sliding && !this.grounded && this.airborneTime > 0.32) {
      if (this.tryStand()) this.events.slideEnded = true;
    }

    // -------------------------------------------------------------- wall run
    if (this.wallRunning) {
      const result = this.parkour.updateWallRun(this, this.jumpBuffer > 0, dt);
      if (result.jumped) {
        this.events.wallJumped = true;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.jumpCut = true;
        this.camera.wallJumpKick();
      }
    } else if (!this.sliding && !this.parkour.isBusy && !this.grounded) {
      if (this.parkour.tryStartWallRun(this)) {
        this.events.wallRunStarted = true;
        this.camera.jumpKick(0.25);
        this.jumpCut = true;
      }
    }

    // ----------------------------------------------------------------- vault
    if (input.wasPressed('KeyE') && !this.wallRunning && !this.sliding) {
      if (this.parkour.tryVault(this)) {
        this.events.vaulted = true;
        this.velocity.y = 0;
        this.speed = Math.hypot(this.velocity.x, this.velocity.z);
        return;
      }
    }

    // ------------------------------------------------------------ ledge grab
    if (!this.wallRunning && !this.sliding && !this.grounded && !this.parkour.isBusy) {
      const wantsMantle = f > 0 || input.isDown('Space');
      if (wantsMantle && this.airborneTime > 0.08) {
        if (this.parkour.tryMantle(this, wantsMantle)) {
          this.events.mantled = true;
          this.velocity.y = 0;
          return;
        }
      }
    }

    // ------------------------------------------------------------- movement
    if (!this.wallRunning) {
      if (this.sliding) {
        this.updateSlide(dt, wishX, wishZ, wishLen);
      } else {
        this.updateSteering(dt, wishX, wishZ, wishLen);
      }
    }

    // ---------------------------------------------------------------- jump
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.wallRunning) {
      if (this.sliding && !this.tryStand()) {
        // No headroom to jump while under a low ceiling.
      } else {
        this.jump();
      }
    }

    // Variable jump height: releasing early clips the arc.
    if (!input.isDown('Space') && this.velocity.y > 0 && !this.jumpCut) {
      this.velocity.y *= 0.52;
      this.jumpCut = true;
    }
    if (input.isDown('Space') && this.velocity.y > 0) {
      // still ascending with jump held
    }

    // --------------------------------------------------------------- gravity
    if (this.wallRunning) {
      this.velocity.y -= GRAVITY * 0.12 * dt;
      if (this.velocity.y < -2.3) this.velocity.y = -2.3;
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -MAX_FALL) this.velocity.y = -MAX_FALL;
    }

    // ---------------------------------------------------------------- physics
    const wasGrounded = this.grounded;
    const fallSpeed = -this.velocity.y;
    const result = this.physics.step(this, dt);

    if (!wasGrounded && this.grounded) {
      const impact = Math.max(0, fallSpeed);
      this.events.landed = Math.max(this.events.landed, impact);
      this.camera.land(impact);
      this.airborneTime = 0;
      this.jumpCut = false;
      this.parkour.stopWallRun(this);
      this.stepDistance = 0;

      // Landing with crouch held smoothly rolls into a slide.
      if (crouchHeld && !this.sliding && Math.hypot(this.velocity.x, this.velocity.z) > 6.5) {
        this.startSlide();
      }
    }

    if (this.grounded && this.wallRunning) {
      this.parkour.stopWallRun(this);
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Footstep distance accumulator.
    if (this.grounded && !this.sliding && this.speed > 1.4) {
      this.stepDistance += this.speed * dt;
      const stride = this.sprinting ? 3.1 : 2.15;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.events.footstep++;
      }
    }

    // Sliding friction can reduce speed below the standing threshold.
    if (this.sliding && this.grounded && this.speed < 4.0) {
      if (this.tryStand()) this.events.slideEnded = true;
    }

    if (this.grounded) this.coyote = COYOTE_TIME;
    if (result.hitCeiling && this.velocity.y > 0) this.velocity.y = 0;
  }

  // ------------------------------------------------------------------ state

  private updateSteering(dt: number, wishX: number, wishZ: number, wishLen: number): void {
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    const speed = Math.hypot(vx, vz);

    if (wishLen > 0) {
      const targetSpeed = Math.max(this.sprinting ? SPRINT_SPEED : WALK_SPEED, Math.min(speed, 14.5));
      const desiredX = wishX * targetSpeed;
      const desiredZ = wishZ * targetSpeed;
      const rate = this.grounded ? 14 : 3.4;
      const blend = Math.min(1, rate * dt);
      this.velocity.x += (desiredX - this.velocity.x) * blend;
      this.velocity.z += (desiredZ - this.velocity.z) * blend;

      // Soft drag above the sprint speed so wall-jump boosts fade naturally.
      const newSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (newSpeed > 13.6 && this.grounded) {
        const scale = Math.max(13.2, newSpeed - 3.2 * dt) / newSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    } else if (this.grounded) {
      // Ground friction.  Air has almost no drag to keep jumps predictable.
      const drop = 26 * dt;
      if (speed <= drop) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else {
        this.velocity.x *= (speed - drop) / speed;
        this.velocity.z *= (speed - drop) / speed;
      }
    } else {
      const drag = Math.min(1, 0.35 * dt);
      this.velocity.x *= 1 - drag;
      this.velocity.z *= 1 - drag;
    }
  }

  private updateSlide(dt: number, wishX: number, wishZ: number, wishLen: number): void {
    let speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Steer gradually with the mouse while keeping momentum.
    if (wishLen > 0 && speed > 0.5) {
      const targetAngle = Math.atan2(wishX, wishZ);
      const currentAngle = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = targetAngle - currentAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = 1.7 * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const nx = this.velocity.x * cos + this.velocity.z * sin;
      const nz = -this.velocity.x * sin + this.velocity.z * cos;
      this.velocity.x = nx;
      this.velocity.z = nz;
    }

    const friction = this.grounded ? 3.6 : 1.2;
    speed = Math.max(3.6, speed - friction * dt);
    const current = Math.hypot(this.velocity.x, this.velocity.z);
    if (current > 0.001) {
      this.velocity.x *= speed / current;
      this.velocity.z *= speed / current;
    }
  }

  private startSlide(): void {
    this.sliding = true;
    this.height = SLIDE_HEIGHT;
    this.slideTimer = 0;
    this.wantsStand = false;
    this.events.slideStarted = true;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0) {
      const boost = Math.min(speed * 1.06 + 0.5, 14.5) / speed;
      this.velocity.x *= boost;
      this.velocity.z *= boost;
    }
    this.velocity.y = Math.min(this.velocity.y, 0);
  }

  private tryStand(): boolean {
    if (!this.sliding) {
      this.height = STAND_HEIGHT;
      return true;
    }
    const x = this.position.x;
    const y = this.position.y;
    const z = this.position.z;
    // Use the full collision radius plus a small safety margin so the player
    // can never stand up while 1 cm inside a vent's footprint.
    const r = this.radius + 0.02;
    const blocked = this.world.overlaps(
      x - r,
      y + 0.03,
      z - r,
      x + r,
      y + STAND_HEIGHT - 0.03,
      z + r,
    );
    if (blocked) return false;

    this.sliding = false;
    this.height = STAND_HEIGHT;
    this.slideCooldown = 0.25;

    // Final guard: if raising the box created an intersection, crouch again.
    const rr = this.radius - 0.005;
    if (this.world.overlaps(x - rr, y + 0.005, z - rr, x + rr, y + STAND_HEIGHT - 0.005, z + rr)) {
      this.sliding = true;
      this.height = SLIDE_HEIGHT;
      return false;
    }
    return true;
  }

  private jump(): void {
    this.velocity.y = JUMP_VELOCITY;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.jumpCut = false;
    this.grounded = false;
    this.events.jumped = true;
    this.camera.jumpKick(0.6);
  }

  get isSliding(): boolean {
    return this.sliding;
  }
}
