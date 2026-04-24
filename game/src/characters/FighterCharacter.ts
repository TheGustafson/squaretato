import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

export class FighterCharacter extends BaseCharacter {
  momentum: number;
  momentumMax: number;
  momentumDecay: number;
  momentumPerKill: number;
  momentumBurstActive: boolean;
  momentumBurstTimer: number;

  veteranStacks: number;
  adrenalineTimer: number;
  stimulantTimer: number;
  waveKills: number;
  tacticalMagTimer: number;
  hasTacticalMag: boolean;
  hasDogTags: boolean;
  hasCombatStimulant: boolean;
  hasFieldCommander: boolean;
  hasIronWill: boolean;
  hasVeteranCrest: boolean;
  hasMomentumCoil: boolean;
  burstEndFlash: number;
  burstStartFlash: number;
  totalBursts: number;
  totalTacticalProcs: number;

  constructor() {
    super();
    this.momentum = 0;
    this.momentumMax = 100;
    this.momentumDecay = 6;
    this.momentumPerKill = 18;
    this.momentumBurstActive = false;
    this.momentumBurstTimer = 0;
    this.veteranStacks = 0;
    this.adrenalineTimer = 0;
    this.stimulantTimer = 0;
    this.waveKills = 0;
    this.tacticalMagTimer = 0;
    this.hasTacticalMag = false;
    this.hasDogTags = false;
    this.hasCombatStimulant = false;
    this.hasFieldCommander = false;
    this.hasIronWill = false;
    this.hasVeteranCrest = false;
    this.hasMomentumCoil = false;
    this.burstEndFlash = 0;
    this.burstStartFlash = 0;
    this.totalBursts = 0;
    this.totalTacticalProcs = 0;
  }

  getId(): string { return 'fighter'; }
  getName(): string { return 'The Fighter'; }
  getDescription(): string {
    return 'Balanced starter. Kills fill Momentum; at full meter trigger Burst (+100% fire rate, +25% damage, 4s). Each Burst in a wave raises the next threshold by 1.5×. Shop: weapons + combat items. Stack weapons and run the crowd down.';
  }
  getColor(): string { return '#00FF00'; }

  getBaseStats(): PlayerStats {
    return {
      health: 25,
      speed: BALANCE.player.baseSpeed,
      damage: BALANCE.player.baseDamage,
      fireRate: BALANCE.player.baseFireRate,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: 8,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getStartingWeapons(): string[] { return ['pistol']; }
  getShopTabs(): string[] { return ['weapons', 'items']; }
  getMaxWeapons(): number { return 8; }
  // Fighter is a balanced all-rounder: lift the global 50-HP cap to 120 so late-run
  // HP stacking is actually achievable. Still tankier-than-glass but not a Hulk.
  getMaxHealthValue(): number { return 120; }

  getUpgradePool(): string[] {
    // Removed 'pickupRange' — not wired as an upgrade stat, diluting the pool.
    // Fighter wants the full generic offense/defense menu plus his identity
    // meta-stats (burst duration, momentum decay).
    return [
      'health', 'speed', 'damage', 'fireRate', 'dodge', 'luck',
      'critChance', 'critDamage', 'regeneration',
      'burstDuration', 'momentumDecayRate',
    ];
  }

  getAvailableItems(): string[] {
    return [
      // Fighter exclusives
      'dogTags', 'tacticalMag', 'fieldCommander', 'combatStimulant',
      'ironWill', 'veteranCrest', 'momentumCoil',
      // Generic / runtime-wired
      'luckyCoin', 'energyDrink', 'proteinBar', 'sharpTips', 'quickHands',
      'bandaidPack', 'coffeeShot', 'moneyMagnet', 'luckyPenny', 'speedBoots',
      'sharpShooter', 'tankArmor', 'rapidReload', 'magnetGloves', 'criticalEye',
      'heavyRounds', 'shieldGenerator', 'adrenalineRush', 'doubleTap',
      'bounceHouse', 'vampiric', 'explosiveRounds', 'lifeSteal', 'bloodPact',
      // `glassCannon` item intentionally excluded — halving Fighter's HP is
      // strictly worse than `ironWill` ($450, +25% dmg below 50% HP) and
      // actively hostile to the character's "survive long enough to Burst" loop.
      'reinforcedPlating', 'sniperScope', 'evasionTraining',
      'prospectorsCharm',
    ];
  }

  onStartLevel(game: GameAPI): void {
    // Start wave 1 with a small priming of momentum so the bar is immediately
    // visible and expressive. Kicks the player into combat mood from second 0.
    this.momentum = 20;
    this.momentumBurstActive = false;
    this.momentumBurstTimer = 0;
    this.adrenalineTimer = 0;
    this.waveKills = 0;
    this.tacticalMagTimer = 0;
    this.totalBursts = 0;
    this.totalTacticalProcs = 0;
    this.burstEndFlash = 0;
    this.burstStartFlash = 0;

    const gameState = game.getGameState();
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    // Restore veteran stacks from persistence on non-wave-1 loads. On a fresh
    // wave-1 start, reset to 0. Previously `veteranStacks` lived only on the
    // shared Fighter singleton instance and was silently zeroed on reload.
    if (gameState.currentLevel <= 1) {
      this.veteranStacks = 0;
    } else {
      this.veteranStacks = typeof charData._veteranStacks === 'number' ? charData._veteranStacks : this.veteranStacks;
    }

    const items = gameState.playerData.items || [];

    this.hasTacticalMag = items.includes('tacticalMag');
    this.hasDogTags = items.includes('dogTags');
    this.hasCombatStimulant = items.includes('combatStimulant');
    this.hasFieldCommander = items.includes('fieldCommander');
    this.hasIronWill = items.includes('ironWill');
    this.hasVeteranCrest = items.includes('veteranCrest');
    this.hasMomentumCoil = items.includes('momentumCoil');

    // Apply upgrade bonuses: burst duration + momentum decay rate.
    const statsRec = gameState.playerData.stats;
    const burstBonus = statsRec.burstDurationBonus || 0;
    // Veteran's Crest: +5% burst duration per veteran stack.
    const crestMult = this.hasVeteranCrest ? 1 + 0.05 * this.veteranStacks : 1;
    this._burstDurationEffective = (4 + burstBonus) * crestMult;

    // momentumDecayRateBonus is negative to slow decay; clamp to not go below 0.1x base.
    let decayMult = Math.max(0.1, 1 + (statsRec.momentumDecayRateBonus || 0));
    if (this.hasMomentumCoil) decayMult *= 0.5;
    this.momentumDecay = 6 * decayMult;

    // Momentum Coil: +2 bonus momentum per kill (stacks with base).
    this.momentumPerKill = 18 + (this.hasMomentumCoil ? 2 : 0);

    this.stimulantTimer = this.hasCombatStimulant ? 5 : 0;

    this._fieldCommanderBonus = 0;
    const weaponCount = (gameState.playerData.weapons || []).length;
    if (this.hasFieldCommander && weaponCount > 0) {
      this._fieldCommanderBonus = 0.05 * weaponCount;
    }
  }

  _fieldCommanderBonus: number = 0;
  _cachedDamageMult: number = 1;
  _cachedFireRateMult: number = 1;
  _burstDurationEffective: number = 4;

  getDamageMultiplier(): number { return this._cachedDamageMult; }
  getFireRateMultiplier(): number { return this._cachedFireRateMult; }

  onUpdate(game: GameAPI, deltaTime: number): void {
    if (this.stimulantTimer > 0) this.stimulantTimer -= deltaTime;
    if (this.adrenalineTimer > 0) this.adrenalineTimer -= deltaTime;
    if (this.tacticalMagTimer > 0) this.tacticalMagTimer -= deltaTime;
    if (this.burstEndFlash > 0) this.burstEndFlash -= deltaTime;
    if (this.burstStartFlash > 0) this.burstStartFlash -= deltaTime;

    if (this.momentumBurstActive) {
      this.momentumBurstTimer -= deltaTime;
      if (this.momentumBurstTimer <= 0) {
        this.momentumBurstActive = false;
        this.momentum = 0;
        this.burstEndFlash = 0.6;
      }
    } else {
      this.momentum = Math.max(0, this.momentum - this.momentumDecay * deltaTime);
    }

    const player = game.getPlayer();
    if (!player) return;

    // Iron Will: below 50% HP, +25% damage. Checked per-frame but no allocations.
    const ironWillActive = this.hasIronWill && player.health / Math.max(1, player.maxHealth) < 0.5;

    let fireRateMult = 1.0;
    if (this.momentumBurstActive) fireRateMult *= 2.0;
    if (this.stimulantTimer > 0) fireRateMult *= 2.0;
    if (this.adrenalineTimer > 0) fireRateMult *= 1.25;
    this._cachedFireRateMult = Math.min(fireRateMult, 4.0);

    let damageMult = 1.0;
    if (this.veteranStacks > 0) damageMult *= 1 + this.veteranStacks * 0.03;
    if (this._fieldCommanderBonus > 0) damageMult *= 1 + this._fieldCommanderBonus;
    if (this.tacticalMagTimer > 0) damageMult *= 3.0;
    if (this.momentumBurstActive) damageMult *= 1.25; // Burst gives +25% dmg on top of fire rate.
    if (ironWillActive) damageMult *= 1.25;
    this._cachedDamageMult = damageMult;
  }

  // Effective threshold to trigger Momentum Burst. Each burst within a round makes
  // the next one harder to earn — fixes late-round "always on" by gating repeats
  // behind geometrically more kills. Scale reset each wave in onStartLevel.
  getEffectiveMomentumMax(): number {
    return this.momentumMax * Math.pow(1.5, this.totalBursts);
  }

  onKill(game: GameAPI, _enemy: Enemy): void {
    this.waveKills++;

    if (!this.momentumBurstActive) {
      const cap = this.getEffectiveMomentumMax();
      this.momentum = Math.min(cap, this.momentum + this.momentumPerKill);
      if (this.momentum >= cap) {
        this.momentumBurstActive = true;
        this.momentumBurstTimer = this._burstDurationEffective;
        this.burstStartFlash = 0.35;
        this.totalBursts++;
        const effects = game.getEffectsSystem();
        const player = game.getPlayer();
        if (effects && player) {
          effects.floatingTexts.push({
            x: player.position.x, y: player.position.y - 34,
            text: 'MOMENTUM!', color: '#FFD700', life: 1.6, vy: -36, fontSize: 20
          });
          // Meatier feedback: bigger shake + kill-effect ring at player.
          effects.addScreenShake(8, 0.4, 'high');
          effects.addFlash('#FFD700', 0.12, 'high');
          effects.addExplosionEffect(player.position.x, player.position.y, 40);
        }
        game.getSoundSystem()?.play('levelUp');
      }
    }

    if (this.hasTacticalMag && this.waveKills % 10 === 0) {
      this.tacticalMagTimer = 3;
      this.totalTacticalProcs++;
      const effects = game.getEffectsSystem();
      const player = game.getPlayer();
      if (effects && player) {
        effects.floatingTexts.push({
          x: player.position.x, y: player.position.y - 20,
          text: 'TACTICAL!', color: '#FF4444', life: 1.0, vy: -25, fontSize: 12
        });
        effects.addScreenShake(3, 0.15);
      }
    }

    const player = game.getPlayer();
    if (!player) return;

    if (this.hasDogTags && player.health / Math.max(1, player.maxHealth) < 0.5) {
      player.health = Math.min(player.maxHealth, player.health + 0.5);
      const effects = game.getEffectsSystem();
      if (effects) {
        effects.floatingTexts.push({
          x: player.position.x + (Math.random() - 0.5) * 20,
          y: player.position.y - 10,
          text: '+0.5', color: '#44FF44', life: 0.6, vy: -15, fontSize: 8
        });
      }
    }
  }

  onDamage(game: GameAPI, amount: number): number {
    if (this.adrenalineTimer <= 0) {
      const effects = game.getEffectsSystem();
      const player = game.getPlayer();
      if (effects && player) {
        effects.floatingTexts.push({
          x: player.position.x, y: player.position.y - 15,
          text: 'ADRENALINE!', color: '#FF4444', life: 0.8, vy: -20, fontSize: 10
        });
      }
    }
    this.adrenalineTimer = 3;
    return amount;
  }

  onWaveComplete(game: GameAPI, _waveNumber: number): void {
    this.veteranStacks++;
    // Persist so save-and-quit mid-run doesn't silently wipe the accumulated
    // veteran damage bonus on next session's onStartLevel.
    const charData = game.getGameState().playerData as unknown as Record<string, unknown>;
    charData._veteranStacks = this.veteranStacks;
  }

  onLevelEnd(): void {
    this.momentum = 0;
    this.momentumBurstActive = false;
    this.momentumBurstTimer = 0;
    this.adrenalineTimer = 0;
    this.stimulantTimer = 0;
    this.tacticalMagTimer = 0;
    this.burstEndFlash = 0;
    this.burstStartFlash = 0;
  }

  getRoundSummary(): { label: string; value: string }[] {
    const stats: { label: string; value: string }[] = [];
    stats.push({ label: 'Kills', value: `${this.waveKills}` });
    stats.push({ label: 'Veteran Stacks', value: `${this.veteranStacks} (+${this.veteranStacks * 3}% DMG)` });
    if (this.totalBursts > 0) stats.push({ label: 'Momentum Bursts', value: `${this.totalBursts}` });
    if (this.totalTacticalProcs > 0) stats.push({ label: 'Tactical Procs', value: `${this.totalTacticalProcs}` });
    return stats;
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;
    ctx.save();

    this.renderHelmet(ctx, player);
    this.renderMomentumBar(ctx, player);
    this.renderHUD(ctx);

    // Burst-start flash: brief expanding white/gold ring around player.
    if (this.burstStartFlash > 0) {
      const t = 1 - this.burstStartFlash / 0.35; // 0 -> 1
      const radius = player.size / 2 + 4 + t * 24;
      ctx.strokeStyle = `rgba(255, 230, 120, ${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.momentumBurstActive) {
      const pulse = Math.sin(Date.now() * 0.02) * 0.35 + 0.55;
      // Double ring for meatier feel.
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 3,
        player.position.y - player.size / 2 - 3,
        player.size + 6,
        player.size + 6
      );
      ctx.strokeStyle = `rgba(255, 140, 0, ${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 6,
        player.position.y - player.size / 2 - 6,
        player.size + 12,
        player.size + 12
      );
    } else if (this.momentum >= this.getEffectiveMomentumMax() * 0.75) {
      const pulse = Math.sin(Date.now() * 0.01) * 0.15 + 0.25;
      ctx.strokeStyle = `rgba(255, 165, 0, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 2,
        player.position.y - player.size / 2 - 2,
        player.size + 4,
        player.size + 4
      );
    }

    if (this.tacticalMagTimer > 0) {
      const pulse = Math.sin(Date.now() * 0.02) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(255, 50, 50, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 4,
        player.position.y - player.size / 2 - 4,
        player.size + 8,
        player.size + 8
      );
    }

    if (this.adrenalineTimer > 0) {
      const a = Math.min(1, this.adrenalineTimer / 1);
      ctx.strokeStyle = `rgba(255, 50, 50, ${a * 0.5})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 1,
        player.position.y - player.size / 2 - 1,
        player.size + 2,
        player.size + 2
      );
    }

    // Iron Will low-health glow.
    if (this.hasIronWill && player.health / Math.max(1, player.maxHealth) < 0.5) {
      const pulse = Math.sin(Date.now() * 0.012) * 0.3 + 0.5;
      ctx.strokeStyle = `rgba(200, 40, 40, ${pulse * 0.8})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 5,
        player.position.y - player.size / 2 - 5,
        player.size + 10,
        player.size + 10
      );
    }

    if (this.veteranStacks > 0) {
      const px = player.position.x;
      const py = player.position.y + player.size / 2 + 14;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      if (this.veteranStacks <= 5) {
        ctx.fillText('*'.repeat(this.veteranStacks), px, py);
      } else {
        ctx.fillText(`*x${this.veteranStacks}`, px, py);
      }
    }

    ctx.restore();
  }

  renderHUD(ctx: CanvasRenderingContext2D): void {
    const hudX = 200;
    const hudY = 14;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';

    const buffs: { label: string; color: string }[] = [];
    if (this.momentumBurstActive) buffs.push({ label: 'BURST', color: '#FFD700' });
    if (this.stimulantTimer > 0) buffs.push({ label: 'STIM', color: '#44FF44' });
    if (this.adrenalineTimer > 0) buffs.push({ label: 'ADRN', color: '#FF4444' });
    if (this.tacticalMagTimer > 0) buffs.push({ label: '3xDMG', color: '#FF6600' });
    if (this.veteranStacks > 0) buffs.push({ label: `VET+${(this.veteranStacks * 3)}%`, color: '#FFD700' });

    for (let i = 0; i < buffs.length; i++) {
      const b = buffs[i];
      const x = hudX + i * 55;
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(x, hudY, 50, 14);
      ctx.fillStyle = b.color;
      ctx.fillText(b.label, x + 2, hudY + 11);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, hudY, 50, 14);
    }

    if (this.hasTacticalMag) {
      const killsToNext = this.waveKills % 10;
      const tmX = hudX + buffs.length * 55;
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(tmX, hudY, 50, 14);
      const tmPct = killsToNext / 10;
      ctx.fillStyle = `rgba(255, 68, 68, ${0.3 + tmPct * 0.5})`;
      ctx.fillRect(tmX, hudY, 50 * tmPct, 14);
      ctx.fillStyle = '#FF8888';
      ctx.fillText(`${killsToNext}/10`, tmX + 2, hudY + 11);
      ctx.strokeStyle = '#FF4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(tmX, hudY, 50, 14);
    }

    if (this._cachedDamageMult > 1 || this._cachedFireRateMult > 1) {
      const statY = hudY + 16;
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#AAAAAA';
      const parts: string[] = [];
      if (this._cachedDamageMult > 1) parts.push(`DMGx${this._cachedDamageMult.toFixed(1)}`);
      if (this._cachedFireRateMult > 1) parts.push(`SPDx${this._cachedFireRateMult.toFixed(1)}`);
      ctx.fillText(parts.join(' '), hudX, statY + 9);
    }
  }

  renderHelmet(ctx: CanvasRenderingContext2D, player: Player): void {
    const px = player.position.x;
    const py = player.position.y;
    const s = player.size / 2;

    ctx.fillStyle = '#228B22';
    ctx.fillRect(px - s * 0.8, py - s - 6, s * 1.6, 7);

    ctx.fillStyle = '#1a6b1a';
    ctx.fillRect(px - s * 0.6, py - s - 9, s * 1.2, 4);

    ctx.fillStyle = '#145214';
    ctx.fillRect(px - s * 0.25, py - s - 4, s * 0.5, 3);

    ctx.fillStyle = '#228B22';
    ctx.fillRect(px - s - 4, py - s * 0.3, 5, s * 0.6);
    ctx.fillRect(px + s - 1, py - s * 0.3, 5, s * 0.6);
  }

  renderMomentumBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = this.momentum / this.getEffectiveMomentumMax();
    if (this.momentumBurstActive) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#FFD700' : '#FFA500';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (pct > 0) {
      const r = Math.floor(255 * pct);
      const g = Math.floor(165 + 90 * pct);
      ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    if (this.burstEndFlash > 0) {
      const flashA = this.burstEndFlash / 0.6;
      ctx.fillStyle = `rgba(255, 215, 0, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    ctx.strokeStyle = pct > 0.8 ? '#FFD700' : (pct > 0 && pct < 0.3 ? '#FF4444' : '#555');
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    if (this.stimulantTimer > 0) {
      const stimY = barY + barH + 2;
      const stimPct = this.stimulantTimer / 5;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(barX, stimY, barW, 3);
      ctx.fillStyle = '#44FF44';
      ctx.fillRect(barX, stimY, barW * stimPct, 3);
    }
  }
}
