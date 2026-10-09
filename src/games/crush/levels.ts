// Level data from Froyo Crush, unchanged except that coupon rewards were removed
// (rewards are out of scope for the arcade).
// modes: collect (one topping), score, ice (crack every ice tile), blocks (crumble every cookie)
// layout: 8 rows of 8 chars — . empty · i ice · I thick ice (2 hits) · c cookie blocker

export type LevelMode = 'collect' | 'score' | 'ice' | 'blocks';

export type Level = {
  n: number;
  name: string;
  mode: LevelMode;
  targetType?: number;
  goal?: number;
  moves: number;
  target: number;
  types: number;
  tip?: string;
  layout?: string[];
};

export const WORLD_SIZE = 7;

export const WORLDS = [
  { name: 'Berry Swirl', tint: '#F0D8E4', sky: ['#CFEBFF', '#E9F7D9', '#FFF1DC'], toppings: ['🍓', '🫐', '🥝', '🍫', '🥭', '🍡'] },
  { name: 'Mango Tropics', tint: '#FFDFA0', sky: ['#FFE9C2', '#FFF3D6', '#E4F5DA'], toppings: ['🥭', '🍍', '🍊', '🥝', '🍋', '🍡'] },
  { name: 'Choco Dream', tint: '#E3CBB6', sky: ['#E6D8F5', '#F6E6EE', '#FFEEDC'], toppings: ['🍫', '🍪', '🍩', '☕', '🍥', '🍓'] },
];

export const TYPES = [
  { k: 'straw', e: '🍓', a: '#FF8A9A', b: '#D31E3C' },
  { k: 'blue', e: '🫐', a: '#8FA0FF', b: '#2E3C93' },
  { k: 'kiwi', e: '🥝', a: '#C6EC7C', b: '#5C8C1E' },
  { k: 'mango', e: '🥭', a: '#FFD97A', b: '#E08A00' },
  { k: 'choco', e: '🍫', a: '#C89A6B', b: '#6B3E1D' },
  { k: 'mochi', e: '🍥', a: '#FFE3EE', b: '#E8A9C4' },
  { k: 'cookie', e: '🍪', a: '#F3D7A6', b: '#C58A3E' },
];

/** TYPES index of the cookie blocker — never spawned randomly, never matches. */
export const BLOCK = 6;

export const LEVELS: Level[] = [
  // world 1 — Berry Swirl
  { n: 1, name: 'Berry Blast', mode: 'collect', targetType: 0, goal: 15, moves: 18, target: 6000, types: 6 },
  { n: 2, name: 'Kiwi Rush', mode: 'collect', targetType: 2, goal: 18, moves: 20, target: 7600, types: 6 },
  { n: 3, name: 'Chocolate Drop', mode: 'collect', targetType: 4, goal: 20, moves: 19, target: 9000, types: 6 },
  {
    n: 4, name: 'Frosty Start', mode: 'ice', moves: 20, target: 6500, types: 6, tip: 'MATCH ON ICE TO CRACK IT!',
    layout: ['........', '........', '........', '.iiiiii.', '.iiiiii.', '........', '........', '........'],
  },
  { n: 5, name: 'Mochi Mix', mode: 'collect', targetType: 5, goal: 24, moves: 19, target: 10000, types: 6 },
  { n: 6, name: 'Score Sprint', mode: 'score', goal: 14000, moves: 17, target: 7000, types: 6 },
  {
    n: 7, name: 'Berry Freeze', mode: 'ice', moves: 19, target: 7000, types: 6,
    layout: ['........', '..iiii..', '.iIIIIi.', '.iIIIIi.', '..iiii..', '........', '........', '........'],
  },
  // world 2 — Mango Tropics
  {
    n: 8, name: 'Cookie Crumbs', mode: 'blocks', moves: 16, target: 3000, types: 6, tip: 'MATCH NEXT TO COOKIES!',
    layout: ['........', '..c..c..', '........', '...cc...', '........', '..c.....', '........', '........'],
  },
  {
    n: 9, name: 'Mango Madness', mode: 'collect', targetType: 3, goal: 26, moves: 22, target: 10000, types: 6,
    layout: ['........', '........', 'c......c', '........', '........', 'c......c', '........', '........'],
  },
  {
    n: 10, name: 'Blueberry Bash', mode: 'collect', targetType: 1, goal: 26, moves: 21, target: 9000, types: 6,
    layout: ['........', '...cc...', '........', '.c....c.', '.c....c.', '........', '...cc...', '........'],
  },
  {
    n: 11, name: 'Icy Cookies', mode: 'ice', moves: 22, target: 8000, types: 6,
    layout: ['........', '.i.ii.i.', '..c..c..', '.iiiiii.', '.iiiiii.', '..c..c..', '.i.ii.i.', '........'],
  },
  {
    n: 12, name: 'Score Rush', mode: 'score', moves: 18, target: 7500, types: 6,
    layout: ['c......c', '........', '........', '........', '........', '........', '........', 'c......c'],
  },
  {
    n: 13, name: 'Cookie Jar', mode: 'blocks', moves: 12, target: 4500, types: 6,
    layout: ['........', '.c.cc.c.', '........', '.cc..cc.', '........', '.c.cc.c.', '........', '........'],
  },
  {
    n: 14, name: 'Tropical Freeze', mode: 'ice', moves: 32, target: 11000, types: 6,
    layout: ['........', 'iIi..iIi', 'IiI..IiI', '........', '........', 'IiI..IiI', 'iIi..iIi', '........'],
  },
  // world 3 — Choco Dream
  {
    n: 15, name: 'Choco Storm', mode: 'collect', targetType: 4, goal: 28, moves: 22, target: 10500, types: 6,
    layout: ['........', '.c....c.', '........', '...cc...', '...cc...', '........', '.c....c.', '........'],
  },
  {
    n: 16, name: 'Deep Freeze', mode: 'ice', moves: 25, target: 10500, types: 6,
    layout: ['........', '.IIIIII.', '.IiiiiI.', '.IiiiiI.', '.IiiiiI.', '.IIIIII.', '........', '........'],
  },
  {
    n: 17, name: 'Cookie Wall', mode: 'blocks', moves: 15, target: 6000, types: 6,
    layout: ['........', '........', 'cccccccc', '........', '........', 'cccccccc', '........', '........'],
  },
  {
    n: 18, name: 'Mochi Marathon', mode: 'collect', targetType: 5, goal: 28, moves: 22, target: 11000, types: 6,
    layout: ['........', 'c.c..c.c', '........', '..c..c..', '..c..c..', '........', 'c.c..c.c', '........'],
  },
  {
    n: 19, name: 'Score Blitz', mode: 'score', moves: 18, target: 8500, types: 6,
    layout: ['........', '.c....c.', '........', '........', '........', '........', '.c....c.', '........'],
  },
  {
    n: 20, name: 'Frozen Cookies', mode: 'ice', moves: 33, target: 12500, types: 6,
    layout: ['i......i', '.IiccIi.', '.iIccIi.', '..iiii..', '..iiii..', '.iIccIi.', '.IiccIi.', 'i......i'],
  },
  {
    n: 21, name: 'Cup Finale', mode: 'ice', moves: 26, target: 12000, types: 6,
    layout: ['..c..c..', '.IIIIII.', 'cIiiiiIc', '.IiIIiI.', '.IiIIiI.', 'cIiiiiIc', '.IIIIII.', '..c..c..'],
  },
];

export const worldOf = (n: number) => Math.floor((n - 1) / WORLD_SIZE);

export const layoutCell = (level: Level, r: number, c: number) => ((level.layout && level.layout[r]) || '')[c] || '.';

export function levelFor(n: number): Level {
  return LEVELS.find((l) => l.n === n) || LEVELS[LEVELS.length - 1]!;
}

// ---------- saved progress ----------

const SAVE_KEY = 'froyo-crush-progress-v2';

export type CrushState = {
  currentLevel: number;
  unlockedLevel: number;
  stars: Record<string, number>;
  seenTutorial: boolean;
  settings: { sound: boolean; vibration: boolean };
};

export function loadCrushState(): CrushState {
  const fresh: CrushState = {
    currentLevel: 1,
    unlockedLevel: 1,
    stars: {},
    seenTutorial: false,
    settings: { sound: true, vibration: true },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return {
      currentLevel: saved.currentLevel || 1,
      unlockedLevel: Math.max(1, saved.unlockedLevel || 1),
      stars: saved.stars || {},
      seenTutorial: !!saved.seenTutorial,
      settings: { ...fresh.settings, ...(saved.settings || {}) },
    };
  } catch {
    return fresh;
  }
}

export function saveCrushState(state: CrushState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked; progress just won't persist.
  }
}

export function currentLevelOf(state: CrushState): Level {
  return levelFor(Math.min(state.currentLevel, state.unlockedLevel));
}
