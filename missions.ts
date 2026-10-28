/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MapId = 'city' | 'docks' | 'wasteland';
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  description: string;
  enemyHp: number;
  enemySpeed: number;
  enemyDamage: number;
  enemyCount: number;
  creditMult: number;
  scoreMult: number;
  bonusCredits: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    id: 'easy',
    name: 'Easy',
    description: 'Fewer, weaker zombies. More credits. Good for learning.',
    enemyHp: 0.75,
    enemySpeed: 0.88,
    enemyDamage: 0.6,
    enemyCount: 0.8,
    creditMult: 1.25,
    scoreMult: 0.8,
    bonusCredits: 200,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    description: 'The intended experience.',
    enemyHp: 1,
    enemySpeed: 1,
    enemyDamage: 1,
    enemyCount: 1,
    creditMult: 1,
    scoreMult: 1,
    bonusCredits: 0,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    description: 'Tougher, faster, hit harder and come in bigger hordes.',
    enemyHp: 1.35,
    enemySpeed: 1.12,
    enemyDamage: 1.4,
    enemyCount: 1.3,
    creditMult: 0.9,
    scoreMult: 1.4,
    bonusCredits: 0,
  },
};

export interface LevelDef {
  id: number;
  name: string;
  map: MapId;
  waves: number; // waves to survive to complete the level
  waveOffset: number; // makes later levels start with tougher enemy mixes
  startCredits: number;
  blurb: string;
}

export const LEVELS: LevelDef[] = [
  { id: 1, name: 'Quarantine Zone', map: 'city', waves: 3, waveOffset: 0, startCredits: 400, blurb: 'Hold the ruined streets. Learn the ropes.' },
  { id: 2, name: 'Toxic Docks', map: 'docks', waves: 4, waveOffset: 1, startCredits: 700, blurb: 'Warehouses, containers and leaking barrels.' },
  { id: 3, name: 'Dead Highway', map: 'wasteland', waves: 5, waveOffset: 2, startCredits: 1000, blurb: 'Open ground. Spitters and sprinters everywhere.' },
  { id: 4, name: 'Downtown Overrun', map: 'city', waves: 6, waveOffset: 4, startCredits: 1300, blurb: 'The city again, now crawling with Tanks.' },
  { id: 5, name: 'Last Stand', map: 'docks', waves: 8, waveOffset: 6, startCredits: 1800, blurb: 'Eight waves. No retreat. Survive.' },
];

export interface MapLayout {
  buildings: { w: number; h: number; d: number; x: number; z: number }[];
  lamps: [number, number][];
  cars: { x: number; z: number; rot: number }[];
  barricades: { x: number; z: number; rot: number }[];
  barrels: [number, number][];
}

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  groundTint: number;
  background: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  sunColor: number;
  sunIntensity: number;
  minimapColor: string;
  layout: MapLayout;
}

export const MAPS: Record<MapId, MapDef> = {
  city: {
    id: 'city',
    name: 'Ruined City',
    description: 'Tall ruins, wrecked cars and military barricades.',
    groundTint: 0xffffff,
    background: 0x06080d,
    fogDensity: 0.024,
    hemiSky: 0x38bdf8,
    hemiGround: 0x1e1b4b,
    sunColor: 0x93c5fd,
    sunIntensity: 1.4,
    minimapColor: '#38bdf8',
    layout: {
      buildings: [
        { w: 16, h: 28, d: 14, x: -35, z: -35 },
        { w: 22, h: 36, d: 16, x: 0, z: -40 },
        { w: 18, h: 30, d: 16, x: 35, z: -35 },
        { w: 14, h: 32, d: 24, x: -40, z: 0 },
        { w: 14, h: 26, d: 24, x: 40, z: 0 },
        { w: 16, h: 28, d: 14, x: -35, z: 35 },
        { w: 22, h: 34, d: 16, x: 0, z: 40 },
        { w: 18, h: 26, d: 14, x: 35, z: 35 },
      ],
      lamps: [[-16, -16], [16, -16], [-16, 16], [16, 16]],
      cars: [
        { x: -10, z: -7, rot: 0.4 },
        { x: 14, z: 8, rot: -0.6 },
        { x: -8, z: 12, rot: 1.2 },
        { x: 9, z: -12, rot: -1.8 },
      ],
      barricades: [
        { x: -18, z: 0, rot: 0 },
        { x: 18, z: 0, rot: 0 },
        { x: 0, z: -20, rot: Math.PI / 2 },
        { x: 0, z: 20, rot: Math.PI / 2 },
      ],
      barrels: [[-6, -14], [7, 14], [-14, 8], [15, -7], [-4, 16], [5, -16]],
    },
  },
  docks: {
    id: 'docks',
    name: 'Toxic Docks',
    description: 'Warehouses and shipping containers. Lots of explosive barrels.',
    groundTint: 0x7aa08a,
    background: 0x041208,
    fogDensity: 0.028,
    hemiSky: 0x34d399,
    hemiGround: 0x052e16,
    sunColor: 0x86efac,
    sunIntensity: 1.2,
    minimapColor: '#34d399',
    layout: {
      buildings: [
        { w: 30, h: 14, d: 12, x: -30, z: -38 },
        { w: 30, h: 14, d: 12, x: 30, z: -38 },
        { w: 12, h: 16, d: 30, x: -42, z: 10 },
        { w: 12, h: 16, d: 30, x: 42, z: -10 },
        { w: 30, h: 14, d: 12, x: -28, z: 40 },
        { w: 30, h: 14, d: 12, x: 28, z: 40 },
        // shipping containers
        { w: 10, h: 5, d: 4, x: -14, z: -12 },
        { w: 10, h: 5, d: 4, x: 12, z: 14 },
        { w: 4, h: 5, d: 10, x: -16, z: 14 },
        { w: 4, h: 5, d: 10, x: 15, z: -14 },
        { w: 10, h: 5, d: 4, x: 0, z: -26 },
      ],
      lamps: [[-20, 0], [20, 0], [0, 24], [-24, -24]],
      cars: [
        { x: -6, z: 8, rot: 0.8 },
        { x: 7, z: -9, rot: -0.3 },
      ],
      barricades: [
        { x: -9, z: -20, rot: 0 },
        { x: 9, z: 20, rot: 0 },
      ],
      barrels: [[-4, -8], [5, 9], [-24, -4], [24, 5], [-12, 22], [13, -22], [3, -30], [-2, 31]],
    },
  },
  wasteland: {
    id: 'wasteland',
    name: 'Dead Highway',
    description: 'Open desert road with wrecks to hide behind. Few walls.',
    groundTint: 0xc9a46a,
    background: 0x1c1208,
    fogDensity: 0.02,
    hemiSky: 0xfb923c,
    hemiGround: 0x451a03,
    sunColor: 0xfdba74,
    sunIntensity: 1.5,
    minimapColor: '#fb923c',
    layout: {
      buildings: [
        { w: 12, h: 12, d: 10, x: -34, z: -30 },
        { w: 10, h: 9, d: 14, x: 36, z: -28 },
        { w: 14, h: 14, d: 10, x: -38, z: 26 },
        { w: 12, h: 10, d: 12, x: 34, z: 34 },
        { w: 8, h: 18, d: 8, x: 0, z: -42 },
      ],
      lamps: [[-22, -22], [22, 22]],
      cars: [
        { x: -3, z: -14, rot: 1.4 },
        { x: 2, z: -24, rot: 1.7 },
        { x: -2, z: 14, rot: 1.5 },
        { x: 3, z: 26, rot: 1.3 },
        { x: 18, z: -6, rot: 0.2 },
        { x: -20, z: 8, rot: -0.4 },
      ],
      barricades: [
        { x: -14, z: 0, rot: Math.PI / 2 },
        { x: 14, z: 0, rot: Math.PI / 2 },
        { x: -8, z: -30, rot: 0 },
        { x: 8, z: 30, rot: 0 },
      ],
      barrels: [[-8, 6], [9, -5], [-16, -16], [17, 15], [-26, 12], [27, -12]],
    },
  },
};

// --- Campaign progress (highest unlocked level) ---
const PROGRESS_KEY = 'zombie_apocalypse_unlocked_level';

export function getUnlockedLevel(): number {
  try {
    const v = parseInt(localStorage.getItem(PROGRESS_KEY) || '1', 10);
    return Number.isFinite(v) && v >= 1 ? Math.min(v, LEVELS.length) : 1;
  } catch {
    return 1;
  }
}

export function unlockLevel(level: number) {
  try {
    if (level > getUnlockedLevel()) localStorage.setItem(PROGRESS_KEY, String(Math.min(level, LEVELS.length)));
  } catch {
    // storage unavailable
  }
}

export interface MissionConfig {
  levelId: number | null; // null = endless
  map: MapId;
  difficulty: DifficultyId;
}

export interface MissionInfo {
  levelId: number | null;
  name: string;
  mapName: string;
  waveGoal: number | null;
  difficultyName: string;
}

export interface MinimapData {
  px: number;
  pz: number;
  rotation: number;
  headingUp: boolean;
  arenaHalf: number;
  accent: string;
  mapName: string;
  obstacles: { x: number; z: number; radius: number }[];
  enemies: { x: number; z: number; type: string }[];
  drops: { x: number; z: number; type: string }[];
}
