// Balance Configuration File
// All tunable game balance parameters in one place
// Modify these values to adjust game difficulty and progression

export const BALANCE = {
  // Player Base Stats
  player: {
    baseHealth: 20,  // Increased from 10
    baseSpeed: 120,
    baseDamage: 1,  // Exactly kills basic enemy at wave 1
    baseFireRate: 1.0,
    baseDodge: 5,
    baseLuck: 0,
    baseCritChance: 5,
    baseCritDamage: 150,
    baseRegeneration: 0.01,  // 1 store upgrade worth (0.1 HP per second)
    basePickupRange: 50,
    size: 35
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
    size: 26
  },

  // Enemy Type Definitions
  enemyTypes: {
    basic: {
      name: 'Basic',
      color: '#0000FF',  // Regular Blue
      size: 26,
      baseHealth: 0.96,  // Increased by 20%
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
      size: 22,  // Smaller
      baseHealth: 0.84,  // Increased by 20%
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
      size: 52,  // Even bigger
      baseHealth: 20,  // 5x basic enemy (doubled)
      healthPerWave: 10,  // Final boost
      baseSpeed: 35,  // Slightly slower
      speedPerWave: 0.8,
      baseDamage: 4,  // Higher damage
      damagePerWave: 0.3,
      baseXpValue: 30,
      xpPerWave: 5,
      moneyDropChance: 0.9,  // Very high money drop chance
      moneyValue: 10,  // Halved from 20
      behavior: 'tank',  // Random movement, follows player when close
      aggroRadius: 150  // Distance at which it starts following player
    },
    shooter: {
      name: 'Shooter',
      color: '#FFFF00',  // Yellow
      size: 24,  // Slightly bigger than tracker, smaller than basic
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
      shootCooldown: 3.0,  // Shoots every 3.0 seconds (reduced by 50%)
      projectileSpeed: 150,  // Slower projectiles that are easier to see
      projectileDamage: 0.2,  // 2% of player health per shot
      projectileSize: 4,  // Visible projectiles
      projectileBounces: 8  // Bounces many times
    },
    wave: {
      name: 'Wave',
      color: '#FF8800',  // Orange-yellow gradient (will be special rendered)
      size: 13,  // Smaller
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
      size: 86,  // Even larger
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
      shootCooldown: 1.6,  // Shoots bouncing projectile frequently (reduced by 50%)
      waveSpawnCooldown: 3.0,  // Spawns 3 wave enemies every 3 seconds
      projectileSpeed: 120,
      projectileDamage: 1.0,  // High projectile damage
      projectileSize: 8,
      projectileBounces: 20  // Boss projectiles bounce a lot
    },
    zoomer: {
      name: 'Zoomer',
      color: '#FFFF99',  // Light yellow
      size: 13,  // Small and narrow
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
    },
    splitter: {
      name: 'Splitter',
      color: '#2E8B57',  // Sea green
      size: 30,
      baseHealth: 3.0,  // Chunky but not tank-level
      healthPerWave: 0.8,
      baseSpeed: 55,
      speedPerWave: 1.6,
      baseDamage: 1.0,
      damagePerWave: 0.12,
      baseXpValue: 18,
      xpPerWave: 3,
      moneyDropChance: 0.45,
      moneyValue: 6,
      behavior: 'tracker'  // Chases the player; on death spawns 2 sporelings
    },
    sporeling: {
      name: 'Sporeling',
      color: '#7FFF7F',  // Light green
      size: 14,
      baseHealth: 0.5,
      healthPerWave: 0.15,
      baseSpeed: 110,
      speedPerWave: 2,
      baseDamage: 0.4,
      damagePerWave: 0.06,
      baseXpValue: 4,
      xpPerWave: 1,
      moneyDropChance: 0.1,
      moneyValue: 2,
      behavior: 'tracker'
    },
    charger: {
      name: 'Charger',
      color: '#FF1493',  // Hot pink - high contrast
      size: 24,
      baseHealth: 1.5,
      healthPerWave: 0.4,
      baseSpeed: 55,  // Slow idle, dashes fast
      speedPerWave: 1.2,
      baseDamage: 2.0,  // Painful ram damage
      damagePerWave: 0.18,
      baseXpValue: 20,
      xpPerWave: 3,
      moneyDropChance: 0.45,
      moneyValue: 7,
      behavior: 'charger',
      chargeWindup: 0.9,
      chargeDuration: 0.6,
      chargeSpeedMultiplier: 5.5,
      chargeCooldown: 2.2,
      aggroRadius: 300
    },
    sniper: {
      name: 'Sniper',
      color: '#00CED1',  // Turquoise
      size: 20,
      baseHealth: 0.9,
      healthPerWave: 0.3,
      baseSpeed: 45,  // Keeps distance
      speedPerWave: 1.0,
      baseDamage: 0.5,
      damagePerWave: 0.08,
      baseXpValue: 22,
      xpPerWave: 3,
      moneyDropChance: 0.6,
      moneyValue: 9,
      behavior: 'sniper',
      shootCooldown: 3.2,
      chargeTime: 1.1,  // Telegraph before shot
      projectileSpeed: 430,
      projectileDamage: 1.4,
      projectileSize: 11,       // Bigger so the shot itself reads clearly against the background
      projectileBounces: 0,
      preferredDistance: 280
    },
    exploder: {
      name: 'Exploder',
      color: '#FF4500',  // Orange-red
      size: 22,
      baseHealth: 1.0,
      healthPerWave: 0.28,
      baseSpeed: 95,
      speedPerWave: 2,
      baseDamage: 0.5,
      damagePerWave: 0.05,
      baseXpValue: 16,
      xpPerWave: 3,
      moneyDropChance: 0.35,
      moneyValue: 6,
      behavior: 'exploder',
      fuseRange: 55,
      fuseDuration: 0.75,
      explosionRadius: 72,
      explosionDamage: 2.5,
      explosionDamagePerWave: 0.2
    }
  },

  // Wave-specific enemy spawn distribution
  waveEnemyDistribution: {
    // Wave 1-5: Mostly basic with some trackers
    1: { basic: 0.6, tracker: 0.4 },  // Gentle intro: mostly basic blue bouncers + a few trackers
    2: { basic: 0.7, tracker: 0.3 },
    3: { basic: 0.55, tracker: 0.35, zoomer: 0.1 },
    4: { basic: 0.55, tracker: 0.3, zoomer: 0.08, charger: 0.07 },
    5: { basic: 0.5, tracker: 0.3, zoomer: 0.08, tank: 0.02, charger: 0.07, exploder: 0.03 },
    // Wave 6-9: real variety
    6: { basic: 0.42, tracker: 0.28, tank: 0.03, zoomer: 0.06, wave: 0.07, charger: 0.07, exploder: 0.04, sniper: 0.03 },
    7: { basic: 0.36, tracker: 0.26, tank: 0.04, shooter: 0.04, zoomer: 0.04, wave: 0.07, charger: 0.07, exploder: 0.05, sniper: 0.04, splitter: 0.03 },
    8: { basic: 0.32, tracker: 0.26, tank: 0.05, shooter: 0.05, zoomer: 0.05, wave: 0.05, charger: 0.08, exploder: 0.06, sniper: 0.05, splitter: 0.03 },
    9: { tracker: 0.78, sporeling: 0.12, charger: 0.06, basic: 0.04 }, // Tracker FLOOD (slightly eased before w10 boss)
    // Wave 10
    10: { basic: 0.28, tracker: 0.24, tank: 0.06, shooter: 0.07, zoomer: 0.05, wave: 0.04, charger: 0.08, exploder: 0.07, sniper: 0.05, splitter: 0.05, boss: 0.01 },
    // Wave 11-19
    11: { basic: 0.28, tracker: 0.24, tank: 0.05, shooter: 0.07, zoomer: 0.04, wave: 0.07, charger: 0.09, exploder: 0.06, sniper: 0.05, splitter: 0.05 },
    12: { basic: 0.26, tracker: 0.24, tank: 0.06, shooter: 0.08, zoomer: 0.04, wave: 0.07, charger: 0.09, exploder: 0.06, sniper: 0.05, splitter: 0.05 },
    13: { tracker: 0.82, sporeling: 0.1, charger: 0.08 }, // FLOOD
    14: { basic: 0.26, tracker: 0.23, tank: 0.07, shooter: 0.09, zoomer: 0.03, wave: 0.07, charger: 0.09, exploder: 0.07, sniper: 0.05, splitter: 0.04 },
    15: { basic: 0.25, tracker: 0.22, tank: 0.07, shooter: 0.1, zoomer: 0.04, wave: 0.05, charger: 0.1, exploder: 0.07, sniper: 0.05, splitter: 0.04, boss: 0.01 },
    16: { basic: 0.25, tracker: 0.22, tank: 0.07, shooter: 0.1, zoomer: 0.04, wave: 0.07, charger: 0.1, exploder: 0.07, sniper: 0.05, splitter: 0.03 },
    17: { tracker: 0.68, sporeling: 0.12, tank: 0.07, zoomer: 0.05, charger: 0.08 }, // FLOOD
    18: { basic: 0.24, tracker: 0.2, tank: 0.08, shooter: 0.11, zoomer: 0.04, wave: 0.07, charger: 0.1, exploder: 0.08, sniper: 0.05, splitter: 0.03 },
    19: { basic: 0.24, tracker: 0.2, tank: 0.08, shooter: 0.12, zoomer: 0.04, wave: 0.07, charger: 0.1, exploder: 0.08, sniper: 0.05, splitter: 0.02 },
    // Wave 20
    20: { basic: 0.21, tracker: 0.18, tank: 0.09, shooter: 0.11, zoomer: 0.04, wave: 0.07, charger: 0.11, exploder: 0.08, sniper: 0.06, splitter: 0.03, boss: 0.02 },
    // Wave 21-29
    21: { basic: 0.22, tracker: 0.2, tank: 0.08, shooter: 0.12, zoomer: 0.04, wave: 0.07, charger: 0.11, exploder: 0.08, sniper: 0.05, splitter: 0.03 },
    22: { basic: 0.22, tracker: 0.2, tank: 0.08, shooter: 0.12, zoomer: 0.04, wave: 0.07, charger: 0.11, exploder: 0.08, sniper: 0.05, splitter: 0.03 },
    23: { basic: 0.22, tracker: 0.19, tank: 0.09, shooter: 0.13, zoomer: 0.04, wave: 0.07, charger: 0.11, exploder: 0.08, sniper: 0.05, splitter: 0.02 },
    24: { tracker: 0.68, sporeling: 0.1, shooter: 0.08, tank: 0.06, charger: 0.08 }, // FLOOD
    25: { basic: 0.21, tracker: 0.18, tank: 0.09, shooter: 0.135, zoomer: 0.04, wave: 0.07, charger: 0.12, exploder: 0.08, sniper: 0.06, splitter: 0.02, boss: 0.005 },
    26: { basic: 0.21, tracker: 0.18, tank: 0.09, shooter: 0.14, zoomer: 0.04, wave: 0.07, charger: 0.12, exploder: 0.08, sniper: 0.05, splitter: 0.02 },
    27: { tracker: 0.72, sporeling: 0.1, wave: 0.05, tank: 0.05, charger: 0.08 }, // FLOOD
    28: { basic: 0.19, tracker: 0.17, tank: 0.1, shooter: 0.14, zoomer: 0.04, wave: 0.07, charger: 0.13, exploder: 0.08, sniper: 0.06, splitter: 0.02 },
    29: { basic: 0.18, tracker: 0.17, tank: 0.1, shooter: 0.15, zoomer: 0.04, wave: 0.07, charger: 0.13, exploder: 0.08, sniper: 0.06, splitter: 0.02 },
    // Wave 30
    30: { basic: 0.14, tracker: 0.16, tank: 0.11, shooter: 0.14, zoomer: 0.04, wave: 0.07, charger: 0.13, exploder: 0.09, sniper: 0.06, splitter: 0.03, boss: 0.03 },
    // Default
    default: { basic: 0.23, tracker: 0.22, tank: 0.08, shooter: 0.12, zoomer: 0.04, wave: 0.07, charger: 0.1, exploder: 0.07, sniper: 0.05, splitter: 0.02 }
  },

  // Spawn System
  // baseSpawnRate lowered so wave 1 feels gentle (~1 enemy/sec intro),
  // spawnRateIncreasePerWave still delivers chaos by wave 20+.
  spawning: {
    baseSpawnRate: 1.08,      // +20% over prior 0.9 — more enemies from wave 1
    maxSpawnRate: 24.3,
    spawnRateIncreasePerWave: 0.96,  // +20% over prior 0.8 — difficulty ramps faster
    spawnAcceleration: 0.032,
    waveDuration: 50,
    spawnStartDelay: 1.2,
    bossSpawnCooldown: 5.0
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
    baseSize: 7,
    maxBounces: 0,  // Without Bounce House item
    bounceHouseMaxBounces: 5
  },

  // Upgrade Costs (for stat upgrades) - all standardized to 50 base
  upgrades: {
    health: {
      baseCost: 40,
      costScaling: 1.7,  // Softer scaling — 2.0x made mid-run upgrades unreachable
      value: 1,  // +1 HP per upgrade
      maxValue: 50  // Cap at 50 health
    },
    speed: {
      baseCost: 40,
      costScaling: 1.7,
      value: 20,
      maxValue: 300  // Cap at reasonable speed
    },
    damage: {
      baseCost: 40,
      costScaling: 1.7,
      value: 0.2,  // +20% damage per upgrade
      maxValue: 20  // Cap at 20x damage
    },
    fireRate: {
      baseCost: 60,        // Up from 40 — fire rate is the highest-leverage stat.
      costScaling: 1.9,    // Up from 1.7 — stacking gets expensive fast.
      value: 0.10,         // Down from 0.20 — half the per-purchase bonus.
      maxValue: 5          // Down from 10 — hard cap on runaway stacking.
    },
    dodge: {
      baseCost: 40,
      costScaling: 1.7,
      value: 5,
      maxValue: 60  // Cap at 60% dodge
    },
    luck: {
      baseCost: 40,
      costScaling: 1.7,
      value: 1,  // Reduced from 5 to 1
      maxValue: 100  // Cap at 100 luck
    },
    critChance: {
      baseCost: 40,
      costScaling: 1.7,
      value: 5,
      maxValue: 100  // Cap at 100% crit chance
    },
    critDamage: {
      baseCost: 40,
      costScaling: 1.7,
      value: 25,
      maxValue: 1000  // Cap at 1000% crit damage
    },
    regeneration: {
      baseCost: 40,
      costScaling: 1.7,
      value: 0.01,  // +0.1 HP per second
      maxValue: 0.1  // Cap at 1 HP/s (0.1 * 10 = 1 HP/s display)
    },
    // Wizard-facing spell stats. These live in stats.spellPower / stats.cooldownSpeed
    // directly (no "Bonus" suffix), so the shop-purchase path can write them
    // without special-casing. Addresses the Wizard's core-loop complaint: spell
    // damage was only buyable via random wave upgrades; now it's a reliable
    // shop stat.
    spellPower: {
      baseCost: 60,
      costScaling: 1.65,
      value: 0.15,   // +15% spell damage per purchase
      maxValue: 5.0  // Cap at +500% spell damage (6x baseline)
    },
    cooldownSpeed: {
      baseCost: 70,
      costScaling: 1.7,
      value: 0.10,   // +10% cooldown recovery speed per purchase
      maxValue: 2.0  // Cap at +200% CD speed (3x baseline)
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
    sword: {
      damage: 0.2,  // +20% damage per level
      special: 'width'  // Wider arc at higher levels
    },
    sprayAndPray: {
      fireRate: 0.25,  // +25% fire rate per level
      damage: 0.15,  // +15% damage per level
      special: 'accuracy'  // Slightly less random at higher levels
    },
    boomerang: {
      projectileCount: 1,  // +1 boomerang per 2 levels (1→3)
      boomerangDistance: 50,  // +50px distance per level
      special: 'speed'  // Returns faster at higher levels
    },
  },
  
  // Weapon Definitions
  weapons: {
    pistol: {
      name: 'Pistol',
      cost: 25,  // Has value for selling, but player starts with it
      fireRate: 1.3,  // Slightly punchier cadence for a better wave-1 feel
      damageMultiplier: 1.0,  // Multiplier of player damage stat
      projectileCount: 1,
      spread: 0,
      description: 'Reliable starting weapon. Snappy single shots.',
      unlocked: true,
      upgradeDescription: '+25% damage, +15% fire rate, +5px auto-aim radius'
    },
    shotgun: {
      name: 'Shotgun',
      cost: 25,
      fireRate: 0.24,  
      damageMultiplier: 3.0,  // 3x damage
      projectileCount: 4,
      spread: Math.PI / 4,  // 45 degree cone
      piercing: true,  // Projectiles pierce through enemies
      description: 'Spread of 4 piercing pellets in a cone. Short range, 3x damage, slow fire.',
      unlocked: false,
      upgradeDescription: '+20% damage, +1 pellet per level, tighter spread'
    },
    smg: {
      name: 'SMG',
      cost: 240,  // 2x nerf — fire rate is too strong overall
      fireRate: 8.0,  // Reduced from 10
      damageMultiplier: 0.4,  // Wave-1 basic (~0.96 HP) dies in ~3 shots
      projectileCount: 1,
      spread: Math.PI / 12,  // Small random spread
      description: 'Rapid fire with small spread. Low damage per shot, high DPS.',
      unlocked: false,
      upgradeDescription: '+25% fire rate, +15% damage, piercing at level 3+'
    },
    rocketLauncher: {
      name: 'Rocket Launcher',
      cost: 75,
      fireRate: 0.19,  // Doubled from 0.095 (once per ~5.25 seconds)
      damageMultiplier: 6.0,  // Reduced by 60% from 15.0
      projectileCount: 1,
      spread: 0,
      aoeRadius: 150, // Increased 50% from 100
      description: 'Fires explosive rockets with a large blast radius. Very slow fire rate.',
      unlocked: false,
      upgradeDescription: '+30% damage, +15px blast radius, dual rockets at level 4'
    },
    laserBeam: {
      name: 'Laser Beam',
      cost: 900,  // +50% — laser was over-performing for cost
      fireRate: 40.0,  // Continuous beam effect
      damageMultiplier: 0.1,  // Scales with player damage stats normally
      projectileCount: 1,
      spread: 0,
      beam: true,
      description: 'Continuous beam that damages everything it touches.',
      unlocked: false,
      upgradeDescription: '+20% damage, +30% tick rate, wider beam'
    },
    ricochet: {
      name: 'Ricochet Gun',
      cost: 175,
      fireRate: 3.0,  // 50% faster (was 2.0)
      damageMultiplier: 0.9,  // 25% reduction from 1.2
      projectileCount: 1,
      spread: 0,
      autoAim: true,  // Bullets bounce toward nearest enemy
      maxBounces: Infinity,  // Infinite bounces until hitting an enemy
      description: 'Bullets ricochet off walls and home toward enemies.',
      unlocked: false,
      upgradeDescription: '+2 bounces per level, +15% damage, improved homing'
    },
    waveGun: {
      name: 'Wave Gun',
      cost: 1120,  // 4x — wave gun is S-tier, cost wasn't matching its power
      fireRate: 1.5,
      damageMultiplier: 1.35,  // 40% reduction from 2.25
      projectileCount: 3,
      spread: 0,
      wavePattern: true,  // Projectiles move in sine wave
      piercing: true,
      description: 'Fires 3 piercing projectiles that oscillate in a sine wave.',
      unlocked: false,
      upgradeDescription: '+1 wave at level 2/4, +10px amplitude, more oscillations'
    },
    burstRifle: {
      name: 'Burst Rifle',
      cost: 250,  // 2x — fire rate nerf pass
      fireRate: 1.2,  // Increased from 0.8
      damageMultiplier: 2.1,  // 40% reduction from 3.5
      projectileCount: 3,  // 3-round burst
      burstDelay: 0.08,  // Delay between burst shots
      spread: Math.PI / 24,  // Small spread
      description: '3-round burst with each trigger pull. Accurate.',
      unlocked: false,
      upgradeDescription: '+1 round at level 2/4, +20% damage, tighter grouping'
    },
    orbitalCannon: {
      name: 'Orbital Cannon',
      cost: 1000,  // 2x — over-performing for cost
      fireRate: 0.5,
      damageMultiplier: 8.5,
      projectileCount: 8,  // Ring of projectiles
      spread: Math.PI * 2,  // Full circle
      orbitalPattern: true,
      description: 'Fires 8 projectiles outward in a full circle around you.',
      unlocked: false,
      upgradeDescription: '+2 projectiles per level, +15% damage, spiral pattern at level 3+'
    },
    novaBurst: {
      name: 'Nova Burst',
      cost: 800,  // 2x — over-performing for cost
      fireRate: 1.2,
      damageMultiplier: 1.5,
      projectileCount: 10,  // 10 projectiles in a perfect circle
      spread: Math.PI * 2,  // Full circle
      novaPattern: true,  // Special pattern flag
      novaAimBased: true,  // Respect mouse aim direction
      piercing: true,  // All projectiles pierce
      description: 'Fires 10 piercing projectiles in a fan around your aim direction.',
      unlocked: false,
      upgradeDescription: '+2 projectiles per level, +10% damage, explosive rounds at level 4',
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
      description: 'Lightning arcs between nearby enemies, jumping up to 3 times.',
      unlocked: false,
      upgradeDescription: '+1 chain per level, +20px range, forks at level 4'
    },
    sword: {
      name: 'Sword',
      cost: 15,
      fireRate: 0.6,  // Swings per second
      damageMultiplier: 2.0,  // Hits all enemies in arc — buffed so wave-1 basic dies in 1 swing
      projectileCount: 0,
      spread: 0,
      swingArc: Math.PI / 2,  // 90 degree arc
      swingRange: 96,  // Pixel reach (+20%)
      windUpDuration: 0.3,  // Wind-up before strike
      swingDuration: 0.2,  // Swing animation time in seconds
      description: 'Melee swing in a 90-degree arc, hitting all enemies in reach.',
      unlocked: false,
      upgradeDescription: '+20% damage, +10px range, wider arc per level'
    },
    hulkFist: {
      name: 'Hulk Fist',
      cost: 0,
      fireRate: 0.6,
      damageMultiplier: 2.0,
      damage: 0.2,
      projectileCount: 0,
      spread: 0,
      swingArc: Math.PI * 0.8,
      swingRange: 120,
      windUpDuration: 0.25,
      swingDuration: 0.18,
      description: 'Massive melee fist. Every 3rd swing triggers a ground slam AoE.',
      unlocked: false,
      hidden: true,
    },
    sprayAndPray: {
      name: 'Spray and Pray',
      cost: 100,
      fireRate: 6.0,
      damageMultiplier: 1.0,
      projectileCount: 1,
      spread: Math.PI * 2,
      randomAim: true,
      projectileSpeedMultiplier: 6.0,  // +500% speed (6x pistol)
      description: 'Sprays bullets in random directions at extreme fire rate.',
      unlocked: false,
      upgradeDescription: '+25% fire rate, +15% damage per level'
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
      description: 'Projectiles fly out, then return to you — can hit twice.',
      unlocked: false,
      upgradeDescription: '+1 boomerang at level 2/4, +50px range, faster return'
    },
  },

  // Unique Items
  items: {
    bounceHouse: {
      name: 'Bounce House',
      cost: 2500,
      description: 'Projectiles ricochet to a new enemy on hit (+1 bounce per stack).',
      maxStacks: 3,  // Now stackable up to 3
      stackCostMultiplier: 2,  // 2x cost for each additional stack
      bouncesPerStack: 1  // 1 bounce per stack
    },
    vampiric: {
      name: 'Vampiric Shots',
      cost: 3000,
      // 0.1 HP per kill at 50 kills/wave = +5 HP. For $4000 that was barely
      // felt. Doubled the per-kill heal and trimmed cost so it reads as a
      // real late-game healing investment.
      description: 'Heal 0.2 HP per enemy killed',
      healPerKills: 1,
      healAmount: 0.2,
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
      cost: 200,
      // Luck already scales money drop chance AND coin value (see game.ts onEnemyKill).
      // +10 luck -> ~+10% drop chance and ~+20% coin value on top of base.
      description: '+10 Luck (more drops, bigger coins)',
      luckBonus: 10,
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
      cost: 220,
      // Bumped to +8 HP so it stays a worthwhile premium single-purchase
      // alongside the now-buffed Protein Bar stack (10× $20 = +10 HP).
      description: '+8 max health',
      healthBonus: 8,
      maxStacks: 1
    },
    rapidReload: {
      name: 'Rapid Reload',
      cost: 1200,  // Nerfed: fire rate is too strong. Cost up, multiplier down.
      description: '+25% fire rate for all weapons',
      fireRateMultiplier: 1.25,
      maxStacks: 1
    },
    explosiveRounds: {
      name: 'Explosive Rounds',
      cost: 7500,  // 13000 was punitive for a 30%-damage small AoE
      description: 'Projectiles explode on impact for 30% splash damage in a small AoE.',
      aoeRadius: 30,
      aoeDamagePercent: 0.3,  // 30% of projectile damage
      maxStacks: 1
    },
    lifeSteal: {
      name: 'Life Steal',
      cost: 6500,  // 10000 locked this behind end-of-run money; 6500 makes it a late-game splurge
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
      cost: 20,
      // +0.2 HP was a token effect — at 10 stacks you paid $200 for 2 HP.
      // Bumped to +1 per stack; 10 stacks now gives +10 HP for $200, which
      // is in line with the premium single-purchase tankArmor ($220 / +8 HP).
      description: '+1 Max Health',
      healthBonus: 1,
      maxStacks: 10,
      upgradeDescription: 'Permanent +1 health per purchase'
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
      cost: 150,
      // Doubled regen-per-stack and cut cost ~40% — at the old numbers the
      // stacked payoff was $2500 for only +0.1 HP/s, too slow to matter.
      description: '+0.02 HP/s Regeneration',
      regenBonus: 0.002, // displays as 0.02 HP/s
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
      cost: 300,
      // game.ts#updateItemEffects boosts only movement speed when below
      // triggerHealthPercent — description now matches the real effect.
      description: '+30% movement speed when below 30% HP',
      triggerHealthPercent: 0.3,
      statBoostPercent: 0.3,
      maxStacks: 1
    },
    doubleTap: {
      name: 'Double Tap',
      cost: 900,
      // 20% free-shot-again is effectively +20% fire rate with no penalty
      // plus proc chance to double-up big hits. Post fire-rate nerf pass,
      // $600 was the best DPS/$ buy in the shop; raised to $900.
      description: '20% chance to shoot twice',
      doubleShotChance: 0.2,
      maxStacks: 1
    },
    bloodPact: {
      name: 'Blood Pact',
      cost: 5000,
      // $8500 for a 30% chance at 0.5 HP was punitive — the expected return
      // was ~$56 per HP. Doubled the drop heal to 1.0 HP and cut cost to $5000;
      // now pairs sensibly with Life Steal and Vampiric Shots late game.
      description: 'Killed enemies have a 30% chance to drop a 1 HP heal.',
      healthDropChance: 0.3,
      healthDropAmount: 1.0,
      maxStacks: 1
    },
    glassCannon: {
      name: 'Glass Cannon',
      cost: 1500,
      description: '+100% Damage, -50% Max Health',
      damageMultiplier: 2.0,
      healthMultiplier: 0.5,
      maxStacks: 1
    },
    // New universal items (filling gaps: dedicated crit damage, dodge,
    // tanky regen, and prospector/economy). All effects route through
    // existing stat plumbing so they work for every character.
    reinforcedPlating: {
      name: 'Reinforced Plating',
      cost: 300,
      description: '+8 Max Health, +0.05 HP/s Regeneration',
      healthBonus: 8,
      regenBonus: 0.005, // displays as 0.05 HP/s (frame regen scaled x10 in UI)
      maxStacks: 1
    },
    sniperScope: {
      name: 'Sniper Scope',
      cost: 260,
      description: '+50% Crit Damage',
      critDamageBonus: 50,
      maxStacks: 1
    },
    evasionTraining: {
      name: 'Evasion Training',
      cost: 380,
      description: '+10% Dodge Chance',
      dodgeBonus: 10,
      maxStacks: 1
    },
    prospectorsCharm: {
      name: "Prospector's Charm",
      cost: 220,
      description: '+3 Luck, +30 Pickup Range',
      luckBonus: 3,
      pickupRangeBonus: 30,
      maxStacks: 1
    },
    // Fighter-specific items
    dogTags: {
      name: 'Dog Tags',
      cost: 300,
      description: 'Kills heal 0.5 HP when below 50% health',
      healAmount: 0.5,
      healthThreshold: 0.5,
      maxStacks: 1,
      fighterOnly: true
    },
    tacticalMag: {
      name: 'Tactical Magazine',
      cost: 400,
      description: 'Every 10th kill triggers a 3-second window of 3x damage.',
      procInterval: 10,
      procMultiplier: 3.0,
      procDuration: 3,
      maxStacks: 1,
      fighterOnly: true
    },
    fieldCommander: {
      name: 'Field Commander',
      cost: 1000,
      description: '+5% damage per weapon owned',
      damagePerWeapon: 0.05,
      maxStacks: 1,
      fighterOnly: true
    },
    combatStimulant: {
      name: 'Combat Stimulant',
      cost: 500,
      description: 'At the start of every wave, gain +50% fire rate for 5 seconds.',
      duration: 5,
      fireRateMultiplier: 1.5,  // Down from 2.0 — fire rate nerf pass.
      maxStacks: 1,
      fighterOnly: true
    },
    ironWill: {
      name: 'Iron Will',
      cost: 450,
      description: 'Below 50% HP: +25% damage',
      damageBonus: 0.25,
      hpThreshold: 0.5,
      maxStacks: 1,
      fighterOnly: true
    },
    veteranCrest: {
      name: "Veteran's Crest",
      cost: 600,
      description: 'Momentum Burst lasts +5% longer per wave survived.',
      durationPerStack: 0.05,
      maxStacks: 1,
      fighterOnly: true
    },
    momentumCoil: {
      name: 'Momentum Coil',
      cost: 550,
      description: 'Momentum decays 50% slower and gains +2 per kill.',
      decayMultiplier: 0.5,
      bonusPerKill: 2,
      maxStacks: 1,
      fighterOnly: true
    },
    // Wizard-specific items
    frostHeart: {
      name: 'Frost Heart',
      cost: 350,
      description: 'Ice Nova: -40% cooldown, +50% freeze',
      novasCdrBonus: 0.4,
      freezeDurationBonus: 0.5,
      maxStacks: 1,
      wizardOnly: true
    },
    stormConductor: {
      name: 'Storm Conductor',
      cost: 400,
      description: 'Chain Lightning: +3 jumps, -0.15s CD/jump',
      extraJumps: 3,
      cdrPerJump: 0.15,
      maxStacks: 1,
      wizardOnly: true
    },
    pyromancerLens: {
      name: "Pyromancer's Lens",
      cost: 450,
      description: 'Fireball: +50% AoE, 2x dmg to frozen',
      aoeBonus: 0.5,
      frozenDamageMultiplier: 2.0,
      maxStacks: 1,
      wizardOnly: true
    },
    soulHarvest: {
      name: 'Soul Harvest',
      cost: 250,
      description: 'Each kill reduces all spell cooldowns by 0.3s.',
      cdrPerKill: 0.3,
      maxStacks: 3,
      wizardOnly: true,
      upgradeDescription: 'Stackable cooldown on kill'
    },
    recklessCasting: {
      name: 'Reckless Casting',
      cost: 350,
      description: '+20% spell damage, +25% longer cooldowns',
      damageBonus: 0.2,
      cooldownPenalty: 0.25,
      maxStacks: 1,
      wizardOnly: true
    },
    voidchannel: {
      name: 'Void Channel',
      cost: 500,
      description: '+40% spell power, +30% longer cooldowns. High risk.',
      spellPowerBonus: 0.4,
      cooldownPenalty: 0.3,
      maxStacks: 1,
      wizardOnly: true
    },
    chronoCrystal: {
      name: 'Chrono Crystal',
      cost: 120,
      description: '-10% spell cooldowns',
      cooldownReduction: 0.10,
      maxStacks: 5,
      wizardOnly: true,
      upgradeDescription: 'Stackable cooldown reduction'
    },
    spellFocus: {
      name: 'Spell Focus',
      cost: 200,
      description: '+10% Spell Power',
      spellPowerBonus: 0.1,
      maxStacks: 5,
      wizardOnly: true,
      upgradeDescription: 'Stackable spell power boost'
    },
    arcaneConduit: {
      name: 'Arcane Conduit',
      cost: 350,
      description: '-15% Spell Cooldowns',
      cooldownReduction: 0.15,
      maxStacks: 3,
      wizardOnly: true,
      upgradeDescription: 'Stackable cooldown reduction'
    },
    temporalFlow: {
      name: 'Temporal Flow',
      cost: 500,
      description: '+30% cooldown recovery speed',
      cooldownSpeedBonus: 0.3,
      maxStacks: 1,
      wizardOnly: true
    },
    rapidFire: {
      name: 'Rapid Fire',
      cost: 800,
      description: '+30% spell damage while every spell is off cooldown.',
      allReadyDamageBonus: 0.3,
      maxStacks: 1,
      wizardOnly: true
    },
    // Manager-specific items
    megaphone: {
      name: 'Megaphone',
      cost: 400,
      description: '+20% damage to all recruits',
      recruitDamageBonus: 0.2,
      maxStacks: 1,
      managerOnly: true
    },
    healthInsurance: {
      name: 'Health Insurance',
      cost: 500,
      description: 'All recruits regenerate 0.5 HP per second.',
      recruitRegen: 0.5,
      maxStacks: 1,
      managerOnly: true
    },
    trainingCamp: {
      name: 'Training Camp',
      cost: 700,
      description: 'Newly recruited allies start at level 2.',
      recruitStartLevel: 2,
      maxStacks: 1,
      managerOnly: true
    },
    // Capitalist-specific items
    accountant: {
      name: 'Accountant',
      cost: 300,
      description: '+25% dividend income',
      dividendMultiplier: 1.25,
      maxStacks: 1,
      capitalistOnly: true
    },
    marketingCampaign: {
      name: 'Marketing Campaign',
      cost: 450,
      description: '+20% business production rate',
      productionSpeedBonus: 0.2,
      maxStacks: 1,
      capitalistOnly: true
    },
    venturCapital: {
      name: 'Venture Capital',
      cost: 600,
      description: '-30% business cost',
      businessCostReduction: 0.3,
      maxStacks: 1,
      capitalistOnly: true
    },
    // Vampire-specific items
    crimsonFang: {
      name: 'Crimson Fang',
      cost: 400,
      description: 'Kills drain +50% more HP (0.45 per kill).',
      bloodDrainMultiplier: 1.5,
      maxStacks: 1,
      vampireOnly: true
    },
    darkPact: {
      name: 'Dark Pact',
      cost: 500,
      description: 'Frenzy now triggers below 50% HP instead of 30%.',
      frenzyThreshold: 0.5,
      maxStacks: 1,
      vampireOnly: true
    },
    bloodChalice: {
      name: 'Blood Chalice',
      cost: 450,
      description: 'Blood Bank capacity doubled.',
      bloodBankCapacityMultiplier: 2.0,
      maxStacks: 1,
      vampireOnly: true
    },
    // Speedster-specific items
    frictionBoots: {
      name: 'Friction Boots',
      cost: 350,
      description: 'Your dash afterimages persist 2x longer.',
      afterimageDurationMultiplier: 2.0,
      maxStacks: 1,
      speedsterOnly: true
    },
    warpCore: {
      name: 'Warp Core',
      cost: 400,
      description: '+100px dash distance per stack (max +300).',
      dashDistanceBonus: 100,
      maxStacks: 3,
      stackCap: 300,
      speedsterOnly: true,
      upgradeDescription: 'Stack for more dash range'
    },
    chronoShard: {
      name: 'Chrono Shard',
      cost: 500,
      description: 'Time Dilation effects last 2x longer.',
      timeDilationDurationMultiplier: 2.0,
      maxStacks: 1,
      speedsterOnly: true
    },
    speedDemon: {
      name: 'Speed Demon',
      cost: 450,
      description: 'Gain +1% movement speed per kill; resets at wave start.',
      speedPerKill: 0.01,
      maxStacks: 1,
      speedsterOnly: true
    },
    lightSpeed: {
      name: 'Light Speed',
      cost: 400,
      description: 'Your Velocity meter fills 30% faster.',
      velocityFillMultiplier: 1.3,
      maxStacks: 1,
      speedsterOnly: true
    },
    slipstream: {
      name: 'Slipstream',
      cost: 425,
      description: 'Auto-dash cooldown reduced by 25%.',
      dashCooldownMultiplier: 0.75,
      maxStacks: 1,
      speedsterOnly: true
    },
    // Hulk-specific items
    furyChain: {
      name: 'Fury Chain',
      cost: 450,
      description: 'Each kill during Unstoppable extends it by 0.5s.',
      extendSeconds: 0.5,
      maxStacks: 1,
      hulkOnly: true
    },
    titansBelt: {
      name: "Titan's Belt",
      cost: 180,
      description: '+10 Max HP per stack (max 5)',
      healthBonus: 10,
      maxStacks: 5,
      hulkOnly: true,
      upgradeDescription: 'Stackable raw HP - brute durability'
    },
    seismicCore: {
      name: 'Seismic Core',
      cost: 350,
      description: '+25% auto-slam damage per stack',
      slamDamageBonus: 0.25,
      maxStacks: 3,
      hulkOnly: true,
      upgradeDescription: 'Heavier slams on every 3rd fist'
    }
  },

  // Spell scaling - per-spell data-driven scaling (overrides defaults in SpellSystem)
  spells: {
    // Per-level scaling. MM: +1 bolt/level (cap 8 in code) + 10% damage.
    magicMissile:   { damageScalePerLevel: 0.10, cooldownScalePerLevel: -0.05 },
    fireball:       { damageScalePerLevel: 0.30, cooldownScalePerLevel: -0.05, radiusScalePerLevel: 0.05 },
    chainLightning: { damageScalePerLevel: 0.25, cooldownScalePerLevel: -0.03, jumpsPerLevel: 1 },
    iceNova:        { damageScalePerLevel: 0.25, cooldownScalePerLevel: -0.04, radiusScalePerLevel: 0.05 },
    teleport:       { damageScalePerLevel: 0.30, cooldownScalePerLevel: -0.05, radiusScalePerLevel: 0.10 },
    meteorStorm:    { damageScalePerLevel: 0.20, cooldownScalePerLevel: -0.04, meteorsPerLevel: 1 },
    shieldBubble:   { damageScalePerLevel: 0.0,  cooldownScalePerLevel: -0.08 },
    // Arcane Beam cooldown reduces per level → faster damage ticks.
    arcaneBeam:     { damageScalePerLevel: 0.25, cooldownScalePerLevel: -0.05 },
    timeWarp:       { damageScalePerLevel: 0.0,  cooldownScalePerLevel: -0.03, durationPerLevel: 1.5 },
    summonFamiliar: { damageScalePerLevel: 0.25, cooldownScalePerLevel: -0.04, durationPerLevel: 5.0 }
  },

  // Capitalist: Businesses
  // productionRate = seconds between products (lower is faster). productSpeed = pixels/sec product travels.
  // tier: 1|2|3. upgradesTo references the next-tier entry id.
  // passiveIncome: flat gold/wave (Banks). stockDividendBonus: multiplier boost to stock divs (Radio).
  // productionAura: adjacent-cell production boost fraction (Labs). damageAura: adjacent damage boost.
  // synergiesWith: adjacency with any of these ids grants +30% production to BOTH cells.
  businesses: {
    // 1. Burger Joint -> Diner -> Restaurant (fast, low dmg). Synergy: Farm.
    burgerJoint:   { name: 'Burger Joint',   tier: 1, cost: 50,   sellValueFraction: 0.5, upgradesTo: 'diner',      health: 40,  productionRate: 2.0, damage: 1.0, productSpeed: 160, color: '#FF8C00', synergiesWith: ['farm','greenhouse','megaFarm'], description: 'Fast-food — rapid low-dmg burgers. Pairs with Farm.' },
    diner:         { name: 'Diner',          tier: 2, cost: 150,  sellValueFraction: 0.5, upgradesTo: 'restaurant', health: 70,  productionRate: 1.6, damage: 1.6, productSpeed: 170, color: '#FF9E2C', synergiesWith: ['farm','greenhouse','megaFarm'], description: 'Upgraded Burger Joint — faster, tougher.' },
    restaurant:    { name: 'Restaurant',     tier: 3, cost: 500,  sellValueFraction: 0.5,                             health: 110, productionRate: 1.2, damage: 2.4, productSpeed: 180, color: '#FFB347', synergiesWith: ['farm','greenhouse','megaFarm'], description: 'Gourmet chain — sizzling throughput.' },

    // 2. Mercenary Camp -> Barracks -> Fortress (medium dmg).
    mercenaryCamp: { name: 'Mercenary Camp', tier: 1, cost: 150,  sellValueFraction: 0.5, upgradesTo: 'barracks',   health: 50,  productionRate: 3.0, damage: 2.0, productSpeed: 110, color: '#8B4513', synergiesWith: ['bank','bigBank','skyscraper'], description: 'Soldiers-for-hire. Pairs with Bank.' },
    barracks:      { name: 'Barracks',       tier: 2, cost: 350,  sellValueFraction: 0.5, upgradesTo: 'fortress',   health: 85,  productionRate: 2.5, damage: 3.2, productSpeed: 120, color: '#A0522D', synergiesWith: ['bank','bigBank','skyscraper'], description: 'Disciplined troops — better dmg & HP.' },
    fortress:      { name: 'Fortress',       tier: 3, cost: 900,  sellValueFraction: 0.5,                             health: 150, productionRate: 2.0, damage: 5.0, productSpeed: 130, color: '#B8682E', synergiesWith: ['bank','bigBank','skyscraper'], description: 'Elite garrison — sustained firepower.' },

    // 3. Robot Factory -> Mech Plant -> Gigafactory (tanky).
    robotFactory:  { name: 'Robot Factory',  tier: 1, cost: 200,  sellValueFraction: 0.5, upgradesTo: 'mechPlant',  health: 60,  productionRate: 4.0, damage: 3.0, productSpeed: 100, color: '#888888', synergiesWith: ['laboratory','researchCenter','innovationHub'], description: 'Robots. Pairs with Laboratory.' },
    mechPlant:     { name: 'Mech Plant',     tier: 2, cost: 450,  sellValueFraction: 0.5, upgradesTo: 'gigafactory',health: 100, productionRate: 3.2, damage: 4.5, productSpeed: 110, color: '#9FA8B2', synergiesWith: ['laboratory','researchCenter','innovationHub'], description: 'Heavier mechs — more HP & damage.' },
    gigafactory:   { name: 'Gigafactory',    tier: 3, cost: 1100, sellValueFraction: 0.5,                             health: 170, productionRate: 2.6, damage: 7.0, productSpeed: 120, color: '#C0C8D0', synergiesWith: ['laboratory','researchCenter','innovationHub'], description: 'Mass-produced war machines.' },

    // 4. Drone Hub -> Drone Swarm -> Sky Command (flying, fast, low dmg).
    droneHub:      { name: 'Drone Hub',      tier: 1, cost: 350,  sellValueFraction: 0.5, upgradesTo: 'droneSwarm', health: 30,  productionRate: 1.5, damage: 2.0, productSpeed: 200, color: '#4169E1', synergiesWith: ['radioTower','broadcastStation','networkHQ'], description: 'Flying drones. Pairs with Radio Tower.' },
    droneSwarm:    { name: 'Drone Swarm',    tier: 2, cost: 700,  sellValueFraction: 0.5, upgradesTo: 'skyCommand', health: 55,  productionRate: 1.2, damage: 2.8, productSpeed: 220, color: '#5A7CE8', synergiesWith: ['radioTower','broadcastStation','networkHQ'], description: 'Expanded swarm — faster salvos.' },
    skyCommand:    { name: 'Sky Command',    tier: 3, cost: 1400, sellValueFraction: 0.5,                             health: 90,  productionRate: 0.9, damage: 3.6, productSpeed: 240, color: '#7FA7F0', synergiesWith: ['radioTower','broadcastStation','networkHQ'], description: 'Orbital-grade drones — relentless.' },

    // 5. Tank Depot -> Armored Division -> War Machine (heavy AOE slow).
    tankDepot:        { name: 'Tank Depot',        tier: 1, cost: 500,  sellValueFraction: 0.5, upgradesTo: 'armoredDivision', health: 100, productionRate: 6.5, damage: 8.0,  productSpeed: 65, color: '#556B2F', synergiesWith: ['mercenaryCamp','barracks','fortress'], description: 'Heavy slow tanks. Pairs with Mercenary Camp.' },
    armoredDivision:  { name: 'Armored Division',  tier: 2, cost: 1000, sellValueFraction: 0.5, upgradesTo: 'warMachine',      health: 160, productionRate: 5.5, damage: 13.0, productSpeed: 70, color: '#6F874A', synergiesWith: ['mercenaryCamp','barracks','fortress'], description: 'Armored column — bigger tanks, bigger booms.' },
    warMachine:       { name: 'War Machine',       tier: 3, cost: 1500, sellValueFraction: 0.5,                                  health: 230, productionRate: 4.5, damage: 20.0, productSpeed: 80, color: '#8BA362', synergiesWith: ['mercenaryCamp','barracks','fortress'], description: 'Devastating artillery.' },

    // 6. Bank -> Big Bank -> Skyscraper (passive income, NO products).
    bank:         { name: 'Bank',       tier: 1, cost: 200,  sellValueFraction: 0.5, upgradesTo: 'bigBank',    health: 60,  productionRate: 0, damage: 0, productSpeed: 0, color: '#228B55', passiveIncome: 8,  description: '+$8 gold/wave. No attacks.' },
    bigBank:      { name: 'Big Bank',   tier: 2, cost: 450,  sellValueFraction: 0.5, upgradesTo: 'skyscraper', health: 100, productionRate: 0, damage: 0, productSpeed: 0, color: '#2EAB6B', passiveIncome: 20, description: '+$20 gold/wave.' },
    skyscraper:   { name: 'Skyscraper', tier: 3, cost: 1200, sellValueFraction: 0.5,                           health: 150, productionRate: 0, damage: 0, productSpeed: 0, color: '#45D088', passiveIncome: 50, description: '+$50 gold/wave. Symbol of wealth.' },

    // 7. Casino -> Resort -> Vegas Strip (random payouts — 50% nothing, 50% 2x passiveIncome).
    casino:       { name: 'Casino',      tier: 1, cost: 180, sellValueFraction: 0.5, upgradesTo: 'resort',      health: 55,  productionRate: 0, damage: 0, productSpeed: 0, color: '#B23AEE', passiveIncome: 30,  description: '50% shot at $60/wave. Volatile.' },
    resort:       { name: 'Resort',      tier: 2, cost: 500, sellValueFraction: 0.5, upgradesTo: 'vegasStrip',  health: 95,  productionRate: 0, damage: 0, productSpeed: 0, color: '#D066FF', passiveIncome: 75,  description: '50% shot at $150/wave.' },
    vegasStrip:   { name: 'Vegas Strip', tier: 3, cost: 1300, sellValueFraction: 0.5,                            health: 140, productionRate: 0, damage: 0, productSpeed: 0, color: '#F08CFF', passiveIncome: 180, description: '50% shot at $360/wave. Big swings.' },

    // 8. Laboratory -> Research Center -> Innovation Hub (no products; adjacent production aura).
    laboratory:       { name: 'Laboratory',       tier: 1, cost: 250, sellValueFraction: 0.5, upgradesTo: 'researchCenter', health: 50,  productionRate: 0, damage: 0, productSpeed: 0, color: '#00CED1', productionAura: 0.20, description: '+20% production to adjacent businesses.' },
    researchCenter:   { name: 'Research Center',  tier: 2, cost: 550, sellValueFraction: 0.5, upgradesTo: 'innovationHub',  health: 85,  productionRate: 0, damage: 0, productSpeed: 0, color: '#3DDCDF', productionAura: 0.35, damageAura: 0.15, description: '+35% production, +15% damage to neighbors.' },
    innovationHub:    { name: 'Innovation Hub',   tier: 3, cost: 1200, sellValueFraction: 0.5,                                health: 125, productionRate: 0, damage: 0, productSpeed: 0, color: '#7DF0F2', productionAura: 0.50, damageAura: 0.30, description: '+50% production, +30% damage to neighbors.' },

    // 9. Farm -> Greenhouse -> Mega Farm (crops as small-dmg projectiles; synergy target for burger).
    farm:         { name: 'Farm',        tier: 1, cost: 120, sellValueFraction: 0.5, upgradesTo: 'greenhouse', health: 45,  productionRate: 2.6, damage: 0.8, productSpeed: 130, color: '#9ACD32', synergiesWith: ['burgerJoint','diner','restaurant'], description: 'Lobs crops. Pairs with Burger Joint.' },
    greenhouse:   { name: 'Greenhouse',  tier: 2, cost: 300, sellValueFraction: 0.5, upgradesTo: 'megaFarm',   health: 75,  productionRate: 2.1, damage: 1.4, productSpeed: 140, color: '#B4E060', synergiesWith: ['burgerJoint','diner','restaurant'], description: 'Year-round harvest.' },
    megaFarm:     { name: 'Mega Farm',   tier: 3, cost: 800, sellValueFraction: 0.5,                           health: 120, productionRate: 1.7, damage: 2.2, productSpeed: 150, color: '#CFF088', synergiesWith: ['burgerJoint','diner','restaurant'], description: 'Industrial agriculture.' },

    // 10. Radio Tower -> Broadcast Station -> Network HQ (no products; boosts stock dividends).
    radioTower:        { name: 'Radio Tower',        tier: 1, cost: 180,  sellValueFraction: 0.5, upgradesTo: 'broadcastStation', health: 35,  productionRate: 0, damage: 0, productSpeed: 0, color: '#FF4081', stockDividendBonus: 0.15, description: '+15% stock dividends. No attacks.' },
    broadcastStation:  { name: 'Broadcast Station', tier: 2, cost: 450,  sellValueFraction: 0.5, upgradesTo: 'networkHQ',         health: 65,  productionRate: 0, damage: 0, productSpeed: 0, color: '#FF5E9D', stockDividendBonus: 0.30, description: '+30% stock dividends.' },
    networkHQ:         { name: 'Network HQ',        tier: 3, cost: 1100, sellValueFraction: 0.5,                                    health: 100, productionRate: 0, damage: 0, productSpeed: 0, color: '#FF85B8', stockDividendBonus: 0.50, description: '+50% stock dividends.' }
  },

  // Capitalist passive: CEO Aura — structures within this radius produce +70% while player is near.
  // Widened the radius so the bonus triggers more reliably from a "dance near the grid" playstyle.
  ceoAura: {
    radius: 180,
    productionBonus: 0.7,
  },

  // Capitalist passive: Dividend Drizzle — every business drops a small coin at this interval.
  // Faster cadence + slightly bigger coin so early waves feel less starved for income.
  dividendDrizzle: {
    interval: 4.0,
    coinValue: 4,
  },

  // Capitalist passive: Bull Market — each structure kill grants a stacking production boost to all.
  // Bumped per-stack and max, lengthened window so chains are achievable late-wave.
  bullMarket: {
    bonusPerStack: 0.20,
    maxStacks: 4,
    duration: 5.0,
  },

  // Capitalist passive: Capital Supremacy — the wealth-to-power conversion.
  // Every $X in the player's bank adds (bonusPerDollar) to BOTH structure
  // production rate and structure damage, capped at maxBonus. Scales linearly
  // with current bank balance so holding money directly makes businesses kill
  // harder. Hoarding is rewarded; spending trades permanent bank power for a
  // specific business / stock / item.
  capitalSupremacy: {
    bonusPerDollar: 0.000005,   // +0.5% per $1000 = +2.0 per $400k
    maxBonus: 2.0,              // cap at +200% (saturates at $400k in bank)
  },

  // Manager passive: Leader's Presence — recruits in radius get damage/firerate buff.
  leadersPresence: {
    radius: 150,
    damageBonus: 0.25,
    fireRateBonus: 0.2,
  },

  // Manager passive: Morale — cash tip per recruit kill.
  morale: {
    cashPerKill: 3,
  },

  // Capitalist: Stocks. Early options give flat / growing dividends; late
  // options reward deep pockets with compounding returns (the whole point of
  // the class is to get stupidly rich, so the shop needs a money sink that
  // scales with wealth).
  stocks: {
    blueChip:      { name: 'Blue Chip',      cost: 100,  dividend: 20 },
    growthStock:   { name: 'Growth Stock',   cost: 200,  baseDividend: 10, growthInterval: 5 },
    pennyStock:    { name: 'Penny Stock',    cost: 25,   payout: 100, loseChance: 0.5 },
    indexFund:     { name: 'Index Fund',     cost: 500,  percentPayout: 0.1 },
    // Late-game compounding sinks. Capped to avoid runaway exponential stacking:
    // at 5 Hedge Funds + $400k bank (Capital Supremacy cap) you earn 10%/wave
    // = $40k/wave, which is strong but not instant-win.
    hedgeFund:     { name: 'Hedge Fund',     cost: 3000, bankPercentPayout: 0.02, maxStacks: 5 },  // +2% of current bank per wave per share
    holdingsGroup: { name: 'Holdings Group', cost: 5000, perStockDividend: 30,   maxStacks: 3 },  // $30 per stock owned
  },

  // Boss definitions for waves 10, 20, 30. Used by SpawnSystem + Boss entity.
  bosses: {
    wave10: {
      id: 'wave10',
      // HP bumped 700 → 1300 per tuning pass.
      name: 'Geometric Warlord',
      hp: 1300,
      contactDamage: 6,
      speed: 60,
      size: 90,
      color: '#CC1111',
      strokeColor: '#FF6666',
      coreColor: '#FFFFFF',
      phases: [
        { name: 'Spawning Phase', hpThreshold: 1.0, outline: '#FF3333' },
        { name: 'Charge Phase', hpThreshold: 0.5, outline: '#FFD700', banner: 'CHARGE!' },
      ],
      minionCooldown: 4.0,
      minionCount: 10,
      radialFireCooldown: 3.2,
      radialShots: 6,
      dashCooldown: 2.8,
      dashDuration: 0.8,
      dashSpeedMultiplier: 4.5,
      banner: 'I WILL END YOU',
      cashPileValue: 500,
    },
    wave20: {
      id: 'wave20',
      name: 'Nexus Prism',
      hp: 2500,
      contactDamage: 8,
      speed: 55,
      size: 100,
      color: '#6622AA',
      strokeColor: '#CC66FF',
      coreColor: '#FFFFFF',
      droneCount: 3,
      droneRadius: 95,
      droneSize: 28,
      droneHp: 120,
      droneRespawn: 15.0,
      shieldReduction: 0.8, // 80% damage reduction while all drones alive
      enrageDuration: 8.0,
      enrageFireRateMul: 1.5,
      seekerCooldown: 4.0,
      seekerSpeed: 160,
      seekerDamage: 5,
      seekerHoming: true,
      droneDeathAoeDamage: 4,
      droneDeathAoeShots: 8,
      poolCooldown: 7.0,
      poolLifetime: 5.0,
      poolRadius: 75,
      poolDamage: 3,
      banner: 'WITNESS THE NEXUS',
      cashPileValue: 1200,
    },
    wave30: {
      id: 'wave30',
      name: 'The Hollow King',
      hp: 7000,
      contactDamage: 10,
      speed: 70,
      size: 115,
      color: '#0a0a0a',
      strokeColor: '#FFD700',
      coreColor: '#FFD700',
      phases: [
        { name: 'Echoes', hpThreshold: 1.00, outline: '#FFD700', banner: 'I AM RELENTLESS' },
        { name: 'Constriction', hpThreshold: 0.66, outline: '#FF8800', banner: 'KNEEL' },
        { name: 'Shockwave', hpThreshold: 0.33, outline: '#FF0000', banner: 'DESPAIR' },
      ],
      echoCount: 3,
      echoDamageMul: 0.4,
      sweepBeamCooldown: 5.0,
      sweepBeamDuration: 1.8,
      sweepBeamDamage: 4,
      constrictCycle: 11.0,     // more breathing room between cycles
      constrictDuration: 8.0,
      constrictWallDamage: 2.5, // slightly fairer wall dps
      teleportCooldown: 3.5,    // a beat more between teleport shockwaves
      shockwaveDamage: 8,
      shockwaveRadius: 170,
      banner: 'I AM RELENTLESS',
      cashPileValue: 3000,
    },
  },

  // Manager: Recruit data lives in RecruitSystem.ts (authoritative).

  // UI Configuration
  ui: {
    canvasWidth: 800,
    canvasHeight: 800,
    gameAreaHeight: 700,
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
    rerollCost: 30,  // Cost to reroll options — cheap enough early, not free-spam late
    upgradeTypes: [
      { type: 'health', weight: 10, value: 1.0, display: '+1 Health' },
      { type: 'damage', weight: 10, value: 0.2, display: '+0.2 Damage' },
      { type: 'fireRate', weight: 5, value: 0.05, display: '+5% Fire Rate' },
      { type: 'speed', weight: 8, value: 10, display: '+10 Speed' },
      { type: 'dodge', weight: 6, value: 2, display: '+2% Dodge' },
      { type: 'luck', weight: 6, value: 1, display: '+1 Luck' },
      { type: 'critChance', weight: 5, value: 2, display: '+2% Crit Chance' },
      { type: 'critDamage', weight: 5, value: 10, display: '+10% Crit Damage' },
      { type: 'regeneration', weight: 4, value: 0.005, display: '+0.05 HP/s Regen' },
      { type: 'cooldownSpeed', weight: 6, value: 0.10, display: '+10% CD Speed' },
      { type: 'spellPower', weight: 5, value: 0.15, display: '+15% Spell Power' },
      // Hulk-flavored
      { type: 'slamRadius', weight: 5, value: 25, display: '+25px Slam Radius' },
      { type: 'fistSwingSpeed', weight: 5, value: 0.15, display: '+15% Fist Swing Speed' },
      { type: 'armor', weight: 5, value: 0.05, display: '+5% Damage Reduction' },
      // Vampire-flavored
      { type: 'bloodDrain', weight: 5, value: 0.05, display: '+0.05 HP per kill' },
      { type: 'frenzyThreshold', weight: 4, value: 0.05, display: '+5% Frenzy Threshold' },
      { type: 'bloodBankCapacity', weight: 4, value: 2, display: '+2 Blood Bank Capacity' },
      // Speedster-flavored
      { type: 'afterimageDamage', weight: 5, value: 0.25, display: '+25% Afterimage Damage' },
      { type: 'dashDistance', weight: 5, value: 30, display: '+30px Dash Distance' },
      { type: 'timeDilationDuration', weight: 4, value: 1.0, display: '+1s Time Warp Duration' },
      // Manager-flavored
      { type: 'recruitDamage', weight: 5, value: 0.15, display: '+15% Recruit Damage' },
      { type: 'recruitHealth', weight: 5, value: 0.15, display: '+15% Recruit Health' },
      { type: 'recruitSpeed', weight: 4, value: 0.10, display: '+10% Recruit Speed' },
      { type: 'synergyBonus', weight: 4, value: 0.10, display: '+10% Synergy Bonus' },
      // Capitalist-flavored
      { type: 'productionSpeed', weight: 5, value: 0.15, display: '+15% Production Speed' },
      { type: 'dividendRate', weight: 5, value: 0.15, display: '+15% Dividend Rate' },
      { type: 'structureHealth', weight: 4, value: 0.20, display: '+20% Structure Health' },
      // Fighter-flavored
      { type: 'burstDuration', weight: 4, value: 0.5, display: '+0.5s Burst Duration' },
      { type: 'momentumDecayRate', weight: 4, value: -0.15, display: '-15% Momentum Decay' }
    ]
  },

  // Achievements
  achievements: [
    // Combat milestones
    { id: 'firstBlood', name: 'First Blood', description: 'Kill your first enemy.',
      icon: '*', tier: 'bronze', reward: { prestigePoints: 5 }, progressTarget: 1, progressField: 'lifetimeKills' },
    { id: 'kills100', name: 'Exterminator', description: 'Kill 100 enemies across all runs.',
      icon: 'x', tier: 'bronze', reward: { prestigePoints: 10 }, progressTarget: 100, progressField: 'lifetimeKills' },
    { id: 'kills500', name: 'Swarm Breaker', description: 'Kill 500 enemies across all runs.',
      icon: 'X', tier: 'silver', reward: { prestigePoints: 30 }, progressTarget: 500, progressField: 'lifetimeKills' },
    { id: 'kills1000', name: 'Legion Slayer', description: 'Kill 1000 enemies across all runs.',
      icon: 'K', tier: 'gold', reward: { prestigePoints: 100 }, progressTarget: 1000, progressField: 'lifetimeKills' },

    // Death / run cycle
    { id: 'firstDeath', name: 'A Learning Experience', description: 'Die for the first time.',
      icon: 'o', tier: 'bronze', reward: { prestigePoints: 5 } },

    // Boss
    { id: 'firstBoss', name: 'Giant Slayer', description: 'Defeat your first boss.',
      icon: 'B', tier: 'silver', reward: { prestigePoints: 20 } },

    // Wave milestones
    { id: 'wave5', name: 'Getting Warmed Up', description: 'Reach wave 5.',
      icon: '5', tier: 'bronze', reward: { prestigePoints: 5 } },
    { id: 'wave10', name: 'Double Digits', description: 'Reach wave 10.',
      icon: '#', tier: 'bronze', reward: { prestigePoints: 10 } },
    { id: 'wave20', name: 'Veteran', description: 'Reach wave 20.',
      icon: '=', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'wave30', name: 'Champion', description: 'Complete wave 30 to win a run.',
      icon: 'W', tier: 'gold', reward: { prestigePoints: 150 } },

    // Shop / money
    { id: 'weaponCollector', name: 'Weapon Collector', description: 'Stock 10 weapons in a single run.',
      icon: '~', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'bigSpender', name: 'Big Spender', description: 'Earn $5000 across all runs.',
      icon: '$', tier: 'silver', reward: { prestigePoints: 25 }, progressTarget: 5000, progressField: 'lifetimeMoney' },

    // Character-specific wins
    { id: 'winFighter', name: 'Balanced Victory', description: 'Win a run with the Fighter.',
      icon: 'F', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'winWizard', name: 'Arcane Victory', description: 'Win a run with the Wizard.',
      icon: 'M', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'winManager', name: 'Corporate Victory', description: 'Win a run with the Manager.',
      icon: 'T', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'winCapitalist', name: 'Wealthy Victory', description: 'Win a run with the Capitalist.',
      icon: 'C', tier: 'silver', reward: { prestigePoints: 30 } },
    { id: 'winGlassCannon', name: 'Untouchable', description: 'Win a run with the Glass Cannon.',
      icon: 'G', tier: 'gold', reward: { prestigePoints: 60 } },
    { id: 'winVampire', name: 'Blood Sovereign', description: 'Win a run with the Vampire.',
      icon: 'V', tier: 'gold', reward: { prestigePoints: 60 } },
    { id: 'winHulk', name: 'Unstoppable', description: 'Win a run with the Hulk.',
      icon: 'H', tier: 'gold', reward: { prestigePoints: 60 } },
    { id: 'winSpeedster', name: 'At Light Speed', description: 'Win a run with the Speedster.',
      icon: 'S', tier: 'gold', reward: { prestigePoints: 60 } },

    // Skill
    { id: 'flawlessWave', name: 'Flawless', description: 'Clear a wave without taking damage.',
      icon: '+', tier: 'silver', reward: { prestigePoints: 25 } },
    { id: 'pacifistWave', name: 'Pacifist', description: 'Survive a wave without firing a shot.',
      icon: '-', tier: 'silver', reward: { prestigePoints: 25 } },

    // Meta exploration
    { id: 'fourCharacters', name: 'Jack of All Trades', description: 'Play runs with 4 different characters.',
      icon: '4', tier: 'silver', reward: { prestigePoints: 35 } },
    { id: 'pp500', name: 'Prestigious', description: 'Earn 500 lifetime Prestige Points.',
      icon: 'P', tier: 'gold', reward: { prestigePoints: 125 }, progressTarget: 500, progressField: 'lifetimePpEarned' },

    // Hidden / quirky
    { id: 'veryLate', name: 'Nightmare Fuel', description: 'Finish a wave at the last possible second.',
      icon: '?', tier: 'bronze', hidden: true, reward: { prestigePoints: 10 } },
  ]
};

// Helper function to get enemy stats for a given wave and type
export interface EnemyStats {
  health: number;
  speed: number;
  damage: number;
  xpValue: number;
  moneyDropChance: number;
  moneyValue: number;
}

export function getEnemyStats(wave: number, type: string = 'basic'): EnemyStats {
  const enemyConfig = (BALANCE.enemyTypes as Record<string, typeof BALANCE.enemyTypes.basic>)[type] || BALANCE.enemyTypes.basic;
  
  let healthPerWaveScale = enemyConfig.healthPerWave;
  // Increase health scaling of basic and tracker enemies by 50% after level 6
  if (wave > 6 && (type === 'basic' || type === 'tracker')) {
    healthPerWaveScale *= 1.5;
  }

  // Post-wave-10 difficulty ramp: the per-wave health slope doubles from wave 11
  // onward. Waves 1-10 stay on the old tuning; late game actually bites back.
  const earlyWaves = Math.min(wave - 1, 9);
  const lateWaves = Math.max(0, wave - 10);
  let health = enemyConfig.baseHealth + earlyWaves * healthPerWaveScale + lateWaves * healthPerWaveScale * 2.0;
  
  if (wave < 6 && (type === 'basic' || type === 'tracker')) {
    health = enemyConfig.baseHealth; // No scaling until wave 6
  }

  // Geometric health scaler after wave 10 (the wave-10→11 boss-clear jump).
  // Capped at 2× so the post-wave-10 doubled slope (above) handles all further
  // scaling without compounding into runaway cliffs at waves 21/30.
  const epochMultiplier = wave <= 10 ? 1 : 2;
  health *= epochMultiplier;

  return {
    health: health,
    speed: enemyConfig.baseSpeed + (wave - 1) * enemyConfig.speedPerWave,
    damage: enemyConfig.baseDamage + (wave - 1) * enemyConfig.damagePerWave,
    xpValue: enemyConfig.baseXpValue + (wave - 1) * enemyConfig.xpPerWave,
    moneyDropChance: enemyConfig.moneyDropChance,
    moneyValue: enemyConfig.moneyValue
  };
}

// Helper function to get enemy type distribution for a wave
export function getWaveEnemyDistribution(wave: number): Record<string, number> {
  return (BALANCE.waveEnemyDistribution as Record<string | number, Record<string, number>>)[wave] || BALANCE.waveEnemyDistribution.default;
}

export function selectEnemyType(wave: number): string {
  const distribution = getWaveEnemyDistribution(wave);
  const random = Math.random();
  let cumulative = 0;

  for (const [type, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (random <= cumulative) {
      return type;
    }
  }

  return 'basic';
}

export function getSpawnRate(wave: number, timeInWave: number): number {
  const baseRate = BALANCE.spawning.baseSpawnRate + (wave - 1) * BALANCE.spawning.spawnRateIncreasePerWave;
  const acceleration = timeInWave * BALANCE.spawning.spawnAcceleration;
  // Post-wave-10 spawn surge: +50% density so the late-game pressure is real.
  const lateMult = wave > 10 ? 1.5 : 1.0;
  return Math.min((baseRate + acceleration) * lateMult, BALANCE.spawning.maxSpawnRate * lateMult);
}

export function getMoneyValue(wave: number): number {
  return Math.floor(BALANCE.economy.moneyDropValue * (1 + (wave - 1) * 0.2));
}