import { Player } from './entities/Player.js';
import { Pickup } from './entities/Pickup.js';
import { WeaponSystem, createWeapon } from './systems/WeaponSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { GameState } from './systems/GameState.js';
import { Menu } from './ui/Menu.js';
import { CharacterScreen } from './ui/CharacterScreen.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import { ShopScreen } from './ui/ShopScreen.js';
import { UpgradeScreen } from './ui/UpgradeScreen.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { EffectsSystem } from './systems/EffectsSystem.js';
import { SoundSystem } from './systems/SoundSystem.js';
import { GAME_CONFIG, GAME_STATES, COLORS } from './constants.js';
import { BALANCE } from './config/balance.js';

export class Game {
  #canvas;
  #ctx;
  #input;
  #gameState;
  #player;
  #enemies;
  #projectiles;
  #pickups;
  #weaponSystem;
  #spawnSystem;
  #effectsSystem;
  #soundSystem;
  #mousePosition;
  #roundTimer;
  #moneyEarned;
  #lastCountdownSecond;
  #totalKills;
  #isPaused;
  #weaponDamageStats;  // Track damage by weapon type

  constructor(canvas, ctx, input) {
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#input = input;
    this.#gameState = new GameState();
    this.#enemies = [];
    this.#projectiles = [];
    this.#pickups = [];
    this.#mousePosition = null;
    this.#roundTimer = 0;
    this.#moneyEarned = 0;
    this.#totalKills = 0;
    this.#isPaused = false;
    this.#weaponDamageStats = new Map();  // Initialize damage tracking
    
    // Initialize systems
    this.#effectsSystem = new EffectsSystem(canvas);
    this.#soundSystem = new SoundSystem();

    // Initialize UI screens
    this.menu = new Menu(canvas, this.#gameState);
    this.characterScreen = new CharacterScreen(canvas, this.#gameState);
    this.settingsScreen = new SettingsScreen(canvas, this.#gameState);
    this.shopScreen = new ShopScreen(canvas, this.#gameState, this.#soundSystem);
    this.upgradeScreen = new UpgradeScreen(canvas, this.#gameState, this.#soundSystem);
    this.gameOverScreen = new GameOverScreen(canvas, this.#gameState);
    this.pauseMenu = new PauseMenu(canvas);
    this.activeScreen = 'menu';
    
    // Setup menu callbacks
    this.menu.onLevelSelect = (level) => this.startLevel(level);
    this.menu.onCharacterClick = () => this.showCharacterScreen();
    this.menu.onShopClick = () => this.showShop();
    this.menu.onSettingsClick = () => this.showSettings();
    
    this.characterScreen.onBackClick = () => this.showMenu();
    this.settingsScreen.onBackClick = () => this.showMenu();
    this.shopScreen.onBackClick = () => this.showMenu();
    this.shopScreen.onContinueClick = () => this.showMenu();  // For post-wave shop
    this.upgradeScreen.onUpgradeSelected = () => this.showShopAfterWave();
    this.gameOverScreen.onContinueClick = () => this.showMenu();
    this.pauseMenu.onResumeClick = () => this.resumeGame();
    this.pauseMenu.onMainMenuClick = () => this.pauseToMenu();

    this.setupMouseTracking();
    this.showMenu();
    
    // DEBUG: Add global debug function
    window.debugGame = () => {
      console.log('=== GAME DEBUG INFO ===');
      console.log('Enemies:', this.#enemies.length);
      console.log('Projectiles:', this.#projectiles.length);
      console.log('Game State:', this.#gameState.getState());
      console.log('GAME_CONFIG.UI_BAR_HEIGHT:', GAME_CONFIG.UI_BAR_HEIGHT);
      console.log('GAME_CONFIG.ENEMY_SIZE:', GAME_CONFIG.ENEMY_SIZE);
      console.log('BALANCE.enemy.size:', BALANCE.enemy.size);
      if (this.#enemies.length > 0) {
        console.log('Sample enemy:', this.#enemies[0]);
      }
      return 'Debug info printed above';
    };
  }

  setupMouseTracking() {
    this.#canvas.addEventListener('mousemove', (e) => {
      const rect = this.#canvas.getBoundingClientRect();
      const scaleX = this.#canvas.width / rect.width;
      const scaleY = this.#canvas.height / rect.height;
      this.#mousePosition = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    });

    this.#canvas.addEventListener('mouseleave', () => {
      this.#mousePosition = null;
    });
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.#gameState.getState() === GAME_STATES.PLAYING && !this.#isPaused) {
          this.pauseGame();
        }
      }
    });
  }
  
  showMenu() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'menu';
    // Reset any canvas transforms when returning to menu
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.menu.activate();
    this.characterScreen.deactivate();
    this.settingsScreen.deactivate();
    this.shopScreen.deactivate();
    this.#canvas.style.cursor = 'pointer';
  }
  
  showCharacterScreen() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'character';
    this.menu.deactivate();
    this.characterScreen.activate();
    this.settingsScreen.deactivate();
    this.shopScreen.deactivate();
  }
  
  showSettings() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'settings';
    this.menu.deactivate();
    this.characterScreen.deactivate();
    this.settingsScreen.activate();
    this.shopScreen.deactivate();
  }
  
  showShop() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'shop';
    this.menu.deactivate();
    this.characterScreen.deactivate();
    this.settingsScreen.deactivate();
    this.shopScreen.showContinueButton = false;  // Regular shop from menu
    this.shopScreen.activate();
    this.#canvas.style.cursor = 'pointer';
  }
  
  showShopAfterWave() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'shop';
    this.upgradeScreen.deactivate();
    this.shopScreen.showContinueButton = true;  // Post-wave shop
    this.shopScreen.activate();
    this.#canvas.style.cursor = 'pointer';
  }
  
  pauseGame() {
    if (this.#gameState.getState() !== GAME_STATES.PLAYING) return;
    this.#isPaused = true;
    this.#gameState.setState(GAME_STATES.PAUSED);
    this.pauseMenu.activate();
    this.#canvas.style.cursor = 'pointer';
  }
  
  resumeGame() {
    this.#isPaused = false;
    this.#gameState.setState(GAME_STATES.PLAYING);
    this.pauseMenu.deactivate();
    this.#canvas.style.cursor = 'crosshair';
  }
  
  pauseToMenu() {
    this.#isPaused = false;
    this.pauseMenu.deactivate();
    this.showMenu();
  }

  startLevel(level) {
    // Deactivate all screens
    this.menu.deactivate();
    this.characterScreen.deactivate();
    this.settingsScreen.deactivate();
    this.#canvas.style.cursor = 'crosshair';
    
    // Reset weapon damage stats for this round
    this.#weaponDamageStats.clear();
    
    // Initialize player with upgraded stats (in game area, not full canvas)
    this.#player = new Player(this.#canvas.width / 2, GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT / 2);
    this.#player.health = this.#gameState.playerData.stats.health;
    this.#player.maxHealth = this.#gameState.playerData.stats.health;
    this.#player.speed = this.#gameState.playerData.stats.speed;
    
    // Apply items
    const items = this.#gameState.playerData.items || [];
    this.#player.hasBounceHouse = items.includes('bounceHouse');
    this.#player.bounceHouseStacks = this.#gameState.playerData.itemStacks?.bounceHouse || 
                                      this.#gameState.playerData.bounceHouseStacks || 0;
    this.#player.hasExplosiveRounds = items.includes('explosiveRounds');
    this.#player.hasVampiric = items.includes('vampiric');
    this.#player.hasLifeSteal = items.includes('lifeSteal');
    this.#player.hasShieldGenerator = items.includes('shieldGenerator');
    this.#player.hasAdrenalineRush = items.includes('adrenalineRush');
    this.#player.hasDoubleTap = items.includes('doubleTap');
    this.#player.hasBloodPact = items.includes('bloodPact');
    this.#player.killCount = 0;  // Track kills for vampiric

    // Initialize weapon system with effects and sound
    this.#weaponSystem = new WeaponSystem(this.#effectsSystem, this.#soundSystem);
    
    // Add owned weapons (default to pistol if none owned)
    const ownedWeapons = this.#gameState.playerData.weapons || ['pistol'];
    const weaponLevels = this.#gameState.playerData.weaponLevels || { pistol: 1 };
    for (const weaponId of ownedWeapons) {
      const level = weaponLevels[weaponId] || 1;
      const weapon = createWeapon(weaponId, level);
      this.#weaponSystem.addWeapon(weapon);
    }
    
    // Set player stats for weapons to use
    this.#player.stats = this.#gameState.playerData.stats;

    // Initialize spawn system
    this.#spawnSystem = new SpawnSystem(level, this.#effectsSystem);

    // Clear entities
    this.#enemies = [];
    this.#projectiles = [];
    this.#pickups = [];

    // Reset round stats
    this.#roundTimer = BALANCE.spawning.waveDuration;
    this.#moneyEarned = 0;
    this.#totalKills = 0;
    this.#lastCountdownSecond = Math.ceil(this.#roundTimer);

    // Set game state
    this.#gameState.currentLevel = level;
    this.#gameState.setState(GAME_STATES.PLAYING);
  }

  update(deltaTime) {
    if (this.#gameState.getState() !== GAME_STATES.PLAYING || this.#isPaused) {
      return;
    }

    // Update effects
    this.#effectsSystem.update(deltaTime);
    
    // Player regeneration
    if (this.#player.health < this.#player.maxHealth && this.#gameState.playerData.stats.regeneration > 0) {
      this.#player.health = Math.min(
        this.#player.maxHealth,
        this.#player.health + this.#gameState.playerData.stats.regeneration * deltaTime
      );
    }

    // Update round timer
    this.#roundTimer -= deltaTime;
    if (this.#roundTimer <= 0) {
      this.completeRound();
      return;
    }
    
    // Play countdown sound for last 10 seconds
    const currentSecond = Math.ceil(this.#roundTimer);
    if (currentSecond <= 10 && currentSecond !== this.#lastCountdownSecond) {
      this.#lastCountdownSecond = currentSecond;
      if (currentSecond <= 3) {
        this.#soundSystem.play('countdownUrgent');
      } else {
        this.#soundSystem.play('countdown');
      }
    }

    // Apply adrenaline rush if health is low
    if (this.#player.hasAdrenalineRush) {
      const healthPercent = this.#player.health / this.#player.maxHealth;
      if (healthPercent <= BALANCE.items.adrenalineRush.triggerHealthPercent) {
        // Apply boost to player stats temporarily
        if (!this.#player.adrenalineActive) {
          this.#player.adrenalineActive = true;
          this.#player.baseSpeed = this.#player.speed;
          this.#player.speed *= (1 + BALANCE.items.adrenalineRush.statBoostPercent);
        }
      } else if (this.#player.adrenalineActive) {
        // Remove boost when health recovers
        this.#player.adrenalineActive = false;
        this.#player.speed = this.#player.baseSpeed;
      }
    }
    
    // Update player
    this.#player.update(
      deltaTime,
      this.#input,
      this.#mousePosition,
      this.#canvas.width,
      GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT,
      GAME_CONFIG.UI_BAR_HEIGHT
    );

    // Update spawn system (use game area height) - pass player and projectiles for new enemy types
    this.#spawnSystem.update(deltaTime, this.#enemies, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT, this.#player, this.#projectiles);

    // Update weapon system (weapons handle their own sounds/effects now)
    this.#weaponSystem.update(deltaTime, this.#player, this.#enemies, this.#projectiles, this.#weaponDamageStats);

    // Update enemies - pass player, projectiles, and enemies array for AI behaviors
    for (let i = this.#enemies.length - 1; i >= 0; i--) {
      const enemy = this.#enemies[i];
      enemy.update(deltaTime, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT, this.#player, this.#projectiles, this.#enemies);

      // Check collision with player
      if (enemy.checkCollision(this.#player)) {
        // Apply dodge chance
        const dodgeRoll = Math.random() * 100;
        if (dodgeRoll < this.#gameState.playerData.stats.dodge) {
          this.#effectsSystem.floatingTexts.push({
            x: this.#player.position.x,
            y: this.#player.position.y - 20,
            text: 'DODGE!',
            vy: -30,
            life: 0.5,
            color: '#00FFFF'
          });
        } else if (this.#player.hasShieldGenerator && Math.random() < BALANCE.items.shieldGenerator.blockChance / 100) {
          // Shield blocks damage
          this.#effectsSystem.floatingTexts.push({
            x: this.#player.position.x,
            y: this.#player.position.y - 20,
            text: 'BLOCKED!',
            vy: -30,
            life: 0.5,
            color: '#00AAFF'
          });
        } else {
          this.#player.takeDamage(enemy.damage);
          this.#effectsSystem.addDamageFlash();
          this.#soundSystem.play('playerHurt');
        }
        enemy.alive = false;

        if (!this.#player.alive) {
          this.gameOver();
          return;
        }
      }

      if (!enemy.alive) {
        // Add kill effect
        this.#effectsSystem.addKillEffect(enemy.position.x, enemy.position.y);
        this.#soundSystem.play('enemyDeath');
        this.#totalKills++;  // Track kills
        
        // Vampiric healing
        if (this.#player.hasVampiric) {
          this.#player.killCount++;
          const vampiricHealRate = BALANCE.items.vampiric.healPerKills;
          const vampiricHealAmount = BALANCE.items.vampiric.healAmount;
          
          if (this.#player.killCount >= vampiricHealRate) {
            this.#player.killCount = 0;
            this.#player.health = Math.min(this.#player.maxHealth, this.#player.health + vampiricHealAmount);
            this.#effectsSystem.floatingTexts.push({
              x: this.#player.position.x,
              y: this.#player.position.y - 30,
              text: '+1 HP',
              vy: -30,
              life: 1,
              color: '#FF00FF'
            });
          }
        }
        
        // Drop money with chance (affected by luck) - use enemy-specific drop chance and value
        // Reduce drop chance by 1% per wave, minimum 5%
        const waveReduction = Math.min((this.#gameState.currentLevel - 1) * 0.01, enemy.moneyDropChance - 0.05);
        const adjustedDropChance = Math.max(0.05, enemy.moneyDropChance - waveReduction);
        const dropChance = adjustedDropChance + (this.#gameState.playerData.stats.luck * 0.01);
        if (Math.random() < dropChance) {
          const pickup = new Pickup(enemy.position.x, enemy.position.y, 'money');
          // Apply luck bonus to value when creating the pickup so displayed value matches collected value
          const baseValue = enemy.moneyValue * (1 + (enemy.wave - 1) * 0.1); // Scale with wave
          pickup.value = Math.floor(baseValue * (1 + this.#gameState.playerData.stats.luck * 0.02));
          this.#pickups.push(pickup);
        }
        
        // Blood pact health drops
        if (this.#player.hasBloodPact && Math.random() < BALANCE.items.bloodPact.healthDropChance) {
          const healthPickup = new Pickup(enemy.position.x, enemy.position.y, 'health');
          healthPickup.value = BALANCE.items.bloodPact.healthDropAmount;
          this.#pickups.push(healthPickup);
        }

        this.#enemies.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = this.#projectiles.length - 1; i >= 0; i--) {
      const projectile = this.#projectiles[i];
      projectile.update(deltaTime, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT, this.#enemies);

      // Check collision based on projectile owner
      if (projectile.owner === 'player') {
        // Player projectiles hit enemies
        for (const enemy of this.#enemies) {
          // Skip if enemy already hit by this piercing/boomerang projectile
          if ((projectile.piercing || projectile.boomerang) && projectile.hitEnemies.has(enemy)) {
            continue;
          }
          
          if (enemy.alive && projectile.checkCollision(enemy)) {
            // Apply critical hit chance
            let damage = projectile.damage;
            const critRoll = Math.random() * 100;
            if (critRoll < this.#gameState.playerData.stats.critChance) {
              damage *= this.#gameState.playerData.stats.critDamage / 100;
              this.#effectsSystem.addCritEffect(enemy.position.x, enemy.position.y);
              this.#soundSystem.play('critHit');
            } else {
              this.#soundSystem.play('hit');
            }
            
            enemy.takeDamage(damage);
            this.#effectsSystem.addDamageNumber(enemy.position.x, enemy.position.y - 10, damage);
            this.#effectsSystem.addImpactEffect(enemy.position.x, enemy.position.y);
            
            // Track weapon damage stats
            if (projectile.weaponId) {
              const currentDamage = this.#weaponDamageStats.get(projectile.weaponId) || 0;
              this.#weaponDamageStats.set(projectile.weaponId, currentDamage + damage);
            }
            
            // Life steal healing
            if (this.#player.hasLifeSteal) {
              const healAmount = damage * BALANCE.items.lifeSteal.lifeStealPercent;
              if (healAmount > 0.5) {  // Only heal if meaningful amount
                this.#player.health = Math.min(this.#player.maxHealth, this.#player.health + healAmount);
              }
            }
            
            // Handle explosion if projectile is explosive
            if (projectile.explosive) {
              this.#effectsSystem.addExplosionEffect(projectile.position.x, projectile.position.y, projectile.explosionRadius);
              this.#soundSystem.play('explosion');
              
              // Deal AoE damage
              for (const otherEnemy of this.#enemies) {
                if (otherEnemy !== enemy && otherEnemy.alive) {
                  const dx = otherEnemy.position.x - projectile.position.x;
                  const dy = otherEnemy.position.y - projectile.position.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  if (distance <= projectile.explosionRadius) {
                    otherEnemy.takeDamage(projectile.explosionDamage);
                    this.#effectsSystem.addDamageNumber(otherEnemy.position.x, otherEnemy.position.y - 10, projectile.explosionDamage);
                    
                    // Track explosive damage
                    if (projectile.weaponId) {
                      const currentDamage = this.#weaponDamageStats.get(projectile.weaponId) || 0;
                      this.#weaponDamageStats.set(projectile.weaponId, currentDamage + projectile.explosionDamage);
                    }
                  }
                }
              }
            }
            
            // Handle piercing and boomerang
            if (projectile.piercing || projectile.boomerang) {
              projectile.hitEnemies.add(enemy);  // Track this enemy as hit
              // Projectile continues through enemy
            } else {
              projectile.alive = false;
              break;
            }
          }
        }
      } else if (projectile.owner === 'enemy') {
        // Enemy projectiles hit player
        if (this.#player.alive && projectile.checkCollision(this.#player)) {
          // Apply dodge chance
          const dodgeRoll = Math.random() * 100;
          if (dodgeRoll < this.#gameState.playerData.stats.dodge) {
            this.#effectsSystem.floatingTexts.push({
              x: this.#player.position.x,
              y: this.#player.position.y - 20,
              text: 'DODGE!',
              vy: -30,
              life: 0.5,
              color: '#00FFFF'
            });
          } else {
            this.#player.takeDamage(projectile.damage);
            this.#effectsSystem.addDamageFlash();
            this.#soundSystem.play('playerHurt');
            
            if (!this.#player.alive) {
              this.gameOver();
              return;
            }
          }
          projectile.alive = false;
        }
      }
      
      // Add projectile trail effect if enabled
      if (projectile.trail && projectile.alive) {
        this.#effectsSystem.addProjectileTrail(
          projectile.position.x, 
          projectile.position.y,
          '#666666',
          projectile.size / 2
        );
      }

      if (!projectile.alive) {
        this.#projectiles.splice(i, 1);
      }
    }

    // Update pickups
    for (let i = this.#pickups.length - 1; i >= 0; i--) {
      const pickup = this.#pickups[i];
      pickup.update(deltaTime);

      // Auto-pickup within range or check collision
      const dx = pickup.position.x - this.#player.position.x;
      const dy = pickup.position.y - this.#player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= this.#gameState.playerData.stats.pickupRange || pickup.checkCollision(this.#player)) {
        if (pickup.type === 'money') {
          // Luck bonus already applied when creating the pickup
          this.#moneyEarned += pickup.value;
          this.#effectsSystem.addMoneyPickupEffect(pickup.position.x, pickup.position.y, pickup.value);
          this.#soundSystem.play('pickup');
        } else if (pickup.type === 'health') {
          // Heal player
          this.#player.health = Math.min(this.#player.maxHealth, this.#player.health + pickup.value);
          this.#effectsSystem.floatingTexts.push({
            x: pickup.position.x,
            y: pickup.position.y - 10,
            text: `+${pickup.value} HP`,
            vy: -30,
            life: 1,
            color: '#00FF00'
          });
          this.#soundSystem.play('heal');
        }
        pickup.alive = false;
      }

      if (!pickup.alive) {
        this.#pickups.splice(i, 1);
      }
    }
  }

  completeRound() {
    this.#gameState.completeLevel(this.#gameState.currentLevel, this.#moneyEarned);
    this.#gameState.setState(GAME_STATES.ROUND_COMPLETE);
    this.#soundSystem.play('waveComplete');
    
    // Show upgrade screen after 2 seconds
    setTimeout(() => this.showUpgradeScreen(), 2000);
  }
  
  showUpgradeScreen() {
    this.#gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'upgrade';
    // Clear any remaining screen shake when showing upgrade screen
    this.#effectsSystem.screenShake.duration = 0;
    this.#effectsSystem.screenShake.intensity = 0;
    this.#effectsSystem.screenShake.offset = { x: 0, y: 0 };
    this.upgradeScreen.activate();
    this.#canvas.style.cursor = 'pointer';
  }

  gameOver() {
    this.#gameState.setState(GAME_STATES.GAME_OVER);
    
    // Reset progress
    this.#gameState.resetProgress();
    
    // Show game over screen with stats
    this.gameOverScreen.activate({
      wave: this.#gameState.currentLevel,
      money: this.#moneyEarned,
      kills: this.#totalKills
    });
    
    this.activeScreen = 'gameOver';
    this.#canvas.style.cursor = 'pointer';
  }

  render() {
    const state = this.#gameState.getState();
    
    if (state === GAME_STATES.MENU || state === GAME_STATES.GAME_OVER) {
      // Don't apply screen shake to menu screens
      switch (this.activeScreen) {
        case 'character':
          this.characterScreen.render(this.#ctx);
          break;
        case 'settings':
          this.settingsScreen.render(this.#ctx);
          break;
        case 'shop':
          this.shopScreen.render(this.#ctx);
          break;
        case 'upgrade':
          // Render game state behind upgrade screen
          this.renderGameState();
          this.upgradeScreen.render(this.#ctx);
          break;
        case 'gameOver':
          this.gameOverScreen.render(this.#ctx);
          break;
        case 'menu':
        default:
          this.menu.render(this.#ctx);
          break;
      }
      return;
    }
    
    if (state === GAME_STATES.PAUSED) {
      // Render game state behind pause menu
      this.renderGame();
      this.pauseMenu.render(this.#ctx);
      return;
    }
    
    // Apply screen shake only for gameplay
    this.#effectsSystem.applyScreenShake(this.#ctx);
    
    // Clear canvas
    this.#ctx.fillStyle = COLORS.BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    
    // Draw UI bar background
    this.#ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    
    // Draw separator line
    this.#ctx.strokeStyle = COLORS.UI_BORDER;
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.lineTo(this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.stroke();

    // Draw grid (in game area only)
    this.drawGrid();

    if (state === GAME_STATES.PLAYING) {
      this.renderGame();
    } else if (this.#gameState.getState() === GAME_STATES.ROUND_COMPLETE) {
      this.renderRoundComplete();
    } else if (this.#gameState.getState() === GAME_STATES.GAME_OVER) {
      this.renderGameOver();
    }
    
    // Restore screen shake
    this.#effectsSystem.restoreScreenShake(this.#ctx);
  }

  drawGrid() {
    this.#ctx.strokeStyle = COLORS.GRID;
    this.#ctx.lineWidth = 1;
    const gridSize = 50;

    // Draw vertical lines
    for (let x = 0; x <= this.#canvas.width; x += gridSize) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(x, GAME_CONFIG.UI_BAR_HEIGHT);
      this.#ctx.lineTo(x, this.#canvas.height);
      this.#ctx.stroke();
    }

    // Draw horizontal lines (starting from UI bar)
    for (let y = GAME_CONFIG.UI_BAR_HEIGHT; y <= this.#canvas.height; y += gridSize) {
      this.#ctx.beginPath();
      this.#ctx.moveTo(0, y);
      this.#ctx.lineTo(this.#canvas.width, y);
      this.#ctx.stroke();
    }
  }

  renderUI() {
    // UI elements in the top bar area
    const barY = 20;
    
    // Left section - Health bar
    this.#ctx.fillStyle = COLORS.UI_TEXT;
    this.#ctx.font = 'bold 16px monospace';
    this.#ctx.textAlign = 'left';
    
    // Health bar
    const hpBarY = barY;
    this.#ctx.font = '14px monospace';
    this.#ctx.fillText('HP', 20, hpBarY + 7);
    
    const hpBarX = 45;
    const hpBarWidth = 145;
    const hpBarHeight = 12;
    const hpPercent = this.#player.health / this.#player.maxHealth;
    
    this.#ctx.strokeStyle = COLORS.UI_INACTIVE;
    this.#ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    this.#ctx.fillStyle = '#330000';
    this.#ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    this.#ctx.fillStyle = hpPercent > 0.3 ? '#00FF00' : '#FF0000';
    this.#ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpPercent, hpBarHeight);
    
    // HP text
    this.#ctx.font = '10px monospace';
    this.#ctx.fillStyle = '#FFFFFF';
    this.#ctx.textAlign = 'center';
    this.#ctx.fillText(`${Math.ceil(this.#player.health)}/${this.#player.maxHealth}`, hpBarX + hpBarWidth/2, hpBarY + 9);
    
    // Money section
    this.#ctx.font = '14px monospace';
    this.#ctx.fillStyle = COLORS.UI_TEXT;
    this.#ctx.textAlign = 'left';
    this.#ctx.fillText(`$${this.#gameState.playerData.money + this.#moneyEarned}`, 20, hpBarY + 35);
    this.#ctx.font = '10px monospace';
    this.#ctx.fillStyle = '#FFFF00';
    if (this.#moneyEarned > 0) {
      this.#ctx.fillText(`+${this.#moneyEarned}`, 100, hpBarY + 35);
    }
    
    // Weapon damage stats - compact display
    if (this.#weaponDamageStats.size > 0) {
      this.#ctx.font = '9px monospace';
      this.#ctx.fillStyle = '#FF8800';
      this.#ctx.textAlign = 'left';
      
      // Get sorted weapon damage entries (top 3)
      const weaponDamages = Array.from(this.#weaponDamageStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      let damageText = 'DMG: ';
      for (const [weaponId, damage] of weaponDamages) {
        // Get weapon name from balance config
        const weaponName = BALANCE.weapons[weaponId]?.name || weaponId;
        const shortName = weaponName.split(' ')[0].substring(0, 4).toUpperCase();
        damageText += `${shortName}:${damage.toFixed(0)} `;
      }
      
      this.#ctx.fillText(damageText.trim(), 20, hpBarY + 50);
    }
    
    // Center section - Stage and Timer
    this.#ctx.fillStyle = COLORS.UI_TEXT;
    this.#ctx.font = 'bold 20px monospace';
    this.#ctx.textAlign = 'center';
    this.#ctx.fillText(`STAGE ${this.#gameState.currentLevel}`, this.#canvas.width / 2, barY + 5);
    
    const timeRemaining = Math.ceil(this.#roundTimer);
    this.#ctx.font = 'bold 32px monospace';
    this.#ctx.fillStyle = timeRemaining <= 10 ? '#FF0000' : COLORS.UI_TEXT;
    this.#ctx.fillText(`${timeRemaining}`, this.#canvas.width / 2, barY + 40);
    this.#ctx.font = '12px monospace';
    this.#ctx.fillText('seconds', this.#canvas.width / 2, barY + 55);
    
    // Right section - Stats
    this.#ctx.textAlign = 'right';
    this.#ctx.font = '12px monospace';
    this.#ctx.fillStyle = COLORS.UI_TEXT;
    
    const rightX = this.#canvas.width - 20;
    this.#ctx.fillText(`Enemies: ${this.#enemies.length}`, rightX, barY);
    
    // Weapons and items count
    const weaponCount = (this.#gameState.playerData.weapons || ['pistol']).length;
    const itemCount = (this.#gameState.playerData.items || []).length;
    this.#ctx.fillText(`Weapons: ${weaponCount} | Items: ${itemCount}`, rightX, barY + 20);
    
    // Comprehensive stats display - compact format
    this.#ctx.font = '9px monospace';
    this.#ctx.fillStyle = '#00FF00';
    const stats = this.#gameState.playerData.stats;
    
    // Format numbers compactly
    const dmg = stats.damage;
    const fire = stats.fireRate.toFixed(1);
    const crit = `${stats.critChance.toFixed(0)}%`;
    const critDmg = `${stats.critDamage.toFixed(0)}%`;
    const spd = stats.speed;
    const dodge = `${stats.dodge.toFixed(0)}%`;
    const luck = stats.luck.toFixed(1);
    const armor = (stats.armor || 0).toFixed(0);
    const regen = (stats.regeneration * 10).toFixed(1);
    const pickup = stats.pickupRange;
    
    // Three compact rows
    this.#ctx.fillText(`DMG:${dmg} FIRE:${fire}x CRIT:${crit}/${critDmg}`, rightX, barY + 35);
    this.#ctx.fillText(`SPD:${spd} DODGE:${dodge} LUCK:${luck}`, rightX, barY + 47);
    this.#ctx.fillText(`ARM:${armor} REGEN:${regen}/s RNG:${pickup}`, rightX, barY + 59);
  }

  renderRoundComplete() {
    this.#ctx.fillStyle = COLORS.UI_TEXT;
    this.#ctx.font = '32px monospace';
    this.#ctx.textAlign = 'center';
    const centerY = GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT / 2;
    this.#ctx.fillText('ROUND COMPLETE!', this.#canvas.width / 2, centerY - 40);

    this.#ctx.font = '20px monospace';
    this.#ctx.fillText(
      `Money Earned: $${this.#moneyEarned}`,
      this.#canvas.width / 2,
      centerY + 10
    );
  }

  renderGameOver() {
    this.#ctx.fillStyle = '#FF0000';
    this.#ctx.font = '48px monospace';
    this.#ctx.textAlign = 'center';
    const centerY = GAME_CONFIG.UI_BAR_HEIGHT + GAME_CONFIG.GAME_AREA_HEIGHT / 2;
    this.#ctx.fillText('GAME OVER', this.#canvas.width / 2, centerY);

    this.#ctx.fillStyle = COLORS.UI_TEXT;
    this.#ctx.font = '20px monospace';
    this.#ctx.fillText('Restarting...', this.#canvas.width / 2, centerY + 40);
  }
  
  renderGame() {
    // Clear canvas
    this.#ctx.fillStyle = COLORS.BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    
    // Draw UI bar background
    this.#ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    
    // Draw separator line
    this.#ctx.strokeStyle = COLORS.UI_BORDER;
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.lineTo(this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.stroke();

    // Draw grid (in game area only)
    this.drawGrid();

    // Render pickups (below other entities)
    for (const pickup of this.#pickups) {
      pickup.render(this.#ctx);
    }

    // Render enemies
    for (const enemy of this.#enemies) {
      enemy.render(this.#ctx);
    }

    // Render projectiles
    for (const projectile of this.#projectiles) {
      projectile.render(this.#ctx);
    }

    // Render player
    if (this.#player) {
      this.#player.render(this.#ctx);
    }

    // Render effects
    this.#effectsSystem.renderParticles(this.#ctx);
    this.#effectsSystem.renderFloatingTexts(this.#ctx);
    
    // Render UI
    if (this.#player) {
      this.renderUI();
    }
    
    // Render flashes on top
    this.#effectsSystem.renderFlashes(this.#ctx);
  }
  
  renderGameState() {
    // Render the basic game state (used as background for upgrade screen)
    this.#ctx.fillStyle = COLORS.BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    
    // Draw UI bar
    this.#ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.#ctx.fillRect(0, 0, this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    
    // Draw separator
    this.#ctx.strokeStyle = COLORS.UI_BORDER;
    this.#ctx.lineWidth = 2;
    this.#ctx.beginPath();
    this.#ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.lineTo(this.#canvas.width, GAME_CONFIG.UI_BAR_HEIGHT);
    this.#ctx.stroke();
    
    // Draw grid
    this.drawGrid();
    
    // Render UI
    if (this.#player) {
      this.renderUI();
    }
  }
}