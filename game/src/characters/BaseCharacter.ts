import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

/**
 * Base class for all playable characters. Subclasses override hooks and
 * identity getters to inject character-specific behavior into the game loop.
 *
 * All hooks have safe no-op / identity defaults so subclasses only need to
 * implement what they actually care about.
 */
export class BaseCharacter {
  // ---- Identity ----
  /** Unique id used for save data and character selection. */
  getId(): string { throw new Error('must implement getId()'); }
  /** Display name shown in UI. */
  getName(): string { throw new Error('must implement getName()'); }
  /** Short flavor / mechanic description shown on the select screen. */
  getDescription(): string { return ''; }
  /** Primary tint used for the player sprite and themed UI. */
  getColor(): string { return '#00FF00'; }

  // ---- Base configuration ----
  /** Starting stat block before upgrades / items. */
  getBaseStats(): PlayerStats {
    return {
      health: BALANCE.player.baseHealth,
      speed: BALANCE.player.baseSpeed,
      damage: BALANCE.player.baseDamage,
      fireRate: BALANCE.player.baseFireRate,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  /** Player hitbox / sprite size. */
  getPlayerSize(): number { return BALANCE.player.size; }
  /** Weapon ids granted at run start. */
  getStartingWeapons(): string[] { return []; }
  /** Spell ids granted at run start; null means character does not use spells. */
  getStartingSpells(): string[] | null { return null; }
  /** Whitelist of weapons that may appear in shop; null means no restriction. */
  getAvailableWeapons(): string[] | null { return null; }
  /** Whitelist of items that may appear in shop; null means no restriction. */
  getAvailableItems(): string[] | null { return null; }
  /** Tabs exposed in the shop UI for this character. */
  getShopTabs(): string[] { return ['items']; }
  /** Maximum simultaneous weapons the character can hold. */
  getMaxWeapons(): number { return 0; }
  /** Upgrade keys valid for this character's level-up / shop pools. */
  getUpgradePool(): string[] { return ['health', 'speed', 'dodge', 'luck', 'regeneration']; }

  // ---- Lifecycle hooks ----
  /** Called when a level / wave begins. Use for per-level setup. */
  onStartLevel(_game: GameAPI): void {}
  /** Called when a level ends (success or failure). Use for cleanup. */
  onLevelEnd(_game?: GameAPI): void {}
  /** Called every tick during active play, before systems run. */
  onUpdate(_game: GameAPI, _deltaTime: number): void {}
  /**
   * Called every tick AFTER the main update / systems have run. Use for
   * late-phase effects (e.g. post-movement corrections, trails, auras that
   * need final positions).
   */
  onPostUpdate(_game: GameAPI, _deltaTime: number): void {}
  /** Called when the player kills an enemy. */
  onKill(_game: GameAPI, _enemy: Enemy): void {}
  /**
   * Called before damage is applied to the player. Returning a different
   * number modifies (or nullifies) the incoming damage.
   */
  onDamage(_game: GameAPI, amount: number): number { return amount; }
  /** Called during the player render pass for custom visuals. */
  onRender(_ctx: CanvasRenderingContext2D, _player: Player): void {}
  /** Called when a wave is cleared. */
  onWaveComplete(_game: GameAPI, _waveNumber: number): void {}

  // ---- Multipliers (identity defaults) ----
  /** Global damage multiplier applied on top of stat damage. */
  getDamageMultiplier(): number { return 1; }
  /** Global fire rate multiplier applied on top of stat fire rate. */
  getFireRateMultiplier(): number { return 1; }
  /** Global movement speed multiplier applied on top of stat speed. */
  getSpeedMultiplier(): number { return 1; }

  // ---- Reporting ----
  /** Extra rows shown on the round summary screen. */
  getRoundSummary(): { label: string; value: string }[] { return []; }

  // ---- Shop gating ----
  canBuyHealthUpgrades(): boolean { return true; }
  canBuyRegeneration(): boolean { return true; }
  getMaxHealthUpgrades(): number { return Infinity; }
  /**
   * Per-character maximum HP after upgrades. Characters that want to grow much
   * larger (Hulk) override this. Returns null to use BALANCE.upgrades.health.maxValue.
   */
  getMaxHealthValue(): number | null { return null; }
}
