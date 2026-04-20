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
    this.maxWeapons = 8;  // Maximum weapon slots
    
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
    const continueButtonY = this.canvas.logicalHeight - 60;  // 490px
    // Use all space from content start to bottom with small margin
    const contentHeight = this.canvas.logicalHeight - contentY - 25;  // 550 - 137 - 25 = 388px
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
      itemWidth: this.canvas.logicalWidth - padding * 4,
      scrollbarX: this.canvas.logicalWidth - padding - 10,
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
    // Update weapon ownership - count duplicates
    const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
    this.weapons.forEach(weapon => {
      weapon.ownedCount = ownedWeapons.filter(w => w === weapon.id).length;
      weapon.owned = weapon.ownedCount > 0;
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
    
    // Check back/continue button
    if (this.showContinueButton) {
      this.continueHovered = pos.x >= this.canvas.logicalWidth / 2 - 75 && 
                             pos.x <= this.canvas.logicalWidth / 2 + 75 &&
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
    const weaponsTabX = this.canvas.logicalWidth / 2 - tabWidth - 10;
    const itemsTabX = this.canvas.logicalWidth / 2 + 10;
    
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
      if (item.owned && item.type === 'weapon' && item.ownedCount > 0) {
        const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
        const rightEdge = layout.padding * 2 + layout.itemWidth;

        if (level < BALANCE.weaponUpgrades.maxLevel) {
          // Check upgrade button (bottom-left area)
          const upgradeButtonX = rightEdge - 230;
          const upgradeButtonY = itemY + 46;
          if (pos.x >= upgradeButtonX && pos.x <= upgradeButtonX + 105 &&
              pos.y >= upgradeButtonY && pos.y <= upgradeButtonY + 26) {
            this.hoveredUpgradeButton = item;
            break;
          }
        }

        // Check sell button (bottom-right)
        const sellButtonX = rightEdge - 100;
        const sellButtonY = itemY + 46;
        if (pos.x >= sellButtonX && pos.x <= sellButtonX + 90 &&
            pos.y >= sellButtonY && pos.y <= sellButtonY + 26) {
          this.hoveredSellButton = item;
          break;
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
    } else if (this.hoveredItem && !this.hoveredItem.atMaxStacks) {
      // Weapons can always be purchased (duplicates allowed), items only if not owned
      if (this.hoveredItem.type === 'weapon' || !this.hoveredItem.owned) {
        this.purchaseItem(this.hoveredItem);
      }
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
        playerData.weapons.push(item.id);
        if (!playerData.weaponLevels[item.id]) {
          playerData.weaponLevels[item.id] = 1;
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

    // Remove ONE copy of the weapon from inventory
    const idx = playerData.weapons.indexOf(weapon.id);
    if (idx !== -1) {
      playerData.weapons.splice(idx, 1);
    }

    // Only remove upgrade level if no copies remain
    if (!playerData.weapons.includes(weapon.id) && playerData.weaponLevels) {
      delete playerData.weaponLevels[weapon.id];
    }

    // Update ownership
    this.updateOwnership();
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
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);
    
    // Back button or Continue button - larger, filled style
    if (this.showContinueButton) {
      const btnX = this.canvas.logicalWidth / 2 - 90;
      const btnW = 180;
      const btnH = 44;
      ctx.fillStyle = this.continueHovered ? '#228B22' : '#1a6b1a';
      ctx.fillRect(btnX, layout.continueButtonY, btnW, btnH);
      ctx.strokeStyle = this.continueHovered ? '#44FF44' : '#33AA33';
      ctx.lineWidth = 2;
      ctx.strokeRect(btnX, layout.continueButtonY, btnW, btnH);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONTINUE >', this.canvas.logicalWidth / 2, layout.continueButtonY + 29);
    } else {
      const btnW = 110;
      const btnH = 38;
      ctx.fillStyle = this.backHovered ? '#444444' : '#2a2a2a';
      ctx.fillRect(layout.padding, layout.backButtonY, btnW, btnH);
      ctx.strokeStyle = this.backHovered ? '#FFFFFF' : '#888888';
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.padding, layout.backButtonY, btnW, btnH);
      ctx.fillStyle = this.backHovered ? '#FFFFFF' : '#AAAAAA';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('< BACK', layout.padding + btnW / 2, layout.backButtonY + 25);
    }
    
    // Title
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHOP', this.canvas.logicalWidth / 2, layout.titleY);
    
    // Weapon slots indicator (only show for weapons tab)
    if (this.activeTab === 'weapons') {
      const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = ownedWeapons.length >= this.maxWeapons ? '#FF0000' : COLORS.UI_TEXT;
      ctx.textAlign = 'left';
      ctx.fillText(`Weapon Slots: ${ownedWeapons.length}/${this.maxWeapons}`, layout.padding, layout.titleY + 30);
      
      // Show warning if at max (positioned to the right of weapon slots text)
      if (ownedWeapons.length >= this.maxWeapons) {
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('(Sell to buy more)', layout.padding + 150, layout.titleY + 30);
      }
    }
    
    // Money display
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.fillText(`$${this.gameState.playerData.money}`, this.canvas.logicalWidth - layout.padding, layout.titleY);
    
    // Tabs
    const tabWidth = 150;
    const tabHeight = 40;
    const weaponsTabX = this.canvas.logicalWidth / 2 - tabWidth - 10;
    const itemsTabX = this.canvas.logicalWidth / 2 + 10;
    
    // Weapons tab
    ctx.fillStyle = this.activeTab === 'weapons' ? '#333366' : '#1a1a2a';
    ctx.fillRect(weaponsTabX, layout.tabsY, tabWidth, tabHeight);
    ctx.strokeStyle = this.activeTab === 'weapons' ? '#6666FF' : '#444444';
    ctx.lineWidth = 2;
    ctx.strokeRect(weaponsTabX, layout.tabsY, tabWidth, tabHeight);
    if (this.activeTab === 'weapons') {
      ctx.fillStyle = '#6666FF';
      ctx.fillRect(weaponsTabX, layout.tabsY + tabHeight - 3, tabWidth, 3);
    }
    ctx.fillStyle = this.activeTab === 'weapons' ? '#FFFFFF' : '#888888';
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WEAPONS', weaponsTabX + tabWidth / 2, layout.tabsY + 26);

    // Items tab
    ctx.fillStyle = this.activeTab === 'items' ? '#333366' : '#1a1a2a';
    ctx.fillRect(itemsTabX, layout.tabsY, tabWidth, tabHeight);
    ctx.strokeStyle = this.activeTab === 'items' ? '#6666FF' : '#444444';
    ctx.strokeRect(itemsTabX, layout.tabsY, tabWidth, tabHeight);
    if (this.activeTab === 'items') {
      ctx.fillStyle = '#6666FF';
      ctx.fillRect(itemsTabX, layout.tabsY + tabHeight - 3, tabWidth, 3);
    }
    ctx.fillStyle = this.activeTab === 'items' ? '#FFFFFF' : '#888888';
    ctx.fillText('ITEMS', itemsTabX + tabWidth / 2, layout.tabsY + 26);
    
    // Content area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.contentY, this.canvas.logicalWidth, layout.contentHeight);
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
      const isHovered = item === this.hoveredItem;
      if (isHovered) {
        const canBuyWeapon = item.type !== 'weapon' ||
                             (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
        if (item.atMaxStacks) {
          ctx.fillStyle = 'rgba(0, 255, 255, 0.08)';
        } else if (item.type === 'weapon' && !canBuyWeapon) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        } else {
          ctx.fillStyle = 'rgba(100, 150, 255, 0.12)';
        }
        ctx.fillRect(layout.padding * 2, itemY, layout.itemWidth, layout.itemHeight - 5);
      } else if (item.owned && item.type === 'weapon') {
        ctx.fillStyle = 'rgba(0, 100, 0, 0.08)';
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
      
      // Item name with level/count indicator
      ctx.font = 'bold 21px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = item.owned ? '#00FF00' : COLORS.UI_TEXT;
      let displayName = item.name;

      if (item.type === 'weapon') {
        if (item.ownedCount > 0) {
          const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
          displayName += ` x${item.ownedCount}`;
          if (level > 1) displayName += ` [Lv${level}]`;
          if (level < BALANCE.weaponUpgrades.maxLevel) {
            ctx.fillStyle = '#FFD700';
          }
        }
      } else {
        if (item.maxStacks > 1) {
          const currentStacks = item.currentStacks || 0;
          displayName += ` [${currentStacks}/${item.maxStacks}]`;
          ctx.fillStyle = currentStacks >= item.maxStacks ? '#00FFFF' : '#00FF00';
        } else {
          const owned = item.owned ? 1 : 0;
          displayName += ` [${owned}/1]`;
        }
      }
      ctx.fillText(displayName, layout.padding * 3, itemY + 25);
      
      // Item description (with special cases for certain items)
      ctx.font = 'bold 16px monospace';
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
      
      // Price/action buttons
      ctx.textAlign = 'right';
      const rightEdge = layout.padding * 2 + layout.itemWidth;

      if (item.type === 'weapon') {
        // Weapons: always show BUY button + upgrade/sell if owned
        const canBuyWeapon = (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
        const canAfford = this.gameState.playerData.money >= item.cost;

        if (item.ownedCount > 0) {
          const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;

          // Buy another copy button (top-right, same position as initial buy)
          if (canBuyWeapon) {
            const buyMoreX = rightEdge - 100;
            const buyMoreY = itemY + 10;
            const nextCount = item.ownedCount + 1;
            ctx.fillStyle = isHovered ? '#1a3a1a' : '#0a2a0a';
            ctx.fillRect(buyMoreX, buyMoreY, 90, 26);
            ctx.strokeStyle = isHovered ? '#44FF44' : (canAfford ? '#228B22' : '#553333');
            ctx.lineWidth = 2;
            ctx.strokeRect(buyMoreX, buyMoreY, 90, 26);
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = canAfford ? '#44FF44' : '#FF4444';
            ctx.textAlign = 'center';
            ctx.fillText(`BUY #${nextCount} $${item.cost}`, buyMoreX + 45, buyMoreY + 17);
          }

          // Sell button (bottom-right)
          const sellButtonX = rightEdge - 100;
          const sellButtonY = itemY + 46;
          const sellPrice = Math.floor(item.cost * 0.8);
          const isLastWeapon = (this.gameState.playerData.weapons || ['pistol']).length <= 1;

          if (!isLastWeapon) {
            ctx.fillStyle = this.hoveredSellButton === item ? '#3a1a1a' : '#2a1010';
            ctx.fillRect(sellButtonX, sellButtonY, 90, 26);
            ctx.strokeStyle = this.hoveredSellButton === item ? '#FF6666' : '#883333';
            ctx.lineWidth = 1;
            ctx.strokeRect(sellButtonX, sellButtonY, 90, 26);
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = this.hoveredSellButton === item ? '#FF6666' : '#AA4444';
            ctx.textAlign = 'center';
            ctx.fillText(`SELL $${sellPrice}`, sellButtonX + 45, sellButtonY + 17);
          }

          // Upgrade button (bottom-left of action area)
          if (level < BALANCE.weaponUpgrades.maxLevel) {
            const upgradeCost = Math.max(25, Math.floor(item.cost * level));
            const canAffordUpgrade = this.gameState.playerData.money >= upgradeCost;
            const upgradeButtonX = rightEdge - 230;
            const upgradeButtonY = itemY + 46;

            ctx.fillStyle = this.hoveredUpgradeButton === item ? '#3a3a00' : '#2a2a00';
            ctx.fillRect(upgradeButtonX, upgradeButtonY, 105, 26);
            ctx.strokeStyle = this.hoveredUpgradeButton === item ? '#FFD700' : (canAffordUpgrade ? '#AA8800' : '#553300');
            ctx.lineWidth = 2;
            ctx.strokeRect(upgradeButtonX, upgradeButtonY, 105, 26);
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = this.hoveredUpgradeButton === item ? '#FFD700' : (canAffordUpgrade ? '#DDAA00' : '#663300');
            ctx.textAlign = 'center';
            ctx.fillText(`UPG Lv${level+1} $${upgradeCost}`, upgradeButtonX + 52, upgradeButtonY + 17);
          } else {
            ctx.font = 'bold 13px monospace';
            ctx.fillStyle = '#00FFFF';
            ctx.textAlign = 'left';
            ctx.fillText('MAX LV', rightEdge - 230, itemY + 58);
          }
        } else {
          // Not owned yet - show price as big buy button
          if (!canBuyWeapon) {
            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = '#FF4444';
            ctx.textAlign = 'right';
            ctx.fillText('SLOTS FULL', rightEdge - 10, itemY + 40);
          } else {
            const buyBtnX = rightEdge - 100;
            const buyBtnY = itemY + 22;
            ctx.fillStyle = isHovered ? '#1a3a1a' : '#0a2a0a';
            ctx.fillRect(buyBtnX, buyBtnY, 90, 26);
            ctx.strokeStyle = isHovered ? '#44FF44' : (canAfford ? '#228B22' : '#553333');
            ctx.lineWidth = 2;
            ctx.strokeRect(buyBtnX, buyBtnY, 90, 26);
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = canAfford ? '#44FF44' : '#FF4444';
            ctx.textAlign = 'center';
            ctx.fillText(`BUY $${item.cost}`, buyBtnX + 45, buyBtnY + 17);
          }
        }
      } else if (item.owned && item.type !== 'weapon') {
        // Non-weapon owned items
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#00FF00';
        ctx.textAlign = 'right';
        ctx.fillText('OWNED', rightEdge - 10, itemY + 35);
      } else if (item.atMaxStacks) {
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#00FFFF';
        ctx.textAlign = 'right';
        ctx.fillText('MAX STACKS', rightEdge - 10, itemY + 35);
      } else {
        // Purchasable items
        const actualCost = this.getCurrentItemCost(item);
        const canAfford = this.gameState.playerData.money >= actualCost;

        const buyBtnX = rightEdge - 110;
        const buyBtnY = itemY + 18;
        ctx.fillStyle = isHovered ? '#1a3a1a' : '#0a2a0a';
        ctx.fillRect(buyBtnX, buyBtnY, 100, 32);
        ctx.strokeStyle = isHovered ? '#44FF44' : (canAfford ? '#228B22' : '#553333');
        ctx.lineWidth = 2;
        ctx.strokeRect(buyBtnX, buyBtnY, 100, 32);
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = canAfford ? '#44FF44' : '#FF4444';
        ctx.textAlign = 'center';
        ctx.fillText(`$${actualCost}`, buyBtnX + 50, buyBtnY + 21);

        if (item.maxStacks > 1) {
          const currentStacks = item.currentStacks || 0;
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#888888';
          ctx.fillText(`#${currentStacks + 1}`, buyBtnX + 50, buyBtnY - 6);
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