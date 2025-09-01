import { COLORS, GAME_STATES } from '../constants.js';

export class Menu {
  constructor(canvas, gameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredLevel = null;
    this.selectedOption = null;
    this.gridCols = 10;
    this.gridRows = 3;
    this.levelBoxSize = 60;
    this.levelBoxSpacing = 10;

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

  getLayout() {
    // Dynamic layout based on canvas size
    const padding = 20;
    const titleY = this.canvas.height * 0.11;
    const subtitleY = titleY + 30;
    const gridStartY = this.canvas.height * 0.22;
    const buttonAreaY = this.canvas.height * 0.73;
    const buttonHeight = 40;
    const buttonWidth = 150;
    const statsAreaY = this.canvas.height * 0.85;
    
    return {
      padding,
      titleY,
      subtitleY,
      gridStartY,
      buttonAreaY,
      buttonHeight,
      buttonWidth,
      statsAreaY,
      gridStartX: (this.canvas.width - (this.gridCols * (this.levelBoxSize + this.levelBoxSpacing) - this.levelBoxSpacing)) / 2
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

  detectHover(x, y) {
    const layout = this.getLayout();
    
    // Check level grid hover
    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const level = row * this.gridCols + col + 1;
        if (level > 30) break;

        const boxX = layout.gridStartX + col * (this.levelBoxSize + this.levelBoxSpacing);
        const boxY = layout.gridStartY + row * (this.levelBoxSize + this.levelBoxSpacing);

        if (x >= boxX && x <= boxX + this.levelBoxSize &&
            y >= boxY && y <= boxY + this.levelBoxSize) {
          return { type: 'level', value: level };
        }
      }
    }

    // Check button hovers - three buttons now
    const centerX = this.canvas.width / 2 - layout.buttonWidth / 2;
    
    if (x >= layout.padding && x <= layout.padding + layout.buttonWidth && 
        y >= layout.buttonAreaY && y <= layout.buttonAreaY + layout.buttonHeight) {
      return { type: 'button', value: 'upgrades' };
    } else if (x >= centerX && x <= centerX + layout.buttonWidth && 
               y >= layout.buttonAreaY && y <= layout.buttonAreaY + layout.buttonHeight) {
      return { type: 'button', value: 'shop' };
    } else if (x >= this.canvas.width - layout.padding - layout.buttonWidth && 
               x <= this.canvas.width - layout.padding && 
               y >= layout.buttonAreaY && y <= layout.buttonAreaY + layout.buttonHeight) {
      return { type: 'button', value: 'settings' };
    }

    return null;
  }

  onMouseMove(e) {
    const pos = this.getMousePosition(e);
    const hover = this.detectHover(pos.x, pos.y);
    
    this.hoveredLevel = null;
    this.selectedOption = null;
    
    if (hover) {
      if (hover.type === 'level') {
        this.hoveredLevel = hover.value;
      } else if (hover.type === 'button') {
        this.selectedOption = hover.value;
      }
    }
  }

  onClick(e) {
    const pos = this.getMousePosition(e);
    const hover = this.detectHover(pos.x, pos.y);
    
    if (hover) {
      // Only allow playing the next level (highest unlocked level)
      if (hover.type === 'level' && hover.value === this.gameState.playerData.unlockedLevels) {
        this.onLevelSelect(hover.value);
      } else if (hover.type === 'button') {
        if (hover.value === 'upgrades') {
          this.onCharacterClick();
        } else if (hover.value === 'shop') {
          this.onShopClick();
        } else if (hover.value === 'settings') {
          this.onSettingsClick();
        }
      }
    }
  }

  onLevelSelect(level) {
    // This will be called when a level is selected
  }

  onCharacterClick() {
    // This will be called when upgrades is clicked
  }

  onShopClick() {
    // This will be called when shop is clicked
  }

  onSettingsClick() {
    // This will be called when settings is clicked
  }

  render(ctx) {
    const layout = this.getLayout();
    
    // Clear (use full canvas)
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SQUARETATO', this.canvas.width / 2, layout.titleY);

    // Subtitle
    ctx.font = '16px monospace';
    ctx.fillText('SELECT LEVEL', this.canvas.width / 2, layout.subtitleY);

    // Level grid
    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const level = row * this.gridCols + col + 1;
        if (level > 30) break;

        const boxX = layout.gridStartX + col * (this.levelBoxSize + this.levelBoxSpacing);
        const boxY = layout.gridStartY + row * (this.levelBoxSize + this.levelBoxSpacing);

        // Determine box state
        const isNextLevel = level === this.gameState.playerData.unlockedLevels;
        const isCompleted = level < this.gameState.playerData.unlockedLevels;
        const isLocked = level > this.gameState.playerData.unlockedLevels;
        const isHovered = level === this.hoveredLevel;
        
        // Set colors based on state
        if (isNextLevel) {
          // Next level - playable, highlight in green
          ctx.fillStyle = isHovered ? COLORS.UI_TEXT : '#00FF00';
          ctx.strokeStyle = '#00FF00';
        } else if (isCompleted) {
          // Completed levels - grayed out, not playable
          ctx.fillStyle = '#003300';
          ctx.strokeStyle = '#004400';
        } else {
          // Locked levels - dark
          ctx.fillStyle = '#001100';
          ctx.strokeStyle = '#002200';
        }

        // Draw box
        ctx.lineWidth = (isHovered && isNextLevel) ? 3 : 2;
        ctx.strokeRect(boxX, boxY, this.levelBoxSize, this.levelBoxSize);
        
        // Fill box if next level
        if (isNextLevel) {
          ctx.fillStyle = isHovered ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 255, 0, 0.1)';
          ctx.fillRect(boxX, boxY, this.levelBoxSize, this.levelBoxSize);
        }
        
        // Draw level number
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (isNextLevel) {
          ctx.fillStyle = '#000000';  // Black text on green background
        } else if (isCompleted) {
          ctx.fillStyle = '#005500';  // Dark green for completed
        } else {
          ctx.fillStyle = '#003300';  // Very dark for locked
        }
        
        ctx.fillText(level.toString(), boxX + this.levelBoxSize / 2, boxY + this.levelBoxSize / 2);
        
        // Add status indicators
        if (isCompleted) {
          // Draw checkmark for completed levels
          ctx.strokeStyle = '#00AA00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          const checkX = boxX + this.levelBoxSize - 15;
          const checkY = boxY + 10;
          ctx.moveTo(checkX, checkY + 4);
          ctx.lineTo(checkX + 4, checkY + 8);
          ctx.lineTo(checkX + 10, checkY);
          ctx.stroke();
        } else if (isNextLevel) {
          // Pulsing animation for next level
          const pulse = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
          ctx.strokeStyle = `rgba(0, 255, 0, ${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(boxX - 2, boxY - 2, this.levelBoxSize + 4, this.levelBoxSize + 4);
          
          ctx.font = '10px monospace';
          ctx.fillStyle = '#00FF00';
          ctx.fillText('PLAY', boxX + this.levelBoxSize / 2, boxY + this.levelBoxSize - 8);
        }
      }
    }

    // Upgrades button (left)
    ctx.strokeStyle = this.selectedOption === 'upgrades' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.padding, layout.buttonAreaY, layout.buttonWidth, layout.buttonHeight);
    
    ctx.fillStyle = this.selectedOption === 'upgrades' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('UPGRADES', layout.padding + layout.buttonWidth / 2, layout.buttonAreaY + layout.buttonHeight / 2 + 5);

    // Shop button (center)
    const centerX = this.canvas.width / 2 - layout.buttonWidth / 2;
    ctx.strokeStyle = this.selectedOption === 'shop' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeRect(centerX, layout.buttonAreaY, layout.buttonWidth, layout.buttonHeight);
    
    ctx.fillStyle = this.selectedOption === 'shop' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillText('SHOP', this.canvas.width / 2, layout.buttonAreaY + layout.buttonHeight / 2 + 5);

    // Settings button (right)
    ctx.strokeStyle = this.selectedOption === 'settings' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeRect(this.canvas.width - layout.padding - layout.buttonWidth, layout.buttonAreaY, layout.buttonWidth, layout.buttonHeight);
    
    ctx.fillStyle = this.selectedOption === 'settings' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.fillText('SETTINGS', this.canvas.width - layout.padding - layout.buttonWidth / 2, layout.buttonAreaY + layout.buttonHeight / 2 + 5);

    // Stats display
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Money: $${this.gameState.playerData.money}`, layout.padding, layout.statsAreaY);
  }
}