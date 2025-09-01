// Balance Configuration File
// All tunable game balance parameters in one place
// Modify these values to adjust game difficulty and progression

export const BALANCE = {
  // Player Base Stats
  player: {
    baseHealth: 10,  // 10x the basic enemy
    baseSpeed: 100,
    baseDamage: 1,  // Exactly kills basic enemy at wave 1
    baseFireRate: 1.0,
    baseDodge: 5,
    baseLuck: 0,
    baseCritChance: 5,
    baseCritDamage: 150,
    baseRegeneration: 0.02,  // Regen 0.2 HP per second
    basePickupRange: 50,
    size: 20
  },

  // Enemy Configuration - defaults for backward compatibility
  enemy: {
    baseHealth: 25,  // Wave 1 health
    healthPerWave: 1.5,  // Additional health per wave (increased)
    baseSpeed: 80,
    speedPerWave: 2,  // Speed increase per wave
    baseDamage: 10,
    damagePerWave: 0.5,
    baseXpValue: 10,
    xpPerWave: 2,
    size: 15
  },

  // Enemy Type Definitions
  enemyTypes: {
    basic: {
      name: 'Basic',
      color: '#FF0000',  // Red
      size: 15,
      baseHealth: 0.8,  // Easier start (was 1)
      healthPerWave: 0.05,  // Scales more
      baseSpeed: 70,  // Slower start (was 80)
      speedPerWave: 3,  // Faster scaling (was 2)
      baseDamage: 0.8,  // Lower start damage (was 0.5)
      damagePerWave: 0.15,  // Higher scaling (was 0.1)
      baseXpValue: 10,
      xpPerWave: 2,
      moneyDropChance: 0.3,
      moneyValue: 3,
      behavior: 'bouncer'  // Moves in straight line, bounces off walls
    },
    tracker: {
      name: 'Tracker',
      color: '#FFA500',  // Orange
      size: 12,  // Smaller
      baseHealth: 0.7,  
      healthPerWave: 0.3,  // Faster scaling
      baseSpeed: 45,  // Slower start (was 50)
      speedPerWave: 1.5,  // Faster scaling (was 1)
      baseDamage: 0.8,  // Lower start damage (was 1)
      damagePerWave: 0.08,  // Higher scaling (was 0.05)
      baseXpValue: 5,
      xpPerWave: 1,
      moneyDropChance: 0.2,
      moneyValue: 5,
      behavior: 'tracker'  // Always moves toward player
    },
    tank: {
      name: 'Tank',
      color: '#8B0000',  // Dark red
      size: 30,  // Even bigger
      baseHealth: 40,  // 10x basic enemy (doubled)
      healthPerWave: 20,  // Final boost
      baseSpeed: 35,  // Slightly slower
      speedPerWave: 0.8,
      baseDamage: 4,  // Higher damage
      damagePerWave: 0.3,
      baseXpValue: 30,
      xpPerWave: 5,
      moneyDropChance: 0.9,  // Very high money drop chance
      moneyValue: 20,  // Halved from 40
      behavior: 'tank',  // Random movement, follows player when close
      aggroRadius: 150  // Distance at which it starts following player
    },
    shooter: {
      name: 'Shooter',
      color: '#FFFF00',  // Yellow
      size: 14,  // Slightly bigger than tracker, smaller than basic
      baseHealth: 0.7,  // Less than basic
      healthPerWave: 0.5,  // Final boost
      baseSpeed: 90,  // Faster than basic (basic is 80)
      speedPerWave: 2,
      baseDamage: 0.4,  // Contact damage
      damagePerWave: 0.08,
      baseXpValue: 15,
      xpPerWave: 3,
      moneyDropChance: 0.4,
      moneyValue: 8,
      behavior: 'shooter',  // Shoots projectiles
      shootCooldown: 1.5,  // Shoots every 1.5 seconds
      projectileSpeed: 150,  // Slower projectiles that are easier to see
      projectileDamage: 0.2,  // 2% of player health per shot
      projectileSize: 4,  // Visible projectiles
      projectileBounces: 8  // Bounces many times
    },
    wave: {
      name: 'Wave',
      color: '#FF8800',  // Orange-yellow gradient (will be special rendered)
      size: 8,  // Smaller
      baseHealth: 0.3,  // Very fragile
      healthPerWave: 0.25,  // Final boost
      baseSpeed: 120,  // Fast
      speedPerWave: 3,
      baseDamage: 0.2,  // Low contact damage
      damagePerWave: 0.05,
      baseXpValue: 3,
      xpPerWave: 1,
      moneyDropChance: 0.1,  // Low drop chance since they spawn in groups
      moneyValue: 20,
      behavior: 'wave',  // Sine wave movement
      waveAmplitude: 90,  // Wave height in pixels
      waveFrequency: 10,  // How many complete waves across screen width
      groupSize: { min: 2, max: 10 },  // Spawn in groups
      trail: true,  // Leave dotted trail
      // Individual variation ranges for each enemy in group
      amplitudeVariation: { min: 0.9, max: 1.1 },  // 50-150% of base amplitude
      frequencyVariation: { min: 0.9, max: 1.1 },  // 70-130% of base frequency
      trailSpacing: 1.2  // Distance between trail dots in pixels
    },
    boss: {
      name: 'Boss',
      color: '#AA00FF',  // Purple
      size: 50,  // Even larger
      baseHealth: 100,  // 100x basic enemy - VERY tanky
      healthPerWave: 80,  // Final boost
      baseSpeed: 25,  // Very slow
      speedPerWave: 0.3,
      baseDamage: 5,  // Very high contact damage
      damagePerWave: 1.0,
      baseXpValue: 100,
      xpPerWave: 20,
      moneyDropChance: 1.0,  // Always drops money
      moneyValue: 250,  // Halved from 500
      behavior: 'boss',
      shootCooldown: 0.8,  // Shoots bouncing projectile frequently
      waveSpawnCooldown: 3.0,  // Spawns 3 wave enemies every 3 seconds
      projectileSpeed: 120,
      projectileDamage: 1.0,  // High projectile damage
      projectileSize: 8,
      projectileBounces: 20  // Boss projectiles bounce a lot
    },
    zoomer: {
      name: 'Zoomer',
      color: '#FFFF99',  // Light yellow
      size: 8,  // Small and narrow
      baseHealth: 0.8,  // Fragile
      healthPerWave: 0.4,  // Final boost
      baseSpeed: 300,  // VERY fast
      speedPerWave: 5,
      baseDamage: 1.5,  // High damage if they hit
      damagePerWave: 0.2,
      baseXpValue: 50,  // High value
      xpPerWave: 10,
      moneyDropChance: 1.0,  // Always drops money if killed
      moneyValue: 13,  // Halved from 25
      behavior: 'zoomer'  // Straight line, no bounce, leaves screen
    }
  },

  // Wave-specific enemy spawn distribution
  waveEnemyDistribution: {
    // Wave 1-5: Mostly basic with some trackers
    1: { basic: 0.6, tracker: 0.4},
    2: { basic: 0.85, tracker: 0.15 },
    3: { basic: 0.5, tracker: 0.45, zoomer: 0.05 },
    4: { basic: 0.7, tracker: 0.2, zoomer: 0.1 },
    5: { basic: 0.6, tracker: 0.3, zoomer: 0.08, tank: 0.02 },
    // Wave 6-9
    6: { basic: 0.5, tracker: 0.3, tank: 0.03, zoomer: 0.07, wave: 0.1 },
    7: { basic: 0.45, tracker: 0.3, tank: 0.04, shooter: 0.08, zoomer: 0.03, wave: 0.1 },
    8: { basic: 0.4, tracker: 0.35, tank: 0.05, shooter: 0.1, zoomer: 0.05, wave: 0.05 },
    9: { basic: 0.38, tracker: 0.35, tank: 0.05, shooter: 0.12, zoomer: 0.05, wave: 0.05 },
    // Wave 10 - First boss appears (just 1)
    10: { basic: 0.35, tracker: 0.35, tank: 0.06, shooter: 0.15, zoomer: 0.05, wave: 0.03, boss: 0.01 },
    // Wave 11-19
    11: { basic: 0.35, tracker: 0.35, tank: 0.05, shooter: 0.15, zoomer: 0.03, wave: 0.07 },
    12: { basic: 0.33, tracker: 0.35, tank: 0.06, shooter: 0.16, zoomer: 0.03, wave: 0.07 },
    13: { basic: 0.32, tracker: 0.34, tank: 0.06, shooter: 0.18, zoomer: 0.03, wave: 0.07 },
    14: { basic: 0.3, tracker: 0.34, tank: 0.07, shooter: 0.19, zoomer: 0.03, wave: 0.07 },
    15: { basic: 0.3, tracker: 0.33, tank: 0.07, shooter: 0.2, zoomer: 0.04, wave: 0.05, boss: 0.01 },
    16: { basic: 0.3, tracker: 0.32, tank: 0.07, shooter: 0.21, zoomer: 0.03, wave: 0.07 },
    17: { basic: 0.28, tracker: 0.32, tank: 0.08, shooter: 0.22, zoomer: 0.03, wave: 0.07 },
    18: { basic: 0.28, tracker: 0.31, tank: 0.08, shooter: 0.23, zoomer: 0.03, wave: 0.07 },
    19: { basic: 0.27, tracker: 0.31, tank: 0.08, shooter: 0.24, zoomer: 0.03, wave: 0.07 },
    // Wave 20 - Second boss (still rare)
    20: { basic: 0.25, tracker: 0.3, tank: 0.09, shooter: 0.22, zoomer: 0.05, wave: 0.07, boss: 0.02 },
    // Wave 21-29
    21: { basic: 0.25, tracker: 0.32, tank: 0.08, shooter: 0.25, zoomer: 0.03, wave: 0.07 },
    22: { basic: 0.25, tracker: 0.31, tank: 0.08, shooter: 0.26, zoomer: 0.03, wave: 0.07 },
    23: { basic: 0.24, tracker: 0.31, tank: 0.09, shooter: 0.26, zoomer: 0.03, wave: 0.07 },
    24: { basic: 0.24, tracker: 0.30, tank: 0.09, shooter: 0.27, zoomer: 0.03, wave: 0.07 },
    25: { basic: 0.23, tracker: 0.30, tank: 0.09, shooter: 0.27, zoomer: 0.03, wave: 0.07, boss: 0.01 },
    26: { basic: 0.23, tracker: 0.29, tank: 0.09, shooter: 0.28, zoomer: 0.04, wave: 0.07 },
    27: { basic: 0.22, tracker: 0.29, tank: 0.1, shooter: 0.28, zoomer: 0.04, wave: 0.07 },
    28: { basic: 0.22, tracker: 0.28, tank: 0.1, shooter: 0.29, zoomer: 0.04, wave: 0.07 },
    29: { basic: 0.21, tracker: 0.28, tank: 0.1, shooter: 0.30, zoomer: 0.04, wave: 0.07 },
    // Wave 30 - Final boss wave! (only 3 bosses total)
    30: { basic: 0.2, tracker: 0.27, tank: 0.11, shooter: 0.28, zoomer: 0.04, wave: 0.07, boss: 0.03 },
    // Default for other waves (no bosses)
    default: { basic: 0.25, tracker: 0.3, tank: 0.08, shooter: 0.25, zoomer: 0.04, wave: 0.08 }
  },

  // Spawn System
  spawning: {
    baseSpawnRate: 0.8,  // Enemies per second at start
    maxSpawnRate: 27.0,  // Maximum spawn rate (increased to compensate for fewer bosses)
    spawnRateIncreasePerWave: 0.85,
    spawnAcceleration: 0.035,  // Spawn rate increase per second
    waveDuration: 50,  // Seconds per wave
    spawnStartDelay: 1.0,  // Delay before spawning starts
    bossSpawnCooldown: 5.0  // Minimum time between boss spawns
  },

  // Money & Economy
  economy: {
    moneyDropChance: 0.3,  // Base 30% chance
    moneyDropValue: 2,  // Reduced base money
    moneyPerWave: 2,  // Multiplier for money value per wave
    luckMoneyBonus: 0.01,  // 1% per luck point (was 2% - reduced by 50%)
    luckDropBonus: 0.005,  // 0.5% drop chance per luck point (was 1% - reduced by 50%)
    waveCompletionBonus: 25,  // Base money for completing wave
    waveCompletionBonusPerWave: 5
  },


  // Projectile Configuration
  projectile: {
    baseSpeed: 400,
    baseSize: 4,
    maxBounces: 0,  // Without Bounce House item
    bounceHouseMaxBounces: 5
  },

  // Upgrade Costs (for stat upgrades) - all standardized to 50 base
  upgrades: {
    health: {
      baseCost: 50,
      costScaling: 2.0,  // 2x cost per purchase (was 1.5)
      value: 1,  // +1 HP per upgrade
      maxValue: 50  // Cap at 50 health
    },
    speed: {
      baseCost: 50,
      costScaling: 2.0,
      value: 20,
      maxValue: 300  // Cap at reasonable speed
    },
    damage: {
      baseCost: 50,
      costScaling: 2.0,
      value: 0.2,  // +20% damage per upgrade
      maxValue: 20  // Cap at 20x damage
    },
    fireRate: {
      baseCost: 50,
      costScaling: 2.0,
      value: 0.2,
      maxValue: 10  // Cap at 10x fire rate
    },
    dodge: {
      baseCost: 50,
      costScaling: 2.0,
      value: 5,
      maxValue: 60  // Cap at 60% dodge
    },
    luck: {
      baseCost: 50,
      costScaling: 2.0,
      value: 1,  // Reduced from 5 to 1
      maxValue: 100  // Cap at 100 luck
    },
    critChance: {
      baseCost: 50,
      costScaling: 2.0,
      value: 5,
      maxValue: 100  // Cap at 100% crit chance
    },
    critDamage: {
      baseCost: 50,
      costScaling: 2.0,
      value: 25,
      maxValue: 1000  // Cap at 1000% crit damage
    },
    regeneration: {
      baseCost: 50,
      costScaling: 2.0,
      value: 0.01,  // +0.1 HP per second
      maxValue: 0.1  // Cap at 1 HP/s (0.1 * 10 = 1 HP/s display)
    }
  },

  // Weapon Upgrade System
  weaponUpgrades: {
    upgradeCostMultiplier: 0.5,  // Upgrade cost = weapon cost * this * level
    maxLevel: 4,  // Maximum upgrade level for all weapons
    
    // Per-weapon upgrade bonuses (per level)
    pistol: {
      damage: 0.25,  // +25% damage per level
      fireRate: 0.15,  // +15% fire rate per level
      special: 'accuracy'  // Reduced spread at higher levels
    },
    shotgun: {
      damage: 0.2,  // +20% damage per level
      projectileCount: 1,  // +1 pellet per level (4→8 at max)
      special: 'spread'  // Tighter spread at higher levels
    },
    smg: {
      fireRate: 0.25,  // +25% fire rate per level
      damage: 0.15,  // +15% damage per level
      special: 'penetration'  // Chance to pierce at level 3+
    },
    rocketLauncher: {
      damage: 0.3,  // +30% damage per level
      aoeRadius: 15,  // +15px radius per level
      special: 'multiRocket'  // 2 rockets at level 4
    },
    laserBeam: {
      damage: 0.2,  // +20% damage per level
      fireRate: 0.3,  // +30% tick rate per level
      special: 'width'  // Wider beam at higher levels
    },
    ricochet: {
      bounces: 2,  // +2 bounces per level (7→15 at max)
      damage: 0.15,  // +15% damage per level
      special: 'homing'  // Better homing at higher levels
    },
    waveGun: {
      projectileCount: 1,  // +1 wave per 2 levels (3→5 at max)
      waveAmplitude: 10,  // +10px amplitude per level
      special: 'frequency'  // More wave oscillations
    },
    burstRifle: {
      projectileCount: 1,  // +1 bullet per 2 levels (3→5 burst)
      damage: 0.2,  // +20% damage per level
      special: 'precision'  // Less spread at higher levels
    },
    orbitalCannon: {
      projectileCount: 2,  // +2 projectiles per level (8→16)
      damage: 0.15,  // +15% damage per level
      special: 'spiral'  // Projectiles spiral outward at level 3+
    },
    novaBurst: {
      projectileCount: 2,  // +2 projectiles per level (10→18)
      damage: 0.1,  // +10% damage per level
      special: 'explosive'  // Explosive rounds at level 4
    },
    chainLightning: {
      chainJumps: 1,  // +1 jump per level (3→7 at max)
      chainRange: 20,  // +20px range per level
      special: 'fork'  // Forks to 2 enemies at level 4
    },
    boomerang: {
      projectileCount: 1,  // +1 boomerang per 2 levels (1→3)
      boomerangDistance: 50,  // +50px distance per level
      special: 'speed'  // Returns faster at higher levels
    }
  },
  
  // Weapon Definitions
  weapons: {
    pistol: {
      name: 'Pistol',
      cost: 25,  // Has value for selling, but player starts with it
      fireRate: 1.0,  // Shots per second (multiplied by player fireRate stat)
      damageMultiplier: 1.0,  // Multiplier of player damage stat
      projectileCount: 1,
      spread: 0,
      description: 'Reliable starting weapon. 1x damage, 1x fire rate.',
      unlocked: true,
      upgradeDescription: '+25% damage, +15% fire rate, +5px auto-aim radius'
    },
    shotgun: {
      name: 'Shotgun',
      cost: 50,
      fireRate: 0.2,  
      damageMultiplier: 3.0,  // 3x damage
      projectileCount: 4,
      spread: Math.PI / 4,  // 45 degree cone
      piercing: true,  // Projectiles pierce through enemies
      description: 'Shoots 4 piercing projectiles. 3x damage, slow fire.',
      unlocked: false,
      upgradeDescription: '+20% damage, +1 pellet per level, tighter spread'
    },
    smg: {
      name: 'SMG',
      cost: 120,  // 50% increase from 80
      fireRate: 8.0,  // Reduced from 10
      damageMultiplier: 0.25,  // Increased from 0.15
      projectileCount: 1,
      spread: Math.PI / 12,  // Small random spread
      description: 'Rapid fire, decent damage per shot. Affordable early game.',
      unlocked: false,
      upgradeDescription: '+25% fire rate, +15% damage, piercing at level 3+'
    },
    rocketLauncher: {
      name: 'Rocket Launcher',
      cost: 500,
      fireRate: 0.19,  // Doubled from 0.095 (once per ~5.25 seconds)
      damageMultiplier: 15.0,  // Tripled from 5.0
      projectileCount: 1,
      spread: 0,
      aoeRadius: 100,
      description: 'Massive damage in an area. Very slow fire rate.',
      unlocked: false,
      upgradeDescription: '+30% damage, +15px blast radius, dual rockets at level 4'
    },
    laserBeam: {
      name: 'Laser Beam',
      cost: 300,  // 50% increase from 200
      fireRate: 40.0,  // Continuous beam effect
      damageMultiplier: 0.1,  // Low damage per tick but high rate
      projectileCount: 1,
      spread: 0,
      beam: true,
      description: 'Continuous beam that melts through enemies.',
      unlocked: false,
      upgradeDescription: '+20% damage, +30% tick rate, wider beam'
    },
    ricochet: {
      name: 'Ricochet Gun',
      cost: 175,
      fireRate: 2.0,
      damageMultiplier: 1.2,
      projectileCount: 1,
      spread: 0,
      autoAim: true,  // Bullets bounce toward nearest enemy
      maxBounces: 7,
      description: 'Bullets bounce and seek enemies. Smart targeting.',
      unlocked: false,
      upgradeDescription: '+2 bounces per level, +15% damage, improved homing'
    },
    waveGun: {
      name: 'Wave Gun',
      cost: 180,  // Reduced from 225
      fireRate: 1.5,
      damageMultiplier: 2.25,  // Halved from 4.5
      projectileCount: 3,
      spread: 0,
      wavePattern: true,  // Projectiles move in sine wave
      piercing: true,
      description: 'Shoots 3 projectiles in expanding wave pattern.',
      unlocked: false,
      upgradeDescription: '+1 wave at level 2/4, +10px amplitude, more oscillations'
    },
    burstRifle: {
      name: 'Burst Rifle',
      cost: 125,
      fireRate: 1.2,  // Increased from 0.8
      damageMultiplier: 3.5,  // Reduced from 5.7
      projectileCount: 3,  // 3-round burst
      burstDelay: 0.08,  // Delay between burst shots
      spread: Math.PI / 24,  // Small spread
      description: '3-round burst with each trigger pull. Accurate.',
      unlocked: false,
      upgradeDescription: '+1 round at level 2/4, +20% damage, tighter grouping'
    },
    orbitalCannon: {
      name: 'Orbital Cannon',
      cost: 400,
      fireRate: 0.5,
      damageMultiplier: 8.5,
      projectileCount: 8,  // Ring of projectiles
      spread: Math.PI * 2,  // Full circle
      orbitalPattern: true,
      description: 'Fires a ring of projectiles outward. Area denial.',
      unlocked: false,
      upgradeDescription: '+2 projectiles per level, +15% damage, spiral pattern at level 3+'
    },
    novaBurst: {
      name: 'Nova Burst',
      cost: 300,
      fireRate: 1.2,
      damageMultiplier: 1.5,
      projectileCount: 10,  // 10 projectiles in a perfect circle
      spread: Math.PI * 2,  // Full circle
      novaPattern: true,  // Special pattern flag
      novaAimBased: true,  // Respect mouse aim direction
      piercing: true,  // All projectiles pierce
      description: 'Shoots 10 piercing projectiles around mouse direction.',
      unlocked: false
    },
    chainLightning: {
      name: 'Chain Lightning',
      cost: 2000,  // Ultimate weapon - 4x most expensive (500)
      fireRate: 1.8,
      damageMultiplier: 2.4,  // 3x increase from 0.8
      projectileCount: 1,
      spread: 0,
      chainJumps: 3,  // Jumps to 3 additional enemies
      chainRange: 60,  // Reduced by 25%
      chainDamageDecay: 0.75,  // 75% damage per jump
      description: 'Ultimate weapon! Lightning devastates entire groups.',
      unlocked: false,
      upgradeDescription: '+1 chain per level, +20px range, forks at level 4'
    },
    boomerang: {
      name: 'Boomerang Launcher',
      cost: 65,  // Affordable early option
      fireRate: 0.7,
      damageMultiplier: 2.2,
      projectileCount: 1,
      spread: 0,
      boomerangReturn: true,
      boomerangDistance: 200,  // Distance before returning
      description: 'Projectiles return after traveling 200px. Hits twice.',
      unlocked: false,
      upgradeDescription: '+1 boomerang at level 2/4, +50px range, faster return'
    }
  },

  // Unique Items
  items: {
    bounceHouse: {
      name: 'Bounce House',
      cost: 500,  // 2x base cost (was 250)
      description: 'Projectiles bounce +1 time per stack',
      maxStacks: 10,  // Now stackable
      stackCostMultiplier: 2,  // 2x cost for each additional stack
      bouncesPerStack: 1  // 1 bounce per stack
    },
    vampiric: {
      name: 'Vampiric Shots',
      cost: 4000,  // 10x increase for healing items
      description: 'Heal 0.1 HP per enemy killed',
      healPerKills: 1,  // Every kill
      healAmount: 0.1,  // Small heal per kill
      maxStacks: 1
    },
    moneyMagnet: {
      name: 'Money Magnet',
      cost: 150,  // 30% increase (was 100)
      description: 'Double pickup range',
      rangeMultiplier: 2,
      maxStacks: 1
    },
    luckyPenny: {
      name: 'Lucky Penny',
      cost: 200,  // 30% increase (was 150)
      description: '+10 Luck, +25% money from pickups',
      luckBonus: 10,  // Reduced by 50%
      moneyMultiplier: 1.25,  // Reduced from 50% to 25%
      maxStacks: 1
    },
    speedBoots: {
      name: 'Speed Boots',
      cost: 163,  // 30% increase (was 125)
      description: '+30% movement speed',
      speedMultiplier: 1.3,
      maxStacks: 1
    },
    sharpShooter: {
      name: 'Sharp Shooter',
      cost: 350,  // 30% increase (was 250)
      description: '+20% crit chance, +50% crit damage',
      critChanceBonus: 20,
      critDamageBonus: 50,
      maxStacks: 1
    },
    tankArmor: {
      name: 'Tank Armor',
      cost: 450,  // 30% increase (was 350)
      description: '+5 max health, +20% damage reduction',
      healthBonus: 5,  // 50% more health
      damageReduction: 0.2,
      maxStacks: 1
    },
    rapidReload: {
      name: 'Rapid Reload',
      cost: 1000,  // 2x for attack speed items
      description: '+50% fire rate for all weapons',
      fireRateMultiplier: 1.5,
      maxStacks: 1
    },
    explosiveRounds: {
      name: 'Explosive Rounds',
      cost: 13000,  // Increased by 7k (was 6000)
      description: 'All projectiles explode on impact (small AoE)',
      aoeRadius: 30,
      aoeDamagePercent: 0.3,  // 30% of projectile damage
      maxStacks: 1
    },
    lifeSteal: {
      name: 'Life Steal',
      cost: 10000,  // 10x increase for healing items
      description: 'Heal 5% of damage dealt',
      lifeStealPercent: 0.05,  // Increased since damage is lower
      maxStacks: 1
    },
    // Cheap micro-upgrades
    luckyCoin: {
      name: 'Lucky Coin',
      cost: 15,  // +$10
      description: '+0.5 Luck',
      luckBonus: 0.5,  // Reduced by 50%
      maxStacks: 10,  // Stackable
      upgradeDescription: 'Permanent +0.5 luck per purchase'
    },
    energyDrink: {
      name: 'Energy Drink', 
      cost: 18,  // +$10
      description: '+3 Speed',
      speedBonus: 3,
      maxStacks: 10,
      upgradeDescription: 'Permanent +3 speed per purchase'
    },
    proteinBar: {
      name: 'Protein Bar',
      cost: 20,  // +$10
      description: '+0.2 Max Health',
      healthBonus: 0.2,
      maxStacks: 10,
      upgradeDescription: 'Permanent +0.2 health per purchase'
    },
    sharpTips: {
      name: 'Sharp Tips',
      cost: 22,  // +$10
      description: '+2% Damage',
      damagePercent: 0.02,
      maxStacks: 10,
      upgradeDescription: 'Permanent +2% damage per purchase'
    },
    quickHands: {
      name: 'Quick Hands',
      cost: 50,  // 2x for attack speed items
      description: '+3% Fire Rate',
      fireRatePercent: 0.03,
      maxStacks: 10,
      upgradeDescription: 'Permanent +3% fire rate per purchase'
    },
    // Mid-tier items filling price gaps
    bandaidPack: {
      name: 'Bandaid Pack',
      cost: 250,  // 10x increase for healing items
      description: '+0.01 HP/s Regeneration',
      regenBonus: 0.001, // 0.01 HP/s display
      maxStacks: 10,
      upgradeDescription: 'Stackable regeneration boost'
    },
    coffeeShot: {
      name: 'Coffee Shot',
      cost: 90,  // 2x for attack speed items
      description: '+5% Speed & Fire Rate',
      speedPercent: 0.05,
      fireRatePercent: 0.05,
      maxStacks: 10,
      upgradeDescription: 'Small boost to mobility and DPS'
    },
    magnetGloves: {
      name: 'Magnet Gloves',
      cost: 100,
      description: '+20 Pickup Range',
      pickupRangeBonus: 20,
      maxStacks: 1
    },
    criticalEye: {
      name: 'Critical Eye',
      cost: 110,
      description: '+10% Crit Chance',
      critChanceBonus: 10,
      maxStacks: 1
    },
    heavyRounds: {
      name: 'Heavy Rounds',
      cost: 230,
      description: '+25% Damage, -10% Fire Rate',
      damageMultiplier: 1.25,
      fireRateMultiplier: 0.9,
      maxStacks: 1
    },
    shieldGenerator: {
      name: 'Shield Generator',
      cost: 280,
      description: '15% chance to block all damage',
      blockChance: 15,
      maxStacks: 1
    },
    adrenalineRush: {
      name: 'Adrenaline Rush',
      cost: 330,
      description: '+30% all stats when below 30% HP',
      triggerHealthPercent: 0.3,
      statBoostPercent: 0.3,
      maxStacks: 1
    },
    doubleTap: {
      name: 'Double Tap',
      cost: 600,
      description: '20% chance to shoot twice',
      doubleShotChance: 0.2,
      maxStacks: 1
    },
    bloodPact: {
      name: 'Blood Pact',
      cost: 8500,  // 10x increase for healing items
      description: 'Enemies have 30% chance to drop health',
      healthDropChance: 0.3,
      healthDropAmount: 0.5,
      maxStacks: 1
    },
    glassCannon: {
      name: 'Glass Cannon',
      cost: 1500,
      description: '+100% Damage, -50% Max Health',
      damageMultiplier: 2.0,
      healthMultiplier: 0.5,
      maxStacks: 1
    }
  },

  // Visual Effects
  effects: {
    screenShakeOnHit: 8,
    screenShakeOnKill: 3,
    screenShakeDuration: 0.25,
    damageFlashDuration: 0.15,
    particleCount: 8,
    floatingTextDuration: 1.0
  },

  // Sound Configuration
  sound: {
    masterVolume: 0.3,
    shootVolume: 0.1,
    hitVolume: 0.2,
    deathVolume: 0.3,
    pickupVolume: 0.2,
    countdownVolume: 0.4,
    levelUpVolume: 0.5
  },

  // UI Configuration
  ui: {
    canvasWidth: 800,
    canvasHeight: 550,
    gameAreaHeight: 450,
    uiBarHeight: 100,
    gridSize: 50,
    levelBoxSize: 60,
    levelBoxSpacing: 10,
    shopItemHeight: 80,
    shopMaxVisibleItems: 5
  },

  // End of Wave Upgrade Options
  endWaveUpgrades: {
    optionsCount: 4,  // Number of upgrade choices
    rerollCost: 25,  // Cost to reroll options (reduced to match new economy)
    upgradeTypes: [
      { type: 'health', weight: 10, value: 0.5, display: '+0.5 Health' },
      { type: 'damage', weight: 10, value: 0.1, display: '+0.1 Damage' },
      { type: 'fireRate', weight: 8, value: 0.1, display: '+10% Fire Rate' },
      { type: 'speed', weight: 8, value: 10, display: '+10 Speed' },
      { type: 'dodge', weight: 6, value: 2, display: '+2% Dodge' },
      { type: 'luck', weight: 6, value: 2, display: '+2 Luck' },
      { type: 'critChance', weight: 5, value: 2, display: '+2% Crit Chance' },
      { type: 'critDamage', weight: 5, value: 10, display: '+10% Crit Damage' },
      { type: 'regeneration', weight: 4, value: 0.005, display: '+0.05 HP/s Regen' }
    ]
  }
};

// Helper function to get enemy stats for a given wave and type
export function getEnemyStats(wave, type = 'basic') {
  const enemyConfig = BALANCE.enemyTypes[type] || BALANCE.enemyTypes.basic;
  return {
    health: enemyConfig.baseHealth + (wave - 1) * enemyConfig.healthPerWave,
    speed: enemyConfig.baseSpeed + (wave - 1) * enemyConfig.speedPerWave,
    damage: enemyConfig.baseDamage + (wave - 1) * enemyConfig.damagePerWave,
    xpValue: enemyConfig.baseXpValue + (wave - 1) * enemyConfig.xpPerWave,
    moneyDropChance: enemyConfig.moneyDropChance,
    moneyValue: enemyConfig.moneyValue
  };
}

// Helper function to get enemy type distribution for a wave
export function getWaveEnemyDistribution(wave) {
  return BALANCE.waveEnemyDistribution[wave] || BALANCE.waveEnemyDistribution.default;
}

// Helper function to select a random enemy type based on wave distribution
export function selectEnemyType(wave) {
  const distribution = getWaveEnemyDistribution(wave);
  const random = Math.random();
  let cumulative = 0;
  
  for (const [type, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (random <= cumulative) {
      return type;
    }
  }
  
  return 'basic'; // Fallback
}

// Helper function to get spawn rate for a given wave
export function getSpawnRate(wave, timeInWave) {
  const baseRate = BALANCE.spawning.baseSpawnRate + (wave - 1) * BALANCE.spawning.spawnRateIncreasePerWave;
  const acceleration = timeInWave * BALANCE.spawning.spawnAcceleration;
  return Math.min(baseRate + acceleration, BALANCE.spawning.maxSpawnRate);
}

// Helper function to get money value for a wave
export function getMoneyValue(wave) {
  return Math.floor(BALANCE.economy.moneyDropValue * (1 + (wave - 1) * 0.2));
}