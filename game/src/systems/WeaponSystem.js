import { Projectile } from '../entities/Projectile.js';
import { BALANCE } from '../config/balance.js';

export class WeaponSystem {
  constructor(effectsSystem, soundSystem) {
    this.weapons = [];
    this.effectsSystem = effectsSystem;
    this.soundSystem = soundSystem;
  }

  addWeapon(weapon) {
    weapon.effectsSystem = this.effectsSystem;
    weapon.soundSystem = this.soundSystem;
    this.weapons.push(weapon);
  }

  removeWeapon(weaponId) {
    this.weapons = this.weapons.filter(w => w.id !== weaponId);
  }

  update(deltaTime, player, enemies, projectiles) {
    // All weapons fire independently based on their own cooldowns
    for (const weapon of this.weapons) {
      if (enemies.length > 0) {
        weapon.update(deltaTime, player, enemies, projectiles);
      }
    }
  }
}

export class Weapon {
  constructor(id, config, level = 1) {
    this.id = id;
    this.name = config.name;
    this.baseFireRate = config.fireRate; // Base shots per second
    this.baseDamageMultiplier = config.damageMultiplier;
    this.baseProjectileCount = config.projectileCount || 1;
    this.spread = config.spread || 0;
    this.baseAoeRadius = config.aoeRadius || 0;
    this.description = config.description;
    this.cost = config.cost;
    this.level = level;
    
    // Apply upgrade bonuses based on level
    const upgrades = BALANCE.weaponUpgrades[id] || {};
    this.damageMultiplier = this.baseDamageMultiplier + (upgrades.damage || 0) * (level - 1);
    this.projectileCount = this.baseProjectileCount + Math.floor((upgrades.projectileCount || 0) * (level - 1));
    this.aoeRadius = this.baseAoeRadius + (upgrades.aoeRadius || 0) * (level - 1);
    
    // Apply special upgrades based on level
    if (upgrades.special) {
      switch (upgrades.special) {
        case 'accuracy': // Improves auto-aim radius
          this.autoAimBonus = 5 * (level - 1); // +5px auto-aim radius per level
          break;
        case 'spread': // Tighter spread for shotgun
          this.spread = this.spread * Math.pow(0.85, level - 1); // 15% tighter per level
          break;
        case 'penetration': // SMG piercing at level 3+
          if (level >= 3) this.piercing = true;
          break;
        case 'multiRocket': // Dual rockets at level 4
          if (level >= 4) this.projectileCount = 2;
          break;
        case 'width': // Wider laser beam
          this.beamWidth = 2 + (level - 1) * 2; // Wider beam visual
          break;
        case 'precision': // Burst rifle tighter spread
          this.spread = this.spread * Math.pow(0.75, level - 1); // 25% reduction per level
          break;
        case 'spiral': // Orbital cannon spiral pattern
          if (level >= 3) this.spiralPattern = true;
          break;
        case 'explosive': // Nova burst explosive at level 4
          if (level >= 4) this.explosiveNova = true;
          break;
        case 'fork': // Chain lightning forks at level 4
          if (level >= 4) this.forkLightning = true;
          break;
        case 'speed': // Boomerang returns faster
          this.returnSpeedMultiplier = 1 + (level - 1) * 0.3; // 30% faster return per level
          break;
        case 'damage': // Gravity well deals damage at level 3+
          if (level >= 3) this.wellDamage = 0.5; // DPS while in well
          break;
      }
    }
    
    // Special properties based on weapon type
    if (id === 'ricochet') {
      this.maxBounces = (config.maxBounces || 7) + (upgrades.bounces || 0) * (level - 1);
    }
    if (id === 'chainLightning') {
      this.chainJumps = (config.chainJumps || 3) + (upgrades.chainJumps || 0) * (level - 1);
      this.chainRange = (config.chainRange || 80) + (upgrades.chainRange || 0) * (level - 1);
    }
    if (id === 'boomerang') {
      this.boomerangDistance = (config.boomerangDistance || 200) + (upgrades.boomerangDistance || 0) * (level - 1);
    }
    if (id === 'gravityWell') {
      this.wellDuration = (config.wellDuration || 4) + (upgrades.wellDuration || 0) * (level - 1);
      this.wellRadius = (config.wellRadius || 120) + (upgrades.wellRadius || 0) * (level - 1);
    }
    
    this.cooldown = 0;
    this.effectsSystem = null;
    this.soundSystem = null;
  }

  getFireRate(playerStats) {
    // Apply player's fire rate multiplier
    return this.baseFireRate * playerStats.fireRate;
  }

  getDamage(playerStats) {
    return Math.max(1, Math.floor(playerStats.damage * this.damageMultiplier));
  }

  update(deltaTime, player, enemies, projectiles) {
    this.cooldown -= deltaTime;
    
    const fireRate = this.getFireRate(player.stats || { fireRate: 1 });
    
    if (this.cooldown <= 0 && enemies.length > 0) {
      this.fire(player, enemies, projectiles);
      
      // Double tap chance
      if (player.hasDoubleTap && Math.random() < BALANCE.items.doubleTap.doubleShotChance) {
        // Fire again immediately
        setTimeout(() => {
          if (enemies.length > 0) {
            this.fire(player, enemies, projectiles);
          }
        }, 50); // Small delay for visual effect
      }
      
      this.cooldown = 1 / fireRate;
    }
  }

  fire(player, enemies, projectiles) {
    // Override in subclasses
  }

  playShootSound() {
    // Override for specific weapon sounds
    if (this.soundSystem) {
      this.soundSystem.play('shoot');
    }
  }

  addMuzzleFlash(player) {
    if (this.effectsSystem) {
      this.effectsSystem.addMuzzleFlash(
        player.position.x,
        player.position.y,
        player.aimAngle
      );
    }
  }
}

// Pistol - Basic starting weapon
export class Pistol extends Weapon {
  constructor(level = 1) {
    super('pistol', BALANCE.weapons.pistol, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Single projectile in aim direction
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle,
      'player'
    );
    projectile.damage = damage;
    
    // Apply weapon upgrade bonuses
    if (this.autoAimBonus) {
      projectile.autoAimRadius = 25 + this.autoAimBonus; // Base 25px + bonus
    }
    
    // Apply item effects
    if (player.hasBounceHouse) {
      const bounces = BALANCE.items.bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
      projectile.maxBounces = bounces;
    }
    if (player.hasExplosiveRounds) {
      projectile.explosive = true;
      projectile.explosionRadius = BALANCE.items.explosiveRounds.aoeRadius;
      projectile.explosionDamage = damage * BALANCE.items.explosiveRounds.aoeDamagePercent;
    }
    
    projectiles.push(projectile);
    
    // Effects
    this.addMuzzleFlash(player);
    if (this.effectsSystem) {
      this.effectsSystem.addShellCasing(player.position.x, player.position.y);
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootPistol');
    }
  }
}

// Shotgun - Spread shot
export class Shotgun extends Weapon {
  constructor(level = 1) {
    super('shotgun', BALANCE.weapons.shotgun, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Multiple projectiles in a cone
    for (let i = 0; i < this.projectileCount; i++) {
      const angleOffset = (i - (this.projectileCount - 1) / 2) * this.spread / (this.projectileCount - 1);
      const projectile = new Projectile(
        player.position.x,
        player.position.y,
        player.aimAngle + angleOffset,
        'player'
      );
      projectile.damage = damage;
      projectile.piercing = true;  // Shotgun projectiles pierce through enemies
      projectile.speed = BALANCE.projectile.baseSpeed * (0.8 + Math.random() * 0.4); // Variable speed
      
      // Apply item effects
      if (player.hasBounceHouse) {
        const bounces = BALANCE.items.bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
        projectile.maxBounces = Math.floor(bounces / 2); // Shotgun gets half bounces
      }
      if (player.hasExplosiveRounds) {
        projectile.explosive = true;
        projectile.explosionRadius = BALANCE.items.explosiveRounds.aoeRadius * 0.5;
        projectile.explosionDamage = damage * BALANCE.items.explosiveRounds.aoeDamagePercent;
      }
      
      projectiles.push(projectile);
    }
    
    // Effects
    this.addMuzzleFlash(player);
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(2.5, 0.15);
      for (let i = 0; i < 2; i++) {
        this.effectsSystem.addShellCasing(player.position.x, player.position.y);
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootShotgun');
    }
  }
}

// SMG - Rapid fire
export class SMG extends Weapon {
  constructor(level = 1) {
    super('smg', BALANCE.weapons.smg, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Single projectile with small random spread
    const spread = (Math.random() - 0.5) * this.spread;
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle + spread,
      'player'
    );
    projectile.damage = damage;
    projectile.size = 3; // Smaller bullets
    
    // Apply piercing from weapon upgrade (level 3+)
    if (this.piercing) {
      projectile.piercing = true;
      projectile.hitEnemies = new Set();
    }
    
    // Apply item effects
    if (player.hasBounceHouse) {
      const bounces = BALANCE.items.bounceHouse.bouncesPerStack * (player.bounceHouseStacks || 1);
      projectile.maxBounces = bounces;
    }
    if (player.hasExplosiveRounds) {
      projectile.explosive = true;
      projectile.explosionRadius = BALANCE.items.explosiveRounds.aoeRadius * 0.3;
      projectile.explosionDamage = damage * BALANCE.items.explosiveRounds.aoeDamagePercent;
    }
    
    projectiles.push(projectile);
    
    // Effects (less pronounced due to rapid fire)
    if (Math.random() < 0.3) { // Only sometimes show effects to avoid spam
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

// Rocket Launcher - High damage AoE
export class RocketLauncher extends Weapon {
  constructor(level = 1) {
    super('rocketLauncher', BALANCE.weapons.rocketLauncher, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Find nearest enemy for initial target
    let nearestEnemy = null;
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
    
    // Fire multiple rockets based on projectileCount (2 at level 4)
    for (let i = 0; i < this.projectileCount; i++) {
      let rocketAngle = player.aimAngle;
      if (nearestEnemy) {
        const dx = nearestEnemy.position.x - player.position.x;
        const dy = nearestEnemy.position.y - player.position.y;
        rocketAngle = Math.atan2(dy, dx);
      }
      
      if (this.projectileCount > 1) {
        // Spread rockets slightly
        const spread = (i - (this.projectileCount - 1) / 2) * 0.15;
        rocketAngle += spread;
      }
      
      // Create homing rocket projectile
      const projectile = new Projectile(
        player.position.x,
        player.position.y,
        rocketAngle,
        'player'
      );
      projectile.damage = damage;
      projectile.size = 10; // Bigger projectile
      projectile.speed = BALANCE.projectile.baseSpeed * 0.7; // Slower
      projectile.color = '#FF4500'; // Orange rocket
      projectile.explosive = true;
      projectile.explosionRadius = this.aoeRadius;
      projectile.explosionDamage = damage; // Full damage in AoE
      projectile.trail = true; // Add smoke trail
      
      // Make it a homing rocket
      projectile.homing = true;
      projectile.homingTarget = nearestEnemy;
      projectile.homingStrength = 4.0; // Turn speed
      
      // Rockets don't bounce
      projectile.maxBounces = 0;
      
      projectiles.push(projectile);
    }
    
    // Effects
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(4, 0.2);
      this.effectsSystem.addMuzzleFlash(
        player.position.x,
        player.position.y,
        targetAngle,
        '#FF4500'
      );
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootRocket');
    }
  }
}

// Laser Beam - Continuous damage
export class LaserBeam extends Weapon {
  constructor(level = 1) {
    super('laserBeam', BALANCE.weapons.laserBeam, level);
    this.isBeaming = false;
    this.beamTarget = null;
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Create very fast projectiles to simulate beam
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle,
      'player'
    );
    projectile.damage = damage;
    projectile.speed = BALANCE.projectile.baseSpeed * 3; // Very fast
    projectile.size = 2;
    projectile.color = '#00FFFF'; // Cyan beam
    projectile.piercing = true; // Beam goes through enemies
    projectile.lifetime = 0.5; // Short lifetime
    
    projectiles.push(projectile);
    
    if (this.soundSystem) {
      this.soundSystem.play('shootLaser');
    }
  }
}

// Ricochet Gun - Smart bouncing bullets
export class RicochetGun extends Weapon {
  constructor(level = 1) {
    super('ricochet', BALANCE.weapons.ricochet, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle,
      'player'
    );
    projectile.damage = damage;
    projectile.maxBounces = 7;
    projectile.color = '#FF00FF'; // Magenta
    projectile.smartBounce = true; // Custom property for seeking behavior
    
    projectiles.push(projectile);
    
    this.addMuzzleFlash(player);
    if (this.soundSystem) {
      this.soundSystem.play('shootRicochet');
    }
  }
}

// Wave Gun - Sine wave projectiles
export class WaveGun extends Weapon {
  constructor(level = 1) {
    super('waveGun', BALANCE.weapons.waveGun, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    for (let i = 0; i < 3; i++) {
      const projectile = new Projectile(
        player.position.x,
        player.position.y,
        player.aimAngle,
        'player'
      );
      projectile.damage = damage;
      projectile.piercing = true;
      projectile.waveMotion = true; // Custom sine wave motion
      projectile.wavePhase = i * (Math.PI * 2 / 3); // Different phase for each
      projectile.waveAmplitude = 30;
      projectile.color = '#00FF00';
      projectile.size = 6;
      
      projectiles.push(projectile);
    }
    
    if (this.soundSystem) {
      this.soundSystem.play('shootWave');
    }
  }
}

// Burst Rifle - 3-round burst
export class BurstRifle extends Weapon {
  constructor(level = 1) {
    super('burstRifle', BALANCE.weapons.burstRifle, level);
    this.burstCount = 0;
    this.burstTimer = 0;
  }

  update(deltaTime, player, enemies, projectiles) {
    this.cooldown -= deltaTime;
    this.burstTimer -= deltaTime;
    
    const fireRate = this.getFireRate(player.stats || { fireRate: 1 });
    
    // Fire burst if ready
    if (this.cooldown <= 0 && enemies.length > 0) {
      this.burstCount = 3;
      this.burstTimer = 0;
      this.cooldown = 1 / fireRate;
    }
    
    // Fire burst shots
    if (this.burstCount > 0 && this.burstTimer <= 0) {
      this.fireBurst(player, enemies, projectiles);
      this.burstCount--;
      this.burstTimer = 0.08; // Delay between burst shots
    }
  }

  fireBurst(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    const angleOffset = (Math.random() - 0.5) * this.spread;
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle + angleOffset,
      'player'
    );
    projectile.damage = damage;
    projectile.speed = BALANCE.projectile.baseSpeed * 1.5; // Fast bullets
    projectile.color = '#FFFF00';
    
    projectiles.push(projectile);
    
    if (this.soundSystem) {
      this.soundSystem.play('shootBurst');
    }
  }

  fire() {
    // Override to prevent normal fire
  }
}

// Orbital Cannon - Ring of projectiles
export class OrbitalCannon extends Weapon {
  constructor(level = 1) {
    super('orbitalCannon', BALANCE.weapons.orbitalCannon, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Fire ring of projectiles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i;
      const projectile = new Projectile(
        player.position.x,
        player.position.y,
        angle,
        'player'
      );
      projectile.damage = damage;
      projectile.speed = BALANCE.projectile.baseSpeed * 0.6; // Slower expansion
      projectile.size = 8;
      projectile.color = '#FF1493'; // Deep pink
      projectile.lifetime = 2; // Shorter lifetime
      
      // Apply item effects
      if (player.hasBounceHouse) {
        projectile.maxBounces = BALANCE.projectile.bounceHouseMaxBounces;
      }
      
      projectiles.push(projectile);
    }
    
    // Big effect
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(2.5, 0.15);
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        this.effectsSystem.addMuzzleFlash(
          player.position.x,
          player.position.y,
          angle,
          '#FF1493'
        );
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootOrbital');
    }
  }
}

// Nova Burst - 10 piercing projectiles in all directions
export class NovaBurst extends Weapon {
  constructor(level = 1) {
    super('novaBurst', BALANCE.weapons.novaBurst, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Fire 10 projectiles around mouse aim direction (±180 degrees)
    for (let i = 0; i < 10; i++) {
      const angleOffset = (Math.PI * 2 / 10) * i;
      const angle = player.aimAngle + angleOffset;
      const projectile = new Projectile(
        player.position.x,
        player.position.y,
        angle,
        'player'
      );
      projectile.damage = damage;
      projectile.speed = BALANCE.projectile.baseSpeed * 0.8; // Moderate speed
      projectile.size = 5;
      projectile.color = '#00FFFF'; // Cyan
      projectile.piercing = true; // All projectiles pierce
      projectile.hitEnemies = new Set(); // Track enemies hit for piercing
      
      // Apply item effects
      if (player.hasBounceHouse) {
        projectile.maxBounces = BALANCE.projectile.bounceHouseMaxBounces;
      }
      if (player.hasExplosiveRounds) {
        projectile.explosive = true;
        projectile.explosionRadius = BALANCE.items.explosiveRounds.aoeRadius;
        projectile.explosionDamage = damage * BALANCE.items.explosiveRounds.aoeDamagePercent;
      }
      
      projectiles.push(projectile);
    }
    
    // Nova burst effect
    if (this.effectsSystem) {
      this.effectsSystem.addScreenShake(1.5, 0.1);
      // Create expanding ring effect
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 / 10) * i;
        this.effectsSystem.addMuzzleFlash(
          player.position.x,
          player.position.y,
          angle,
          '#00FFFF'
        );
      }
    }
    if (this.soundSystem) {
      this.soundSystem.play('shootNova');
    }
  }
}

// Chain Lightning - Lightning that jumps between enemies
export class ChainLightning extends Weapon {
  constructor(level = 1) {
    super('chainLightning', BALANCE.weapons.chainLightning, level);
  }

  fire(player, enemies, projectiles) {
    if (enemies.length === 0) return;
    
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    // Find closest enemy in aim direction
    let closestEnemy = null;
    let closestDistance = Infinity;
    const maxInitialRange = 300; // Max range for first hit
    
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if enemy is in general aim direction (within 45 degrees)
      const angleToEnemy = Math.atan2(dy, dx);
      const angleDiff = Math.abs(angleToEnemy - player.aimAngle);
      const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
      
      if (distance < closestDistance && distance <= maxInitialRange && normalizedDiff < Math.PI / 4) {
        closestDistance = distance;
        closestEnemy = enemy;
      }
    }
    
    if (!closestEnemy) return; // No enemy in range
    
    // Hit first enemy and create lightning effect
    closestEnemy.takeDamage(damage);
    if (this.effectsSystem) {
      this.effectsSystem.addDamageNumber(closestEnemy.position.x, closestEnemy.position.y - 10, damage);
    }
    const hitEnemies = new Set([closestEnemy]);
    
    // Create lightning chain
    let currentEnemy = closestEnemy;
    let currentDamage = damage;
    let jumpsRemaining = BALANCE.weapons.chainLightning.chainJumps;
    
    // Store chain path for rendering
    const chainPath = [{ x: player.position.x, y: player.position.y }];
    chainPath.push({ x: closestEnemy.position.x, y: closestEnemy.position.y });
    
    // Chain to additional enemies
    while (jumpsRemaining > 0) {
      let nextEnemy = null;
      let nextDistance = BALANCE.weapons.chainLightning.chainRange;
      
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
      
      // Apply damage with decay
      currentDamage *= BALANCE.weapons.chainLightning.chainDamageDecay;
      nextEnemy.takeDamage(currentDamage);
      if (this.effectsSystem) {
        this.effectsSystem.addDamageNumber(nextEnemy.position.x, nextEnemy.position.y - 10, currentDamage);
      }
      hitEnemies.add(nextEnemy);
      chainPath.push({ x: nextEnemy.position.x, y: nextEnemy.position.y });
      
      currentEnemy = nextEnemy;
      jumpsRemaining--;
    }
    
    // Create visual lightning effect for entire chain
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

// Boomerang Launcher - Projectiles that return
export class BoomerangLauncher extends Weapon {
  constructor(level = 1) {
    super('boomerang', BALANCE.weapons.boomerang, level);
  }

  fire(player, enemies, projectiles) {
    const damage = this.getDamage(player.stats || { damage: BALANCE.player.baseDamage });
    
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle,
      'player'
    );
    projectile.damage = damage;
    projectile.size = 8;
    projectile.color = '#00FF88'; // Green boomerang
    projectile.boomerang = true;
    projectile.boomerangDistance = BALANCE.weapons.boomerang.boomerangDistance;
    projectile.boomerangStartPos = { x: player.position.x, y: player.position.y };
    projectile.boomerangReturning = false;
    projectile.boomerangTravelDistance = 0;
    projectile.hitEnemies = new Set(); // Can hit same enemy twice (out and back)
    
    projectiles.push(projectile);
    
    this.addMuzzleFlash(player);
    if (this.soundSystem) {
      this.soundSystem.play('shootBoomerang');
    }
  }
}

// Gravity Well - Creates gravity wells that pull enemies
export class GravityWell extends Weapon {
  constructor(level = 1) {
    super('gravityWell', BALANCE.weapons.gravityWell, level);
  }

  fire(player, enemies, projectiles) {
    // Create gravity well projectile that stops at target location
    const projectile = new Projectile(
      player.position.x,
      player.position.y,
      player.aimAngle,
      'player'
    );
    projectile.damage = 0; // No direct damage on hit
    projectile.size = 15;
    projectile.color = '#AA00AA'; // Purple gravity well
    projectile.speed = BALANCE.projectile.baseSpeed * 0.5; // Slower
    projectile.gravityWell = true;
    projectile.wellDuration = this.wellDuration;
    projectile.wellRadius = this.wellRadius;
    projectile.wellStrength = BALANCE.weapons.gravityWell.wellStrength;
    projectile.wellDamage = this.wellDamage || 0; // Damage per second at level 3+
    projectile.wellActive = false;
    projectile.wellTimer = 0;
    projectile.lifetime = 1.0; // Travel time before becoming well
    
    projectiles.push(projectile);
    
    if (this.soundSystem) {
      this.soundSystem.play('shootGravity');
    }
  }
}

// Factory function to create weapons with level
export function createWeapon(weaponId, level = 1) {
  const config = BALANCE.weapons[weaponId];
  if (!config) return new Pistol(level);
  
  switch (weaponId) {
    case 'pistol':
      return new Pistol(level);
    case 'shotgun':
      return new Shotgun(level);
    case 'smg':
      return new SMG(level);
    case 'rocketLauncher':
      return new RocketLauncher(level);
    case 'laserBeam':
      return new LaserBeam(level);
    case 'ricochet':
      return new RicochetGun(level);
    case 'waveGun':
      return new WaveGun(level);
    case 'burstRifle':
      return new BurstRifle(level);
    case 'orbitalCannon':
      return new OrbitalCannon(level);
    case 'novaBurst':
      return new NovaBurst(level);
    case 'chainLightning':
      return new ChainLightning(level);
    case 'boomerang':
      return new BoomerangLauncher(level);
    default:
      return new Pistol(level); // Default to pistol
  }
}