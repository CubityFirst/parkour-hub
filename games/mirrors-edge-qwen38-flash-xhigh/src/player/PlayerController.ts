/**
 * PlayerController — input interpretation and movement state machine.
 *
 * Runs on a fixed timestep (1/120s). Every tick:
 *   1. apply look input
 *   2. offer the tick to ParkourSystem (wall run / vault / mantle / zipline);
 *      if parkour is driving, core movement is skipped entirely
 *   3. otherwise run ground/air/slide movement with Quake-style accel,
 *      coyote time, jump buffering and variable jump height
 * Emits semantic events (footstep, land, jump, ...) consumed by audio and
 * camera code, so feel-tweaks never touch the simulation.
 */

import { clamp } from '../core/vec3.ts';
import type { InputState } from '../core/Input.ts';
import type { CollisionWorld } from '../world/CollisionWorld.ts';
import type { Cable, ParkourEvent } from './ParkourSystem.ts';
import { MOVE, MOUSE, PLAYER } from './Movement.ts';
import {
  type PlayerBody,
  createBody,
  stepBody,
  wishDirection,
} from './PlayerPhysics.ts';
import { ParkourSystem } from './ParkourSystem.ts';

export type ControllerEventType =
  | 'footstep'
  | 'jump'
  | 'land'
  | 'slideStart'
  | 'slideLoop'
  | 'slideEnd'
  | 'fell'
  | ParkourEvent['type'];

export interface ControllerEvent {
  type: ControllerEventType;
  intensity?: number;
}

export class PlayerController {
  readonly body: PlayerBody;
  readonly parkour = new ParkourSystem();

  /** visual state read by the camera each rendered frame */
  sliding = false;
  sprinting = false;
  speedXZ = 0;
  gaitPhase = 0; // steps in radians, drives bob + footstep timing
  strafeInput = 0;

  private coyote = 0;
  private buffer = 0;
  private jumpCutUsed = true;
  private wasGrounded = true;
  private slideTime = 0;
  private fellLatch = false;
  private onEvent: (e: ControllerEvent) => void;
  private world: CollisionWorld;
  private cables: Cable[];

  constructor(
    spawn: { pos: PlayerBody['pos']; yaw: number },
    world: CollisionWorld,
    cables: Cable[],
    onEvent: (e: ControllerEvent) => void,
  ) {
    this.body = createBody(spawn);
    this.world = world;
    this.cables = cables;
    this.onEvent = onEvent;
  }

  get mode(): string {
    if (this.parkour.mode !== 'none') return this.parkour.mode;
    if (this.sliding) return 'slide';
    return this.body.grounded ? 'ground' : 'air';
  }

  respawn(spawn: { pos: { x: number; y: number; z: number }; yaw: number }): void {
    this.body.pos.x = spawn.pos.x;
    this.body.pos.y = spawn.pos.y;
    this.body.pos.z = spawn.pos.z;
    this.body.vel.x = 0;
    this.body.vel.y = 0;
    this.body.vel.z = 0;
    this.body.yaw = spawn.yaw;
    this.body.pitch = -0.04;
    this.body.height = PLAYER.standHeight;
    this.body.grounded = false;
    this.sliding = false;
    this.slideTime = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.jumpCutUsed = true;
    this.gaitPhase = 0;
    this.fellLatch = false;
    this.parkour.reset(this.body.pos);
  }

  /** One fixed simulation step. */
  update(input: InputState, dt: number): void {
    const b = this.body;
    b.time += dt;

    // ---- look ---------------------------------------------------------
    b.yaw -= input.lookDX * MOUSE.baseYawSpeed;
    b.pitch -= input.lookDY * MOUSE.basePitchSpeed;
    b.pitch = clamp(b.pitch, -MOUSE.pitchLimit, MOUSE.pitchLimit);

    // forward jump input is buffered so pre-landing presses still fire
    if (input.jumpPressed) this.buffer = MOVE.jumpBufferTime;
    else this.buffer = Math.max(0, this.buffer - dt);

    // ---- parkour takeover ---------------------------------------------
    const fwd = input.moveForward;
    const rgt = input.moveRight;
    this.strafeInput = rgt;
    const consumed = this.parkour.update(
      b,
      this.world,
      this.cables,
      dt,
      {
        forward: fwd,
        right: rgt,
        sprint: input.sprint,
        jumpPressed: input.jumpPressed,
        interactPressed: input.interactPressed,
      },
      (e) => this.onEvent(e),
    );
    if (consumed) {
      this.sliding = false;
      this.speedXZ = Math.hypot(b.vel.x, b.vel.z);
      // landing while parked out of parkour states is handled next tick
      return;
    }
    if (b.grounded) {
      this.coyote = MOVE.coyoteTime;
      this.jumpCutUsed = false;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    this.sprinting = input.sprint && fwd > 0.1;

    // ---- slide state machine -------------------------------------------
    const hSpeed = Math.hypot(b.vel.x, b.vel.z);
    if (!this.sliding && b.grounded && input.slide && hSpeed > MOVE.slide.minEnterSpeed) {
      this.sliding = true;
      this.slideTime = 0;
      b.height = PLAYER.slideHeight;
      this.onEvent({ type: 'slideStart', intensity: hSpeed });
    }
    if (this.sliding) {
      this.slideTime += dt;
      const canStand =
        !input.slide &&
        this.slideTime > 0.14 &&
        this.world.fits(b.pos, PLAYER.radius, PLAYER.standHeight);
      if (canStand || (hSpeed < MOVE.slide.minExitSpeed && this.world.fits(b.pos, PLAYER.radius, PLAYER.standHeight))) {
        this.sliding = false;
        b.height = PLAYER.standHeight;
        this.onEvent({ type: 'slideEnd' });
      }
    }
    if (!this.sliding && b.height !== PLAYER.standHeight && this.world.fits(b.pos, PLAYER.radius, PLAYER.standHeight)) {
      b.height = PLAYER.standHeight; // safety: recover from crouch if stuck
    }

    // ---- wish velocity ---------------------------------------------------
    const { dir: wish, magnitude } = wishDirection(b.yaw, fwd, rgt);
    const targetSpeed = this.sprinting ? MOVE.sprintSpeed : MOVE.walkSpeed;

    const wasGrounded = this.wasGrounded;
    const preVy = b.vel.y;

    if (this.sliding) {
      // slide keeps its own friction along the travel direction
      const flags = stepBody(b, this.world, dt, {
        applyGravity: true,
        friction: false,
        stepUp: false,
      });
      applySlideDragOnly(b, dt);
      if (input.jumpPressed || this.buffer > 0) {
        this.buffer = 0;
        b.vel.y = MOVE.jumpSpeed * 0.97;
        const k = MOVE.slide.jumpOutBoost;
        const n = Math.hypot(b.vel.x, b.vel.z) || 1;
        b.vel.x += (b.vel.x / n) * k;
        b.vel.z += (b.vel.z / n) * k;
        this.sliding = false;
        b.height = PLAYER.standHeight;
        this.jumpCutUsed = false;
        this.onEvent({ type: 'jump' });
      }
      this.finishTick(dt, flags, wasGrounded, preVy);
      return;
    }

    if (b.grounded) {
      // ground movement: friction, then accelerate toward the wish velocity
      const flags = stepBody(b, this.world, dt, {
        wish,
        wishSpeed: targetSpeed * magnitude,
        accel: MOVE.groundAccel,
        friction: true,
        applyGravity: true,
        stepUp: true,
      });
      // queued jump (also fires right after landing thanks to buffering)
      if (this.buffer > 0 && (b.grounded || this.coyote > 0)) {
        this.buffer = 0;
        this.coyote = 0;
        b.vel.y = MOVE.jumpSpeed;
        this.jumpCutUsed = false;
        b.grounded = false;
        this.onEvent({ type: 'jump' });
      }
      this.finishTick(dt, flags, wasGrounded, preVy);
      return;
    }

    // ---- airborne -------------------------------------------------------
    const flags = stepBody(b, this.world, dt, {
      wish,
      // air control exists but cannot build speed beyond current momentum
      wishSpeed: Math.max(targetSpeed * magnitude, hSpeed),
      accel: MOVE.airAccel,
      friction: false,
      applyGravity: true,
      stepUp: false,
    });
    // variable jump height: releasing early truncates the rise
    if (!input.jump && b.vel.y > 2.6 && !this.jumpCutUsed) {
      b.vel.y *= MOVE.jumpCutMultiplier;
      this.jumpCutUsed = true;
    }
    this.finishTick(dt, flags, wasGrounded, preVy);
  }

  /** gait phase + footstep events; called after position integration */
  private advanceGait(dt: number): void {
    const b = this.body;
    if (b.grounded && !this.sliding && this.speedXZ > 1.2) {
      const strideHz = this.speedXZ / 2.2; // longer stride at speed
      const prev = this.gaitPhase;
      this.gaitPhase += dt * strideHz * Math.PI * 2;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.gaitPhase / Math.PI)) {
        this.onEvent({ type: 'footstep', intensity: this.speedXZ / MOVE.sprintSpeed });
      }
    } else if (!b.grounded) {
      // keep phase near a step boundary so landing into a sprint flows
      this.gaitPhase = Math.round(this.gaitPhase / Math.PI) * Math.PI;
    }
  }

  /** common tick tail: land events, grounded flag, gait and fall checks */
  private finishTick(dt: number, flags: { grounded: boolean }, wasGrounded: boolean, preVy: number): void {
    const b = this.body;
    if (!wasGrounded && flags.grounded) {
      const impact = Math.max(0, -preVy);
      this.onEvent({ type: 'land', intensity: impact });
    }
    b.grounded = flags.grounded;
    this.wasGrounded = flags.grounded;
    this.speedXZ = Math.hypot(b.vel.x, b.vel.z);
    this.advanceGait(dt);
    this.checkFall();
  }

  /** fall-out-of-world detection (latches until respawn) */
  private checkFall(): void {
    if (this.body.pos.y < MOVE.respawnY && !this.fellLatch) {
      this.fellLatch = true;
      this.onEvent({ type: 'fell' });
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function applySlideDragOnly(b: PlayerBody, dt: number): void {
  const speed = Math.hypot(b.vel.x, b.vel.z);
  if (speed < 0.01) return;
  const drop = Math.min(speed, MOVE.slide.friction * dt);
  const scale = (speed - drop) / speed;
  b.vel.x *= scale;
  b.vel.z *= scale;
}
