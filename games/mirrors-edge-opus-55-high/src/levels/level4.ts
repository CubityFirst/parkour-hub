import type { LevelData } from '../world/LevelLayout';
import { FACE, LevelBuilder } from './LevelBuilder';

/**
 * LEVEL 4 - THE DESCENT
 * Sunset. Start on a tower top and work your way down the skyline in big
 * drops - land in slides, wall run west, climb one wall and take the longest
 * fall of the game to the finish.
 */
export function buildLevel4(): LevelData {
  const b = new LevelBuilder();

  // --- D1 start (top 60) -------------------------------------------------------
  const T = 60;
  b.building(-6, -20, 6, 6, T, 'glass', 'SEW');
  b.stairwell(-2.5, 3.2, 2.5, 6, T, 'N', 0);
  b.antenna(-4.5, 4.5, T, 10);
  b.antenna(4.5, 4.5, T, 7);
  b.jumpEdge(-5.65, 5.65, -20, T, 0.5);
  b.flag(-5.4, -19.6, T, -Math.PI / 2);
  b.flag(5.4, -19.6, T, -Math.PI / 2);
  b.hint(-6, -20, 6, -8, T, 'Sprint and drop — hold C when you land to slide under the duct');

  // --- D2 (top 56): land straight into a slide ----------------------------------
  const D2 = 56;
  b.building(-6, -48, 6, -27, D2, 'office', 'EW');
  b.slideDuct(-5.65, 5.65, -35.5, -34, D2);
  b.jumpEdge(-5.65, 5.65, -48, D2, 0.5);

  // --- D3 (top 52): turn west ------------------------------------------------------
  const D3 = 52;
  b.building(-6, -72, 6, -55, D3, 'officeOrange', 'EN');
  b.checkpoint('WEST', -6, -64, 6, -55, D3, [2, -66], FACE.west, [4.8, -56.2]);
  b.jumpEdgeX(-6, -72, -60, D3, 0.5);
  b.acUnit(3, -70, D3);
  b.hint(-6, -72, 6, -62, D3, 'The route turns left');

  // --- D4 (top 48): wall run west, wall on the right ----------------------------
  const D4 = 48;
  b.building(-26, -70, -13, -55, D4, 'office', 'S');
  b.parapet(-20, -70, -13, -69.65, D4);
  b.building(-44, -84, -20, -70, 66, 'glass', '');
  b.wallPanel('z', -70, 1, -42, -24, D4 + 0.6, D4 + 6.5);
  b.decal(-26, -69.2, -16, -68.8, D4, 'red');
  b.jumpEdgeX(-26, -68, -60, D4, 0.5);
  b.vent(-15.5, -58, D4);
  b.hint(-26, -70, -13, -55, D4, 'Wall run the red wall on your right');

  // --- D5 (top 48): landing, then north --------------------------------------
  b.building(-52, -70, -38, -55, D4, 'office', 'SW');
  b.checkpoint('FREEFALL', -44, -70, -38, -55, D4, [-48, -60], FACE.north, [-39.2, -56.2]);
  b.jumpEdge(-51.65, -44, -70, D4, 0.5);
  b.flag(-51.4, -69.6, D4, -Math.PI / 2);

  // --- D6 (top 44) -------------------------------------------------------------------
  const D6 = 44;
  b.building(-54, -100, -40, -77, D6, 'officeOrange', 'EW');
  b.acUnit(-43, -86, D6);
  b.jumpEdge(-53.65, -40.35, -100, D6, 0.5);

  // --- D7 (top 40): land into another slide, then the long gap ----------------
  const D7 = 40;
  b.building(-54, -132, -40, -107, D7, 'office', 'EW');
  b.slideDuct(-53.65, -40.35, -115.5, -114, D7);
  b.jumpEdge(-53.65, -40.35, -132, D7, 0.5);
  b.flag(-53.4, -131.6, D7, -Math.PI / 2);
  b.flag(-40.6, -131.6, D7, -Math.PI / 2);
  b.hint(-54, -132, -40, -122, D7, 'Longest gap yet — full sprint');

  // --- D8 (top 34): climb the wall ahead ----------------------------------------
  const D8 = 34;
  b.building(-55, -165, -39, -141, D8, 'glass', 'EW');
  b.checkpoint('CLIMB', -55, -147, -39, -141, D8, [-47, -144], FACE.north, [-40.2, -142.2]);
  b.acUnit(-52, -156, D8);

  // --- D9 (top 37): 3m wall to climb ------------------------------------------------
  const D9 = 37;
  b.building(-55, -186, -39, -166.5, D9, 'office', 'EW');
  b.box(-55, D9 - 0.25, -166.56, -39, D9 + 0.02, -166.44, 'red', false, 0, false);
  b.hint(-55, -165, -39, -156, D8, 'Jump at the wall and hold W to climb');
  b.jumpEdge(-54.65, -39.35, -186, D9, 0.5);
  b.waterTower(-51, -178, D9);

  // --- D10 (top 30): final drop, finish ----------------------------------------
  const D10 = 30;
  b.building(-56, -226, -38, -194, D10, 'officeOrange', 'EWN');
  b.finishArch(-212, -47, D10, 5);
  b.latticeTower(-40, -223, D10, 12, 1.2);
  b.hint(-55, -186, -39, -178, D9, 'One last fall — make it count');

  // --- Scenery -----------------------------------------------------------------------
  b.building(14, -40, 30, -4, 50, 'glass', '');
  b.building(-30, -30, -14, 0, 50, 'office', '');
  b.building(10, -110, 28, -80, 44, 'glass', '');
  b.building(-30, -130, -14, -96, 30, 'office', 'NSEW');
  b.building(-80, -150, -64, -100, 62, 'glass', '');
  b.building(-30, -210, -16, -170, 46, 'glass', '');
  b.billboard(-30.05, 50, -190, 14, 6, -Math.PI / 2, 'DUSK', 'THE CITY NEVER SLOWS');

  return b.build({
    id: 'level4',
    name: 'THE DESCENT',
    tagline: 'Sunset. Big drops — land them in a slide.',
    startTitle: 'THE DESCENT',
    citySeed: 9001,
    theme: {
      sunDir: [0.6, 0.36, -0.72],
      sunColor: 0xffae70,
      sunIntensity: 2.9,
      zenith: 0x2c4f9a,
      horizon: 0xf6c99c,
      hemiSky: 0xd9d6f0,
      hemiGround: 0xf2cba4,
      hemiIntensity: 0.8,
      fogDensity: 0.0017,
      exposure: 1.02,
      clouds: 0.8,
    },
    spawn: [0, T, 1],
    spawnYaw: FACE.north,
    killY: 20,
  });
}
