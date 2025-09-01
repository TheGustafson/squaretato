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
  }

  update(deltaTime, enemies, canvasWidth, canvasHeight, player = null, projectiles = null) {
    this.totalTime += deltaTime;
    this.timeSinceLastSpawn += deltaTime;
    this.spawnTimer += deltaTime;

    // Calculate current spawn rate based on wave and time
    const spawnRate = getSpawnRate(this.level, this.totalTime);
    const timeBetweenSpawns = 1 / spawnRate; // Convert to seconds between spawns

    if (this.timeSinceLastSpawn >= timeBetweenSpawns) {
      this.spawnEnemy(enemies, canvasWidth, canvasHeight, player, projectiles);
      this.timeSinceLastSpawn = 0;
    }
  }

  spawnEnemy(enemies, canvasWidth, canvasHeight, player, projectiles) {
    // Select enemy type based on wave distribution
    const enemyType = selectEnemyType(this.level);
    
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
    
    let enemy;
    
    // Spawn based on enemy type
    if (enemyType === 'tracker') {
      // Trackers spawn inside the game area
      enemy = Enemy.spawnInside(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
    } else {
      // All other enemies spawn from edges
      enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
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