import type { Enemy } from '../entities/Enemy';
import type { EffectsSystem } from './EffectsSystem';
import {
  RECRUIT_CLASSES, QUALITY_COLORS, EQUIPMENT,
  getEffectiveStats,
  type RecruitData, type RecruitQuality, type AIBehavior, type FormationType,
} from './RecruitSystem';
import { applyDebuff, getDebuffMultiplier, updateDebuffs, type Debuffable } from './DebuffSystem';
import { type ActiveSynergy, getSynergyMultiplier } from './SynergySystem';

interface AllyProjectile {
  x: number; y: number;
  vx: number; vy: number;
  damage: number;
  color: string;
  ttl: number;
  size: number;
  sourceUid: string;
  sourceType: string;
  splash?: boolean;
  splashRadius?: number;
  splashDamage?: number;
}

interface MeleeFlash {
  x: number; y: number;
  angle: number; radius: number; arc: number;
  life: number; maxLife: number; color: string;
}

interface HealBeam {
  x1: number; y1: number; x2: number; y2: number;
  color: string; life: number;
}

export class Ally {
  recruitUid: string;
  className: string;
  quality: RecruitQuality;
  trait: string | null;
  behavior: AIBehavior;
  equipment: string[];

  name: string;
  health: number;
  maxHealth: number;
  damage: number;
  fireRate: number;
  speed: number;
  range: number;

  fireCooldown: number;
  isMelee: boolean;
  isHealer: boolean;
  isUtility: boolean;
  color: string;
  qualityColor: string;
  shape: string;
  size: number;
  alive: boolean;
  position: { x: number; y: number };
  formationTarget: { x: number; y: number } | null;
  moveTimer: number;
  moveAngle: number;

  projectiles: AllyProjectile[];
  meleeFlashes: MeleeFlash[];
  healBeams: HealBeam[];

  // Trait flags
  utilityTimer: number;
  dodgeChance: number;
  ironSkinMult: number;
  lifesteal: boolean;
  lastStand: boolean;
  moneyFinder: boolean;

  // Class specialization state
  accuracyStacks: number;
  chargeTimer: number;
  charged: boolean;
  rageStacks: number;
  tauntRadius: number;

  // Visual state
  hitFlashTimer: number;
  killCount: number;
  xpGained: number;
  levelUpFlash: number;
  lastLevelUpFlash: number;

  // Equipment specials
  flatArmor: number;
  blockChance: number;
  hasVampiric: boolean;
  hasRegen: boolean;
  regenTimer: number;
  hasMoneyMagnet: boolean;
  hasExplosiveAttacks: boolean;

  // Synergy multipliers (set externally each frame)
  synergyDamageMult: number;
  synergyHealthMult: number;
  synergyFireRateMult: number;
  synergySpeedMult: number;
  synergyMoneyMult: number;
  synergyHealMult: number;

  damageCallback: ((sourceId: string, amount: number) => void) | null = null;
  moneyCallback: ((amount: number) => void) | null = null;
  deathCallback: ((uid: string) => void) | null = null;
  effectsCallback: EffectsSystem | null = null;

  constructor(recruit: RecruitData) {
    const classDef = RECRUIT_CLASSES[recruit.className];
    const stats = getEffectiveStats(recruit);

    this.recruitUid = recruit.uid;
    this.className = recruit.className;
    this.quality = recruit.quality;
    this.trait = recruit.trait;
    this.behavior = recruit.behavior;
    // Copy the array so later roster edits (sell/equip between waves) don't
    // mutate the running ally's loadout mid-wave.
    this.equipment = recruit.equipment.slice();
    this.name = recruit.name;

    this.health = stats.health;
    this.maxHealth = stats.health;
    this.damage = stats.damage;
    this.fireRate = stats.fireRate;
    this.speed = stats.speed;
    this.range = stats.range;

    this.fireCooldown = Math.random() * 0.5;
    this.isMelee = classDef?.isMelee ?? false;
    this.isHealer = classDef?.isHealer ?? false;
    this.isUtility = classDef?.isUtility ?? false;
    this.color = classDef?.color ?? '#88FF88';
    this.qualityColor = QUALITY_COLORS[recruit.quality];
    this.shape = classDef?.shape ?? 'square';
    this.size = this.className === 'tank' ? 20 : 16;
    this.alive = true;
    this.position = { x: 0, y: 0 };
    this.formationTarget = null;
    this.moveTimer = 0;
    this.moveAngle = Math.random() * Math.PI * 2;

    this.projectiles = [];
    this.meleeFlashes = [];
    this.healBeams = [];

    this.utilityTimer = 0;
    this.dodgeChance = recruit.trait === 'dodge' ? 0.2 : 0;
    this.ironSkinMult = recruit.trait === 'ironSkin' ? 0.8 : 1.0;
    this.lifesteal = recruit.trait === 'lifesteal';
    this.lastStand = recruit.trait === 'lastStand';
    this.moneyFinder = recruit.trait === 'moneyFinder';

    this.accuracyStacks = 0;
    this.chargeTimer = 0;
    this.charged = false;
    this.rageStacks = 0;
    this.tauntRadius = this.className === 'tank' ? 100 : 0;

    this.hitFlashTimer = 0;
    this.killCount = 0;
    this.xpGained = 0;
    this.levelUpFlash = 0;
    this.lastLevelUpFlash = 0;

    // Equipment specials
    this.flatArmor = 0;
    this.blockChance = 0;
    this.hasVampiric = false;
    this.hasRegen = false;
    this.regenTimer = 0;
    this.hasMoneyMagnet = false;
    this.hasExplosiveAttacks = false;
    this.applyEquipmentSpecials();

    this.synergyDamageMult = 1;
    this.synergyHealthMult = 1;
    this.synergyFireRateMult = 1;
    this.synergySpeedMult = 1;
    this.synergyMoneyMult = 1;
    this.synergyHealMult = 1;
  }

  private applyEquipmentSpecials(): void {
    if (!this.equipment || this.equipment.length === 0) return;
    for (let i = 0; i < this.equipment.length; i++) {
      const equip = EQUIPMENT[this.equipment[i]];
      if (!equip?.special) continue;
      switch (equip.special) {
        case 'flatArmor': this.flatArmor = 1; break;
        case 'blockChance': this.blockChance = 0.15; break;
        case 'vampiric': this.hasVampiric = true; break;
        case 'regen': this.hasRegen = true; break;
        case 'moneyMagnet': this.hasMoneyMagnet = true; break;
        case 'explosiveAttacks': this.hasExplosiveAttacks = true; break;
      }
    }
  }

  update(deltaTime: number, enemies: Enemy[], allies: Ally[], playerPos?: { x: number; y: number }): void {
    if (!this.alive) return;

    this.updateMovement(deltaTime, enemies, playerPos, allies);
    this.updateCombat(deltaTime, enemies, allies);
    this.updateProjectiles(deltaTime, enemies);
    this.updateMeleeFlashes(deltaTime);
    this.updateHealBeams(deltaTime);
    this.updateUtility(deltaTime);
    this.updateSpecials(deltaTime, enemies);

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= deltaTime;
    if (this.levelUpFlash > 0) this.levelUpFlash -= deltaTime;

    // Detect level-up trigger (levelUpFlash was just set by ManagerCharacter) — emit particle burst once.
    if (this.levelUpFlash > this.lastLevelUpFlash + 0.01 && this.effectsCallback) {
      const fx = this.effectsCallback;
      for (let i = 0; i < 14; i++) {
        const angle = (Math.PI * 2 * i) / 14;
        const speed = 90 + Math.random() * 60;
        fx.particles.push({
          x: this.position.x, y: this.position.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 0.6, maxLife: 0.6, color: '#FFFF55', size: 3,
        });
      }
      fx.floatingTexts.push({
        x: this.position.x, y: this.position.y - 18,
        text: 'LEVEL UP!', color: '#FFFF55', life: 1.2, fontSize: 10,
      });
    }
    this.lastLevelUpFlash = this.levelUpFlash;
  }

  private updateMovement(
    deltaTime: number,
    enemies: Enemy[],
    playerPos?: { x: number; y: number },
    allies?: Ally[],
  ): void {
    const effectiveSpeed = this.speed * this.synergySpeedMult;
    const target = this.formationTarget;

    // Healer/medic follows lowest-HP ally when no threat nearby.
    if ((this.isHealer || this.className === 'medic') && allies) {
      const threat = this.findNearestEnemy(enemies);
      if (threat) {
        const tdx = threat.position.x - this.position.x;
        const tdy = threat.position.y - this.position.y;
        const td2 = tdx * tdx + tdy * tdy;
        if (td2 < 120 * 120) {
          // Retreat from threat.
          const inv = 1 / Math.sqrt(td2 || 1);
          this.position.x -= tdx * inv * effectiveSpeed * deltaTime;
          this.position.y -= tdy * inv * effectiveSpeed * deltaTime;
          this.position.x = Math.max(20, Math.min(780, this.position.x));
          this.position.y = Math.max(60, Math.min(580, this.position.y));
          return;
        }
      }
      const patient = this.findLowestHpAlly(allies);
      if (patient && patient.health < patient.maxHealth) {
        const dx = patient.position.x - this.position.x;
        const dy = patient.position.y - this.position.y;
        const d2 = dx * dx + dy * dy;
        const follow = this.range * 0.6;
        if (d2 > follow * follow) {
          const inv = 1 / Math.sqrt(d2);
          this.position.x += dx * inv * effectiveSpeed * deltaTime;
          this.position.y += dy * inv * effectiveSpeed * deltaTime;
        }
        this.position.x = Math.max(20, Math.min(780, this.position.x));
        this.position.y = Math.max(60, Math.min(580, this.position.y));
        return;
      }
    }

    // Sniper holds position while charged; brawler/berserker always rush nearest.
    switch (this.behavior) {
      case 'follow': {
        const anchor = target || playerPos;
        // Melee classes engage when enemy is nearby even in follow.
        if (this.isMelee) {
          const nearest = this.findNearestEnemy(enemies);
          if (nearest) {
            const dx = nearest.position.x - this.position.x;
            const dy = nearest.position.y - this.position.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 180 * 180) {
              const inv = 1 / Math.sqrt(d2 || 1);
              this.position.x += dx * inv * effectiveSpeed * deltaTime;
              this.position.y += dy * inv * effectiveSpeed * deltaTime;
              break;
            }
          }
        }
        if (anchor) {
          const dx = anchor.x - this.position.x;
          const dy = anchor.y - this.position.y;
          const d2 = dx * dx + dy * dy;
          const threshold = target ? 15 : 80;
          if (d2 > threshold * threshold) {
            const inv = 1 / Math.sqrt(d2);
            const moveSpeed = target ? effectiveSpeed * 1.2 : effectiveSpeed;
            this.position.x += dx * inv * moveSpeed * deltaTime;
            this.position.y += dy * inv * moveSpeed * deltaTime;
          } else {
            this.idleWander(deltaTime, effectiveSpeed);
          }
        } else {
          this.idleWander(deltaTime, effectiveSpeed);
        }
        break;
      }
      case 'aggressive': {
        const nearest = this.findNearestEnemy(enemies);
        if (nearest) {
          const dx = nearest.position.x - this.position.x;
          const dy = nearest.position.y - this.position.y;
          const d2 = dx * dx + dy * dy;
          // Sniper holds still when charged and target in range.
          if (this.className === 'sniper' && this.charged && d2 < this.range * this.range) {
            break;
          }
          // Ranged classes kite: maintain an optimal band around range*0.75.
          if (!this.isMelee) {
            const optimal = this.range * 0.75;
            const tooClose = this.range * 0.45;
            if (d2 < tooClose * tooClose) {
              // Back away.
              const inv = 1 / Math.sqrt(d2 || 1);
              this.position.x -= dx * inv * effectiveSpeed * deltaTime;
              this.position.y -= dy * inv * effectiveSpeed * deltaTime;
            } else if (d2 > optimal * optimal) {
              const inv = 1 / Math.sqrt(d2);
              this.position.x += dx * inv * effectiveSpeed * deltaTime;
              this.position.y += dy * inv * effectiveSpeed * deltaTime;
            }
            // else: within band, hold.
            break;
          }
          // Melee: rush.
          const stopDist = 20;
          if (d2 > stopDist * stopDist) {
            const inv = 1 / Math.sqrt(d2);
            this.position.x += dx * inv * effectiveSpeed * deltaTime;
            this.position.y += dy * inv * effectiveSpeed * deltaTime;
          }
        } else if (target) {
          this.moveToward(target, deltaTime, effectiveSpeed);
        } else {
          this.idleWander(deltaTime, effectiveSpeed);
        }
        break;
      }
      case 'defensive': {
        if (this.health / this.maxHealth < 0.4) {
          const threat = this.findNearestEnemy(enemies);
          if (threat) {
            const angle = Math.atan2(this.position.y - threat.position.y, this.position.x - threat.position.x);
            this.position.x += Math.cos(angle) * effectiveSpeed * 1.2 * deltaTime;
            this.position.y += Math.sin(angle) * effectiveSpeed * 1.2 * deltaTime;
          }
        } else {
          const anchor = target || playerPos;
          if (anchor) {
            const d = Math.hypot(anchor.x - this.position.x, anchor.y - this.position.y);
            if (d > (target ? 15 : 120)) {
              const angle = Math.atan2(anchor.y - this.position.y, anchor.x - this.position.x);
              this.position.x += Math.cos(angle) * effectiveSpeed * deltaTime;
              this.position.y += Math.sin(angle) * effectiveSpeed * deltaTime;
            } else {
              this.idleWander(deltaTime, effectiveSpeed);
            }
          }
        }
        break;
      }
      case 'roaming': {
        this.moveTimer -= deltaTime;
        if (this.moveTimer <= 0) {
          this.moveAngle = Math.random() * Math.PI * 2;
          this.moveTimer = 1 + Math.random() * 2;
        }
        this.position.x += Math.cos(this.moveAngle) * effectiveSpeed * deltaTime;
        this.position.y += Math.sin(this.moveAngle) * effectiveSpeed * deltaTime;
        break;
      }
      case 'passive': {
        const closestThreat = this.findNearestEnemy(enemies);
        if (closestThreat) {
          const d = Math.hypot(closestThreat.position.x - this.position.x, closestThreat.position.y - this.position.y);
          if (d < 150) {
            const angle = Math.atan2(this.position.y - closestThreat.position.y, this.position.x - closestThreat.position.x);
            this.position.x += Math.cos(angle) * effectiveSpeed * 1.3 * deltaTime;
            this.position.y += Math.sin(angle) * effectiveSpeed * 1.3 * deltaTime;
          } else {
            const anchor = target || playerPos;
            if (anchor) this.moveToward(anchor, deltaTime, effectiveSpeed, 100);
            else this.idleWander(deltaTime, effectiveSpeed);
          }
        } else {
          const anchor = target || playerPos;
          if (anchor) this.moveToward(anchor, deltaTime, effectiveSpeed, 100);
          else this.idleWander(deltaTime, effectiveSpeed);
        }
        break;
      }
    }

    this.position.x = Math.max(20, Math.min(780, this.position.x));
    this.position.y = Math.max(60, Math.min(580, this.position.y));
  }

  private moveToward(target: { x: number; y: number }, dt: number, speed: number, threshold = 15): void {
    const d = Math.hypot(target.x - this.position.x, target.y - this.position.y);
    if (d > threshold) {
      const angle = Math.atan2(target.y - this.position.y, target.x - this.position.x);
      this.position.x += Math.cos(angle) * speed * dt;
      this.position.y += Math.sin(angle) * speed * dt;
    }
  }

  private idleWander(deltaTime: number, speed: number): void {
    this.moveTimer -= deltaTime;
    if (this.moveTimer <= 0) {
      this.moveAngle = Math.random() * Math.PI * 2;
      this.moveTimer = 2 + Math.random() * 3;
    }
    this.position.x += Math.cos(this.moveAngle) * speed * 0.3 * deltaTime;
    this.position.y += Math.sin(this.moveAngle) * speed * 0.3 * deltaTime;
  }

  private findNearestEnemy(enemies: Enemy[]): Enemy | null {
    let closest: Enemy | null = null;
    let minD2 = Infinity;
    const px = this.position.x;
    const py = this.position.y;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - px;
      const dy = e.position.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) { minD2 = d2; closest = e; }
    }
    return closest;
  }

  findLowestHpAlly(allies: Ally[]): Ally | null {
    let lowest: Ally | null = null;
    let lowestPct = 1;
    for (const a of allies) {
      if (!a.alive || a === this) continue;
      const pct = a.health / a.maxHealth;
      if (pct < lowestPct) { lowestPct = pct; lowest = a; }
    }
    return lowest;
  }

  private updateCombat(deltaTime: number, enemies: Enemy[], allies: Ally[]): void {
    if (this.isUtility) return;
    if (!this.isHealer && this.className !== 'medic' && this.fireRate <= 0) return;

    this.fireCooldown -= deltaTime;
    if (this.fireCooldown > 0) return;

    if (this.className === 'medic') {
      this.throwHealBolt(allies);
    } else if (this.isHealer) {
      this.healNearestAlly(allies);
    } else {
      this.attackNearestEnemy(enemies);
    }
  }

  private throwHealBolt(allies: Ally[]): void {
    const patient = this.findLowestHpAlly(allies);
    if (!patient || patient.health >= patient.maxHealth) {
      this.fireCooldown = 0.3;
      return;
    }
    const healAmount = 4 * this.synergyHealMult;
    patient.health = Math.min(patient.maxHealth, patient.health + healAmount);
    this.healBeams.push({
      x1: this.position.x, y1: this.position.y,
      x2: patient.position.x, y2: patient.position.y,
      color: '#FF4466', life: 0.35,
    });
    if (this.effectsCallback) {
      this.effectsCallback.floatingTexts.push({
        x: patient.position.x, y: patient.position.y - 12,
        text: `+${healAmount.toFixed(0)}`, color: '#FF88AA', life: 0.6, fontSize: 10,
      });
    }
    const effectiveFireRate = Math.max(0.1, this.fireRate * this.synergyFireRateMult);
    this.fireCooldown = 1 / effectiveFireRate;
  }

  private attackNearestEnemy(enemies: Enemy[]): void {
    let closest: Enemy | null = null;
    let minD2 = Infinity;
    const px = this.position.x;
    const py = this.position.y;
    const maxRange = this.range * 1.2;
    const maxRange2 = maxRange * maxRange;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - px;
      const dy = e.position.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2 && d2 < maxRange2) { minD2 = d2; closest = e; }
    }
    if (!closest) {
      this.accuracyStacks = 0;
      return;
    }

    const effectiveFireRate = this.fireRate * this.synergyFireRateMult;
    this.fireCooldown = 1 / effectiveFireRate;

    let dmg = this.damage * this.synergyDamageMult;
    if (this.lastStand && this.health / this.maxHealth < 0.25) dmg *= 2;

    // Berserker rage: +10% per stack (from hits taken)
    if (this.className === 'berserker' && this.rageStacks > 0) {
      dmg *= 1 + this.rageStacks * 0.1;
    }

    // Sniper charged shot: 3x damage
    if (this.className === 'sniper' && this.charged) {
      dmg *= 3;
      this.charged = false;
      this.chargeTimer = 0;
    }

    // Gunner accuracy ramp
    if (this.className === 'gunner') {
      this.accuracyStacks = Math.min(5, this.accuracyStacks + 1);
      dmg *= 1 + this.accuracyStacks * 0.04;
    }

    // Debuff: marked enemies take more damage
    const enemyDebuffable = closest as unknown as Debuffable;
    const damageTakenMult = getDebuffMultiplier(enemyDebuffable, 'damageTakenMultiplier');
    dmg *= damageTakenMult;

    if (this.isMelee) {
      this.meleeAttack(closest, dmg, enemies);
    } else {
      this.rangedAttack(closest, dmg);
    }
  }

  private meleeAttack(target: Enemy, dmg: number, allEnemies: Enemy[]): void {
    // Brawler cleave: hit all enemies in arc
    if (this.className === 'brawler') {
      const angle = Math.atan2(target.position.y - this.position.y, target.position.x - this.position.x);
      const arc = Math.PI * 0.7;
      for (const e of allEnemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.position.x - this.position.x, e.position.y - this.position.y);
        if (d > this.range * 1.2) continue;
        const eAngle = Math.atan2(e.position.y - this.position.y, e.position.x - this.position.x);
        let diff = eAngle - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= arc / 2) {
          this.dealDamage(e, dmg);
        }
      }
      this.meleeFlashes.push({
        x: this.position.x, y: this.position.y,
        angle, radius: this.range * 0.7, arc,
        life: 0.15, maxLife: 0.15, color: this.color,
      });
    } else {
      this.dealDamage(target, dmg);
      const angle = Math.atan2(target.position.y - this.position.y, target.position.x - this.position.x);
      const arc = this.className === 'berserker' ? Math.PI * 0.4 : Math.PI * 0.6;
      this.meleeFlashes.push({
        x: this.position.x, y: this.position.y,
        angle, radius: this.range * 0.7, arc,
        life: 0.15, maxLife: 0.15, color: this.color,
      });
    }
  }

  private rangedAttack(target: Enemy, dmg: number): void {
    const angle = Math.atan2(target.position.y - this.position.y, target.position.x - this.position.x);
    const projSpeed = this.className === 'sniper' ? 350 : this.className === 'mage' ? 200 : 250;
    const projSize = this.className === 'mage' ? 5 : this.className === 'sniper' ? 3 : 3;

    const proj: AllyProjectile = {
      x: this.position.x, y: this.position.y,
      vx: Math.cos(angle) * projSpeed, vy: Math.sin(angle) * projSpeed,
      damage: dmg, color: this.color, ttl: 3, size: projSize,
      sourceUid: this.recruitUid, sourceType: this.className,
    };

    // Mage splash
    if (this.className === 'mage') {
      proj.splash = true;
      proj.splashRadius = 40;
      proj.splashDamage = dmg * 0.5;
    }

    // Equipment explosive
    if (this.hasExplosiveAttacks) {
      proj.splash = true;
      proj.splashRadius = 30;
      proj.splashDamage = dmg * 0.3;
    }

    this.projectiles.push(proj);

    // Scout mark: apply debuff to target
    if (this.className === 'scout') {
      applyDebuff(target as unknown as Debuffable, {
        id: 'scoutMark',
        source: this.recruitUid,
        duration: 3,
        effects: { damageTakenMultiplier: 1.15 },
      });
    }

    // Muzzle flash effect
    if (this.effectsCallback) {
      this.effectsCallback.addMuzzleFlash(this.position.x, this.position.y, angle, this.color);
    }
  }

  private dealDamage(enemy: Enemy, dmg: number): void {
    if (!enemy.alive) return;
    const effectiveDmg = Math.min(enemy.health, dmg);
    enemy.takeDamage(dmg);
    enemy.lastHitWeaponId = `ally_${this.className}`;

    if (this.damageCallback && effectiveDmg > 0) {
      this.damageCallback(`ally_${this.className}`, effectiveDmg);
    }

    if (enemy.health <= 0) {
      this.onKill(enemy);
    }
    // Damage numbers are queued by Enemy.takeDamage and drained in SpawnSystem;
    // avoid double-rendering here.
  }

  private onKill(enemy: Enemy): void {
    this.killCount++;
    this.xpGained += 10;

    if (this.lifesteal || this.hasVampiric) {
      const healAmount = this.hasVampiric ? 2 : 1;
      this.health = Math.min(this.maxHealth, this.health + healAmount);
    }

    const moneyAmount = this.moneyFinder ? Math.ceil(enemy.moneyValue * 0.5) : 0;
    if (moneyAmount > 0 && this.moneyCallback) {
      this.moneyCallback(Math.round(moneyAmount * this.synergyMoneyMult));
    }
  }

  private healNearestAlly(allies: Ally[]): void {
    let lowest: Ally | null = null;
    let lowestPct = 1;
    for (const a of allies) {
      if (!a.alive || a === this) continue;
      const pct = a.health / a.maxHealth;
      if (pct < lowestPct) { lowestPct = pct; lowest = a; }
    }
    if (lowest && lowestPct < 1) {
      const healAmount = 3 * this.synergyHealMult;
      lowest.health = Math.min(lowest.maxHealth, lowest.health + healAmount);
      this.healBeams.push({
        x1: this.position.x, y1: this.position.y,
        x2: lowest.position.x, y2: lowest.position.y,
        color: '#FF88FF', life: 0.3,
      });
    }
    this.fireCooldown = 0.5;
  }

  private updateProjectiles(deltaTime: number, enemies: Enemy[]): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= deltaTime;
      if (p.ttl <= 0) {
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
        continue;
      }
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      for (const e of enemies) {
        if (!e.alive) continue;
        const hr = 12 + e.size / 2;
        const edx = e.position.x - p.x;
        const edy = e.position.y - p.y;
        if (edx * edx + edy * edy < hr * hr) {
          this.dealDamage(e, p.damage);

          // Splash damage
          if (p.splash && p.splashRadius && p.splashDamage) {
            const sr2 = p.splashRadius * p.splashRadius;
            for (const other of enemies) {
              if (other === e || !other.alive) continue;
              const sdx = other.position.x - p.x;
              const sdy = other.position.y - p.y;
              if (sdx * sdx + sdy * sdy < sr2) {
                this.dealDamage(other, p.splashDamage);
              }
            }
            if (this.effectsCallback) {
              this.effectsCallback.addExplosionEffect(p.x, p.y, p.splashRadius);
            }
          }

          this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
          this.projectiles.pop();
          break;
        }
      }
    }
  }

  private updateMeleeFlashes(deltaTime: number): void {
    for (let i = this.meleeFlashes.length - 1; i >= 0; i--) {
      this.meleeFlashes[i].life -= deltaTime;
      if (this.meleeFlashes[i].life <= 0) {
        this.meleeFlashes[i] = this.meleeFlashes[this.meleeFlashes.length - 1];
        this.meleeFlashes.pop();
      }
    }
  }

  private updateHealBeams(deltaTime: number): void {
    for (let i = this.healBeams.length - 1; i >= 0; i--) {
      this.healBeams[i].life -= deltaTime;
      if (this.healBeams[i].life <= 0) {
        this.healBeams[i] = this.healBeams[this.healBeams.length - 1];
        this.healBeams.pop();
      }
    }
  }

  private updateUtility(deltaTime: number): void {
    if (!this.isUtility) return;
    this.utilityTimer += deltaTime;
    const interval = 8;
    if (this.utilityTimer >= interval) {
      this.utilityTimer -= interval;
      const base = 5 + (this.quality === 'epic' ? 15 : this.quality === 'rare' ? 8 : this.quality === 'uncommon' ? 3 : 0);
      const amount = Math.round(base * this.synergyMoneyMult);
      if (this.moneyCallback) this.moneyCallback(amount);
    }
  }

  private updateSpecials(deltaTime: number, _enemies: Enemy[]): void {
    // Sniper charge indicator
    if (this.className === 'sniper' && !this.charged) {
      this.chargeTimer += deltaTime;
      if (this.chargeTimer >= 2) this.charged = true;
    }

    // Healer regen aura: passive 0.5 HP/s to all allies within range (handled in AllySystem)

    // Equipment regen
    if (this.hasRegen) {
      this.regenTimer += deltaTime;
      if (this.regenTimer >= 1) {
        this.regenTimer -= 1;
        this.health = Math.min(this.maxHealth, this.health + 1);
      }
    }

    // Berserker rage decay
    if (this.className === 'berserker' && this.rageStacks > 0) {
      this.rageStacks = Math.max(0, this.rageStacks - deltaTime * 0.5);
    }
  }

  takeDamage(amount: number): void {
    if (this.blockChance > 0 && Math.random() < this.blockChance) return;
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) return;

    let finalDmg = amount * this.ironSkinMult;

    // Tank: 30% passive damage reduction
    if (this.className === 'tank') finalDmg *= 0.7;

    // Flat armor from equipment
    finalDmg = Math.max(0.1, finalDmg - this.flatArmor);

    this.health -= finalDmg;
    this.hitFlashTimer = 0.08;

    // Berserker: gain rage on hit
    if (this.className === 'berserker') {
      this.rageStacks = Math.min(5, this.rageStacks + 1);
    }

    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.deathCallback) this.deathCallback(this.recruitUid);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;
    const x = this.position.x;
    const y = this.position.y;
    const s = this.size;

    // Melee swing arcs
    for (const flash of this.meleeFlashes) {
      const alpha = flash.life / flash.maxLife;
      ctx.save();
      ctx.translate(flash.x, flash.y);
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = flash.color;
      if (flash.arc >= Math.PI * 1.9) {
        ctx.beginPath();
        ctx.arc(0, 0, flash.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, flash.radius, flash.angle - flash.arc / 2, flash.angle + flash.arc / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Heal beams
    for (const beam of this.healBeams) {
      ctx.save();
      ctx.globalAlpha = beam.life * 2;
      ctx.strokeStyle = beam.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Tank taunt radius
    if (this.className === 'tank' && this.tauntRadius > 0) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.arc(x, y, this.tauntRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(x, y, this.tauntRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Sniper charge indicator (laser sight)
    if (this.className === 'sniper' && this.charged) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + Math.cos(this.moveAngle) * this.range,
        y + Math.sin(this.moveAngle) * this.range
      );
      ctx.stroke();
      ctx.restore();
    }

    // Quality glow
    if (this.quality !== 'common') {
      ctx.shadowColor = this.qualityColor;
      ctx.shadowBlur = this.quality === 'epic' ? 10 : this.quality === 'rare' ? 6 : 3;
    }

    // Hit flash
    const bodyColor = this.hitFlashTimer > 0 ? '#FFFFFF' : this.color;
    ctx.fillStyle = bodyColor;

    // Class-specific body shape
    switch (this.shape) {
      case 'diamond':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-s / 2.8, -s / 2.8, s / 1.4, s / 1.4);
        ctx.restore();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(x, y, s / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(x, y - s / 2);
        ctx.lineTo(x - s / 2, y + s / 2);
        ctx.lineTo(x + s / 2, y + s / 2);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        if (this.className === 'tank') {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        }
        break;
    }

    ctx.shadowBlur = 0;

    // Class-specific ornaments: hat/weapon/silhouette detail drawn over the body.
    ctx.fillStyle = '#FFFFFF';
    switch (this.className) {
      case 'sniper': {
        // Long rifle line aligned to facing.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.moveAngle);
        ctx.fillStyle = '#CCCC00';
        ctx.fillRect(s / 2, -1, 14, 2);
        // Scope bump.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(s / 2 + 3, -3, 3, 2);
        ctx.restore();
        break;
      }
      case 'tank': {
        // Thick double outline already drawn in body; add shield blade.
        ctx.strokeStyle = '#DDDDDD';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(x - 2, y - s / 2 - 4, 4, 3);
        break;
      }
      case 'healer': {
        // Big white cross.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 1, y - 5, 2, 10);
        ctx.fillRect(x - 5, y - 1, 10, 2);
        break;
      }
      case 'medic': {
        // Red cross + vial antenna.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 1, y - 4, 2, 8);
        ctx.fillRect(x - 4, y - 1, 8, 2);
        ctx.fillStyle = '#FF4466';
        ctx.fillRect(x + s / 2 - 1, y - s / 2 - 4, 2, 3);
        break;
      }
      case 'mage': {
        // Staff tip with sparkle.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.moveAngle);
        ctx.fillStyle = '#AA88FF';
        ctx.fillRect(s / 2, -1, 6, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(s / 2 + 7, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'brawler': {
        // Twin fist dots.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.moveAngle);
        ctx.fillStyle = '#FFDDAA';
        ctx.fillRect(s / 2 - 1, -4, 3, 3);
        ctx.fillRect(s / 2 - 1,  1, 3, 3);
        ctx.restore();
        break;
      }
      case 'berserker': {
        // Axe blade arc.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.moveAngle);
        ctx.fillStyle = '#AA2222';
        ctx.beginPath();
        ctx.moveTo(s / 2, -4);
        ctx.lineTo(s / 2 + 7, 0);
        ctx.lineTo(s / 2, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'scout': {
        // Feather streak (speed lines behind).
        ctx.strokeStyle = '#66FFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - s / 2 - 4, y - 2);
        ctx.lineTo(x - s / 2, y - 2);
        ctx.moveTo(x - s / 2 - 4, y + 2);
        ctx.lineTo(x - s / 2, y + 2);
        ctx.stroke();
        break;
      }
      case 'gunner': {
        // Pistol barrel nub.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.moveAngle);
        ctx.fillStyle = '#222222';
        ctx.fillRect(s / 2 - 1, -1, 5, 2);
        ctx.restore();
        break;
      }
      case 'taxCollector': {
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('$', x, y + 4);
        break;
      }
      default:
        if (this.isUtility) {
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('$', x, y + 4);
        } else if (this.isHealer) {
          ctx.fillRect(x - 1, y - 4, 2, 8);
          ctx.fillRect(x - 4, y - 1, 8, 2);
        } else if (this.isMelee) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(this.moveAngle);
          ctx.fillRect(s / 2 - 2, -1, 8, 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(
            x + Math.cos(this.moveAngle) * (s / 2 + 3),
            y + Math.sin(this.moveAngle) * (s / 2 + 3),
            2, 0, Math.PI * 2
          );
          ctx.fill();
        }
        break;
    }

    // Equipment indicators (small colored squares stacked in corner, one per slot)
    if (this.equipment && this.equipment.length > 0) {
      for (let ei = 0; ei < this.equipment.length; ei++) {
        const equip = EQUIPMENT[this.equipment[ei]];
        if (!equip) continue;
        const eColor = equip.type === 'weapon' ? '#FF4444' : equip.type === 'armor' ? '#4488FF' : '#44FF44';
        ctx.fillStyle = eColor;
        ctx.fillRect(x + s / 2 - 3, y - s / 2 + ei * 5, 4, 4);
      }
    }

    // Berserker rage indicator
    if (this.className === 'berserker' && this.rageStacks > 0) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      const pulseSize = s / 2 + 3 + this.rageStacks;
      ctx.globalAlpha = 0.3 + this.rageStacks * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Last Stand indicator
    if (this.lastStand && this.health / this.maxHealth < 0.25) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, s / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Low health pulse
    if (this.health / this.maxHealth < 0.25 && this.health > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      ctx.restore();
    }

    // Level-up flash
    if (this.levelUpFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.levelUpFlash;
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, s + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Health bar
    const barW = s * 1.4;
    const barH = 3;
    const barY = y - s / 2 - 6;
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    ctx.fillStyle = this.health / this.maxHealth > 0.3 ? this.qualityColor : '#FF0000';
    ctx.fillRect(x - barW / 2, barY, barW * (this.health / this.maxHealth), barH);

    // Name tag (uncommon+)
    if (this.quality !== 'common') {
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.qualityColor;
      ctx.fillText(this.name, x, barY - 2);
    }

    // Kill count (if any)
    if (this.killCount > 0) {
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`${this.killCount}`, x, y + s / 2 + 9);
    }

    // Projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export class AllySystem {
  allies: Ally[];
  recentDeaths: string[];
  formation: FormationType;
  activeSynergies: ActiveSynergy[];
  damageCallback: ((sourceId: string, amount: number) => void) | null;
  moneyCallback: ((amount: number) => void) | null;
  deathCallback: ((uid: string) => void) | null;
  effectsSystem: EffectsSystem | null;
  waveNumber: number;

  constructor() {
    this.allies = [];
    this.recentDeaths = [];
    this.formation = 'spread';
    this.activeSynergies = [];
    this.damageCallback = null;
    this.moneyCallback = null;
    this.deathCallback = null;
    this.effectsSystem = null;
    this.waveNumber = 1;
  }

  addAlly(recruit: RecruitData, x: number, y: number): Ally {
    const ally = new Ally(recruit);
    ally.position.x = x;
    ally.position.y = y;
    ally.damageCallback = this.damageCallback;
    ally.moneyCallback = this.moneyCallback;
    ally.deathCallback = this.deathCallback;
    ally.effectsCallback = this.effectsSystem;
    this.allies.push(ally);
    return ally;
  }

  setSynergies(synergies: ActiveSynergy[], roster: RecruitData[]): void {
    this.activeSynergies = synergies;
    for (const ally of this.allies) {
      const rd = roster.find(r => r.uid === ally.recruitUid);
      if (!rd) continue;
      ally.synergyDamageMult = getSynergyMultiplier(synergies, rd, 'damageMultiplier');
      ally.synergyHealthMult = getSynergyMultiplier(synergies, rd, 'healthMultiplier');
      ally.synergyFireRateMult = getSynergyMultiplier(synergies, rd, 'fireRateMultiplier');
      ally.synergySpeedMult = getSynergyMultiplier(synergies, rd, 'speedMultiplier');
      ally.synergyMoneyMult = getSynergyMultiplier(synergies, rd, 'moneyMultiplier');
      ally.synergyHealMult = getSynergyMultiplier(synergies, rd, 'healingMultiplier');
    }
  }

  calculateFormationPositions(playerPos: { x: number; y: number }): void {
    const n = this.allies.length;
    if (n === 0) return;

    switch (this.formation) {
      case 'tight':
        for (let i = 0; i < n; i++) {
          const angle = (Math.PI * 2 * i) / n;
          this.allies[i].formationTarget = {
            x: playerPos.x + Math.cos(angle) * 40,
            y: playerPos.y + Math.sin(angle) * 40,
          };
        }
        break;
      case 'circle':
        for (let i = 0; i < n; i++) {
          const angle = (Math.PI * 2 * i) / n;
          this.allies[i].formationTarget = {
            x: playerPos.x + Math.cos(angle) * 100,
            y: playerPos.y + Math.sin(angle) * 100,
          };
        }
        break;
      case 'vformation': {
        const sorted = [...this.allies].sort((a, b) => {
          const aMelee = a.isMelee ? 0 : 1;
          const bMelee = b.isMelee ? 0 : 1;
          return aMelee - bMelee;
        });
        for (let i = 0; i < sorted.length; i++) {
          const row = Math.floor(i / 2);
          const side = i % 2 === 0 ? -1 : 1;
          sorted[i].formationTarget = {
            x: playerPos.x - row * 30,
            y: playerPos.y + side * (row + 1) * 25,
          };
        }
        break;
      }
      case 'spread':
      default:
        for (const ally of this.allies) {
          ally.formationTarget = null;
        }
        break;
    }
  }

  update(deltaTime: number, enemies: Enemy[], playerPos?: { x: number; y: number }): void {
    if (playerPos) {
      this.calculateFormationPositions(playerPos);
    }

    // Healer regen aura: passive 0.5 HP/s to allies within range (only for aura healers, not medic).
    for (const ally of this.allies) {
      if (!ally.alive || !ally.isHealer || ally.className === 'medic') continue;
      const r2 = ally.range * ally.range;
      for (const other of this.allies) {
        if (!other.alive || other === ally) continue;
        const dx = other.position.x - ally.position.x;
        const dy = other.position.y - ally.position.y;
        if (dx * dx + dy * dy < r2) {
          other.health = Math.min(other.maxHealth, other.health + 0.5 * ally.synergyHealMult * deltaTime);
        }
      }
    }

    for (const ally of this.allies) ally.update(deltaTime, enemies, this.allies, playerPos);

    // Update enemy debuffs
    for (const enemy of enemies) {
      updateDebuffs(enemy as unknown as Debuffable, deltaTime);
    }

    // Track deaths — reuse array in place (length = 0) to avoid per-frame allocations.
    this.recentDeaths.length = 0;
    let aliveN = this.allies.length;
    for (let i = aliveN - 1; i >= 0; i--) {
      const ally = this.allies[i];
      if (!ally.alive) {
        this.recentDeaths.push(ally.recruitUid);
        if (this.effectsSystem) {
          for (let k = 0; k < 12; k++) {
            const angle = (Math.PI * 2 * k) / 12;
            const speed = 80 + Math.random() * 80;
            this.effectsSystem.particles.push({
              x: ally.position.x, y: ally.position.y,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              life: 0.6, maxLife: 0.6, color: ally.color, size: 3,
            });
          }
          this.effectsSystem.floatingTexts.push({
            x: ally.position.x, y: ally.position.y - 20,
            text: `${ally.name} fell!`, color: '#FF4444', life: 2.0, fontSize: 12,
          });
        }
        this.allies[i] = this.allies[--aliveN];
      }
    }
    this.allies.length = aliveN;

    // Tank taunt: enemies prefer targeting tank
    for (const ally of this.allies) {
      if (ally.className !== 'tank' || !ally.alive) continue;
      const t2 = ally.tauntRadius * ally.tauntRadius;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = ally.position.x - enemy.position.x;
        const dy = ally.position.y - enemy.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < t2 && d2 > 0.01) {
          const inv = 1 / Math.sqrt(d2);
          enemy.position.x += dx * inv * 15 * deltaTime;
          enemy.position.y += dy * inv * 15 * deltaTime;
        }
      }
    }

    // Contact damage from enemies
    for (const ally of this.allies) {
      if (!ally.alive) continue;
      const ar = ally.size / 2;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - ally.position.x;
        const dy = enemy.position.y - ally.position.y;
        const r = ar + enemy.size / 2;
        if (dx * dx + dy * dy < r * r) {
          ally.takeDamage(enemy.damage * deltaTime);
          if (!ally.alive) break;
        }
      }
    }
  }

  getXpData(): Map<string, number> {
    const data = new Map<string, number>();
    for (const ally of this.allies) {
      data.set(ally.recruitUid, ally.xpGained);
    }
    return data;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const ally of this.allies) ally.render(ctx);

    // Synergy HUD
    if (this.activeSynergies.length > 0) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      let sy = 75;
      for (const { synergy } of this.activeSynergies) {
        ctx.fillStyle = '#FFD700';
        ctx.globalAlpha = 0.8;
        ctx.fillText(`[${synergy.icon}] ${synergy.name}`, 5, sy);
        sy += 11;
      }
      ctx.restore();
    }
  }

  getCount(): number { return this.allies.length; }
  clear(): void { this.allies = []; }
}
