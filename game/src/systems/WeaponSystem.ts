import { Projectile } from '../entities/Projectile';
import { BALANCE } from '../config/balance';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EffectsSystem } from './EffectsSystem';
import type { SoundSystem } from './SoundSystem';
import type { Vec2 } from '../types';

export class WeaponSystem {
  weapons: Weapon[];
  effectsSystem: EffectsSystem | null;
  soundSystem: SoundSystem | null;

  constructor(effectsSystem: EffectsSystem | null, soundSystem: SoundSystem | null) {
    this.weapons = [];
    this.effectsSystem = effectsSystem;
    this.soundSystem = soundSystem;
  }

  addWeapon(weapon: Weapon): void {
    weapon.effectsSystem = this.effectsSystem;
    weapon.soundSystem = this.soundSystem;
    this.weapons.push(weapon);
  }

  removeWeapon(weaponId: string): void {
    this.weapons = this.weapons.filter(w => w.id !== weaponId);
  }

  characterDamageMultiplier: number = 1;
  characterFireRateMultiplier: number = 1;

  // Unified damage recorder — direct-damage weapons (Sword/HulkFist/ChainLightning)
  // used to write only to weaponDamageStats, skipping roundStats.damageByWeapon.
  // Passing game.recordDamage through this hook unifies both sinks.
  damageRecorder: ((id: string, amount: number) => void) | null = null;

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], weaponDamageStats: Map<string, number>, aimMode: string, mousePosition: Vec2 | null): void {
    for (let i = 0; i < this.weapons.length; i++) {
      const weapon = this.weapons[i];
      weapon.positionIndex = i;
      weapon.totalWeapons = this.weapons.length;
      weapon.weaponDamageStats = weaponDamageStats;
      weapon.damageRecorder = this.damageRecorder;
      weapon.characterDamageMultiplier = this.characterDamageMultiplier;
      weapon.characterFireRateMultiplier = this.characterFireRateMultiplier;
      weapon.update(deltaTime, player, enemies, projectiles, aimMode, mousePosition);
    }
  }

  render(ctx: CanvasRenderingContext2D, player: Player): void {
    for (const weapon of this.weapons) {
      if (weapon.render) {
        weapon.render(ctx, player);
      }
    }
  }
}

export class Weapon {
  id: string;
  name: string;
  baseFireRate: number;
  baseDamageMultiplier: number;
  baseProjectileCount: number;
  spread: number;
  baseAoeRadius: number;
  description: string;
  cost: number;
  level: number;
  damageMultiplier: number;
  projectileCount: number;
  aoeRadius: number;
  autoAimBonus?: number;
  piercing?: boolean;
  beamWidth?: number;
  spiralPattern?: boolean;
  explosiveNova?: boolean;
  forkLightning?: boolean;
  returnSpeedMultiplier?: number;
  maxBounces?: number;
  chainJumps?: number;
  chainRange?: number;
  boomerangDistance?: number;
  waveAmplitude?: number;
  cooldown: number;
  effectsSystem: EffectsSystem | null;
  soundSystem: SoundSystem | null;
  position: Vec2;
  positionIndex: number;
  totalWeapons: number;
  aimAngle: number;
  weaponDamageStats: Map<string, number> | null;
  damageRecorder: ((id: string, amount: number) => void) | null = null;
  _doubleTapPending: number;

  constructor(id: string, config: Record<string, unknown>, level: number = 1) {
    this.id = id;
    this.name = config.name as string;
    this.baseFireRate = config.fireRate as number;
    this.baseDamageMultiplier = config.damageMultiplier as number;
    this.baseProjectileCount = (config.projectileCount as number) || 1;
    this.spread = (config.spread as number) || 0;
    this.baseAoeRadius = (config.aoeRadius as number) || 0;
    this.description = config.description as string;
    this.cost = config.cost as number;
    this.level = level;

    const upgrades = (BALANCE.weaponUpgrades as unknown as Record<string, Record<string, unknown>>)[id] || {};
    this.damageMultiplier = this.baseDamageMultiplier + ((upgrades.damage as number) || 0) * (level - 1);
    this.projectileCount = this.baseProjectileCount + Math.floor(((upgrades.projectileCount as number) || 0) * (level - 1));
    this.aoeRadius = this.baseAoeRadius + ((upgrades.aoeRadius as number) || 0) * (level - 1);
    // Per-level fire-rate bonus (declared in BALANCE.weaponUpgrades but was
    // never applied — pistol/laserBeam "+15%/+30% fire rate per level" silently
    // did nothing). Scales the baseFireRate so `getFireRate()` picks it up.
    const fireRatePerLevel = (upgrades.fireRate as number) || 0;
    if (fireRatePerLevel > 0 && level > 1) {
      this.baseFireRate = this.baseFireRate * (1 + fireRatePerLevel * (level - 1));
    }

    if (upgrades.special) {
      switch (upgrades.special) {
        case 'accuracy':
          this.autoAimBonus = 5 * (level - 1);
          break;
        case 'spread':
          this.spread = this.spread * Math.pow(0.85, level - 1);
          break;
        case 'penetration':
          if (level >= 3) this.piercing = true;
          break;
        case 'multiRocket':
          if (level >= 4) this.projectileCount = 2;
          break;
        case 'width':
          this.beamWidth = 2 + (level - 1) * 2;
          break;
        case 'precision':
          this.spread = this.spread * Math.pow(0.75, level - 1);
          break;
        case 'spiral':
          if (level >= 3) this.spiralPattern = true;
          break;
        case 'explosive':
          if (level >= 4) this.explosiveNova = true;
          break;
        case 'fork':
          if (level >= 4) this.forkLightning = true;
          break;
        case 'speed':
          this.returnSpeedMultiplier = 1 + (level - 1) * 0.3;
          break;
      }
    }

    if (id === 'ricochet') {
      this.maxBounces = ((config.maxBounces as number) || 7) + ((upgrades.bounces as number) || 0) * (level - 1);
    }
    if (id === 'chainLightning') {
      this.chainJumps = ((config.chainJumps as number) || 3) + ((upgrades.chainJumps as number) || 0) * (level - 1);
      this.chainRange = ((config.chainRange as number) || 80) + ((upgrades.chainRange as number) || 0) * (level - 1);
    }
    if (id === 'boomerang') {
      this.boomerangDistance = ((config.boomerangDistance as number) || 200) + ((upgrades.boomerangDistance as number) || 0) * (level - 1);
    }
    if (id === 'waveGun') {
      this.waveAmplitude = 100 + ((upgrades.waveAmplitude as number) || 0) * (level - 1);
    }

    this.cooldown = 0;
    this.effectsSystem = null;
    this.soundSystem = null;
    this.position = { x: 0, y: 0 };
    this.positionIndex = 0;
    this.totalWeapons = 1;
    this.aimAngle = 0;
    this.weaponDamageStats = null;
    this._doubleTapPending = 0;
    this.characterDamageMultiplier = 1;
    this.characterFireRateMultiplier = 1;
  }

  characterDamageMultiplier: number;
  characterFireRateMultiplier: number;

  getFireRate(playerStats: Record<string, number>): number {
    return this.baseFireRate * (playerStats.fireRate || 1) * this.characterFireRateMultiplier;
  }

  getDamage(playerStats: Record<string, number>): number {
    return (playerStats.damage || BALANCE.player.baseDamage) * this.damageMultiplier * this.characterDamageMultiplier;
  }

  updateLocation(player: Player): void {
    const angleIndex = (Math.PI * 2 / (this.totalWeapons || 1)) * (this.positionIndex || 0);
    const hoverRadius = player.size / 2 + 15;
    this.position.x = player.position.x + Math.cos(angleIndex) * hoverRadius;
    this.position.y = player.position.y + Math.sin(angleIndex) * hoverRadius;
  }

  updateAim(player: Player, enemies: Enemy[], aimMode: string, mousePosition: Vec2 | null): void {
    if (aimMode === 'manual' && mousePosition) {
      const dx = mousePosition.x - this.position.x;
      const dy = mousePosition.y - this.position.y;
      this.aimAngle = Math.atan2(dy, dx);
    } else if (enemies && enemies.length > 0) {
      let closestEnemy: Enemy | null = null;
      let minDistanceSq = Infinity;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - this.position.x;
        const dy = enemy.position.y - this.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        const distance = Math.sqrt(minDistanceSq);
        const pSpeed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed || 400;
        const timeToHit = distance / pSpeed;
        const predX = closestEnemy.position.x + (closestEnemy.velocity?.x || 0) * timeToHit;
        const predY = closestEnemy.position.y + (closestEnemy.velocity?.y || 0) * timeToHit;
        this.aimAngle = Math.atan2(predY - this.position.y, predX - this.position.x);
      } else {
        this.aimAngle = player.aimAngle;
      }
    } else {
      this.aimAngle = player.aimAngle;
    }
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], aimMode: string = 'auto', mousePosition: Vec2 | null = null): void {
    this.updateLocation(player);
    this.updateAim(player, enemies, aimMode, mousePosition);
    this.cooldown -= deltaTime;

    if (this._doubleTapPending > 0) {
      this._doubleTapPending -= deltaTime;
      if (this._doubleTapPending <= 0 && enemies.length > 0) {
        const ox = player.position.x, oy = player.position.y, oa = player.aimAngle;
        player.position.x = this.position.x;
        player.position.y = this.position.y;
        player.aimAngle = this.aimAngle;
        this.fire(player, enemies, projectiles);
        player.position.x = ox; player.position.y = oy; player.aimAngle = oa;
      }
    }

    const fireRate = this.getFireRate(player.stats || { fireRate: 1 });

    if (this.cooldown <= 0 && enemies.length > 0) {
      const origX = player.position.x;
      const origY = player.position.y;
      const origAim = player.aimAngle;

      player.position.x = this.position.x;
      player.position.y = this.position.y;
      player.aimAngle = this.aimAngle;

      this.fire(player, enemies, projectiles);

      if (player.hasDoubleTap && Math.random() < (BALANCE.items as unknown as Record<string, Record<string, number>>).doubleTap.doubleShotChance) {
        this._doubleTapPending = 0.05;
      }

      player.position.x = origX;
      player.position.y = origY;
      player.aimAngle = origAim;

      // Jitter scales with cycle length (5% of cycle, cap 0.08s) so high-fire-rate
      // weapons (SMG, laser) don't have jitter exceed their own cycle — a bug that
      // made SMG/laser fire cadence effectively random at max stacking.
      { const _cycle = 1 / fireRate; this.cooldown = _cycle + Math.random() * Math.min(0.08, _cycle * 0.05); }
    }
  }

  render(ctx: CanvasRenderingContext2D, _player?: Player): void {
    if (!this.position) return;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.aimAngle);

    switch (this.id) {
      case 'pistol':
        ctx.fillStyle = '#AAAAAA'; ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#555555'; ctx.fillRect(6, -1.5, 6, 3);
        break;
      case 'shotgun':
        ctx.fillStyle = '#663300'; ctx.fillRect(-5, -5, 10, 10);
        ctx.fillStyle = '#333333'; ctx.fillRect(5, -4, 5, 3); ctx.fillRect(5, 1, 5, 3);
        break;
      case 'smg':
        ctx.fillStyle = '#444444'; ctx.fillRect(-7, -2, 14, 4);
        ctx.fillStyle = '#222222'; ctx.fillRect(7, -1, 4, 2);
        ctx.fillRect(-2, 2, 4, 4);
        break;
      case 'rocketLauncher':
        ctx.fillStyle = '#005500'; ctx.fillRect(-8, -4, 16, 8);
        ctx.fillStyle = '#FF0000'; ctx.fillRect(8, -3, 4, 6);
        ctx.fillStyle = '#333333'; ctx.fillRect(-10, -5, 4, 10);
        break;
      case 'laserBeam':
        ctx.fillStyle = '#0000FF'; ctx.fillRect(-9, -2, 18, 4);
        ctx.fillStyle = '#00FFFF'; ctx.fillRect(9, -1, 6, 2);
        break;
      case 'ricochet':
        ctx.fillStyle = '#880088';
        ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FF00FF'; ctx.fillRect(3, -2, 6, 4);
        break;
      case 'waveGun':
        ctx.fillStyle = '#008888'; ctx.fillRect(-6, -4, 10, 8);
        ctx.fillStyle = '#00FFFF';
        ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(10, 0); ctx.lineTo(4, 5); ctx.fill();
        break;
      case 'burstRifle':
        ctx.fillStyle = '#8888AA'; ctx.fillRect(-8, -3, 14, 6);
        ctx.fillStyle = '#333333'; ctx.fillRect(6, -1, 6, 2);
        ctx.fillStyle = '#444466'; ctx.fillRect(-4, 3, 3, 4);
        break;
      case 'orbitalCannon':
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#FFFF00'; ctx.fillRect(6, -1, 3, 2);
        break;
      case 'novaBurst':
        ctx.fillStyle = '#FFA500';
        ctx.translate(2, 0);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-6, -1.5, 12, 3);
        }
        break;
      case 'chainLightning':
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo(-6, -4); ctx.lineTo(2, -4); ctx.lineTo(-2, 0);
        ctx.lineTo(6, 0); ctx.lineTo(0, 5); ctx.lineTo(2, 1);
        ctx.lineTo(-4, 1); ctx.fill();
        break;
      case 'boomerang':
        ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-5, -6); ctx.quadraticCurveTo(5, 0, -5, 6);
        ctx.stroke();
        break;
      case 'sprayAndPray':
        ctx.fillStyle = '#333333'; ctx.fillRect(-10, -3, 20, 6);
        ctx.fillStyle = '#555555'; ctx.fillRect(10, -2, 8, 4);
        ctx.fillStyle = '#222222'; ctx.fillRect(14, -1, 4, 2);
        ctx.fillStyle = '#444444'; ctx.fillRect(-12, -4, 4, 8);
        ctx.fillStyle = '#666600'; ctx.fillRect(-2, 3, 6, 5);
        ctx.fillStyle = '#888800'; ctx.fillRect(0, 3, 2, 3);
        break;
      default:
        ctx.fillStyle = '#AAAAAA'; ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#555555'; ctx.fillRect(6, -1.5, 6, 3);
    }

    ctx.restore();
  }

  fire(_player: Player, _enemies: Enemy[], _projectiles: Projectile[]): void {
    // Override in subclasses
  }

  playShootSound(): void {
    if (this.soundSystem) {
      this.soundSystem.play('shoot');
    }
  }

  addMuzzleFlash(player: Player): void {
    if (this.effectsSystem) {
      this.effectsSystem.addMuzzleFlash(
        player.position.x,
        player.position.y,
        player.aimAngle
      );
    }
  }
}

export class Pistol extends Weapon {
  constructor(level: number = 1) {
    super('pistol', BALANCE.weapons.pistol as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.color = '#FFEE66';
    projectile.trail = true;
    if (this.autoAimBonus) {
      projectile.autoAimRadius = 25 + this.autoAimBonus;
    }
    if (player.hasBounceHouse) {
      const bounces = (BALANCE.items as unknown as Record<string, Record<string, number>>).bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
      projectile.maxBounces = bounces;
    }
    if (player.hasExplosiveRounds) {
      projectile.explosive = true;
      projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius;
      projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
    }
    projectiles.push(projectile);
    this.addMuzzleFlash(player);
    if (this.effectsSystem) {
      this.effectsSystem.addShellCasing(player.position.x, player.position.y);
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootPistol');
    }
  }
}

export class Shotgun extends Weapon {
  constructor(level: number = 1) {
    super('shotgun', BALANCE.weapons.shotgun as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    let bestAngle = player.aimAngle;
    let maxClusterCount = 0;

    if (enemies.length > 0) {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const testDx = enemy.position.x - player.position.x;
        const testDy = enemy.position.y - player.position.y;
        const testAngle = Math.atan2(testDy, testDx);
        let localCount = 0;
        for (const other of enemies) {
          if (!other.alive) continue;
          const dx = other.position.x - player.position.x;
          const dy = other.position.y - player.position.y;
          const angle = Math.atan2(dy, dx);
          let diff = angle - testAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) <= this.spread / 2) localCount++;
        }
        if (localCount > maxClusterCount) {
          maxClusterCount = localCount;
          bestAngle = testAngle;
        }
      }
    }

    for (let i = 0; i < this.projectileCount; i++) {
      const angleOffset = this.projectileCount > 1
        ? (i - (this.projectileCount - 1) / 2) * this.spread / (this.projectileCount - 1)
        : 0;
      const projectile = new Projectile(player.position.x, player.position.y, bestAngle + angleOffset, 'player');
      projectile.damage = damage;
      projectile.weaponId = this.id;
      projectile.piercing = true;
      projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * (0.8 + Math.random() * 0.4);
      if (player.hasBounceHouse) {
        const bounces = (BALANCE.items as unknown as Record<string, Record<string, number>>).bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
        projectile.maxBounces = Math.floor(bounces / 2);
      }
      if (player.hasExplosiveRounds) {
        projectile.explosive = true;
        projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius * 0.5;
        projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
      }
      projectiles.push(projectile);
    }

    this.addMuzzleFlash(player);
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(2.5, 0.15, 'medium');
      for (let i = 0; i < 2; i++) {
        this.effectsSystem.addShellCasing(player.position.x, player.position.y);
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootShotgun');
    }
  }
}

export class SMG extends Weapon {
  constructor(level: number = 1) {
    super('smg', BALANCE.weapons.smg as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const spread = (Math.random() - 0.5) * this.spread;
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle + spread, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.size = 3;
    projectile.color = '#FFD166';
    projectile.trail = true;
    if (this.piercing) {
      projectile.piercing = true;
      projectile.hitEnemies = new Set();
    }
    if (player.hasBounceHouse) {
      const bounces = (BALANCE.items as unknown as Record<string, Record<string, number>>).bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
      projectile.maxBounces = bounces;
    }
    if (player.hasExplosiveRounds) {
      projectile.explosive = true;
      projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius * 0.3;
      projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
    }
    projectiles.push(projectile);
    if (Math.random() < 0.3) {
      this.addMuzzleFlash(player);
      if (this.effectsSystem) {
        this.effectsSystem.addShellCasing(player.position.x, player.position.y);
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootSMG');
    }
  }
}

export class RocketLauncher extends Weapon {
  constructor(level: number = 1) {
    super('rocketLauncher', BALANCE.weapons.rocketLauncher as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    let nearestEnemy: Enemy | null = null;
    let minDistance = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        nearestEnemy = enemy;
      }
    }

    for (let i = 0; i < this.projectileCount; i++) {
      let rocketAngle = player.aimAngle;
      if (nearestEnemy) {
        const dx = nearestEnemy.position.x - player.position.x;
        const dy = nearestEnemy.position.y - player.position.y;
        rocketAngle = Math.atan2(dy, dx);
      }
      if (this.projectileCount > 1) {
        const spread = (i - (this.projectileCount - 1) / 2) * 0.15;
        rocketAngle += spread;
      }
      const projectile = new Projectile(player.position.x, player.position.y, rocketAngle, 'player');
      projectile.damage = damage;
      projectile.weaponId = this.id;
      projectile.size = 10;
      projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 0.7;
      projectile.color = '#FF4500';
      projectile.explosive = true;
      projectile.explosionRadius = this.aoeRadius;
      projectile.explosionDamage = damage;
      projectile.trail = true;
      projectile.homing = true;
      projectile.homingTarget = nearestEnemy;
      projectile.homingStrength = 4.0;
      projectile.maxBounces = 0;
      projectiles.push(projectile);
    }

    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(4, 0.2, 'medium');
      this.effectsSystem.addMuzzleFlash(player.position.x, player.position.y, player.aimAngle, '#FF4500');
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootRocket');
    }
  }
}

export class LaserBeam extends Weapon {
  isBeaming: boolean;
  beamTarget: Enemy | null;

  constructor(level: number = 1) {
    super('laserBeam', BALANCE.weapons.laserBeam as unknown as Record<string, unknown>, level);
    this.isBeaming = false;
    this.beamTarget = null;
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 3;
    projectile.size = this.beamWidth ? Math.max(2, this.beamWidth) : 2;
    projectile.color = '#00FFFF';
    projectile.piercing = true;
    projectile.hitEnemies = new Set();
    projectile.trail = true;
    projectile.lifetime = 0.5;
    projectiles.push(projectile);
    if (this.soundSystem) {
      this.soundSystem.play('shootLaser');
    }
  }
}

export class RicochetGun extends Weapon {
  constructor(level: number = 1) {
    super('ricochet', BALANCE.weapons.ricochet as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.maxBounces = this.maxBounces ?? Infinity;
    projectile.color = '#FF00FF';
    projectile.smartBounce = true;
    projectile.trail = true;
    projectiles.push(projectile);
    this.addMuzzleFlash(player);
    if (this.soundSystem) {
      this.soundSystem.play('shootRicochet');
    }
  }
}

export class WaveGun extends Weapon {
  constructor(level: number = 1) {
    super('waveGun', BALANCE.weapons.waveGun as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const spreadAngle = Math.PI / 8;

    for (let i = 0; i < this.projectileCount; i++) {
      const angleOffset = this.projectileCount > 1
        ? (i - (this.projectileCount - 1) / 2) * (spreadAngle / (this.projectileCount - 1))
        : 0;
      const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle + angleOffset, 'player');
      projectile.damage = damage;
      projectile.weaponId = this.id;
      projectile.piercing = true;
      projectile.waveMotion = true;
      projectile.wavePhase = i * (Math.PI * 2 / this.projectileCount);
      projectile.waveAmplitude = this.waveAmplitude || 100;
      projectile.initialAngle = player.aimAngle + angleOffset;
      projectile.color = '#00FF00';
      projectile.size = 12;
      if (player.hasBounceHouse) {
        const bounces = (BALANCE.items as unknown as Record<string, Record<string, number>>).bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
        projectile.maxBounces = bounces;
      }
      if (player.hasExplosiveRounds) {
        projectile.explosive = true;
        projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius;
        projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
      }
      projectiles.push(projectile);
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootWave');
    }
  }
}

export class BurstRifle extends Weapon {
  burstCount: number;
  burstTimer: number;

  constructor(level: number = 1) {
    super('burstRifle', BALANCE.weapons.burstRifle as unknown as Record<string, unknown>, level);
    this.burstCount = 0;
    this.burstTimer = 0;
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], aimMode: string = 'auto', mousePosition: Vec2 | null = null): void {
    this.updateLocation(player);
    this.updateAim(player, enemies, aimMode, mousePosition);
    this.cooldown -= deltaTime;
    this.burstTimer -= deltaTime;

    const fireRate = this.getFireRate(player.stats || { fireRate: 1 });

    if (this.cooldown <= 0 && enemies.length > 0) {
      this.burstCount = 3;
      this.burstTimer = 0;
      // Jitter scales with cycle length (5% of cycle, cap 0.08s) so high-fire-rate
      // weapons (SMG, laser) don't have jitter exceed their own cycle — a bug that
      // made SMG/laser fire cadence effectively random at max stacking.
      { const _cycle = 1 / fireRate; this.cooldown = _cycle + Math.random() * Math.min(0.08, _cycle * 0.05); }
    }

    if (this.burstCount > 0 && this.burstTimer <= 0) {
      const origX = player.position.x;
      const origY = player.position.y;
      const origAim = player.aimAngle;
      player.position.x = this.position.x;
      player.position.y = this.position.y;
      player.aimAngle = this.aimAngle;
      this.fireBurst(player, projectiles);
      if (player.hasDoubleTap && Math.random() < (BALANCE.items as unknown as Record<string, Record<string, number>>).doubleTap.doubleShotChance) {
        this.fireBurst(player, projectiles);
      }
      player.position.x = origX;
      player.position.y = origY;
      player.aimAngle = origAim;
      this.burstCount--;
      this.burstTimer = 0.08;
    }
  }

  fireBurst(player: Player, projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const angleOffset = (Math.random() - 0.5) * this.spread;
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle + angleOffset, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 1.5;
    projectile.color = '#FFFF00';
    projectile.trail = true;
    projectile.size = 5;
    projectiles.push(projectile);
    if (this.soundSystem) {
      this.soundSystem.play('shootBurst');
    }
  }

  fire(): void {
    // Override to prevent normal fire
  }
}

export class OrbitalCannon extends Weapon {
  constructor(level: number = 1) {
    super('orbitalCannon', BALANCE.weapons.orbitalCannon as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const count = this.projectileCount;
    const spiralOffset = this.spiralPattern ? ((performance.now() * 0.003) % (Math.PI * 2)) : 0;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + spiralOffset;
      const projectile = new Projectile(player.position.x, player.position.y, angle, 'player');
      projectile.damage = damage;
      projectile.weaponId = this.id;
      projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 0.6;
      projectile.size = 8;
      projectile.color = '#FF1493';
      projectile.trail = true;
      projectile.lifetime = 2;
      if (player.hasBounceHouse) {
        projectile.maxBounces = (BALANCE.projectile as unknown as Record<string, number>).bounceHouseMaxBounces;
      }
      projectiles.push(projectile);
    }
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(2.5, 0.15, 'medium');
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        this.effectsSystem.addMuzzleFlash(player.position.x, player.position.y, angle, '#FF1493');
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootOrbital');
    }
  }
}

export class NovaBurst extends Weapon {
  constructor(level: number = 1) {
    super('novaBurst', BALANCE.weapons.novaBurst as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const count = this.projectileCount || 10;
    for (let i = 0; i < count; i++) {
      const angle = player.aimAngle + (Math.PI * 2 / count) * i;
      const projectile = new Projectile(player.position.x, player.position.y, angle, 'player');
      projectile.damage = damage;
      projectile.weaponId = this.id;
      projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 0.8;
      projectile.size = 5;
      projectile.color = '#00FFFF';
      projectile.piercing = true;
      projectile.hitEnemies = new Set();
      projectile.trail = true;
      if (player.hasBounceHouse) {
        projectile.maxBounces = (BALANCE.projectile as unknown as Record<string, number>).bounceHouseMaxBounces;
      }
      if (player.hasExplosiveRounds || this.explosiveNova) {
        projectile.explosive = true;
        projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius;
        projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
      }
      projectiles.push(projectile);
    }
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(1.5, 0.1, 'low');
      for (let i = 0; i < count; i++) {
        const angle = player.aimAngle + (Math.PI * 2 / count) * i;
        this.effectsSystem.addMuzzleFlash(player.position.x, player.position.y, angle, '#00FFFF');
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootNova');
    }
  }
}

export class ChainLightning extends Weapon {
  constructor(level: number = 1) {
    super('chainLightning', BALANCE.weapons.chainLightning as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, enemies: Enemy[], _projectiles: Projectile[]): void {
    if (enemies.length === 0) return;
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });

    let closestEnemy: Enemy | null = null;
    let closestDistance = Infinity;
    const maxInitialRange = 300;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angleToEnemy = Math.atan2(dy, dx);
      const angleDiff = Math.abs(angleToEnemy - player.aimAngle);
      const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
      if (distance < closestDistance && distance <= maxInitialRange && normalizedDiff < Math.PI / 4) {
        closestDistance = distance;
        closestEnemy = enemy;
      }
    }

    if (!closestEnemy) return;

    const primaryEff = Math.min(closestEnemy.health, damage);
    closestEnemy.takeDamage(damage);
    closestEnemy.lastHitWeaponId = this.id;
    // Damage numbers are now queued by Enemy.takeDamage → drained in SpawnSystem.
    if (primaryEff > 0 && this.damageRecorder) this.damageRecorder(this.id, primaryEff);
    const hitEnemies = new Set<Enemy>([closestEnemy]);

    let currentEnemy = closestEnemy;
    let currentDamage = damage;
    let jumpsRemaining = this.chainJumps ?? 3;

    const chainPath: Vec2[] = [{ x: player.position.x, y: player.position.y }];
    chainPath.push({ x: closestEnemy.position.x, y: closestEnemy.position.y });

    while (jumpsRemaining > 0) {
      let nextEnemy: Enemy | null = null;
      let nextDistance = this.chainRange ?? 150;

      for (const enemy of enemies) {
        if (!enemy.alive || hitEnemies.has(enemy)) continue;
        const dx = enemy.position.x - currentEnemy.position.x;
        const dy = enemy.position.y - currentEnemy.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nextDistance) {
          nextDistance = distance;
          nextEnemy = enemy;
        }
      }

      if (!nextEnemy) break;

      currentDamage *= (BALANCE.weapons.chainLightning as unknown as Record<string, number>).chainDamageDecay;
      const jumpEff = Math.min(nextEnemy.health, currentDamage);
      nextEnemy.takeDamage(currentDamage);
      nextEnemy.lastHitWeaponId = this.id;
      // Damage numbers queued by Enemy.takeDamage.
      if (jumpEff > 0 && this.damageRecorder) this.damageRecorder(this.id, jumpEff);
      hitEnemies.add(nextEnemy);
      chainPath.push({ x: nextEnemy.position.x, y: nextEnemy.position.y });
      currentEnemy = nextEnemy;
      jumpsRemaining--;
    }

    if (this.forkLightning) {
      // Fork: from first hit, zap a second nearby enemy with half damage.
      let forkTarget: Enemy | null = null;
      let forkDist = this.chainRange ?? 150;
      for (const enemy of enemies) {
        if (!enemy.alive || hitEnemies.has(enemy)) continue;
        const dx = enemy.position.x - closestEnemy.position.x;
        const dy = enemy.position.y - closestEnemy.position.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < forkDist) { forkDist = d; forkTarget = enemy; }
      }
      if (forkTarget) {
        const forkDmg = damage * 0.5;
        const forkEff = Math.min(forkTarget.health, forkDmg);
        forkTarget.takeDamage(forkDmg);
        forkTarget.lastHitWeaponId = this.id;
        // Damage numbers queued by Enemy.takeDamage.
        if (this.effectsSystem) {
          this.effectsSystem.addChainLightningEffect(
            closestEnemy.position.x, closestEnemy.position.y,
            forkTarget.position.x, forkTarget.position.y
          );
        }
        if (forkEff > 0 && this.damageRecorder) this.damageRecorder(this.id, forkEff);
      }
    }

    if (this.effectsSystem) {
      for (let i = 0; i < chainPath.length - 1; i++) {
        this.effectsSystem.addChainLightningEffect(
          chainPath[i].x, chainPath[i].y,
          chainPath[i + 1].x, chainPath[i + 1].y
        );
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootLightning');
    }
  }
}

export class BoomerangLauncher extends Weapon {
  constructor(level: number = 1) {
    super('boomerang', BALANCE.weapons.boomerang as unknown as Record<string, unknown>, level);
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.size = 8;
    projectile.color = '#00FF88';
    projectile.trail = true;
    projectile.boomerang = true;
    projectile.boomerangDistance = this.boomerangDistance ?? 200;
    projectile.boomerangStartPos = { x: player.position.x, y: player.position.y };
    projectile.boomerangReturning = false;
    projectile.boomerangTravelDistance = 0;
    projectile.hitEnemies = new Set();
    if (this.returnSpeedMultiplier) {
      projectile.speed *= this.returnSpeedMultiplier;
    }
    projectiles.push(projectile);
    this.addMuzzleFlash(player);
    if (this.soundSystem) {
      this.soundSystem.play('shootBoomerang');
    }
  }
}

export class Sword extends Weapon {
  swingArc: number;
  swingRange: number;
  swingTimer: number;
  windUpTimer: number;
  swingAngle: number;
  isSwinging: boolean;
  isWindingUp: boolean;
  swingDirection: number;
  hitEnemiesThisSwing: Set<Enemy>;

  constructor(level: number = 1) {
    super('sword', BALANCE.weapons.sword as unknown as Record<string, unknown>, level);
    this.swingArc = (BALANCE.weapons.sword as unknown as Record<string, number>).swingArc + (level - 1) * (Math.PI / 12);
    this.swingRange = (BALANCE.weapons.sword as unknown as Record<string, number>).swingRange + (level - 1) * 10;
    this.swingTimer = 0;
    this.windUpTimer = 0;
    this.swingAngle = 0;
    this.isSwinging = false;
    this.isWindingUp = false;
    this.swingDirection = 0;
    this.hitEnemiesThisSwing = new Set();
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], _projectiles: Projectile[], aimMode: string, mousePosition: Vec2 | null): void {
    this.updateLocation(player);
    this.updateAim(player, enemies, aimMode, mousePosition);
    this.cooldown -= deltaTime;

    if (this.isWindingUp) {
      this.windUpTimer -= deltaTime;
      if (this.windUpTimer <= 0) {
        this.isWindingUp = false;
        this.isSwinging = true;
        this.swingTimer = (BALANCE.weapons.sword as unknown as Record<string, number>).swingDuration;
        this.hitEnemiesThisSwing.clear();
      }
      return;
    }

    if (this.isSwinging) {
      this.swingTimer -= deltaTime;
      const swingDuration = (BALANCE.weapons.sword as unknown as Record<string, number>).swingDuration;
      const progress = 1 - (this.swingTimer / swingDuration);
      this.swingAngle = this.swingDirection - this.swingArc / 2 + this.swingArc * progress;

      const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
      for (const enemy of enemies) {
        if (!enemy.alive || this.hitEnemiesThisSwing.has(enemy)) continue;
        const dx = enemy.position.x - this.position.x;
        const dy = enemy.position.y - this.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.swingRange + enemy.size / 2) continue;
        const enemyAngle = Math.atan2(dy, dx);
        let angleDiff = enemyAngle - this.swingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) < this.swingArc / 2) {
          let finalDamage = damage;
          const critRoll = Math.random() * 100;
          const stats = player.stats || {};
          if (critRoll < (stats.critChance || 0)) {
            finalDamage *= (stats.critDamage || 150) / 100;
          }
          const effectiveDamage = Math.min(enemy.health, finalDamage);
          enemy.takeDamage(finalDamage);
          enemy.lastHitWeaponId = this.id;
          this.hitEnemiesThisSwing.add(enemy);
          if (this.id === 'hulkFist') {
            const ext = this as unknown as Record<string, number>;
            ext._hulkHitTotal = (ext._hulkHitTotal || 0) + 1;
          }

          // Routes through game.recordDamage which mirrors into both
          // weaponDamageStats (HUD) and roundStats.damageByWeapon (per-wave).
          if (effectiveDamage > 0 && this.damageRecorder) this.damageRecorder(this.id, effectiveDamage);
          if (this.effectsSystem) {
            // Damage numbers queued by Enemy.takeDamage.
            this.effectsSystem.addImpactEffect(enemy.position.x, enemy.position.y);
          }
          if (this.soundSystem) {
            this.soundSystem.play('hit');
          }
          if (player.hasLifeSteal) {
            const healAmount = finalDamage * (BALANCE.items as unknown as Record<string, Record<string, number>>).lifeSteal.lifeStealPercent;
            if (healAmount > 0.5) {
              player.health = Math.min(player.maxHealth, player.health + healAmount);
            }
          }
        }
      }

      if (this.swingTimer <= 0) {
        this.isSwinging = false;
      }
    } else if (this.cooldown <= 0 && enemies.length > 0) {
      const fireRate = this.getFireRate(player.stats || { fireRate: 1 });
      this.isWindingUp = true;
      this.windUpTimer = (BALANCE.weapons.sword as unknown as Record<string, number>).windUpDuration;
      this.swingDirection = this.aimAngle;
      // Jitter scales with cycle length (5% of cycle, cap 0.08s) so high-fire-rate
      // weapons (SMG, laser) don't have jitter exceed their own cycle — a bug that
      // made SMG/laser fire cadence effectively random at max stacking.
      { const _cycle = 1 / fireRate; this.cooldown = _cycle + Math.random() * Math.min(0.08, _cycle * 0.05); }
      if (this.soundSystem) {
        this.soundSystem.play(this.id === 'hulkFist' ? 'fistSwing' : 'swordSwing');
      }
    }
  }

  renderBlade(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-2, -3, 8, 6);
    ctx.fillStyle = '#FFDD00';
    ctx.fillRect(5, -5, 4, 10);
    ctx.fillStyle = '#CCCCCC';
    ctx.fillRect(9, -2.5, 22, 5);
    ctx.fillStyle = '#EEEEEE';
    ctx.beginPath();
    ctx.moveTo(31, -2.5);
    ctx.lineTo(37, 0);
    ctx.lineTo(31, 2.5);
    ctx.fill();
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.position) return;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);

    if (this.isWindingUp) {
      const progress = 1 - (this.windUpTimer / (BALANCE.weapons.sword as unknown as Record<string, number>).windUpDuration);
      ctx.globalAlpha = 0.08 + progress * 0.15;
      ctx.fillStyle = '#FFDD00';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.swingRange, this.swingDirection - this.swingArc / 2, this.swingDirection + this.swingArc / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#FFDD00';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3 + progress * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, this.swingRange, this.swingDirection - this.swingArc / 2, this.swingDirection + this.swingArc / 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      const pullBackAngle = this.swingDirection - this.swingArc / 2 - (Math.PI / 3) * (0.5 + progress * 0.5);
      const shake = progress * 2.5;
      const shakeOffset = Math.sin(performance.now() * 0.05) * shake;
      ctx.rotate(pullBackAngle + shakeOffset * 0.05);
      ctx.shadowColor = '#FFDD00';
      ctx.shadowBlur = 4 + progress * 12;
      this.renderBlade(ctx);
      ctx.shadowBlur = 0;
    } else if (this.isSwinging) {
      const swingProgress = 1 - (this.swingTimer / (BALANCE.weapons.sword as unknown as Record<string, number>).swingDuration);
      ctx.globalAlpha = 0.12 * (1 - swingProgress);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.swingRange, this.swingDirection - this.swingArc / 2, this.swingDirection + this.swingArc / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.swingRange, this.swingDirection - this.swingArc / 2, this.swingAngle);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.rotate(this.swingAngle);
      this.renderBlade(ctx);
    } else {
      ctx.rotate(this.aimAngle || 0);
      this.renderBlade(ctx);
    }

    ctx.restore();
  }
}

export class HulkFist extends Sword {
  hitCount: number;
  fistLevel: number;

  constructor(level: number = 1) {
    super(level);
    this.id = 'hulkFist';
    this.swingArc = Math.PI * 0.8 + (level - 1) * (Math.PI / 8);
    this.swingRange = 120 + (level - 1) * 15;
    this.hitCount = 0;
    this.fistLevel = level;
  }

  getDamage(stats: Record<string, number>): number {
    const baseDmg = (stats.damage || 1) * Math.pow(2, this.fistLevel - 1);
    return baseDmg * this.damageMultiplier;
  }

  getFireRate(stats: Record<string, number>): number {
    const base = super.getFireRate(stats);
    return base * (1 + (this.fistLevel - 1) * 0.3);
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], aimMode: string, mousePosition: Vec2 | null): void {
    const prevSwinging = this.isSwinging;
    super.update(deltaTime, player, enemies, projectiles, aimMode, mousePosition);
    if (prevSwinging && !this.isSwinging) {
      this.hitCount++;
      if (this.hitCount >= 3) {
        this.groundSlam(player, enemies);
        this.hitCount = 0;
      }
    }
  }

  groundSlam(player: Player, enemies: Enemy[]): void {
    const damage = this.getDamage(player.stats || { damage: 1 }) * 1.5;
    const radius = damage * 3;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - this.position.x;
      const dy = enemy.position.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const effectiveDmg = Math.min(enemy.health, damage);
        enemy.takeDamage(damage);
        enemy.lastHitWeaponId = this.id;
        // Route through recordDamage so RoundStats picks up slam kills; the
        // callback also mirrors into weaponDamageStats (HUD).
        if (effectiveDmg > 0 && this.damageRecorder) this.damageRecorder(this.id, effectiveDmg);
      }
    }
    if (this.effectsSystem) {
      this.effectsSystem.addExplosion(this.position.x, this.position.y, radius, '#4B3621');
    }
    if (this.soundSystem) {
      this.soundSystem.play('explosion');
    }
  }

  renderBlade(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, -8, 20, 16);
    ctx.fillStyle = '#6B4914';
    ctx.fillRect(18, -6, 8, 12);
  }
}

export class SprayAndPray extends Weapon {
  constructor(level: number = 1) {
    super('sprayAndPray', BALANCE.weapons.sprayAndPray as unknown as Record<string, unknown>, level);
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], _aimMode: string, _mousePosition: Vec2 | null): void {
    this.updateLocation(player);
    this.aimAngle = Math.random() * Math.PI * 2;
    this.cooldown -= deltaTime;

    if (this._doubleTapPending > 0) {
      this._doubleTapPending -= deltaTime;
      if (this._doubleTapPending <= 0 && enemies.length > 0) {
        const ox = player.position.x, oy = player.position.y, oa = player.aimAngle;
        player.position.x = this.position.x;
        player.position.y = this.position.y;
        player.aimAngle = Math.random() * Math.PI * 2;
        this.fire(player, enemies, projectiles);
        player.position.x = ox; player.position.y = oy; player.aimAngle = oa;
      }
    }

    const fireRate = this.getFireRate(player.stats || { fireRate: 1 });

    if (this.cooldown <= 0 && enemies.length > 0) {
      const origX = player.position.x;
      const origY = player.position.y;
      const origAim = player.aimAngle;
      player.position.x = this.position.x;
      player.position.y = this.position.y;
      player.aimAngle = this.aimAngle;
      this.fire(player, enemies, projectiles);
      if (player.hasDoubleTap && Math.random() < (BALANCE.items as unknown as Record<string, Record<string, number>>).doubleTap.doubleShotChance) {
        this._doubleTapPending = 0.05;
      }
      player.position.x = origX;
      player.position.y = origY;
      player.aimAngle = origAim;
      // Jitter scales with cycle length (5% of cycle, cap 0.08s) so high-fire-rate
      // weapons (SMG, laser) don't have jitter exceed their own cycle — a bug that
      // made SMG/laser fire cadence effectively random at max stacking.
      { const _cycle = 1 / fireRate; this.cooldown = _cycle + Math.random() * Math.min(0.08, _cycle * 0.05); }
    }
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const angle = Math.random() * Math.PI * 2;
    const projectile = new Projectile(player.position.x, player.position.y, angle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 6.0;
    projectile.velocity.x = Math.cos(angle) * projectile.speed;
    projectile.velocity.y = Math.sin(angle) * projectile.speed;
    if (player.hasBounceHouse) {
      const bounces = (BALANCE.items as unknown as Record<string, Record<string, number>>).bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
      projectile.maxBounces = bounces;
    }
    if (player.hasExplosiveRounds) {
      projectile.explosive = true;
      projectile.explosionRadius = (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeRadius;
      projectile.explosionDamage = damage * (BALANCE.items as unknown as Record<string, Record<string, number>>).explosiveRounds.aoeDamagePercent;
    }
    projectiles.push(projectile);
    this.addMuzzleFlash(player);
    if (this.soundSystem) {
      this.soundSystem.play('shoot');
    }
  }
}

export class Railgun extends Weapon {
  chargeTime: number;
  chargeTimer: number;
  isCharging: boolean;

  constructor(level: number = 1) {
    super('railgun', (BALANCE.weapons as unknown as Record<string, unknown>).railgun as unknown as Record<string, unknown>, level);
    this.chargeTime = (((BALANCE.weapons as unknown as Record<string, unknown>).railgun as unknown as Record<string, number>).chargeDuration) || 0.6;
    this.chargeTimer = 0;
    this.isCharging = false;
  }

  update(deltaTime: number, player: Player, enemies: Enemy[], projectiles: Projectile[], aimMode: string = 'auto', mousePosition: Vec2 | null = null): void {
    this.updateLocation(player);
    this.updateAim(player, enemies, aimMode, mousePosition);
    this.cooldown -= deltaTime;

    if (this.isCharging) {
      this.chargeTimer -= deltaTime;
      if (this.chargeTimer <= 0) {
        this.isCharging = false;
        const origX = player.position.x;
        const origY = player.position.y;
        const origAim = player.aimAngle;
        player.position.x = this.position.x;
        player.position.y = this.position.y;
        player.aimAngle = this.aimAngle;
        this.fire(player, enemies, projectiles);
        player.position.x = origX;
        player.position.y = origY;
        player.aimAngle = origAim;
        const fireRate = this.getFireRate(player.stats || { fireRate: 1 });
        this.cooldown = (1 / fireRate) + Math.random() * 0.05;
      }
      return;
    }

    if (this.cooldown <= 0 && enemies.length > 0) {
      this.isCharging = true;
      this.chargeTimer = this.chargeTime;
    }
  }

  fire(player: Player, _enemies: Enemy[], projectiles: Projectile[]): void {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    const projectile = new Projectile(player.position.x, player.position.y, player.aimAngle, 'player');
    projectile.damage = damage;
    projectile.weaponId = this.id;
    projectile.speed = (BALANCE.projectile as unknown as Record<string, number>).baseSpeed * 4.0;
    projectile.size = Math.max(4, this.beamWidth || 4);
    projectile.color = '#66FFFF';
    projectile.piercing = true;
    projectile.hitEnemies = new Set();
    projectile.trail = true;
    projectile.lifetime = 0.8;
    projectile.velocity.x = Math.cos(player.aimAngle) * projectile.speed;
    projectile.velocity.y = Math.sin(player.aimAngle) * projectile.speed;
    projectiles.push(projectile);

    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(3, 0.18, 'medium');
      this.effectsSystem.addMuzzleFlash(player.position.x, player.position.y, player.aimAngle, '#66FFFF');
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootLaser');
    }
  }

  render(ctx: CanvasRenderingContext2D, _player?: Player): void {
    if (!this.position) return;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = '#444466'; ctx.fillRect(-9, -3, 18, 6);
    ctx.fillStyle = '#222244'; ctx.fillRect(-11, -4, 4, 8);
    ctx.fillStyle = '#66FFFF'; ctx.fillRect(9, -2, 6, 4);

    if (this.isCharging) {
      const progress = 1 - (this.chargeTimer / this.chargeTime);
      ctx.globalAlpha = 0.4 + progress * 0.6;
      ctx.fillStyle = '#AAFFFF';
      const r = 2 + progress * 6;
      ctx.beginPath();
      ctx.arc(14, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#66FFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(14 + 600, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function createWeapon(weaponId: string, level: number = 1): Weapon {
  const config = (BALANCE.weapons as Record<string, unknown>)[weaponId];
  if (!config) return new Pistol(level);

  switch (weaponId) {
    case 'pistol': return new Pistol(level);
    case 'shotgun': return new Shotgun(level);
    case 'smg': return new SMG(level);
    case 'rocketLauncher': return new RocketLauncher(level);
    case 'laserBeam': return new LaserBeam(level);
    case 'ricochet': return new RicochetGun(level);
    case 'waveGun': return new WaveGun(level);
    case 'burstRifle': return new BurstRifle(level);
    case 'orbitalCannon': return new OrbitalCannon(level);
    case 'novaBurst': return new NovaBurst(level);
    case 'chainLightning': return new ChainLightning(level);
    case 'boomerang': return new BoomerangLauncher(level);
    case 'sprayAndPray': return new SprayAndPray(level);
    case 'sword': return new Sword(level);
    case 'hulkFist': return new HulkFist(level);
    case 'railgun': return new Railgun(level);
    default: return new Pistol(level);
  }
}
