import { COLORS } from '../constants.js';

export class GameOverScreen {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.continueHovered = false;
    this.finalStats = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
  }

  activate(stats = {}) {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.finalStats = stats;
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check continue button
    const buttonY = this.canvas.height * 0.7;
    this.continueHovered = x >= this.canvas.width / 2 - 100 && 
                           x <= this.canvas.width / 2 + 100 &&
                           y >= buttonY && 
                           y <= buttonY + 50;
  }

  onClick(e) {
    if (this.continueHovered) {
      this.onContinueClick();
    }
  }

  onContinueClick() {
    // Will be overridden by parent
  }

  render(ctx) {
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Game Over text
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height * 0.2);
    
    // Death message
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = '20px monospace';
    ctx.fillText('You have fallen...', this.canvas.width / 2, this.canvas.height * 0.3);
    
    // Stats
    if (this.finalStats) {
      ctx.font = '16px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillText(`Final Wave: ${this.finalStats.wave || 1}`, this.canvas.width / 2, this.canvas.height * 0.4);
      ctx.fillText(`Money Earned: $${this.finalStats.money || 0}`, this.canvas.width / 2, this.canvas.height * 0.45);
      ctx.fillText(`Enemies Defeated: ${this.finalStats.kills || 0}`, this.canvas.width / 2, this.canvas.height * 0.5);
    }
    
    // Reset warning
    ctx.font = '18px monospace';
    ctx.fillStyle = '#FF6600';
    ctx.fillText('ALL PROGRESS HAS BEEN RESET', this.canvas.width / 2, this.canvas.height * 0.6);
    ctx.font = '14px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('(Permadeath - Start from Level 1)', this.canvas.width / 2, this.canvas.height * 0.63);
    
    // Continue button
    const buttonY = this.canvas.height * 0.7;
    ctx.strokeStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.canvas.width / 2 - 100, buttonY, 200, 50);
    
    ctx.fillStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTINUE', this.canvas.width / 2, buttonY + 32);
  }
}