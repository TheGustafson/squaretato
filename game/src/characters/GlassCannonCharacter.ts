import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

/**
 * Glass Cannon — fragile speedster who kills before being touched.
 *
 * Mechanical identity (WASD-only, no active abilities):
 *  - 2 base HP, 2x speed, 2x damage, 2x fire rate.
 *  - Kill Streak: each kill grants stacking fire-rate bonus (cap +50% at 10 kills).
 *  - DEADEYE buildup bar: fills with kills. At cap (10) the next burst auto-triggers
 *    DEADEYE state: 3s of +100% damage with gold aura. Any damage taken ends DEADEYE
 *    immediately and resets the streak — you must stay untouchable to cash in.
 *  - Post-hit i-frames: 0.6s of invulnerability after taking damage — survivability
 *    tax so 2 HP + swarms isn't instant death from a single stacked collision.
 *  - ONE MORE HIT HUD warning at 1 HP.
 *
 * Shop access: full generic item list so the player can scale survivability AND
 * offense. Crucially tankArmor + shieldGenerator + adrenalineRush help glass
 * survive the ramp; doubleTap / heavyRounds / lifeSteal amplify the cannon side.
 */
export class GlassCannonCharacter extends BaseCharacter {
  killStreak: number;
  streakCap: number;
  streakBonus: number;
  _lastPlayerHp: number;
  _baseFireRate: number;

  // Deadeye burst state (buildup meter).
  deadeyeActive: boolean;
  deadeyeTimer: number;
  deadeyeDuration: number;
  deadeyeEndFlash: number;
  totalDeadeyes: number;

  // Cached damage multiplier exposed to game.ts / weaponSystem.
  _cachedDamageMult: number;

  // Post-hit invulnerability timer.
  iFrameTimer: number;

  constructor() {
    super();
    this.killStreak = 0;
    this.streakCap = 10;
    this.streakBonus = 0;
    this._lastPlayerHp = 0;
    this._baseFireRate = 0;
    this.deadeyeActive = false;
    this.deadeyeTimer = 0;
    this.deadeyeDuration = 3;
    this.deadeyeEndFlash = 0;
    this.totalDeadeyes = 0;
    this._cachedDamageMult = 1;
    this.iFrameTimer = 0;
  }

  // Each Deadeye in a wave makes the next cap 1.5× harder to reach (rounded up).
  getEffectiveStreakCap(): number {
    return Math.ceil(this.streakCap * Math.pow(1.5, this.totalDeadeyes));
  }

  getId(): string { return 'glassCannon'; }
  getName(): string { return 'Glass Cannon'; }
  getDescription(): string {
    return '2 HP. 2× damage, 2× speed, 2× fire rate baseline. Consecutive kills stack a Kill Streak meter that scales crit; any hit taken resets the streak. Max-streak triggers Deadeye burst. Shop: weapons + offensive items. Highest skill ceiling — one mistake ends the run.';
  }
  getColor(): string { return '#FF3333'; }

  getAvailableItems(): string[] {
    // GC keeps full generic menu. Added sniperScope/evasionTraining for more
    // defensive layers; explosiveRounds for AoE clutch plays; reinforcedPlating
    // since 5 HP upgrades + 8 flat HP from this item can turn 2->15 HP late.
    return [
      'luckyCoin', 'energyDrink', 'proteinBar', 'sharpTips', 'quickHands',
      'bandaidPack', 'coffeeShot', 'moneyMagnet', 'luckyPenny', 'speedBoots',
      'sharpShooter', 'rapidReload', 'magnetGloves', 'criticalEye',
      'heavyRounds', 'shieldGenerator', 'adrenalineRush', 'doubleTap',
      'bounceHouse', 'vampiric', 'lifeSteal', 'bloodPact', 'tankArmor',
      'reinforcedPlating', 'sniperScope', 'evasionTraining', 'prospectorsCharm',
      'explosiveRounds',
    ];
  }

  getBaseStats(): PlayerStats {
    return {
      health: 2,
      speed: BALANCE.player.baseSpeed * 2,
      damage: BALANCE.player.baseDamage * 2,
      fireRate: BALANCE.player.baseFireRate * 2,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getStartingWeapons(): string[] { return ['smg']; }
  getShopTabs(): string[] { return ['weapons', 'items']; }
  getMaxWeapons(): number { return 8; }
  getUpgradePool(): string[] { return ['health', 'speed', 'damage', 'fireRate', 'dodge', 'luck', 'critChance', 'critDamage', 'regeneration']; }
  canBuyHealthUpgrades(): boolean { return true; }
  getMaxHealthUpgrades(): number { return 5; }
  getPlayerSize(): number { return 28; }

  getDamageMultiplier(): number { return this._cachedDamageMult; }
  getFireRateMultiplier(): number { return 1; }

  onStartLevel(game: GameAPI): void {
    this.killStreak = 0;
    this.streakBonus = 0;
    this.deadeyeActive = false;
    this.deadeyeTimer = 0;
    this.deadeyeEndFlash = 0;
    this.totalDeadeyes = 0;
    this._cachedDamageMult = 1;
    this.iFrameTimer = 0;
    const p = game.getPlayer();
    this._lastPlayerHp = p ? p.health : 0;
    const stats = game.getGameState().playerData.stats;
    this._baseFireRate = stats.fireRate || BALANCE.player.baseFireRate;
  }

  onLevelEnd(game?: GameAPI): void {
    if (game && this._baseFireRate > 0) {
      const stats = game.getGameState().playerData.stats;
      stats.fireRate = this._baseFireRate;
    }
    this.killStreak = 0;
    this.streakBonus = 0;
    this.deadeyeActive = false;
    this.deadeyeTimer = 0;
    this.deadeyeEndFlash = 0;
    this._cachedDamageMult = 1;
    this.iFrameTimer = 0;
    this._lastPlayerHp = 0;
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    const p = game.getPlayer();
    if (!p) return;

    if (this.deadeyeEndFlash > 0) this.deadeyeEndFlash -= deltaTime;
    if (this.iFrameTimer > 0) this.iFrameTimer -= deltaTime;

    if (this.deadeyeActive) {
      this.deadeyeTimer -= deltaTime;
      if (this.deadeyeTimer <= 0) {
        this.deadeyeActive = false;
        this.deadeyeEndFlash = 0.5;
      }
    }

    // Damage-taken detection: reset streak, drop DEADEYE, begin i-frames.
    if (p.health < this._lastPlayerHp - 0.001) {
      this.killStreak = 0;
      this.streakBonus = 0;
      this.deadeyeActive = false;
      this.deadeyeTimer = 0;
      this.applyStreakToPlayer(game);
      this.iFrameTimer = 0.6;
    }
    this._lastPlayerHp = p.health;

    this._cachedDamageMult = this.deadeyeActive ? 2.0 : 1.0;
  }

  onKill(game: GameAPI, _enemy: Enemy): void {
    const cap = this.getEffectiveStreakCap();
    if (this.killStreak < cap) {
      this.killStreak++;
      this.streakBonus = Math.min(0.5, this.killStreak * 0.05);
      this.applyStreakToPlayer(game);

      if (this.killStreak >= cap && !this.deadeyeActive) {
        this.deadeyeActive = true;
        this.deadeyeTimer = this.deadeyeDuration;
        this.totalDeadeyes++;
        const effects = game.getEffectsSystem();
        const player = game.getPlayer();
        if (effects && player) {
          effects.floatingTexts.push({
            x: player.position.x, y: player.position.y - 30,
            text: 'DEADEYE!', color: '#FFE066', life: 1.5, vy: -30, fontSize: 16,
          });
          effects.addScreenShake(4, 0.3, 'high');
          effects.addExplosion(player.position.x, player.position.y, 60, '#FFCC00');
        }
        game.getSoundSystem()?.play('levelUp');
      }
    }
  }

  onDamage(_game: GameAPI, amount: number): number {
    if (this.iFrameTimer > 0) return 0;
    return amount;
  }

  applyStreakToPlayer(game: GameAPI): void {
    const stats = game.getGameState().playerData.stats;
    if (this._baseFireRate <= 0) {
      this._baseFireRate = stats.fireRate || BALANCE.player.baseFireRate;
    }
    stats.fireRate = this._baseFireRate * (1 + this.streakBonus);
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;
    ctx.save();

    // ONE MORE HIT border.
    if (player.health <= 1) {
      const pulse = Math.sin(Date.now() * 0.015) * 0.3 + 0.55;
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, ctx.canvas.width - 6, ctx.canvas.height - 6);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 80, 80, ${pulse})`;
      ctx.fillText('ONE MORE HIT', ctx.canvas.width / 2, 22);
    }

    // DEADEYE pulsing outline.
    if (this.deadeyeActive) {
      const pulse = Math.sin(Date.now() * 0.018) * 0.35 + 0.6;
      ctx.strokeStyle = `rgba(255, 240, 160, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 3,
        player.position.y - player.size / 2 - 3,
        player.size + 6,
        player.size + 6,
      );
      // HUD-corner indicator.
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = `rgba(255, 220, 80, ${pulse})`;
      ctx.fillText(`DEADEYE ${this.deadeyeTimer.toFixed(1)}s`, ctx.canvas.width - 12, 40);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    } else if (this.killStreak >= this.getEffectiveStreakCap()) {
      // Latent primed glow.
      const pulse = Math.sin(Date.now() * 0.012) * 0.2 + 0.35;
      ctx.strokeStyle = `rgba(255, 200, 60, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 2,
        player.position.y - player.size / 2 - 2,
        player.size + 4,
        player.size + 4,
      );
    }

    // I-frame flicker.
    if (this.iFrameTimer > 0) {
      const flick = Math.floor(Date.now() * 0.04) % 2 === 0;
      if (flick) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          player.position.x - player.size / 2 - 2,
          player.position.y - player.size / 2 - 2,
          player.size + 4,
          player.size + 4,
        );
      }
    }

    this.renderStreakBar(ctx, player);

    ctx.restore();
  }

  renderStreakBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.min(1, this.killStreak / this.getEffectiveStreakCap());

    if (this.deadeyeActive) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#FFE066' : '#FFB020';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (pct > 0) {
      let r: number, g: number, b: number;
      if (pct < 0.5) {
        const t = pct / 0.5;
        r = Math.floor(80 + (255 - 80) * t);
        g = 220;
        b = Math.floor(255 * (1 - t));
      } else {
        const t = (pct - 0.5) / 0.5;
        r = 255;
        g = Math.floor(220 - 100 * t);
        b = 0;
      }
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    ctx.strokeStyle = this.deadeyeActive ? '#FFE066' : (pct >= 1 ? '#FFB020' : '#333355');
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    if (this.deadeyeEndFlash > 0) {
      const flashA = this.deadeyeEndFlash / 0.5;
      ctx.fillStyle = `rgba(255, 240, 160, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.deadeyeActive) {
      ctx.fillStyle = '#000000';
      ctx.fillText(`DEADEYE ${this.deadeyeTimer.toFixed(1)}s`, player.position.x, barY + barH / 2);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`Streak ${this.killStreak}/${this.getEffectiveStreakCap()}`, player.position.x, barY + barH / 2);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';
  }
}
