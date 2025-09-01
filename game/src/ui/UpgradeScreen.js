import { COLORS } from '../constants.js';
import { BALANCE } from '../config/balance.js';

export class UpgradeScreen {
  constructor(canvas, gameState, soundSystem) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = soundSystem;
    
    this.upgrades = [];
    this.selectedUpgrade = null;
    this.hoveredOption = null;
    this.canReroll = true;
    this.rerollsUsed = 0;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
  }

  activate() {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.generateUpgrades();
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  generateUpgrades() {
    const upgradeTypes = BALANCE.endWaveUpgrades.upgradeTypes;
    const count = BALANCE.endWaveUpgrades.optionsCount;
    
    // Calculate total weight
    const totalWeight = upgradeTypes.reduce((sum, type) => sum + type.weight, 0);
    
    // Generate random upgrades
    this.upgrades = [];
    const usedTypes = new Set();
    
    while (this.upgrades.length < count && usedTypes.size < upgradeTypes.length) {
      let random = Math.random() * totalWeight;
      let selectedType = null;
      
      for (const type of upgradeTypes) {
        random -= type.weight;
        if (random <= 0 && !usedTypes.has(type.type)) {
          selectedType = type.type;
          usedTypes.add(type.type);
          break;
        }
      }
      
      if (selectedType) {
        this.upgrades.push(this.createUpgrade(selectedType));
      }
    }
    
    // Fill remaining slots if needed
    while (this.upgrades.length < count) {
      const randomType = upgradeTypes[Math.floor(Math.random() * upgradeTypes.length)];
      this.upgrades.push(this.createUpgrade(randomType.type));
    }
  }

  createUpgrade(type) {
    // Get upgrade config from endWaveUpgrades instead of regular upgrades
    const upgradeType = BALANCE.endWaveUpgrades.upgradeTypes.find(t => t.type === type);
    if (!upgradeType) return null;
    
    return {
      type,
      name: this.getUpgradeName(type),
      description: upgradeType.display,  // Use the display text from config
      value: upgradeType.value,  // Use the value from endWaveUpgrades
      icon: this.getUpgradeIcon(type)
    };
  }

  getUpgradeName(type) {
    const names = {
      health: 'Vitality',
      damage: 'Power',
      fireRate: 'Rapid Fire',
      speed: 'Swiftness',
      dodge: 'Evasion',
      luck: 'Fortune',
      critChance: 'Precision',
      critDamage: 'Devastation',
      regeneration: 'Recovery'
    };
    return names[type] || type;
  }

  getUpgradeIcon(type) {
    const icons = {
      health: '❤',
      damage: '⚔',
      fireRate: '⚡',
      speed: '👟',
      dodge: '🛡',
      luck: '🍀',
      critChance: '🎯',
      critDamage: '💥',
      regeneration: '✨'
    };
    return icons[type] || '◆';
  }

  getLayout() {
    const padding = 40;
    const titleY = this.canvas.height * 0.15;
    const cardsY = this.canvas.height * 0.35;
    const cardWidth = 140;
    const cardHeight = 200;
    const cardSpacing = 30;
    const totalWidth = cardWidth * 4 + cardSpacing * 3;
    const startX = (this.canvas.width - totalWidth) / 2;
    const rerollY = this.canvas.height * 0.75;
    const skipY = this.canvas.height * 0.85;
    
    return {
      padding,
      titleY,
      cardsY,
      cardWidth,
      cardHeight,
      cardSpacing,
      startX,
      rerollY,
      skipY,
      buttonWidth: 150,
      buttonHeight: 40
    };
  }

  getMousePosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseMove(e) {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    
    this.hoveredOption = null;
    
    // Check upgrade cards
    for (let i = 0; i < this.upgrades.length; i++) {
      const cardX = layout.startX + i * (layout.cardWidth + layout.cardSpacing);
      
      if (pos.x >= cardX && pos.x <= cardX + layout.cardWidth &&
          pos.y >= layout.cardsY && pos.y <= layout.cardsY + layout.cardHeight) {
        this.hoveredOption = { type: 'upgrade', index: i };
        return;
      }
    }
    
    // Check reroll button
    const rerollX = this.canvas.width / 2 - layout.buttonWidth - 20;
    if (this.canReroll && 
        pos.x >= rerollX && pos.x <= rerollX + layout.buttonWidth &&
        pos.y >= layout.rerollY && pos.y <= layout.rerollY + layout.buttonHeight) {
      this.hoveredOption = { type: 'reroll' };
      return;
    }
    
    // Check skip button
    const skipX = this.canvas.width / 2 + 20;
    if (pos.x >= skipX && pos.x <= skipX + layout.buttonWidth &&
        pos.y >= layout.rerollY && pos.y <= layout.rerollY + layout.buttonHeight) {
      this.hoveredOption = { type: 'skip' };
      return;
    }
  }

  onClick(e) {
    if (!this.hoveredOption) return;
    
    if (this.hoveredOption.type === 'upgrade') {
      this.selectUpgrade(this.upgrades[this.hoveredOption.index]);
    } else if (this.hoveredOption.type === 'reroll') {
      this.reroll();
    } else if (this.hoveredOption.type === 'skip') {
      this.skip();
    }
  }

  selectUpgrade(upgrade) {
    if (!upgrade) return;
    
    // Apply the upgrade
    const stats = this.gameState.playerData.stats;
    switch (upgrade.type) {
      case 'health':
        stats.health += upgrade.value;
        break;
      case 'damage':
        stats.damage += upgrade.value;
        break;
      case 'fireRate':
        stats.fireRate += upgrade.value;
        break;
      case 'speed':
        stats.speed += upgrade.value;
        break;
      case 'dodge':
        stats.dodge = Math.min(95, stats.dodge + upgrade.value); // Cap at 95%
        break;
      case 'luck':
        stats.luck += upgrade.value;
        break;
      case 'critChance':
        stats.critChance = Math.min(100, stats.critChance + upgrade.value);
        break;
      case 'critDamage':
        stats.critDamage += upgrade.value;
        break;
      case 'regeneration':
        stats.regeneration += upgrade.value;
        break;
    }
    
    this.gameState.savePlayerData();
    
    if (this.soundSystem) {
      this.soundSystem.play('levelUp');
    }
    
    this.onUpgradeSelected();
  }

  reroll() {
    if (!this.canReroll) return;
    
    const rerollCost = BALANCE.endWaveUpgrades.rerollCost * (this.rerollsUsed + 1);
    
    if (this.gameState.playerData.money >= rerollCost) {
      this.gameState.playerData.money -= rerollCost;
      this.gameState.savePlayerData();
      this.rerollsUsed++;
      this.generateUpgrades();
      
      if (this.soundSystem) {
        this.soundSystem.play('buttonClick');
      }
      
      // Can only reroll 3 times
      if (this.rerollsUsed >= 3) {
        this.canReroll = false;
      }
    } else {
      if (this.soundSystem) {
        this.soundSystem.play('purchaseFail');
      }
    }
  }

  skip() {
    if (this.soundSystem) {
      this.soundSystem.play('buttonClick');
    }
    this.onUpgradeSelected();
  }

  onUpgradeSelected() {
    // Will be called when an upgrade is selected or skipped
  }

  render(ctx) {
    const layout = this.getLayout();
    
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CHOOSE AN UPGRADE', this.canvas.width / 2, layout.titleY);
    
    // Subtitle
    ctx.font = '16px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Select one upgrade to improve your character', this.canvas.width / 2, layout.titleY + 30);
    
    // Render upgrade cards
    for (let i = 0; i < this.upgrades.length; i++) {
      const upgrade = this.upgrades[i];
      const cardX = layout.startX + i * (layout.cardWidth + layout.cardSpacing);
      const isHovered = this.hoveredOption?.type === 'upgrade' && this.hoveredOption.index === i;
      
      // Card background
      if (isHovered) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(cardX, layout.cardsY, layout.cardWidth, layout.cardHeight);
      }
      
      // Card border
      ctx.strokeStyle = isHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeRect(cardX, layout.cardsY, layout.cardWidth, layout.cardHeight);
      
      // Icon
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillText(upgrade.icon, cardX + layout.cardWidth / 2, layout.cardsY + 60);
      
      // Name
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillText(upgrade.name, cardX + layout.cardWidth / 2, layout.cardsY + 100);
      
      // Description
      ctx.font = '12px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      const lines = this.wrapText(upgrade.description, layout.cardWidth - 20);
      for (let j = 0; j < lines.length; j++) {
        ctx.fillText(lines[j], cardX + layout.cardWidth / 2, layout.cardsY + 130 + j * 15);
      }
    }
    
    // Reroll button
    const rerollX = this.canvas.width / 2 - layout.buttonWidth - 20;
    const rerollCost = BALANCE.endWaveUpgrades.rerollCost * (this.rerollsUsed + 1);
    const canAffordReroll = this.gameState.playerData.money >= rerollCost;
    const isRerollHovered = this.hoveredOption?.type === 'reroll';
    
    if (this.canReroll) {
      ctx.strokeStyle = isRerollHovered && canAffordReroll ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.lineWidth = 2;
      ctx.strokeRect(rerollX, layout.rerollY, layout.buttonWidth, layout.buttonHeight);
      
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = canAffordReroll ? (isRerollHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE) : '#FF0000';
      ctx.fillText(`REROLL ($${rerollCost})`, rerollX + layout.buttonWidth / 2, layout.rerollY + 25);
    }
    
    // Skip button
    const skipX = this.canvas.width / 2 + 20;
    const isSkipHovered = this.hoveredOption?.type === 'skip';
    
    ctx.strokeStyle = isSkipHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(skipX, layout.rerollY, layout.buttonWidth, layout.buttonHeight);
    
    ctx.font = '14px monospace';
    ctx.fillStyle = isSkipHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillText('SKIP', skipX + layout.buttonWidth / 2, layout.rerollY + 25);
    
    // Money display
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Money: $${this.gameState.playerData.money}`, this.canvas.width - layout.padding, layout.padding);
  }

  wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length * 7 > maxWidth) { // Approximate char width
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word);
        }
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }
}