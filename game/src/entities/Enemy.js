import { Entity } from './Entity.js';
import { Projectile } from './Projectile.js';
import { GAME_CONFIG } from '../constants.js';
import { BALANCE, getEnemyStats } from '../config/balance.js';

export class Enemy extends Entity {
  constructor(x, y, type = 'basic', wave = 1) {
    super(x, y);
    this.type = type;
    this.wave = wave;
    
    // Get config for this enemy type
    const typeConfig = BALANCE.enemyTypes[type] || BALANCE.enemyTypes.basic;
    this.typeConfig = typeConfig;
    
    // Visual properties
    this.color = typeConfig.color;
    this.size = typeConfig.size;
    this.hitboxSize = typeConfig.size * 1.1; // 10% larger hitbox for easier aiming
    
    // Get stats based on wave
    const stats = getEnemyStats(wave, type);
    this.health = stats.health;
    this.maxHealth = stats.health;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.xpValue = stats.xpValue;
    this.moneyDropChance = stats.moneyDropChance;
    this.moneyValue = stats.moneyValue;
    
    // Behavior properties
    this.behavior = typeConfig.behavior;
    this.bounceOffWalls = false;
    
    // Type-specific properties
    if (type === 'tank') {
      this.aggroRadius = typeConfig.aggroRadius;
      this.isAggro = false;
      this.randomDirection = { x: 0, y: 0 };
      this.directionChangeTimer = 0;
    } else if (type === 'shooter') {
      this.shootCooldown = typeConfig.shootCooldown;
      this.shootTimer = 0;
      this.projectileSpeed = typeConfig.projectileSpeed;
      this.projectileDamage = typeConfig.projectileDamage;
      this.projectileSize = typeConfig.projectileSize;
      this.projectileBounces = typeConfig.projectileBounces;
    } else if (type === 'wave') {
      this.waveAmplitude = typeConfig.waveAmplitude;
      this.waveFrequency = typeConfig.waveFrequency;
      this.initialX = x;  // Store initial X for sine wave calculation
      this.wavePhase = Math.random() * Math.PI * 2;  // Random phase offset
    } else if (type === 'boss') {
      this.shootCooldown = typeConfig.shootCooldown;
      this.shootTimer = 0;
      this.waveSpawnCooldown = typeConfig.waveSpawnCooldown;
      this.waveSpawnTimer = 0;
      this.projectileSpeed = typeConfig.projectileSpeed;
      this.projectileDamage = typeConfig.projectileDamage;
      this.projectileSize = typeConfig.projectileSize;
      this.projectileBounces = typeConfig.projectileBounces;
    }
  }

  static spawnFromEdge(canvasWidth, canvasHeight, topOffset = 0, wave = 1, type = 'basic') {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    const gameAreaHeight = canvasHeight - topOffset;

    switch (edge) {
      case 0: // Top - spawn just above the UI bar, not above the canvas
        x = Math.random() * canvasWidth;
        y = topOffset - 30;  // Spawn clearly outside the UI bar
        break;
      case 1: // Right
        x = canvasWidth + 20;
        y = topOffset + Math.random() * gameAreaHeight;
        break;
      case 2: // Bottom
        x = Math.random() * canvasWidth;
        y = canvasHeight + 20;
        break;
      case 3: // Left
        x = -20;
        y = topOffset + Math.random() * gameAreaHeight;
        break;
    }

    const enemy = new Enemy(x, y, type, wave);
    
    // Set initial velocity based on enemy type
    if (type === 'tracker') {
      // Trackers don't need initial velocity, they'll track player
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
    } else if (type === 'tank') {
      // Tanks start with random movement
      const angle = Math.random() * Math.PI * 2;
      enemy.velocity.x = Math.cos(angle) * enemy.speed;
      enemy.velocity.y = Math.sin(angle) * enemy.speed;
      enemy.randomDirection = { x: enemy.velocity.x, y: enemy.velocity.y };
      enemy.bounceOffWalls = true;
    } else if (type === 'shooter') {
      // Shooters move like basic enemies - toward center initially
      const targetX = Math.random() * canvasWidth;
      const targetY = topOffset + Math.random() * gameAreaHeight;
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    } else if (type === 'wave') {
      // Wave enemies spawn towards center with angle variation
      // Spawn in center 60% of the edge (avoid 20% on each side)
      const centerRange = 0.6;
      const centerOffset = 0.2;
      
      // Adjust spawn position to center area
      if (edge === 0 || edge === 2) { // Top or bottom
        x = canvasWidth * (centerOffset + Math.random() * centerRange);
      } else { // Left or right
        y = topOffset + gameAreaHeight * (centerOffset + Math.random() * centerRange);
      }
      enemy.position.x = x;
      enemy.position.y = y;
      
      // Pick a target towards the center with angle variation
      let targetX, targetY;
      const centerX = canvasWidth / 2;
      const centerY = topOffset + gameAreaHeight / 2;
      
      switch (edge) {
        case 0: // Coming from top - aim towards center-bottom with angle
          targetX = centerX + (Math.random() - 0.5) * canvasWidth * 0.4;
          targetY = centerY + gameAreaHeight * 0.3;
          break;
        case 1: // Coming from right - aim towards center-left with angle
          targetX = centerX - canvasWidth * 0.2;
          targetY = centerY + (Math.random() - 0.5) * gameAreaHeight * 0.4;
          break;
        case 2: // Coming from bottom - aim towards center-top with angle
          targetX = centerX + (Math.random() - 0.5) * canvasWidth * 0.4;
          targetY = centerY - gameAreaHeight * 0.3;
          break;
        case 3: // Coming from left - aim towards center-right with angle
          targetX = centerX + canvasWidth * 0.2;
          targetY = centerY + (Math.random() - 0.5) * gameAreaHeight * 0.4;
          break;
      }
      
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.initialX = x;
      enemy.bounceOffWalls = false;  // Wave enemies don't bounce
    } else if (type === 'boss') {
      // Boss moves slowly toward center
      const targetX = canvasWidth / 2;
      const targetY = topOffset + gameAreaHeight / 2;
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    } else if (type === 'zoomer') {
      // Zoomers fly straight across the screen at high speed
      // Spawn in center 40% of the edge (avoid 30% on each side)
      const centerRange = 0.4;
      const centerOffset = 0.3;
      
      // Adjust spawn position to center area
      if (edge === 0 || edge === 2) { // Top or bottom
        x = canvasWidth * (centerOffset + Math.random() * centerRange);
        // Keep the y position from the edge spawn (already set correctly)
      } else { // Left or right
        y = topOffset + gameAreaHeight * (centerOffset + Math.random() * centerRange);
        // Keep the x position from the edge spawn (already set correctly)
      }
      enemy.position.x = x;
      enemy.position.y = y;
      
      // Pick a target on the opposite edge with random angle
      let targetX, targetY;
      switch (edge) {
        case 0: // Coming from top - go to bottom
          targetX = x + (Math.random() - 0.5) * canvasWidth * 0.3; // Slight angle
          targetY = canvasHeight + 50;
          break;
        case 1: // Coming from right - go to left
          targetX = -50;
          targetY = y + (Math.random() - 0.5) * gameAreaHeight * 0.3;
          break;
        case 2: // Coming from bottom - go to top
          targetX = x + (Math.random() - 0.5) * canvasWidth * 0.3;
          targetY = topOffset - 50;
          break;
        case 3: // Coming from left - go to right
          targetX = canvasWidth + 50;
          targetY = y + (Math.random() - 0.5) * gameAreaHeight * 0.3;
          break;
      }
      
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = false; // Zoomers don't bounce
    } else {
      // Basic enemy - moves toward center initially
      const targetX = Math.random() * canvasWidth;
      const targetY = topOffset + Math.random() * gameAreaHeight;
      const dx = targetX - x;
      const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    }

    return enemy;
  }

  static spawnInside(canvasWidth, canvasHeight, topOffset = 0, wave = 1, type = 'tracker') {
    // Spawn inside the game area (used for tracker enemies)
    // Add some padding to avoid spawning right at edges
    const padding = 30;
    const x = padding + Math.random() * (canvasWidth - padding * 2);
    const y = topOffset + padding + Math.random() * (canvasHeight - topOffset - padding * 2);
    return new Enemy(x, y, type, wave);
  }

  checkCollision(other) {
    // Use hitboxSize for enemy collision detection (10% larger than visual size)
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (this.hitboxSize + other.size) / 2;
  }

  update(deltaTime, canvasWidth, canvasHeight, player = null, projectiles = null, enemies = null) {
    // Update based on behavior type
    switch (this.behavior) {
      case 'tracker':
        this.updateTracker(deltaTime, player);
        break;
      case 'tank':
        this.updateTank(deltaTime, canvasWidth, canvasHeight, player);
        break;
      case 'shooter':
        this.updateShooter(deltaTime, canvasWidth, canvasHeight, player, projectiles);
        break;
      case 'wave':
        this.updateWave(deltaTime, canvasWidth, canvasHeight);
        break;
      case 'boss':
        this.updateBoss(deltaTime, canvasWidth, canvasHeight, player, projectiles, enemies);
        break;
      case 'zoomer':
        this.updateZoomer(deltaTime, canvasWidth, canvasHeight);
        break;
      case 'bouncer':
      default:
        this.updateBouncer(deltaTime, canvasWidth, canvasHeight);
        break;
    }
    
    super.update(deltaTime);
  }

  updateTracker(deltaTime, player) {
    if (!player || !player.alive) return;
    
    // Always move toward player
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      this.velocity.x = (dx / distance) * this.speed;
      this.velocity.y = (dy / distance) * this.speed;
    }
  }

  updateTank(deltaTime, canvasWidth, canvasHeight, player) {
    if (!player || !player.alive) {
      this.isAggro = false;
    } else {
      // Check if player is within aggro radius
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= this.aggroRadius) {
        // Switch to following player
        this.isAggro = true;
        this.velocity.x = (dx / distance) * this.speed * 1.5; // Move faster when aggro
        this.velocity.y = (dy / distance) * this.speed * 1.5;
      } else {
        this.isAggro = false;
      }
    }
    
    // Random movement when not aggro
    if (!this.isAggro) {
      this.directionChangeTimer -= deltaTime;
      if (this.directionChangeTimer <= 0) {
        // Change direction every 1-3 seconds
        this.directionChangeTimer = 1 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        this.randomDirection.x = Math.cos(angle) * this.speed;
        this.randomDirection.y = Math.sin(angle) * this.speed;
      }
      this.velocity.x = this.randomDirection.x;
      this.velocity.y = this.randomDirection.y;
    }
    
    // Bounce off walls
    this.handleWallBounce(canvasWidth, canvasHeight);
  }

  updateShooter(deltaTime, canvasWidth, canvasHeight, player, projectiles) {
    // Move and bounce off walls just like basic enemies
    this.handleWallBounce(canvasWidth, canvasHeight);
    
    // Shoot at player while moving
    if (player && player.alive && projectiles) {
      this.shootTimer -= deltaTime;
      
      if (this.shootTimer <= 0) {
        this.shootTimer = this.shootCooldown;
        
        // Calculate angle to player
        const dx = player.position.x - this.position.x;
        const dy = player.position.y - this.position.y;
        const angle = Math.atan2(dy, dx);
        
        // Create projectile
        const projectile = new Projectile(this.position.x, this.position.y, angle, 'enemy');
        projectile.damage = this.projectileDamage;
        projectile.size = this.projectileSize;
        projectile.speed = this.projectileSpeed;
        projectile.maxBounces = this.projectileBounces;
        projectile.color = this.color;
        
        // Set velocity
        projectile.velocity.x = Math.cos(angle) * this.projectileSpeed;
        projectile.velocity.y = Math.sin(angle) * this.projectileSpeed;
        
        projectiles.push(projectile);
      }
    }
  }

  updateBouncer(deltaTime, canvasWidth, canvasHeight) {
    this.handleWallBounce(canvasWidth, canvasHeight);
  }

  updateWave(deltaTime, canvasWidth, canvasHeight) {
    // Store previous position for trail
    const prevX = this.position.x;
    const prevY = this.position.y;
    
    // Move horizontally
    const distanceTraveled = Math.abs(this.position.x - this.initialX);
    
    // Apply sine wave to Y position (tighter wave)
    const waveOffset = Math.sin((distanceTraveled / canvasWidth) * this.waveFrequency * Math.PI * 2 + this.wavePhase) * this.waveAmplitude;
    this.position.y += waveOffset * deltaTime;
    
    // Add long-lasting dotted trail effect
    if (this.trail && this.effectsSystem) {
      const dx = this.position.x - prevX;
      const dy = this.position.y - prevY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only add trail points every few pixels moved for dotted effect
      if (!this.lastTrailDistance) this.lastTrailDistance = 0;
      this.lastTrailDistance += distance;
      
      if (this.lastTrailDistance > (this.trailSpacing || 1.2)) { // Use configurable trail spacing
        this.effectsSystem.addWaveTrail(prevX, prevY, this.color);
        this.lastTrailDistance = 0;
      }
    }
    
    // Mark as not alive if off screen (don't bounce)
    if (this.position.x < -50 || this.position.x > canvasWidth + 50 ||
        this.position.y < -50 || this.position.y > canvasHeight + 50) {
      this.alive = false;
    }
  }

  updateZoomer(deltaTime, canvasWidth, canvasHeight) {
    // Zoomers just fly straight and fast, no bouncing
    // Mark as not alive if off screen
    if (this.position.x < -50 || this.position.x > canvasWidth + 50 ||
        this.position.y < -50 || this.position.y > canvasHeight + 50) {
      this.alive = false;
    }
  }

  updateBoss(deltaTime, canvasWidth, canvasHeight, player, projectiles, enemies) {
    // Move and bounce like a slow tank
    this.handleWallBounce(canvasWidth, canvasHeight);
    
    if (!player || !player.alive) return;
    
    // Shoot bouncing projectile at player
    if (projectiles) {
      this.shootTimer -= deltaTime;
      
      if (this.shootTimer <= 0) {
        this.shootTimer = this.shootCooldown;
        
        const dx = player.position.x - this.position.x;
        const dy = player.position.y - this.position.y;
        const angle = Math.atan2(dy, dx);
        
        const projectile = new Projectile(this.position.x, this.position.y, angle, 'enemy');
        projectile.damage = this.projectileDamage;
        projectile.size = this.projectileSize;
        projectile.speed = this.projectileSpeed;
        projectile.maxBounces = this.projectileBounces;
        projectile.color = '#FF00FF';  // Purple projectiles for boss
        
        projectile.velocity.x = Math.cos(angle) * this.projectileSpeed;
        projectile.velocity.y = Math.sin(angle) * this.projectileSpeed;
        
        projectiles.push(projectile);
      }
    }
    
    // Spawn wave enemies
    if (enemies) {
      this.waveSpawnTimer -= deltaTime;
      
      if (this.waveSpawnTimer <= 0) {
        this.waveSpawnTimer = this.waveSpawnCooldown;
        
        // Spawn 3 wave enemies in random directions
        for (let i = 0; i < 3; i++) {
          const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;  // Evenly spaced with some randomness
          const spawnDist = this.size + 20;
          
          const waveEnemy = new Enemy(
            this.position.x + Math.cos(angle) * spawnDist,
            this.position.y + Math.sin(angle) * spawnDist,
            'wave',
            this.wave
          );
          
          // Set velocity in the spawn direction
          waveEnemy.velocity.x = Math.cos(angle) * waveEnemy.speed;
          waveEnemy.velocity.y = Math.sin(angle) * waveEnemy.speed * 0.3;  // Mostly horizontal
          waveEnemy.initialX = waveEnemy.position.x;
          
          enemies.push(waveEnemy);
        }
      }
    }
  }

  handleWallBounce(canvasWidth, canvasHeight) {
    if (!this.bounceOffWalls) return;
    
    const halfSize = this.size / 2;
    const topBound = BALANCE.ui.uiBarHeight;
    
    // Only bounce if we're inside the game area bounds
    const inBounds = 
      this.position.x > -halfSize && 
      this.position.x < canvasWidth + halfSize &&
      this.position.y > topBound - halfSize && 
      this.position.y < canvasHeight + halfSize;

    if (inBounds) {
      if (this.position.x - halfSize <= 0 || this.position.x + halfSize >= canvasWidth) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
        
        // Update random direction for tanks
        if (this.behavior === 'tank' && !this.isAggro) {
          this.randomDirection.x = this.velocity.x;
        }
      }
      if (this.position.y - halfSize <= topBound || this.position.y + halfSize >= canvasHeight) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Math.max(topBound + halfSize, Math.min(canvasHeight - halfSize, this.position.y));
        
        // Update random direction for tanks
        if (this.behavior === 'tank' && !this.isAggro) {
          this.randomDirection.y = this.velocity.y;
        }
      }
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    
    if (this.behavior === 'wave') {
      // Draw wave enemy as half orange, half yellow triangle
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath();
      
      // Create gradient
      const gradient = ctx.createLinearGradient(-this.size/2, 0, this.size/2, 0);
      gradient.addColorStop(0, '#FFA500');  // Orange
      gradient.addColorStop(0.5, '#FFA500');
      gradient.addColorStop(0.5, '#FFFF00');  // Yellow
      gradient.addColorStop(1, '#FFFF00');
      ctx.fillStyle = gradient;
      ctx.fill();
    } else if (this.behavior === 'boss') {
      // Draw boss as a large hexagon with outline
      ctx.fillStyle = this.color;
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 3;
      
      const sides = 6;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const x = Math.cos(angle) * this.size;
        const y = Math.sin(angle) * this.size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Draw inner circle
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#FF00FF';
      ctx.fill();
    } else if (this.behavior === 'tank') {
      // Draw a pentagon for tanks
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const sides = 5;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const x = Math.cos(angle) * this.size;
        const y = Math.sin(angle) * this.size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      
      // Draw aggro indicator
      if (this.isAggro) {
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.size + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (this.behavior === 'zoomer') {
      // Draw a sharp, narrow triangle pointing in direction of movement
      ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x) + Math.PI / 2);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size * 1.5); // Very pointed tip
      ctx.lineTo(-this.size * 0.3, this.size); // Narrow base
      ctx.lineTo(this.size * 0.3, this.size);
      ctx.closePath();
      ctx.fill();
      
      // Add speed lines for effect
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-this.size * 0.5 - i * 3, this.size);
        ctx.lineTo(-this.size * 0.5 - i * 3, this.size + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.size * 0.5 + i * 3, this.size);
        ctx.lineTo(this.size * 0.5 + i * 3, this.size + 10);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      // Draw triangle for other types
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore();
  }
}