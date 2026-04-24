export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlayerStats {
  health: number;
  speed: number;
  damage: number;
  fireRate: number;
  dodge: number;
  luck: number;
  critChance: number;
  critDamage: number;
  pickupRange: number;
  regeneration: number;
  spellPower?: number;
  cooldownReduction?: number;
  cooldownSpeed?: number;
  // Character-specific bonuses (optional for save migration). Items and
  // upgrades write these dynamically; reads should use `?? 0` defaults.
  // --- Hulk
  slamRadiusBonus?: number;
  fistSwingSpeedBonus?: number;
  armor?: number;
  // --- Vampire
  bloodDrainBonus?: number;
  frenzyThresholdBonus?: number;
  bloodBankCapacityBonus?: number;
  // --- Speedster
  afterimageDamageBonus?: number;
  dashDistanceBonus?: number;
  timeDilationDurationBonus?: number;
  // --- Manager
  recruitDamageBonus?: number;
  recruitHealthBonus?: number;
  recruitSpeedBonus?: number;
  synergyBonus?: number;
  // --- Capitalist
  productionSpeedBonus?: number;
  dividendRateBonus?: number;
  structureHealthBonus?: number;
  // --- Fighter
  burstDurationBonus?: number;
  momentumDecayRateBonus?: number;
}

export interface UpgradePurchases {
  health: number;
  speed: number;
  damage: number;
  fireRate: number;
  dodge: number;
  luck: number;
  critChance: number;
  critDamage: number;
  regeneration: number;
  [key: string]: number;
}

export interface CharacterSaveData {
  money: number;
  highestWave: number;
  stats: PlayerStats;
  upgradePurchases: UpgradePurchases;
  weapons: string[];
  weaponLevels: Record<string, number>;
  items: string[];
  itemStacks: Record<string, number>;
  spells?: string[] | null;
  spellLevels?: Record<string, number> | null;
}

export interface MetaData {
  prestigePoints: number;
  totalKills: number;
  totalMoneyEarned: number;
  totalWavesSurvived: number;
  unlockedCharacters: string[];
  achievements: string[];
  // Lifetime stats (optional — loaded with safe defaults)
  lifetimeKills?: number;
  lifetimeMoney?: number;
  lifetimePlaytimeSeconds?: number;
  lifetimeRuns?: number;
  lifetimeWins?: number;
  lifetimeDeaths?: number;
  lifetimePpEarned?: number;
  perCharacterStats?: Record<string, PerCharacterStats>;
  // Tutorial flags (tracked per-slot meta)
  tutorialFlags?: Record<string, boolean>;
  // Per-run transient trackers (runtime, may appear on meta between events)
  achievementCounters?: Record<string, number>;
}

export interface PerCharacterStats {
  runs: number;
  wins: number;
  deaths: number;
  bestWave: number;
  kills: number;
  playtimeSeconds: number;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementReward {
  prestigePoints?: number;
  character?: string;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  hidden?: boolean;
  reward?: AchievementReward;
  // Optional progress target used by UI (purely display)
  progressTarget?: number;
  // Name of numeric meta/meta counter field that tracks progress (display only)
  progressField?: string;
}

export interface AchievementToastItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  rewardPp: number;
  // runtime animation state
  age: number;
  life: number;
  y: number;
  targetY: number;
}

export interface SettingsData {
  controlScheme: string;
  aimMode: string;
  musicEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export type RunPhase = 'shop' | 'upgrade' | 'levelSelect';

export interface RunState {
  characterId: string;
  currentWave: number;
  money: number;
  stats: PlayerStats;
  weapons: string[];
  weaponLevels: Record<string, number>;
  items: string[];
  itemStacks: Record<string, number>;
  spells?: string[] | null;
  spellLevels?: Record<string, number> | null;
  phase: RunPhase;
  // Underscore-prefixed transient character state gets copied here between
  // phases (shop/upgrade/levelSelect). Kept as `unknown` because it's a
  // heterogeneous bag; consumers must narrow at the read site.
  extras?: Record<string, unknown>;
}

export interface SlotData {
  empty: boolean;
  createdAt: number;
  updatedAt: number;
  playtimeSeconds: number;
  selectedCharacter: string;
  meta: MetaData;
  characters: Record<string, CharacterSaveData>;
  activeRun: RunState | null;
  snapshot: {
    highestWave: number;
    prestigePoints: number;
    unlockedCount: number;
  };
}

export interface SaveData {
  version: number;
  settings: SettingsData;
  slots: SlotData[];
  // Backward-compat accessors (proxied to active slot)
  selectedCharacter?: string;
  meta?: MetaData;
  characters?: Record<string, CharacterSaveData>;
}

export interface PlayerData extends CharacterSaveData {
  unlockedLevels: number;
  controlScheme: string;
  aimMode: string;
  musicEnabled: boolean;
}

export type ShopTab =
  | 'weapons'
  | 'items'
  | 'spells'
  | 'recruit'
  | 'roster'
  | 'equipment'
  | 'businesses'
  | 'stocks';

export type EnemyType = 'basic' | 'tracker' | 'tank' | 'shooter' | 'wave' | 'boss' | 'zoomer' | 'splitter' | 'sporeling' | 'charger' | 'sniper' | 'exploder';

export type EnemyBehavior = 'bouncer' | 'tracker' | 'tank' | 'shooter' | 'wave' | 'boss' | 'zoomer' | 'charger' | 'sniper' | 'exploder';

export type ProjectileOwner = 'player' | 'enemy';

export type PickupType = 'money' | 'health';

export type AimMode = 'auto' | 'manual';

export type GameStateName =
  | 'MENU' | 'LEVEL_SELECT' | 'CHARACTER_SELECT'
  | 'PLAYING' | 'PAUSED' | 'ROUND_COMPLETE' | 'GAME_OVER' | 'RUN_COMPLETE';

export interface GameCanvas extends HTMLCanvasElement {
  logicalWidth: number;
  logicalHeight: number;
}

export interface GameAPI {
  getPlayer(): import('./entities/Player').Player | null;
  getEnemies(): import('./entities/Enemy').Enemy[];
  getEffectsSystem(): import('./systems/EffectsSystem').EffectsSystem;
  getSoundSystem(): import('./systems/SoundSystem').SoundSystem;
  getWeaponSystem(): import('./systems/WeaponSystem').WeaponSystem;
  getGameState(): import('./systems/GameState').GameState;
  getCanvas(): GameCanvas;
  getCurrentLevel(): number;
  getProjectiles(): import('./entities/Projectile').Projectile[];
  getPickups(): import('./entities/Pickup').Pickup[];
  recordDamage(sourceId: string, amount: number): void;
  spawnMoneyPickup(x: number, y: number, value: number, fromBusiness?: boolean): void;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy?: number;
  fontSize?: number;
  size?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
  fade?: boolean;
  trail?: boolean;
  lightning?: boolean;
  glow?: boolean;
  segment?: { x1: number; y1: number; x2: number; y2: number };
}

export interface Flash {
  color: string;
  duration: number;
  maxDuration: number;
}
