import { Entity } from './Entity.js';
import { GAME_CONFIG, COLORS } from '../constants.js';

export class Pickup extends Entity {
  constructor(x, y, type = 'money') {
    super(x, y);
    this.type = type;
    this.size = 16;
    this.value = type === 'money' ? GAME_CONFIG.MONEY_VALUE : 0;
    this.lifetime = 10; // seconds
  }

  update(deltaTime) {
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.alive = false;
    }
  }

  render(ctx) {
    // Fade out as lifetime decreases
    const alpha = Math.min(1, this.lifetime / 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    
    if (this.type === 'money') {
      // Draw money value
      ctx.font = '14px monospace';
      ctx.fillStyle = '#FFD700';  // Gold color for money
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add a subtle glow effect
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 5;
      
      // Display the actual value
      ctx.fillText(`$${Math.floor(this.value)}`, this.position.x, this.position.y);
    }
    
    ctx.restore();
  }
}