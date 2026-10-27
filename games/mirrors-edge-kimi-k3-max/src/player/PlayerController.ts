import * as THREE from 'three';
import { Input } from '../core/Input';
import { CollisionWorld } from '../world/CollisionWorld';
import { BodyState, PlayerPhysics, StepFlags, TUNING } from './PlayerPhysics';
import { ParkourEvents, ParkourSystem } from './ParkourSystem';

export interface ControllerEvents extends ParkourEvents {
  onFootstep(speedNorm: number): void;
  onJump(): void;
  onLand(fallSpeed: number): void;
  onSlideStart(): void;
  onSlideEnd(): void;
  onFirstInput(): void;
}

/**
 * Ties input, parkour moves and physics together at a fixed timestep.
 * Owns the player's body state, jumping (coyote time + buffering +
 * variable height) and sliding.
 */
export class PlayerController {
  readonly body: BodyState = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    halfWidth: TUNING.playerWidth / 2,
    height: TUNING.standHeight,
    grounded: false,
  };

  sliding = false;
  sprinting = false;
  strafeInput = 0;
  forwardInput = 0;

  readonly parkour: ParkourSystem;
  private physics = new PlayerPhysics();
  private coyote = 0;
  private jumpBuffer = 0;
  private vaultBuffer = 0;
  private stepDist = 0;
  private moved = false;

  constructor(
    private input: Input,
    private world: CollisionWorld,
    private events: ControllerEvents,
  ) {
    this.parkour = new ParkourSystem({
      onVault: () => events.onVault(),
      onMantle: () => events.onMantle(),
      onWallrunStart: (s) => events.onWallrunStart(s),
      onWallJump: () => events.onWallJump(),
      onWallrunEnd: () => events.onWallrunEnd(),
    });
  }

  respawn(pos: THREE.Vector3): void {
    this.body.pos.copy(pos);
    this.body.vel.set(0, 0, 0);
    this.body.height = TUNING.standHeight;
    this.body.grounded = true;
    this.sliding = false;
    this.parkour.reset();
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.vaultBuffer = 0;
    this.stepDist = 0;
  }

  fixedUpdate(dt: number, yaw: number): void {
    const input = this.input;
    const body = this.body;
    const vel = body.vel;

    this.parkour.tick(dt);
    if (input.pressed('Space')) this.jumpBuffer = 0.14;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (input.pressed('KeyE')) this.vaultBuffer = 0.16;
    else this.vaultBuffer = Math.max(0, this.vaultBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);

    // wish direction from input + view yaw
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const ix = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const iz = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    this.strafeInput = ix;
    this.forwardInput = iz;
    const wish = new THREE.Vector3();
    if (ix !== 0 || iz !== 0) {
      if (!this.moved) {
        this.moved = true;
        this.events.onFirstInput();
      }
      wish.set(fx * iz + rx * ix, 0, fz * iz + rz * ix).normalize();
    }
    this.sprinting = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && iz > 0 && !this.sliding;

    // scripted vault/mantle overrides normal movement
    if (this.parkour.scripted) {
      this.parkour.stepScripted(body, dt);
      return;
    }

    // E — vault (or mantle on taller obstacles)
    if (this.vaultBuffer > 0) {
      this.vaultBuffer = 0;
      const fwd = new THREE.Vector3(fx, 0, fz);
      const started =
        this.parkour.tryVault(body, this.world, fwd) || this.parkour.tryMantle(body, this.world, fwd);
      if (started) return; // scripted move begins on the next step
    }

    // ---- sliding
    const slideHeld =
      input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC');
    const hspeed = Math.hypot(vel.x, vel.z);
    if (!this.sliding && slideHeld && body.grounded && hspeed >= 5) {
      this.sliding = true;
      body.height = TUNING.slideHeight;
      const boost = Math.min(hspeed * 1.06 + 0.35, 11.5);
      if (hspeed > 0.01) {
        vel.x *= boost / hspeed;
        vel.z *= boost / hspeed;
      }
      this.events.onSlideStart();
    }
    if (this.sliding) {
      const canStand = this.canStand();
      if (canStand && (!slideHeld || (body.grounded && Math.hypot(vel.x, vel.z) < 3.0))) {
        this.sliding = false;
        body.height = TUNING.standHeight;
        this.events.onSlideEnd();
      } else if (!canStand && body.grounded && Math.hypot(vel.x, vel.z) < 2.2) {
        // crouch-crawl so the player can never get stuck under a duct
        const dirx = wish.lengthSq() > 0 ? wish.x : fx;
        const dirz = wish.lengthSq() > 0 ? wish.z : fz;
        vel.x += dirx * 26 * dt;
        vel.z += dirz * 26 * dt;
        const s2 = Math.hypot(vel.x, vel.z);
        if (s2 > 2.4) {
          vel.x *= 2.4 / s2;
          vel.z *= 2.4 / s2;
        }
      }
    }

    // ---- wall running
    let moveFlags: StepFlags = { sliding: this.sliding };
    if (this.parkour.wallrun.active) {
      this.parkour.updateWallrun(body, this.world, dt, this.jumpBuffer > 0);
      if (this.parkour.wallrun.active) {
        moveFlags = { noGravity: true, noFriction: true, noAccel: true };
        this.jumpBuffer = 0;
      }
    } else if (!body.grounded && !this.sliding) {
      if (this.parkour.tryAttachWallrun(body, this.world, new THREE.Vector3(rx, 0, rz))) {
        moveFlags = { noGravity: true, noFriction: true, noAccel: true };
      }
    }

    // ---- jumping (with coyote time + buffer)
    if (this.jumpBuffer > 0 && !this.parkour.wallrun.active) {
      if (body.grounded || this.coyote > 0) {
        vel.y = TUNING.jumpVelocity * (this.sliding ? 0.98 : 1);
        body.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        if (this.sliding && this.canStand()) {
          this.sliding = false;
          body.height = TUNING.standHeight;
          this.events.onSlideEnd();
        }
        this.events.onJump();
      }
    }
    // variable jump height
    if (input.released('Space') && vel.y > 0 && !this.parkour.wallrun.active) {
      vel.y *= 0.45;
    }

    // ---- integrate
    const res = this.physics.step(body, { dir: wish, sprint: this.sprinting }, dt, this.world, moveFlags);

    if (body.grounded) {
      this.coyote = 0.12;
      this.parkour.onGrounded();
    }
    if (res.landed) this.events.onLand(res.fallSpeed);
    if (this.parkour.wallrun.active && body.grounded) this.parkour.endWallrun();

    // ---- ledge recovery: auto-mantle when jumping toward a chest-high ledge
    if (
      !body.grounded &&
      !this.parkour.scripted &&
      !this.parkour.wallrun.active &&
      iz > 0 &&
      vel.y < 3
    ) {
      this.parkour.tryMantle(body, this.world, new THREE.Vector3(fx, 0, fz), true);
    }

    // ---- footsteps
    if (body.grounded && !this.sliding) {
      const s = Math.hypot(vel.x, vel.z);
      if (s > 2) {
        this.stepDist += s * dt;
        const stride = 2.1 + s * 0.12;
        if (this.stepDist >= stride) {
          this.stepDist = 0;
          this.events.onFootstep(Math.min(1, s / TUNING.sprintSpeed));
        }
      } else {
        this.stepDist = 0;
      }
    }
  }

  canStand(): boolean {
    const b = this.body;
    const min = new THREE.Vector3(b.pos.x - b.halfWidth, b.pos.y + 0.02, b.pos.z - b.halfWidth);
    const max = new THREE.Vector3(b.pos.x + b.halfWidth, b.pos.y + TUNING.standHeight, b.pos.z + b.halfWidth);
    return !this.world.overlaps(min, max);
  }
}
