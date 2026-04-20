import { Enemy } from '../entities/Enemy.js';
import { GAME_CONFIG } from '../constants.js';
import { BALANCE, getSpawnRate, selectEnemyType } from '../config/balance.js';

export class SpawnSystem {
  constructor(level = 1, effectsSystem = null) {
    this.level = level;
    this.timeSinceLastSpawn = 0;
    this.totalTime = 0;
    this.spawnTimer = 0;
    this.effectsSystem = effectsSystem;
    this.bossQueueCount = 0;
    this.bossSpawnDelayTimer = 0;
  }

  update(deltaTime, enemies, canvasWidth, canvasHeight, player = null, projectiles = null) {
    this.totalTime += deltaTime;
    this.timeSinceLastSpawn += deltaTime;
    this.spawnTimer += deltaTime;

    // Boss Queue Logic
    const bossAlive = enemies.some(e => e.behavior === 'boss');
    if (!bossAlive && this.bossQueueCount > 0) {
      if (this.bossSpawnDelayTimer > 0) {
        this.bossSpawnDelayTimer -= deltaTime;
      }
      if (this.bossSpawnDelayTimer <= 0) {
        this.bossQueueCount--;
        const boss = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, 'boss');
        boss.effectsSystem = this.effectsSystem;
        enemies.push(boss);
        this.bossSpawnDelayTimer = 5.0; // Wait 5s before NEXT boss queue trigger
      }
    } else if (bossAlive) {
      this.bossSpawnDelayTimer = 5.0; // Reset delay explicitly if one inherently exists
    }

    // Calculate current spawn rate based on wave and time
    let spawnRate = getSpawnRate(this.level, this.totalTime);
    
    // Scale mathematically for flood waves exactly
    const isFlood = (this.level === 9 || this.level === 13 || this.level === 17 || this.level === 24 || this.level === 27);
    if (isFlood) {
      spawnRate *= 3.0; // Produce literally 3x as many geometry internally (300% total density)
    }
    
    const timeBetweenSpawns = 1 / spawnRate; // Convert to seconds between spawns

    if (this.timeSinceLastSpawn >= timeBetweenSpawns) {
      this.spawnEnemy(enemies, canvasWidth, canvasHeight, player, projectiles);
      this.timeSinceLastSpawn = 0;
    }
  }

  spawnEnemy(enemies, canvasWidth, canvasHeight, player, projectiles) {
    // Select enemy type based on wave distribution
    let enemyType = selectEnemyType(this.level);
    
    // 50% reduced rate for wave pattern enemies
    if (enemyType === 'wave' && Math.random() < 0.5) {
      enemyType = 'basic';
    }
    
    // 50% reduced rate for tank pattern enemies
    if (enemyType === 'tank' && Math.random() < 0.5) {
      enemyType = 'basic';
    }
    
    // Handle wave enemies spawning in groups
    if (enemyType === 'wave') {
      const groupSize = Math.floor(Math.random() * 9) + 2;  // 2-10 enemies
      const edge = Math.floor(Math.random() * 4);  // Pick one edge for the group
      
      for (let i = 0; i < groupSize; i++) {
        const enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, 'wave');
        
        // Offset each enemy slightly so they don't overlap
        if (edge === 0 || edge === 2) {  // Top or bottom
          enemy.position.x += (i - groupSize/2) * 20;  // Tighter spacing
        } else {  // Left or right
          enemy.position.y += (i - groupSize/2) * 20;  // Tighter spacing
        }

        // Cancel spawn if too close to player
        if (player && player.alive) {
          const dx = enemy.position.x - player.position.x;
          const dy = enemy.position.y - player.position.y;
          if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
        }
        
        // Give them varied wave patterns using balance config
        const waveConfig = BALANCE.enemyTypes.wave;
        enemy.wavePhase = Math.random() * Math.PI * 2;
        const ampRange = waveConfig.amplitudeVariation.max - waveConfig.amplitudeVariation.min;
        const freqRange = waveConfig.frequencyVariation.max - waveConfig.frequencyVariation.min;
        enemy.waveAmplitude = enemy.waveAmplitude * (waveConfig.amplitudeVariation.min + Math.random() * ampRange);
        enemy.waveFrequency = enemy.waveFrequency * (waveConfig.frequencyVariation.min + Math.random() * freqRange);
        
        // Add trail properties for wave enemies
        enemy.trail = true;
        enemy.effectsSystem = this.effectsSystem;
        enemy.lastTrailDistance = 0;
        enemy.trailSpacing = waveConfig.trailSpacing;
        
        enemies.push(enemy);
      }
      return;
    }
    
    // Interrupt if Boss explicitly
    if (enemyType === 'boss') {
      const bossAlive = enemies.some(e => e.behavior === 'boss');
      if (bossAlive || this.bossSpawnDelayTimer > 0) {
        this.bossQueueCount++;
        return; // Prevent simultaneous spawning entirely
      } else {
        this.bossSpawnDelayTimer = 5.0; // Immediately set lock for active spawn
      }
    }

    let enemy;
    
    const isFlood = (this.level === 9 || this.level === 13 || this.level === 17 || this.level === 24 || this.level === 27);
    
    // Spawn based on enemy type
    if (isFlood && enemyType === 'tracker') {
      enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
      
      const spawnPoint = Math.floor(Math.random() * 6);
      const midY = GAME_CONFIG.UI_BAR_HEIGHT + (canvasHeight - GAME_CONFIG.UI_BAR_HEIGHT) / 2;
      
      if (spawnPoint === 0) { enemy.position.x = 0; enemy.position.y = GAME_CONFIG.UI_BAR_HEIGHT; } // Top-Left
      else if (spawnPoint === 1) { enemy.position.x = canvasWidth; enemy.position.y = GAME_CONFIG.UI_BAR_HEIGHT; } // Top-Right
      else if (spawnPoint === 2) { enemy.position.x = 0; enemy.position.y = canvasHeight; } // Bottom-Left
      else if (spawnPoint === 3) { enemy.position.x = canvasWidth; enemy.position.y = canvasHeight; } // Bottom-Right
      else if (spawnPoint === 4) { enemy.position.x = 0; enemy.position.y = midY; } // Mid-Left
      else { enemy.position.x = canvasWidth; enemy.position.y = midY; } // Mid-Right
      
      // Boost basic tracker speed by 50%
      if (!enemy.isEnraged) {
        enemy.speed *= 1.5;
      }
    } else if (enemyType === 'tracker') {
      // Trackers spawn inside the game area normally
      enemy = Enemy.spawnInside(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
    } else {
      // All other enemies spawn from edges
      enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
    }
    
    // Cancel spawn if too close to player
    if (player && player.alive) {
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) {
        return;
      }
    }
    
    // Pass player reference for enemies that need it immediately
    if (enemy.behavior === 'tracker' || enemy.behavior === 'tank' || enemy.behavior === 'shooter' || enemy.behavior === 'boss') {
      enemy.player = player;
    }
    
    enemies.push(enemy);
  }

  reset() {
    this.timeSinceLastSpawn = 0;
    this.totalTime = 0;
  }
}