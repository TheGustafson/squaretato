import { COLORS, CONTROL_SCHEMES } from '../constants.js';

export class SettingsScreen {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredOption = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
  }

  activate() {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check back button
    this.backHovered = x >= 20 && x <= 120 && y >= 20 && y <= 60;

    // Check control scheme options
    this.hoveredOption = null;
    if (x >= 200 && x <= 350 && y >= 150 && y <= 200) {
      this.hoveredOption = 'mouse';
    } else if (x >= 450 && x <= 600 && y >= 150 && y <= 200) {
      this.hoveredOption = 'keyboard';
    } else if (x >= 200 && x <= 350 && y >= 230 && y <= 280) {
      this.hoveredOption = 'aim_auto';
    } else if (x >= 450 && x <= 600 && y >= 230 && y <= 280) {
      this.hoveredOption = 'aim_manual';
    }

    // Reset data button
    this.resetHovered = x >= this.canvas.logicalWidth / 2 - 100 && 
                        x <= this.canvas.logicalWidth / 2 + 100 && 
                        y >= 380 && y <= 420;
  }

  onClick(e) {
    if (this.backHovered) {
      this.onBackClick();
    } else if (this.hoveredOption === 'mouse') {
      this.gameState.playerData.controlScheme = CONTROL_SCHEMES.MOUSE;
      this.gameState.savePlayerData();
    } else if (this.hoveredOption === 'keyboard') {
      this.gameState.playerData.controlScheme = CONTROL_SCHEMES.KEYBOARD;
      this.gameState.savePlayerData();
    } else if (this.hoveredOption === 'aim_auto') {
      this.gameState.playerData.aimMode = 'auto';
      this.gameState.savePlayerData();
    } else if (this.hoveredOption === 'aim_manual') {
      this.gameState.playerData.aimMode = 'manual';
      this.gameState.savePlayerData();
    } else if (this.resetHovered) {
      if (confirm('Reset all progress? This cannot be undone!')) {
        this.gameState.resetProgress();
      }
    }
  }

  onBackClick() {
    console.log('Back to menu');
  }

  render(ctx) {
    // Clear
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    // Back button
    ctx.strokeStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 100, 40);
    ctx.fillStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('< BACK', 70, 45);

    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SETTINGS', this.canvas.logicalWidth / 2, 60);

    // Control scheme
    ctx.font = 'bold 26px monospace';
    ctx.fillText('CONTROL SCHEME', this.canvas.logicalWidth / 2, 120);

    // Mouse option
    const isMouseActive = this.gameState.playerData.controlScheme === CONTROL_SCHEMES.MOUSE;
    ctx.strokeStyle = isMouseActive ? COLORS.UI_TEXT : 
                     this.hoveredOption === 'mouse' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillStyle = isMouseActive ? COLORS.UI_TEXT : 
                   this.hoveredOption === 'mouse' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = isMouseActive ? 3 : 2;
    ctx.strokeRect(200, 150, 150, 50);
    ctx.font = 'bold 21px monospace';
    ctx.fillText('MOUSE', 275, 180);

    // Keyboard option
    const isKeyboardActive = this.gameState.playerData.controlScheme === CONTROL_SCHEMES.KEYBOARD;
    ctx.strokeStyle = isKeyboardActive ? COLORS.UI_TEXT : 
                     this.hoveredOption === 'keyboard' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillStyle = isKeyboardActive ? COLORS.UI_TEXT : 
                   this.hoveredOption === 'keyboard' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = isKeyboardActive ? 3 : 2;
    ctx.strokeRect(450, 150, 150, 50);
    ctx.fillText('WASD', 525, 180);

    // Aim Mode title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 26px monospace';
    ctx.fillText('AIM MODE', this.canvas.logicalWidth / 2, 220);

    // Aim Auto option
    const isAimAuto = this.gameState.playerData.aimMode === 'auto';
    ctx.strokeStyle = isAimAuto ? COLORS.UI_TEXT : 
                     this.hoveredOption === 'aim_auto' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillStyle = isAimAuto ? COLORS.UI_TEXT : 
                   this.hoveredOption === 'aim_auto' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = isAimAuto ? 3 : 2;
    ctx.strokeRect(200, 230, 150, 50);
    ctx.font = 'bold 21px monospace';
    ctx.fillText('AUTO', 275, 260);

    // Aim Manual option
    const isAimManual = this.gameState.playerData.aimMode === 'manual';
    ctx.strokeStyle = isAimManual ? COLORS.UI_TEXT : 
                     this.hoveredOption === 'aim_manual' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillStyle = isAimManual ? COLORS.UI_TEXT : 
                   this.hoveredOption === 'aim_manual' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = isAimManual ? 3 : 2;
    ctx.strokeRect(450, 230, 150, 50);
    ctx.fillText('MANUAL', 525, 260);

    // Instructions
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Mouse: Follows cursor | WASD: Use Keys/Joystick', this.canvas.logicalWidth / 2, 310);
    ctx.fillText('Auto Aim: Nearest enemy | Manual Aim: Mouse cursor', this.canvas.logicalWidth / 2, 330);

    // Reset button (danger)
    ctx.strokeStyle = this.resetHovered ? '#FF0000' : '#660000';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.canvas.logicalWidth / 2 - 100, 380, 200, 40);
    ctx.fillStyle = this.resetHovered ? '#FF0000' : '#660000';
    ctx.font = 'bold 21px monospace';
    ctx.fillText('RESET PROGRESS', this.canvas.logicalWidth / 2, 405);

    // Controls info
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Press ESC during game to return to menu', this.canvas.logicalWidth / 2, 460);
  }
}