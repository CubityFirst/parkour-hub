import type { LevelData } from '../world/LevelLayout';
import { buildLevel1 } from './level1';
import { buildLevel2 } from './level2';
import { buildLevel3 } from './level3';
import { buildLevel4 } from './level4';
import { buildLevel5 } from './level5';
import { buildTutorial } from './tutorial';

export interface LevelEntry {
  id: string;
  /** Label shown in the level browser ("TUTORIAL", "LEVEL 1"...). */
  label: string;
  name: string;
  tagline: string;
  build(): LevelData;
}

/** All levels in unlock order. Finishing one unlocks the next. */
export const LEVELS: LevelEntry[] = [
  { id: 'tutorial', label: 'TUTORIAL', name: 'TUTORIAL', tagline: 'Learn to run, jump, slide, vault and wall run.', build: buildTutorial },
  { id: 'level1', label: 'LEVEL 1', name: 'DOWNTOWN DASH', tagline: 'Keep your speed through the turns.', build: buildLevel1 },
  { id: 'level2', label: 'LEVEL 2', name: 'GLASS DISTRICT', tagline: 'Chain wall runs through a canyon of glass.', build: buildLevel2 },
  { id: 'level3', label: 'LEVEL 3', name: 'CONSTRUCTION YARD', tagline: 'Girders, containers and a broken beam at golden hour.', build: buildLevel3 },
  { id: 'level4', label: 'LEVEL 4', name: 'THE DESCENT', tagline: 'Sunset. Big drops — land them in a slide.', build: buildLevel4 },
  { id: 'level5', label: 'LEVEL 5', name: 'SKYLINE', tagline: 'Eighty metres up. Everything you have learned.', build: buildLevel5 },
];
