import { COLORS } from '../constants.js';
import { BALANCE } from '../config/balance.js';

export class CharacterScreen {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.selectedUpgrade = null;
    this.scrollOffset = 0;
    this.maxScroll = 0;
    // Upgrades will be generated dynamically based on purchase count

    this.setupEventListeners();
  }

  getLayout() {
    const padding = 20;
    const backButtonY = padding;
    const titleY = this.canvas.height * 0.1;
    const statsY = this.canvas.height * 0.2;
    const upgradesY = this.canvas.height * 0.35;
    const upgradeBoxSpacing = 60;  // Space between boxes
    const visibleHeight = this.canvas.height - upgradesY - 50;  // Visible area for upgrades
    const maxVisibleItems = Math.floor(visibleHeight / upgradeBoxSpacing);
    
    return {
      padding,
      backButtonY,
      titleY,
      statsY,
      upgradesY,
      upgradeBoxHeight: 52,  // Increased height for better padding
      upgradeBoxWidth: 350,
      upgradeBoxSpacing,
      maxVisibleItems,
      visibleHeight,
    };
  }

  setupEventListeners() {
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleWheel = (e) => this.onWheel(e);
  }

  activate() {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel);
    
    // Calculate max scroll
    const layout = this.getLayout();
    const upgrades = this.getUpgrades();
    const totalHeight = upgrades.length * layout.upgradeBoxSpacing;
    this.maxScroll = Math.max(0, totalHeight - layout.visibleHeight);
    this.scrollOffset = 0;  // Reset scroll when activated
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const layout = this.getLayout();

    // Check upgrade hovers (accounting for scroll)
    const upgrades = this.getUpgrades();
    this.selectedUpgrade = null;
    for (let i = 0; i < upgrades.length; i++) {
      const y1 = layout.upgradesY + i * layout.upgradeBoxSpacing - this.scrollOffset;
      // Only check if the box is visible
      if (y1 >= layout.upgradesY - layout.upgradeBoxHeight && y1 <= this.canvas.height) {
        if (x >= 50 && x <= 50 + layout.upgradeBoxWidth && y >= y1 && y <= y1 + layout.upgradeBoxHeight) {
          this.selectedUpgrade = i;
          break;
        }
      }
    }

    // Check back button
    this.backHovered = x >= layout.padding && x <= layout.padding + 100 && 
                       y >= layout.backButtonY && y <= layout.backButtonY + 40;
  }

  onClick(e) {
    if (this.backHovered) {
      this.onBackClick();
    } else if (this.selectedUpgrade !== null) {
      const upgrades = this.getUpgrades();
      this.purchaseUpgrade(upgrades[this.selectedUpgrade]);
    }
  }

  getUpgrades() {
    const upgrades = [];
    const playerData = this.gameState.playerData;
    
    // Ensure upgradePurchases exists
    if (!playerData.upgradePurchases) {
      playerData.upgradePurchases = {
        health: 0, speed: 0, damage: 0, fireRate: 0,
        dodge: 0, luck: 0, critChance: 0, critDamage: 0, regeneration: 0
      };
    }
    
    for (const [stat, config] of Object.entries(BALANCE.upgrades)) {
      const purchases = playerData.upgradePurchases[stat] || 0;
      const cost = Math.floor(config.baseCost * Math.pow(config.costScaling, purchases));
      
      let displayName = '';
      switch(stat) {
        case 'health': displayName = `Health +${config.value}`; break;
        case 'speed': displayName = `Speed +${config.value}`; break;
        case 'damage': displayName = `Damage +${config.value}`; break;
        case 'fireRate': displayName = `Fire Rate +${config.value}`; break;
        case 'dodge': displayName = `Dodge +${config.value}%`; break;
        case 'luck': displayName = `Luck +${config.value}`; break;
        case 'critChance': displayName = `Crit Chance +${config.value}%`; break;
        case 'critDamage': displayName = `Crit Damage +${config.value}%`; break;
        case 'regeneration': displayName = `Regen +${config.value}/s`; break;
      }
      
      upgrades.push({
        name: displayName,
        cost: cost,
        stat: stat,
        value: config.value,
        purchases: purchases
      });
    }
    
    return upgrades;
  }
  
  purchaseUpgrade(upgrade) {
    const playerData = this.gameState.playerData;
    if (playerData.money >= upgrade.cost) {
      playerData.money -= upgrade.cost;
      playerData.stats[upgrade.stat] += upgrade.value;
      playerData.upgradePurchases[upgrade.stat] = (playerData.upgradePurchases[upgrade.stat] || 0) + 1;
      this.gameState.savePlayerData();
    }
  }

  onWheel(e) {
    e.preventDefault();
    const scrollSpeed = 30;
    
    if (e.deltaY > 0) {
      // Scroll down
      this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + scrollSpeed);
    } else {
      // Scroll up
      this.scrollOffset = Math.max(0, this.scrollOffset - scrollSpeed);
    }
  }

  onBackClick() {
    // This will be called when back is clicked
  }

  render(ctx) {
    const layout = this.getLayout();
    
    // Clear
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Back button
    ctx.strokeStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.padding, layout.backButtonY, 100, 40);
    ctx.fillStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('< BACK', layout.padding + 50, layout.backButtonY + 25);

    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAT UPGRADES', this.canvas.width / 2, layout.titleY);

    // Current stats
    const stats = this.gameState.playerData.stats;
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_TEXT;
    
    const statsX = this.canvas.width - 280;
    ctx.fillText('CURRENT STATS', statsX, layout.statsY);
    ctx.font = '14px monospace';
    ctx.fillText(`Health: ${stats.health}`, statsX, layout.statsY + 30);
    ctx.fillText(`Speed: ${stats.speed}`, statsX, layout.statsY + 50);
    ctx.fillText(`Damage: ${stats.damage}`, statsX, layout.statsY + 70);
    ctx.fillText(`Fire Rate: ${stats.fireRate.toFixed(1)}/s`, statsX, layout.statsY + 90);
    ctx.fillText(`Dodge: ${stats.dodge}%`, statsX, layout.statsY + 110);
    ctx.fillText(`Luck: ${stats.luck}`, statsX, layout.statsY + 130);
    ctx.fillText(`Crit Chance: ${stats.critChance}%`, statsX, layout.statsY + 150);
    ctx.fillText(`Crit Damage: ${stats.critDamage}%`, statsX, layout.statsY + 170);
    ctx.fillText(`Regen: ${(stats.regeneration * 10).toFixed(1)} HP/s`, statsX, layout.statsY + 190);

    // Resources
    ctx.font = '16px monospace';
    ctx.fillText(`Money: $${this.gameState.playerData.money}`, 50, layout.statsY);

    // Upgrades header
    ctx.fillText('AVAILABLE UPGRADES', 50, layout.upgradesY - 20);
    
    // Scroll indicator if needed
    if (this.maxScroll > 0) {
      ctx.font = '10px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.textAlign = 'right';
      ctx.fillText('(Scroll to see more)', 50 + layout.upgradeBoxWidth, layout.upgradesY - 20);
    }
    
    // Create clipping region for upgrades
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.upgradesY, this.canvas.width, layout.visibleHeight);
    ctx.clip();
    
    // Draw upgrades with scroll offset
    const upgrades = this.getUpgrades();
    for (let i = 0; i < upgrades.length; i++) {
      const upgrade = upgrades[i];
      const y = layout.upgradesY + i * layout.upgradeBoxSpacing - this.scrollOffset;
      
      // Skip if outside visible area
      if (y + layout.upgradeBoxHeight < layout.upgradesY || y > this.canvas.height) {
        continue;
      }
      
      const canAfford = this.gameState.playerData.money >= upgrade.cost;
      
      // Box
      ctx.strokeStyle = i === this.selectedUpgrade && canAfford ? COLORS.UI_TEXT : 
                       canAfford ? COLORS.UI_INACTIVE : '#002200';
      ctx.lineWidth = 2;
      ctx.strokeRect(50, y, layout.upgradeBoxWidth, layout.upgradeBoxHeight);
      
      // Name
      ctx.font = '14px monospace';
      ctx.fillStyle = canAfford ? COLORS.UI_TEXT : '#003300';
      ctx.textAlign = 'left';
      ctx.fillText(upgrade.name, 60, y + 20);
      
      // Cost (moved up slightly to add padding from bottom)
      ctx.fillText(`Cost: $${upgrade.cost}`, 60, y + 38);
      if (upgrade.purchases > 0) {
        ctx.fillText(`(Bought: ${upgrade.purchases}x)`, 200, y + 38);
      }
    }
    
    ctx.restore();
    
    // Draw scroll bar if needed
    if (this.maxScroll > 0) {
      const scrollBarHeight = 100;
      const scrollBarY = layout.upgradesY;
      const scrollBarX = 410;
      const scrollThumbHeight = (layout.visibleHeight / (upgrades.length * layout.upgradeBoxSpacing)) * layout.visibleHeight;
      const scrollThumbY = scrollBarY + (this.scrollOffset / this.maxScroll) * (layout.visibleHeight - scrollThumbHeight);
      
      // Scroll track
      ctx.strokeStyle = COLORS.UI_INACTIVE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scrollBarX, scrollBarY);
      ctx.lineTo(scrollBarX, scrollBarY + layout.visibleHeight);
      ctx.stroke();
      
      // Scroll thumb
      ctx.strokeStyle = COLORS.UI_TEXT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(scrollBarX, scrollThumbY);
      ctx.lineTo(scrollBarX, scrollThumbY + scrollThumbHeight);
      ctx.stroke();
    }

  }
}