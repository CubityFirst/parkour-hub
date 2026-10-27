import type { LevelData } from '../world/LevelLayout';
import { FACE, LevelBuilder } from './LevelBuilder';

/**
 * LEVEL 3 - CONSTRUCTION YARD
 * Golden hour over an unfinished tower block: steel girders, container
 * stacks to climb, a wall run past the concrete core, a broken beam to jump
 * and a long drop to the finish.
 */
export function buildLevel3(): LevelData {
  const b = new LevelBuilder();

  // --- C1 start (top 26) -------------------------------------------------------
  const T = 26;
  b.building(-8, -20, 8, 6, T, 'concrete', 'SEW');
  b.stairwell(-3, 3.2, 3, 6, T, 'N', 0);
  b.container(-7.6, -8, -4.6, -16, T, 2.6, 'orange');
  b.acUnit(6, -6, T);
  b.beam(0, -20, 0, -34, T, 1.0);
  b.hint(-8, -20, 8, -10, T, 'Girder — stay centred');

  // --- C2 (top 26): container stacks -------------------------------------------
  b.building(-10, -62, 10, -34, T, 'concrete', 'EW');
  b.container(-6, -40, 6, -46, T, 2.6, 'red');
  b.container(-6, -50, 6, -56, T, 2.6, 'orange');
  b.container(-6, -50, 6, -56, T + 2.6, 2.6, 'red');
  b.container(7, -38, 9.6, -50, T, 2.6, 'orange');
  b.latticeTower(-8.2, -58, T, 26, 1.6);
  b.hint(-10, -40, 10, -34, T, 'Jump onto the containers and climb the stack');

  // --- C3 (top 27): wall run past the concrete core -----------------------------
  const C3 = 27;
  b.building(-8, -90, 8, -64, C3, 'concrete', 'W');
  b.parapet(7.65, -84, 8, -64, C3);
  b.checkpoint('THE CORE', -8, -70, 8, -64, C3, [3, -67], FACE.north, [-6.8, -65]);
  b.building(8, -110, 18, -84, 44, 'concrete', '');
  b.wallPanel('x', 8, -1, -106, -89, C3 + 0.6, C3 + 6.5);
  b.decal(6.8, -89.8, 7.2, -78, C3, 'red');
  b.jumpEdge(-7.65, 7.65, -90, C3, 0.5);
  b.acUnit(-4, -82, C3, 2, 1.6, 1.2);
  b.hint(-8, -90, 8, -80, C3, 'Wall run along the red core wall');

  // --- C4 (top 27): broken beam ---------------------------------------------------
  b.building(-8, -125, 8, -102, C3, 'concrete', 'W');
  b.parapet(7.65, -125, 8, -110, C3);
  b.container(-7.6, -108, -3, -120, C3, 2.6, 'orange');
  b.beam(0, -125, 0, -131, C3, 1.2);
  b.beam(0, -134, 0, -140, C3, 1.2);
  b.hint(-8, -125, 8, -116, C3, 'The beam is broken — jump the gap');

  // --- C5 (top 27): rebar barrier + hanging duct, then the drop -----------------
  b.building(-8, -172, 8, -140, C3, 'concrete', 'EW');
  b.checkpoint('LAST STRETCH', -8, -146, 8, -140, C3, [0, -143], FACE.north, [6.8, -141]);
  b.vaultBarrier(-7.65, 7.65, -148.6, -148, C3);
  b.slideDuct(-7.65, 7.65, -158, -156.5, C3);
  b.jumpEdge(-7.65, 7.65, -172, C3, 0.5);
  b.flag(-7.4, -171.6, C3, -Math.PI / 2);
  b.flag(7.4, -171.6, C3, -Math.PI / 2);

  // --- C6 (top 22): finish -------------------------------------------------------
  const C6 = 22;
  b.building(-9, -212, 9, -179, C6, 'concrete', 'EWN');
  b.finishArch(-198, 0, C6, 5);
  b.container(4, -206, 8.6, -210.6, C6, 2.6, 'orange');
  b.latticeTower(-7, -209, C6, 14, 1.2);
  b.hint(-8, -172, 8, -162, C3, 'Long drop — sprint, and hold C as you land');

  // --- Scenery: more construction --------------------------------------------------
  b.building(-34, -60, -18, -20, 24, 'concrete', 'NSEW');
  b.latticeTower(-26, -40, 24, 30, 2);
  b.building(18, -50, 34, -20, 18, 'officeOrange', 'NSEW');
  b.building(-30, -150, -14, -110, 22, 'concrete', 'NSEW');
  b.latticeTower(-22, -130, 22, 22, 1.8);
  b.building(26, -180, 44, -130, 30, 'office', '');
  b.billboard(25.95, 36, -155, 16, 6, -Math.PI / 2, 'SUMMIT', 'NOW LEASING · FLOORS 1–60');

  return b.build({
    id: 'level3',
    name: 'CONSTRUCTION YARD',
    tagline: 'Girders, containers and a broken beam at golden hour.',
    startTitle: 'CONSTRUCTION YARD',
    citySeed: 4242,
    theme: {
      sunDir: [-0.66, 0.5, -0.56],
      sunColor: 0xffcf95,
      sunIntensity: 2.4,
      zenith: 0x3a64b0,
      horizon: 0xf0d8bc,
      hemiSky: 0xdcdcee,
      hemiGround: 0xeed6b8,
      hemiIntensity: 0.7,
      fogDensity: 0.0015,
      exposure: 0.95,
    },
    spawn: [0, T, 1],
    spawnYaw: FACE.north,
    killY: 13,
  });
}
