/**
 * Central movement tuning values — the single source of truth for both the
 * game and the headless level-verification bot. All units are metres/second.
 *
 * Tuning intent (Mirror's Edge flavour):
 *  - gravity is high so arcs feel athletic, not floaty
 *  - sprinting conserves horizontal momentum in the air => long running jumps
 *  - a flat held jump at sprint speed covers ~5.7m; level gaps stay <= 4.8m
 */

export const PLAYER = {
  radius: 0.32,
  standHeight: 1.75,
  slideHeight: 0.85,
  standEye: 1.62,
  slideEye: 0.52,
  stepUpHeight: 0.5,
};

export const MOVE = {
  fixedDt: 1 / 120,
  gravity: 26,
  maxFallSpeed: 45,

  walkSpeed: 5.4,
  sprintSpeed: 9.4,
  groundAccel: 62,
  /** Quake-style run cap: ground accel can slightly exceed cap for snappy feel */
  groundDecel: 11, // friction with no input
  airAccel: 16,
  airDecel: 4,

  jumpSpeed: 7.9,
  /** releasing jump early cuts vertical speed (variable height) */
  jumpCutMultiplier: 0.45,
  coyoteTime: 0.12,
  jumpBufferTime: 0.14,

  slide: {
    minEnterSpeed: 4.6,
    friction: 6.0,
    minExitSpeed: 2.4,
    /** bonus forward kick when jumping out of a slide */
    jumpOutBoost: 1.1,
  },

  wallRun: {
    minSpeed: 5.2,
    maxFallSpeed: 8.5,
    gravityScale: 0.14,
    maxDuration: 1.5,
    /** per-box re-attach lockout to kill infinite wall-run loops */
    reattachCooldown: 1.15,
    genericCooldown: 0.35,
    stickAccel: 12,
    stickDistance: 0.62,
    minWallTopClearance: 0.55, // wall must extend this above the chest to be runnable
    runSpeedKeep: 7.0,         // floor for speed along the wall
    jumpUp: 8.3,
    jumpPush: 4.6,
    roll: 0.12, // camera lean (rad)
  },

  vault: {
    /** obstacle top must be within this band above feet */
    minTop: 0.42,
    maxTop: 1.38,
    /** how far ahead of the body the scan probe reaches */
    reach: 0.72,
    duration: 0.42,
    /** landing point beyond the obstacle centre */
    landingPush: 0.8,
    extraHop: 0.3,
  },

  mantle: {
    /** airborne auto ledge-mantle: ledge top band above feet */
    minTop: 1.0,
    maxTop: 1.78,
    duration: 0.55,
    landingPush: 0.55,
  },

  zip: {
    attachDist: 1.3,
    /** hands height above feet used for grab tests */
    handHeight: 1.58,
    /** feet offset below cable while riding */
    hangOffset: 1.62,
    startSpeed: 5.6,
    maxSpeed: 10.6,
    accel: 4.6,
    jumpReleaseUp: 3.8,
    endReleaseUp: 2.2,
    reattachLock: 0.55,
  },

  respawnY: -2.5,
};

export const MOUSE = {
  baseYawSpeed: 0.0023,
  basePitchSpeed: 0.0023,
  pitchLimit: Math.PI / 2 - 0.02,
};
