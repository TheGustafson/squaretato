import { COLORS } from '../constants';
import { BALANCE } from '../config/balance';
import { applyItemEffect } from '../systems/ItemEffects';
import type { GameCanvas, PlayerData } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPrimaryButton, drawSecondaryButton, drawTitle } from './drawHelpers';

interface StartingChoice {
  id: string;
  type: string;
  name: string;
  description: string;
}

interface StartingItem {
  id: string;
  name: string;
  description: string;
}

interface StartingConfig {
  categoryLabel: string;
  choices: StartingChoice[];
  itemLabel: string;
  items: StartingItem[];
}

interface HoverOption {
  row: 'choice' | 'item';
  index: number;
}

interface SetupLayout {
  cx: number;
  cardW: number;
  cardH: number;
  gap: number;
  topRowY: number;
  bottomRowY: number;
  btnY: number;
  leftCardX: number;
  rightCardX: number;
}

function itemChoice(id: string): StartingItem {
  const items = BALANCE.items as unknown as Record<string, { name: string; description: string }>;
  const config = items[id];
  return { id, name: config.name, description: config.description };
}

const STARTING_CHOICES: Record<string, StartingConfig> = {
  fighter: {
    categoryLabel: 'STARTING WEAPON',
    choices: [
      { id: 'pistol', type: 'weapon', name: 'Pistol', description: 'Reliable auto-fire' },
      { id: 'sword', type: 'weapon', name: 'Sword', description: 'Melee sweep, high damage' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('luckyCoin'), itemChoice('proteinBar')],
  },
  wizard: {
    categoryLabel: 'STARTING SPELL',
    choices: [
      { id: 'magicMissile', type: 'spell', name: 'Magic Missile', description: 'Homing bolt, fast cast' },
      { id: 'fireball', type: 'spell', name: 'Fireball', description: 'AoE explosion, slower' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('chronoCrystal'), itemChoice('spellFocus')],
  },
  manager: {
    categoryLabel: 'FIRST RECRUIT',
    choices: [
      { id: 'brawler', type: 'recruit', name: 'Brawler', description: 'HP:15 DMG:2 Melee tanky fighter' },
      { id: 'gunner', type: 'recruit', name: 'Gunner', description: 'HP:8 DMG:1 Ranged, fast attacks' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('moneyMagnet'), itemChoice('luckyPenny')],
  },
  capitalist: {
    categoryLabel: 'FIRST BUSINESS',
    choices: [
      { id: 'burgerJoint', type: 'business', name: 'Burger Joint', description: 'Cheap fighters, fast production' },
      { id: 'mercenaryCamp', type: 'business', name: 'Mercenary Camp', description: 'Moderate damage & speed' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('luckyCoin'), itemChoice('moneyMagnet')],
  },
  glassCannon: {
    categoryLabel: 'STARTING WEAPON',
    choices: [
      { id: 'smg', type: 'weapon', name: 'SMG', description: 'Fast fire, low damage' },
      { id: 'shotgun', type: 'weapon', name: 'Shotgun', description: 'Burst damage, spread' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('sharpTips'), itemChoice('quickHands')],
  },
  vampire: {
    categoryLabel: 'STARTING WEAPON',
    choices: [
      { id: 'pistol', type: 'weapon', name: 'Pistol', description: 'Reliable auto-fire' },
      { id: 'sword', type: 'weapon', name: 'Sword', description: 'Melee sweep, heals on kill' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('bloodPact'), itemChoice('adrenalineRush')],
  },
  hulk: {
    categoryLabel: 'STANCE',
    choices: [
      { id: 'juggernaut', type: 'stance', name: 'Juggernaut', description: 'Balanced. Standard slam.' },
      { id: 'earthshaker', type: 'stance', name: 'Earthshaker', description: '+30% slam radius, -20% speed' },
      { id: 'berserker', type: 'stance', name: 'Berserker', description: '+25% dmg, -20% HP, regen x2 <50%' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('proteinBar'), itemChoice('tankArmor')],
  },
  speedster: {
    categoryLabel: 'DASH STYLE',
    choices: [
      { id: 'blink', type: 'style', name: 'Blink', description: '200px dash, 3s CD' },
      { id: 'phantom', type: 'style', name: 'Phantom', description: 'Dash leaves 3 afterimages (2x ttl)' },
      { id: 'overdrive', type: 'style', name: 'Overdrive', description: '120px, 1s CD, +10% dmg stack (3x)' },
    ],
    itemLabel: 'STARTING ITEM',
    items: [itemChoice('energyDrink'), itemChoice('coffeeShot')],
  },
};

export class StartingSetupScreen {
  canvas: GameCanvas;
  gameState: GameState;
  selectedChoice: number;
  selectedItem: number;
  hoveredOption: HoverOption | null;
  hoveredButton: string | null;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.selectedChoice = 0;
    this.selectedItem = 0;
    this.hoveredOption = null;
    this.hoveredButton = null;

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
  }

  activate(): void {
    this.selectedChoice = 0;
    this.selectedItem = 0;
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
  }

  getConfig(): StartingConfig {
    return STARTING_CHOICES[this.gameState.selectedCharacter] || STARTING_CHOICES.fighter;
  }

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  getLayout(): SetupLayout {
    const cx = this.canvas.logicalWidth / 2;
    const cardW = 240;
    const cardH = 90;
    const gap = 30;
    const topRowY = 130;
    const bottomRowY = 300;
    const btnY = this.canvas.logicalHeight - 70;

    return {
      cx,
      cardW, cardH, gap,
      topRowY, bottomRowY,
      btnY,
      leftCardX: cx - cardW - gap / 2,
      rightCardX: cx + gap / 2,
    };
  }

  choiceCardX(index: number, count: number, layout: SetupLayout): number {
    if (count <= 2) {
      return index === 0 ? layout.leftCardX : layout.rightCardX;
    }
    const totalW = count * layout.cardW + (count - 1) * layout.gap;
    const startX = layout.cx - totalW / 2;
    return startX + index * (layout.cardW + layout.gap);
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    const config = this.getConfig();
    this.hoveredOption = null;
    this.hoveredButton = null;

    // Top row (choices)
    if (pos.y >= layout.topRowY && pos.y <= layout.topRowY + layout.cardH) {
      for (let i = 0; i < config.choices.length; i++) {
        const cx = this.choiceCardX(i, config.choices.length, layout);
        if (pos.x >= cx && pos.x <= cx + layout.cardW) {
          this.hoveredOption = { row: 'choice', index: i };
          break;
        }
      }
    }

    // Bottom row (items)
    if (pos.y >= layout.bottomRowY && pos.y <= layout.bottomRowY + layout.cardH) {
      for (let i = 0; i < config.items.length; i++) {
        const cx = this.choiceCardX(i, config.items.length, layout);
        if (pos.x >= cx && pos.x <= cx + layout.cardW) {
          this.hoveredOption = { row: 'item', index: i };
          break;
        }
      }
    }

    // Continue (primary, bottom-right)
    const btnW = 200;
    const btnH = 48;
    const btnX = this.canvas.logicalWidth - 30 - btnW;
    const btnY = this.canvas.logicalHeight - 30 - btnH;
    if (pos.x >= btnX && pos.x <= btnX + btnW &&
        pos.y >= btnY && pos.y <= btnY + btnH) {
      this.hoveredButton = 'continue';
    }

    // Back button (top-left)
    if (pos.x >= 20 && pos.x <= 120 && pos.y >= 20 && pos.y <= 60) {
      this.hoveredButton = 'back';
    }
  }

  onClick(_e?: MouseEvent): void {
    if (this.hoveredOption) {
      if (this.hoveredOption.row === 'choice') {
        this.selectedChoice = this.hoveredOption.index;
      } else {
        this.selectedItem = this.hoveredOption.index;
      }
      return;
    }
    if (this.hoveredButton === 'continue') {
      this.applyChoices();
      this.onContinue();
    } else if (this.hoveredButton === 'back') {
      this.onBack();
    }
  }

  applyChoices(): void {
    const config = this.getConfig();
    const choice = config.choices[this.selectedChoice];
    const item = config.items[this.selectedItem];
    const playerData = this.gameState.playerData as PlayerData & Record<string, unknown>;

    // Apply main choice
    if (choice.type === 'weapon') {
      playerData.weapons = [choice.id];
      playerData.weaponLevels = { [choice.id]: 1 };
    } else if (choice.type === 'spell') {
      playerData.spells = [choice.id];
      playerData.spellLevels = { [choice.id]: 1 };
    } else if (choice.type === 'recruit') {
      playerData.startingRecruit = choice.id;
    } else if (choice.type === 'business') {
      playerData.startingBusiness = choice.id;
    } else if (choice.type === 'stance') {
      playerData.startingStance = choice.id;
    } else if (choice.type === 'style') {
      playerData.startingStyle = choice.id;
      playerData.startingDashStyle = choice.id;
    }

    // Apply item - same as ShopScreen.purchaseItem
    if (!playerData.items) playerData.items = [];
    if (!playerData.itemStacks) playerData.itemStacks = {};
    if (!playerData.items.includes(item.id)) {
      playerData.items.push(item.id);
    }
    playerData.itemStacks[item.id] = (playerData.itemStacks[item.id] || 0) + 1;
    applyItemEffect(item.id, playerData as PlayerData);

    this.gameState.savePlayerData();
  }

  onContinue(..._args: unknown[]): void {}
  onBack(..._args: unknown[]): void {}

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.getLayout();
    const config = this.getConfig();

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    // Title
    drawTitle(ctx, 'STARTING SETUP', layout.cx, 58, { size: 34, shimmer: true });

    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText(`— ${this.gameState.selectedCharacter.toUpperCase()} —`, layout.cx, 82);

    // Category label - top row (cyan = info)
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = COLORS.ACCENT_CYAN;
    ctx.textAlign = 'center';
    ctx.fillText(config.categoryLabel, layout.cx, layout.topRowY - 15);

    // Render choice cards (top row)
    for (let i = 0; i < config.choices.length; i++) {
      const c = config.choices[i];
      const x = this.choiceCardX(i, config.choices.length, layout);
      const y = layout.topRowY;
      const selected = this.selectedChoice === i;
      const hovered = this.hoveredOption?.row === 'choice' && this.hoveredOption.index === i;

      this.renderCard(ctx, x, y, layout.cardW, layout.cardH, c.name, c.description, selected, hovered);
    }

    // Category label - bottom row (gold = item/reward)
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = COLORS.ACCENT_GOLD;
    ctx.textAlign = 'center';
    ctx.fillText(config.itemLabel, layout.cx, layout.bottomRowY - 15);

    // Render item cards (bottom row)
    for (let i = 0; i < config.items.length; i++) {
      const itm = config.items[i];
      const x = this.choiceCardX(i, config.items.length, layout);
      const y = layout.bottomRowY;
      const selected = this.selectedItem === i;
      const hovered = this.hoveredOption?.row === 'item' && this.hoveredOption.index === i;

      this.renderCard(ctx, x, y, layout.cardW, layout.cardH, itm.name, itm.description, selected, hovered);
    }

    // Primary CTA: bottom-right with [ENTER] hint
    const btnW = 200;
    const btnH = 48;
    const btnX = this.canvas.logicalWidth - 30 - btnW;
    const btnY = this.canvas.logicalHeight - 30 - btnH;
    drawPrimaryButton(ctx, btnX, btnY, btnW, btnH, 'START RUN', {
      hovered: this.hoveredButton === 'continue',
      hint: '[ENTER]',
    });

    // Back button (top-left secondary)
    drawSecondaryButton(ctx, 20, 20, 100, 40, '< BACK', {
      hovered: this.hoveredButton === 'back',
    });
  }

  renderCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, description: string, selected: boolean, hovered: boolean): void {
    // Background
    if (selected) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    } else if (hovered) {
      ctx.fillStyle = 'rgba(100, 150, 255, 0.08)';
    } else {
      ctx.fillStyle = 'rgba(30, 30, 30, 0.5)';
    }
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = selected ? COLORS.UI_TEXT : (hovered ? '#6688AA' : COLORS.UI_INACTIVE);
    ctx.lineWidth = selected ? 3 : (hovered ? 2 : 1);
    ctx.strokeRect(x, y, w, h);

    // Selected indicator
    if (selected) {
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('✓', x + w - 8, y + 16);
    }

    // Name
    ctx.fillStyle = selected ? COLORS.UI_TEXT : (hovered ? '#CCCCCC' : COLORS.UI_INACTIVE);
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, x + w / 2, y + 35);

    // Description — clip to card bounds so long descriptions (e.g. Speedster's
    // dash styles) don't bleed past neighboring cards.
    ctx.font = '13px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y + 44, w - 8, h - 48);
    ctx.clip();
    // Simple wrap: split on words, build lines until each exceeds width.
    const maxChars = Math.max(10, Math.floor((w - 16) / 7.8)); // ~7.8px/char at 13px mono
    const words = description.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (test.length > maxChars) { if (cur) lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      ctx.fillText(lines[i], x + w / 2, y + 60 + i * 16);
    }
    ctx.restore();
  }
}

export { STARTING_CHOICES };
