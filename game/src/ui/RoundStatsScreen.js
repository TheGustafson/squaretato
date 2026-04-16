import { COLORS } from '../constants.js';
import { createWeapon } from '../systems/WeaponSystem.js';
import { Enemy } from '../entities/Enemy.js';
import { BALANCE } from '../config/balance.js';
export class RoundStatsScreen {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.stats = null;
    this.continueHovered = false;

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

  updateStats(statsObj) {
    this.stats = statsObj;
  }

  getLayout() {
    const padding = 40;
    const titleY = this.canvas.logicalHeight * 0.1;
    const contentY = this.canvas.logicalHeight * 0.2;
    const continueButtonY = this.canvas.logicalHeight - 60;
    
    return {
      padding,
      titleY,
      contentY,
      continueButtonY
    };
  }

  getMousePosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseMove(e) {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    
    const rightX = this.canvas.logicalWidth - layout.padding - 150;
    this.continueHovered = pos.x >= rightX && 
                           pos.x <= rightX + 150 &&
                           pos.y >= layout.continueButtonY && 
                           pos.y <= layout.continueButtonY + 40;
  }

  onClick(e) {
    if (this.continueHovered) {
      this.onContinueClick();
    }
  }

  onContinueClick() {
    // Overridden by parent
  }

  render(ctx) {
    const layout = this.getLayout();
    
    // Clear
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);
    
    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WAVE COMPLETE', this.canvas.logicalWidth / 2, layout.titleY);
    
    // Continue Button
    const btnRightX = this.canvas.logicalWidth - layout.padding - 150;
    ctx.strokeStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(btnRightX, layout.continueButtonY, 150, 40);
    ctx.fillStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTINUE >', btnRightX + 75, layout.continueButtonY + 25);
    
    // Draw Stats
    if (!this.stats) return;

    ctx.textAlign = 'left';
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#00FFFF';
    
    // Left Column: Global
    const leftX = layout.padding * 2;
    let y = layout.contentY;

    ctx.fillText('SUMMARY', leftX, y);
    ctx.font = 'bold 21px monospace';
    ctx.fillStyle = COLORS.UI_TEXT;
    
    y += 30;
    ctx.fillText(`Damage Taken : ${this.stats.damageTaken.toFixed(1)}`, leftX, y);
    y += 20;
    ctx.fillText(`Total Dealt  : ${this.stats.totalDamageDealt.toFixed(1)}`, leftX, y);
    y += 20;
    ctx.fillText(`Total Killed : ${this.stats.enemiesKilled}`, leftX, y);
    y += 20;
    const notCollected = Math.max(0, this.stats.moneySpawned - this.stats.moneyCollected);
    ctx.fillText(`Funds Hooked : $${this.stats.moneyCollected} / $${this.stats.moneySpawned}`, leftX, y);
    y += 20;
    ctx.fillStyle = notCollected > 0 ? '#FFAAAA' : '#AAFFAA';
    ctx.fillText(`Missed Funds : $${notCollected}`, leftX, y);

    // Middle Column: Weapon Stats
    const midX = this.canvas.logicalWidth / 2 - 60;
    y = layout.contentY;
    
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('BY WEAPON', midX, y);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = COLORS.UI_TEXT;
    
    y += 30;
    for (const [weaponId, damage] of this.stats.damageByWeapon.entries()) {
      const kills = this.stats.killsByWeapon.get(weaponId) || 0;
      // Capitalize weaponId
      const name = weaponId.charAt(0).toUpperCase() + weaponId.slice(1);
      
      // Render Weapon Sprite
      ctx.save();
      ctx.translate(midX - 25, y - 5);
      ctx.scale(1.5, 1.5);
      const tempWeapon = createWeapon(weaponId, 1);
      if (tempWeapon.render) {
        tempWeapon.position = { x: 0, y: 0 };
        tempWeapon.aimAngle = -Math.PI / 2; // Point UP
        tempWeapon.render(ctx);
      }
      ctx.restore();

      ctx.fillText(`[${name}]`, midX, y);
      ctx.fillStyle = '#00FF00';
      ctx.fillText(`${damage.toFixed(1)} DMG | ${kills} KILLS`, midX, y + 15);
      ctx.fillStyle = COLORS.UI_TEXT;
      y += 35;
    }

    // Right Column: Kills by Enemy
    const rightX = this.canvas.logicalWidth - 250;
    y = layout.contentY;

    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#FF6666';
    ctx.fillText('TARGETS', rightX, y);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = COLORS.UI_TEXT;

    y += 30;
    for (const [enemyType, amount] of this.stats.killsByType.entries()) {
      const name = enemyType.toUpperCase();
      
      // Render Enemy Sprite natively right beside it seamlessly
      ctx.save();
      ctx.translate(rightX - 35, y - 5);
      
      let baseType = enemyType.toLowerCase();
      let isEnraged = false;
      let isSpeed = false;
      
      if (baseType.startsWith('rage ')) {
        isEnraged = true;
        baseType = baseType.substring(5);
      } else if (baseType.startsWith('speed ')) {
        isSpeed = true;
        baseType = baseType.substring(6);
      }
      
      // Fallback natively to basic if corrupted string visually
      const safeBaseType = baseType.trim() || 'basic';
      const tempEnemy = new Enemy(0, 0, safeBaseType, 1);
      tempEnemy.isEnraged = isEnraged;
      tempEnemy.isSpeed = isSpeed;
      if (isEnraged) tempEnemy.color = '#FFAAAA';
      else if (isSpeed) tempEnemy.color = '#00FFFF';
      else tempEnemy.color = BALANCE.enemyTypes[safeBaseType]?.color || '#0000FF';
      
      // Prevent text overlay natively inside UI
      tempEnemy.rageTextTimer = 0;
      tempEnemy.speedTextTimer = 0;
      tempEnemy.isAggro = false; // Don't enforce UI state
      
      // Bound maximum render size dynamically to 15px for the UI exclusively
      tempEnemy.size = Math.min(tempEnemy.size, 15);
      
      if (tempEnemy.render) {
        tempEnemy.render(ctx);
      }
      ctx.restore();

      ctx.fillText(`${name}: ${amount} eliminated`, rightX, y);
      y += 28;
    }
  }
}
