import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import { AllySystem } from '../systems/AllySystem';
import {
  RECRUIT_CLASSES, MAX_ROSTER, EQUIPMENT,
  generateRecruitOfClass, generateRecruitPool,
  getEffectiveStats, calculateRecruitCost, getTrainingCost, getMaxTrainingLevel,
  trainRecruit, getRerollCost, getAllowedBehaviors, getAvailableEquipment,
  tryLevelUpFromXp, xpForLevel, normalizeEquipment,
  type RecruitData, type AIBehavior, type FormationType,
} from '../systems/RecruitSystem';
import { calculateActiveSynergies, type ActiveSynergy } from '../systems/SynergySystem';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';

interface WaveEvent {
  id: string;
  name: string;
  description: string;
  active: boolean;
  timer: number;
  data?: Record<string, unknown>;
}

export class ManagerCharacter extends BaseCharacter {
  allySystem: AllySystem | null;
  roster: RecruitData[];
  deadRoster: RecruitData[];
  activeSynergies: ActiveSynergy[];

  availableRecruits: RecruitData[];
  availableForWave: number;
  rerollCount: number;

  // Formation (set in shop, persisted)
  formation: FormationType;

  // Commander passive auras
  commanderAura: string;
  auraTimer: number;
  rallyTimer: number;

  // Command meter (Fighter-style buildup) → Rally Cry burst
  command: number;
  commandMax: number;
  commandPerKill: number;
  commandDecay: number;
  rallyCryActive: boolean;
  rallyCryTimer: number;
  rallyCryDuration: number;
  rallyCryEndFlash: number;
  rallyCryPulseRadius: number;
  totalRallyCries: number;

  // Wave event system
  activeEvent: WaveEvent | null;
  eventCooldown: number;
  wavesSinceEvent: number;

  // XP tracking
  pendingXp: Map<string, number>;

  // uid → RecruitData lookup cache rebuilt each frame from `roster`. Replaces
  // two per-ally-per-frame `this.roster.find()` linear scans in onUpdate.
  private _rosterMap: Map<string, RecruitData> = new Map();

  constructor() {
    super();
    this.allySystem = null;
    this.roster = [];
    this.deadRoster = [];
    this.activeSynergies = [];
    this.availableRecruits = [];
    this.availableForWave = -1;
    this.rerollCount = 0;
    this.formation = 'spread';
    this.commanderAura = 'inspire';
    this.auraTimer = 0;
    this.rallyTimer = 0;
    this.command = 0;
    this.commandMax = 100;
    this.commandPerKill = 8;
    this.commandDecay = 5;
    this.rallyCryActive = false;
    this.rallyCryTimer = 0;
    this.rallyCryDuration = 5;
    this.rallyCryEndFlash = 0;
    this.rallyCryPulseRadius = 0;
    this.totalRallyCries = 0;
    this.activeEvent = null;
    this.eventCooldown = 0;
    this.wavesSinceEvent = 0;
    this.pendingXp = new Map();
  }

  // Each Rally Cry in a wave makes the next one 1.5× harder to fill.
  getEffectiveCommandMax(): number {
    return this.commandMax * Math.pow(1.5, this.totalRallyCries);
  }

  getId(): string { return 'manager'; }
  getName(): string { return 'The Manager'; }
  getDescription(): string {
    return 'Commander. No direct damage — hire up to 8 Recruits (Gunner, Sniper, Brawler, Mage, Tank, Healer, Scout, Medic, Berserker, Tax Collector) who fight for you. Multi-slot equipment per recruit. Ally kills fill Command → Rally Cry (team-wide +damage/+fire rate burst). Shop: Recruit / Roster / Equipment / Items.';
  }
  getColor(): string { return '#4488CC'; }

  getBaseStats(): PlayerStats {
    return {
      health: 15,
      speed: BALANCE.player.baseSpeed * 1.2,
      damage: 0,
      fireRate: 0,
      dodge: BALANCE.player.baseDodge + 5,
      luck: BALANCE.player.baseLuck,
      critChance: 0,
      critDamage: 0,
      pickupRange: BALANCE.player.basePickupRange * 2,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getStartingWeapons(): string[] { return []; }
  getAvailableWeapons(): string[] | null { return []; }
  getShopTabs(): string[] { return ['recruit', 'roster', 'equipment', 'items']; }
  getMaxWeapons(): number { return 0; }
  // Team leader, not a bruiser. 80 HP gives the Manager room to soak stray
  // hits while recruits do the work.
  getMaxHealthValue(): number { return 80; }
  getUpgradePool(): string[] {
    return ['health', 'speed', 'dodge', 'luck', 'regeneration',
      'recruitDamage', 'recruitHealth', 'recruitSpeed', 'synergyBonus'];
  }

  getAvailableItems(): string[] {
    // Player doesn't fight directly — weapon items (heavyRounds, doubleTap,
    // sharpShooter, etc.) do nothing for the Manager. Items here focus on
    // (1) recruit-scaling exclusives, (2) personal survivability, (3) economy.
    return [
      // Manager exclusives
      'megaphone', 'healthInsurance', 'trainingCamp',
      // Survivability
      'luckyCoin', 'energyDrink', 'proteinBar', 'bandaidPack', 'coffeeShot',
      'tankArmor', 'reinforcedPlating', 'shieldGenerator', 'adrenalineRush',
      'evasionTraining',
      // Economy / mobility
      'moneyMagnet', 'luckyPenny', 'speedBoots', 'magnetGloves',
      'prospectorsCharm', 'bloodPact',
    ];
  }

  onStartLevel(game: GameAPI): void {
    this.allySystem = new AllySystem();
    this.allySystem.effectsSystem = game.getEffectsSystem();
    this.allySystem.waveNumber = game.getCurrentLevel();
    this.allySystem.formation = this.formation;
    this.allySystem.damageCallback = (sourceId: string, amount: number) => game.recordDamage(sourceId, amount);
    this.allySystem.moneyCallback = (amount: number) => {
      const gs = game.getGameState();
      gs.playerData.money += amount;
      const effects = game.getEffectsSystem();
      const player = game.getPlayer();
      if (effects && player) {
        effects.floatingTexts.push({
          x: player.position.x + (Math.random() - 0.5) * 40,
          y: player.position.y - 30,
          text: `+$${amount}`,
          color: '#FFD700',
          life: 1.5,
          fontSize: 12,
        });
      }
    };
    this.allySystem.deathCallback = (uid: string) => {
      const recruit = this.roster.find(r => r.uid === uid);
      if (recruit) {
        recruit.dead = true;
        this.deadRoster.push({ ...recruit });
        const effects = game.getEffectsSystem();
        if (effects) {
          const ally = this.allySystem?.allies.find(a => a.recruitUid === uid);
          const pos = ally?.position ?? game.getPlayer()?.position;
          if (pos) {
            effects.addScreenShake(3, 0.15);
          }
        }
      }
    };

    const gameState = game.getGameState();
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    this.roster = (charData._roster as RecruitData[]) || [];
    this.deadRoster = (charData._deadRoster as RecruitData[]) || [];
    this.formation = (charData._formation as FormationType) || 'spread';
    // Coerce legacy single-slot `equipment: string | null` into the new array form
    // so older saves load cleanly.
    for (let i = 0; i < this.roster.length; i++) {
      this.roster[i].equipment = normalizeEquipment(this.roster[i].equipment as unknown);
    }
    for (let i = 0; i < this.deadRoster.length; i++) {
      this.deadRoster[i].equipment = normalizeEquipment(this.deadRoster[i].equipment as unknown);
    }

    // Starting recruit from setup screen
    if (charData.startingRecruit && typeof charData.startingRecruit === 'string') {
      const startClass = charData.startingRecruit;
      if (RECRUIT_CLASSES[startClass] && this.roster.length === 0) {
        const starter = generateRecruitOfClass(startClass, 1);
        starter.quality = 'common';
        this.roster.push(starter);
      }
    }

    // Remove dead recruits
    this.roster = this.roster.filter(r => !r.dead);

    // Calculate synergies
    this.activeSynergies = calculateActiveSynergies(this.roster);

    // Reset Command meter state per level.
    this.command = 0;
    this.rallyCryActive = false;
    this.rallyCryTimer = 0;
    this.rallyCryEndFlash = 0;
    this.rallyCryPulseRadius = 0;
    this.totalRallyCries = 0;

    // Roll wave event
    this.wavesSinceEvent++;
    this.rollWaveEvent(game.getCurrentLevel());

    // Spawn alive recruits
    const canvas = game.getCanvas();
    const cx = canvas.logicalWidth / 2;
    const cy = canvas.logicalHeight / 2;
    for (const recruit of this.roster) {
      this.allySystem.addAlly(recruit, cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 200);
    }

    this.allySystem.setSynergies(this.activeSynergies, this.roster);
    this.allySystem.formation = this.formation;
    this.saveRoster(gameState);
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    if (!this.allySystem) return;
    const enemies = game.getEnemies();
    const player = game.getPlayer();

    // Reset per-frame multipliers to synergy base before applying aura/event bonuses
    this.allySystem.setSynergies(this.activeSynergies, this.roster);
    // Rebuild roster lookup once per frame (cheap for roster sizes ≤8).
    this._rosterMap.clear();
    for (let i = 0; i < this.roster.length; i++) this._rosterMap.set(this.roster[i].uid, this.roster[i]);
    const gameState = game.getGameState();
    const items = gameState.playerData.items || [];
    const hasMegaphone = items.includes('megaphone');
    const hasHealthInsurance = items.includes('healthInsurance');
    const upStats = gameState.playerData.stats;
    const dmgBonus = 1 + (upStats.recruitDamageBonus || 0);
    const hpBonus = 1 + (upStats.recruitHealthBonus || 0);
    const spdBonus = 1 + (upStats.recruitSpeedBonus || 0);
    const synBonus = 1 + (upStats.synergyBonus || 0);
    const healthInsuranceRegen = (BALANCE.items as Record<string, { recruitRegen?: number }>).healthInsurance?.recruitRegen ?? 0.5;
    const megaphoneDmgBonus = 1 + ((BALANCE.items as Record<string, { recruitDamageBonus?: number }>).megaphone?.recruitDamageBonus ?? 0.2);
    for (const ally of this.allySystem.allies) {
      const recruit = this._rosterMap.get(ally.recruitUid);
      if (recruit?.trait === 'ironSkin') ally.ironSkinMult = 0.8;
      else ally.ironSkinMult = 1.0;
      if (hasMegaphone) ally.synergyDamageMult *= megaphoneDmgBonus;
      if (hasHealthInsurance && ally.health < ally.maxHealth) {
        ally.health = Math.min(ally.maxHealth, ally.health + healthInsuranceRegen * deltaTime);
      }
      // Manager upgrade bonuses
      ally.synergyDamageMult *= dmgBonus * synBonus;
      ally.synergySpeedMult *= spdBonus;
      // Health bonus scales via ironSkinMult reduction (lower mult = less damage taken)
      if (hpBonus > 1) ally.ironSkinMult *= 1 / hpBonus;
    }

    // Commander passive aura effects
    this.auraTimer += deltaTime;
    this.applyCommanderAura(game, deltaTime);

    // Command meter timers (decay / burst tick / end flash / pulse anim).
    if (this.rallyCryEndFlash > 0) this.rallyCryEndFlash -= deltaTime;
    if (this.rallyCryActive) {
      this.rallyCryTimer -= deltaTime;
      this.rallyCryPulseRadius += 240 * deltaTime;
      if (this.rallyCryTimer <= 0) {
        this.rallyCryActive = false;
        this.rallyCryTimer = 0;
        this.command = 0;
        this.rallyCryEndFlash = 0.5;
      }
    } else {
      this.command = Math.max(0, this.command - this.commandDecay * deltaTime);
    }

    // While Rally Cry is active, buff every ally via the synergy multiplier pipeline.
    if (this.rallyCryActive && this.allySystem) {
      for (const ally of this.allySystem.allies) {
        ally.synergyDamageMult *= 2.0;
        ally.synergyFireRateMult = (ally.synergyFireRateMult || 1) * 1.5;
        ally.synergySpeedMult *= 1.5;
      }
    }

    // Update wave event
    if (this.activeEvent?.active) {
      this.updateWaveEvent(game, deltaTime);
    }

    this.allySystem.update(deltaTime, enemies, player?.position);

    // Check for level-ups from XP
    const xpMult = this.activeEvent?.id === 'veteranBonus' ? 2 : 1;
    for (const ally of this.allySystem.allies) {
      const recruit = this._rosterMap.get(ally.recruitUid);
      if (!recruit) continue;
      recruit.xp = (recruit.xp || 0) + ally.xpGained * xpMult;
      const killsThisTick = ally.killCount;
      recruit.kills = (recruit.kills || 0) + killsThisTick;
      // Morale passive: Manager earns a cash tip for every recruit kill.
      if (killsThisTick > 0) {
        const morale = (BALANCE as unknown as Record<string, { cashPerKill: number } | undefined>).morale;
        const perKill = morale?.cashPerKill ?? 0;
        const tip = perKill * killsThisTick;
        gameState.playerData.money += tip;
        const effects = game.getEffectsSystem();
        if (effects) {
          effects.floatingTexts.push({
            x: ally.position.x, y: ally.position.y - 20,
            text: `+$${tip}`, color: '#FFD700', life: 0.9, fontSize: 11,
          });
        }

        // Command meter: recruit kills fill it. At cap, trigger Rally Cry.
        if (!this.rallyCryActive) {
          const cap = this.getEffectiveCommandMax();
          this.command = Math.min(cap, this.command + this.commandPerKill * killsThisTick);
          if (this.command >= cap) {
            this.triggerRallyCry(game);
          }
        }
      }
      ally.xpGained = 0;
      ally.killCount = 0;

      if (tryLevelUpFromXp(recruit)) {
        ally.levelUpFlash = 1.0;
        const stats = getEffectiveStats(recruit);
        ally.maxHealth = Math.round(stats.health * ally.synergyHealthMult);
        ally.health = ally.maxHealth;
        ally.damage = stats.damage;
        ally.fireRate = stats.fireRate;
        ally.speed = stats.speed;
        ally.range = stats.range;

        const effects = game.getEffectsSystem();
        if (effects) {
          effects.floatingTexts.push({
            x: ally.position.x, y: ally.position.y - 30,
            text: `LEVEL UP! Lv.${recruit.level}`,
            color: '#FFFF00', life: 2.0, fontSize: 14,
          });
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            effects.particles.push({
              x: ally.position.x, y: ally.position.y,
              vx: Math.cos(angle) * 100, vy: Math.sin(angle) * 100,
              life: 0.5, maxLife: 0.5, color: '#FFFF00', size: 3,
            });
          }
        }
        game.getSoundSystem().play('upgrade');
      }
    }
  }

  onWaveComplete(game: GameAPI, _waveNumber: number): void {
    // Award wave survival XP
    for (const recruit of this.roster) {
      if (!recruit.dead) {
        recruit.xp = (recruit.xp || 0) + 20;
        recruit.wavesLived = (recruit.wavesLived || 0) + 1;
      }
    }

    // Final drain of ally XP/kills (in case onWaveComplete fires before the last onUpdate)
    if (this.allySystem) {
      const xpMult = this.activeEvent?.id === 'veteranBonus' ? 2 : 1;
      for (const ally of this.allySystem.allies) {
        const recruit = this.roster.find(r => r.uid === ally.recruitUid);
        if (!recruit) continue;
        recruit.xp = (recruit.xp || 0) + ally.xpGained * xpMult;
        recruit.kills = (recruit.kills || 0) + ally.killCount;
        ally.xpGained = 0;
        ally.killCount = 0;
      }
    }

    this.saveRoster(game.getGameState());
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player || !this.allySystem) return;

    // Leader's Presence aura ring — drawn beneath allies so they overlay it.
    const cfg = (BALANCE as unknown as Record<string, { radius: number }>).leadersPresence;
    const pulse = 0.18 + 0.1 * Math.sin(Date.now() * 0.004);
    ctx.fillStyle = `rgba(100, 160, 220, ${0.05 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, cfg.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(100, 160, 220, ${0.35 + pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, cfg.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Highlight allies inside aura with a soft cyan underglow.
    const r2 = cfg.radius * cfg.radius;
    ctx.save();
    for (const ally of this.allySystem.allies) {
      const dx = ally.position.x - player.position.x;
      const dy = ally.position.y - player.position.y;
      if (dx * dx + dy * dy < r2) {
        ctx.fillStyle = 'rgba(120, 200, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(ally.position.x, ally.position.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    this.allySystem.render(ctx);

    const x = player.position.x;
    const y = player.position.y;

    // Manager body overlay: tie
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(x - 1, y - 3, 2, 8);
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.closePath();
    ctx.fill();

    // Command meter bar (blue→gold), replaces old squad text slot.
    this.renderCommandBar(ctx, player);

    // Rally Cry outward golden pulse ring.
    if (this.rallyCryActive && this.rallyCryPulseRadius > 0) {
      const pulseAlpha = Math.max(0, 1 - (this.rallyCryPulseRadius / 300));
      ctx.save();
      ctx.strokeStyle = `rgba(255, 215, 0, ${pulseAlpha * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, this.rallyCryPulseRadius, 0, Math.PI * 2);
      ctx.stroke();
      // Secondary inner pulse for flair.
      const innerR = Math.max(0, this.rallyCryPulseRadius - 40);
      if (innerR > 0) {
        ctx.strokeStyle = `rgba(255, 240, 120, ${pulseAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, innerR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (this.rallyCryPulseRadius > 300) this.rallyCryPulseRadius = 0;
    }

    // Squad status
    const alive = this.roster.filter(r => !r.dead).length;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4488CC';
    ctx.fillText(`Squad: ${alive}/${MAX_ROSTER}`, x, y + player.size / 2 + 30);

    // Formation indicator
    if (this.formation !== 'spread') {
      ctx.font = '8px monospace';
      ctx.fillStyle = '#6688AA';
      ctx.fillText(`[${this.formation.toUpperCase()}]`, x, y + player.size / 2 + 40);
    }

    // Wave event banner
    if (this.activeEvent?.active) {
      ctx.save();
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.globalAlpha = 0.8;
      ctx.fillText(`EVENT: ${this.activeEvent.name}`, 400, 85);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#CCAA44';
      ctx.fillText(this.activeEvent.description, 400, 97);
      ctx.restore();
    }
  }

  // --- Command Meter / Rally Cry ---

  private triggerRallyCry(game: GameAPI): void {
    this.rallyCryActive = true;
    this.rallyCryTimer = this.rallyCryDuration;
    this.rallyCryPulseRadius = 0;
    this.totalRallyCries++;

    // Heal every recruit 20% of max HP immediately.
    if (this.allySystem) {
      for (const ally of this.allySystem.allies) {
        const heal = ally.maxHealth * 0.2;
        ally.health = Math.min(ally.maxHealth, ally.health + heal);
      }
    }

    const effects = game.getEffectsSystem();
    const player = game.getPlayer();
    if (effects && player) {
      effects.floatingTexts.push({
        x: player.position.x, y: player.position.y - 30,
        text: 'RALLY!', color: '#FFD700', life: 1.5, vy: -30, fontSize: 16,
      });
      effects.addScreenShake(4, 0.3, 'high');
    }
    game.getSoundSystem()?.play('levelUp');
  }

  private renderCommandBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.min(1, this.command / this.getEffectiveCommandMax());
    if (this.rallyCryActive) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#FFD700' : '#4488FF';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (pct > 0) {
      // Blue→gold gradient as it fills.
      const r = Math.floor(68 + 187 * pct);
      const g = Math.floor(136 + 79 * pct);
      const b = Math.floor(204 - 204 * pct);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    if (this.rallyCryEndFlash > 0) {
      const flashA = this.rallyCryEndFlash / 0.5;
      ctx.fillStyle = `rgba(255, 215, 0, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    ctx.strokeStyle = pct > 0.8 || this.rallyCryActive ? '#FFD700' : '#446688';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.rallyCryActive ? '#FFD700' : '#88AACC';
    const label = this.rallyCryActive
      ? `RALLY ${this.rallyCryTimer.toFixed(1)}s`
      : `Command ${Math.floor(pct * 100)}%`;
    ctx.fillText(label, player.position.x, barY + barH + 8);
  }

  // --- Commander Passive Auras ---

  private applyCommanderAura(game: GameAPI, deltaTime: number): void {
    if (!this.allySystem) return;
    const player = game.getPlayer();
    if (!player) return;

    // Leader's Presence (passive): recruits inside the aura get a damage + fire-rate boost.
    const cfg = (BALANCE as unknown as Record<string, { radius: number; damageBonus: number; fireRateBonus: number }>).leadersPresence;
    const r2 = cfg.radius * cfg.radius;
    const dmgMult = 1 + cfg.damageBonus;
    const frMult = 1 + cfg.fireRateBonus;
    for (const ally of this.allySystem.allies) {
      const dx = ally.position.x - player.position.x;
      const dy = ally.position.y - player.position.y;
      if (dx * dx + dy * dy < r2) {
        ally.synergyDamageMult *= dmgMult;
        ally.synergyFireRateMult = (ally.synergyFireRateMult || 1) * frMult;
      }
    }

    // Auto-rally on recruit death: 3-second speed+damage boost
    if (this.allySystem.recentDeaths.length > 0) {
      this.rallyTimer = 3.0;
    }
    if (this.rallyTimer > 0) {
      this.rallyTimer -= deltaTime;
      for (const ally of this.allySystem.allies) {
        ally.synergySpeedMult *= 1.3;
        ally.synergyDamageMult *= 1.2;
      }
    }
  }

  // --- Wave Events ---

  private rollWaveEvent(_waveNumber: number): void {
    // Roll more often so Wave Events feel like a real feature, not a rare gimmick.
    if (this.wavesSinceEvent < 2) return;
    if (Math.random() > 0.7) return;

    this.wavesSinceEvent = 0;
    const events: WaveEvent[] = [
      {
        id: 'payday', name: 'PAYDAY',
        description: 'Double money drops this wave!',
        active: true, timer: 0,
      },
      {
        id: 'eliteSquad', name: 'ELITE SQUAD',
        description: 'Your recruits deal +30% damage this wave',
        active: true, timer: 0,
      },
      {
        id: 'veteranBonus', name: 'VETERAN BONUS',
        description: 'Recruits gain 2x XP this wave',
        active: true, timer: 0,
      },
      {
        id: 'ironWill', name: 'IRON WILL',
        description: 'Recruits take 25% less damage this wave',
        active: true, timer: 0,
      },
    ];

    this.activeEvent = events[Math.floor(Math.random() * events.length)];
  }

  private updateWaveEvent(_game: GameAPI, _deltaTime: number): void {
    if (!this.activeEvent || !this.allySystem) return;

    switch (this.activeEvent.id) {
      case 'eliteSquad':
        for (const ally of this.allySystem.allies) {
          ally.synergyDamageMult *= 1.3;
        }
        break;
      case 'ironWill':
        for (const ally of this.allySystem.allies) {
          ally.ironSkinMult *= 0.75;
        }
        break;
      case 'payday':
        for (const ally of this.allySystem.allies) {
          ally.synergyMoneyMult *= 2.0;
        }
        break;
    }
  }

  // --- Recruit management API (called by ShopScreen) ---

  getAvailablePool(currentWave: number): RecruitData[] {
    if (this.availableForWave !== currentWave) {
      this.availableRecruits = generateRecruitPool(currentWave, 3);
      this.availableForWave = currentWave;
      this.rerollCount = 0;
    }
    return this.availableRecruits;
  }

  rerollPool(currentWave: number): RecruitData[] {
    this.rerollCount++;
    this.availableRecruits = generateRecruitPool(currentWave, 3);
    return this.availableRecruits;
  }

  getCurrentRerollCost(): number {
    return getRerollCost(this.rerollCount);
  }

  hireRecruit(recruit: RecruitData, gameState: import('../systems/GameState').GameState): boolean {
    if (this.roster.filter(r => !r.dead).length >= MAX_ROSTER) return false;
    const copy: RecruitData = { ...recruit };
    // Training Camp item: new recruits start pre-trained (level 2)
    const items = gameState.playerData.items || [];
    if (items.includes('trainingCamp')) {
      const startLevel = (BALANCE.items as Record<string, { recruitStartLevel?: number }>).trainingCamp?.recruitStartLevel ?? 2;
      if ((copy.level || 1) < startLevel) {
        copy.level = startLevel;
        copy.xp = xpForLevel(startLevel);
      }
    }
    this.roster.push(copy);
    this.availableRecruits = this.availableRecruits.filter(r => r.uid !== recruit.uid);
    this.activeSynergies = calculateActiveSynergies(this.roster);
    this.saveRoster(gameState);
    return true;
  }

  dismissRecruit(uid: string, gameState: import('../systems/GameState').GameState): void {
    this.roster = this.roster.filter(r => r.uid !== uid);
    this.activeSynergies = calculateActiveSynergies(this.roster);
    this.saveRoster(gameState);
  }

  trainRecruitById(uid: string, gameState: import('../systems/GameState').GameState): boolean {
    const recruit = this.roster.find(r => r.uid === uid);
    if (!recruit) return false;
    const success = trainRecruit(recruit);
    if (success) this.saveRoster(gameState);
    return success;
  }

  /** Equip an item. Recruits can now hold multiple items, but only one copy of
   *  each id. Returns false if the id is already equipped or unknown. */
  equipItem(uid: string, equipId: string, gameState: import('../systems/GameState').GameState): boolean {
    const recruit = this.roster.find(r => r.uid === uid);
    if (!recruit) return false;
    const equip = EQUIPMENT[equipId];
    if (!equip) return false;
    if (recruit.equipment.includes(equipId)) return false;
    recruit.equipment.push(equipId);
    this.saveRoster(gameState);
    return true;
  }

  /** Sell an equipped item for a 50% refund. There is no "unequip" — removing
   *  a piece of gear goes through the sell path. Returns the refund amount,
   *  or 0 if the item wasn't equipped. */
  sellEquipment(uid: string, equipId: string, gameState: import('../systems/GameState').GameState): number {
    const recruit = this.roster.find(r => r.uid === uid);
    if (!recruit) return 0;
    const idx = recruit.equipment.indexOf(equipId);
    if (idx === -1) return 0;
    const equip = EQUIPMENT[equipId];
    const refund = equip ? Math.floor(equip.cost * 0.5) : 0;
    recruit.equipment.splice(idx, 1);
    if (refund > 0) gameState.playerData.money += refund;
    this.saveRoster(gameState);
    return refund;
  }

  setBehavior(uid: string, behavior: AIBehavior, gameState: import('../systems/GameState').GameState): void {
    const recruit = this.roster.find(r => r.uid === uid);
    if (!recruit) return;
    const allowed = getAllowedBehaviors(recruit.className);
    if (!allowed.includes(behavior)) return;
    recruit.behavior = behavior;
    this.saveRoster(gameState);
  }

  setFormation(formation: FormationType, gameState: import('../systems/GameState').GameState): void {
    this.formation = formation;
    if (this.allySystem) this.allySystem.formation = formation;
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    charData._formation = formation;
    gameState.savePlayerData();
  }

  getRoster(): RecruitData[] {
    return this.roster.filter(r => !r.dead);
  }

  getDeadRoster(): RecruitData[] {
    return this.deadRoster;
  }

  getActiveSynergies(): ActiveSynergy[] {
    return this.activeSynergies;
  }

  getFormation(): FormationType {
    return this.formation;
  }

  private saveRoster(gameState: import('../systems/GameState').GameState): void {
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    charData._roster = this.roster.map(r => ({ ...r }));
    charData._deadRoster = (this.deadRoster || []).slice(-20);
    charData._formation = this.formation;
    gameState.savePlayerData();
  }

  // Re-export helpers for ShopScreen
  static getEffectiveStats = getEffectiveStats;
  static calculateRecruitCost = calculateRecruitCost;
  static getTrainingCost = getTrainingCost;
  static getMaxTrainingLevel = getMaxTrainingLevel;
  static getAllowedBehaviors = getAllowedBehaviors;
  static getAvailableEquipment = getAvailableEquipment;
  static xpForLevel = xpForLevel;
  static RECRUIT_CLASSES = RECRUIT_CLASSES;
  static MAX_ROSTER = MAX_ROSTER;
  static EQUIPMENT = EQUIPMENT;
}
