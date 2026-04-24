export type RecruitQuality = 'common' | 'uncommon' | 'rare' | 'epic';
export type AIBehavior = 'follow' | 'aggressive' | 'defensive' | 'roaming' | 'passive';
export type FormationType = 'spread' | 'tight' | 'vformation' | 'circle';

export interface RecruitStats {
  health: number;
  damage: number;
  fireRate: number;
  speed: number;
  range: number;
}

export interface RecruitData {
  uid: string;
  name: string;
  className: string;
  quality: RecruitQuality;
  level: number;
  baseStats: RecruitStats;
  trait: string | null;
  behavior: AIBehavior;
  dead: boolean;
  xp: number;
  kills: number;
  // Multi-slot equipment. One copy of each equipment id max. Removing an item
  // from a recruit is done by selling (refund) — there is no "unequip".
  // Legacy save-data may store a string|null here; RecruitSystem.normalizeEquipment
  // coerces those into an array on load.
  equipment: string[];
  wavesLived: number;
}

export interface RecruitClassDef {
  name: string;
  baseStats: RecruitStats;
  color: string;
  defaultBehavior: AIBehavior;
  isMelee: boolean;
  isHealer?: boolean;
  isUtility?: boolean;
  shape: 'square' | 'diamond' | 'circle' | 'triangle';
  weaponLabel: string;
  specialAbility: string;
}

export interface EquipmentDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'weapon' | 'armor' | 'accessory';
  statMods: Partial<RecruitStats>;
  special?: string;
  dropWaveMin: number;
}

export const RECRUIT_CLASSES: Record<string, RecruitClassDef> = {
  gunner: {
    name: 'Gunner', color: '#44FF44', defaultBehavior: 'follow', isMelee: false,
    shape: 'square', weaponLabel: 'Pistol', specialAbility: 'accuracyRamp',
    baseStats: { health: 8, damage: 1, fireRate: 2, speed: 70, range: 200 },
  },
  sniper: {
    name: 'Sniper', color: '#FFFF44', defaultBehavior: 'roaming', isMelee: false,
    shape: 'diamond', weaponLabel: 'Rifle', specialAbility: 'chargedShot',
    baseStats: { health: 5, damage: 4, fireRate: 0.5, speed: 40, range: 350 },
  },
  brawler: {
    name: 'Brawler', color: '#FF8844', defaultBehavior: 'aggressive', isMelee: true,
    shape: 'square', weaponLabel: 'Fists', specialAbility: 'cleave',
    baseStats: { health: 15, damage: 2, fireRate: 1.5, speed: 80, range: 50 },
  },
  mage: {
    name: 'Mage', color: '#8844FF', defaultBehavior: 'follow', isMelee: false,
    shape: 'circle', weaponLabel: 'Staff', specialAbility: 'splash',
    baseStats: { health: 6, damage: 3, fireRate: 1, speed: 50, range: 250 },
  },
  tank: {
    name: 'Tank', color: '#888888', defaultBehavior: 'aggressive', isMelee: true,
    shape: 'square', weaponLabel: 'Shield', specialAbility: 'taunt',
    baseStats: { health: 25, damage: 1, fireRate: 1, speed: 30, range: 80 },
  },
  healer: {
    name: 'Healer', color: '#FF88FF', defaultBehavior: 'defensive', isMelee: false,
    shape: 'circle', weaponLabel: 'Heal Aura', specialAbility: 'regenAura',
    baseStats: { health: 10, damage: 0, fireRate: 0, speed: 50, range: 150 },
    isHealer: true,
  },
  taxCollector: {
    name: 'Tax Collector', color: '#FFD700', defaultBehavior: 'passive', isMelee: false,
    shape: 'square', weaponLabel: 'Ledger', specialAbility: 'taxIncome',
    baseStats: { health: 6, damage: 0, fireRate: 0, speed: 45, range: 100 },
    isUtility: true,
  },
  berserker: {
    name: 'Berserker', color: '#CC0000', defaultBehavior: 'aggressive', isMelee: true,
    shape: 'triangle', weaponLabel: 'Axe', specialAbility: 'rage',
    baseStats: { health: 12, damage: 1.5, fireRate: 1.2, speed: 90, range: 50 },
  },
  scout: {
    name: 'Scout', color: '#00CCCC', defaultBehavior: 'roaming', isMelee: false,
    shape: 'diamond', weaponLabel: 'Knives', specialAbility: 'mark',
    baseStats: { health: 7, damage: 1.5, fireRate: 1.8, speed: 100, range: 180 },
  },
  medic: {
    name: 'Medic', color: '#FF4466', defaultBehavior: 'follow', isMelee: false,
    shape: 'circle', weaponLabel: 'Heal Vials', specialAbility: 'healBolt',
    baseStats: { health: 8, damage: 0, fireRate: 0.8, speed: 70, range: 200 },
    isHealer: true,
  },
};

export const RECRUIT_TRAITS: Record<string, { name: string; description: string }> = {
  tough: { name: 'Tough', description: '+30% HP' },
  quickDraw: { name: 'Quick Draw', description: '+25% fire rate' },
  dodge: { name: 'Dodge', description: '20% evade chance' },
  lifesteal: { name: 'Lifesteal', description: 'Heal 1 HP on kill' },
  moneyFinder: { name: 'Money Finder', description: '+50% gold from kills' },
  lastStand: { name: 'Last Stand', description: '2x DMG below 25% HP' },
  swift: { name: 'Swift', description: '+30% move speed' },
  ironSkin: { name: 'Iron Skin', description: '-20% damage taken' },
};

export const AI_BEHAVIORS: Record<AIBehavior, { name: string; description: string }> = {
  follow: { name: 'Follow', description: 'Stay near you, fight nearby' },
  aggressive: { name: 'Aggressive', description: 'Seek out enemies' },
  defensive: { name: 'Defensive', description: 'Retreat when hurt' },
  roaming: { name: 'Roaming', description: 'Patrol the arena' },
  passive: { name: 'Passive', description: 'Avoid combat, stay safe' },
};

export const QUALITY_COLORS: Record<RecruitQuality, string> = {
  common: '#AAAAAA',
  uncommon: '#44FF44',
  rare: '#4488FF',
  epic: '#AA44FF',
};

const QUALITY_STAT_MULT: Record<RecruitQuality, number> = {
  common: 1.0, uncommon: 1.25, rare: 1.5, epic: 2.0,
};

const QUALITY_COST_MULT: Record<RecruitQuality, number> = {
  common: 1.0, uncommon: 1.6, rare: 2.8, epic: 5.0,
};

export const EQUIPMENT: Record<string, EquipmentDef> = {
  ironPlate: {
    id: 'ironPlate', name: 'Iron Plate', type: 'armor', cost: 60,
    description: '-1 damage taken per hit',
    statMods: { health: 3 }, special: 'flatArmor', dropWaveMin: 3,
  },
  speedBoots: {
    id: 'speedBoots', name: 'Speed Boots', type: 'accessory', cost: 45,
    description: '+25 move speed',
    statMods: { speed: 25 }, dropWaveMin: 1,
  },
  scopeLens: {
    id: 'scopeLens', name: 'Scope Lens', type: 'accessory', cost: 80,
    description: '+50 range, +0.5 damage',
    statMods: { range: 50, damage: 0.5 }, dropWaveMin: 5,
  },
  rapidLoader: {
    id: 'rapidLoader', name: 'Rapid Loader', type: 'weapon', cost: 70,
    description: '+0.5 fire rate',
    statMods: { fireRate: 0.5 }, dropWaveMin: 4,
  },
  vampFang: {
    id: 'vampFang', name: 'Vampire Fang', type: 'accessory', cost: 120,
    description: 'Heal 2 HP on kill',
    statMods: {}, special: 'vampiric', dropWaveMin: 8,
  },
  shieldBuckler: {
    id: 'shieldBuckler', name: 'Shield Buckler', type: 'armor', cost: 90,
    description: '+5 HP, 15% block chance',
    statMods: { health: 5 }, special: 'blockChance', dropWaveMin: 6,
  },
  magnetRing: {
    id: 'magnetRing', name: 'Magnet Ring', type: 'accessory', cost: 55,
    description: 'Auto-collects nearby money drops',
    statMods: {}, special: 'moneyMagnet', dropWaveMin: 2,
  },
  berserkerHelm: {
    id: 'berserkerHelm', name: 'Berserker Helm', type: 'armor', cost: 100,
    description: '+0.8 damage, -3 HP',
    statMods: { damage: 0.8, health: -3 }, dropWaveMin: 7,
  },
  healingTotem: {
    id: 'healingTotem', name: 'Healing Totem', type: 'accessory', cost: 110,
    description: '+1 HP/s regen',
    statMods: {}, special: 'regen', dropWaveMin: 5,
  },
  explosiveRounds: {
    id: 'explosiveRounds', name: 'Explosive Rounds', type: 'weapon', cost: 150,
    description: 'Attacks deal AoE splash (30% dmg)',
    statMods: {}, special: 'explosiveAttacks', dropWaveMin: 12,
  },
};

const RECRUIT_NAMES = [
  'Axel', 'Blaze', 'Brick', 'Colt', 'Dash', 'Echo', 'Finn', 'Ghost',
  'Hawk', 'Iron', 'Jade', 'Knox', 'Luna', 'Mav', 'Nova', 'Onyx',
  'Pike', 'Quinn', 'Rex', 'Sage', 'Vex', 'Wolf', 'Zara', 'Ace',
  'Bolt', 'Cruz', 'Duke', 'Edge', 'Fang', 'Grit', 'Hex', 'Jett',
  'Kira', 'Lynx', 'Moss', 'Nyx', 'Opal', 'Raze', 'Soot', 'Thorn',
];

let uidCounter = 0;

// XP thresholds for in-combat leveling (levels 2-5)
export const XP_THRESHOLDS = [0, 50, 150, 350, 700];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= 5) return XP_THRESHOLDS[level - 1] || 700;
  return 700 + (level - 5) * 500;
}

export function canLevelFromXp(recruit: RecruitData): boolean {
  if (recruit.level >= 5) return false;
  return recruit.xp >= xpForLevel(recruit.level + 1);
}

export function tryLevelUpFromXp(recruit: RecruitData): boolean {
  if (!canLevelFromXp(recruit)) return false;
  recruit.level++;
  return true;
}

export function generateRecruit(waveLevel: number): RecruitData {
  const classIds = Object.keys(RECRUIT_CLASSES);
  const className = classIds[Math.floor(Math.random() * classIds.length)];
  return generateRecruitOfClass(className, waveLevel);
}

export function generateRecruitOfClass(className: string, waveLevel: number): RecruitData {
  const classDef = RECRUIT_CLASSES[className];
  if (!classDef) return generateRecruit(waveLevel);

  const quality = rollQuality(waveLevel);
  const vary = (v: number) => v > 0 ? +(v * (0.85 + Math.random() * 0.3)).toFixed(2) : 0;
  const base = classDef.baseStats;

  const baseStats: RecruitStats = {
    health: Math.round(vary(base.health)),
    damage: +vary(base.damage).toFixed(1),
    fireRate: +vary(base.fireRate).toFixed(2),
    speed: Math.round(vary(base.speed)),
    range: base.range,
  };

  const trait = rollTrait(quality);
  const name = RECRUIT_NAMES[Math.floor(Math.random() * RECRUIT_NAMES.length)];

  return {
    uid: `r_${++uidCounter}_${Math.random().toString(36).slice(2, 6)}`,
    name, className, quality, level: 1,
    baseStats, trait,
    behavior: classDef.defaultBehavior,
    dead: false,
    xp: 0,
    kills: 0,
    equipment: [],
    wavesLived: 0,
  };
}

/** Coerce legacy equipment fields (string | null | string[]) into a clean array. */
export function normalizeEquipment(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string' && !!EQUIPMENT[id]);
  if (typeof raw === 'string' && EQUIPMENT[raw]) return [raw];
  return [];
}

export function getEffectiveStats(recruit: RecruitData): RecruitStats {
  const q = QUALITY_STAT_MULT[recruit.quality];
  const l = 1 + (recruit.level - 1) * 0.15;
  const base = recruit.baseStats;
  const t = recruit.trait;

  let health = Math.round(base.health * q * l);
  let damage = +(base.damage * q * l).toFixed(1);
  let fireRate = +(base.fireRate * (1 + (q - 1) * 0.3)).toFixed(2);
  let speed = Math.round(base.speed * (1 + (q - 1) * 0.2));
  let range = base.range;

  if (t === 'tough') health = Math.round(health * 1.3);
  if (t === 'quickDraw') fireRate = +(fireRate * 1.25).toFixed(2);
  if (t === 'swift') speed = Math.round(speed * 1.3);

  // Equipment mods — sum across every equipped item.
  if (recruit.equipment && recruit.equipment.length > 0) {
    for (let i = 0; i < recruit.equipment.length; i++) {
      const equip = EQUIPMENT[recruit.equipment[i]];
      if (!equip) continue;
      health += equip.statMods.health || 0;
      damage += equip.statMods.damage || 0;
      fireRate += equip.statMods.fireRate || 0;
      speed += equip.statMods.speed || 0;
      range += equip.statMods.range || 0;
    }
  }

  // Veterancy: +2% stats per wave survived
  const vet = 1 + recruit.wavesLived * 0.02;
  health = Math.round(health * vet);
  damage = +(damage * vet).toFixed(1);

  return { health: Math.max(1, health), damage: Math.max(0, damage), fireRate: Math.max(0, fireRate), speed: Math.max(10, speed), range: Math.max(0, range) };
}

export function calculateRecruitCost(recruit: RecruitData): number {
  const stats = getEffectiveStats(recruit);
  const statValue = stats.health * 2 + stats.damage * 12 + stats.fireRate * 8 + stats.speed * 0.3 + stats.range * 0.08;
  let cost = statValue * QUALITY_COST_MULT[recruit.quality];
  if (recruit.trait) cost += 20;
  return Math.round(cost / 5) * 5;
}

export function getTrainingCost(recruit: RecruitData): number {
  return Math.round(25 * recruit.level);
}

export function getMaxTrainingLevel(): number {
  return 10;
}

export function trainRecruit(recruit: RecruitData): boolean {
  if (recruit.level >= getMaxTrainingLevel()) return false;
  recruit.level++;
  return true;
}

export function getRerollCost(rerollCount: number): number {
  return Math.min(50, 5 + rerollCount * 5);
}

export function generateRecruitPool(waveLevel: number, count: number = 3): RecruitData[] {
  const pool: RecruitData[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(generateRecruit(waveLevel));
  }
  return pool;
}

export function getAllowedBehaviors(className: string): AIBehavior[] {
  const cls = RECRUIT_CLASSES[className];
  if (!cls) return ['follow', 'roaming'];
  if (cls.isUtility) return ['passive', 'follow'];
  if (cls.isHealer) return ['follow', 'defensive', 'roaming'];
  return ['follow', 'aggressive', 'defensive', 'roaming'];
}

export function getAvailableEquipment(waveLevel: number): EquipmentDef[] {
  return Object.values(EQUIPMENT).filter(e => e.dropWaveMin <= waveLevel);
}

export const MAX_ROSTER = 12;

function rollQuality(waveLevel: number): RecruitQuality {
  const r = Math.random();
  const epicChance = Math.min(0.15, 0.02 + waveLevel * 0.005);
  const rareChance = Math.min(0.25, 0.08 + waveLevel * 0.01);
  const uncommonChance = Math.min(0.45, 0.30 + waveLevel * 0.01);
  if (r < epicChance) return 'epic';
  if (r < epicChance + rareChance) return 'rare';
  if (r < epicChance + rareChance + uncommonChance) return 'uncommon';
  return 'common';
}

function rollTrait(quality: RecruitQuality): string | null {
  const traitChance = quality === 'epic' ? 0.9 : quality === 'rare' ? 0.6 : quality === 'uncommon' ? 0.35 : 0.15;
  if (Math.random() > traitChance) return null;
  const traitIds = Object.keys(RECRUIT_TRAITS);
  return traitIds[Math.floor(Math.random() * traitIds.length)];
}
