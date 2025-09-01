import { COLORS } from '../constants.js';

export class PauseMenu {
  constructor(canvas) {
    this.canvas = canvas;
    this.resumeHovered = false;
    this.mainMenuHovered = false;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate() {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const centerX = this.canvas.width / 2;
    const resumeY = this.canvas.height * 0.4;
    const mainMenuY = this.canvas.height * 0.5;
    
    // Check resume button
    this.resumeHovered = x >= centerX - 100 && x <= centerX + 100 &&
                        y >= resumeY && y <= resumeY + 40;
    
    // Check main menu button
    this.mainMenuHovered = x >= centerX - 100 && x <= centerX + 100 &&
                          y >= mainMenuY && y <= mainMenuY + 40;
  }

  onClick(e) {
    if (this.resumeHovered) {
      this.onResumeClick();
    } else if (this.mainMenuHovered) {
      this.onMainMenuClick();
    }
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onResumeClick();
    }
  }

  onResumeClick() {
    // Will be overridden by parent
  }

  onMainMenuClick() {
    // Will be overridden by parent
  }

  render(ctx) {
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Paused text
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height * 0.3);
    
    ctx.font = '14px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('(Press ESC to resume)', this.canvas.width / 2, this.canvas.height * 0.33);
    
    const centerX = this.canvas.width / 2;
    
    // Resume button
    const resumeY = this.canvas.height * 0.4;
    ctx.strokeStyle = this.resumeHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - 100, resumeY, 200, 40);
    
    ctx.fillStyle = this.resumeHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = '18px monospace';
    ctx.fillText('RESUME', centerX, resumeY + 25);
    
    // Main Menu button
    const mainMenuY = this.canvas.height * 0.5;
    ctx.strokeStyle = this.mainMenuHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeRect(centerX - 100, mainMenuY, 200, 40);
    
    ctx.fillStyle = this.mainMenuHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillText('MAIN MENU', centerX, mainMenuY + 25);
    
    // Warning
    ctx.font = '12px monospace';
    ctx.fillStyle = '#FF6600';
    ctx.fillText('(Progress will be saved)', centerX, mainMenuY + 60);
  }
}