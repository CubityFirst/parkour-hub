/**
 * Bot routes for the headless completability test (scripts/simulate.ts).
 *
 * The bot steers toward each waypoint in turn. An action fires when the bot
 * passes the waypoint along the direction it is travelling (from the
 * previous waypoint), mimicking a player pressing a key at that spot.
 */
export type Action = 'jump' | 'slide' | 'vault';

export interface Step {
  x: number;
  z: number;
  action?: Action;
  /** Hold the slide key for this many seconds after the action (landing slides). */
  holdSlide?: number;
  label: string;
}

const s = (x: number, z: number, label: string, action?: Action, holdSlide?: number): Step => ({ x, z, label, action, holdSlide });

export const ROUTES: Record<string, Step[]> = {
  tutorial: [
    s(0, -8, 'start'),
    s(0, -11.5, 'hop barrier', 'jump'),
    s(0, -19, 'slide duct A', 'slide'),
    s(0, -39.7, 'gap A->B', 'jump'),
    s(0, -61.7, 'gap B->C', 'jump'),
    s(2, -79.7, 'ledge C->D', 'jump'),
    s(2, -95.7, 'drop D->E', 'jump'),
    s(2, -109.5, 'slide E1', 'slide'),
    s(2, -116.8, 'slide E2', 'slide'),
    s(2, -123.6, 'slide E3', 'slide'),
    s(9.1, -133, 'line up wall run'),
    s(9.25, -139.7, 'wall run right', 'jump'),
    s(9.0, -158, 'wall run / land F'),
    s(1.5, -157.8, 'line up vault'),
    s(1, -159.9, 'vault barrier F', 'vault'),
    s(-1.2, -163.4, 'slide F', 'slide'),
    s(-3.1, -169, 'line up left wall'),
    s(-3.25, -174.7, 'wall run left', 'jump'),
    s(-2.5, -192.6, 'container climb', 'jump'),
    s(0, -199.7, 'container -> H', 'jump'),
    s(0, -221, 'approach beam'),
    s(0, -236, 'beam'),
    s(0, -245.7, 'gap I->J', 'jump'),
    s(0, -257.3, 'jump-vault J', 'jump'),
    s(0, -265.7, 'gap J->K', 'jump'),
    s(0, -280.3, 'slide K', 'slide'),
    s(0, -299.7, 'gap K->L', 'jump'),
    s(0, -317.7, 'launch L->M', 'jump'),
    s(0, -345, 'finish'),
  ],

  level1: [
    s(0, -29.7, 'gap to R2', 'jump'),
    s(0, -39.5, 'slide duct', 'slide'),
    s(0, -52.3, 'jump-vault barrier', 'jump'),
    s(0, -61.7, 'gap to R3', 'jump'),
    s(2, -73, 'turn east'),
    s(7.7, -73, 'gap to R4', 'jump'),
    s(30, -81.2, 'line up wall'),
    s(39.7, -81.2, 'wall run left', 'jump'),
    s(54, -80, 'land R5'),
    s(63, -74, 'turn north'),
    s(63, -81.7, 'ledge R6', 'jump'),
    s(65, -100, 'R6'),
    s(65, -124, 'beam'),
    s(65, -128, 'slide R7', 'slide'),
    s(65, -147.7, 'big drop', 'jump', 1.2),
    s(65, -180, 'finish'),
  ],

  level2: [
    s(0, -23.7, 'gap to G2', 'jump'),
    s(1.2, -36, 'line up canyon'),
    s(1.3, -43.7, 'wall run right', 'jump'),
    s(1.2, -52, 'wall jump', 'jump'),
    s(-1.6, -62, 'left wall'),
    s(-1.5, -70, 'left wall end'),
    s(0, -82, 'land G3'),
    s(0, -89.6, 'climb block', 'jump'),
    s(0, -95.7, 'climb G4', 'jump'),
    s(0, -119, 'G4'),
    s(0, -134, 'beam 1'),
    s(0, -136, 'pillar'),
    s(14, -136, 'beam 2'),
    s(19.7, -136, 'gap to G5', 'jump'),
    s(30, -127.7, 'line up wall'),
    s(39.7, -127.7, 'wall run right', 'jump'),
    s(56, -128, 'land G6'),
    s(59, -133, 'turn north'),
    s(59, -144.7, 'gap to G7', 'jump'),
    s(58, -156.4, 'jump-vault', 'jump'),
    s(58, -161.6, 'slide', 'slide'),
    s(58, -184, 'finish'),
  ],

  level3: [
    s(0, -20, 'girder start'),
    s(0, -34, 'girder end'),
    s(0, -38.9, 'container A', 'jump'),
    s(0, -45.7, 'container stack', 'jump'),
    s(0, -55.7, 'drop to C3', 'jump'),
    s(3, -70, 'C3'),
    s(7.2, -80, 'line up core'),
    s(7.2, -89.7, 'wall run right', 'jump'),
    s(2, -112, 'land C4'),
    s(0, -120, 'line up beam'),
    s(0, -130.6, 'broken beam', 'jump'),
    s(0, -140, 'beam end'),
    s(0, -147.4, 'jump-vault', 'jump'),
    s(0, -154, 'slide', 'slide'),
    s(0, -171.7, 'long drop', 'jump', 1.2),
    s(0, -205, 'finish'),
  ],

  level4: [
    s(0, -19.7, 'drop to D2', 'jump', 1.2),
    s(0, -47.7, 'drop to D3', 'jump'),
    s(-2, -66, 'turn west'),
    s(-5.7, -66, 'drop to D4', 'jump'),
    s(-18, -69.2, 'line up wall'),
    s(-25.7, -69.2, 'wall run right', 'jump'),
    s(-40, -68, 'land D5'),
    s(-48, -58, 'turn north'),
    s(-48, -69.7, 'drop to D6', 'jump'),
    s(-47, -99.7, 'drop to D7', 'jump', 1.2),
    s(-47, -131.7, 'long gap to D8', 'jump'),
    s(-47, -164.8, 'climb D9', 'jump'),
    s(-47, -185.7, 'final drop', 'jump', 1.2),
    s(-47, -220, 'finish'),
  ],

  level5: [
    s(0, -19.7, 'gap to S2', 'jump'),
    s(0, -30.4, 'jump-vault', 'jump'),
    s(0, -33.6, 'slide', 'slide'),
    s(1.0, -45, 'line up canyon'),
    s(1.3, -51.7, 'wall run right', 'jump'),
    s(1.2, -60, 'wall jump', 'jump'),
    s(-1.6, -70, 'left wall'),
    s(-1.5, -76, 'left wall end'),
    s(0, -88, 'land S3'),
    s(0, -95.3, 'container 1', 'jump'),
    s(0, -99.3, 'container 2', 'jump'),
    s(0, -103.7, 'to S4', 'jump'),
    s(0, -127, 'beam'),
    s(0, -136.7, 'broken beam', 'jump'),
    s(0, -152, 'S5'),
    s(-3, -162, 'turn east'),
    s(-1.5, -165.2, 'line up wall'),
    s(5.7, -165.2, 'wall run left', 'jump'),
    s(25, -160, 'S6'),
    s(31.9, -158, 'climb S7', 'jump'),
    s(36.4, -158, 'jump-vault', 'jump'),
    s(39.5, -158, 'slide', 'slide'),
    s(57.7, -158, 'drop to S8', 'jump', 1.2),
    s(78, -153, 'S8'),
    s(84.2, -162, 'line up wall'),
    s(84.2, -171.7, 'wall run right', 'jump'),
    s(83, -189, 'land S9'),
    s(81.5, -192, 'steps'),
    s(81.5, -201.7, 'launch', 'jump'),
    s(80, -235, 'finish'),
  ],
};
