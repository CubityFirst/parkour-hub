import { SurfaceTag } from '../world/CollisionWorld';
import type { LevelData } from '../world/LevelLayout';
import { LevelBuilder, zone } from './LevelBuilder';

/**
 * TUTORIAL - the original six-section level: movement basics, rooftop jumps,
 * sliding, wall running, a combination section and a final sprint.
 */
export function buildTutorial(): LevelData {
  const b = new LevelBuilder();
  const hints = b.hints;
  const checkpoints = b.checkpoints;

  // ===========================================================================
  // SECTION 1 - Movement basics. Large starting roof (top 20).
  // ===========================================================================
  const A = 20;
  b.building(-9, -40, 9, 6, A, 'office', 'SEW');
  b.stairwell(-3, 3.2, 3, 6, A, 'N', 0);
  b.acUnit(-6.8, -3, A);
  b.acUnit(-6.8, -5.6, A);
  b.acUnit(7, -8, A, 1.4, 2.2, 1.3);
  b.vent(6.6, 0.5, A);
  b.pipeRun(-8.2, -30, -8.2, 2, A, 'metal');
  b.antenna(7.5, 4.5, A, 6);
  b.flag(-7.8, 4.8, A, Math.PI * 0.5);

  // Vault barrier across the whole roof.
  b.vaultBarrier(-8.65, 8.65, -13.2, -12.6, A);
  // Slide duct spanning the roof.
  b.slideDuct(-8.65, 8.65, -25, -23.4, A);
  b.decal(-2, -21.8, 2, -21.2, A, 'red');
  b.skylight(-6.5, -36, -3, -31, A);
  b.acUnit(6.4, -33, A, 1.8, 1.4, 1.2);
  // Short gap at the end of the roof.
  b.jumpEdge(-8.65, 8.65, -40, A, 0.5);
  b.flag(-8.4, -39.6, A, -Math.PI * 0.5);
  b.flag(8.4, -39.6, A, -Math.PI * 0.5);

  hints.push({ trigger: zone(-9, -8, 9, 6, A - 1, A + 4), text: 'WASD to move · Mouse to look · Hold SHIFT to sprint' });
  hints.push({ trigger: zone(-9, -12.6, 9, -8, A - 1, A + 4), text: 'Press SPACE to hop over · or E to vault' });
  hints.push({ trigger: zone(-9, -23, 9, -14, A - 1, A + 4), text: 'Sprint, then press C or CTRL to slide under' });
  hints.push({ trigger: zone(-9, -40, 9, -28, A - 1, A + 4), text: 'Sprint and jump the gap · Hold SPACE for a higher jump' });

  // ===========================================================================
  // SECTION 2 - Rooftop jumps
  // ===========================================================================
  // Roof B (top 20) - 3m gap from A.
  b.building(-8, -62, 8, -43, A, 'glass', 'EW');
  checkpoints.push({
    index: 1,
    title: 'ROOFTOP JUMPS',
    trigger: zone(-8, -48, 8, -43, A - 1, A + 5),
    spawn: [0, A, -46],
    yaw: 0,
    marker: [-6.8, A, -45],
  });
  b.acUnit(5.5, -52, A);
  b.vent(-6, -56, A);
  b.jumpEdge(-7.65, 7.65, -62, A, 0.5);
  b.flag(-7.4, -61.6, A, -Math.PI * 0.5);
  hints.push({ trigger: zone(-8, -62, 8, -52, A - 1, A + 4), text: 'Keep sprinting — longer gaps need full speed' });

  // Roof C (top 19) - 4.5m gap, 1m drop.
  const C = 19;
  b.building(-5, -80, 9, -66.5, C, 'officeOrange', 'EW');
  b.acUnit(6.5, -71, C, 1.4, 1.4, 1.0);
  b.vent(-3.5, -70, C);
  hints.push({ trigger: zone(-5, -80, 9, -71, C - 1, C + 4), text: 'Jump at the ledge and hold W to climb up' });

  // Roof D (top 21.5) - higher, short 2.5m gap: ledge grab / mantle.
  const D = 21.5;
  b.building(-3, -96, 10, -82.5, D, 'office', 'EW');
  // Red lip on the ledge to climb.
  b.box(-3, D - 0.25, -82.56, 10, D + 0.02, -82.44, 'red', false, 0, false);
  b.acUnit(7.5, -88, D);
  b.waterTower(-1, -92.5, D);
  b.jumpEdge(-2.65, 9.65, -96, D, 0.5);
  b.flag(9.4, -95.6, D, -Math.PI * 0.5);
  hints.push({ trigger: zone(-3, -96, 10, -87, D - 1, D + 4), text: 'Big drop ahead — sprint and jump' });

  // ===========================================================================
  // SECTION 3 - Sliding challenge. Roof E (top 18.5), 6.5m gap + 3m drop.
  // ===========================================================================
  const E = 18.5;
  b.building(-6, -140, 10, -102.5, E, 'office', 'W');
  b.parapet(9.65, -126, 10, -102.5, E);
  checkpoints.push({
    index: 2,
    title: 'SLIDE',
    trigger: zone(-6, -108, 10, -102.5, E - 1, E + 5),
    spawn: [2, E, -105],
    yaw: 0,
    marker: [-4.8, E, -104],
  });
  b.slideDuct(-5.65, 9.65, -112.5, -111, E);
  b.slideDuct(-5.65, 9.65, -119.5, -118, E);
  b.slideDuct(-5.65, 9.65, -126.5, -125, E);
  b.decal(1, -110.5, 3, -108.5, E, 'red');
  hints.push({ trigger: zone(-6, -111, 10, -106, E - 1, E + 4), text: 'Slide under the ducts — chain slides to keep your speed' });
  checkpoints.push({
    index: 3,
    title: 'WALL RUN',
    trigger: zone(-6, -133, 10, -128, E - 1, E + 5),
    spawn: [8.4, E, -129.5],
    yaw: 0,
    marker: [-4.8, E, -130],
  });
  // Guide line along the wall toward the gap.
  b.decal(8.6, -139.8, 9.0, -128, E, 'red');
  b.acUnit(-3.5, -136, E, 1.6, 1.6, 1.1);
  hints.push({ trigger: zone(-6, -140, 10, -131, E - 1, E + 4), text: 'Sprint along the red wall, jump, hold W — WALL RUN across' });

  // ===========================================================================
  // SECTION 4 - Wall run. 12m gap, tall wall on the right (east).
  // ===========================================================================
  b.building(10, -160, 22, -126, 34, 'office', '');
  // Red wall-run panel on the wall face.
  b.box(9.94, E + 0.6, -156, 10, E + 6.5, -136, 'red', false, 0, false);
  for (let z = -154; z <= -138; z += 4) b.box(9.92, E + 0.6, z - 0.05, 9.94, E + 6.5, z + 0.05, 'white', false, 0, false);
  b.latticeTower(16, -150, 34, 16);
  b.billboard(22.05, 40, -140, 14, 6, Math.PI / 2, 'VANTA', 'MOVE FREELY');
  b.waterTower(18, -132, 34);

  // Roof F (top 18.5)
  const F = 18.5;
  b.building(-4, -175, 10, -152, F, 'glass', '');
  b.parapet(9.65, -175, 10, -160, F);
  b.parapet(-4, -168, -3.65, -152, F);
  checkpoints.push({
    index: 4,
    title: 'COMBINATION',
    trigger: zone(-4, -157.5, 10, -152, F - 1, F + 5),
    spawn: [3, F, -154.5],
    yaw: 0,
    marker: [8.8, F, -153.5],
  });

  // ===========================================================================
  // SECTION 5 - Combination: vault, slide, left wall run, climb, jump.
  // ===========================================================================
  b.vaultBarrier(-3.65, 9.65, -161, -160.4, F);
  b.slideDuct(-3.65, 9.65, -166.5, -165, F);
  b.decal(-3.4, -174.8, -3.0, -167, F, 'red');
  hints.push({ trigger: zone(-4, -160.4, 10, -157.5, F - 1, F + 4), text: 'Vault · slide · then wall run on the LEFT wall' });

  // Wall on the left (west) of the next gap.
  b.building(-16, -196, -4, -168, 32, 'officeOrange', '');
  b.box(-4, F + 0.6, -189, -3.94, F + 6.5, -176, 'red', false, 0, false);
  for (let z = -187; z <= -178; z += 4) b.box(-3.94, F + 0.6, z - 0.05, -3.92, F + 6.5, z + 0.05, 'white', false, 0, false);
  b.antenna(-10, -185, 32, 9);
  b.billboard(-16.05, 36, -182, 12, 5, -Math.PI / 2, 'NORTHLINE', 'TRANSIT · 24/7');

  // Roof G (top 18.5) - 11m gap from F.
  const G = 18.5;
  b.building(-4, -200, 8, -186, G, 'office', 'E');
  b.parapet(-4, -200, -3.65, -196, G);
  // Red container platform to climb onto (1.7 m).
  const CT = G + 1.7;
  b.box(-3.65, G, -200, 7.65, CT, -194, 'red', true, SurfaceTag.Ledge);
  for (let x = -3; x <= 7; x += 1.2) b.box(x - 0.05, G + 0.1, -193.96, x + 0.05, CT - 0.1, -193.94, 'redDark', false, 0, false);
  b.box(-3.65, CT - 0.02, -200, 7.65, CT + 0.03, -194, 'redDark', false, 0, false);
  b.jumpEdge(-3.65, 7.65, -200, CT + 0.03, 0.45);
  hints.push({ trigger: zone(-4, -194, 8, -186, G - 1, G + 4), text: 'Climb the container (jump + W, or E) and leap from the top' });

  // Roof H (top 19.5) - 5m gap from container top.
  const H = 19.5;
  b.building(-6, -222, 6, -205, H, 'glass', 'EW');
  checkpoints.push({
    index: 5,
    title: 'FINAL SPRINT',
    trigger: zone(-6, -212, 6, -205, H - 1, H + 5),
    spawn: [0, H, -209],
    yaw: 0,
    marker: [4.8, H, -208],
  });
  b.flag(-5.6, -205.6, H, Math.PI * 0.5);
  b.acUnit(-3.8, -217, H);
  b.acUnit(3.8, -217, H);

  // ===========================================================================
  // SECTION 6 - Final sprint: narrow beam, drops, a vault and the finish.
  // ===========================================================================
  // Narrow steel beam bridge (1.4m wide).
  b.box(-0.7, H - 0.45, -236.2, 0.7, H, -221.8, 'metal', true);
  b.box(-0.7, H - 0.02, -236, 0.7, H + 0.01, -222, 'red', false, 0, false);
  b.box(-0.25, H - 1.6, -236, 0.25, H - 0.45, -222, 'dark', false);
  hints.push({ trigger: zone(-6, -222, 6, -214, H - 1, H + 4), text: 'Narrow beam — line it up' });

  // Roof I (top 19.5)
  b.building(-6, -246, 6, -236, H, 'officeOrange', 'EW');
  b.jumpEdge(-5.65, 5.65, -246, H, 0.5);
  b.flag(5.4, -245.6, H, -Math.PI * 0.5);

  // Roof J (top 17.5) - 5m gap, 2m drop.
  const J = 17.5;
  b.building(-7, -266, 5, -251, J, 'office', 'EW');
  b.vaultBarrier(-6.65, 4.65, -258.6, -258, J);
  b.jumpEdge(-6.65, 4.65, -266, J, 0.5);
  b.flag(-6.4, -265.6, J, -Math.PI * 0.5);
  b.flag(4.4, -265.6, J, -Math.PI * 0.5);

  // Roof K (top 17.5) - 5.5m gap. One last slide under a duct.
  const K = J;
  b.building(-9, -300, 9, -271.5, K, 'glass', 'EW');
  b.slideDuct(-8.65, 8.65, -284, -282.5, K);
  b.acUnit(6.5, -295, K);
  b.jumpEdge(-8.65, 8.65, -300, K, 0.5);
  b.flag(-8.4, -299.6, K, -Math.PI * 0.5);
  hints.push({ trigger: zone(-9, -282.5, 9, -276, K - 1, K + 4), text: 'Slide!' });

  // Roof L (top 17.5) - 4m gap. Red launch steps up to a jump platform.
  const L = K;
  b.building(-6, -318, 6, -304, L, 'office', 'EW');
  const stepH = 0.3;
  for (let i = 0; i < 6; i++) {
    b.box(-3, L, -308 - i, 3, L + stepH * (i + 1), -307 - i, i % 2 ? 'red' : 'redDark', true);
  }
  const P = L + 1.8;
  b.box(-3, L, -318, 3, P, -313, 'white', true, SurfaceTag.Ledge);
  b.box(-3, P - 0.02, -318, 3, P + 0.01, -313, 'red', false, 0, false);
  b.jumpEdge(-3, 3, -318, P + 0.01, 0.5);
  b.latticeTower(4.6, -316, L, 9, 1.0);
  hints.push({ trigger: zone(-6, -313, 6, -304, L - 1, L + 5), text: 'Run up the steps and launch — full sprint!' });

  // Roof M (top 17) - 7m gap from the launch platform. Finish line.
  const M = 17;
  b.building(-10, -352, 10, -325, M, 'glass', 'EWN');
  b.box(-6.2, M, -338.4, -5.4, M + 5.5, -337.6, 'red', true);
  b.box(5.4, M, -338.4, 6.2, M + 5.5, -337.6, 'red', true);
  b.box(-6.2, M + 5.5, -338.4, 6.2, M + 6.3, -337.6, 'red', false);
  b.decal(-5.4, -338.4, 5.4, -337.6, M, 'red');
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    b.decal(x, -340.4, x + 1, -339.6, M, i % 2 ? 'white' : 'dark');
    b.decal(x + 1, -341.2, x + 2, -340.4, M, i % 2 ? 'white' : 'dark');
  }
  b.latticeTower(-7, -348, M, 12, 1.2);
  b.flag(-9, -336, M, 0);
  b.flag(9, -336, M, Math.PI);
  b.acUnit(6.5, -347, M);

  // ===========================================================================
  // Decorative near-field buildings (non-route) to frame the level.
  // ===========================================================================
  b.building(-30, -60, -14, -20, 26, 'glass', 'NSEW');
  b.building(16, -40, 32, -10, 14, 'officeOrange', 'NSEW');
  b.acUnit(24, -25, 14);
  b.building(18, -100, 34, -66, 30, 'office', 'NSEW');
  b.latticeTower(28, -90, 30, 20);
  b.building(-26, -130, -12, -100, 12, 'office', 'NSEW');
  b.skylight(-22, -120, -16, -110, 12);
  b.building(-34, -170, -20, -140, 44, 'glass', '');
  b.building(26, -210, 40, -170, 22, 'officeOrange', 'NSEW');
  b.waterTower(33, -190, 22);
  b.building(-28, -250, -12, -214, 15, 'office', 'NSEW');
  b.building(16, -270, 30, -228, 38, 'glass', '');
  b.billboard(15.95, 30, -250, 16, 6, -Math.PI / 2, 'HALCYON', 'GLASS · LIGHT · AIR');
  b.building(-30, -320, -14, -280, 30, 'office', '');
  b.building(14, -334, 34, -306, 12, 'office', 'NSEW');
  b.building(-8, -392, 10, -366, 50, 'glass', '');
  b.billboard(1, 56, -365.95, 12, 5, 0, 'FLOW', 'KEEP MOVING');
  b.building(-32, -360, -16, -330, 24, 'officeOrange', 'NSEW');

  b.finish = zone(-10, -339, 10, -337, M - 1, M + 6);
  b.finishMarker = [0, M, -338];

  return b.build({
    id: 'tutorial',
    name: 'TUTORIAL',
    tagline: 'Learn to run, jump, slide, vault and wall run.',
    startTitle: 'MOVEMENT',
    citySeed: 1337,
    spawn: [0, A, 1.5],
    spawnYaw: 0,
    killY: 8,
  });
}
