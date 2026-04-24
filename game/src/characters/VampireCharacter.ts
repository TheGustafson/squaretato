import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

/**
 * Vampire — risk/reward predator that thrives near death.
 *
 * Mechanical identity (all WASD-only, auto-aim/auto-fire, passive):
 *  - Blood Drain: every kill restores HP (crimsonFang boosts).
 *  - Frenzy: at/below threshold HP (default 30%, darkPact raises to 50%), gain
 *    +200% damage (3x) and +50% fire rate, +50% move speed. Visible red aura.
 *  - Blood Bank meter: fills with kills (and partially with damage dealt).
 *    When full, auto-detonates a radial Blood Burst that damages nearby enemies
 *    and heals the Vampire for 1 HP. Capacity: 10 (bloodChalice x2).
 *  - Thirst: when Blood Bank is empty AND HP > frenzyThreshold, bleed 0.25 HP/s
 *    — you are never comfortable. Pushes aggressive play.
 */
export class VampireCharacter extends BaseCharacter {
  bloodBank: number;
  isFrenzied: boolean;
  frenzyApplied: boolean;
  preFrencySpeed: number;

  // Cached item effects (computed onStartLevel)
  bloodDrainPerKill: number;
  frenzyThreshold: number;
  bloodBankCapacity: number;
  bloodPerKill: number;

  // Burst visual flash after auto-detonation.
  bloodBurstFlash: number;
  // Pulse on frenzy enter.
  frenzyEnterFlash: number;
  totalBloodBursts: number;

  constructor() {
    super();
    this.bloodBank = 0;
    this.isFrenzied = false;
    this.frenzyApplied = false;
    this.preFrencySpeed = 0;
    this.bloodDrainPerKill = 0.3;
    this.frenzyThreshold = 0.3;
    this.bloodBankCapacity = 10;
    this.bloodPerKill = 0.5;
    this.bloodBurstFlash = 0;
    this.frenzyEnterFlash = 0;
    this.totalBloodBursts = 0;
  }

  getId(): string { return 'vampire'; }
  getName(): string { return 'The Vampire'; }
  getDescription(): string {
    return 'Weapon-based lifesteal diver. Kills + damage fill the Blood Bank; at cap, auto-triggers a radial blood-burst (heals you, damages enemies). THIRST bleeds 0.25 HP/s when the bank is empty and HP is above the frenzy threshold — keep killing or die. Frenzy under 30% HP: +200% damage, +50% speed/fire rate. Shop: Weapons + Items (no spells, no regen).';
  }
  getColor(): string { return '#8B0000'; }

  getAvailableItems(): string[] {
    // Vampire can't buy health upgrades (design), so items lean heavily into
    // damage/fire-rate/sustain-on-hit. proteinBar + tankArmor + reinforcedPlating
    // still work — they set stats.health directly, bypassing the upgrade gate.
    return [
      // Vampire exclusives
      'crimsonFang', 'darkPact', 'bloodChalice',
      // Offense & sustain
      // `bandaidPack` intentionally excluded — Vampire has canBuyRegeneration()
      // false and base regeneration 0, so stat.regeneration is never consumed.
      'luckyCoin', 'energyDrink', 'proteinBar', 'sharpTips', 'quickHands',
      'coffeeShot', 'moneyMagnet', 'luckyPenny', 'speedBoots',
      'sharpShooter', 'rapidReload', 'magnetGloves', 'criticalEye',
      'heavyRounds', 'shieldGenerator', 'adrenalineRush', 'doubleTap',
      'bounceHouse', 'vampiric', 'lifeSteal', 'bloodPact',
      'sniperScope', 'evasionTraining', 'prospectorsCharm', 'explosiveRounds',
      'tankArmor', 'reinforcedPlating',
    ];
  }

  getBaseStats(): PlayerStats {
    return {
      health: 8,
      speed: BALANCE.player.baseSpeed,
      damage: BALANCE.player.baseDamage * 1.5,
      fireRate: BALANCE.player.baseFireRate,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: 0,
    };
  }

  getStartingWeapons(): string[] { return ['pistol']; }
  getShopTabs(): string[] { return ['weapons', 'items']; }
  getMaxWeapons(): number { return 8; }
  getUpgradePool(): string[] {
    return [
      'speed', 'damage', 'fireRate', 'dodge', 'luck', 'critChance', 'critDamage',
      'bloodDrain', 'frenzyThreshold', 'bloodBankCapacity',
    ];
  }
  canBuyHealthUpgrades(): boolean { return false; }
  canBuyRegeneration(): boolean { return false; }

  // Each Blood Burst in a wave makes the next one 1.5× harder to fill.
  getEffectiveBloodBankCapacity(): number {
    return this.bloodBankCapacity * Math.pow(1.5, this.totalBloodBursts);
  }

  onStartLevel(game: GameAPI): void {
    const gameState = game.getGameState();
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    // Restore mid-run Vampire state from persisted `_`-prefixed extras if
    // present (set in onLevelEnd). Defaults to 0 for a fresh run.
    this.bloodBank = typeof charData._bloodBank === 'number' ? charData._bloodBank : 0;
    this.isFrenzied = false;
    this.frenzyApplied = false;
    this.bloodBurstFlash = 0;
    this.frenzyEnterFlash = 0;
    this.totalBloodBursts = 0;

    const items = gameState.playerData.items || [];
    const stats = gameState.playerData.stats;

    // crimsonFang boosts per-kill HP drain AND bank fill (you bite harder, you get more blood).
    const fangMult = items.includes('crimsonFang') ? 1.5 : 1.0;
    this.bloodDrainPerKill = 0.3 * fangMult + (stats.bloodDrainBonus || 0);
    this.bloodPerKill = 0.5 * fangMult;

    // darkPact: threshold 0.3 -> 0.5. Plus upgrade adds.
    const pactThreshold = items.includes('darkPact') ? 0.5 : 0.3;
    this.frenzyThreshold = Math.min(0.9, pactThreshold + (stats.frenzyThresholdBonus || 0));

    // bloodChalice: 2x capacity. Plus upgrade +2 per stack.
    const baseCap = 10;
    const chaliceMult = items.includes('bloodChalice') ? 2.0 : 1.0;
    this.bloodBankCapacity = baseCap * chaliceMult + (stats.bloodBankCapacityBonus || 0);
  }

  onLevelEnd(game?: GameAPI): void {
    // Persist mid-wave Blood Bank so save-and-quit + resume doesn't reset it.
    // Frenzy state (isFrenzied/preFrencySpeed) intentionally NOT persisted —
    // those derive from current HP/speed which are already saved elsewhere.
    if (game) {
      const charData = game.getGameState().playerData as unknown as Record<string, unknown>;
      charData._bloodBank = this.bloodBank;
    }
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    const player = game.getPlayer();
    if (!player || !player.alive) return;

    if (this.bloodBurstFlash > 0) this.bloodBurstFlash -= deltaTime;
    if (this.frenzyEnterFlash > 0) this.frenzyEnterFlash -= deltaTime;

    // Thirst: when the bank is empty and HP isn't critical, bleed slowly.
    // Creates constant pressure to keep killing even when safe.
    const hpPercent = player.health / Math.max(1, player.maxHealth);
    if (this.bloodBank <= 0 && hpPercent > this.frenzyThreshold) {
      player.health -= 0.25 * deltaTime;
      if (player.health <= 0) {
        player.health = 0;
        player.alive = false;
        return;
      }
    }

    // Frenzy toggling.
    if (hpPercent <= this.frenzyThreshold && !this.frenzyApplied) {
      this.isFrenzied = true;
      this.frenzyApplied = true;
      this.preFrencySpeed = player.speed;
      player.speed *= 1.5;
      this.frenzyEnterFlash = 0.6;
      const effects = game.getEffectsSystem();
      if (effects) {
        effects.addScreenShake(6, 0.25);
        effects.floatingTexts.push({
          x: player.position.x,
          y: player.position.y - 40,
          text: 'FRENZY!',
          color: '#FF2222',
          life: 1.0,
          vy: -40,
          fontSize: 18,
        });
      }
    } else if (hpPercent > this.frenzyThreshold && this.frenzyApplied) {
      this.isFrenzied = false;
      this.frenzyApplied = false;
      player.speed = this.preFrencySpeed || player.speed / 1.5;
    }

    // Blood Burst: auto-detonate when the bank reaches capacity.
    if (this.bloodBank >= this.getEffectiveBloodBankCapacity()) {
      this.activateBloodBank(game);
    }
  }

  onKill(game: GameAPI, _enemy: Enemy): void {
    const player = game.getPlayer();
    if (!player || !player.alive) return;
    // HP drain per kill.
    player.health = Math.min(player.maxHealth, player.health + this.bloodDrainPerKill);
    // Blood Bank fills faster during frenzy (desperate feeding).
    const fill = this.isFrenzied ? this.bloodPerKill * 1.5 : this.bloodPerKill;
    this.bloodBank = Math.min(this.getEffectiveBloodBankCapacity(), this.bloodBank + fill);
  }

  activateBloodBank(game: GameAPI): void {
    if (this.bloodBank < 1) return;
    const player = game.getPlayer();
    if (!player || !player.alive) return;

    const enemies = game.getEnemies();
    const effects = game.getEffectsSystem();
    // Burst damage scales with capacity (so chalice makes it meaner).
    const damage = Math.max(3, Math.floor(this.bloodBankCapacity * 1.2));
    const radius = 150 + (this.bloodBankCapacity - 10) * 3; // chalice widens radius

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        // Use takeDamage so damage numbers, hit flashes, and splitter-on-death
        // spawns fire through the standard flow.
        enemy.takeDamage(damage);
      }
    }

    // Heal on burst — drinking the spoils.
    player.health = Math.min(player.maxHealth, player.health + 1);

    if (effects) {
      effects.addExplosion(player.position.x, player.position.y, radius, '#8B0000');
      effects.addScreenShake(8, 0.3);
      effects.floatingTexts.push({
        x: player.position.x, y: player.position.y - 30,
        text: 'BLOOD BURST!', color: '#FF2222', life: 1.2, vy: -30, fontSize: 16,
      });
    }
    this.bloodBank = 0;
    this.bloodBurstFlash = 0.8;
    this.totalBloodBursts++;
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;
    ctx.save();

    // Frenzy aura.
    if (this.isFrenzied) {
      const pulse = Math.sin(Date.now() * 0.01) * 0.4 + 0.6;
      ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 3,
        player.position.y - player.size / 2 - 3,
        player.size + 6,
        player.size + 6
      );
    }

    // Frenzy-enter expanding ring.
    if (this.frenzyEnterFlash > 0) {
      const t = 1 - this.frenzyEnterFlash / 0.6;
      const r = player.size / 2 + 4 + t * 40;
      ctx.strokeStyle = `rgba(255, 40, 40, ${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Blood Burst flash ring.
    if (this.bloodBurstFlash > 0) {
      const flashA = this.bloodBurstFlash / 0.8;
      const pulse = Math.sin(Date.now() * 0.025) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(255, 30, 30, ${flashA * pulse})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 4,
        player.position.y - player.size / 2 - 4,
        player.size + 8,
        player.size + 8
      );
    }

    this.renderBloodBankBar(ctx, player);

    // Corner FRENZY indicator (HUD-style).
    if (this.isFrenzied) {
      const pulse = Math.sin(Date.now() * 0.012) * 0.35 + 0.65;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = `rgba(255, 40, 40, ${pulse})`;
      ctx.fillText('FRENZY ACTIVE', ctx.canvas.width - 12, 40);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
  }

  renderBloodBankBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    // Background.
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.min(1, this.bloodBank / this.getEffectiveBloodBankCapacity());
    if (pct > 0) {
      const r = Math.floor(139 + 116 * pct);
      const g = Math.floor(20 * (1 - pct));
      ctx.fillStyle = `rgb(${r}, ${g}, ${g})`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    // Border, brighter near cap.
    ctx.strokeStyle = pct > 0.8 ? '#FF2222' : '#551111';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    if (this.bloodBurstFlash > 0) {
      const flashA = this.bloodBurstFlash / 0.8;
      ctx.fillStyle = `rgba(255, 40, 40, ${flashA * 0.7})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    // Label.
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.bloodBurstFlash > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('BLOOD BURST!', player.position.x, barY + barH / 2);
    } else {
      ctx.fillStyle = '#FFDDDD';
      ctx.fillText(
        `Blood ${Math.floor(this.bloodBank)}/${Math.floor(this.getEffectiveBloodBankCapacity())}`,
        player.position.x,
        barY + barH / 2,
      );
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';
  }

  getDamageMultiplier(): number {
    return this.isFrenzied ? 3.0 : 1.0;
  }

  getFireRateMultiplier(): number {
    return this.isFrenzied ? 1.5 : 1.0;
  }
}
