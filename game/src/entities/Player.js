import { Entity } from './Entity.js';
import { GAME_CONFIG, COLORS } from '../constants.js';

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.size = GAME_CONFIG.PLAYER_SIZE;
    this.speed = GAME_CONFIG.PLAYER_SPEED;
    this.health = GAME_CONFIG.PLAYER_HEALTH;
    this.maxHealth = GAME_CONFIG.PLAYER_HEALTH;
    this.aimAngle = 0; // Direction player is aiming
  }

  update(deltaTime, input, mousePosition, canvasWidth, canvasHeight, gameAreaTop = 0, joystickVector = null, enemies = [], aimMode = 'auto') {
    // Movement handling (Joystick overrides Keyboard)
    this.velocity.x = 0;
    this.velocity.y = 0;

    if (joystickVector && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
      this.velocity.x = joystickVector.x * this.speed;
      this.velocity.y = joystickVector.y * this.speed;
    } else {
      if (input.pressed('ArrowLeft') || input.pressed('a')) {
        this.velocity.x = -this.speed;
      }
      if (input.pressed('ArrowRight') || input.pressed('d')) {
        this.velocity.x = this.speed;
      }
      if (input.pressed('ArrowUp') || input.pressed('w')) {
        this.velocity.y = -this.speed;
      }
      if (input.pressed('ArrowDown') || input.pressed('s')) {
        this.velocity.y = this.speed;
      }

      // Normalize diagonal keyboard movement
      if (this.velocity.x !== 0 && this.velocity.y !== 0) {
        const factor = 1 / Math.sqrt(2);
        this.velocity.x *= factor;
        this.velocity.y *= factor;
      }
    }

    // Aim handling
    if (aimMode === 'manual') {
      // Manual aim follows mouse position
      if (mousePosition) {
        const dx = mousePosition.x - this.position.x;
        const dy = mousePosition.y - this.position.y;
        this.aimAngle = Math.atan2(dy, dx);
      }
    } else {
      // Auto aim targets closest enemy
      let closestEnemy = null;
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
        const dx = closestEnemy.position.x - this.position.x;
        const dy = closestEnemy.position.y - this.position.y;
        this.aimAngle = Math.atan2(dy, dx);
      } else if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        // If no enemies, aim in the direction we are moving
        this.aimAngle = Math.atan2(this.velocity.y, this.velocity.x);
      }
    }

    // Update position
    super.update(deltaTime);

    // Keep player within game bounds
    const halfSize = this.size / 2;
    this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
    this.position.y = Math.max(gameAreaTop + halfSize, Math.min(canvasHeight - halfSize, this.position.y));
  }

  render(ctx) {
    // Draw player square
    ctx.fillStyle = COLORS.PLAYER;
    ctx.fillRect(
      this.position.x - this.size / 2,
      this.position.y - this.size / 2,
      this.size,
      this.size
    );

    // Health bar (above player)
    const barWidth = this.size * 1.5;
    const barHeight = 4;
    const barY = this.position.y - this.size / 2 - 10;

    // Background
    ctx.fillStyle = '#333333';
    ctx.fillRect(this.position.x - barWidth / 2, barY, barWidth, barHeight);

    // Health
    const healthPercent = this.health / this.maxHealth;
    ctx.fillStyle = healthPercent > 0.3 ? COLORS.PLAYER : '#FF0000';
    ctx.fillRect(this.position.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
  }
}