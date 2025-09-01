import { COLORS } from '../constants.js';
import { BALANCE } from '../config/balance.js';

export class ShopScreen {
  constructor(canvas, gameState, soundSystem) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = soundSystem;
    
    // Shop state
    this.activeTab = 'weapons'; // 'weapons' or 'items'
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.hoveredItem = null;
    this.selectedCategory = null;
    this.showContinueButton = false;  // Show continue instead of back when after wave
    this.hoveredSellButton = null;  // Track which sell button is hovered
    this.hoveredUpgradeButton = null;  // Track which upgrade button is hovered
    this.maxWeapons = 4;  // Maximum weapon slots
    
    // Compile shop items and sort by price
    this.weapons = Object.entries(BALANCE.weapons)
      .map(([id, config]) => ({
        id,
        ...config,
        type: 'weapon',
        owned: false
      }))
      .sort((a, b) => a.cost - b.cost);  // Sort by price ascending
    
    this.items = Object.entries(BALANCE.items)
      .map(([id, config]) => ({
        id,
        ...config,
        type: 'item',
        owned: false
      }))
      .sort((a, b) => a.cost - b.cost);  // Sort by price ascending
    
    this.setupEventListeners();
  }

  getLayout() {
    const padding = 20;
    const backButtonY = padding;
    const titleY = 44;  // Fixed position (was 8% of 550 = 44px)
    const tabsY = 82;   // Fixed position (was 15% of 550 = 82px)
    const contentY = 137; // Fixed position (was 25% of 550 = 137px)
    const continueButtonY = this.canvas.height - 60;  // 490px
    // Use all space from content start to bottom with small margin
    const contentHeight = this.canvas.height - contentY - 25;  // 550 - 137 - 25 = 388px
    const itemHeight = BALANCE.ui.shopItemHeight;
    const maxVisibleItems = Math.floor(contentHeight / itemHeight);
    
    return {
      padding,
      backButtonY,
      titleY,
      tabsY,
      contentY,
      contentHeight,
      itemHeight,
      maxVisibleItems,
      itemWidth: this.canvas.width - padding * 4,
      scrollbarX: this.canvas.width - padding - 10,
      scrollbarWidth: 6,
      continueButtonY
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
    this.updateOwnership();
  }

  deactivate() {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  updateOwnership() {
    // Update weapon ownership
    const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
    this.weapons.forEach(weapon => {
      weapon.owned = ownedWeapons.includes(weapon.id);
    });
    
    // Update item ownership
    const ownedItems = this.gameState.playerData.items || [];
    const itemStacks = this.gameState.playerData.itemStacks || {};
    
    this.items.forEach(item => {
      // For stackable items, never mark as owned - let cost scaling handle it
      if (item.maxStacks > 1) {
        const currentStacks = itemStacks[item.id] || 0;
        item.owned = false; // Always purchasable until max
        item.currentStacks = currentStacks; // Store for display
        item.atMaxStacks = currentStacks >= item.maxStacks; // Track if at max
      } else {
        item.owned = ownedItems.includes(item.id);
      }
    });
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
    
    // Check back/continue button
    if (this.showContinueButton) {
      this.continueHovered = pos.x >= this.canvas.width / 2 - 75 && 
                             pos.x <= this.canvas.width / 2 + 75 &&
                             pos.y >= layout.continueButtonY && 
                             pos.y <= layout.continueButtonY + 40;
      this.backHovered = false;
    } else {
      this.backHovered = pos.x >= layout.padding && pos.x <= layout.padding + 100 &&
                         pos.y >= layout.backButtonY && pos.y <= layout.backButtonY + 40;
      this.continueHovered = false;
    }
    
    // Check tabs
    const tabWidth = 150;
    const weaponsTabX = this.canvas.width / 2 - tabWidth - 10;
    const itemsTabX = this.canvas.width / 2 + 10;
    
    if (pos.y >= layout.tabsY && pos.y <= layout.tabsY + 40) {
      if (pos.x >= weaponsTabX && pos.x <= weaponsTabX + tabWidth) {
        this.hoveredTab = 'weapons';
      } else if (pos.x >= itemsTabX && pos.x <= itemsTabX + tabWidth) {
        this.hoveredTab = 'items';
      } else {
        this.hoveredTab = null;
      }
    } else {
      this.hoveredTab = null;
    }
    
    // Check item hover, sell button, and upgrade button hover
    this.hoveredItem = null;
    this.hoveredSellButton = null;
    this.hoveredUpgradeButton = null;
    const currentItems = this.activeTab === 'weapons' ? this.weapons : this.items;
    const visibleStart = Math.floor(this.scrollOffset);
    const visibleEnd = Math.min(visibleStart + layout.maxVisibleItems, currentItems.length);
    
    for (let i = visibleStart; i < visibleEnd; i++) {
      const item = currentItems[i];
      const itemY = layout.contentY + (i - this.scrollOffset) * layout.itemHeight;
      
      // Check upgrade/sell button hover for owned weapons
      if (item.owned && item.type === 'weapon') {
        const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
        
        if (level < BALANCE.weaponUpgrades.maxLevel) {
          // Check upgrade button for non-max weapons
          const upgradeButtonX = layout.padding * 2 + layout.itemWidth - 100;
          const upgradeButtonY = itemY + 45;
          if (pos.x >= upgradeButtonX && pos.x <= upgradeButtonX + 80 &&
              pos.y >= upgradeButtonY && pos.y <= upgradeButtonY + 25) {
            this.hoveredUpgradeButton = item;
            break;
          }
          
          // Check sell text (smaller area) for non-max weapons
          const sellButtonX = layout.padding * 2 + layout.itemWidth - 200;
          const sellButtonY = itemY + 45;
          if (pos.x >= sellButtonX && pos.x <= sellButtonX + 80 &&
              pos.y >= sellButtonY - 5 && pos.y <= sellButtonY + 20) {
            this.hoveredSellButton = item;
            break;
          }
        } else {
          // Check sell button for max level weapons
          const sellButtonX = layout.padding * 2 + layout.itemWidth - 100;
          const sellButtonY = itemY + 45;
          if (pos.x >= sellButtonX && pos.x <= sellButtonX + 80 &&
              pos.y >= sellButtonY && pos.y <= sellButtonY + 25) {
            this.hoveredSellButton = item;
            break;
          }
        }
      }
      
      if (pos.x >= layout.padding * 2 && 
          pos.x <= layout.padding * 2 + layout.itemWidth &&
          pos.y >= itemY && 
          pos.y <= itemY + layout.itemHeight - 5) {
        this.hoveredItem = item;
        break;
      }
    }
  }

  onClick(e) {
    if (this.backHovered) {
      this.onBackClick();
      return;
    }
    
    if (this.continueHovered) {
      this.onContinueClick();
      return;
    }
    
    if (this.hoveredTab && this.hoveredTab !== this.activeTab) {
      this.activeTab = this.hoveredTab;
      this.scrollOffset = 0;
      this.updateOwnership();
      if (this.soundSystem) {
        this.soundSystem.play('buttonClick');
      }
      return;
    }
    
    if (this.hoveredUpgradeButton) {
      this.upgradeWeapon(this.hoveredUpgradeButton);
    } else if (this.hoveredSellButton) {
      this.sellWeapon(this.hoveredSellButton);
    } else if (this.hoveredItem && !this.hoveredItem.owned && !this.hoveredItem.atMaxStacks) {
      this.purchaseItem(this.hoveredItem);
    }
  }

  onWheel(e) {
    e.preventDefault();
    const layout = this.getLayout();
    const currentItems = this.activeTab === 'weapons' ? this.weapons : this.items;
    const maxScroll = Math.max(0, currentItems.length - layout.maxVisibleItems);
    
    // Scroll based on wheel delta
    const scrollSpeed = 0.5;
    this.scrollOffset += (e.deltaY > 0 ? 1 : -1) * scrollSpeed;
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset));
  }

  getCurrentItemCost(item) {
    const playerData = this.gameState.playerData;
    
    // Handle stackable items with exponential cost scaling
    if (item.maxStacks > 1) {
      const itemStacks = playerData.itemStacks || {};
      const currentStacks = itemStacks[item.id] || 0;
      
      // More aggressive exponential scaling
      let multiplier = 2.0; // Default scaling - double each time
      
      if (item.cost <= 10) {
        multiplier = 1.8; // Still aggressive for cheap items
      } else if (item.cost <= 50) {
        multiplier = 2.0; // Double for medium items
      } else if (item.cost >= 200) {
        multiplier = 2.5; // Very aggressive for expensive stackables
      }
      
      // Special case for bounce house with its own multiplier (keep at 2.0 minimum)
      if (item.id === 'bounceHouse' && item.stackCostMultiplier) {
        multiplier = Math.max(2.0, item.stackCostMultiplier);
      }
      
      return Math.floor(item.cost * Math.pow(multiplier, currentStacks));
    }
    
    return item.cost;
  }

  purchaseItem(item) {
    const playerData = this.gameState.playerData;
    
    // Check weapon limit
    if (item.type === 'weapon') {
      const ownedWeapons = playerData.weapons || ['pistol'];
      if (ownedWeapons.length >= this.maxWeapons) {
        // Can't buy more weapons - show message
        if (this.soundSystem) {
          this.soundSystem.play('purchaseFail');
        }
        return;
      }
    }
    
    const actualCost = this.getCurrentItemCost(item);
    if (playerData.money >= actualCost) {
      playerData.money -= actualCost;
      
      if (item.type === 'weapon') {
        if (!playerData.weapons) playerData.weapons = ['pistol'];
        if (!playerData.weaponLevels) playerData.weaponLevels = { pistol: 1 };
        if (!playerData.weapons.includes(item.id)) {
          playerData.weapons.push(item.id);
          playerData.weaponLevels[item.id] = 1; // Start at level 1
        }
      } else {
        if (!playerData.items) playerData.items = [];
        if (!playerData.itemStacks) playerData.itemStacks = {};
        
        // Handle stackable items
        if (item.maxStacks > 1) {
          // Initialize or increment stack count
          if (!playerData.itemStacks[item.id]) {
            playerData.itemStacks[item.id] = 0;
          }
          
          // Check if at max stacks
          if (playerData.itemStacks[item.id] >= item.maxStacks) {
            if (this.soundSystem) {
              this.soundSystem.play('purchaseFail');
            }
            return;
          }
          
          playerData.itemStacks[item.id]++;
          
          // Special handling for bounce house
          if (item.id === 'bounceHouse') {
            playerData.bounceHouseStacks = playerData.itemStacks[item.id];
          }
          
          // Add to items list if first stack
          if (!playerData.items.includes(item.id)) {
            playerData.items.push(item.id);
          }
          
          // Apply immediate effect
          this.applyItemEffect(item.id);
        } else if (!playerData.items.includes(item.id)) {
          // Non-stackable items
          playerData.items.push(item.id);
          
          // Apply immediate item effects
          this.applyItemEffect(item.id);
        }
      }
      
      // Only mark non-stackable items as owned
      if (item.maxStacks === 1) {
        item.owned = true;
      }
      
      // Update ownership to refresh stack counts
      this.updateOwnership();
      this.gameState.savePlayerData();
      
      if (this.soundSystem) {
        this.soundSystem.play('purchaseSuccess');
      }
    } else {
      if (this.soundSystem) {
        this.soundSystem.play('purchaseFail');
      }
    }
  }

  applyItemEffect(itemId) {
    const playerData = this.gameState.playerData;
    const item = BALANCE.items[itemId];
    
    switch (itemId) {
      case 'moneyMagnet':
        playerData.stats.pickupRange *= item.rangeMultiplier;
        break;
      case 'luckyPenny':
        playerData.stats.luck += item.luckBonus;
        break;
      case 'speedBoots':
        playerData.stats.speed *= item.speedMultiplier;
        break;
      case 'sharpShooter':
        playerData.stats.critChance += item.critChanceBonus;
        playerData.stats.critDamage += item.critDamageBonus;
        break;
      case 'tankArmor':
        playerData.stats.health += item.healthBonus;
        break;
      case 'rapidReload':
        playerData.stats.fireRate *= item.fireRateMultiplier;
        break;
      // Cheap stackable items
      case 'luckyCoin':
        playerData.stats.luck += item.luckBonus;
        break;
      case 'energyDrink':
        playerData.stats.speed += item.speedBonus;
        break;
      case 'proteinBar':
        playerData.stats.health += item.healthBonus;
        break;
      case 'sharpTips':
        playerData.stats.damage *= (1 + item.damagePercent);
        break;
      case 'quickHands':
        playerData.stats.fireRate *= (1 + item.fireRatePercent);
        break;
      case 'bandaidPack':
        playerData.stats.regeneration += item.regenBonus;
        break;
      case 'coffeeShot':
        playerData.stats.speed *= (1 + item.speedPercent);
        playerData.stats.fireRate *= (1 + item.fireRatePercent);
        break;
      case 'magnetGloves':
        playerData.stats.pickupRange += item.pickupRangeBonus;
        break;
      case 'criticalEye':
        playerData.stats.critChance += item.critChanceBonus;
        break;
      case 'heavyRounds':
        playerData.stats.damage *= item.damageMultiplier;
        playerData.stats.fireRate *= item.fireRateMultiplier;
        break;
      case 'shieldGenerator':
        // Applied during gameplay - stores in items list
        break;
      case 'adrenalineRush':
        // Applied during gameplay - stores in items list
        break;
      case 'doubleTap':
        // Applied during weapon firing - stores in items list
        break;
      case 'bloodPact':
        // Applied during enemy death - stores in items list
        break;
      case 'glassCannon':
        playerData.stats.damage *= item.damageMultiplier;
        playerData.stats.health *= item.healthMultiplier;
        break;
    }
  }

  upgradeWeapon(weapon) {
    const playerData = this.gameState.playerData;
    if (!playerData.weaponLevels) playerData.weaponLevels = {};
    const currentLevel = playerData.weaponLevels[weapon.id] || 1;
    
    if (currentLevel >= BALANCE.weaponUpgrades.maxLevel) {
      if (this.soundSystem) {
        this.soundSystem.play('purchaseFail');
      }
      return;
    }
    
    // Upgrade cost = weapon base cost * level (so level 2 = 2x base, level 3 = 3x base, etc)
    const upgradeCost = Math.max(25, Math.floor(weapon.cost * currentLevel));
    
    if (playerData.money >= upgradeCost) {
      playerData.money -= upgradeCost;
      playerData.weaponLevels[weapon.id] = currentLevel + 1;
      this.gameState.savePlayerData();
      
      if (this.soundSystem) {
        this.soundSystem.play('upgrade');
      }
    } else {
      if (this.soundSystem) {
        this.soundSystem.play('purchaseFail');
      }
    }
  }

  sellWeapon(weapon) {
    const playerData = this.gameState.playerData;
    
    // Can't sell if it's the only weapon
    if (playerData.weapons.length <= 1) {
      if (this.soundSystem) {
        this.soundSystem.play('purchaseFail');
      }
      return;
    }
    
    // Sell for 80% of cost
    const sellPrice = Math.floor(weapon.cost * 0.8);
    playerData.money += sellPrice;
    
    // Remove weapon from inventory
    playerData.weapons = playerData.weapons.filter(w => w !== weapon.id);
    if (playerData.weaponLevels) {
      delete playerData.weaponLevels[weapon.id]; // Remove upgrade level
    }
    
    // Update ownership
    weapon.owned = false;
    this.gameState.savePlayerData();
    
    if (this.soundSystem) {
      this.soundSystem.play('sell');
    }
  }
  
  onBackClick() {
    // Will be overridden by parent
  }
  
  onContinueClick() {
    // Will be overridden by parent
  }

  render(ctx) {
    const layout = this.getLayout();
    
    // Clear background
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Back button or Continue button
    if (this.showContinueButton) {
      // Show Continue button at bottom center
      ctx.strokeStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.lineWidth = 2;
      ctx.strokeRect(this.canvas.width / 2 - 75, layout.continueButtonY, 150, 40);
      ctx.fillStyle = this.continueHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONTINUE', this.canvas.width / 2, layout.continueButtonY + 25);
    } else {
      // Show Back button at top left
      ctx.strokeStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.padding, layout.backButtonY, 100, 40);
      ctx.fillStyle = this.backHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('< BACK', layout.padding + 50, layout.backButtonY + 25);
    }
    
    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHOP', this.canvas.width / 2, layout.titleY);
    
    // Weapon slots indicator (only show for weapons tab)
    if (this.activeTab === 'weapons') {
      const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
      ctx.font = '14px monospace';
      ctx.fillStyle = ownedWeapons.length >= this.maxWeapons ? '#FF0000' : COLORS.UI_TEXT;
      ctx.textAlign = 'left';
      ctx.fillText(`Weapon Slots: ${ownedWeapons.length}/${this.maxWeapons}`, layout.padding, layout.titleY + 30);
      
      // Show warning if at max (positioned to the right of weapon slots text)
      if (ownedWeapons.length >= this.maxWeapons) {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('(Sell to buy more)', layout.padding + 150, layout.titleY + 30);
      }
    }
    
    // Money display
    ctx.font = '20px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.fillText(`$${this.gameState.playerData.money}`, this.canvas.width - layout.padding, layout.titleY);
    
    // Tabs
    const tabWidth = 150;
    const tabHeight = 40;
    const weaponsTabX = this.canvas.width / 2 - tabWidth - 10;
    const itemsTabX = this.canvas.width / 2 + 10;
    
    // Weapons tab
    ctx.fillStyle = this.activeTab === 'weapons' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeStyle = this.activeTab === 'weapons' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    ctx.strokeRect(weaponsTabX, layout.tabsY, tabWidth, tabHeight);
    if (this.activeTab === 'weapons') {
      ctx.fillRect(weaponsTabX, layout.tabsY, tabWidth, 3);
    }
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WEAPONS', weaponsTabX + tabWidth / 2, layout.tabsY + 25);
    
    // Items tab
    ctx.fillStyle = this.activeTab === 'items' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeStyle = this.activeTab === 'items' ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.strokeRect(itemsTabX, layout.tabsY, tabWidth, tabHeight);
    if (this.activeTab === 'items') {
      ctx.fillRect(itemsTabX, layout.tabsY, tabWidth, 3);
    }
    ctx.fillText('ITEMS', itemsTabX + tabWidth / 2, layout.tabsY + 25);
    
    // Content area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.contentY, this.canvas.width, layout.contentHeight);
    ctx.clip();
    
    // Render items
    const currentItems = this.activeTab === 'weapons' ? this.weapons : this.items;
    const visibleStart = Math.floor(this.scrollOffset);
    const visibleEnd = Math.min(visibleStart + layout.maxVisibleItems + 1, currentItems.length);
    
    for (let i = visibleStart; i < visibleEnd; i++) {
      const item = currentItems[i];
      const itemY = layout.contentY + (i - this.scrollOffset) * layout.itemHeight;
      
      // Skip if outside visible area
      if (itemY < layout.contentY - layout.itemHeight || itemY > layout.contentY + layout.contentHeight) {
        continue;
      }
      
      // Item background
      if (item === this.hoveredItem && !item.owned && !item.atMaxStacks) {
        const canBuyWeapon = item.type !== 'weapon' || 
                             (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
        if (canBuyWeapon) {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';  // Green highlight if can buy
        } else {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';  // Red highlight if slots full
        }
        ctx.fillRect(layout.padding * 2, itemY, layout.itemWidth, layout.itemHeight - 5);
      } else if (item === this.hoveredItem && item.atMaxStacks) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';  // Cyan highlight for max stacks
        ctx.fillRect(layout.padding * 2, itemY, layout.itemWidth, layout.itemHeight - 5);
      }
      
      // Item border - different colors for different states
      if (item.atMaxStacks) {
        ctx.strokeStyle = '#00FFFF'; // Cyan for max stacks
      } else if (item.owned || (item.maxStacks > 1 && item.currentStacks > 0)) {
        ctx.strokeStyle = '#00FF00'; // Green for owned items or stackables with stacks
      } else {
        ctx.strokeStyle = item === this.hoveredItem ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      }
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.padding * 2, itemY, layout.itemWidth, layout.itemHeight - 5);
      
      // Item name with level indicator for weapons and stack indicator for all items
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = item.owned ? '#00FF00' : COLORS.UI_TEXT;
      let displayName = item.name;
      
      // Add stack/ownership indicator for items
      if (item.type !== 'weapon') {
        if (item.maxStacks > 1) {
          // Stackable items show current/max
          const currentStacks = item.currentStacks || 0;
          displayName += ` [${currentStacks}/${item.maxStacks}]`;
          // Always green for stackable items unless at max
          if (currentStacks >= item.maxStacks) {
            ctx.fillStyle = '#00FFFF'; // Cyan for max stacks
          } else {
            ctx.fillStyle = '#00FF00'; // Green for stackable items
          }
        } else {
          // Unique items show [0/1] or [1/1]
          const owned = item.owned ? 1 : 0;
          displayName += ` [${owned}/1]`;
        }
      } else if (item.owned && item.type === 'weapon') {
        const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
        displayName += ` [Lv${level}]`;
        if (level < BALANCE.weaponUpgrades.maxLevel) {
          ctx.fillStyle = '#FFD700'; // Gold color for upgradeable
        }
      }
      ctx.fillText(displayName, layout.padding * 3, itemY + 25);
      
      // Item description (with special cases for certain items)
      ctx.font = '12px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      let description = item.description;
      
      // Special descriptions
      if (item.id === 'bounceHouse') {
        const stacks = this.gameState.playerData.bounceHouseStacks || 0;
        if (stacks > 0) {
          description = `Projectiles bounce ${stacks} times (next: ${stacks + 1} times)`;
        }
      } else if (item.maxStacks > 1 && item.currentStacks > 0) {
        // Show cumulative effect for stackable items
        if (item.luckBonus) {
          description = `+${item.luckBonus * (item.currentStacks || 0)} Luck (next: +${item.luckBonus})`;
        } else if (item.speedBonus) {
          description = `+${item.speedBonus * (item.currentStacks || 0)} Speed (next: +${item.speedBonus})`;
        } else if (item.healthBonus) {
          const current = (item.healthBonus * (item.currentStacks || 0)).toFixed(1);
          description = `+${current} Health (next: +${item.healthBonus})`;
        }
      } else if (item.owned && item.type === 'weapon') {
        const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
        if (level < BALANCE.weaponUpgrades.maxLevel) {
          // Show upgrade description
          description = item.upgradeDescription || item.description;
        }
      }
      
      ctx.fillText(description, layout.padding * 3, itemY + 45);
      
      // Price or owned status
      ctx.font = '14px monospace';
      ctx.textAlign = 'right';
      if (item.owned) {
        // Show upgrade button for weapons that can be upgraded
        if (item.type === 'weapon') {
          const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
          
          if (level < BALANCE.weaponUpgrades.maxLevel) {
            // Show upgrade button - cost = base cost * level
            const upgradeCost = Math.max(25, Math.floor(item.cost * level));
            const canAfford = this.gameState.playerData.money >= upgradeCost;
            
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`Lv${level}→${level+1}`, layout.padding * 2 + layout.itemWidth - 80, itemY + 25);
            
            const upgradeButtonX = layout.padding * 2 + layout.itemWidth - 100;
            const upgradeButtonY = itemY + 45;
            
            ctx.strokeStyle = this.hoveredUpgradeButton === item ? '#FFD700' : (canAfford ? COLORS.UI_TEXT : '#660000');
            ctx.lineWidth = 1;
            ctx.strokeRect(upgradeButtonX, upgradeButtonY, 80, 25);
            
            ctx.font = '11px monospace';
            ctx.fillStyle = this.hoveredUpgradeButton === item ? '#FFD700' : (canAfford ? COLORS.UI_TEXT : '#FF0000');
            ctx.textAlign = 'center';
            ctx.fillText(`UPGRADE $${upgradeCost}`, upgradeButtonX + 40, upgradeButtonY + 16);
          } else {
            // Max level reached
            ctx.fillStyle = '#00FFFF';
            ctx.fillText('MAX LEVEL', layout.padding * 2 + layout.itemWidth - 20, itemY + 25);
            
            // Show sell button for max level weapons too
            const sellButtonX = layout.padding * 2 + layout.itemWidth - 100;
            const sellButtonY = itemY + 45;
            const sellPrice = Math.floor(item.cost * 0.8);
            const isLastWeapon = (this.gameState.playerData.weapons || ['pistol']).length <= 1;
            
            if (!isLastWeapon) {
              ctx.strokeStyle = this.hoveredSellButton === item ? '#FFD700' : COLORS.UI_INACTIVE;
              ctx.lineWidth = 1;
              ctx.strokeRect(sellButtonX, sellButtonY, 80, 25);
              
              ctx.font = '11px monospace';
              ctx.fillStyle = this.hoveredSellButton === item ? '#FFD700' : COLORS.UI_INACTIVE;
              ctx.textAlign = 'center';
              ctx.fillText(`SELL $${sellPrice}`, sellButtonX + 40, sellButtonY + 16);
            } else {
              // Can't sell last weapon - show disabled
              ctx.strokeStyle = '#330000';
              ctx.lineWidth = 1;
              ctx.strokeRect(sellButtonX, sellButtonY, 80, 25);
              
              ctx.font = '11px monospace';
              ctx.fillStyle = '#660000';
              ctx.textAlign = 'center';
              ctx.fillText(`SELL $${sellPrice}`, sellButtonX + 40, sellButtonY + 16);
            }
          }
          
          // Small sell button on the side for non-max weapons (for upgradeable weapons)
          if (level < BALANCE.weaponUpgrades.maxLevel) {
            const sellButtonX = layout.padding * 2 + layout.itemWidth - 200;
            const sellButtonY = itemY + 45;
            const sellPrice = Math.floor(item.cost * 0.8);
            const isLastWeapon = (this.gameState.playerData.weapons || ['pistol']).length <= 1;
            
            if (!isLastWeapon) {
              ctx.font = '10px monospace';
              ctx.fillStyle = this.hoveredSellButton === item ? '#FF6666' : '#666666';
              ctx.textAlign = 'center';
              ctx.fillText(`[Sell $${sellPrice}]`, sellButtonX + 40, sellButtonY + 16);
            }
          }
        } else {
          // Non-weapon items just show owned
          ctx.fillStyle = '#00FF00';
          ctx.fillText('OWNED', layout.padding * 2 + layout.itemWidth - 20, itemY + 25);
        }
      } else {
        // Show price and purchase availability
        const canBuyWeapon = item.type !== 'weapon' || 
                             (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
        
        if (!canBuyWeapon) {
          ctx.fillStyle = '#FF0000';
          ctx.fillText('SLOTS FULL', layout.padding * 2 + layout.itemWidth - 20, itemY + 35);
        } else if (item.atMaxStacks) {
          // Show MAX for stackable items at max
          ctx.fillStyle = '#00FFFF';
          ctx.fillText('MAX STACKS', layout.padding * 2 + layout.itemWidth - 20, itemY + 35);
        } else {
          const actualCost = this.getCurrentItemCost(item);
          const canAfford = this.gameState.playerData.money >= actualCost;
          
          // Show different text for stackable vs unique items
          if (item.maxStacks > 1) {
            const currentStacks = item.currentStacks || 0;
            const nextStack = currentStacks + 1;
            
            // Draw price in normal size
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = canAfford ? '#FFD700' : '#FF0000';
            ctx.fillText(`$${actualCost}`, layout.padding * 2 + layout.itemWidth - 20, itemY + 35);
            
            // Draw "BUY #n" in smaller yellow text above the price
            ctx.font = '10px monospace';
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`BUY #${nextStack}`, layout.padding * 2 + layout.itemWidth - 20, itemY + 20);
          } else {
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = canAfford ? '#FFD700' : '#FF0000';
            ctx.fillText(`$${actualCost}`, layout.padding * 2 + layout.itemWidth - 20, itemY + 35);
          }
        }
      }
    }
    
    ctx.restore();
    
    // Scrollbar
    if (currentItems.length > layout.maxVisibleItems) {
      const scrollbarHeight = layout.contentHeight;
      const thumbHeight = Math.max(30, (layout.maxVisibleItems / currentItems.length) * scrollbarHeight);
      const maxThumbY = scrollbarHeight - thumbHeight;
      const thumbY = (this.scrollOffset / (currentItems.length - layout.maxVisibleItems)) * maxThumbY;
      
      // Scrollbar track
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillRect(layout.scrollbarX, layout.contentY, layout.scrollbarWidth, scrollbarHeight);
      
      // Scrollbar thumb
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillRect(layout.scrollbarX, layout.contentY + thumbY, layout.scrollbarWidth, thumbHeight);
    }
  }
}