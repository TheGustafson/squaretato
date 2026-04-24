import { COLORS } from '../constants';
import { BALANCE } from '../config/balance';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import type { GameCanvas, PlayerStats } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawPrimaryButton, drawSecondaryButton, drawTitle } from './drawHelpers';

// Lightweight shape for anything that exposes a play(name) method.
// Keeps the screen decoupled from SoundSystem while still letting callers
// inject it (window.* global, or future constructor wiring).
interface SoundLike {
  play(name: string): void;
}

interface UpgradeConfig {
  baseCost: number;
  costScaling: number;
  value: number;
  maxValue?: number;
}

interface UpgradeOption {
  name: string;          // label prefix, e.g. "HEALTH"
  suffix: string;        // e.g. "+1" / "+20%" — shown as the per-level delta
  cost: number;
  stat: string;
  value: number;
  purchases: number;
  currentValue: number;  // live player stat value for this stat
  nextValue: number;     // what the stat becomes after purchase
  maxed: boolean;        // at or past balance cap
  description: string;   // plain-english tooltip
}

interface CharScreenLayout {
  padding: number;
  titleY: number;
  backX: number;
  backY: number;
  backW: number;
  backH: number;
  continueX: number;
  continueY: number;
  continueW: number;
  continueH: number;
  moneyX: number;
  moneyY: number;
  listX: number;
  listY: number;
  listWidth: number;
  listHeight: number;
  rowHeight: number;
  rightPanelX: number;
  rightPanelY: number;
  rightPanelW: number;
  rightPanelH: number;
  scrollbarX: number;
  scrollbarW: number;
  tooltipY: number;
  tooltipH: number;
  buyBtnW: number;
  buyBtnH: number;
}

const STAT_LABELS: Record<string, string> = {
  health: 'HEALTH',
  speed: 'SPEED',
  damage: 'DAMAGE',
  fireRate: 'FIRE RATE',
  dodge: 'DODGE',
  luck: 'LUCK',
  critChance: 'CRIT CHANCE',
  critDamage: 'CRIT DAMAGE',
  regeneration: 'REGEN',
  pickupRange: 'PICKUP RANGE',
  spellPower: 'SPELL POWER',
  cooldownSpeed: 'COOLDOWN SPEED',
};

// Plain-english descriptions for tooltip hover.
const STAT_DESCRIPTIONS: Record<string, string> = {
  health: 'Increases your maximum HP. More HP, more hits before you go down.',
  speed: 'Move faster. Dodging and kiting become easier.',
  damage: 'Multiplies outgoing weapon damage. Compounds with weapon upgrades.',
  fireRate: 'Multiplies how often your weapons fire. More bullets per second.',
  dodge: 'Chance to completely ignore an incoming hit. Capped at 60%.',
  luck: 'Raises odds of better rarities in the level-up upgrade pool.',
  critChance: 'Chance for each hit to crit and deal bonus damage.',
  critDamage: 'Multiplier applied when a hit crits. Scales with crit chance.',
  regeneration: 'Passively restores HP over time. Slow but steady.',
  pickupRange: 'Pulls coins and pickups toward you from farther away.',
  spellPower: 'Increases spell damage and effects for Wizard-class casters.',
  cooldownSpeed: 'Spells recover faster, letting you cast more often.',
};

// Formatters — keep numeric output readable without per-frame allocations
// beyond the obvious. Menu state, non-hot path.
// Epsilon-tolerant integer rounder — `10 * 0.2 + 10 * 0.2 + ...` can land at
// 21.9999999. Snap near-integer floats so the HUD never shows that mess.
function roundDisplay(value: number): number {
  const r = Math.round(value);
  return Math.abs(value - r) < 1e-6 ? r : value;
}

function formatStatValue(stat: string, value: number): string {
  const v = roundDisplay(value);
  switch (stat) {
    case 'damage':
    case 'fireRate':
      return `${v.toFixed(2)}x`;
    case 'dodge':
    case 'critChance':
    case 'critDamage':
      return `${Math.round(v)}%`;
    case 'regeneration':
      // stored as per-tick; displayed as HP/s (*10 matches existing convention).
      return `${(v * 10).toFixed(1)}/s`;
    default:
      // Integer-ish stats (health, speed, luck) — round to whole.
      return `${Math.round(v)}`;
  }
}

function formatDelta(stat: string, value: number): string {
  const v = roundDisplay(value);
  switch (stat) {
    case 'dodge':
    case 'critChance':
    case 'critDamage':
      return `+${Math.round(v)}%`;
    case 'damage':
    case 'fireRate':
      // stored as multiplier increments; display as +20% etc.
      return `+${Math.round(v * 100)}%`;
    case 'regeneration':
      return `+${(v * 10).toFixed(1)}/s`;
    default:
      return `+${Math.round(v)}`;
  }
}

export class CharacterScreen {
  canvas: GameCanvas;
  gameState: GameState;
  soundSystem: SoundLike | null;
  selectedUpgrade: number | null;
  hoveredBuyIndex: number | null;
  scrollOffset: number;
  maxScroll: number;
  showContinueButton: boolean;
  continueHovered: boolean;
  backHovered: boolean;
  draggingScrollbar: boolean;
  scrollbarGrabOffset: number;
  flashTimer: number;      // 0..1, decays each render; drives money/card flash
  flashRow: number | null; // which row to flash
  lastRenderTime: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleWheel: (e: WheelEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  // Cached per-render upgrade list so hover/tooltip/click all agree.
  // Rebuilt at the start of render() (and on activate/purchase) — no
  // per-frame allocation beyond this one array.
  private _cachedUpgrades: UpgradeOption[];

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = null;
    this.selectedUpgrade = null;
    this.hoveredBuyIndex = null;
    this.scrollOffset = 0;
    this.maxScroll = 0;
    this.showContinueButton = true;
    this.continueHovered = false;
    this.backHovered = false;
    this.draggingScrollbar = false;
    this.scrollbarGrabOffset = 0;
    this.flashTimer = 0;
    this.flashRow = null;
    this.lastRenderTime = 0;
    this._cachedUpgrades = [];

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleMouseDown = (e: MouseEvent) => this.onMouseDown(e);
    this.handleMouseUp = (_e: MouseEvent) => { this.draggingScrollbar = false; };
    this.handleClick = (e: MouseEvent) => this.onClick(e);
    this.handleWheel = (e: WheelEvent) => this.onWheel(e);
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  }

  getLayout(): CharScreenLayout {
    const padding = 20;
    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;

    const backX = padding;
    const backY = padding;
    const backW = 100;
    const backH = 40;

    const continueW = 160;
    const continueH = 40;
    const continueX = W - padding - continueW;
    const continueY = padding;

    const titleY = padding + 68;         // below top bar
    const moneyX = W / 2;
    const moneyY = padding + 28;         // centered in top bar

    const listY = titleY + 34;
    const listX = padding + 10;
    const listWidth = Math.min(520, Math.floor(W * 0.42));
    const rowHeight = 72;                // taller card to fit current->next, buy, cost
    const listHeight = H - listY - padding - 20;

    const scrollbarW = 10;
    const scrollbarX = listX + listWidth + 8;

    const rightPanelX = listX + listWidth + 40;
    const rightPanelY = listY;
    const rightPanelW = W - rightPanelX - padding;
    const rightPanelH = listHeight;

    // Tooltip lives at bottom of right panel area (overlaid on stats panel).
    const tooltipH = 56;
    const tooltipY = listY + listHeight - tooltipH;

    const buyBtnW = 72;
    const buyBtnH = 36;

    return {
      padding, titleY,
      backX, backY, backW, backH,
      continueX, continueY, continueW, continueH,
      moneyX, moneyY,
      listX, listY, listWidth, listHeight, rowHeight,
      rightPanelX, rightPanelY, rightPanelW, rightPanelH,
      scrollbarX, scrollbarW,
      tooltipY, tooltipH,
      buyBtnW, buyBtnH,
    };
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    // Scrollbar drag must end even if mouse is released outside the canvas,
    // so bind mouseup on window rather than canvas.
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel);
    document.addEventListener('keydown', this.handleKeyDown);

    this._cachedUpgrades = this.buildUpgrades();
    const layout = this.getLayout();
    const totalHeight = this._cachedUpgrades.length * layout.rowHeight;
    this.maxScroll = Math.max(0, totalHeight - layout.listHeight);
    this.scrollOffset = 0;
    this.draggingScrollbar = false;
    this.flashTimer = 0;
    this.flashRow = null;
    this.lastRenderTime = performance.now();
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
    // Always clear drag state on deactivate so we don't resume mid-drag after
    // returning to the screen.
    this.draggingScrollbar = false;
  }

  getMousePos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  getScrollbarThumb(): { x: number; y: number; w: number; h: number } | null {
    if (this.maxScroll <= 0) return null;
    const layout = this.getLayout();
    const totalHeight = this._cachedUpgrades.length * layout.rowHeight;
    const thumbH = Math.max(24, (layout.listHeight / totalHeight) * layout.listHeight);
    const thumbY = layout.listY + (this.scrollOffset / this.maxScroll) * (layout.listHeight - thumbH);
    return { x: layout.scrollbarX, y: thumbY, w: layout.scrollbarW, h: thumbH };
  }

  // Buy button rect for row i at given rowY. Right-aligned inside the card.
  private getBuyRect(
    layout: CharScreenLayout, rowY: number
  ): { x: number; y: number; w: number; h: number } {
    const x = layout.listX + layout.listWidth - layout.buyBtnW - 10;
    const y = rowY + (layout.rowHeight - 4 - layout.buyBtnH) / 2;
    return { x, y, w: layout.buyBtnW, h: layout.buyBtnH };
  }

  onMouseDown(e: MouseEvent): void {
    const pos = this.getMousePos(e);

    // Scrollbar track click-to-jump + thumb drag.
    const layout = this.getLayout();
    if (this.maxScroll > 0 &&
        pos.x >= layout.scrollbarX && pos.x <= layout.scrollbarX + layout.scrollbarW &&
        pos.y >= layout.listY && pos.y <= layout.listY + layout.listHeight) {
      const thumb = this.getScrollbarThumb();
      if (thumb &&
          pos.y >= thumb.y && pos.y <= thumb.y + thumb.h) {
        this.draggingScrollbar = true;
        this.scrollbarGrabOffset = pos.y - thumb.y;
      } else if (thumb) {
        // jump: center thumb on click point
        this.scrollbarGrabOffset = thumb.h / 2;
        this.draggingScrollbar = true;
        const trackTop = layout.listY;
        const trackBottom = layout.listY + layout.listHeight - thumb.h;
        const rawY = pos.y - this.scrollbarGrabOffset;
        const clampedY = Math.max(trackTop, Math.min(trackBottom, rawY));
        const pct = (clampedY - trackTop) / Math.max(1, trackBottom - trackTop);
        this.scrollOffset = pct * this.maxScroll;
      }
    }
  }

  onMouseMove(e: MouseEvent): void {
    const { x, y } = this.getMousePos(e);
    const layout = this.getLayout();

    if (this.draggingScrollbar) {
      const thumb = this.getScrollbarThumb();
      if (thumb) {
        const trackTop = layout.listY;
        const trackBottom = layout.listY + layout.listHeight - thumb.h;
        const rawY = y - this.scrollbarGrabOffset;
        const clampedY = Math.max(trackTop, Math.min(trackBottom, rawY));
        const pct = (clampedY - trackTop) / Math.max(1, trackBottom - trackTop);
        this.scrollOffset = pct * this.maxScroll;
      }
      return;
    }

    const upgrades = this._cachedUpgrades;
    this.selectedUpgrade = null;
    this.hoveredBuyIndex = null;
    for (let i = 0; i < upgrades.length; i++) {
      const rowY = layout.listY + i * layout.rowHeight - this.scrollOffset;
      if (rowY + layout.rowHeight < layout.listY || rowY > layout.listY + layout.listHeight) continue;
      if (x >= layout.listX && x <= layout.listX + layout.listWidth &&
          y >= rowY && y <= rowY + layout.rowHeight - 4) {
        this.selectedUpgrade = i;
        const buy = this.getBuyRect(layout, rowY);
        if (x >= buy.x && x <= buy.x + buy.w && y >= buy.y && y <= buy.y + buy.h) {
          this.hoveredBuyIndex = i;
        }
        break;
      }
    }

    this.backHovered = x >= layout.backX && x <= layout.backX + layout.backW &&
                       y >= layout.backY && y <= layout.backY + layout.backH;

    if (this.showContinueButton) {
      this.continueHovered = x >= layout.continueX &&
                             x <= layout.continueX + layout.continueW &&
                             y >= layout.continueY &&
                             y <= layout.continueY + layout.continueH;
    } else {
      this.continueHovered = false;
    }
  }

  onClick(_e: MouseEvent): void {
    if (this.draggingScrollbar) return;
    if (this.backHovered) {
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      this.onBackClick();
      return;
    }
    if (this.showContinueButton && this.continueHovered) {
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      this.onContinueClick();
      return;
    }

    if (this.selectedUpgrade !== null) {
      const idx = this.selectedUpgrade;
      const upgrades = this._cachedUpgrades;
      // Clicking anywhere on the row or specifically on the BUY button
      // both trigger a purchase — matches the affordance users expect.
      this.purchaseUpgrade(upgrades[idx], idx);
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && this.showContinueButton) {
      e.preventDefault();
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      this.onContinueClick();
    } else if (e.key === 'Escape') {
      // Convenience: Escape backs out, mirroring common menu behavior.
      e.preventDefault();
      if (this.soundSystem) this.soundSystem.play('buttonClick');
      this.onBackClick();
    }
  }

  // Back-compat: older callers may still invoke getUpgrades().
  getUpgrades(): UpgradeOption[] {
    return this.buildUpgrades();
  }

  // Build the list from current player state. Called on activate,
  // after purchase, and at the top of render() — not per-frame allocating
  // in the hot path.
  private buildUpgrades(): UpgradeOption[] {
    const upgrades: UpgradeOption[] = [];
    const playerData = this.gameState.playerData;

    if (!playerData.upgradePurchases) {
      playerData.upgradePurchases = {
        health: 0, speed: 0, damage: 0, fireRate: 0,
        dodge: 0, luck: 0, critChance: 0, critDamage: 0, regeneration: 0
      };
    }

    const character = CharacterRegistry.get(this.gameState.selectedCharacter);
    const upgradePool = character && character.getUpgradePool();
    const statsRec = playerData.stats as unknown as Record<string, number>;

    const balanceUpgrades = BALANCE.upgrades as unknown as Record<string, UpgradeConfig>;
    for (const [stat, config] of Object.entries(balanceUpgrades)) {
      if (upgradePool && !upgradePool.includes(stat)) continue;
      if (character) {
        if (stat === 'health' && !character.canBuyHealthUpgrades()) continue;
        if (stat === 'regeneration' && !character.canBuyRegeneration()) continue;
      }

      const purchases = playerData.upgradePurchases[stat] || 0;
      const cost = Math.floor(config.baseCost * Math.pow(config.costScaling, purchases));
      const currentValue = statsRec[stat] || 0;
      const nextValue = currentValue + config.value;
      // Per-character cap override (e.g. Hulk raises his own HP ceiling).
      let effectiveMax: number | undefined = config.maxValue;
      if (stat === 'health' && character) {
        const charMax = character.getMaxHealthValue();
        if (charMax !== null) effectiveMax = charMax;
      }
      const maxed = effectiveMax !== undefined && currentValue >= effectiveMax;

      upgrades.push({
        name: STAT_LABELS[stat] || stat.toUpperCase(),
        suffix: formatDelta(stat, config.value),
        cost,
        stat,
        value: config.value,
        purchases,
        currentValue,
        nextValue: maxed ? currentValue : nextValue,
        maxed,
        description: STAT_DESCRIPTIONS[stat] || '',
      });
    }

    return upgrades;
  }

  purchaseUpgrade(upgrade: UpgradeOption, rowIndex?: number): void {
    const playerData = this.gameState.playerData;
    if (upgrade.maxed) {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
      return;
    }
    if (playerData.money >= upgrade.cost) {
      playerData.money -= upgrade.cost;
      (playerData.stats as unknown as Record<string, number>)[upgrade.stat] += upgrade.value;
      playerData.upgradePurchases[upgrade.stat] = (playerData.upgradePurchases[upgrade.stat] || 0) + 1;
      this.gameState.savePlayerData();

      // Rebuild cached list so current/next values reflect the purchase.
      this._cachedUpgrades = this.buildUpgrades();
      const layout = this.getLayout();
      const totalHeight = this._cachedUpgrades.length * layout.rowHeight;
      this.maxScroll = Math.max(0, totalHeight - layout.listHeight);
      this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset);

      this.flashTimer = 1;
      this.flashRow = rowIndex ?? null;
      if (this.soundSystem) this.soundSystem.play('purchaseSuccess');
    } else {
      if (this.soundSystem) this.soundSystem.play('purchaseFail');
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const scrollSpeed = 30;
    if (e.deltaY > 0) {
      this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + scrollSpeed);
    } else {
      this.scrollOffset = Math.max(0, this.scrollOffset - scrollSpeed);
    }
  }

  onBackClick(): void {}
  onContinueClick(): void {}

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.getLayout();
    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;

    // Decay flash based on wall clock so it doesn't depend on FPS.
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastRenderTime) / 1000));
    this.lastRenderTime = now;
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt * 2.2); // ~0.45s
      if (this.flashTimer === 0) this.flashRow = null;
    }

    // Cached list is refreshed on activate() and after purchases — no need to
    // rebuild in the render loop. (Prior code did per-frame buildUpgrades()
    // which allocates + iterates BALANCE.upgrades + calls CharacterRegistry.get.)
    if (!this._cachedUpgrades) this._cachedUpgrades = this.buildUpgrades();

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, W, H);

    // --- Top bar: back | money | continue ---
    drawSecondaryButton(ctx, layout.backX, layout.backY, layout.backW, layout.backH,
      '< BACK', { hovered: this.backHovered });

    if (this.showContinueButton) {
      drawPrimaryButton(ctx, layout.continueX, layout.continueY, layout.continueW, layout.continueH,
        'CONTINUE', { hovered: this.continueHovered, hint: '[ENTER]' });
    }

    // Money (prominent, centered between back/continue). Flash pulses the color
    // from gold toward white on successful purchase.
    const flash = this.flashTimer;
    const moneyColor = flash > 0
      ? this.lerpColor('#FFD700', '#FFFFFF', flash)
      : '#FFD700';
    const moneyScale = 1 + 0.08 * flash;
    ctx.save();
    ctx.translate(layout.moneyX, layout.moneyY);
    ctx.scale(moneyScale, moneyScale);
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = moneyColor;
    ctx.fillText(`$${this.gameState.playerData.money}`, 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    // Title
    drawTitle(ctx, 'STAT UPGRADES', W / 2, layout.titleY, { size: 32, shimmer: true });

    // Subtitle: character name (so the player knows these stats are per-char).
    const character = CharacterRegistry.get(this.gameState.selectedCharacter);
    if (character) {
      ctx.font = '14px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillText(`— ${character.getName().toUpperCase()} —`, W / 2, layout.titleY + 18);
    }

    // Left list header
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.fillText('AVAILABLE UPGRADES', layout.listX, layout.listY - 8);

    // --- Scrollable upgrade list ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.listX - 2, layout.listY, layout.listWidth + 4, layout.listHeight);
    ctx.clip();

    const upgrades = this._cachedUpgrades;
    for (let i = 0; i < upgrades.length; i++) {
      const up = upgrades[i];
      const rowY = layout.listY + i * layout.rowHeight - this.scrollOffset;
      if (rowY + layout.rowHeight < layout.listY || rowY > layout.listY + layout.listHeight) continue;

      const canAfford = !up.maxed && this.gameState.playerData.money >= up.cost;
      const isHovered = i === this.selectedUpgrade;
      const rowIsFlashing = this.flashRow === i && this.flashTimer > 0;

      // Card background
      if (rowIsFlashing) {
        ctx.fillStyle = `rgba(255, 215, 0, ${0.25 * this.flashTimer})`;
        ctx.fillRect(layout.listX, rowY, layout.listWidth, layout.rowHeight - 4);
      } else if (isHovered && canAfford) {
        ctx.fillStyle = 'rgba(0,255,0,0.08)';
        ctx.fillRect(layout.listX, rowY, layout.listWidth, layout.rowHeight - 4);
      } else if (up.maxed) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(layout.listX, rowY, layout.listWidth, layout.rowHeight - 4);
      }

      ctx.strokeStyle = up.maxed ? '#333333'
        : isHovered && canAfford ? COLORS.UI_TEXT
        : canAfford ? COLORS.UI_INACTIVE
        : '#333333';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.strokeRect(layout.listX, rowY, layout.listWidth, layout.rowHeight - 4);

      // Title line: "HEALTH — LV 3  +1"
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = up.maxed ? '#666666' : canAfford ? COLORS.UI_TEXT : '#777777';
      ctx.textAlign = 'left';
      ctx.fillText(`${up.name}  —  LV ${up.purchases}`, layout.listX + 12, rowY + 22);

      ctx.font = '12px monospace';
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillText(up.suffix, layout.listX + 12 + this.textWidth(ctx, `${up.name}  —  LV ${up.purchases}`, 'bold 16px monospace') + 10, rowY + 22);

      // Current → Next line
      ctx.font = '13px monospace';
      if (up.maxed) {
        ctx.fillStyle = '#CC8844';
        ctx.fillText(`MAXED at ${formatStatValue(up.stat, up.currentValue)}`, layout.listX + 12, rowY + 44);
      } else {
        ctx.fillStyle = '#AAAAAA';
        const curStr = formatStatValue(up.stat, up.currentValue);
        const nxtStr = formatStatValue(up.stat, up.nextValue);
        ctx.fillText(`${curStr}`, layout.listX + 12, rowY + 44);
        const curW = this.textWidth(ctx, curStr, '13px monospace');
        ctx.fillStyle = COLORS.UI_INACTIVE;
        ctx.fillText('→', layout.listX + 12 + curW + 6, rowY + 44);
        ctx.fillStyle = '#66FF99';
        ctx.fillText(`${nxtStr}`, layout.listX + 12 + curW + 22, rowY + 44);
      }

      // Cost line
      ctx.font = '12px monospace';
      if (!up.maxed) {
        ctx.fillStyle = canAfford ? '#FFD700' : '#664400';
        ctx.fillText(`Cost: $${up.cost}`, layout.listX + 12, rowY + 62);
      }

      // BUY button
      const buy = this.getBuyRect(layout, rowY);
      const buyHot = this.hoveredBuyIndex === i;
      if (up.maxed) {
        ctx.fillStyle = 'rgba(80,80,80,0.15)';
        ctx.fillRect(buy.x, buy.y, buy.w, buy.h);
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 1;
        ctx.strokeRect(buy.x, buy.y, buy.w, buy.h);
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MAXED', buy.x + buy.w / 2, buy.y + buy.h / 2 + 4);
      } else {
        const bg = canAfford
          ? (buyHot ? 'rgba(102,255,153,0.25)' : 'rgba(102,255,153,0.10)')
          : 'rgba(80,80,80,0.08)';
        ctx.fillStyle = bg;
        ctx.fillRect(buy.x, buy.y, buy.w, buy.h);
        ctx.strokeStyle = canAfford
          ? (buyHot ? '#66FF99' : COLORS.UI_INACTIVE)
          : '#444444';
        ctx.lineWidth = buyHot && canAfford ? 2 : 1;
        ctx.strokeRect(buy.x, buy.y, buy.w, buy.h);
        ctx.fillStyle = canAfford ? COLORS.UI_TEXT : '#666666';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BUY', buy.x + buy.w / 2, buy.y + buy.h / 2 + 5);
      }
    }

    ctx.restore();

    // --- Scrollbar ---
    if (this.maxScroll > 0) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(layout.scrollbarX, layout.listY, layout.scrollbarW, layout.listHeight);
      ctx.strokeStyle = COLORS.UI_INACTIVE;
      ctx.lineWidth = 1;
      ctx.strokeRect(layout.scrollbarX, layout.listY, layout.scrollbarW, layout.listHeight);

      const thumb = this.getScrollbarThumb();
      if (thumb) {
        ctx.fillStyle = this.draggingScrollbar ? COLORS.UI_TEXT : '#888888';
        ctx.fillRect(thumb.x, thumb.y, thumb.w, thumb.h);
        ctx.strokeStyle = COLORS.UI_TEXT;
        ctx.lineWidth = 1;
        ctx.strokeRect(thumb.x, thumb.y, thumb.w, thumb.h);
      }
    }

    // --- Right panel: live stats + character-specific bonuses ---
    this.renderStatsPanel(ctx, layout);

    // --- Tooltip overlay ---
    this.renderTooltip(ctx, layout);
  }

  // ---------- helpers ----------

  // Cheap cached measure — only a few calls per frame.
  private textWidth(ctx: CanvasRenderingContext2D, s: string, font: string): number {
    const prev = ctx.font;
    ctx.font = font;
    const w = ctx.measureText(s).width;
    ctx.font = prev;
    return w;
  }

  // Hex-to-rgba linear interpolation. No allocations beyond the output string.
  private lerpColor(aHex: string, bHex: string, t: number): string {
    const a = parseInt(aHex.slice(1), 16);
    const b = parseInt(bHex.slice(1), 16);
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
  }

  private renderStatsPanel(ctx: CanvasRenderingContext2D, layout: CharScreenLayout): void {
    const pd = this.gameState.playerData;
    const stats = pd.stats as PlayerStats;
    const character = CharacterRegistry.get(this.gameState.selectedCharacter);
    const pool = character && character.getUpgradePool();

    drawPanel(ctx, layout.rightPanelX, layout.rightPanelY, layout.rightPanelW, layout.rightPanelH, {
      accent: 'cyan',
    });

    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.fillText('CURRENT STATS', layout.rightPanelX + 12, layout.rightPanelY + 24);

    // Derive stat list from pool so that each character sees only stats they
    // can actually upgrade (standard requirement), plus any character-specific
    // bonuses that live under the same name in playerData.stats.
    const statsRec = stats as unknown as Record<string, number>;
    const rows: Array<{ label: string; value: string; stat: string }> = [];

    // Standard money-upgradable stats (from BALANCE.upgrades) shown first.
    const balanceUpgrades = BALANCE.upgrades as unknown as Record<string, UpgradeConfig>;
    for (const [stat] of Object.entries(balanceUpgrades)) {
      if (pool && !pool.includes(stat)) continue;
      if (character) {
        if (stat === 'health' && !character.canBuyHealthUpgrades()) continue;
        if (stat === 'regeneration' && !character.canBuyRegeneration()) continue;
      }
      const v = statsRec[stat] || 0;
      rows.push({
        label: STAT_LABELS[stat] || stat.toUpperCase(),
        value: formatStatValue(stat, v),
        stat,
      });
    }

    // Character-specific stats in the pool that don't live in BALANCE.upgrades
    // (e.g. spellPower, slamRadiusBonus, recruitDamage). These accumulate via
    // the level-up UpgradeScreen and we surface them here so the player can
    // see the complete picture of their character's permanent gains.
    if (pool) {
      for (const stat of pool) {
        if (balanceUpgrades[stat]) continue; // already listed above
        const candidates = [stat, `${stat}Bonus`];
        for (const key of candidates) {
          if (statsRec[key] !== undefined && statsRec[key] !== 0) {
            rows.push({
              label: (STAT_LABELS[stat] || stat.replace(/([A-Z])/g, ' $1').toUpperCase()),
              value: this.formatBonusValue(stat, statsRec[key]),
              stat,
            });
            break;
          }
        }
      }
    }

    // Layout: two-column grid.
    let y = layout.rightPanelY + 50;
    const colW = (layout.rightPanelW - 24) / 2;
    ctx.font = '13px monospace';
    for (let i = 0; i < rows.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = layout.rightPanelX + 12 + col * colW;
      const sy = y + row * 20;
      // Stop before we run into the tooltip area.
      if (sy > layout.tooltipY - 8) break;
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.textAlign = 'left';
      ctx.fillText(rows[i].label, sx, sy);
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.textAlign = 'right';
      ctx.fillText(rows[i].value, sx + colW - 10, sy);
    }

    // Divider above tooltip area.
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.rightPanelX + 8, layout.tooltipY - 4);
    ctx.lineTo(layout.rightPanelX + layout.rightPanelW - 8, layout.tooltipY - 4);
    ctx.stroke();
  }

  private formatBonusValue(stat: string, v: number): string {
    // These are mostly additive multipliers (0.15 -> +15%) or flat px/sec.
    // Use simple heuristics: small fractional values read as percent.
    if (Math.abs(v) < 1 && v !== 0) {
      return `+${Math.round(v * 100)}%`;
    }
    if (stat.toLowerCase().includes('radius') || stat.toLowerCase().includes('distance') ||
        stat.toLowerCase().includes('range')) {
      return `+${v}px`;
    }
    if (stat.toLowerCase().includes('duration')) {
      return `+${v.toFixed(1)}s`;
    }
    return `+${v}`;
  }

  private renderTooltip(ctx: CanvasRenderingContext2D, layout: CharScreenLayout): void {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(layout.rightPanelX + 1, layout.tooltipY, layout.rightPanelW - 2, layout.tooltipH - 1);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('INFO', layout.rightPanelX + 12, layout.tooltipY + 16);

    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.UI_TEXT;

    const hovered = this.selectedUpgrade !== null ? this._cachedUpgrades[this.selectedUpgrade] : null;
    const text = hovered
      ? hovered.description || `Raises ${hovered.name.toLowerCase()}.`
      : 'Hover an upgrade to see what it does. Press ENTER to continue, ESC to go back.';

    this.wrapText(ctx, text,
      layout.rightPanelX + 12, layout.tooltipY + 34,
      layout.rightPanelW - 24, 14);
  }

  // Simple greedy word-wrap. A few allocations per render but only when
  // the tooltip text changes, and this is menu state.
  private wrapText(
    ctx: CanvasRenderingContext2D, text: string,
    x: number, y: number, maxWidth: number, lineHeight: number
  ): void {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line.length === 0 ? words[i] : `${line} ${words[i]}`;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineHeight;
        if (cy > y + lineHeight * 2) {
          // don't overflow the tooltip box; truncate with ellipsis
          ctx.fillText(line + '...', x, cy);
          return;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }
}
