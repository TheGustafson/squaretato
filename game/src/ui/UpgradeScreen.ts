import { COLORS } from '../constants';
import { BALANCE } from '../config/balance';
import { applyUpgrade } from '../systems/ItemEffects';
import type { GameCanvas, PlayerStats } from '../types';
import type { GameState } from '../systems/GameState';
import type { SoundSystem } from '../systems/SoundSystem';
import type { BaseCharacter } from '../characters/BaseCharacter';
import { drawPanel, drawSecondaryButton, drawTitle } from './drawHelpers';

interface UpgradeType {
  type: string;
  weight: number;
  value: number;
  display: string;
}

interface Upgrade {
  type: string;
  name: string;
  description: string;
  value: number;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
}

const RARITY_COLORS: Record<'common' | 'rare' | 'epic', { border: string; glow: string; label: string; text: string }> = {
  common: { border: '#BBBBBB', glow: 'rgba(200, 200, 200, 0.15)', label: 'COMMON', text: '#CCCCCC' },
  rare:   { border: '#4A90FF', glow: 'rgba(74, 144, 255, 0.20)', label: 'RARE',   text: '#6AAEFF' },
  epic:   { border: '#B066FF', glow: 'rgba(176, 102, 255, 0.22)', label: 'EPIC',   text: '#C88BFF' },
};

interface HoveredOption {
  type: 'upgrade' | 'reroll' | 'skip';
  index?: number;
}

interface UpgradeLayout {
  padding: number;
  titleY: number;
  cardsY: number;
  cardWidth: number;
  cardHeight: number;
  cardSpacing: number;
  startX: number;
  rerollX: number;
  rerollY: number;
  skipX: number;
  skipY: number;
  continueX: number;
  continueY: number;
  continueW: number;
  continueH: number;
  buttonWidth: number;
  buttonHeight: number;
  inventoryY: number;
  inventoryH: number;
}

const STAT_DESCRIPTIONS: Record<string, string> = {
  health: 'Maximum HP. More hits survived.',
  damage: 'Multiplier for all weapon/spell damage.',
  fireRate: 'Shots fired per second.',
  speed: 'Movement speed in pixels/sec.',
  dodge: 'Chance to avoid incoming hits.',
  luck: 'Biases rolls (drops, crits).',
  critChance: 'Chance for shots to crit.',
  critDamage: 'Bonus damage on crit hits.',
  regeneration: 'Passive health regeneration.',
  cooldownSpeed: 'Faster spell cooldowns.',
  spellPower: 'Multiplier to all spell damage.',
  pickupRange: 'Range for collecting pickups.',
  cooldownReduction: 'Reduces spell cooldowns.',
  slamRadius: 'Ground slam radius.',
  fistSwingSpeed: 'Fist attack speed.',
  armor: 'Incoming damage reduction.',
  bloodDrain: 'HP healed per kill.',
  frenzyThreshold: 'HP% at which frenzy triggers.',
  bloodBankCapacity: 'Max Blood Bank charge.',
  afterimageDamage: 'Afterimage trail damage.',
  dashDistance: 'Dash travel distance.',
  timeDilationDuration: 'Time Warp duration.',
  recruitDamage: 'Recruit damage output.',
  recruitHealth: 'Recruit health pool.',
  recruitSpeed: 'Recruit move speed.',
  synergyBonus: 'Synergy effect strength.',
  productionSpeed: 'Business production rate.',
  dividendRate: 'Stock dividend multiplier.',
  structureHealth: 'Business durability.',
  burstDuration: 'Momentum burst duration.',
  momentumDecayRate: 'Slower momentum decay.',
};

export class UpgradeScreen {
  canvas: GameCanvas;
  gameState: GameState;
  soundSystem: SoundSystem | null;

  upgrades: Upgrade[];
  selectedUpgrade: Upgrade | null;
  hoveredOption: HoveredOption | null;
  canReroll: boolean;
  rerollsUsed: number;
  activeCharacter: BaseCharacter | null;
  // Animation state
  activateTime: number;
  lastFrameTime: number;
  pressedCardIndex: number;
  pressFlashT: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState, soundSystem: SoundSystem | null) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = soundSystem;

    this.upgrades = [];
    this.selectedUpgrade = null;
    this.hoveredOption = null;
    this.canReroll = true;
    this.rerollsUsed = 0;
    this.activeCharacter = null;
    this.activateTime = 0;
    this.lastFrameTime = performance.now();
    this.pressedCardIndex = -1;
    this.pressFlashT = 0;

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.canReroll = true;
    this.rerollsUsed = 0;
    this.activateTime = 0;
    this.lastFrameTime = performance.now();
    this.pressedCardIndex = -1;
    this.pressFlashT = 0;
    this.generateUpgrades();
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  generateUpgrades(): void {
    // Reset slide-in animation each time new cards are generated
    this.activateTime = 0;
    this.lastFrameTime = performance.now();
    let upgradeTypes: UpgradeType[] = BALANCE.endWaveUpgrades.upgradeTypes as UpgradeType[];
    const count = BALANCE.endWaveUpgrades.optionsCount;

    if (this.activeCharacter && this.activeCharacter.getUpgradePool()) {
      const pool = this.activeCharacter.getUpgradePool();
      upgradeTypes = upgradeTypes.filter(t => pool.includes(t.type));
    }

    const totalWeight = upgradeTypes.reduce((sum, type) => sum + type.weight, 0);

    this.upgrades = [];
    const usedTypes = new Set<string>();

    while (this.upgrades.length < count && usedTypes.size < upgradeTypes.length) {
      let random = Math.random() * totalWeight;
      let selectedType: string | null = null;

      for (const type of upgradeTypes) {
        random -= type.weight;
        if (random <= 0 && !usedTypes.has(type.type)) {
          selectedType = type.type;
          usedTypes.add(type.type);
          break;
        }
      }

      if (selectedType) {
        const upgrade = this.createUpgrade(selectedType);
        if (upgrade) this.upgrades.push(upgrade);
      }
    }

    while (this.upgrades.length < count) {
      const randomType = upgradeTypes[Math.floor(Math.random() * upgradeTypes.length)];
      const upgrade = this.createUpgrade(randomType.type);
      if (upgrade) this.upgrades.push(upgrade);
    }
  }

  createUpgrade(type: string): Upgrade | null {
    const upgradeType = (BALANCE.endWaveUpgrades.upgradeTypes as UpgradeType[]).find(t => t.type === type);
    if (!upgradeType) return null;

    return {
      type,
      name: this.getUpgradeName(type),
      description: upgradeType.display,
      value: upgradeType.value,
      icon: this.getUpgradeIcon(type),
      rarity: this.rollRarity(upgradeType.weight)
    };
  }

  // Rarity is implicit in the upgrade weight: rarer picks produce rarer cards.
  // We also roll per-card so the same type can occasionally appear rare/epic.
  rollRarity(weight: number): 'common' | 'rare' | 'epic' {
    // Baseline from weight (lower weight = rarer baseline)
    let base: 'common' | 'rare' | 'epic' = 'common';
    if (weight <= 4) base = 'epic';
    else if (weight <= 8) base = 'rare';

    // 10% chance to upgrade, 8% chance to downgrade (clamped at common)
    const r = Math.random();
    if (r < 0.08 && base !== 'common') {
      base = base === 'epic' ? 'rare' : 'common';
    } else if (r > 0.92 && base !== 'epic') {
      base = base === 'common' ? 'rare' : 'epic';
    }
    return base;
  }

  getUpgradeName(type: string): string {
    const names: Record<string, string> = {
      health: 'Vitality',
      damage: 'Power',
      fireRate: 'Rapid Fire',
      speed: 'Swiftness',
      dodge: 'Evasion',
      luck: 'Fortune',
      critChance: 'Precision',
      critDamage: 'Devastation',
      regeneration: 'Recovery',
      cooldownSpeed: 'Temporal Haste',
      spellPower: 'Arcane Might',
      slamRadius: 'Seismic Reach',
      fistSwingSpeed: 'Furious Strikes',
      armor: 'Hardened Hide',
      bloodDrain: 'Crimson Thirst',
      frenzyThreshold: 'Eager Frenzy',
      bloodBankCapacity: 'Hemo Vault',
      afterimageDamage: 'Phantom Edge',
      dashDistance: 'Warp Stride',
      timeDilationDuration: 'Chrono Bloom',
      recruitDamage: 'Sharper Orders',
      recruitHealth: 'Hardier Troops',
      recruitSpeed: 'Marching Drill',
      synergyBonus: 'Team Spirit',
      productionSpeed: 'Overtime',
      dividendRate: 'Yield Boost',
      structureHealth: 'Reinforced Walls',
      burstDuration: 'Endless Rage',
      momentumDecayRate: 'Momentum Lock',
    };
    return names[type] || type;
  }

  getUpgradeIcon(type: string): string {
    const icons: Record<string, string> = {
      health: '❤',
      damage: '⚔',
      fireRate: '⚡',
      speed: '➤',
      dodge: '◇',
      luck: '★',
      critChance: '◎',
      critDamage: '✶',
      regeneration: '✿',
      cooldownSpeed: '⧖',
      spellPower: '✷',
      slamRadius: '◉',
      fistSwingSpeed: '✊',
      armor: '⛨',
      bloodDrain: '☉',
      frenzyThreshold: '♦',
      bloodBankCapacity: '⊕',
      afterimageDamage: '⌘',
      dashDistance: '»',
      timeDilationDuration: '⧗',
      recruitDamage: '⚔',
      recruitHealth: '❤',
      recruitSpeed: '➤',
      synergyBonus: '⚘',
      productionSpeed: '⚙',
      dividendRate: '$',
      structureHealth: '⌂',
      burstDuration: '⚡',
      momentumDecayRate: '⟳',
    };
    return icons[type] || '◆';
  }

  formatStatValue(type: string, value: number): string {
    switch (type) {
      case 'health': return value.toFixed(0);
      case 'damage': return value.toFixed(2);
      case 'fireRate': return value.toFixed(2);
      case 'speed': return value.toFixed(0);
      case 'dodge': return `${value.toFixed(0)}%`;
      case 'luck': return value.toFixed(0);
      case 'critChance': return `${value.toFixed(0)}%`;
      case 'critDamage': return `${value.toFixed(0)}%`;
      case 'regeneration': return (value * 10).toFixed(2);
      case 'cooldownSpeed': return `${(value * 100).toFixed(0)}%`;
      case 'spellPower': return `${(value * 100).toFixed(0)}%`;
      case 'slamRadius': return `${value.toFixed(0)}px`;
      case 'fistSwingSpeed': return `${(value * 100).toFixed(0)}%`;
      case 'armor': return `${(value * 100).toFixed(0)}%`;
      case 'bloodDrain': return value.toFixed(2);
      case 'frenzyThreshold': return `${(value * 100).toFixed(0)}%`;
      case 'bloodBankCapacity': return value.toFixed(0);
      case 'afterimageDamage': return `${(value * 100).toFixed(0)}%`;
      case 'dashDistance': return `${value.toFixed(0)}px`;
      case 'timeDilationDuration': return `${value.toFixed(1)}s`;
      case 'recruitDamage':
      case 'recruitHealth':
      case 'recruitSpeed':
      case 'synergyBonus':
      case 'productionSpeed':
      case 'dividendRate':
      case 'structureHealth': return `${(value * 100).toFixed(0)}%`;
      case 'burstDuration': return `${value.toFixed(1)}s`;
      case 'momentumDecayRate': return `${(value * 100).toFixed(0)}%`;
      default: return value.toFixed(2);
    }
  }

  getCurrentStatValue(type: string): number {
    const stats = this.gameState.playerData.stats as PlayerStats & Record<string, number>;
    const keyMap: Record<string, string> = {
      slamRadius: 'slamRadiusBonus',
      fistSwingSpeed: 'fistSwingSpeedBonus',
      armor: 'armor',
      bloodDrain: 'bloodDrainBonus',
      frenzyThreshold: 'frenzyThresholdBonus',
      bloodBankCapacity: 'bloodBankCapacityBonus',
      afterimageDamage: 'afterimageDamageBonus',
      dashDistance: 'dashDistanceBonus',
      timeDilationDuration: 'timeDilationDurationBonus',
      recruitDamage: 'recruitDamageBonus',
      recruitHealth: 'recruitHealthBonus',
      recruitSpeed: 'recruitSpeedBonus',
      synergyBonus: 'synergyBonus',
      productionSpeed: 'productionSpeedBonus',
      dividendRate: 'dividendRateBonus',
      structureHealth: 'structureHealthBonus',
      burstDuration: 'burstDurationBonus',
      momentumDecayRate: 'momentumDecayRateBonus',
    };
    const key = keyMap[type] || type;
    return stats[key] ?? 0;
  }

  getNextStatValue(type: string, upgradeValue: number): number {
    const cur = this.getCurrentStatValue(type);
    if (type === 'dodge') return Math.min(95, cur + upgradeValue);
    if (type === 'critChance') return Math.min(100, cur + upgradeValue);
    return cur + upgradeValue;
  }

  getLayout(): UpgradeLayout {
    const padding = 40;
    const titleY = this.canvas.logicalHeight * 0.12;
    const cardsY = this.canvas.logicalHeight * 0.28;
    const cardSpacing = 20;
    // Responsive card width so 4 cards + 3 gaps never exceed logical width.
    const maxTotal = Math.max(560, this.canvas.logicalWidth - padding * 2);
    const cardWidth = Math.min(190, Math.floor((maxTotal - cardSpacing * 3) / 4));
    const cardHeight = 240;
    const totalWidth = cardWidth * 4 + cardSpacing * 3;
    const startX = (this.canvas.logicalWidth - totalWidth) / 2;
    const buttonWidth = 170;
    const buttonHeight = 44;

    const rerollX = this.canvas.logicalWidth / 2 - buttonWidth / 2;
    const rerollY = cardsY + cardHeight + 30;

    // SKIP sits in the top-right so it can't collide with the bottom
    // inventory strip. Inventory occupies the bottom row full-width.
    const skipX = this.canvas.logicalWidth - padding - buttonWidth;
    const skipY = padding;

    const inventoryH = 46;
    const inventoryY = this.canvas.logicalHeight - padding - inventoryH;

    const continueW = 180;
    const continueH = 44;
    const continueX = this.canvas.logicalWidth - padding - continueW;
    const continueY = padding;

    return {
      padding, titleY, cardsY, cardWidth, cardHeight, cardSpacing, startX,
      rerollX, rerollY, skipX, skipY, buttonWidth, buttonHeight, inventoryY, inventoryH,
      continueX, continueY, continueW, continueH
    };
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

    this.hoveredOption = null;

    for (let i = 0; i < this.upgrades.length; i++) {
      const cardX = layout.startX + i * (layout.cardWidth + layout.cardSpacing);
      if (pos.x >= cardX && pos.x <= cardX + layout.cardWidth &&
          pos.y >= layout.cardsY && pos.y <= layout.cardsY + layout.cardHeight) {
        this.hoveredOption = { type: 'upgrade', index: i };
        return;
      }
    }

    if (this.canReroll &&
        pos.x >= layout.rerollX && pos.x <= layout.rerollX + layout.buttonWidth &&
        pos.y >= layout.rerollY && pos.y <= layout.rerollY + layout.buttonHeight) {
      this.hoveredOption = { type: 'reroll' };
      return;
    }

    if (pos.x >= layout.skipX && pos.x <= layout.skipX + layout.buttonWidth &&
        pos.y >= layout.skipY && pos.y <= layout.skipY + layout.buttonHeight) {
      this.hoveredOption = { type: 'skip' };
      return;
    }
  }

  onClick(_e: MouseEvent): void {
    if (!this.hoveredOption) return;

    if (this.hoveredOption.type === 'upgrade' && this.hoveredOption.index !== undefined) {
      this.pressedCardIndex = this.hoveredOption.index;
      this.pressFlashT = 1;
      this.selectUpgrade(this.upgrades[this.hoveredOption.index]);
    } else if (this.hoveredOption.type === 'reroll') {
      this.reroll();
    } else if (this.hoveredOption.type === 'skip') {
      this.skip();
    }
  }

  selectUpgrade(upgrade: Upgrade): void {
    if (!upgrade) return;

    applyUpgrade(upgrade.type, upgrade.value, this.gameState.playerData);

    this.gameState.savePlayerData();

    if (this.soundSystem) this.soundSystem.play('levelUp');
    this.onUpgradeSelected();
  }

  getRerollCost(): number {
    return BALANCE.endWaveUpgrades.rerollCost * (this.rerollsUsed + 1);
  }

  reroll(): void {
    if (!this.canReroll) return;
    const rerollCost = this.getRerollCost();

    if (this.gameState.playerData.money >= rerollCost) {
      this.gameState.playerData.money -= rerollCost;
      this.gameState.savePlayerData();
      this.rerollsUsed++;
      this.generateUpgrades();

      if (this.soundSystem) this.soundSystem.play('buttonClick');
      if (this.rerollsUsed >= 3) this.canReroll = false;
    } else {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
    }
  }

  skip(): void {
    if (this.soundSystem) this.soundSystem.play('buttonClick');
    this.onUpgradeSelected();
  }

  onUpgradeSelected(): void {}
  onContinueToNextLevel(): void {}

  private easeOutCubic(t: number): number {
    const x = 1 - Math.max(0, Math.min(1, t));
    return 1 - x * x * x;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.getLayout();

    // Tick animation clocks
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.activateTime += dt;
    if (this.pressFlashT > 0) this.pressFlashT = Math.max(0, this.pressFlashT - dt * 4);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    drawTitle(ctx, 'CHOOSE AN UPGRADE', this.canvas.logicalWidth / 2, layout.titleY, {
      size: 34, shimmer: true,
    });

    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Select one upgrade to improve your character', this.canvas.logicalWidth / 2, layout.titleY + 26);

    // Money display (top-left so it doesn't collide with SKIP in top-right)
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ACCENT_GOLD;
    ctx.fillText(`$${this.gameState.playerData.money}`, layout.padding, layout.padding + 22);

    for (let i = 0; i < this.upgrades.length; i++) {
      const upgrade = this.upgrades[i];
      const baseCardX = layout.startX + i * (layout.cardWidth + layout.cardSpacing);
      const isHovered = this.hoveredOption?.type === 'upgrade' && this.hoveredOption.index === i;
      const rarity = RARITY_COLORS[upgrade.rarity];

      // Slide/fade in, staggered per card
      const stagger = i * 0.06;
      const appearT = this.easeOutCubic((this.activateTime - stagger) / 0.35);
      const alpha = Math.max(0, appearT);
      const slideY = (1 - alpha) * 24;

      // Hover bump (scale 1.05 from card center)
      const hoverScale = isHovered ? 1.05 : 1.0;
      const cardCX = baseCardX + layout.cardWidth / 2;
      const cardCY = layout.cardsY + layout.cardHeight / 2 + slideY;

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = prevAlpha * alpha;
      ctx.save();
      ctx.translate(cardCX, cardCY);
      ctx.scale(hoverScale, hoverScale);
      ctx.translate(-layout.cardWidth / 2, -layout.cardHeight / 2);

      const cardX = 0;
      const cardY = 0;

      // Drop shadow on hover
      if (isHovered) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(cardX + 4, cardY + 6, layout.cardWidth, layout.cardHeight);
      }

      // Card background (rarity-tinted)
      ctx.fillStyle = isHovered ? rarity.glow : 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(cardX, cardY, layout.cardWidth, layout.cardHeight);

      // Press flash
      if (this.pressedCardIndex === i && this.pressFlashT > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * this.pressFlashT})`;
        ctx.fillRect(cardX, cardY, layout.cardWidth, layout.cardHeight);
      }

      // Rarity border (double stroke on epic/rare)
      ctx.strokeStyle = rarity.border;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.strokeRect(cardX, cardY, layout.cardWidth, layout.cardHeight);
      if (upgrade.rarity === 'epic') {
        ctx.strokeStyle = rarity.border;
        ctx.globalAlpha = prevAlpha * alpha * 0.35;
        ctx.lineWidth = 1;
        ctx.strokeRect(cardX - 3, cardY - 3, layout.cardWidth + 6, layout.cardHeight + 6);
        ctx.globalAlpha = prevAlpha * alpha;
      }

      // Rarity ribbon at top
      ctx.fillStyle = rarity.border;
      ctx.globalAlpha = prevAlpha * alpha * 0.85;
      ctx.fillRect(cardX, cardY, layout.cardWidth, 18);
      ctx.globalAlpha = prevAlpha * alpha;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rarity.label, cardX + layout.cardWidth / 2, cardY + 13);

      // Icon glyph
      ctx.font = 'bold 52px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = rarity.text;
      ctx.fillText(upgrade.icon, cardX + layout.cardWidth / 2, cardY + 80);

      // Name
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.textAlign = 'center';
      ctx.fillText(upgrade.name, cardX + layout.cardWidth / 2, cardY + 112);

      // Current → Next with colored delta
      const cur = this.getCurrentStatValue(upgrade.type);
      const next = this.getNextStatValue(upgrade.type, upgrade.value);
      const increased = next > cur;
      const decreased = next < cur;
      const deltaColor = increased ? '#66FF88' : decreased ? '#FF6666' : '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = deltaColor;
      const transition = `${this.formatStatValue(upgrade.type, cur)} → ${this.formatStatValue(upgrade.type, next)}`;
      ctx.fillText(transition, cardX + layout.cardWidth / 2, cardY + 138);

      // display (e.g. +0.2 Damage) — also colored by direction
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = increased ? '#AAFFAA' : decreased ? '#FFAAAA' : COLORS.UI_TEXT;
      ctx.fillText(upgrade.description, cardX + layout.cardWidth / 2, cardY + 158);

      // Stat description (wrapped, clipped to card)
      const statDesc = STAT_DESCRIPTIONS[upgrade.type] || '';
      ctx.font = '12px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      const lines = this.wrapText(statDesc, layout.cardWidth - 20);
      const maxLines = Math.min(lines.length, 4);
      for (let j = 0; j < maxLines; j++) {
        ctx.fillText(lines[j], cardX + layout.cardWidth / 2, cardY + 186 + j * 14);
      }

      ctx.restore();
      ctx.globalAlpha = prevAlpha;
    }

    // Reroll button (center, pre-shown cost)
    const rerollCost = this.getRerollCost();
    const canAffordReroll = this.gameState.playerData.money >= rerollCost;
    const isRerollHovered = this.hoveredOption?.type === 'reroll';

    if (this.canReroll) {
      ctx.fillStyle = isRerollHovered && canAffordReroll ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(layout.rerollX, layout.rerollY, layout.buttonWidth, layout.buttonHeight);
      ctx.strokeStyle = isRerollHovered && canAffordReroll ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.rerollX, layout.rerollY, layout.buttonWidth, layout.buttonHeight);

      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = canAffordReroll ? (isRerollHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE) : '#FF4444';
      ctx.fillText(`REROLL  $${rerollCost}`, layout.rerollX + layout.buttonWidth / 2, layout.rerollY + 22);

      ctx.font = '10px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillText(`${3 - this.rerollsUsed} rerolls left`, layout.rerollX + layout.buttonWidth / 2, layout.rerollY + 36);
    } else {
      ctx.strokeStyle = '#442222';
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.rerollX, layout.rerollY, layout.buttonWidth, layout.buttonHeight);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#AA4444';
      ctx.fillText('NO REROLLS LEFT', layout.rerollX + layout.buttonWidth / 2, layout.rerollY + 28);
    }

    // Inventory strip
    const pd = this.gameState.playerData;
    const weaponCount = (pd.weapons || []).length;
    const spellCount = pd.spells ? pd.spells.length : 0;
    const items = pd.items || [];
    const stripX = layout.padding;
    const stripW = this.canvas.logicalWidth - layout.padding * 2;
    drawPanel(ctx, stripX, layout.inventoryY, stripW, layout.inventoryH, { accent: 'green' });

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888888';
    ctx.fillText('OWNED', stripX + 10, layout.inventoryY + 14);

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#FF9966';
    ctx.fillText(`WEAPONS: ${weaponCount}`, stripX + 10, layout.inventoryY + 34);
    ctx.fillStyle = '#66AAFF';
    ctx.fillText(`SPELLS: ${spellCount}`, stripX + 150, layout.inventoryY + 34);
    ctx.fillStyle = '#88FF88';
    // List items compactly
    const itemStacks = pd.itemStacks || {};
    let itemsStr = 'ITEMS: ';
    if (items.length === 0) itemsStr += '—';
    else {
      const parts: string[] = [];
      for (const id of items) {
        const stack = itemStacks[id] || 1;
        parts.push(stack > 1 ? `${id}x${stack}` : id);
      }
      itemsStr += parts.join(', ');
    }
    // Elide with ellipsis when it would run off the strip
    const itemsMaxWidth = stripW - 290;
    if (ctx.measureText(itemsStr).width > itemsMaxWidth) {
      while (itemsStr.length > 4 && ctx.measureText(itemsStr + '...').width > itemsMaxWidth) {
        itemsStr = itemsStr.slice(0, -1);
      }
      itemsStr += '...';
    }
    ctx.fillText(itemsStr, stripX + 270, layout.inventoryY + 34);

    // Skip button (top-right, secondary)
    drawSecondaryButton(ctx, layout.skipX, layout.skipY, layout.buttonWidth, layout.buttonHeight,
      'SKIP',
      { hovered: this.hoveredOption?.type === 'skip' }
    );
  }


  // Cache wrap results to avoid re-measuring every frame.
  private _wrapCache: Map<string, string[]> = new Map();
  wrapText(text: string, maxWidth: number): string[] {
    const key = `${maxWidth}::${text}`;
    const cached = this._wrapCache.get(key);
    if (cached) return cached;
    // Approximate monospace char width at 12px (matches the font used for descriptions).
    // This gives stable results independent of canvas state mutations elsewhere.
    const charW = 7.2;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length * charW > maxWidth) {
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
    if (currentLine) lines.push(currentLine);
    this._wrapCache.set(key, lines);
    return lines;
  }
}
