import type { LevelData } from '../world/LevelLayout';
import { FACE, LevelBuilder } from './LevelBuilder';

/**
 * LEVEL 1 - DOWNTOWN DASH
 * A flowing route that turns twice: jumps, a slide + vault combo, a left-side
 * wall run, a ledge climb, a steel beam and a big drop to the finish.
 */
export function buildLevel1(): LevelData {
  const b = new LevelBuilder();

  // --- Start roof (top 24) ---------------------------------------------------
  const T = 24;
  b.building(-8, -30, 8, 6, T, 'office', 'SEW');
  b.stairwell(-3, 3.2, 3, 6, T, 'N', 0);
  b.acUnit(-6.2, -6, T);
  b.acUnit(6.2, -12, T, 1.4, 2.2, 1.2);
  b.vent(-6, -20, T);
  b.antenna(6.5, 4, T, 7);
  b.jumpEdge(-7.65, 7.65, -30, T, 0.5);
  b.flag(-7.4, -29.6, T, -Math.PI / 2);
  b.flag(7.4, -29.6, T, -Math.PI / 2);

  // --- R2 (top 23): slide, then vault -----------------------------------------
  const R2 = 23;
  b.building(-7, -62, 9, -35, R2, 'glass', 'EW');
  b.slideDuct(-6.65, 8.65, -43, -41.5, R2);
  b.vaultBarrier(-6.65, 8.65, -53.6, -53, R2);
  b.jumpEdge(-6.65, 8.65, -62, R2, 0.5);
  b.hint(-7, -41.5, 9, -35, R2, 'Slide under, then vault the barrier — keep the flow');

  // --- R3 (top 23): the route turns east -------------------------------------
  b.building(-8, -80, 8, -66, R2, 'office', 'NW');
  b.checkpoint('TURN EAST', -8, -74, 8, -66, R2, [2, -72], FACE.east, [-6.6, -67]);
  b.jumpEdgeX(8, -80, -68, R2, -0.5);
  b.acUnit(-5, -77, R2);
  b.flag(7.6, -79.6, R2, 0);
  b.hint(-8, -80, 8, -70, R2, 'Follow the red — the route turns right');

  // --- R4 (top 22): run along the red wall on your left -----------------------
  const R4 = 22;
  b.building(13, -82, 40, -66, R4, 'officeOrange', 'S');
  b.parapet(13, -82, 34, -81.65, R4);
  b.building(34, -95, 58, -82, 38, 'office', '');
  b.wallPanel('z', -82, 1, 38, 54, R4 + 0.6, R4 + 6.5);
  b.decal(26, -81.4, 40, -81.0, R4, 'red');
  b.jumpEdgeX(40, -82, -76, R4, -0.5);
  b.acUnit(18, -70, R4);
  b.vent(24, -69, R4);
  b.hint(13, -82, 40, -66, R4, 'Sprint along the red wall and jump into it — WALL RUN');
  b.latticeTower(50, -90, 38, 18);
  b.billboard(46, 42.5, -88, 14, 6, 0, 'METRO', 'FASTER THAN TRAFFIC');

  // --- R5 (top 22): landing, then north ---------------------------------------
  b.building(52, -82, 70, -62, R4, 'glass', 'SE');
  b.checkpoint('CLIMB', 52, -82, 58, -62, R4, [63, -66], FACE.north, [53.2, -63.2]);
  b.jumpEdge(58.35, 69.65, -82, R4, 0.5);
  b.acUnit(66, -66, R4);

  // --- R6 (top 24.3): ledge to climb, then a beam ------------------------------
  const R6 = 24.3;
  b.building(58, -110, 72, -84.5, R6, 'office', 'EW');
  b.box(58, R6 - 0.25, -84.56, 72, R6 + 0.02, -84.44, 'red', false, 0, false);
  b.waterTower(69, -100, R6);
  b.acUnit(60.5, -96, R6);
  b.hint(58, -82, 70, -74, R4, 'Jump at the ledge, hold W to climb');
  b.beam(65, -110, 65, -124, R6, 1.2);

  // --- R7 (top 24.3): slide then a big drop -----------------------------------
  b.building(58, -148, 72, -124, R6, 'glass', 'EW');
  b.checkpoint('THE DROP', 58, -130, 72, -124, R6, [65, -126], FACE.north, [70.8, -125]);
  b.slideDuct(58.35, 71.65, -133, -131.5, R6);
  b.jumpEdge(58.35, 71.65, -148, R6, 0.5);
  b.flag(58.6, -147.6, R6, -Math.PI / 2);
  b.flag(71.4, -147.6, R6, -Math.PI / 2);
  b.hint(58, -148, 72, -139, R6, 'Big drop — hold C as you land to roll into a slide');

  // --- R8 (top 20): finish -----------------------------------------------------
  const R8 = 20;
  b.building(56, -185, 74, -155, R8, 'office', 'EWN');
  b.finishArch(-172, 65, R8, 5);
  b.latticeTower(58.5, -182, R8, 10, 1.1);
  b.acUnit(70, -181, R8);

  // --- Scenery near the route (well clear of the jumps) -----------------------
  b.building(-30, -40, -16, -6, 36, 'glass', '');
  b.building(16, -40, 34, -14, 18, 'office', 'NSEW');
  b.building(-30, -100, -16, -70, 30, 'officeOrange', '');
  b.building(20, -130, 44, -104, 34, 'glass', '');
  b.building(80, -120, 96, -80, 44, 'office', '');
  b.building(80, -175, 94, -140, 28, 'glass', 'NSEW');
  b.billboard(79.95, 36, -100, 14, 6, -Math.PI / 2, 'AIRLINE', 'NEXT STOP: EVERYWHERE');

  return b.build({
    id: 'level1',
    name: 'DOWNTOWN DASH',
    tagline: 'Keep your speed through the turns.',
    startTitle: 'DOWNTOWN DASH',
    citySeed: 2024,
    theme: { sunDir: [0.55, 0.7, -0.35] },
    spawn: [0, T, 1],
    spawnYaw: FACE.north,
    killY: 10,
  });
}
