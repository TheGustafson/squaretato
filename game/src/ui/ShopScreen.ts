import { COLORS } from '../constants';
import { BALANCE } from '../config/balance';
import { SPELL_CONFIGS } from '../systems/SpellSystem';
import { createWeapon, type Weapon } from '../systems/WeaponSystem';
import { applyItemEffect } from '../systems/ItemEffects';
import { drawPrimaryButton, drawSecondaryButton, drawTitle } from './drawHelpers';
import type { GameCanvas, PlayerData } from '../types';
import type { GameState } from '../systems/GameState';
import type { SoundSystem } from '../systems/SoundSystem';
import type { BaseCharacter } from '../characters/BaseCharacter';
import { ManagerCharacter } from '../characters/ManagerCharacter';
import type { CapitalistCharacter } from '../characters/CapitalistCharacter';
import type { StructureConfig } from '../systems/StructureSystem';
import { RECRUIT_TRAITS, AI_BEHAVIORS, EQUIPMENT, type FormationType } from '../systems/RecruitSystem';

interface ShopItem {
  id: string;
  name: string;
  cost: number;
  description: string;
  type: 'weapon' | 'item' | 'spell';
  owned: boolean;
  maxStacks?: number;
  currentStacks?: number;
  atMaxStacks?: boolean;
  ownedCount?: number;
  level?: number;
  hidden?: boolean;
  wizardOnly?: boolean;
  stackCostMultiplier?: number;
  upgradeDescription?: string;
  luckBonus?: number;
  speedBonus?: number;
  healthBonus?: number;
  [key: string]: unknown;
}

interface EquippableInfo {
  level: number;
  maxLevel: number;
  upgradeCost: number;
  canSell: boolean;
}

interface ShopLayout {
  padding: number;
  backButtonY: number;
  titleY: number;
  tabsY: number;
  contentY: number;
  contentHeight: number;
  itemHeight: number;
  maxVisibleItems: number;
  itemWidth: number;
  scrollbarX: number;
  scrollbarWidth: number;
  continueButtonY: number;
}

export class ShopScreen {
  canvas: GameCanvas;
  gameState: GameState;
  soundSystem: SoundSystem | null;

  // Shop state
  activeTab: string;
  scrollOffset: number;
  maxScroll: number;
  hoveredItem: ShopItem | null;
  showContinueButton: boolean;
  hoveredSellButton: ShopItem | null;
  hoveredUpgradeButton: ShopItem | null;
  maxWeapons: number;
  activeCharacter: BaseCharacter | null;
  continueHovered: boolean;
  backHovered: boolean;
  hoveredTab: string | null;

  weapons: ShopItem[];
  items: ShopItem[];
  spells: ShopItem[];

  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleWheel: (e: WheelEvent) => void;
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  // Scrollbar drag state
  private scrollbarDragging: boolean = false;
  private scrollbarDragStartY: number = 0;
  private scrollbarDragStartOffset: number = 0;
  private scrollbarHovered: boolean = false;

  // Click animation + time (for pulsing red)
  private clickFlashTime: number = 0;

  // Mouse tracking for tooltips
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Businesses-tab state
  private bizPendingBuyId: string | null = null;  // business type awaiting placement
  private bizHoveredCell: { gx: number; gy: number } | null = null;
  private bizSelectedCell: { gx: number; gy: number } | null = null;
  private bizHoveredListId: string | null = null;
  private bizHoveredAction: 'sell' | 'upgrade' | null = null;

  // Weapons-tab (split loadout view) hover state
  private weaponsHoveredOrbitId: string | null = null;   // owned weapon glyph hovered on avatar
  private weaponsHoveredListId: string | null = null;    // buy-list card hovered
  private weaponsListScrollOffset: number = 0;
  private weaponPreviewCache: Map<string, Weapon> = new Map();

  constructor(canvas: GameCanvas, gameState: GameState, soundSystem: SoundSystem | null) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = soundSystem;

    this.activeTab = 'weapons';
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.hoveredItem = null;
    this.showContinueButton = false;
    this.hoveredSellButton = null;
    this.hoveredUpgradeButton = null;
    this.maxWeapons = 8;
    this.activeCharacter = null;
    this.continueHovered = false;
    this.backHovered = false;
    this.hoveredTab = null;

    const weaponsMap = BALANCE.weapons as unknown as Record<string, Record<string, unknown>>;
    this.weapons = Object.entries(weaponsMap)
      .filter(([_id, config]) => !config.hidden)
      .map(([id, config]) => ({
        id,
        ...config,
        name: config.name as string,
        cost: config.cost as number,
        description: config.description as string,
        type: 'weapon' as const,
        owned: false
      }))
      .sort((a, b) => a.cost - b.cost);

    const itemsMap = BALANCE.items as unknown as Record<string, Record<string, unknown>>;
    this.items = Object.entries(itemsMap)
      .map(([id, config]) => ({
        id,
        ...config,
        name: config.name as string,
        cost: config.cost as number,
        description: config.description as string,
        type: 'item' as const,
        owned: false
      }))
      .sort((a, b) => a.cost - b.cost);

    const spellsMap = SPELL_CONFIGS as Record<string, { name: string; cost: number; description: string; [k: string]: unknown }>;
    this.spells = Object.entries(spellsMap)
      .map(([id, config]) => ({
        id,
        ...config,
        name: config.name,
        cost: config.cost,
        description: config.description,
        type: 'spell' as const,
        owned: false,
      }))
      .sort((a, b) => a.cost - b.cost);

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
    this.handleWheel = (e: WheelEvent) => this.onWheel(e);
    this.handleMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    this.handleMouseUp = (_e: MouseEvent) => this.onMouseUp();
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  }

  // Tab icon (single glyph rendered with monospace font)
  private getTabIcon(tab: string): string {
    switch (tab) {
      case 'weapons': return '*';
      case 'spells': return '~';
      case 'items': return '+';
      case 'recruit': return '&';
      case 'roster': return '#';
      case 'equipment': return '=';
      case 'businesses': return '$';
      case 'stocks': return '^';
      default: return '.';
    }
  }

  getLayout(): ShopLayout {
    const padding = 20;
    const backButtonY = padding;
    const titleY = 44;
    const tabsY = 82;
    const contentY = 137;
    const continueButtonY = this.canvas.logicalHeight - 60;
    // Clamp the scrollable content area so it never runs under the CONTINUE
    // button. Previously contentHeight = canvas - contentY - 25, which drew
    // scroll-list tails on top of the CTA on the businesses and stocks tabs.
    const contentBottomPad = 16;
    const contentHeight = Math.max(120, continueButtonY - contentY - contentBottomPad);
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

  getTabs(): string[] {
    if (this.activeCharacter && this.activeCharacter.getShopTabs) {
      return this.activeCharacter.getShopTabs();
    }
    return ['weapons', 'items'];
  }

  getCurrentItems(): ShopItem[] {
    if (this.activeTab === 'spells') return this.spells;
    if (this.activeTab === 'items') {
      if (this.activeCharacter && this.activeCharacter.getAvailableItems()) {
        const pool = this.activeCharacter.getAvailableItems()!;
        return this.items.filter(item => pool.includes(item.id));
      }
      return this.items.filter(item => !item.wizardOnly);
    }
    if (this.activeTab === 'weapons') return this.weapons;
    if (this.activeTab === 'recruit') return [];
    if (this.activeTab === 'roster') return [];
    if (this.activeTab === 'equipment') return [];
    if (this.activeTab === 'businesses') return this.getBusinessItems();
    if (this.activeTab === 'stocks') return this.getStockItems();
    return [];
  }

  // Recruit/Roster/Equipment tab state
  private recruitHoverCard: number = -1;
  private recruitRerollHover: boolean = false;
  private rosterHoverIndex: number = -1;
  private rosterHoverButton: string = '';
  private rosterScrollOffset: number = 0;
  private equipHoverIndex: number = -1;
  private equipHoverButton: string = '';
  private equipScrollOffset: number = 0;
  private selectedRecruitForEquip: number = -1;

  private getManagerChar(): ManagerCharacter | null {
    const mgr = this.activeCharacter as unknown as ManagerCharacter;
    if (!mgr || !mgr.getAvailablePool) return null;
    return mgr;
  }

  // Tier-1-only buy list; tier-2/3 come via the upgrade button on the grid.
  private getBusinessItems(): ShopItem[] {
    const cap = this.activeCharacter as unknown as CapitalistCharacter;
    if (!cap || !cap.getBusinessTypes) return [];
    const types = cap.getBusinessTypes();
    const atMax = cap.placedBusinesses ? cap.placedBusinesses.length >= 9 : false;
    return Object.entries(types)
      .filter(([_id, config]) => (config as StructureConfig).tier === 1 || !(config as StructureConfig).tier)
      .map(([id, config]) => {
        const cfg = config as StructureConfig;
        let desc = cfg.description || '';
        if (!desc) {
          desc = `HP:${cfg.health || 50} DMG:${cfg.damage || 1} Rate:${cfg.productionRate || 3}s`;
        }
        return {
          id,
          name: cfg.name,
          cost: cfg.cost || 0,
          description: desc,
          type: 'item' as const,
          owned: false,
          atMaxStacks: atMax,
          _businessType: true,
        };
      });
  }

  private getStockItems(): ShopItem[] {
    const cap = this.activeCharacter as unknown as CapitalistCharacter;
    if (!cap || !cap.getStockTypes) return [];
    const types = cap.getStockTypes();
    const owned = cap.stocks || [];
    return Object.entries(types).map(([id, config]) => {
      // Clearer descriptions — the old wording left mechanics ambiguous
      // ("but 50% chance to lose" didn't say "per wave").
      const conf = config as unknown as Record<string, number>;
      let desc = '';
      if (config.dividend) {
        desc = `+$${config.dividend} each wave you hold it.`;
      } else if (config.baseDividend) {
        desc = `+$${config.baseDividend} each wave; payout doubles every ${config.growthInterval || 5} waves held.`;
      } else if (config.payout) {
        const loseP = Math.round((config.loseChance || 0) * 100);
        desc = `Each wave: ${100 - loseP}% pays $${config.payout}, ${loseP}% it's lost forever.`;
      } else if (config.percentPayout) {
        desc = `Each wave: pays ${Math.round((config.percentPayout || 0) * 100)}% of the money you earned that wave.`;
      } else if (conf.bankPercentPayout) {
        desc = `Each wave: pays ${(conf.bankPercentPayout * 100).toFixed(0)}% of your current bank. The richer you are, the bigger it pays.`;
      } else if (conf.perStockDividend) {
        desc = `Each wave: pays $${conf.perStockDividend} per stock in your portfolio (including itself).`;
      }
      // Owned count for this stock type (multiple copies stack).
      const ownedCount = owned.filter(s => s.type === id).length;
      return {
        id,
        name: config.name,
        cost: config.cost,
        description: desc,
        type: 'item' as const,
        owned: false,
        ownedCount,
        _stockType: true,
      };
    });
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('keydown', this.handleKeyDown);

    if (this.activeCharacter) {
      const tabs = this.getTabs();
      this.maxWeapons = this.activeCharacter.getMaxWeapons();
      if (!tabs.includes(this.activeTab)) {
        this.activeTab = tabs[0];
      }
    }

    // Reset transient UI state so a re-entry doesn't resume at stale scroll /
    // hover / pending placement.
    this.scrollOffset = 0;
    this.hoveredItem = null;
    this.hoveredSellButton = null;
    this.hoveredUpgradeButton = null;
    this.bizPendingBuyId = null;
    this.bizSelectedCell = null;
    this.weaponsListScrollOffset = 0;
    this.weaponsHoveredOrbitId = null;
    this.weaponsHoveredListId = null;

    this.updateOwnership();
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.scrollbarDragging = false;
  }

  onMouseDown(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    const currentItems = this.getCurrentItems();
    if (currentItems.length <= layout.maxVisibleItems) return;

    // Scrollbar hit detection (slightly wider hit area)
    const sx = layout.scrollbarX - 3;
    const sw = layout.scrollbarWidth + 6;
    if (pos.x >= sx && pos.x <= sx + sw &&
        pos.y >= layout.contentY && pos.y <= layout.contentY + layout.contentHeight) {
      const scrollbarHeight = layout.contentHeight;
      const thumbHeight = Math.max(30, (layout.maxVisibleItems / currentItems.length) * scrollbarHeight);
      const maxThumbY = scrollbarHeight - thumbHeight;
      const thumbY = layout.contentY + (this.scrollOffset / Math.max(1, currentItems.length - layout.maxVisibleItems)) * maxThumbY;

      if (pos.y >= thumbY && pos.y <= thumbY + thumbHeight) {
        this.scrollbarDragging = true;
        this.scrollbarDragStartY = pos.y;
        this.scrollbarDragStartOffset = this.scrollOffset;
      } else {
        // Click on track: jump
        const targetFrac = (pos.y - layout.contentY - thumbHeight / 2) / maxThumbY;
        const maxScroll = Math.max(0, currentItems.length - layout.maxVisibleItems);
        this.scrollOffset = Math.max(0, Math.min(maxScroll, targetFrac * maxScroll));
      }
    }
  }

  onMouseUp(): void {
    this.scrollbarDragging = false;
  }

  onKeyDown(e: KeyboardEvent): void {
    const tabs = this.getTabs();
    if (tabs.length <= 1) return;
    const idx = tabs.indexOf(this.activeTab);
    let nextIdx = idx;
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + tabs.length) % tabs.length;
      e.preventDefault();
    } else {
      return;
    }
    if (nextIdx !== idx) {
      this.activeTab = tabs[nextIdx];
      this.scrollOffset = 0;
      // Clear ALL per-tab hover/pending state so a quick click after Tab
      // doesn't fire on a stale reference from the previous tab.
      this.clearAllTabHoverState();
      this.updateOwnership();
      if (this.soundSystem) this.soundSystem.play('buttonClick');
    }
  }

  /** Zero out every per-tab hover/pending field. Called on both mouse-click
   *  tab switch (to avoid stale hover triggering an unintended purchase) and
   *  keyboard tab-cycle, so behavior is identical regardless of input path. */
  private clearAllTabHoverState(): void {
    this.hoveredItem = null;
    this.hoveredSellButton = null;
    this.hoveredUpgradeButton = null;
    this.bizPendingBuyId = null;
    this.bizSelectedCell = null;
    this.bizHoveredAction = null;
    this.bizHoveredCell = null;
    this.bizHoveredListId = null;
    this.recruitHoverCard = -1;
    this.recruitRerollHover = false;
    this.rosterHoverIndex = -1;
    this.rosterHoverButton = '';
    this.equipHoverIndex = -1;
    this.equipHoverButton = '';
    this.weaponsHoveredOrbitId = null;
    this.weaponsHoveredListId = null;
  }

  updateOwnership(): void {
    const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
    this.weapons.forEach(weapon => {
      weapon.ownedCount = ownedWeapons.filter(w => w === weapon.id).length;
      weapon.owned = (weapon.ownedCount || 0) > 0;
    });

    const ownedItems = this.gameState.playerData.items || [];
    const itemStacks = this.gameState.playerData.itemStacks || {};

    this.items.forEach(item => {
      if (item.maxStacks && item.maxStacks > 1) {
        const currentStacks = itemStacks[item.id] || 0;
        item.owned = false;
        item.currentStacks = currentStacks;
        item.atMaxStacks = currentStacks >= item.maxStacks;
      } else {
        item.owned = ownedItems.includes(item.id);
      }
    });

    const ownedSpells = this.gameState.playerData.spells || [];
    const spellLevels = this.gameState.playerData.spellLevels || {};
    this.spells.forEach(spell => {
      spell.owned = ownedSpells.includes(spell.id);
      spell.level = (spellLevels as Record<string, number>)[spell.id] || 0;
    });
  }

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    this.lastMouseX = pos.x;
    this.lastMouseY = pos.y;

    // Scrollbar drag
    if (this.scrollbarDragging) {
      const currentItems = this.getCurrentItems();
      const scrollbarHeight = layout.contentHeight;
      const thumbHeight = Math.max(30, (layout.maxVisibleItems / currentItems.length) * scrollbarHeight);
      const maxThumbY = scrollbarHeight - thumbHeight;
      const maxScroll = Math.max(0, currentItems.length - layout.maxVisibleItems);
      const deltaY = pos.y - this.scrollbarDragStartY;
      const scrollDelta = maxThumbY > 0 ? (deltaY / maxThumbY) * maxScroll : 0;
      this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollbarDragStartOffset + scrollDelta));
      return;
    }

    // Scrollbar hover
    this.scrollbarHovered = false;
    const currentItemsForBar = this.getCurrentItems();
    if (currentItemsForBar.length > layout.maxVisibleItems) {
      const sx = layout.scrollbarX - 3;
      const sw = layout.scrollbarWidth + 6;
      if (pos.x >= sx && pos.x <= sx + sw &&
          pos.y >= layout.contentY && pos.y <= layout.contentY + layout.contentHeight) {
        this.scrollbarHovered = true;
      }
    }

    // Check back/continue button
    if (this.showContinueButton) {
      const btnW = 210;
      const btnH = 48;
      const btnX = this.canvas.logicalWidth - layout.padding - btnW;
      this.continueHovered = pos.x >= btnX && pos.x <= btnX + btnW &&
                             pos.y >= layout.continueButtonY &&
                             pos.y <= layout.continueButtonY + btnH;
      this.backHovered = false;
    } else {
      this.backHovered = pos.x >= layout.padding && pos.x <= layout.padding + 100 &&
                         pos.y >= layout.backButtonY && pos.y <= layout.backButtonY + 40;
      this.continueHovered = false;
    }

    // Check tabs
    const tabs = this.getTabs();
    this.hoveredTab = null;
    if (pos.y >= layout.tabsY && pos.y <= layout.tabsY + 40) {
      const tabWidth = 130;
      const totalTabWidth = tabs.length * tabWidth + (tabs.length - 1) * 10;
      const tabStartX = (this.canvas.logicalWidth - totalTabWidth) / 2;
      for (let i = 0; i < tabs.length; i++) {
        const tx = tabStartX + i * (tabWidth + 10);
        if (pos.x >= tx && pos.x <= tx + tabWidth) {
          this.hoveredTab = tabs[i];
          break;
        }
      }
    }

    // Custom tab hover handling
    if (this.activeTab === 'recruit') {
      this.onMoveRecruitTab(pos, layout);
      return;
    }
    if (this.activeTab === 'roster') {
      this.onMoveRosterTab(pos, layout);
      return;
    }
    if (this.activeTab === 'equipment') {
      this.onMoveEquipmentTab(pos, layout);
      return;
    }
    if (this.activeTab === 'businesses') {
      this.onMoveBusinessesTab(pos, layout);
      return;
    }
    if (this.activeTab === 'weapons' && this.activeCharacter && this.activeCharacter.getMaxWeapons() > 0) {
      this.onMoveWeaponsTab(pos, layout);
      return;
    }

    // Check item hover, sell button, and upgrade button hover
    this.hoveredItem = null;
    this.hoveredSellButton = null;
    this.hoveredUpgradeButton = null;
    const currentItems = this.getCurrentItems();
    const visibleStart = Math.floor(this.scrollOffset);
    const visibleEnd = Math.min(visibleStart + layout.maxVisibleItems, currentItems.length);

    for (let i = visibleStart; i < visibleEnd; i++) {
      const item = currentItems[i];
      const itemY = layout.contentY + (i - this.scrollOffset) * layout.itemHeight;

      // Check upgrade/sell button hover for owned equippables (weapons & spells)
      if (item.owned && (item.type === 'weapon' || item.type === 'spell')) {
        const info = this.getEquippableInfo(item);
        const rightEdge = layout.padding * 2 + layout.itemWidth;

        if (info.level < info.maxLevel) {
          const upgradeButtonX = rightEdge - 230;
          const upgradeButtonY = itemY + 46;
          if (pos.x >= upgradeButtonX && pos.x <= upgradeButtonX + 105 &&
              pos.y >= upgradeButtonY && pos.y <= upgradeButtonY + 26) {
            this.hoveredUpgradeButton = item;
            break;
          }
        }

        if (info.canSell) {
          const sellButtonX = rightEdge - 100;
          const sellButtonY = itemY + 46;
          if (pos.x >= sellButtonX && pos.x <= sellButtonX + 90 &&
              pos.y >= sellButtonY && pos.y <= sellButtonY + 26) {
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

  onClick(_e: MouseEvent): void {
    // Brief click flash animation
    this.clickFlashTime = performance.now();

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
      this.clearAllTabHoverState();
      this.updateOwnership();
      if (this.soundSystem) {
        this.soundSystem.play('buttonClick');
      }
      return;
    }

    if (this.activeTab === 'recruit') {
      this.onClickRecruitTab();
      return;
    }
    if (this.activeTab === 'roster') {
      this.onClickRosterTab();
      return;
    }
    if (this.activeTab === 'equipment') {
      this.onClickEquipmentTab();
      return;
    }
    if (this.activeTab === 'businesses') {
      this.onClickBusinessesTab();
      return;
    }
    if (this.activeTab === 'weapons' && this.activeCharacter && this.activeCharacter.getMaxWeapons() > 0) {
      this.onClickWeaponsTab();
      return;
    }

    if (this.hoveredUpgradeButton) {
      this.upgradeEquippable(this.hoveredUpgradeButton);
    } else if (this.hoveredSellButton) {
      this.sellEquippable(this.hoveredSellButton);
    } else if (this.hoveredItem && !this.hoveredItem.atMaxStacks) {
      if ((this.hoveredItem as ShopItem & { _businessType?: boolean })._businessType) {
        this.purchaseBusiness(this.hoveredItem);
      } else if ((this.hoveredItem as ShopItem & { _stockType?: boolean })._stockType) {
        this.purchaseStock(this.hoveredItem);
      } else if (this.hoveredItem.type === 'spell') {
        this.purchaseSpell(this.hoveredItem);
      } else if (this.hoveredItem.type === 'weapon' || !this.hoveredItem.owned) {
        this.purchaseItem(this.hoveredItem);
      }
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const scrollSpeed = 0.5;
    const delta = (e.deltaY > 0 ? 1 : -1) * scrollSpeed;

    if (this.activeTab === 'roster') {
      this.rosterScrollOffset = Math.max(0, Math.min(this.maxScroll, this.rosterScrollOffset + delta));
      return;
    }
    if (this.activeTab === 'equipment') {
      const mgr = this.getManagerChar();
      const rosterLen = mgr ? mgr.getRoster().length : 0;
      const maxEquipScroll = Math.max(0, rosterLen - 8);
      this.equipScrollOffset = Math.max(0, Math.min(maxEquipScroll, this.equipScrollOffset + delta));
      return;
    }

    // Businesses tab uses its own big-card layout (88px rows in a separate
    // right-side list), so its maxScroll cannot be derived from the generic
    // `maxVisibleItems` — that value is based on the standard item height and
    // was capping scroll before Radio Tower (the last tier-1 entry) ever
    // became visible, making it "unbuyable".
    const layout = this.getLayout();
    if (this.activeTab === 'businesses') {
      const bl = this.getBusinessesLayout(layout);
      const items = this.getBusinessItems();
      const headerH = 40;
      const ih = this.getBuyListItemHeight();
      const visibleCount = Math.max(1, Math.floor((bl.listH - headerH) / ih));
      const maxScroll = Math.max(0, items.length - visibleCount);
      this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + delta));
      return;
    }
    if (this.activeTab === 'weapons' && this.activeCharacter && this.activeCharacter.getMaxWeapons() > 0) {
      const wl = this.getWeaponsLayout(layout);
      const items = this.weapons;
      const headerH = 40;
      const ih = this.getWeaponsListItemHeight();
      const visibleCount = Math.max(1, Math.floor((wl.listH - headerH) / ih));
      const maxScroll = Math.max(0, items.length - visibleCount);
      this.weaponsListScrollOffset = Math.max(0, Math.min(maxScroll, this.weaponsListScrollOffset + delta));
      return;
    }
    const currentItems = this.getCurrentItems();
    const maxScroll = Math.max(0, currentItems.length - layout.maxVisibleItems);
    this.scrollOffset += delta;
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset));
  }

  getCurrentItemCost(item: ShopItem): number {
    const playerData = this.gameState.playerData;

    if (item.maxStacks && item.maxStacks > 1) {
      const itemStacks = playerData.itemStacks || {};
      const currentStacks = itemStacks[item.id] || 0;

      let multiplier = 2.0;

      if (item.cost <= 10) {
        multiplier = 1.8;
      } else if (item.cost <= 50) {
        multiplier = 2.0;
      } else if (item.cost >= 200) {
        multiplier = 2.5;
      }

      if (item.id === 'bounceHouse' && item.stackCostMultiplier) {
        multiplier = Math.max(2.0, item.stackCostMultiplier);
      }

      return Math.floor(item.cost * Math.pow(multiplier, currentStacks));
    }

    return item.cost;
  }

  purchaseItem(item: ShopItem): void {
    const playerData = this.gameState.playerData as PlayerData & Record<string, unknown>;

    // Check weapon limit
    if (item.type === 'weapon') {
      const ownedWeapons = playerData.weapons || ['pistol'];
      if (ownedWeapons.length >= this.maxWeapons) {
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

        if (item.maxStacks && item.maxStacks > 1) {
          if (!playerData.itemStacks[item.id]) {
            playerData.itemStacks[item.id] = 0;
          }

          if (playerData.itemStacks[item.id] >= item.maxStacks) {
            if (this.soundSystem) {
              this.soundSystem.play('purchaseFail');
            }
            return;
          }

          playerData.itemStacks[item.id]++;

          if (item.id === 'bounceHouse') {
            playerData.bounceHouseStacks = playerData.itemStacks[item.id];
          }

          if (!playerData.items.includes(item.id)) {
            playerData.items.push(item.id);
          }

          applyItemEffect(item.id, playerData as PlayerData);
        } else if (!playerData.items.includes(item.id)) {
          playerData.items.push(item.id);
          applyItemEffect(item.id, playerData as PlayerData);
        }
      }

      if (!item.maxStacks || item.maxStacks === 1) {
        item.owned = true;
      }

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

  getEquippableInfo(item: ShopItem): EquippableInfo {
    const playerData = this.gameState.playerData;
    if (item.type === 'spell') {
      const level = (playerData.spellLevels && (playerData.spellLevels as Record<string, number>)[item.id]) || 1;
      const maxLevel = item.id === 'magicMissile' ? 8 : 5;
      const upgradeCost = Math.floor(item.cost * level * 0.8) || 30;
      const inventory = playerData.spells || [];
      return { level, maxLevel, upgradeCost, canSell: inventory.length > 1 };
    }
    const level = (playerData.weaponLevels && playerData.weaponLevels[item.id]) || 1;
    const maxLevel = BALANCE.weaponUpgrades.maxLevel;
    const upgradeCost = Math.max(25, Math.floor(item.cost * level));
    const inventory = playerData.weapons || ['pistol'];
    return { level, maxLevel, upgradeCost, canSell: inventory.length > 1 };
  }

  sellEquippable(item: ShopItem): void {
    const playerData = this.gameState.playerData;
    const info = this.getEquippableInfo(item);
    if (!info.canSell) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }

    playerData.money += Math.floor(item.cost * 0.8);

    if (item.type === 'spell') {
      const spells = (playerData.spells as string[]) || [];
      const idx = spells.indexOf(item.id);
      if (idx !== -1) spells.splice(idx, 1);
      if (playerData.spellLevels) delete (playerData.spellLevels as Record<string, number>)[item.id];
    } else {
      const weapons = playerData.weapons || [];
      const idx = weapons.indexOf(item.id);
      if (idx !== -1) weapons.splice(idx, 1);
      if (!weapons.includes(item.id) && playerData.weaponLevels) {
        delete playerData.weaponLevels[item.id];
      }
    }

    this.updateOwnership();
    this.gameState.savePlayerData();
    if (this.soundSystem) this.soundSystem.play('sell');
  }

  upgradeEquippable(item: ShopItem): void {
    const playerData = this.gameState.playerData;
    const info = this.getEquippableInfo(item);
    if (info.level >= info.maxLevel) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    if (playerData.money < info.upgradeCost) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }

    playerData.money -= info.upgradeCost;
    if (item.type === 'spell') {
      if (!playerData.spellLevels) playerData.spellLevels = {};
      (playerData.spellLevels as Record<string, number>)[item.id] = info.level + 1;
    } else {
      if (!playerData.weaponLevels) playerData.weaponLevels = {};
      playerData.weaponLevels[item.id] = info.level + 1;
    }
    this.gameState.savePlayerData();
    if (this.soundSystem) this.soundSystem.play('upgrade');
  }

  purchaseSpell(spell: ShopItem): void {
    const playerData = this.gameState.playerData;
    if (spell.owned) return;
    if (playerData.money < spell.cost) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }

    playerData.money -= spell.cost;
    if (!playerData.spells) playerData.spells = [];
    if (!playerData.spellLevels) playerData.spellLevels = {};
    (playerData.spells as string[]).push(spell.id);
    (playerData.spellLevels as Record<string, number>)[spell.id] = 1;
    this.updateOwnership();
    this.gameState.savePlayerData();
    if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
  }

  // --- Recruit Tab: hire from random pool ---

  renderRecruitTab(ctx: CanvasRenderingContext2D, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const wave = this.gameState.currentLevel || 1;
    const pool = mgr.getAvailablePool(wave);
    const { RECRUIT_CLASSES, calculateRecruitCost, getEffectiveStats, MAX_ROSTER } = ManagerCharacter;

    const alive = mgr.getRoster().length;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = alive >= MAX_ROSTER ? '#FF4444' : '#4488CC';
    ctx.fillText(`Squad: ${alive}/${MAX_ROSTER}`, layout.padding, layout.contentY - 6);

    const cardW = 220;
    const cardH = 240;
    const gap = 15;
    const totalW = pool.length * cardW + (pool.length - 1) * gap;
    const startX = (this.canvas.logicalWidth - totalW) / 2;
    const cardY = layout.contentY + 10;

    for (let i = 0; i < pool.length; i++) {
      const recruit = pool[i];
      const cx = startX + i * (cardW + gap);
      const stats = getEffectiveStats(recruit);
      const cost = calculateRecruitCost(recruit);
      const classDef = RECRUIT_CLASSES[recruit.className];
      const hovered = this.recruitHoverCard === i;

      // Card background
      ctx.fillStyle = hovered ? 'rgba(100,150,255,0.12)' : 'rgba(30,30,40,0.8)';
      ctx.fillRect(cx, cardY, cardW, cardH);

      // Quality border
      const qColors: Record<string, string> = { common: '#666666', uncommon: '#44FF44', rare: '#4488FF', epic: '#AA44FF' };
      ctx.strokeStyle = qColors[recruit.quality] || '#666';
      ctx.lineWidth = recruit.quality === 'epic' ? 3 : 2;
      ctx.strokeRect(cx, cardY, cardW, cardH);

      // Quality label
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = qColors[recruit.quality] || '#888';
      ctx.fillText(recruit.quality.toUpperCase(), cx + 8, cardY + 16);

      // Class color dot
      ctx.fillStyle = classDef?.color || '#888';
      ctx.beginPath();
      ctx.arc(cx + cardW - 16, cardY + 12, 6, 0, Math.PI * 2);
      ctx.fill();

      // Name + Class
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`"${recruit.name}"`, cx + cardW / 2, cardY + 40);
      ctx.font = '13px monospace';
      ctx.fillStyle = classDef?.color || '#AAAAAA';
      ctx.fillText(classDef?.name || recruit.className, cx + cardW / 2, cardY + 58);

      // Stats
      const statY = cardY + 78;
      const statLabels = ['HP', 'DMG', 'SPD', 'RNG', 'ROF'];
      const statVals = [stats.health, stats.damage, stats.speed, stats.range, stats.fireRate];
      const statMaxes = [30, 5, 120, 350, 3];
      ctx.font = '11px monospace';
      for (let s = 0; s < statLabels.length; s++) {
        const sy = statY + s * 18;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888888';
        ctx.fillText(statLabels[s], cx + 10, sy + 11);
        // Bar
        const barX = cx + 45;
        const barW2 = 110;
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, sy + 2, barW2, 10);
        const pct = Math.min(1, statVals[s] / statMaxes[s]);
        ctx.fillStyle = classDef?.color || '#4488CC';
        ctx.fillRect(barX, sy + 2, barW2 * pct, 10);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#CCCCCC';
        // DMG and ROF are fractional; round to 1dp. Others are integer stats.
        const raw = statVals[s];
        const disp = (s === 1 || s === 4) ? (Math.round(raw * 10) / 10).toFixed(1) : String(Math.round(raw));
        ctx.fillText(disp, cx + cardW - 10, sy + 11);
      }

      // Trait
      if (recruit.trait) {
        const traitDef = RECRUIT_TRAITS[recruit.trait];
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`★ ${traitDef?.name || recruit.trait}: ${traitDef?.description || ''}`, cx + cardW / 2, cardY + 185);
      }

      // Weapon label
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText(`Weapon: ${classDef?.weaponLabel || '—'}`, cx + cardW / 2, cardY + 200);

      // Hire button
      const canAfford = this.gameState.playerData.money >= cost;
      const rosterFull = alive >= MAX_ROSTER;
      const btnY = cardY + cardH - 35;
      const btnW = cardW - 20;
      ctx.fillStyle = hovered && canAfford && !rosterFull ? '#1a3a1a' : '#0a1a0a';
      ctx.fillRect(cx + 10, btnY, btnW, 28);
      ctx.strokeStyle = rosterFull ? '#555' : (canAfford ? '#44FF44' : '#553333');
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 10, btnY, btnW, 28);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = rosterFull ? '#888' : (canAfford ? '#44FF44' : '#FF6666');
      const hireLabel = rosterFull
        ? 'ROSTER FULL'
        : (canAfford ? `> HIRE $${cost}` : `x HIRE $${cost}`);
      ctx.fillText(hireLabel, cx + cardW / 2, btnY + 19);
    }

    if (pool.length === 0) {
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText('All recruits hired! Check your roster.', this.canvas.logicalWidth / 2, cardY + 80);
    }

    // Reroll button
    const rerollCost = mgr.getCurrentRerollCost();
    const rerollY = cardY + cardH + 15;
    const rerollW = 200;
    const rerollX = (this.canvas.logicalWidth - rerollW) / 2;
    const canReroll = this.gameState.playerData.money >= rerollCost;
    ctx.fillStyle = this.recruitRerollHover && canReroll ? '#2a2a1a' : '#1a1a0a';
    ctx.fillRect(rerollX, rerollY, rerollW, 32);
    ctx.strokeStyle = canReroll ? '#FFD700' : '#553333';
    ctx.lineWidth = 2;
    ctx.strokeRect(rerollX, rerollY, rerollW, 32);
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = canReroll ? '#FFD700' : '#FF4444';
    ctx.fillText(`REROLL $${rerollCost}`, this.canvas.logicalWidth / 2, rerollY + 21);
  }

  onClickRecruitTab(): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const wave = this.gameState.currentLevel || 1;
    const pool = mgr.getAvailablePool(wave);

    if (this.recruitRerollHover) {
      const cost = mgr.getCurrentRerollCost();
      if (this.gameState.playerData.money >= cost) {
        this.gameState.playerData.money -= cost;
        mgr.rerollPool(wave);
        this.gameState.savePlayerData();
        if (this.soundSystem) this.soundSystem.play('buttonClick');
      } else {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
      }
      return;
    }

    if (this.recruitHoverCard >= 0 && this.recruitHoverCard < pool.length) {
      const recruit = pool[this.recruitHoverCard];
      const { calculateRecruitCost, MAX_ROSTER } = ManagerCharacter;
      const cost = calculateRecruitCost(recruit);
      if (mgr.getRoster().length >= MAX_ROSTER) {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
      if (this.gameState.playerData.money < cost) {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
      this.gameState.playerData.money -= cost;
      mgr.hireRecruit(recruit, this.gameState);
      this.gameState.savePlayerData();
      if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
    }
  }

  onMoveRecruitTab(pos: { x: number; y: number }, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const wave = this.gameState.currentLevel || 1;
    const pool = mgr.getAvailablePool(wave);

    this.recruitHoverCard = -1;
    this.recruitRerollHover = false;

    const cardW = 220;
    const cardH = 240;
    const gap = 15;
    const totalW = pool.length * cardW + (pool.length - 1) * gap;
    const startX = (this.canvas.logicalWidth - totalW) / 2;
    const cardY = layout.contentY + 10;

    for (let i = 0; i < pool.length; i++) {
      const cx = startX + i * (cardW + gap);
      if (pos.x >= cx && pos.x <= cx + cardW && pos.y >= cardY && pos.y <= cardY + cardH) {
        this.recruitHoverCard = i;
        break;
      }
    }

    // Reroll button
    const rerollY = cardY + cardH + 15;
    const rerollW = 200;
    const rerollX = (this.canvas.logicalWidth - rerollW) / 2;
    if (pos.x >= rerollX && pos.x <= rerollX + rerollW && pos.y >= rerollY && pos.y <= rerollY + 32) {
      this.recruitRerollHover = true;
    }
  }

  // --- Roster Tab: manage hired recruits ---

  private rosterFormationHover: FormationType | null = null;

  renderRosterTab(ctx: CanvasRenderingContext2D, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();
    const deadRoster = mgr.getDeadRoster();
    const synergies = mgr.getActiveSynergies();
    const formation = mgr.getFormation();
    const { RECRUIT_CLASSES, getEffectiveStats, getTrainingCost, getMaxTrainingLevel } = ManagerCharacter;
    const maxTrainLv = getMaxTrainingLevel();

    // Header: squad count + formation selector
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4488CC';
    ctx.fillText(`Squad: ${roster.length} alive`, layout.padding, layout.contentY - 6);

    // Formation buttons
    const formations: FormationType[] = ['spread', 'tight', 'vformation', 'circle'];
    const formLabels: Record<FormationType, string> = { spread: 'SPREAD', tight: 'TIGHT', vformation: 'V-FORM', circle: 'CIRCLE' };
    const formBtnW = 65;
    const formStartX = 180;
    for (let f = 0; f < formations.length; f++) {
      const fx = formStartX + f * (formBtnW + 6);
      const fy = layout.contentY - 18;
      const isActive = formation === formations[f];
      const isHover = this.rosterFormationHover === formations[f];
      ctx.fillStyle = isActive ? '#333366' : (isHover ? '#2a2a4a' : '#151528');
      ctx.fillRect(fx, fy, formBtnW, 20);
      ctx.strokeStyle = isActive ? '#6666FF' : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(fx, fy, formBtnW, 20);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isActive ? '#FFFFFF' : '#888';
      ctx.fillText(formLabels[formations[f]], fx + formBtnW / 2, fy + 14);
    }

    // Active synergies
    if (synergies.length > 0) {
      const synX = formStartX + formations.length * (formBtnW + 6) + 15;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      for (let s = 0; s < synergies.length; s++) {
        const syn = synergies[s];
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`[${syn.synergy.icon}] ${syn.synergy.name}`, synX, layout.contentY - 16 + s * 12);
      }
    }

    if (roster.length === 0 && deadRoster.length === 0) {
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText('No recruits yet. Visit the RECRUIT tab to hire!', this.canvas.logicalWidth / 2, layout.contentY + 60);
      return;
    }

    const rowH = 68;
    const startY = layout.contentY + 8;
    const rowW = this.canvas.logicalWidth - layout.padding * 4;
    const rowX = layout.padding * 2;
    const totalEntries = roster.length + (deadRoster.length > 0 ? 1 + Math.min(deadRoster.length, 5) : 0);
    const maxVisible = Math.floor(layout.contentHeight / rowH);
    this.maxScroll = Math.max(0, totalEntries - maxVisible);

    for (let i = 0; i < roster.length; i++) {
      const recruit = roster[i];
      const ry = startY + (i - this.rosterScrollOffset) * rowH;
      if (ry < layout.contentY - rowH || ry > layout.contentY + layout.contentHeight) continue;

      const stats = getEffectiveStats(recruit);
      const classDef = RECRUIT_CLASSES[recruit.className];
      const hovered = this.rosterHoverIndex === i;

      // Row background
      const qBg: Record<string, string> = { common: '#1a1a2a', uncommon: '#0f2a0f', rare: '#0f1a3a', epic: '#1f0f2f' };
      ctx.fillStyle = hovered ? 'rgba(100,150,255,0.15)' : (qBg[recruit.quality] || '#1a1a2a');
      ctx.fillRect(rowX, ry, rowW, rowH - 4);
      const qBorder: Record<string, string> = { common: '#666', uncommon: '#44FF44', rare: '#4488FF', epic: '#AA44FF' };
      ctx.strokeStyle = qBorder[recruit.quality] || '#666';
      ctx.lineWidth = recruit.quality === 'epic' ? 2 : 1;
      ctx.strokeRect(rowX, ry, rowW, rowH - 4);

      // Class color dot
      ctx.fillStyle = classDef?.color || '#888';
      ctx.beginPath();
      ctx.arc(rowX + 14, ry + 16, 5, 0, Math.PI * 2);
      ctx.fill();

      // Name + class + level
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`"${recruit.name}"`, rowX + 26, ry + 18);
      ctx.font = '11px monospace';
      ctx.fillStyle = classDef?.color || '#888';
      ctx.fillText(`${classDef?.name || recruit.className} Lv.${recruit.level}`, rowX + 26, ry + 33);

      // Stats + kills/waves
      ctx.font = '10px monospace';
      ctx.fillStyle = '#AAAAAA';
      // Round each for display so recruit stats never show float-drift tails
      // ("DMG:2.9999999" etc.) after item + trait + equipment compounding.
      ctx.fillText(`HP:${Math.round(stats.health)} DMG:${(Math.round(stats.damage * 10) / 10).toFixed(1)} SPD:${Math.round(stats.speed)}`, rowX + 26, ry + 46);
      ctx.fillStyle = '#888';
      ctx.fillText(`K:${recruit.kills || 0} W:${recruit.wavesLived || 0}`, rowX + 26, ry + 58);

      // Trait
      if (recruit.trait) {
        const traitDef = RECRUIT_TRAITS[recruit.trait];
        ctx.fillStyle = '#FFD700';
        ctx.font = '10px monospace';
        ctx.fillText(`★${traitDef?.name || recruit.trait}`, rowX + 180, ry + 46);
      }

      // Equipment indicator — show count, or first item name if only one equipped.
      if (recruit.equipment.length > 0) {
        ctx.fillStyle = '#00CCCC';
        ctx.font = '10px monospace';
        if (recruit.equipment.length === 1) {
          const equip = EQUIPMENT[recruit.equipment[0]];
          ctx.fillText(`[${equip?.name || recruit.equipment[0]}]`, rowX + 180, ry + 58);
        } else {
          ctx.fillText(`[${recruit.equipment.length} items]`, rowX + 180, ry + 58);
        }
      }

      // XP bar
      const xpBarX = rowX + 180;
      const xpBarW = 90;
      const xpBarY = ry + 8;
      const { xpForLevel } = ManagerCharacter;
      const nextXp = xpForLevel(recruit.level + 1);
      const currXp = recruit.xp || 0;
      const xpPct = recruit.level >= maxTrainLv ? 1 : Math.min(1, currXp / Math.max(1, nextXp));
      ctx.fillStyle = '#222';
      ctx.fillRect(xpBarX, xpBarY, xpBarW, 8);
      ctx.fillStyle = '#9966FF';
      ctx.fillRect(xpBarX, xpBarY, xpBarW * xpPct, 8);
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#CCAAFF';
      ctx.fillText(`XP:${currXp}/${nextXp}`, xpBarX, xpBarY + 18);

      // Behavior button
      const behaviorX = rowX + 300;
      const behaviorBtnW = 100;
      const isHoverBehavior = this.rosterHoverButton === `behavior_${i}`;
      ctx.fillStyle = isHoverBehavior ? '#2a2a4a' : '#151528';
      ctx.fillRect(behaviorX, ry + 4, behaviorBtnW, 22);
      ctx.strokeStyle = isHoverBehavior ? '#88AAFF' : '#5566AA';
      ctx.lineWidth = 1;
      ctx.strokeRect(behaviorX, ry + 4, behaviorBtnW, 22);
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6688FF';
      const bLabel = AI_BEHAVIORS[recruit.behavior]?.name || recruit.behavior;
      ctx.fillText(bLabel, behaviorX + behaviorBtnW / 2, ry + 18);

      // Train button
      const trainCost = getTrainingCost(recruit);
      const trainX = rowX + 420;
      const trainBtnW = 100;
      const isMaxLevel = recruit.level >= maxTrainLv;
      const canTrain = !isMaxLevel && this.gameState.playerData.money >= trainCost;
      const isHoverTrain = this.rosterHoverButton === `train_${i}`;
      ctx.fillStyle = isHoverTrain ? '#1a3a1a' : '#0a1a0a';
      ctx.fillRect(trainX, ry + 4, trainBtnW, 22);
      ctx.strokeStyle = isMaxLevel ? '#555' : (canTrain ? '#44FF44' : '#553333');
      ctx.lineWidth = 1;
      ctx.strokeRect(trainX, ry + 4, trainBtnW, 22);
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isMaxLevel ? '#888' : (canTrain ? '#44FF44' : '#FF6666');
      const trainLabel = isMaxLevel
        ? 'MAX LV'
        : (canTrain ? `> TRAIN $${trainCost}` : `x TRAIN $${trainCost}`);
      ctx.fillText(trainLabel, trainX + trainBtnW / 2, ry + 18);

      // Dismiss button
      const dismissX = rowX + 540;
      const dismissBtnW = 70;
      const isHoverDismiss = this.rosterHoverButton === `dismiss_${i}`;
      ctx.fillStyle = isHoverDismiss ? '#3a1a1a' : '#1a0a0a';
      ctx.fillRect(dismissX, ry + 4, dismissBtnW, 22);
      ctx.strokeStyle = isHoverDismiss ? '#FF4444' : '#553333';
      ctx.lineWidth = 1;
      ctx.strokeRect(dismissX, ry + 4, dismissBtnW, 22);
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FF4444';
      ctx.fillText('DISMISS', dismissX + dismissBtnW / 2, ry + 18);

      // Behavior description
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#778899';
      ctx.fillText(`AI: ${AI_BEHAVIORS[recruit.behavior]?.description || ''}`, behaviorX, ry + 44);
    }

    // Dead recruits memorial
    if (deadRoster.length > 0) {
      const memorialY = startY + (roster.length - this.rosterScrollOffset) * rowH + 10;
      if (memorialY < layout.contentY + layout.contentHeight) {
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#884444';
        ctx.fillText(`FALLEN (${deadRoster.length})`, rowX, memorialY);

        const recentDead = deadRoster.slice(-5).reverse();
        for (let d = 0; d < recentDead.length; d++) {
          const dr = recentDead[d];
          const dy = memorialY + 16 + d * 18;
          if (dy > layout.contentY + layout.contentHeight) break;
          const cls = RECRUIT_CLASSES[dr.className];
          ctx.font = '10px monospace';
          ctx.fillStyle = '#664444';
          ctx.fillText(`† "${dr.name}" - ${cls?.name || dr.className} Lv.${dr.level} (K:${dr.kills || 0})`, rowX + 10, dy);
        }
      }
    }
  }

  onClickRosterTab(): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();

    // Formation button clicks
    if (this.rosterFormationHover) {
      mgr.setFormation(this.rosterFormationHover, this.gameState);
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      return;
    }

    if (this.rosterHoverIndex < 0 || this.rosterHoverIndex >= roster.length) return;
    const recruit = roster[this.rosterHoverIndex];
    const maxTrainLv = ManagerCharacter.getMaxTrainingLevel();

    if (this.rosterHoverButton.startsWith('behavior_')) {
      const { getAllowedBehaviors } = ManagerCharacter;
      const allowed = getAllowedBehaviors(recruit.className);
      const currentIdx = allowed.indexOf(recruit.behavior);
      const nextBehavior = allowed[(currentIdx + 1) % allowed.length];
      mgr.setBehavior(recruit.uid, nextBehavior, this.gameState);
      if (this.soundSystem) this.soundSystem.play('buttonClick');
    } else if (this.rosterHoverButton.startsWith('train_')) {
      const { getTrainingCost } = ManagerCharacter;
      const cost = getTrainingCost(recruit);
      if (recruit.level >= maxTrainLv) return;
      if (this.gameState.playerData.money < cost) {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
      this.gameState.playerData.money -= cost;
      mgr.trainRecruitById(recruit.uid, this.gameState);
      if (this.soundSystem) this.soundSystem.play('upgrade');
    } else if (this.rosterHoverButton.startsWith('dismiss_')) {
      mgr.dismissRecruit(recruit.uid, this.gameState);
      this.selectedRecruitForEquip = -1;
      if (this.soundSystem) this.soundSystem.play('sell');
    }
  }

  onMoveRosterTab(pos: { x: number; y: number }, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();

    this.rosterHoverIndex = -1;
    this.rosterHoverButton = '';
    this.rosterFormationHover = null;

    // Formation buttons
    const formations: FormationType[] = ['spread', 'tight', 'vformation', 'circle'];
    const formBtnW = 65;
    const formStartX = 180;
    for (let f = 0; f < formations.length; f++) {
      const fx = formStartX + f * (formBtnW + 6);
      const fy = layout.contentY - 18;
      if (pos.x >= fx && pos.x <= fx + formBtnW && pos.y >= fy && pos.y <= fy + 20) {
        this.rosterFormationHover = formations[f];
        return;
      }
    }

    const rowH = 68;
    const startY = layout.contentY + 8;
    const rowW = this.canvas.logicalWidth - layout.padding * 4;
    const rowX = layout.padding * 2;

    for (let i = 0; i < roster.length; i++) {
      const ry = startY + (i - this.rosterScrollOffset) * rowH;
      if (ry < layout.contentY - rowH || ry > layout.contentY + layout.contentHeight) continue;
      if (pos.x >= rowX && pos.x <= rowX + rowW && pos.y >= ry && pos.y <= ry + rowH - 4) {
        this.rosterHoverIndex = i;

        const behaviorX = rowX + 300;
        if (pos.x >= behaviorX && pos.x <= behaviorX + 100 && pos.y >= ry + 4 && pos.y <= ry + 26) {
          this.rosterHoverButton = `behavior_${i}`;
        }
        const trainX = rowX + 420;
        if (pos.x >= trainX && pos.x <= trainX + 100 && pos.y >= ry + 4 && pos.y <= ry + 26) {
          this.rosterHoverButton = `train_${i}`;
        }
        const dismissX = rowX + 540;
        if (pos.x >= dismissX && pos.x <= dismissX + 70 && pos.y >= ry + 4 && pos.y <= ry + 26) {
          this.rosterHoverButton = `dismiss_${i}`;
        }
        break;
      }
    }
  }

  // --- Equipment Tab ---

  renderEquipmentTab(ctx: CanvasRenderingContext2D, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();
    const wave = this.gameState.currentLevel || 1;
    const { getAvailableEquipment, RECRUIT_CLASSES, EQUIPMENT: EQUIP_MAP } = ManagerCharacter;
    const available = getAvailableEquipment(wave);

    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00CCCC';
    ctx.fillText('Equipment', layout.padding, layout.contentY - 6);

    if (roster.length === 0) {
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText('Hire recruits first!', this.canvas.logicalWidth / 2, layout.contentY + 60);
      return;
    }

    const leftW = 240;
    const rightX = layout.padding * 2 + leftW + 20;
    const startY = layout.contentY + 8;
    const rowX = layout.padding * 2;

    // Left panel: recruit list
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888';
    ctx.fillText('SELECT RECRUIT:', rowX, startY);

    const recruitRowH = 32;
    for (let i = 0; i < roster.length; i++) {
      const ry = startY + 12 + (i - this.equipScrollOffset) * recruitRowH;
      if (ry < layout.contentY || ry > layout.contentY + layout.contentHeight - recruitRowH) continue;
      const r = roster[i];
      const cls = RECRUIT_CLASSES[r.className];
      const selected = this.selectedRecruitForEquip === i;
      const hovered = this.equipHoverIndex === i && this.equipHoverButton === 'recruit';

      ctx.fillStyle = selected ? '#333366' : (hovered ? 'rgba(100,150,255,0.12)' : '#1a1a2a');
      ctx.fillRect(rowX, ry, leftW, recruitRowH - 2);
      ctx.strokeStyle = selected ? '#6666FF' : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(rowX, ry, leftW, recruitRowH - 2);

      ctx.fillStyle = cls?.color || '#888';
      ctx.beginPath();
      ctx.arc(rowX + 12, ry + recruitRowH / 2 - 1, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFF';
      ctx.fillText(`"${r.name}" Lv.${r.level}`, rowX + 22, ry + 13);
      ctx.font = '9px monospace';
      const n = r.equipment.length;
      ctx.fillStyle = n > 0 ? '#00CCCC' : '#666';
      const label = n === 0
        ? 'No equipment'
        : n === 1
          ? (EQUIP_MAP[r.equipment[0]]?.name || r.equipment[0])
          : `${n} items equipped`;
      ctx.fillText(label, rowX + 22, ry + 24);
    }

    // Right panel: equipment shop for selected recruit. Each item can be bought
    // once per recruit; owned items show a SELL button (50% refund) — there is
    // no "unequip".
    if (this.selectedRecruitForEquip >= 0 && this.selectedRecruitForEquip < roster.length) {
      const recruit = roster[this.selectedRecruitForEquip];
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFF';
      ctx.fillText(`Equip "${recruit.name}":`, rightX, startY);

      const equipRowH = 48;
      const equipStartY = startY + 28;

      for (let e = 0; e < available.length; e++) {
        const eq = available[e];
        const ey = equipStartY + e * equipRowH;
        if (ey > layout.contentY + layout.contentHeight - equipRowH) break;

        const isEquipped = recruit.equipment.includes(eq.id);
        const canAfford = this.gameState.playerData.money >= eq.cost;
        const isHover = this.equipHoverIndex === e && this.equipHoverButton === 'equip';

        ctx.fillStyle = isEquipped ? 'rgba(0,200,200,0.1)' : (isHover ? 'rgba(100,150,255,0.1)' : '#1a1a2a');
        ctx.fillRect(rightX, ey, this.canvas.logicalWidth - rightX - layout.padding * 2, equipRowH - 4);
        ctx.strokeStyle = isEquipped ? '#00CCCC' : '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(rightX, ey, this.canvas.logicalWidth - rightX - layout.padding * 2, equipRowH - 4);

        // Type badge
        const typeBadgeColors: Record<string, string> = { weapon: '#FF4444', armor: '#4488FF', accessory: '#44FF44' };
        ctx.fillStyle = typeBadgeColors[eq.type] || '#888';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(eq.type.toUpperCase(), rightX + 6, ey + 12);

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = isEquipped ? '#00CCCC' : '#FFF';
        ctx.fillText(eq.name, rightX + 60, ey + 14);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#AAA';
        ctx.fillText(eq.description, rightX + 60, ey + 28);

        const btnX = this.canvas.logicalWidth - layout.padding * 2 - 100;
        if (!isEquipped) {
          // BUY button
          ctx.fillStyle = isHover && canAfford ? '#1a3a1a' : '#0a1a0a';
          ctx.fillRect(btnX, ey + 6, 90, 28);
          ctx.strokeStyle = canAfford ? '#44FF44' : '#553333';
          ctx.lineWidth = 1;
          ctx.strokeRect(btnX, ey + 6, 90, 28);
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = canAfford ? '#44FF44' : '#FF4444';
          ctx.fillText(`$${eq.cost}`, btnX + 45, ey + 24);
        } else {
          // SELL button (50% refund). Hover still tracked via equipHoverButton='equip'
          // since the row only has one action slot at a time.
          const refund = Math.floor(eq.cost * 0.5);
          ctx.fillStyle = isHover ? '#3a2a1a' : '#1a1a0a';
          ctx.fillRect(btnX, ey + 6, 90, 28);
          ctx.strokeStyle = isHover ? '#FFD700' : '#AA8800';
          ctx.lineWidth = 1;
          ctx.strokeRect(btnX, ey + 6, 90, 28);
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFD700';
          ctx.fillText(`SELL $${refund}`, btnX + 45, ey + 24);
        }
      }

      if (available.length === 0) {
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#888';
        ctx.fillText('No equipment unlocked yet', rightX + 150, equipStartY + 30);
      }
    } else {
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888';
      ctx.fillText('Select a recruit to equip', rightX, startY + 20);
    }
  }

  onClickEquipmentTab(): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();
    const wave = this.gameState.currentLevel || 1;
    const available = ManagerCharacter.getAvailableEquipment(wave);

    // Recruit selection
    if (this.equipHoverButton === 'recruit' && this.equipHoverIndex >= 0 && this.equipHoverIndex < roster.length) {
      this.selectedRecruitForEquip = this.equipHoverIndex;
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      return;
    }

    if (this.selectedRecruitForEquip < 0 || this.selectedRecruitForEquip >= roster.length) return;
    const recruit = roster[this.selectedRecruitForEquip];

    // Equipment row click: SELL if already owned, BUY otherwise. There is no
    // "unequip" — removing gear always goes through the sell path.
    if (this.equipHoverButton === 'equip' && this.equipHoverIndex >= 0 && this.equipHoverIndex < available.length) {
      const eq = available[this.equipHoverIndex];
      if (recruit.equipment.includes(eq.id)) {
        const refund = mgr.sellEquipment(recruit.uid, eq.id, this.gameState);
        this.gameState.savePlayerData();
        if (this.soundSystem) this.soundSystem.play(refund > 0 ? 'sell' : 'purchaseFail');
        return;
      }
      if (this.gameState.playerData.money < eq.cost) {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
      this.gameState.playerData.money -= eq.cost;
      mgr.equipItem(recruit.uid, eq.id, this.gameState);
      this.gameState.savePlayerData();
      if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
    }
  }

  onMoveEquipmentTab(pos: { x: number; y: number }, layout: ShopLayout): void {
    const mgr = this.getManagerChar();
    if (!mgr) return;
    const roster = mgr.getRoster();
    const wave = this.gameState.currentLevel || 1;
    const available = ManagerCharacter.getAvailableEquipment(wave);

    this.equipHoverIndex = -1;
    this.equipHoverButton = '';

    const leftW = 240;
    const rightX = layout.padding * 2 + leftW + 20;
    const startY = layout.contentY + 8;
    const rowX = layout.padding * 2;

    // Recruit list
    const recruitRowH = 32;
    for (let i = 0; i < roster.length; i++) {
      const ry = startY + 12 + (i - this.equipScrollOffset) * recruitRowH;
      if (pos.x >= rowX && pos.x <= rowX + leftW && pos.y >= ry && pos.y <= ry + recruitRowH - 2) {
        this.equipHoverIndex = i;
        this.equipHoverButton = 'recruit';
        return;
      }
    }

    // Equipment rows (unequip button removed — selling an equipped item uses
    // the per-row SELL button instead).
    if (this.selectedRecruitForEquip >= 0 && this.selectedRecruitForEquip < roster.length) {
      // Equipment items
      const equipRowH = 48;
      const equipStartY = startY + 28;
      for (let e = 0; e < available.length; e++) {
        const ey = equipStartY + e * equipRowH;
        const eW = this.canvas.logicalWidth - rightX - layout.padding * 2;
        if (pos.x >= rightX && pos.x <= rightX + eW && pos.y >= ey && pos.y <= ey + equipRowH - 4) {
          this.equipHoverIndex = e;
          this.equipHoverButton = 'equip';
          return;
        }
      }
    }
  }

  // Business cost multiplier: prefers character method (authoritative),
  // falls back to local item-check for robustness.
  private getBusinessCostMultiplier(): number {
    const cap = this.activeCharacter as unknown as CapitalistCharacter | null;
    if (cap && typeof cap.getBusinessCostMultiplier === 'function') {
      return cap.getBusinessCostMultiplier(this.gameState);
    }
    const items = this.gameState.playerData.items || [];
    return items.includes('venturCapital') ? 0.7 : 1.0;
  }

  // Click "BUY" in the tier-1 list → enter placement mode. Next empty-cell click places it.
  purchaseBusiness(item: ShopItem): void {
    const cap = this.activeCharacter as unknown as CapitalistCharacter;
    if (!cap || !cap.placeBusiness) return;
    if (cap.placedBusinesses && cap.placedBusinesses.length >= 9) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    const discount = this.getBusinessCostMultiplier();
    const actualCost = Math.floor(item.cost * discount);
    if (this.gameState.playerData.money < actualCost) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    this.bizPendingBuyId = item.id;
    if (this.soundSystem) this.soundSystem.play('buttonClick');
  }

  // ================= WEAPONS TAB (avatar loadout + buy list) =================
  //
  // Split view: owned weapons are rendered as colored glyphs orbiting a
  // character avatar on the left (clickable to sell). The right side lists
  // all available weapons with BUY buttons. Ownership / auto-positioning
  // logic is untouched — this is purely a visual presentation of what the
  // existing WeaponSystem already does at runtime.

  private getWeaponsLayout(layout: ShopLayout): {
    avatarPanelX: number; avatarPanelY: number; avatarPanelW: number; avatarPanelH: number;
    avatarCX: number; avatarCY: number; avatarR: number; orbitR: number;
    listX: number; listY: number; listW: number; listH: number;
  } {
    const pad = layout.padding;
    // Split the content area roughly 45% / 55% (avatar panel / buy list).
    const avatarPanelX = pad * 2;
    const avatarPanelY = layout.contentY + 10;
    const avatarPanelW = 340;
    // Cap against continue button (same rule as businesses tab).
    const bottomLimit = layout.continueButtonY - 16;
    const avatarPanelH = Math.max(300, bottomLimit - avatarPanelY);
    const avatarCX = avatarPanelX + avatarPanelW / 2;
    const avatarCY = avatarPanelY + avatarPanelH / 2 - 10; // nudge up for name label space
    const avatarR = 28;
    const orbitR = 110;
    const listX = avatarPanelX + avatarPanelW + 20;
    const listY = avatarPanelY;
    const listW = this.canvas.logicalWidth - listX - pad * 2;
    const listH = avatarPanelH;
    return { avatarPanelX, avatarPanelY, avatarPanelW, avatarPanelH,
             avatarCX, avatarCY, avatarR, orbitR,
             listX, listY, listW, listH };
  }

  /** Orbit slot position for a given weapon index. Matches visual convention
   *  of rotation-anchored-to-top, evenly spaced around the avatar. */
  private weaponOrbitPos(index: number, count: number, cx: number, cy: number, r: number): { x: number; y: number } {
    if (count <= 0) return { x: cx, y: cy };
    const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }

  private getWeaponsListItemHeight(): number { return 82; }

  /** Returns { x, y, r } for each currently-owned weapon glyph, in the order
   *  they appear in playerData.weapons. Used by both render and hit-test. */
  private getOwnedWeaponPositions(layout: ShopLayout): Array<{ id: string; x: number; y: number; r: number }> {
    const wl = this.getWeaponsLayout(layout);
    const owned = this.gameState.playerData.weapons || [];
    const out: Array<{ id: string; x: number; y: number; r: number }> = [];
    for (let i = 0; i < owned.length; i++) {
      const p = this.weaponOrbitPos(i, owned.length, wl.avatarCX, wl.avatarCY, wl.orbitR);
      out.push({ id: owned[i], x: p.x, y: p.y, r: 22 });
    }
    return out;
  }

  private renderWeaponsTab(ctx: CanvasRenderingContext2D, layout: ShopLayout): void {
    const wl = this.getWeaponsLayout(layout);
    const playerData = this.gameState.playerData;
    const ownedWeapons = playerData.weapons || [];
    const char = this.activeCharacter;
    const charColor = char ? char.getColor() : '#00FF00';

    // ---------- Left: avatar panel ----------
    // Panel background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(wl.avatarPanelX, wl.avatarPanelY, wl.avatarPanelW, wl.avatarPanelH);
    ctx.strokeStyle = '#262636';
    ctx.lineWidth = 1;
    ctx.strokeRect(wl.avatarPanelX, wl.avatarPanelY, wl.avatarPanelW, wl.avatarPanelH);

    // Header
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LOADOUT', wl.avatarPanelX + 10, wl.avatarPanelY + 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = ownedWeapons.length >= this.maxWeapons ? '#FF4444' : '#88FF88';
    ctx.fillText(`${ownedWeapons.length} / ${this.maxWeapons}`, wl.avatarPanelX + wl.avatarPanelW - 10, wl.avatarPanelY + 18);

    // Orbit circle (soft guide line)
    ctx.strokeStyle = 'rgba(100, 140, 100, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wl.avatarCX, wl.avatarCY, wl.orbitR, 0, Math.PI * 2);
    ctx.stroke();

    // Character avatar — filled square + colored helmet stripe as a simple crest.
    ctx.fillStyle = charColor;
    ctx.fillRect(wl.avatarCX - wl.avatarR, wl.avatarCY - wl.avatarR, wl.avatarR * 2, wl.avatarR * 2);
    ctx.strokeStyle = '#0a0a14';
    ctx.lineWidth = 2;
    ctx.strokeRect(wl.avatarCX - wl.avatarR, wl.avatarCY - wl.avatarR, wl.avatarR * 2, wl.avatarR * 2);
    // Helmet bar (small hat on top)
    ctx.fillStyle = '#1a6b1a';
    ctx.fillRect(wl.avatarCX - wl.avatarR * 0.7, wl.avatarCY - wl.avatarR - 6, wl.avatarR * 1.4, 6);
    // Character name below
    ctx.fillStyle = '#AAAAAA';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(char ? char.getName().toUpperCase() : 'PLAYER', wl.avatarCX, wl.avatarCY + wl.avatarR + 18);

    // Orbiting weapons — render the actual in-game weapon sprites, aimed outward
    // from the avatar like they do in play.
    const weaponCfgs = BALANCE.weapons as unknown as Record<string, Record<string, unknown>>;
    const positions = this.getOwnedWeaponPositions(layout);
    for (const slot of positions) {
      const cfg = weaponCfgs[slot.id];
      const color = (cfg?.color as string) || '#6699DD';
      const isHover = this.weaponsHoveredOrbitId === slot.id;
      // Connector line
      ctx.strokeStyle = 'rgba(100,140,100,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wl.avatarCX, wl.avatarCY);
      ctx.lineTo(slot.x, slot.y);
      ctx.stroke();
      // Slot background disc (subtle; emphasis is the sprite itself)
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, slot.r, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? 'rgba(80,20,20,0.75)' : 'rgba(16,20,32,0.75)';
      ctx.fill();
      ctx.strokeStyle = isHover ? '#FF6666' : color;
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.stroke();

      // Render the weapon's own sprite at this slot, aimed outward from avatar.
      let preview = this.weaponPreviewCache.get(slot.id);
      if (!preview) {
        preview = createWeapon(slot.id, 1);
        this.weaponPreviewCache.set(slot.id, preview);
      }
      const lvl = (playerData.weaponLevels && playerData.weaponLevels[slot.id]) || 1;
      preview.position = { x: slot.x, y: slot.y };
      preview.aimAngle = Math.atan2(slot.y - wl.avatarCY, slot.x - wl.avatarCX);
      // Suppress weapon animation states so the icon reads as a clean sprite.
      const p = preview as unknown as Record<string, unknown>;
      p.isSwinging = false; p.isWindingUp = false;
      ctx.save();
      try { (preview.render as (c: CanvasRenderingContext2D) => void)(ctx); } catch { /* ignore */ }
      ctx.restore();

      // Level badge (bottom-right)
      if (lvl > 1) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`L${lvl}`, slot.x + slot.r - 2, slot.y + slot.r - 2);
      }
    }

    // Hover tooltip near hovered weapon glyph
    if (this.weaponsHoveredOrbitId) {
      const hovered = positions.find(p => p.id === this.weaponsHoveredOrbitId);
      if (hovered) {
        const cfg = weaponCfgs[hovered.id];
        const name = (cfg?.name as string) || hovered.id;
        const sellPrice = Math.floor(((cfg?.cost as number) || 0) * 0.8);
        const canSell = ownedWeapons.length > 1;
        const lines = [
          name,
          canSell ? `Click to SELL for $${sellPrice}` : 'Cannot sell last weapon',
        ];
        const ttW = 170;
        const ttH = 6 + lines.length * 16;
        let ttX = hovered.x + hovered.r + 6;
        let ttY = hovered.y - ttH / 2;
        if (ttX + ttW > wl.avatarPanelX + wl.avatarPanelW) ttX = hovered.x - hovered.r - 6 - ttW;
        if (ttY < wl.avatarPanelY + 4) ttY = wl.avatarPanelY + 4;
        if (ttY + ttH > wl.avatarPanelY + wl.avatarPanelH - 4) ttY = wl.avatarPanelY + wl.avatarPanelH - ttH - 4;
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(ttX, ttY, ttW, ttH);
        ctx.strokeStyle = canSell ? '#FFD700' : '#666666';
        ctx.lineWidth = 1;
        ctx.strokeRect(ttX, ttY, ttW, ttH);
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(lines[0], ttX + 6, ttY + 14);
        ctx.font = '10px monospace';
        ctx.fillStyle = canSell ? '#FFD700' : '#AAAAAA';
        ctx.fillText(lines[1], ttX + 6, ttY + 30);
      }
    }

    // Empty state hint when no weapons beyond starter
    if (ownedWeapons.length === 0) {
      ctx.fillStyle = '#666666';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No weapons — buy one on the right', wl.avatarCX, wl.avatarPanelY + wl.avatarPanelH - 20);
    }

    // ---------- Right: buy list ----------
    const items = this.weapons;
    const ih = this.getWeaponsListItemHeight();
    const headerH = 28;
    const visibleH = wl.listH - headerH;
    const visibleCount = Math.max(1, Math.floor(visibleH / ih));
    const maxScroll = Math.max(0, items.length - visibleCount);
    this.weaponsListScrollOffset = Math.max(0, Math.min(maxScroll, this.weaponsListScrollOffset));

    // List header
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BUY WEAPONS', wl.listX, wl.listY + 18);

    // Clip list body
    ctx.save();
    ctx.beginPath();
    ctx.rect(wl.listX - 4, wl.listY + headerH - 2, wl.listW + 8, visibleH + 4);
    ctx.clip();

    const startIdx = Math.floor(this.weaponsListScrollOffset);
    for (let i = startIdx; i < Math.min(items.length, startIdx + visibleCount + 1); i++) {
      const item = items[i];
      const iy = wl.listY + headerH + (i - this.weaponsListScrollOffset) * ih;
      const cfg = weaponCfgs[item.id];
      const isOwned = (item.ownedCount || 0) > 0;
      const isHover = this.weaponsHoveredListId === item.id;
      const slotsFull = ownedWeapons.length >= this.maxWeapons;
      const canAfford = playerData.money >= item.cost;
      const canBuy = !slotsFull && canAfford;

      // Card
      ctx.fillStyle = isHover ? '#1a1a30' : (isOwned ? '#0e1e14' : '#0e0e1c');
      ctx.fillRect(wl.listX, iy, wl.listW, ih - 6);
      ctx.strokeStyle = isOwned ? '#44FF44' : (isHover ? '#6666FF' : '#262636');
      ctx.lineWidth = isOwned ? 2 : 1;
      ctx.strokeRect(wl.listX, iy, wl.listW, ih - 6);

      // Sprite preview box
      const spriteCX = wl.listX + 22;
      const spriteCY = iy + (ih - 6) / 2;
      ctx.fillStyle = 'rgba(10,10,20,0.9)';
      ctx.fillRect(spriteCX - 16, spriteCY - 16, 32, 32);
      ctx.strokeStyle = (cfg?.color as string) || '#444466';
      ctx.lineWidth = 1;
      ctx.strokeRect(spriteCX - 16, spriteCY - 16, 32, 32);
      let listPreview = this.weaponPreviewCache.get(item.id);
      if (!listPreview) {
        listPreview = createWeapon(item.id, 1);
        this.weaponPreviewCache.set(item.id, listPreview);
      }
      listPreview.position = { x: spriteCX, y: spriteCY };
      listPreview.aimAngle = 0;
      const lp = listPreview as unknown as Record<string, unknown>;
      lp.isSwinging = false; lp.isWindingUp = false;
      ctx.save();
      try { (listPreview.render as (c: CanvasRenderingContext2D) => void)(ctx); } catch { /* ignore */ }
      ctx.restore();

      // Name + level (if owned)
      ctx.fillStyle = isOwned ? '#AAFFAA' : '#FFFFFF';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      const lvl = (playerData.weaponLevels && playerData.weaponLevels[item.id]) || 1;
      const nameTxt = isOwned ? `${item.name} Lv${lvl}` : item.name;
      ctx.fillText(nameTxt, wl.listX + 48, iy + 22);

      // Cost or OWNED label
      ctx.textAlign = 'right';
      if (isOwned) {
        ctx.fillStyle = '#44FF44';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('OWNED', wl.listX + wl.listW - 10, iy + 22);
      } else {
        ctx.fillStyle = canAfford ? '#FFD700' : '#AA4444';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`$${item.cost}`, wl.listX + wl.listW - 10, iy + 22);
      }

      // Description (truncated)
      ctx.fillStyle = '#888888';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      const desc = item.description || '';
      ctx.fillText(desc.length > 56 ? desc.slice(0, 53) + '...' : desc, wl.listX + 48, iy + 42);

      // Buy button (only if not owned)
      if (!isOwned) {
        const btnW = 64, btnH = 22;
        const btnX = wl.listX + wl.listW - btnW - 8;
        const btnY = iy + ih - btnH - 12;
        ctx.fillStyle = isHover && canBuy ? '#1a3a1a' : '#0a2a0a';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.strokeStyle = canBuy ? '#44FF44' : '#553333';
        ctx.lineWidth = 2;
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = canBuy ? '#44FF44' : '#FF6666';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(slotsFull ? 'FULL' : 'BUY', btnX + btnW / 2, btnY + 15);
      } else {
        // Sell hint for owned weapons on the right side
        ctx.fillStyle = '#AA8800';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('sell from loadout ←', wl.listX + wl.listW - 10, iy + ih - 14);
      }
    }
    ctx.restore();

    // Scroll indicator
    if (items.length > visibleCount) {
      const trackX = wl.listX + wl.listW + 4;
      const trackY = wl.listY + headerH;
      const trackH = visibleH;
      ctx.fillStyle = '#14141e';
      ctx.fillRect(trackX, trackY, 4, trackH);
      const thumbH = Math.max(20, (visibleCount / items.length) * trackH);
      const thumbY = trackY + (this.weaponsListScrollOffset / Math.max(1, items.length - visibleCount)) * (trackH - thumbH);
      ctx.fillStyle = '#666666';
      ctx.fillRect(trackX, thumbY, 4, thumbH);
    }
  }

  private onMoveWeaponsTab(pos: { x: number; y: number }, layout: ShopLayout): void {
    this.weaponsHoveredOrbitId = null;
    this.weaponsHoveredListId = null;

    // Orbit weapon hit-test — circular bounds against each glyph's rect.
    const positions = this.getOwnedWeaponPositions(layout);
    for (const slot of positions) {
      if (pos.x >= slot.x - slot.r && pos.x <= slot.x + slot.r &&
          pos.y >= slot.y - slot.r && pos.y <= slot.y + slot.r) {
        this.weaponsHoveredOrbitId = slot.id;
        return; // avatar side wins over list if overlapping
      }
    }

    // Buy list hit-test
    const wl = this.getWeaponsLayout(layout);
    const items = this.weapons;
    const ih = this.getWeaponsListItemHeight();
    const headerH = 28;
    const visibleCount = Math.max(1, Math.floor((wl.listH - headerH) / ih));
    const startIdx = Math.floor(this.weaponsListScrollOffset);
    for (let i = startIdx; i < Math.min(items.length, startIdx + visibleCount + 1); i++) {
      const iy = wl.listY + headerH + (i - this.weaponsListScrollOffset) * ih;
      if (pos.x >= wl.listX && pos.x <= wl.listX + wl.listW &&
          pos.y >= iy && pos.y <= iy + ih - 6) {
        this.weaponsHoveredListId = items[i].id;
        return;
      }
    }
  }

  private onClickWeaponsTab(): void {
    // Click on avatar weapon → sell.
    if (this.weaponsHoveredOrbitId) {
      const item = this.weapons.find(w => w.id === this.weaponsHoveredOrbitId);
      if (item) this.sellEquippable(item);
      return;
    }
    // Click on list card → buy (if not owned, affordable, slots available).
    if (this.weaponsHoveredListId) {
      const item = this.weapons.find(w => w.id === this.weaponsHoveredListId);
      if (!item) return;
      const owned = (this.gameState.playerData.weapons || []).length;
      if ((item.ownedCount || 0) > 0) {
        // Clicking an owned weapon in the list is a no-op (sell happens on the
        // avatar). Play a soft fail so the player knows the input registered.
        if (this.soundSystem) this.soundSystem.play('buttonClick');
        return;
      }
      if (owned >= this.maxWeapons) {
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
      this.purchaseItem(item);
    }
  }

  // ================= BUSINESSES TAB (grid + buy list) =================

  private getBusinessesLayout(layout: ShopLayout): {
    gridX: number; gridY: number; gridW: number; gridH: number; cellSize: number;
    listX: number; listY: number; listW: number; listH: number;
  } {
    const pad = layout.padding;
    const cellSize = 110;
    const gridW = cellSize * 3;
    const gridH = cellSize * 3;
    const gridX = pad * 2;
    const gridY = layout.contentY + 10;
    const listX = gridX + gridW + 24;
    const listY = gridY;
    const listW = this.canvas.logicalWidth - listX - pad * 2;
    // Cap the company-list height so it never overlaps the CONTINUE button.
    // Previously listH = contentHeight - 20 which ran past continueButtonY and
    // drew the tail of the company list on top of the CTA.
    const bottomLimit = layout.continueButtonY - 16;
    const listH = Math.max(120, bottomLimit - listY);
    return { gridX, gridY, gridW, gridH, cellSize, listX, listY, listW, listH };
  }

  private cellAt(pos: { x: number; y: number }, bl: ReturnType<ShopScreen['getBusinessesLayout']>): { gx: number; gy: number } | null {
    if (pos.x < bl.gridX || pos.x > bl.gridX + bl.gridW) return null;
    if (pos.y < bl.gridY || pos.y > bl.gridY + bl.gridH) return null;
    const gx = Math.floor((pos.x - bl.gridX) / bl.cellSize);
    const gy = Math.floor((pos.y - bl.gridY) / bl.cellSize);
    if (gx < 0 || gx > 2 || gy < 0 || gy > 2) return null;
    return { gx, gy };
  }

  private getBuyListItemHeight(): number { return 88; }

  private onMoveBusinessesTab(pos: { x: number; y: number }, layout: ShopLayout): void {
    const bl = this.getBusinessesLayout(layout);
    this.bizHoveredCell = this.cellAt(pos, bl);
    this.bizHoveredListId = null;
    this.bizHoveredAction = null;

    // Hover: sell/upgrade buttons on selected cell
    const cap = this.activeCharacter as unknown as CapitalistCharacter | null;
    if (cap && this.bizSelectedCell) {
      const { gx, gy } = this.bizSelectedCell;
      const cx = bl.gridX + gx * bl.cellSize;
      const cy = bl.gridY + gy * bl.cellSize;
      const btnW = 50, btnH = 20;
      const sellX = cx + 4, sellY = cy + bl.cellSize - btnH - 4;
      const upX = cx + bl.cellSize - btnW - 4, upY = cy + bl.cellSize - btnH - 4;
      if (pos.x >= sellX && pos.x <= sellX + btnW && pos.y >= sellY && pos.y <= sellY + btnH) {
        this.bizHoveredAction = 'sell';
        return;
      }
      if (pos.x >= upX && pos.x <= upX + btnW && pos.y >= upY && pos.y <= upY + btnH) {
        this.bizHoveredAction = 'upgrade';
        return;
      }
    }

    // Hover: buy-list cards
    const items = this.getBusinessItems();
    const ih = this.getBuyListItemHeight();
    const visibleCount = Math.floor(bl.listH / ih);
    const startIdx = Math.floor(this.scrollOffset);
    for (let i = startIdx; i < Math.min(items.length, startIdx + visibleCount + 1); i++) {
      const iy = bl.listY + 40 + (i - this.scrollOffset) * ih;
      if (pos.x >= bl.listX && pos.x <= bl.listX + bl.listW && pos.y >= iy && pos.y <= iy + ih - 6) {
        this.bizHoveredListId = items[i].id;
        return;
      }
    }
  }

  private onClickBusinessesTab(): void {
    const layout = this.getLayout();
    const bl = this.getBusinessesLayout(layout);
    const cap = this.activeCharacter as unknown as CapitalistCharacter | null;
    if (!cap) return;

    // Sell / Upgrade buttons
    if (this.bizHoveredAction && this.bizSelectedCell) {
      const { gx, gy } = this.bizSelectedCell;
      if (this.bizHoveredAction === 'sell') {
        const ok = cap.sellBusiness(gx, gy, this.gameState);
        if (ok) {
          this.bizSelectedCell = null;
          this.spawnBizFx(bl, gx, gy, '#FF8844');
          if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
        } else {
          if (this.soundSystem) this.soundSystem.play('purchaseFail');
        }
        return;
      }
      if (this.bizHoveredAction === 'upgrade') {
        const types = cap.getBusinessTypes();
        const grid = cap.getGrid();
        const entry = grid[gy][gx];
        if (entry) {
          const cfg = types[entry.type];
          if (cfg && cfg.upgradesTo) {
            const nextCfg = types[cfg.upgradesTo];
            if (nextCfg) {
              const upCost = Math.floor((nextCfg.cost || 0) * this.getBusinessCostMultiplier());
              if (this.gameState.playerData.money >= upCost) {
                const ok = cap.upgradeBusiness(gx, gy, this.gameState);
                if (ok) {
                  this.spawnBizFx(bl, gx, gy, '#FFD700');
                  if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
                }
                return;
              }
            }
          }
        }
        if (this.soundSystem) this.soundSystem.play('purchaseFail');
        return;
      }
    }

    // Grid cell click
    if (this.bizHoveredCell) {
      const { gx, gy } = this.bizHoveredCell;
      const grid = cap.getGrid();
      const entry = grid[gy][gx];
      if (entry) {
        // Select filled cell
        this.bizSelectedCell = { gx, gy };
        return;
      } else {
        // Empty cell: if pending buy, commit purchase.
        if (this.bizPendingBuyId) {
          const types = cap.getBusinessTypes();
          const cfg = types[this.bizPendingBuyId];
          if (!cfg) {
            this.bizPendingBuyId = null;
            return;
          }
          const discount = this.getBusinessCostMultiplier();
          const actualCost = Math.floor((cfg.cost || 0) * discount);
          if (this.gameState.playerData.money < actualCost) {
            if (this.soundSystem) this.soundSystem.play('purchaseFail');
            return;
          }
          this.gameState.playerData.money -= actualCost;
          cap.placeBusiness(this.bizPendingBuyId, gx, gy, this.gameState);
          this.spawnBizFx(bl, gx, gy, '#44FF88');
          if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
          this.bizPendingBuyId = null;
          return;
        }
        this.bizSelectedCell = null;
      }
      return;
    }

    // Buy-list card click → enter placement mode.
    if (this.bizHoveredListId) {
      const items = this.getBusinessItems();
      const item = items.find(i => i.id === this.bizHoveredListId);
      if (item) this.purchaseBusiness(item);
      return;
    }
  }

  private spawnBizFx(_bl: ReturnType<ShopScreen['getBusinessesLayout']>, _gx: number, _gy: number, _color: string): void {
    // Shop has no effects system; flash via the click-flash timer + sound.
    this.clickFlashTime = performance.now();
  }

  private renderBusinessesTab(ctx: CanvasRenderingContext2D, layout: ShopLayout): void {
    const bl = this.getBusinessesLayout(layout);
    const cap = this.activeCharacter as unknown as CapitalistCharacter | null;
    if (!cap) return;
    const types = cap.getBusinessTypes();
    const grid = cap.getGrid();
    const bonuses = cap.computeAdjacencyBonuses();

    // Grid background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(bl.gridX, bl.gridY, bl.gridW, bl.gridH);

    // Compute cells that synergize with selected/hovered.
    const focus = this.bizSelectedCell || this.bizHoveredCell;
    const focusedNeighbors = new Set<string>();
    if (focus) {
      const f = grid[focus.gy][focus.gx];
      const fCfg = f ? types[f.type] : null;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = focus.gx + dx, ny = focus.gy + dy;
        if (nx < 0 || nx > 2 || ny < 0 || ny > 2) continue;
        const n = grid[ny][nx];
        if (!n) continue;
        const nCfg = types[n.type];
        const syn =
          (fCfg && (fCfg.synergiesWith || []).includes(n.type)) ||
          (nCfg && f && (nCfg.synergiesWith || []).includes(f.type)) ||
          (nCfg && nCfg.productionAura) ||
          (fCfg && fCfg.productionAura);
        if (syn) focusedNeighbors.add(`${nx},${ny}`);
      }
    }

    // Cells
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const cx = bl.gridX + gx * bl.cellSize;
        const cy = bl.gridY + gy * bl.cellSize;
        const entry = grid[gy][gx];
        const isSelected = !!this.bizSelectedCell && this.bizSelectedCell.gx === gx && this.bizSelectedCell.gy === gy;
        const isHovered = !!this.bizHoveredCell && this.bizHoveredCell.gx === gx && this.bizHoveredCell.gy === gy;
        const isSynergy = focusedNeighbors.has(`${gx},${gy}`);

        // Cell body
        if (entry) {
          ctx.fillStyle = isSelected ? '#1f2a44' : (isHovered ? '#17203a' : '#121a2c');
          ctx.fillRect(cx + 2, cy + 2, bl.cellSize - 4, bl.cellSize - 4);
        } else {
          // Empty — dashed border, hint if in placement mode
          const hintable = !!this.bizPendingBuyId && isHovered;
          ctx.fillStyle = hintable ? '#0f2a14' : '#080b14';
          ctx.fillRect(cx + 2, cy + 2, bl.cellSize - 4, bl.cellSize - 4);
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = hintable ? '#44FF88' : '#333344';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 4, cy + 4, bl.cellSize - 8, bl.cellSize - 8);
          ctx.restore();
        }

        // Border
        ctx.strokeStyle = isSelected ? '#FFD700' : (isSynergy ? 'rgba(120,255,180,0.7)' : (isHovered ? '#6666FF' : '#262636'));
        ctx.lineWidth = isSelected ? 3 : (isSynergy ? 2 : 1);
        ctx.strokeRect(cx + 2, cy + 2, bl.cellSize - 4, bl.cellSize - 4);

        if (entry) {
          const cfg = types[entry.type];
          // Icon: color box mid-cell
          const bx = cx + bl.cellSize / 2 - 20;
          const by = cy + 28;
          ctx.fillStyle = cfg?.color || '#FFAA00';
          ctx.fillRect(bx, by, 40, 40);
          ctx.strokeStyle = (cfg?.tier === 3) ? '#FFD700' : ((cfg?.tier === 2) ? '#CCCCFF' : '#FFFFFF');
          ctx.lineWidth = cfg?.tier === 3 ? 2 : 1;
          ctx.strokeRect(bx, by, 40, 40);

          // Name
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(cfg?.name || entry.type, cx + bl.cellSize / 2, cy + 18);
          // Tier pip
          const pip = cfg?.tier === 3 ? 'III' : (cfg?.tier === 2 ? 'II' : 'I');
          ctx.fillStyle = cfg?.tier === 3 ? '#FFD700' : (cfg?.tier === 2 ? '#CCCCFF' : '#8888AA');
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(pip, cx + bl.cellSize - 8, cy + 14);

          // Adjacency bonus readout
          const b = bonuses.get(`${gx},${gy}`);
          if (b && (b.production > 0 || b.damage > 0)) {
            ctx.fillStyle = '#8AFFB0';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'left';
            const prodPct = Math.round(b.production * 100);
            const dmgPct = Math.round(b.damage * 100);
            const txt = dmgPct > 0 ? `+${prodPct}% P +${dmgPct}% D` : `+${prodPct}% Prod`;
            ctx.fillText(txt, cx + 6, cy + bl.cellSize - 24);
          }

          // Selected → SELL / UPGRADE buttons
          if (isSelected) {
            const sellPrice = Math.floor(((cfg?.cost || 0) * (cfg?.sellValueFraction ?? 0.5)));
            const btnW = 50, btnH = 20;
            const sellX = cx + 4, sellY = cy + bl.cellSize - btnH - 4;
            ctx.fillStyle = this.bizHoveredAction === 'sell' ? '#3a1a1a' : '#2a1010';
            ctx.fillRect(sellX, sellY, btnW, btnH);
            ctx.strokeStyle = this.bizHoveredAction === 'sell' ? '#FF8844' : '#AA6633';
            ctx.lineWidth = 1;
            ctx.strokeRect(sellX, sellY, btnW, btnH);
            ctx.fillStyle = '#FFAA66';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`$${sellPrice}`, sellX + btnW / 2, sellY + 14);
            ctx.fillStyle = '#AA6633';
            ctx.font = 'bold 8px monospace';
            ctx.fillText('SELL', sellX + btnW / 2, sellY + 6);

            if (cfg?.upgradesTo) {
              const nextCfg = types[cfg.upgradesTo];
              if (nextCfg) {
                const upCost = Math.floor((nextCfg.cost || 0) * this.getBusinessCostMultiplier());
                const canAfford = this.gameState.playerData.money >= upCost;
                const upX = cx + bl.cellSize - btnW - 4, upY = cy + bl.cellSize - btnH - 4;
                ctx.fillStyle = this.bizHoveredAction === 'upgrade' ? '#2a2a00' : '#14140a';
                ctx.fillRect(upX, upY, btnW, btnH);
                ctx.strokeStyle = this.bizHoveredAction === 'upgrade' ? '#FFD700' : (canAfford ? '#AA8800' : '#553300');
                ctx.lineWidth = 1;
                ctx.strokeRect(upX, upY, btnW, btnH);
                ctx.fillStyle = canAfford ? '#FFD700' : '#884444';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`$${upCost}`, upX + btnW / 2, upY + 14);
                ctx.fillStyle = '#AA8800';
                ctx.font = 'bold 8px monospace';
                ctx.fillText('UPG', upX + btnW / 2, upY + 6);
              }
            }
          }
        }
      }
    }

    // Grid title + money
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    const count = cap.placedBusinesses.length;
    ctx.fillText(`3x3 Grid   ${count}/9`, bl.gridX, bl.gridY - 12);

    // Right-panel buy list
    const listX = bl.listX, listY = bl.listY;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${this.gameState.playerData.money}`, listX, listY + 14);
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '11px monospace';
    if (this.bizPendingBuyId) {
      const pendingCfg = types[this.bizPendingBuyId];
      ctx.fillStyle = '#44FF88';
      ctx.fillText(`PLACING: ${pendingCfg?.name || this.bizPendingBuyId} — click empty cell`, listX, listY + 30);
    } else {
      ctx.fillText('Click BUY → then click an empty cell to place.', listX, listY + 30);
    }

    // Buy list (tier-1 only)
    const items = this.getBusinessItems();
    const ih = this.getBuyListItemHeight();
    const headerH = 40;
    const visibleH = bl.listH - headerH;
    const visibleCount = Math.floor(visibleH / ih);
    const maxScroll = Math.max(0, items.length - visibleCount);
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset));

    // Clip the list vertically
    ctx.save();
    ctx.beginPath();
    ctx.rect(listX - 4, listY + headerH - 2, bl.listW + 8, visibleH + 4);
    ctx.clip();

    const startIdx = Math.floor(this.scrollOffset);
    for (let i = startIdx; i < Math.min(items.length, startIdx + visibleCount + 1); i++) {
      const item = items[i];
      const iy = listY + headerH + (i - this.scrollOffset) * ih;
      const cfg = types[item.id];
      const discount = this.getBusinessCostMultiplier();
      const actualCost = Math.floor((cfg?.cost || 0) * discount);
      const canAfford = this.gameState.playerData.money >= actualCost;
      const isHover = this.bizHoveredListId === item.id;
      const isPending = this.bizPendingBuyId === item.id;

      // Card background
      ctx.fillStyle = isPending ? '#0f2a14' : (isHover ? '#1a1a30' : '#0e0e1c');
      ctx.fillRect(listX, iy, bl.listW, ih - 6);
      ctx.strokeStyle = isPending ? '#44FF88' : (isHover ? '#6666FF' : '#262636');
      ctx.lineWidth = isPending ? 2 : 1;
      ctx.strokeRect(listX, iy, bl.listW, ih - 6);

      // Color swatch
      ctx.fillStyle = cfg?.color || '#FFAA00';
      ctx.fillRect(listX + 8, iy + 10, 18, 18);

      // Name
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(cfg?.name || item.name, listX + 32, iy + 22);

      // Cost
      ctx.fillStyle = canAfford ? '#FFD700' : '#AA4444';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`$${actualCost}`, listX + bl.listW - 70, iy + 22);

      // Description
      ctx.fillStyle = '#AAAAAA';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      const desc = cfg?.description || item.description;
      ctx.fillText(desc.length > 54 ? desc.slice(0, 51) + '...' : desc, listX + 8, iy + 42);

      // Synergy hint
      if (cfg?.synergiesWith && cfg.synergiesWith.length > 0) {
        const hintType = cfg.synergiesWith[0];
        const hintCfg = types[hintType];
        if (hintCfg) {
          ctx.fillStyle = '#8AFFB0';
          ctx.font = '10px monospace';
          ctx.fillText(`pairs with ${hintCfg.name}`, listX + 8, iy + 58);
        }
      } else if (cfg?.passiveIncome) {
        ctx.fillStyle = '#FFD700';
        ctx.font = '10px monospace';
        ctx.fillText(`+$${cfg.passiveIncome}/wave passive`, listX + 8, iy + 58);
      } else if (cfg?.productionAura) {
        ctx.fillStyle = '#7DF0F2';
        ctx.font = '10px monospace';
        ctx.fillText(`+${Math.round(cfg.productionAura * 100)}% production to neighbors`, listX + 8, iy + 58);
      } else if (cfg?.stockDividendBonus) {
        ctx.fillStyle = '#FF85B8';
        ctx.font = '10px monospace';
        ctx.fillText(`+${Math.round(cfg.stockDividendBonus * 100)}% stock dividends`, listX + 8, iy + 58);
      }

      // BUY button
      const btnW = 56, btnH = 22;
      const bxBtn = listX + bl.listW - btnW - 8;
      const byBtn = iy + ih - btnH - 12;
      ctx.fillStyle = isPending ? '#1a5a2a' : (isHover ? '#1a3a1a' : '#0a2a0a');
      ctx.fillRect(bxBtn, byBtn, btnW, btnH);
      ctx.strokeStyle = isHover ? '#44FF44' : (canAfford ? '#228B22' : '#553333');
      ctx.lineWidth = 2;
      ctx.strokeRect(bxBtn, byBtn, btnW, btnH);
      ctx.fillStyle = isPending ? '#FFFFFF' : (canAfford ? '#44FF44' : '#FF6666');
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isPending ? 'PICK!' : 'BUY', bxBtn + btnW / 2, byBtn + 15);
    }
    ctx.restore();

    // Scroll indicator
    if (items.length > visibleCount) {
      const trackX = listX + bl.listW + 4;
      const trackY = listY + headerH;
      const trackH = visibleH;
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(trackX, trackY, 4, trackH);
      const thumbH = Math.max(20, (visibleCount / items.length) * trackH);
      const thumbY = trackY + (this.scrollOffset / Math.max(1, items.length - visibleCount)) * (trackH - thumbH);
      ctx.fillStyle = '#555577';
      ctx.fillRect(trackX, thumbY, 4, thumbH);
    }
  }

  purchaseStock(item: ShopItem): void {
    const cap = this.activeCharacter as unknown as CapitalistCharacter;
    if (!cap || !cap.buyStock) return;
    if (this.gameState.playerData.money < item.cost) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    // Deduct optimistically, but if buyStock refuses (e.g. maxStacks cap
    // reached for Hedge Fund) refund. Avoids UI/deduction drift.
    this.gameState.playerData.money -= item.cost;
    const currentLevel = (this.gameState as unknown as { currentLevel: number }).currentLevel || 1;
    const ok = cap.buyStock(item.id, currentLevel, this.gameState);
    if (!ok) {
      this.gameState.playerData.money += item.cost;
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    this.gameState.savePlayerData();
    if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
  }

  renderSellButton(ctx: CanvasRenderingContext2D, item: ShopItem, info: EquippableInfo, rightEdge: number, itemY: number): void {
    if (!info.canSell) return;
    const sellButtonX = rightEdge - 100;
    const sellButtonY = itemY + 46;
    const sellPrice = Math.floor(item.cost * 0.8);
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

  renderUpgradeButton(ctx: CanvasRenderingContext2D, item: ShopItem, info: EquippableInfo, rightEdge: number, itemY: number): void {
    if (info.level < info.maxLevel) {
      const canAffordUpgrade = this.gameState.playerData.money >= info.upgradeCost;
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
      ctx.fillText(`UPG Lv${info.level + 1} $${info.upgradeCost}`, upgradeButtonX + 52, upgradeButtonY + 17);
    } else {
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.textAlign = 'left';
      ctx.fillText('MAX LV', rightEdge - 230, itemY + 58);
    }
  }

  renderBuyButton(ctx: CanvasRenderingContext2D, item: ShopItem, isHovered: boolean, rightEdge: number, itemY: number): void {
    // Use the same per-stack cost the purchase path charges, so rendered price
    // never diverges from what actually gets deducted.
    const actualCost = this.getCurrentItemCost(item);
    const canAfford = this.gameState.playerData.money >= actualCost;
    if (item.type === 'weapon') {
      const canBuyWeapon = (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
      if (!canBuyWeapon) {
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#FF4444';
        ctx.textAlign = 'right';
        ctx.fillText('SLOTS FULL', rightEdge - 10, itemY + 40);
        return;
      }
    }
    if (actualCost === 0) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#00FF00';
      ctx.textAlign = 'right';
      ctx.fillText('FREE', rightEdge - 10, itemY + 35);
    } else {
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
    }
  }

  onBackClick(): void {
    // Will be overridden by parent
  }

  onContinueClick(): void {
    // Will be overridden by parent
  }

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.getLayout();

    // Clear background
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    // Back button or Continue button
    if (this.showContinueButton) {
      const btnW = 210;
      const btnH = 48;
      const btnX = this.canvas.logicalWidth - layout.padding - btnW;
      const btnY = layout.continueButtonY;
      drawPrimaryButton(ctx, btnX, btnY, btnW, btnH, 'CONTINUE', {
        hovered: this.continueHovered,
        hint: '[ENTER]',
      });
    } else {
      const btnW = 110;
      const btnH = 38;
      drawSecondaryButton(ctx, layout.padding, layout.backButtonY, btnW, btnH, '< BACK', {
        hovered: this.backHovered,
      });
    }

    // Title
    drawTitle(ctx, 'SHOP', this.canvas.logicalWidth / 2, layout.titleY, {
      size: 38, shimmer: true,
    });

    // Tab-specific header info
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    if (this.activeTab === 'weapons') {
      const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
      ctx.fillStyle = ownedWeapons.length >= this.maxWeapons ? '#FF4444' : COLORS.UI_INACTIVE;
      const slotsText = ownedWeapons.length >= this.maxWeapons
        ? `Slots: ${ownedWeapons.length}/${this.maxWeapons} (FULL - sell to buy)`
        : `Slots: ${ownedWeapons.length}/${this.maxWeapons}`;
      ctx.fillText(slotsText, layout.padding, layout.contentY - 8);
    } else if (this.activeTab === 'businesses') {
      const cap = this.activeCharacter as unknown as CapitalistCharacter;
      const count = cap?.placedBusinesses ? cap.placedBusinesses.length : 0;
      ctx.fillStyle = count >= 9 ? '#FF4444' : '#FFD700';
      const hint = this.bizPendingBuyId ? ' — click empty cell to place' : '';
      ctx.fillText(`Placed: ${count}/9${hint}`, layout.padding, layout.contentY - 8);
    } else if (this.activeTab === 'stocks') {
      const cap = this.activeCharacter as unknown as CapitalistCharacter;
      const owned = cap?.stocks || [];
      const types = cap?.getStockTypes ? cap.getStockTypes() : {};
      // Group by type for a compact holdings line: "Blue Chip ×3 · Growth ×1 · …"
      const grouped: Record<string, number> = {};
      for (const s of owned) grouped[s.type] = (grouped[s.type] || 0) + 1;
      const parts: string[] = [];
      for (const t in grouped) {
        const n = types[t]?.name || t;
        parts.push(`${n} ×${grouped[t]}`);
      }
      ctx.fillStyle = '#FFD700';
      if (owned.length === 0) {
        ctx.fillText('Holdings: none — buy stocks for per-wave income.', layout.padding, layout.contentY - 8);
      } else {
        ctx.fillText(`Holdings: ${parts.join(' · ')}`, layout.padding, layout.contentY - 8);
      }
    }

    // Money display (pulses red if hovered item is unaffordable)
    const now = performance.now();
    let hoveredCost: number | null = null;
    if (this.hoveredItem) {
      if ((this.hoveredItem as ShopItem & { _businessType?: boolean })._businessType) {
        hoveredCost = Math.floor(this.hoveredItem.cost * this.getBusinessCostMultiplier());
      } else {
        hoveredCost = this.getCurrentItemCost(this.hoveredItem);
      }
    } else if (this.hoveredUpgradeButton) {
      hoveredCost = this.getEquippableInfo(this.hoveredUpgradeButton).upgradeCost;
    }
    const cantAfford = hoveredCost !== null && this.gameState.playerData.money < hoveredCost;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
    const moneyColor = cantAfford
      ? `rgba(255, ${Math.floor(40 + 60 * (1 - pulse))}, ${Math.floor(40 + 60 * (1 - pulse))}, 1)`
      : '#FFD700';

    if (cantAfford) {
      ctx.save();
      ctx.shadowColor = '#FF3333';
      ctx.shadowBlur = 8 + pulse * 10;
    }
    ctx.font = 'bold 26px monospace';
    ctx.fillStyle = moneyColor;
    ctx.textAlign = 'right';
    ctx.fillText(`$${this.gameState.playerData.money}`, this.canvas.logicalWidth - layout.padding, layout.titleY);
    if (cantAfford) ctx.restore();

    // Tabs
    const tabs = this.getTabs();
    const tabWidth = 130;
    const tabHeight = 40;
    const totalTabWidth = tabs.length * tabWidth + (tabs.length - 1) * 10;
    const tabStartX = (this.canvas.logicalWidth - totalTabWidth) / 2;

    for (let i = 0; i < tabs.length; i++) {
      const tabId = tabs[i];
      const tx = tabStartX + i * (tabWidth + 10);
      const isActive = this.activeTab === tabId;
      const isHover = this.hoveredTab === tabId && !isActive;

      ctx.fillStyle = isActive ? '#333366' : (isHover ? '#222238' : '#14141e');
      ctx.fillRect(tx, layout.tabsY, tabWidth, tabHeight);
      ctx.strokeStyle = isActive ? '#6666FF' : (isHover ? '#5555AA' : '#333344');
      ctx.lineWidth = 2;
      ctx.strokeRect(tx, layout.tabsY, tabWidth, tabHeight);
      if (isActive) {
        ctx.fillStyle = '#6666FF';
        ctx.fillRect(tx, layout.tabsY + tabHeight - 3, tabWidth, 3);
      }
      // Icon glyph
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isActive ? '#FFD700' : (isHover ? '#AAAAAA' : '#555566');
      ctx.fillText(this.getTabIcon(tabId), tx + 16, layout.tabsY + 26);
      // Label
      ctx.fillStyle = isActive ? '#FFFFFF' : (isHover ? '#BBBBBB' : '#666677');
      ctx.font = 'bold 16px monospace';
      ctx.fillText(tabId.toUpperCase(), tx + tabWidth / 2 + 8, layout.tabsY + 26);
    }

    // Content area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.contentY, this.canvas.logicalWidth, layout.contentHeight);
    ctx.clip();

    // Custom tab rendering
    if (this.activeTab === 'recruit') {
      this.renderRecruitTab(ctx, layout);
      ctx.restore();
      return;
    }
    if (this.activeTab === 'roster') {
      this.renderRosterTab(ctx, layout);
      ctx.restore();
      return;
    }
    if (this.activeTab === 'equipment') {
      this.renderEquipmentTab(ctx, layout);
      ctx.restore();
      return;
    }
    if (this.activeTab === 'businesses') {
      this.renderBusinessesTab(ctx, layout);
      ctx.restore();
      return;
    }
    if (this.activeTab === 'weapons' && this.activeCharacter && this.activeCharacter.getMaxWeapons() > 0) {
      this.renderWeaponsTab(ctx, layout);
      ctx.restore();
      return;
    }

    // Render items
    const currentItems = this.getCurrentItems();
    const visibleStart = Math.floor(this.scrollOffset);
    const visibleEnd = Math.min(visibleStart + layout.maxVisibleItems + 1, currentItems.length);

    for (let i = visibleStart; i < visibleEnd; i++) {
      const item = currentItems[i];
      const itemY = layout.contentY + (i - this.scrollOffset) * layout.itemHeight;

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

      // Item border
      if (item.atMaxStacks) {
        ctx.strokeStyle = '#00FFFF';
      } else if (item.owned || (item.maxStacks && item.maxStacks > 1 && (item.currentStacks || 0) > 0)) {
        ctx.strokeStyle = '#00FF00';
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

      if (item.type === 'spell') {
        if (item.owned) {
          const level = (this.gameState.playerData.spellLevels && (this.gameState.playerData.spellLevels as Record<string, number>)[item.id]) || 1;
          displayName += ` [Lv${level}]`;
          ctx.fillStyle = '#9966FF';
        } else {
          ctx.fillStyle = COLORS.UI_TEXT;
        }
      } else if (item.type === 'weapon') {
        if ((item.ownedCount || 0) > 0) {
          const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
          displayName += ` x${item.ownedCount}`;
          if (level > 1) displayName += ` [Lv${level}]`;
          if (level < BALANCE.weaponUpgrades.maxLevel) {
            ctx.fillStyle = '#FFD700';
          }
        }
      } else if ((item as ShopItem & { _stockType?: boolean })._stockType) {
        // Stocks can be purchased repeatedly; each copy is tracked individually
        // for per-wave payouts. Show owned count, no faux stack cap.
        const cnt = item.ownedCount || 0;
        if (cnt > 0) {
          displayName += `  ×${cnt} owned`;
          ctx.fillStyle = '#FFD700';
        }
      } else {
        if (item.maxStacks && item.maxStacks > 1) {
          const currentStacks = item.currentStacks || 0;
          displayName += ` [${currentStacks}/${item.maxStacks}]`;
          ctx.fillStyle = currentStacks >= item.maxStacks ? '#00FFFF' : '#00FF00';
        } else {
          const owned = item.owned ? 1 : 0;
          displayName += ` [${owned}/1]`;
        }
      }
      ctx.fillText(displayName, layout.padding * 3, itemY + 25);

      // Item description
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      let description = item.description;

      if (item.id === 'bounceHouse') {
        const playerDataDyn = this.gameState.playerData as PlayerData & Record<string, unknown>;
        const stacks = (playerDataDyn.bounceHouseStacks as number) || 0;
        if (stacks > 0) {
          description = `Projectiles bounce ${stacks} times (next: ${stacks + 1} times)`;
        }
      } else if (item.maxStacks && item.maxStacks > 1 && (item.currentStacks || 0) > 0) {
        if (item.luckBonus) {
          description = `+${(item.luckBonus as number) * (item.currentStacks || 0)} Luck (next: +${item.luckBonus})`;
        } else if (item.speedBonus) {
          description = `+${(item.speedBonus as number) * (item.currentStacks || 0)} Speed (next: +${item.speedBonus})`;
        } else if (item.healthBonus) {
          const current = ((item.healthBonus as number) * (item.currentStacks || 0)).toFixed(1);
          description = `+${current} Health (next: +${item.healthBonus})`;
        }
      } else if (item.owned && item.type === 'spell' && item.id === 'magicMissile') {
        const spellLv = (this.gameState.playerData.spellLevels && (this.gameState.playerData.spellLevels as Record<string, number>)[item.id]) || 1;
        description = `${spellLv} homing bolt${spellLv > 1 ? 's' : ''}${spellLv < 8 ? ` (next: ${spellLv + 1} bolts)` : ' — MAX'}`;
      } else if (item.owned && item.type === 'weapon') {
        const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
        if (level < BALANCE.weaponUpgrades.maxLevel) {
          description = item.upgradeDescription || item.description;
        }
      }

      ctx.fillText(description, layout.padding * 3, itemY + 45);

      // Price/action buttons
      ctx.textAlign = 'right';
      const rightEdge = layout.padding * 2 + layout.itemWidth;

      if (item.type === 'spell' || item.type === 'weapon') {
        const info = this.getEquippableInfo(item);
        const isOwned = item.type === 'spell' ? item.owned : ((item.ownedCount || 0) > 0);

        if (isOwned) {
          if (item.type === 'weapon') {
            const canBuyWeapon = (this.gameState.playerData.weapons || ['pistol']).length < this.maxWeapons;
            const canAfford = this.gameState.playerData.money >= item.cost;
            if (canBuyWeapon) {
              const buyMoreX = rightEdge - 100;
              const buyMoreY = itemY + 10;
              const nextCount = (item.ownedCount || 0) + 1;
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
          }

          this.renderSellButton(ctx, item, info, rightEdge, itemY);
          this.renderUpgradeButton(ctx, item, info, rightEdge, itemY);
        } else {
          this.renderBuyButton(ctx, item, isHovered, rightEdge, itemY);
        }
      } else if (item.owned && (item.type as string) !== 'weapon') {
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
        const isBusiness = !!(item as ShopItem & { _businessType?: boolean })._businessType;
        const businessMult = isBusiness ? this.getBusinessCostMultiplier() : 1;
        const baseCost = this.getCurrentItemCost(item);
        const actualCost = isBusiness ? Math.floor(item.cost * businessMult) : baseCost;
        const hasDiscount = isBusiness && businessMult < 1;
        const canAfford = this.gameState.playerData.money >= actualCost;

        const buyBtnX = rightEdge - 110;
        const buyBtnY = itemY + 18;

        // Click flash
        const flashDt = now - this.clickFlashTime;
        const flashing = isHovered && flashDt >= 0 && flashDt < 150;

        ctx.fillStyle = flashing ? '#55FF55' : (isHovered ? '#1a3a1a' : '#0a2a0a');
        ctx.fillRect(buyBtnX, buyBtnY, 100, 32);
        ctx.strokeStyle = isHovered ? '#44FF44' : (canAfford ? '#228B22' : '#553333');
        ctx.lineWidth = 2;
        ctx.strokeRect(buyBtnX, buyBtnY, 100, 32);
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = canAfford ? '#44FF44' : '#FF4444';
        ctx.textAlign = 'center';
        ctx.fillText(`$${actualCost}`, buyBtnX + 50, buyBtnY + 21);

        // Strikethrough original cost above button when discounted
        if (hasDiscount && item.cost !== actualCost) {
          ctx.font = 'bold 12px monospace';
          ctx.fillStyle = '#888888';
          const origTxt = `$${item.cost}`;
          const textW = ctx.measureText(origTxt).width;
          const origY = buyBtnY - 5;
          ctx.fillText(origTxt, buyBtnX + 50, origY);
          ctx.strokeStyle = '#CC4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(buyBtnX + 50 - textW / 2 - 2, origY - 4);
          ctx.lineTo(buyBtnX + 50 + textW / 2 + 2, origY - 4);
          ctx.stroke();
        }

        if (item.maxStacks && item.maxStacks > 1) {
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

      // Track
      ctx.fillStyle = '#1a1a2a';
      ctx.fillRect(layout.scrollbarX, layout.contentY, layout.scrollbarWidth, scrollbarHeight);
      ctx.strokeStyle = '#333344';
      ctx.lineWidth = 1;
      ctx.strokeRect(layout.scrollbarX, layout.contentY, layout.scrollbarWidth, scrollbarHeight);

      // Thumb — wider on hover/drag
      const active = this.scrollbarDragging || this.scrollbarHovered;
      const thumbX = active ? layout.scrollbarX - 2 : layout.scrollbarX;
      const thumbW = active ? layout.scrollbarWidth + 4 : layout.scrollbarWidth;
      ctx.fillStyle = this.scrollbarDragging ? '#AAAAFF' : (this.scrollbarHovered ? '#8888CC' : '#555577');
      ctx.fillRect(thumbX, layout.contentY + thumbY, thumbW, thumbHeight);
    }

    // Tooltip (drawn last, on top of everything)
    this.renderTooltip(ctx);
  }

  private renderTooltip(ctx: CanvasRenderingContext2D): void {
    const item = this.hoveredItem;
    if (!item) return;
    // Skip tooltip for recruit/roster/equipment tabs (they have their own layouts)
    if (this.activeTab === 'recruit' || this.activeTab === 'roster' || this.activeTab === 'equipment') return;

    const lines: string[] = [];
    lines.push(item.name);

    // Cost line with discount awareness
    const isBusiness = !!(item as ShopItem & { _businessType?: boolean })._businessType;
    if (isBusiness) {
      const mult = this.getBusinessCostMultiplier();
      const cost = Math.floor(item.cost * mult);
      if (mult < 1) {
        lines.push(`Cost: $${cost}  (was $${item.cost}, -${Math.round((1 - mult) * 100)}% Venture Capital)`);
      } else {
        lines.push(`Cost: $${cost}`);
      }
    } else {
      const c = this.getCurrentItemCost(item);
      lines.push(c === 0 ? 'Cost: FREE' : `Cost: $${c}`);
    }

    // Current level / stacks info
    if (item.type === 'weapon' && (item.ownedCount || 0) > 0) {
      const level = (this.gameState.playerData.weaponLevels && this.gameState.playerData.weaponLevels[item.id]) || 1;
      lines.push(`Owned x${item.ownedCount}  Lv ${level}/${BALANCE.weaponUpgrades.maxLevel}`);
    } else if (item.type === 'spell' && item.owned) {
      const info = this.getEquippableInfo(item);
      lines.push(`Lv ${info.level}/${info.maxLevel}`);
    } else if (item.maxStacks && item.maxStacks > 1) {
      lines.push(`Stacks: ${item.currentStacks || 0}/${item.maxStacks}`);
    } else if (item.owned) {
      lines.push('OWNED');
    }

    // Description (wrapped)
    const desc = item.description || '';
    const wrapWidth = 40;
    const words = desc.split(' ');
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > wrapWidth) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = (line + ' ' + w).trim();
      }
    }
    if (line) lines.push(line);

    // Measure
    ctx.save();
    ctx.font = '12px monospace';
    let maxW = 0;
    for (const l of lines) {
      const w = ctx.measureText(l).width;
      if (w > maxW) maxW = w;
    }
    const padX = 10;
    const padY = 8;
    const lineH = 16;
    const boxW = maxW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;

    // Position near cursor, clamp to screen
    let bx = this.lastMouseX + 16;
    let by = this.lastMouseY + 16;
    if (bx + boxW > this.canvas.logicalWidth - 4) bx = this.lastMouseX - boxW - 16;
    if (by + boxH > this.canvas.logicalHeight - 4) by = this.canvas.logicalHeight - boxH - 4;
    if (bx < 4) bx = 4;
    if (by < 4) by = 4;

    // Box (solid for readability)
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#6666FF';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Lines
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#FFFFFF';
      } else if (i === 1) {
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#FFD700';
      } else {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#BBBBBB';
      }
      ctx.fillText(lines[i], bx + padX, by + padY + (i + 1) * lineH - 4);
    }
    ctx.restore();
  }
}
