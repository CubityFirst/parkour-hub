import type { LevelData } from '../world/LevelLayout';
import { FACE, LevelBuilder } from './LevelBuilder';

/**
 * LEVEL 5 - SKYLINE
 * The final run, 80m up. Everything combined: vault-slide chains, a long
 * wall-run canyon, container climb, broken beams, a left wall run east, a
 * wall climb, a drop, a right wall run north and a launch to the finish.
 */
export function buildLevel5(): LevelData {
  const b = new LevelBuilder();

  // --- S1 start (top 80) -------------------------------------------------------
  const T = 80;
  b.building(-6, -20, 6, 6, T, 'glass', 'SEW');
  b.stairwell(-2.5, 3.2, 2.5, 6, T, 'N', 0);
  b.antenna(-4.6, 4.6, T, 12);
  b.jumpEdge(-5.65, 5.65, -20, T, 0.5);
  b.flag(-5.4, -19.6, T, -Math.PI / 2);
  b.flag(5.4, -19.6, T, -Math.PI / 2);
  b.hint(-6, -20, 6, -8, T, 'No more lessons. Run.');

  // --- S2 (top 80): vault, slide, canyon -------------------------------------------
  b.building(-6, -52, 6, -25.5, T, 'office', 'EW');
  b.vaultBarrier(-5.65, 5.65, -31.6, -31, T);
  b.slideDuct(-5.65, 5.65, -37, -35.5, T);
  b.jumpEdge(-5.65, 5.65, -52, T, 0.5);
  b.decal(1.0, -51.8, 1.4, -40, T, 'red');

  // Canyon: right wall, then left wall.
  b.building(2, -72, 14, -52, 98, 'office', '');
  b.wallPanel('x', 2, -1, -70, -53, T + 0.6, T + 6.5);
  b.building(-14, -78, -2, -64, 98, 'glass', '');
  b.wallPanel('x', -2, 1, -77, -65, T + 0.6, T + 6.5);

  // --- S3 (top 79): container stairs ------------------------------------------------
  const S3 = 79;
  b.building(-6, -106, 6, -78, S3, 'office', 'EW');
  b.checkpoint('THE CLIMB', -6, -90, 6, -78, S3, [0, -88], FACE.north, [-4.8, -86]);
  b.container(-5.65, -96, 5.65, -100, S3, 1.7, 'red');
  b.container(-5.65, -100, 5.65, -104, S3, 3.4, 'orange');

  // --- S4 (top 83): broken beam ---------------------------------------------------
  const S4 = 83;
  b.building(-6, -127, 6, -107, S4, 'glass', 'EW');
  b.box(-6, S4 - 0.25, -107.06, 6, S4 + 0.02, -106.94, 'red', false, 0, false);
  b.acUnit(3.5, -118, S4);
  b.beam(0, -127, 0, -137, S4, 1.0);
  b.beam(0, -140.5, 0, -150, S4, 1.0);

  // --- S5 (top 83): wall run east, wall on the left --------------------------------
  b.building(-6, -166, 6, -150, S4, 'office', 'W');
  b.parapet(-6, -166, 2, -165.65, S4);
  b.checkpoint('EASTBOUND', -6, -156, 6, -150, S4, [0, -158], FACE.east, [-4.8, -151.2]);
  b.building(2, -180, 30, -166, 100, 'glass', '');
  b.wallPanel('z', -166, 1, 7, 18, S4 + 0.6, S4 + 6.5);
  b.jumpEdgeX(6, -166, -158, S4, -0.5);

  // --- S6 (top 83) then a 3m wall to S7 (top 86) ---------------------------------------
  b.building(18.5, -166, 32, -150, S4, 'office', 'S');
  b.parapet(30, -166, 32, -165.65, S4);
  const S7 = 86;
  b.building(33.5, -166, 58, -150, S7, 'officeOrange', 'NS');
  b.box(33.44, S7 - 0.25, -166, 33.56, S7 + 0.02, -150, 'red', false, 0, false);
  b.vaultBarrier(37, 37.6, -165.65, -150.35, S7);
  b.slideDuct(41, 42.5, -165.65, -150.35, S7);
  b.jumpEdgeX(58, -166, -150, S7, -0.5);

  // --- S8 (top 79.5): drop, then north along a wall on the right ---------------------
  const S8 = 79.5;
  b.building(65, -172, 85, -148, S8, 'glass', 'S');
  b.parapet(84.65, -168, 85, -148, S8);
  b.checkpoint('LAST WALL', 65, -172, 71, -148, S8, [76, -152], FACE.north, [66.2, -149.2]);
  b.building(85, -200, 97, -168, 100, 'office', '');
  b.wallPanel('x', 85, -1, -186, -173, S8 + 0.6, S8 + 6.5);
  b.decal(83.8, -171.8, 84.2, -160, S8, 'red');
  b.jumpEdge(65.35, 85, -172, S8, 0.5);

  // --- S9 (top 79.5): launch steps ----------------------------------------------------
  b.building(70, -202, 85, -184.5, S8, 'glass', 'W');
  b.stairs(78.5, 84.6, -191, 'n', S8, 6);
  const P = S8 + 1.8;
  b.box(78.5, S8, -202, 84.6, P, -197, 'white');
  b.box(78.5, P - 0.02, -202, 84.6, P + 0.01, -197, 'red', false, 0, false);
  b.jumpEdge(78.5, 84.6, -202, P + 0.01, 0.5);

  // --- S10 (top 77): finish ----------------------------------------------------------
  const S10 = 77;
  b.building(70, -240, 88, -210, S10, 'office', 'EWN');
  b.finishArch(-226, 79, S10, 5);
  b.latticeTower(72, -237, S10, 14, 1.2);
  b.flag(87.6, -224, S10, Math.PI);

  // --- Scenery: the highest towers --------------------------------------------------
  b.building(-34, -40, -16, -6, 120, 'glass', '');
  b.building(18, -40, 34, -6, 70, 'office', 'NSEW');
  b.building(-40, -140, -22, -100, 130, 'glass', '');
  b.building(26, -120, 46, -84, 110, 'glass', '');
  b.building(40, -220, 60, -186, 90, 'glass', '');
  b.building(104, -190, 122, -150, 140, 'glass', '');
  b.billboard(25.95, 112, -102, 16, 6, -Math.PI / 2, 'SKYLINE', 'THE TOP OF THE WORLD');

  return b.build({
    id: 'level5',
    name: 'SKYLINE',
    tagline: 'Eighty metres up. Everything you have learned.',
    startTitle: 'SKYLINE',
    citySeed: 31337,
    theme: {
      sunDir: [-0.3, 0.85, 0.2],
      sunIntensity: 2.35,
      zenith: 0x1f5fc4,
      horizon: 0xcfe0f2,
      fogDensity: 0.0011,
    },
    spawn: [0, T, 1],
    spawnYaw: FACE.north,
    killY: 68,
  });
}
