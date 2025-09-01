import { Entity } from './Entity.js';
import { GAME_CONFIG, COLORS } from '../constants.js';

export class Projectile extends Entity {
  constructor(x, y, angle, owner = 'player') {
    super(x, y);
    this.size = GAME_CONFIG.PROJECTILE_SIZE;
    this.speed = GAME_CONFIG.PROJECTILE_SPEED;
    this.damage = 25;
    this.owner = owner;
    this.bounces = 0;
    this.maxBounces = 0;
    this.lifetime = 5; // seconds
    this.color = null; // Custom color override
    
    // Explosion properties
    this.explosive = false;
    this.explosionRadius = 0;
    this.explosionDamage = 0;
    
    // Piercing properties
    this.piercing = false;
    this.hitEnemies = new Set();  // Track which enemies have been hit
    
    // Wave motion properties
    this.waveMotion = false;
    this.wavePhase = 0;
    this.waveAmplitude = 0;
    this.initialAngle = angle;
    this.distanceTraveled = 0;
    
    // Smart bounce properties
    this.smartBounce = false;
    
    // Trail properties
    this.trail = false;
    this.lastTrailPosition = { x, y };
    
    // Chain lightning properties
    this.chainLightning = false;
    this.chainJumps = 0;
    this.chainRange = 0;
    this.chainDamageDecay = 1;
    this.chainsRemaining = 0;
    
    // Boomerang properties
    this.boomerang = false;
    this.boomerangDistance = 0;
    this.boomerangStartPos = null;
    this.boomerangReturning = false;
    this.boomerangTravelDistance = 0;
    
    // Gravity well properties
    this.gravityWell = false;
    this.wellDuration = 0;
    this.wellRadius = 0;
    this.wellStrength = 0;
    this.wellDamage = 0;
    this.wellActive = false;
    this.wellTimer = 0;
    
    // Auto-aim properties
    this.autoAimRadius = 25; // Default 25px, can be overridden by weapon upgrades
    
    // Homing rocket properties
    this.homing = false;
    this.homingTarget = null;
    this.homingStrength = 0;
    
    // Set velocity based on angle
    this.velocity.x = Math.cos(angle) * this.speed;
    this.velocity.y = Math.sin(angle) * this.speed;
  }

  update(deltaTime, canvasWidth, canvasHeight, enemies = null) {
    // Homing rocket behavior - continuously track and retarget
    if (this.homing && enemies && this.alive) {
      // Check if current target is still valid
      if (this.homingTarget && (!this.homingTarget.alive || this.homingTarget.health <= 0)) {
        this.homingTarget = null; // Target died, find new one
      }
      
      // Find new target if we don't have one
      if (!this.homingTarget) {
        let closestEnemy = null;
        let closestDistance = Infinity;
        
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          
          const dx = enemy.position.x - this.position.x;
          const dy = enemy.position.y - this.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestEnemy = enemy;
          }
        }
        
        this.homingTarget = closestEnemy;
      }
      
      // Home in on target
      if (this.homingTarget) {
        const dx = this.homingTarget.position.x - this.position.x;
        const dy = this.homingTarget.position.y - this.position.y;
        const targetAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
        
        // Smoothly turn towards target
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        const turnSpeed = this.homingStrength * deltaTime;
        const newAngle = currentAngle + Math.min(Math.max(angleDiff, -turnSpeed), turnSpeed);
        
        this.velocity.x = Math.cos(newAngle) * this.speed;
        this.velocity.y = Math.sin(newAngle) * this.speed;
      }
    }
    // Auto-aim for non-piercing player projectiles within autoAimRadius of enemies
    else if (this.owner === 'player' && !this.piercing && !this.homing && enemies && this.alive) {
      let closestEnemy = null;
      let closestDistance = this.autoAimRadius; // Use autoAimRadius (default 25px)
      
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        
        const dx = enemy.position.x - this.position.x;
        const dy = enemy.position.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEnemy = enemy;
        }
      }
      
      // Curve towards closest enemy
      if (closestEnemy) {
        const dx = closestEnemy.position.x - this.position.x;
        const dy = closestEnemy.position.y - this.position.y;
        const targetAngle = Math.atan2(dy, dx);
        
        // Smoothly curve towards target
        this.velocity.x = Math.cos(targetAngle) * this.speed;
        this.velocity.y = Math.sin(targetAngle) * this.speed;
      }
    }
    
    // Handle gravity well behavior
    if (this.gravityWell && this.owner === 'player') {
      if (!this.wellActive && this.lifetime <= 0) {
        // Become active gravity well
        this.wellActive = true;
        this.wellTimer = this.wellDuration;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.lifetime = this.wellDuration; // Reset lifetime for well duration
      }
      
      if (this.wellActive && enemies) {
        // Pull enemies toward gravity well
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          
          const dx = this.position.x - enemy.position.x;
          const dy = this.position.y - enemy.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance <= this.wellRadius && distance > 0) {
            const pullForce = this.wellStrength / (distance + 1); // Stronger when closer
            const pullX = (dx / distance) * pullForce * deltaTime;
            const pullY = (dy / distance) * pullForce * deltaTime;
            
            enemy.velocity.x += pullX;
            enemy.velocity.y += pullY;
            
            // Apply damage over time if wellDamage exists (level 3+)
            if (this.wellDamage > 0) {
              enemy.takeDamage(this.wellDamage * deltaTime);
            }
          }
        }
      }
    }
    
    // Handle boomerang behavior
    if (this.boomerang && this.owner === 'player') {
      this.boomerangTravelDistance += this.speed * deltaTime;
      
      if (!this.boomerangReturning && this.boomerangTravelDistance >= this.boomerangDistance) {
        // Start returning
        this.boomerangReturning = true;
        this.hitEnemies.clear(); // Can hit enemies again on return trip
      }
      
      if (this.boomerangReturning && this.boomerangStartPos) {
        // Calculate return direction
        const dx = this.boomerangStartPos.x - this.position.x;
        const dy = this.boomerangStartPos.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 20) {
          // Close enough to start position, remove projectile
          this.alive = false;
          return;
        }
        
        // Update velocity to return home
        const returnAngle = Math.atan2(dy, dx);
        this.velocity.x = Math.cos(returnAngle) * this.speed;
        this.velocity.y = Math.sin(returnAngle) * this.speed;
      }
    }
    
    // Handle wave motion before normal movement
    if (this.waveMotion) {
      this.distanceTraveled += this.speed * deltaTime;
      const waveOffset = Math.sin(this.distanceTraveled * 0.03 + this.wavePhase) * this.waveAmplitude;  // 3x frequency
      
      // Apply perpendicular offset to create wave pattern
      const perpAngle = this.initialAngle + Math.PI / 2;
      this.velocity.x = Math.cos(this.initialAngle) * this.speed + Math.cos(perpAngle) * waveOffset * 0.03;  // Match 3x frequency
      this.velocity.y = Math.sin(this.initialAngle) * this.speed + Math.sin(perpAngle) * waveOffset * 0.03;  // Match 3x frequency
    }
    
    super.update(deltaTime);
    
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.alive = false;
      return;
    }

    // Bounce off walls if enabled
    if (this.maxBounces > 0 && this.bounces < this.maxBounces) {
      const halfSize = this.size / 2;
      
      if (this.position.x - halfSize <= 0 || this.position.x + halfSize >= canvasWidth) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
        this.bounces++;
      }
      
      if (this.position.y - halfSize <= 0 || this.position.y + halfSize >= canvasHeight) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Math.max(halfSize, Math.min(canvasHeight - halfSize, this.position.y));
        this.bounces++;
      }
    } else {
      // Remove if out of bounds (no bouncing)
      if (
        this.position.x < -50 ||
        this.position.x > canvasWidth + 50 ||
        this.position.y < -50 ||
        this.position.y > canvasHeight + 50
      ) {
        this.alive = false;
      }
    }
  }

  render(ctx) {
    // Use custom color if set, otherwise default based on owner
    if (this.color) {
      ctx.fillStyle = this.color;
    } else {
      ctx.fillStyle = this.owner === 'player' ? COLORS.PLAYER : '#FF6600';
    }
    
    // Draw rocket as rectangle if it's a large projectile
    if (this.size >= 10) {
      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));
      ctx.fillRect(-this.size/2, -this.size/4, this.size, this.size/2);
      ctx.restore();
    } else {
      // Normal circular projectile
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}