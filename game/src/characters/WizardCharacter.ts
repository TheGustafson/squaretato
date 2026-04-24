import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import { createSpell, SPELL_CONFIGS, Spell } from '../systems/SpellSystem';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

// Arcane Surge — Wizard's passive buildup meter (equivalent to Fighter's momentum).
// Fills on each kill while alive. At max, triggers an Overcharge state for a few seconds:
// all spell cooldowns tick faster and spell damage is boosted. Decays back to 0.
const SURGE_MAX = 100;
const SURGE_PER_KILL = 15;
const SURGE_DECAY = 4; // per second when not in overcharge
const OVERCHARGE_DURATION = 5.0;
const OVERCHARGE_COOLDOWN_MULT = 3.0; // spells tick 3x faster during overcharge
const OVERCHARGE_DAMAGE_BONUS = 0.5;  // +50% spell damage during overcharge

export class WizardCharacter extends BaseCharacter {
  spells: Spell[];
  spellPowerBonus: number;
  cooldownSpeedBonus: number;
  hasRapidFire: boolean;
  allSpellsReadyBonus: boolean;
  killCdr: number;
  hasFrostHeart: boolean;
  hasStormConductor: boolean;
  hasPyromancerLens: boolean;
  hasRecklessCasting: boolean;
  hasVoidchannel: boolean;

  // Arcane Surge state
  surge: number;
  overchargeTimer: number;
  overchargeFlash: number;
  totalOvercharges: number;

  constructor() {
    super();
    this.spells = [];
    this.spellPowerBonus = 0;
    this.cooldownSpeedBonus = 0;
    this.hasRapidFire = false;
    this.allSpellsReadyBonus = false;
    this.killCdr = 0;
    this.hasFrostHeart = false;
    this.hasStormConductor = false;
    this.hasPyromancerLens = false;
    this.hasRecklessCasting = false;
    this.hasVoidchannel = false;
    this.surge = 0;
    this.overchargeTimer = 0;
    this.overchargeFlash = 0;
    this.totalOvercharges = 0;
  }

  getId(): string { return 'wizard'; }
  getName(): string { return 'The Wizard'; }
  getDescription(): string {
    return 'Arcane caster. No guns — 4 spell slots (Magic Missile, Fireball, Chain Lightning, Ice Nova, Meteor Storm, Arcane Beam, Teleport, Familiar, Time Warp, Shield Bubble). Mana regenerates; kills fill Arcane Surge → Overcharge (spell power + cooldown boost). Shop: spells + spell-power items.';
  }
  getColor(): string { return '#4488FF'; }

  getBaseStats(): PlayerStats {
    return {
      health: 12,
      speed: BALANCE.player.baseSpeed,
      damage: BALANCE.player.baseDamage,
      fireRate: 0,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getStartingWeapons(): string[] { return []; }
  getStartingSpells(): string[] { return ['magicMissile']; }
  getAvailableWeapons(): string[] | null { return []; }
  getShopTabs(): string[] { return ['spells', 'items']; }
  getMaxWeapons(): number { return 0; }
  // Squishy caster — a bit more headroom than the global 50 cap, but not Fighter-tier.
  getMaxHealthValue(): number { return 70; }

  getAvailableItems(): string[] {
    // Wizard item menu leans into spell scaling (power + CDR). Pads with generic
    // survivability so the player can trade offense for runs-don't-end-in-wave-3.
    return [
      // Wizard exclusives
      'chronoCrystal', 'spellFocus', 'arcaneConduit', 'temporalFlow', 'rapidFire',
      'frostHeart', 'stormConductor', 'pyromancerLens', 'soulHarvest',
      'recklessCasting', 'voidchannel',
      // Generic
      'luckyCoin', 'energyDrink', 'proteinBar', 'bandaidPack', 'coffeeShot',
      'moneyMagnet', 'luckyPenny', 'speedBoots', 'tankArmor',
      'shieldGenerator', 'adrenalineRush', 'magnetGloves', 'criticalEye',
      'lifeSteal', 'bloodPact', 'reinforcedPlating', 'evasionTraining',
      'prospectorsCharm', 'glassCannon',
    ];
  }

  getUpgradePool(): string[] {
    // spellPower + cooldownSpeed are now full-fledged BALANCE.upgrades entries
    // (see balance.ts) so the shop exposes them alongside HP/speed/dodge/luck.
    // Fixes the "Wizard can't buy spell damage" complaint directly.
    // critChance/critDamage added — spells route through the standard damage
    // pipeline so crits apply and give the wizard an extra DPS vector.
    return [
      'health', 'speed', 'dodge', 'luck', 'regeneration',
      'cooldownSpeed', 'spellPower',
      'critChance', 'critDamage',
    ];
  }

  isOvercharged(): boolean { return this.overchargeTimer > 0; }

  // Each overcharge within a wave makes the next one 1.5× harder to fill.
  getEffectiveSurgeMax(): number {
    return SURGE_MAX * Math.pow(1.5, this.totalOvercharges);
  }

  onStartLevel(game: GameAPI): void {
    this.spells = [];
    this.surge = 0;
    this.overchargeTimer = 0;
    this.overchargeFlash = 0;
    this.totalOvercharges = 0;

    const gameState = game.getGameState();
    const spellIds = gameState.playerData.spells || ['magicMissile'];
    const spellLevels = gameState.playerData.spellLevels || { magicMissile: 1 };

    for (const id of spellIds) {
      let level = spellLevels[id] || 1;
      // Magic Missile is documented to cap at 8 bolts (level == bolt count).
      // SpellSystem doesn't enforce the cap, so clamp the level here.
      if (id === 'magicMissile') level = Math.min(level, 8);
      this.spells.push(createSpell(id, level));
    }

    const stats = gameState.playerData.stats;
    this.spellPowerBonus = stats.spellPower || 0;
    this.cooldownSpeedBonus = stats.cooldownSpeed || 0;
    const cdr = stats.cooldownReduction || 0;
    const items = gameState.playerData.items || [];
    this.hasRapidFire = items.includes('rapidFire');
    this.hasFrostHeart = items.includes('frostHeart');
    this.hasStormConductor = items.includes('stormConductor');
    this.hasPyromancerLens = items.includes('pyromancerLens');
    this.hasRecklessCasting = items.includes('recklessCasting');
    this.hasVoidchannel = items.includes('voidchannel');

    const siphonStacks = (gameState.playerData.itemStacks || {} as Record<string, number>)['soulHarvest'] || 0;
    this.killCdr = siphonStacks > 0 ? siphonStacks * 0.3 : 0;

    let totalCdr = cdr;
    const chronoStacks = (gameState.playerData.itemStacks || {} as Record<string, number>)['chronoCrystal'] || 0;
    if (chronoStacks > 0) totalCdr += chronoStacks * 0.10;

    for (const spell of this.spells) {
      spell.spellPowerBonus = this.spellPowerBonus;
      if (this.hasRecklessCasting) {
        spell.spellPowerBonus += 0.2;
        spell.cooldownDuration *= 1.25;
      }
      // Void Channel CD penalty (+30%). SpellPower is applied via ItemEffects aggregation.
      if (this.hasVoidchannel) {
        spell.cooldownDuration *= 1.30;
      }
      if (totalCdr > 0) spell.cooldownDuration *= (1 - Math.min(totalCdr, 0.7));

      if (this.hasFrostHeart && spell.id === 'iceNova') {
        spell.cooldownDuration *= 0.6;
        (spell as unknown as Record<string, number>)._freezeDurationBonus = 0.5;
      }
      if (this.hasStormConductor && spell.id === 'chainLightning') {
        (spell as unknown as Record<string, number>)._extraJumps = 3;
        (spell as unknown as Record<string, number>)._cdrPerJump = 0.15;
      }
      if (this.hasPyromancerLens && spell.id === 'fireball') {
        (spell as unknown as Record<string, number>)._aoeBonus = 0.5;
        (spell as unknown as Record<string, number>)._frozenDmgMult = 2.0;
      }
    }
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    // Arcane Surge passive: decay while idle; burn down overcharge timer.
    if (this.overchargeTimer > 0) {
      this.overchargeTimer -= deltaTime;
      if (this.overchargeTimer <= 0) {
        this.overchargeTimer = 0;
        this.surge = 0;
      }
    } else if (this.surge > 0 && this.surge < this.getEffectiveSurgeMax()) {
      this.surge = Math.max(0, this.surge - SURGE_DECAY * deltaTime);
    }
    if (this.overchargeFlash > 0) this.overchargeFlash = Math.max(0, this.overchargeFlash - deltaTime * 1.5);

    let cdSpeed = 1 + this.cooldownSpeedBonus;
    if (this.overchargeTimer > 0) cdSpeed *= OVERCHARGE_COOLDOWN_MULT;
    for (const spell of this.spells) {
      spell.update(deltaTime * cdSpeed);
    }

    const player = game.getPlayer();
    if (!player || !player.alive) return;

    const enemies = game.getEnemies();
    if (enemies.length === 0) return;

    this.allSpellsReadyBonus = this.hasRapidFire && this.spells.every(s => s.isReady());

    for (const spell of this.spells) {
      if (spell.isReady()) {
        let bonus = this.spellPowerBonus + (this.hasRecklessCasting ? 0.2 : 0);
        if (this.allSpellsReadyBonus) bonus += 0.3;
        if (this.overchargeTimer > 0) bonus += OVERCHARGE_DAMAGE_BONUS;
        spell.spellPowerBonus = bonus;
        spell.cast(game);

        const ext = spell as unknown as Record<string, number>;
        if (ext._pendingCdr > 0) {
          const cdr = ext._pendingCdr;
          ext._pendingCdr = 0;
          for (const s of this.spells) {
            if (s.currentCooldown > 0) {
              s.currentCooldown = Math.max(0, s.currentCooldown - cdr);
            }
          }
          const effects = game.getEffectsSystem();
          if (effects) {
            effects.floatingTexts.push({
              x: 250, y: 12,
              text: `-${cdr.toFixed(1)}s CD`, color: '#88CCFF', life: 0.8, vy: -15, fontSize: 10
            });
          }
        }
      }
    }

    // Freeze tick moved into Enemy.update — see Enemy.ts. Avoids iterating all
    // enemies each frame from the character hook, and stops racing ally slow-debuffs.
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;
    ctx.save();

    for (const spell of this.spells) {
      if (spell.onRender) spell.onRender(ctx, player);
    }

    const hudX = 200;
    const hudY = 14;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < this.spells.length; i++) {
      const spell = this.spells[i];
      const x = hudX + i * 55;
      const cdPct = spell.getCooldownPercent();
      const ready = cdPct <= 0;

      const readyColor = this.allSpellsReadyBonus && ready ? '#FFD700' : (ready ? '#44FF44' : '#444444');
      ctx.fillStyle = readyColor;
      ctx.fillRect(x, hudY, 50, 14);
      ctx.fillStyle = cdPct > 0 ? '#666600' : 'transparent';
      ctx.fillRect(x, hudY, 50 * cdPct, 14);
      ctx.strokeStyle = this.allSpellsReadyBonus && ready ? '#FFD700' : (ready ? '#44FF44' : '#333333');
      ctx.lineWidth = 1;
      ctx.strokeRect(x, hudY, 50, 14);

      ctx.fillStyle = ready ? '#FFFFFF' : '#888888';
      if (cdPct > 0) {
        // Round-to-nearest with a small epsilon so float drift doesn't cause
        // 3.0 → ceil(30.0001)/10 = 3.1 display artifacts while the cooldown ticks.
        const cdSec = Math.round(spell.currentCooldown * 10) / 10;
        ctx.fillText(`${cdSec.toFixed(1)}s`, x + 2, hudY + 11);
      } else {
        const shortName = spell.name.substring(0, 6);
        ctx.fillText(shortName, x + 2, hudY + 11);
      }
    }

    if (this.allSpellsReadyBonus) {
      const pulse = Math.sin(Date.now() * 0.01) * 0.2 + 0.4;
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 2,
        player.position.y - player.size / 2 - 2,
        player.size + 4,
        player.size + 4
      );
    }

    this.renderWizardHat(ctx, player);

    // Arcane Surge bar beneath player (same slot the old mana bar occupied).
    const barW = player.size;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;
    const barH = 8;
    const pct = Math.min(1, this.surge / this.getEffectiveSurgeMax());
    ctx.fillStyle = '#1a0a2a';
    ctx.fillRect(barX, barY, barW, barH);
    if (this.overchargeTimer > 0) {
      const glow = 0.6 + 0.4 * Math.sin(Date.now() * 0.02);
      ctx.fillStyle = `rgba(255, 140, 255, ${glow})`;
      const remainPct = this.overchargeTimer / OVERCHARGE_DURATION;
      ctx.fillRect(barX, barY, barW * remainPct, barH);
      ctx.strokeStyle = '#FF66FF';
    } else {
      const c = pct >= 1 ? '#FFD700' : (pct > 0.5 ? '#CC88FF' : '#6644AA');
      ctx.fillStyle = c;
      ctx.fillRect(barX, barY, barW * pct, barH);
      ctx.strokeStyle = '#6644AA';
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    if (this.overchargeTimer > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.015);
      ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
      ctx.fillText(`OVERCHARGE ${this.overchargeTimer.toFixed(1)}s`, player.position.x, barY + 20);
    } else if (pct > 0) {
      ctx.fillStyle = '#AA88DD';
      ctx.fillText(`Surge ${Math.floor(pct * 100)}%`, player.position.x, barY + 20);
    }

    // Flash outline when overcharge triggers
    if (this.overchargeFlash > 0) {
      ctx.strokeStyle = `rgba(255, 100, 255, ${this.overchargeFlash})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 4,
        player.position.y - player.size / 2 - 4,
        player.size + 8, player.size + 8,
      );
    }

    // Sustained overcharge aura + gold halos on active spell projectiles.
    if (this.overchargeTimer > 0) {
      const t = Date.now() * 0.012;
      const auraPulse = 0.35 + 0.25 * Math.sin(t);
      const auraR1 = player.size * (0.9 + 0.15 * Math.sin(t * 1.3));
      const auraR2 = player.size * (1.3 + 0.2 * Math.sin(t * 0.9));
      ctx.strokeStyle = `rgba(255, 215, 0, ${auraPulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, auraR1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 140, 255, ${auraPulse * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, auraR2, 0, Math.PI * 2);
      ctx.stroke();

      // Gold halos over active spell projectiles — visual cue that casts are empowered.
      const haloAlpha = 0.55 + 0.25 * Math.sin(t * 2);
      ctx.fillStyle = `rgba(255, 215, 0, ${haloAlpha * 0.35})`;
      ctx.strokeStyle = `rgba(255, 235, 120, ${haloAlpha})`;
      ctx.lineWidth = 1.5;
      for (const spell of this.spells) {
        const sAny = spell as unknown as { projectiles?: Array<{ x: number; y: number }> };
        const projs = sAny.projectiles;
        if (!projs) continue;
        for (let i = 0; i < projs.length; i++) {
          const p = projs[i];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  renderWizardHat(ctx: CanvasRenderingContext2D, player: Player): void {
    const px = player.position.x;
    const py = player.position.y;
    const s = player.size / 2;

    ctx.fillStyle = '#2244AA';
    ctx.beginPath();
    ctx.ellipse(px, py - s + 2, s * 0.9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3366CC';
    ctx.beginPath();
    ctx.moveTo(px, py - s - 18);
    ctx.lineTo(px - s * 0.6, py - s + 2);
    ctx.lineTo(px + s * 0.6, py - s + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4488FF';
    ctx.beginPath();
    ctx.moveTo(px, py - s - 18);
    ctx.quadraticCurveTo(px + 8, py - s - 20, px + 10, py - s - 14);
    ctx.lineTo(px - 2, py - s - 16);
    ctx.closePath();
    ctx.fill();

    const starY = py - s - 8;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★', px, starY);
  }

  onKill(_game: GameAPI, _enemy: Enemy): void {
    // Arcane Surge buildup on kills (skipped during overcharge — the burst is already active).
    if (this.overchargeTimer <= 0) {
      const cap = this.getEffectiveSurgeMax();
      this.surge = Math.min(cap, this.surge + SURGE_PER_KILL);
      if (this.surge >= cap) {
        this.overchargeTimer = OVERCHARGE_DURATION;
        this.overchargeFlash = 1.0;
        this.totalOvercharges++;
      }
    }
    // Soul Harvest item: shave cooldown off remaining spells per kill.
    if (this.killCdr > 0) {
      for (const spell of this.spells) {
        if (spell.currentCooldown > 0) {
          spell.currentCooldown = Math.max(0, spell.currentCooldown - this.killCdr);
        }
      }
    }
  }

  onLevelEnd(game?: GameAPI): void {
    const player = game?.getPlayer();
    if (player) (player as unknown as Record<string, unknown>)._shieldBubble = null;
    this.spells = [];
  }

  getRoundSummary(): { label: string; value: string }[] {
    const stats: { label: string; value: string }[] = [];
    stats.push({ label: 'Spells Known', value: `${this.spells.length}` });
    if (this.spellPowerBonus > 0) stats.push({ label: 'Spell Power', value: `+${Math.round(this.spellPowerBonus * 100)}%` });
    if (this.cooldownSpeedBonus > 0) stats.push({ label: 'CD Speed', value: `+${Math.round(this.cooldownSpeedBonus * 100)}%` });
    return stats;
  }

  getSpellConfigs(): typeof SPELL_CONFIGS {
    return SPELL_CONFIGS;
  }
}
