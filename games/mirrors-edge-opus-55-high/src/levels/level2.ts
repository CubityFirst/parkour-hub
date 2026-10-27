import type { LevelData } from '../world/LevelLayout';
import { FACE, LevelBuilder } from './LevelBuilder';

/**
 * LEVEL 2 - GLASS DISTRICT
 * Morning light between glass towers. Introduces chained wall runs (right
 * wall -> wall jump -> left wall), a climb up a red block, a beam walk with a
 * turn on a pillar, and a second wall run heading east.
 */
export function buildLevel2(): LevelData {
  const b = new LevelBuilder();

  // --- G1 start (top 30) -------------------------------------------------------
  const T = 30;
  b.building(-6, -24, 6, 6, T, 'glass', 'SEW');
  b.stairwell(-2.5, 3.2, 2.5, 6, T, 'N', 0);
  b.acUnit(-4.2, -10, T);
  b.vent(4.4, -16, T);
  b.jumpEdge(-5.65, 5.65, -24, T, 0.5);
  b.flag(5.4, -23.6, T, -Math.PI / 2);

  // --- G2 (top 29): into the canyon ---------------------------------------------
  const G2 = 29;
  b.building(-6, -44, 6, -29, G2, 'office', 'EW');
  b.jumpEdge(-5.65, 5.65, -44, G2, 0.5);
  b.decal(1.0, -43.8, 1.4, -32, G2, 'red');
  b.hint(-6, -44, 6, -33, G2, 'Wall run the right wall, JUMP across to the left wall, run it too');

  // The canyon: right wall then left wall, 4m apart.
  b.building(2, -62, 14, -44, 48, 'office', '');
  b.wallPanel('x', 2, -1, -60, -45, G2 + 0.6, G2 + 6.5);
  b.building(-14, -72, -2, -56, 48, 'officeOrange', '');
  b.wallPanel('x', -2, 1, -71, -57, G2 + 0.6, G2 + 6.5);
  b.antenna(8, -50, 48, 8);
  b.billboard(-8, 52.5, -56.2, 11, 5, Math.PI, 'LUMEN', 'GLASS · STEEL · SKY');

  // --- G3 (top 28): landing + red block to climb -------------------------------
  const G3 = 28;
  b.building(-6, -96, 6, -72, G3, 'glass', 'EW');
  b.checkpoint('CLIMB', -6, -82, 6, -72, G3, [0, -80], FACE.north, [-4.8, -79]);
  b.container(-5.65, -91, 5.65, -96, G3, 1.8, 'red');
  b.hint(-6, -91, 6, -84, G3, 'Climb up — jump and hold W');

  // --- G4 (top 32.1): beam walk with a turn on a pillar -------------------------
  const G4 = G3 + 3.6;
  b.building(-6, -120, 8, -98, G4, 'glass', 'EW');
  b.box(-6, G4 - 0.25, -98.06, 8, G4 + 0.02, -97.94, 'red', false, 0, false);
  b.acUnit(5, -110, G4);
  b.beam(0, -120, 0, -134, G4, 1.2);
  b.building(-2.5, -138.5, 2.5, -134, G4, 'office', '');
  b.beam(2.5, -136, 16, -136, G4, 1.2);
  b.building(16, -139, 20, -133, G4, 'office', '');
  b.jumpEdgeX(20, -139, -133, G4, -0.5);
  b.hint(-6, -120, 8, -112, G4, 'Beams — turn right on the pillar, then jump');

  // --- G5 (top 31.5): wall run east, wall on the right --------------------------
  const G5 = 31.5;
  b.building(24, -145, 40, -127, G5, 'office', 'N');
  b.parapet(24, -127.35, 36, -127, G5);
  b.checkpoint('GLASS RUN', 24, -145, 30, -127, G5, [27, -136], FACE.east, [25, -143.8]);
  b.building(36, -127, 60, -115, 52, 'glass', '');
  b.wallPanel('z', -127, -1, 40, 52, G5 + 0.6, G5 + 6.5);
  b.decal(32, -127.6, 40, -128.0, G5, 'red');
  b.jumpEdgeX(40, -134, -127, G5, -0.5);
  b.hint(30, -145, 40, -127, G5, 'Wall on your right — run it across');

  // --- G6 (top 31.5): turn north ---------------------------------------------
  // No parapet where the wall run lands (the wall building borders it).
  b.building(52, -145, 66, -127, G5, 'office', 'E');
  b.parapet(60, -127.35, 66, -127, G5);
  b.jumpEdge(52.35, 65.65, -145, G5, 0.5);
  b.acUnit(62, -131, G5);

  // --- G7 (top 30.5): vault + slide, finish -------------------------------------
  const G7 = 30.5;
  b.building(50, -186, 66, -150, G7, 'glass', 'EWN');
  b.vaultBarrier(50.35, 65.65, -157.6, -157, G7);
  b.slideDuct(50.35, 65.65, -165, -163.5, G7);
  b.finishArch(-178, 58, G7, 5);
  b.flag(50.6, -150.4, G7, Math.PI / 2);
  b.flag(65.4, -150.4, G7, -Math.PI / 2);

  // --- Scenery -------------------------------------------------------------------
  b.building(-30, -40, -14, -4, 44, 'glass', '');
  b.building(14, -30, 30, -4, 20, 'office', 'NSEW');
  b.building(-34, -130, -16, -96, 40, 'glass', '');
  b.building(22, -110, 42, -86, 46, 'glass', '');
  b.building(74, -170, 92, -130, 56, 'glass', '');
  b.building(30, -190, 44, -160, 22, 'office', 'NSEW');

  return b.build({
    id: 'level2',
    name: 'GLASS DISTRICT',
    tagline: 'Chain wall runs through a canyon of glass.',
    startTitle: 'GLASS DISTRICT',
    citySeed: 777,
    theme: {
      sunDir: [0.65, 0.55, 0.35],
      sunColor: 0xfff1dc,
      zenith: 0x3477d6,
      horizon: 0xdbe8f4,
    },
    spawn: [0, T, 1],
    spawnYaw: FACE.north,
    killY: 17,
  });
}
