import { COLORS } from '../constants';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import type { GameCanvas, PlayerStats } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPrimaryButton, drawSecondaryButton, drawTitle } from './drawHelpers';

interface CharacterCard {
  id: string;
  name: string;
  color: string;
  description: string;
  isUnlocked: boolean;
  isSelected: boolean;
  unlockCost: number;
  unlockDescription: string;
  stats: PlayerStats | null;
  tags: string[];
  everPlayed: boolean;
}

interface CharSelectButton {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  primary?: boolean;
}

const CHARACTER_TAGS: Record<string, string[]> = {
  fighter: ['BALANCED', 'RANGED', 'BEGINNER'],
  wizard: ['CASTER', 'MANA', 'AOE'],
  manager: ['TEAM', 'SUPPORT', 'MONEY'],
  capitalist: ['ECONOMY', 'STRUCTURES', 'LATE-GAME'],
  glassCannon: ['GLASS CANNON', 'RISK/REWARD', 'RANGED'],
  vampire: ['LIFESTEAL', 'RISK/REWARD', 'RANGED'],
  hulk: ['MELEE', 'TANK', 'BRUTE'],
  speedster: ['MELEE', 'MOBILITY', 'RISK/REWARD'],
};

const SLIDE_DURATION = 0.28;

export class CharacterSelectScreen {
  canvas: GameCanvas;
  gameState: GameState;
  hoveredButton: string | null;
  currentIndex: number;
  slideDir: number; // -1 left, +1 right, 0 none
  slideProgress: number; // 0..1 when sliding
  pulseTime: number;
  lastFrameTime: number;
  // Stat bar animation (interpolates from the previous card's stats)
  barAnimT: number;
  barAnimDuration: number;
  prevStats: PlayerStats | null;
  lastStatsCharId: string | null;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredButton = null;
    this.currentIndex = 0;
    this.slideDir = 0;
    this.slideProgress = 0;
    this.pulseTime = 0;
    this.lastFrameTime = performance.now();
    this.barAnimT = 1;
    this.barAnimDuration = 0.35;
    this.prevStats = null;
    this.lastStatsCharId = null;

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
    const cards = this.getCharacterCards();
    const selected = cards.findIndex(c => c.isSelected);
    this.currentIndex = selected >= 0 ? selected : 0;
    this.slideDir = 0;
    this.slideProgress = 0;
    this.lastFrameTime = performance.now();
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
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

  getCharacterCards(): CharacterCard[] {
    const allIds = CharacterRegistry.getAllIds();
    const unlocked = this.gameState.getUnlockedCharacters();
    const characters = this.gameState.saveData.characters || {};

    return allIds.map(id => {
      const character = CharacterRegistry.get(id);
      const isUnlocked = unlocked.includes(id);
      const condition = CharacterRegistry.getUnlockCondition(id);
      const charSave = characters[id];
      const everPlayed = !!(charSave && (charSave.highestWave > 0 || (charSave.upgradePurchases && Object.values(charSave.upgradePurchases).some(v => v > 0))));
      return {
        id,
        name: character ? character.getName() : id,
        color: character ? character.getColor() : '#444444',
        description: character ? character.getDescription() : '',
        isUnlocked,
        isSelected: id === this.gameState.selectedCharacter,
        unlockCost: condition ? condition.cost : 0,
        unlockDescription: condition ? condition.description : '',
        stats: character ? character.getBaseStats() : null,
        tags: CHARACTER_TAGS[id] || [],
        everPlayed,
      };
    });
  }

  getButtons(): CharSelectButton[] {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const padding = 30;
    const btnH = 44;
    const y = h - padding - btnH;

    // Arrows also act as buttons
    const arrowW = 64;
    const arrowH = 120;
    const arrowY = h / 2 - arrowH / 2;

    return [
      { id: 'back', label: '< BACK', x: padding, y, w: 120, h: btnH },
      { id: 'arrowLeft', label: '<', x: padding, y: arrowY, w: arrowW, h: arrowH },
      { id: 'arrowRight', label: '>', x: w - padding - arrowW, y: arrowY, w: arrowW, h: arrowH },
      { id: 'confirm', label: 'SELECT >', x: w - padding - 200, y, w: 200, h: btnH, primary: true },
    ];
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    this.hoveredButton = null;
    for (const btn of this.getButtons()) {
      if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
          pos.y >= btn.y && pos.y <= btn.y + btn.h) {
        this.hoveredButton = btn.id;
        break;
      }
    }
  }

  rotate(dir: number): void {
    const cards = this.getCharacterCards();
    if (cards.length === 0) return;
    // Capture the current card's stats as the "from" for the stat-bar animation
    const outgoing = cards[this.currentIndex];
    if (outgoing && outgoing.stats) {
      this.prevStats = { ...outgoing.stats };
      this.lastStatsCharId = outgoing.id;
    }
    this.currentIndex = (this.currentIndex + dir + cards.length) % cards.length;
    this.slideDir = dir;
    this.slideProgress = 0;
    this.barAnimT = 0;
  }

  confirmSelection(): void {
    const cards = this.getCharacterCards();
    const card = cards[this.currentIndex];
    if (!card) return;
    if (card.isUnlocked) {
      this.gameState.selectCharacter(card.id);
      this.onStartWaveClick();
    } else {
      const meta = this.gameState.getMeta();
      if (meta.prestigePoints >= card.unlockCost && card.unlockCost > 0) {
        meta.prestigePoints -= card.unlockCost;
        this.gameState.unlockCharacter(card.id);
        this.gameState.selectCharacter(card.id);
      }
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight') {
      this.rotate(1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      this.rotate(-1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      this.confirmSelection();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.onEndRunClick();
      e.preventDefault();
    }
  }

  onClick(_e: MouseEvent): void {
    if (this.hoveredButton === 'back') {
      this.onEndRunClick();
    } else if (this.hoveredButton === 'arrowLeft') {
      this.rotate(-1);
    } else if (this.hoveredButton === 'arrowRight') {
      this.rotate(1);
    } else if (this.hoveredButton === 'confirm') {
      this.confirmSelection();
    }
  }

  onEndRunClick(): void {}
  onStartWaveClick(): void {}

  drawCharacterPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, card: CharacterCard, alpha: number = 1): void {
    const half = size / 2;
    const bodyColor = card.isUnlocked ? card.color : '#333333';
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;

    // Body with slight inset highlight + outline to read more as a sprite
    ctx.fillStyle = bodyColor;
    ctx.fillRect(cx - half, cy - half, size, size);

    // Inset highlight (top-left) for depth
    if (card.isUnlocked) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx - half, cy - half, size, Math.max(4, size * 0.12));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(cx - half, cy + half - Math.max(4, size * 0.1), size, Math.max(4, size * 0.1));
    }
    ctx.strokeStyle = card.isUnlocked ? 'rgba(0,0,0,0.6)' : '#222222';
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeRect(cx - half, cy - half, size, size);

    if (!card.isUnlocked) {
      ctx.globalAlpha = prevAlpha;
      return;
    }

    switch (card.id) {
      case 'wizard': {
        // Hat brim
        ctx.fillStyle = '#112266';
        ctx.fillRect(cx - size * 0.55, cy - half - 2, size * 1.1, 8);
        // Cone
        ctx.fillStyle = '#2244AA';
        ctx.beginPath();
        ctx.moveTo(cx, cy - half - size * 0.42);
        ctx.lineTo(cx - size * 0.4, cy - half + 4);
        ctx.lineTo(cx + size * 0.4, cy - half + 4);
        ctx.closePath();
        ctx.fill();
        // Star on hat
        ctx.fillStyle = '#FFD700';
        const sx = cx, sy = cy - half - size * 0.18;
        const sr = 10;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const ang = -Math.PI / 2 + (Math.PI * k) / 5;
          const r = k % 2 === 0 ? sr : sr * 0.45;
          const px = sx + Math.cos(ang) * r;
          const py = sy + Math.sin(ang) * r;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        // Beard hint
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(cx - size * 0.18, cy + size * 0.18, size * 0.36, size * 0.14);
        break;
      }
      case 'hulk': {
        // Big fists with knuckle shading
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(cx - half - 28, cy - 10, 34, 48);
        ctx.fillRect(cx + half - 6, cy - 10, 34, 48);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(cx - half - 28, cy - 10, 34, 6);
        ctx.fillRect(cx + half - 6, cy - 10, 34, 6);
        ctx.fillStyle = '#5A2A0A';
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(cx - half - 24 + k * 10, cy + 4, 4, 4);
          ctx.fillRect(cx + half - 2 + k * 10, cy + 4, 4, 4);
        }
        // Angry brow
        ctx.fillStyle = '#000000';
        ctx.fillRect(cx - size * 0.28, cy - size * 0.18, size * 0.22, 5);
        ctx.fillRect(cx + size * 0.06, cy - size * 0.18, size * 0.22, 5);
        break;
      }
      case 'vampire': {
        // Cape behind body
        ctx.fillStyle = '#550000';
        ctx.beginPath();
        ctx.moveTo(cx - half - 18, cy - half + 10);
        ctx.lineTo(cx + half + 18, cy - half + 10);
        ctx.lineTo(cx + half + 8, cy + half);
        ctx.lineTo(cx - half - 8, cy + half);
        ctx.closePath();
        ctx.fill();
        // Re-draw body on top of the cape shoulders
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx - half, cy - half, size, size);
        // Fangs
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.18, cy + size * 0.05);
        ctx.lineTo(cx - size * 0.1, cy + size * 0.05);
        ctx.lineTo(cx - size * 0.14, cy + size * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + size * 0.18, cy + size * 0.05);
        ctx.lineTo(cx + size * 0.1, cy + size * 0.05);
        ctx.lineTo(cx + size * 0.14, cy + size * 0.28);
        ctx.closePath();
        ctx.fill();
        // Red eyes
        ctx.fillStyle = '#FF2222';
        ctx.fillRect(cx - size * 0.22, cy - size * 0.18, 12, 12);
        ctx.fillRect(cx + size * 0.14, cy - size * 0.18, 12, 12);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - size * 0.18, cy - size * 0.16, 3, 3);
        ctx.fillRect(cx + size * 0.18, cy - size * 0.16, 3, 3);
        break;
      }
      case 'speedster': {
        // Motion streaks (larger + more crisp)
        ctx.fillStyle = card.color;
        ctx.globalAlpha = prevAlpha * alpha * 0.55;
        ctx.fillRect(cx - half - 28, cy - half + 12, 22, size - 24);
        ctx.globalAlpha = prevAlpha * alpha * 0.32;
        ctx.fillRect(cx - half - 56, cy - half + 24, 20, size - 48);
        ctx.globalAlpha = prevAlpha * alpha * 0.18;
        ctx.fillRect(cx - half - 82, cy - half + 34, 18, size - 68);
        ctx.globalAlpha = prevAlpha * alpha;
        // Focused eyes
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - size * 0.2, cy - size * 0.08, 10, 6);
        ctx.fillRect(cx + size * 0.1, cy - size * 0.08, 10, 6);
        break;
      }
      case 'capitalist': {
        // Top hat
        ctx.fillStyle = '#111111';
        ctx.fillRect(cx - size * 0.5, cy - half - 4, size, 8);
        ctx.fillRect(cx - size * 0.28, cy - half - size * 0.35, size * 0.56, size * 0.35);
        ctx.fillStyle = '#558855';
        ctx.fillRect(cx - size * 0.28, cy - half - size * 0.12, size * 0.56, 6);
        // $ sign
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.floor(size * 0.6)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', cx, cy + size * 0.08);
        ctx.textBaseline = 'alphabetic';
        break;
      }
      case 'manager': {
        // White shirt collar
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.28, cy - half + 2);
        ctx.lineTo(cx + size * 0.28, cy - half + 2);
        ctx.lineTo(cx + 12, cy - half + 22);
        ctx.lineTo(cx, cy - half + 30);
        ctx.lineTo(cx - 12, cy - half + 22);
        ctx.closePath();
        ctx.fill();
        // Red tie
        ctx.fillStyle = '#CC2222';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - half + 18);
        ctx.lineTo(cx + 10, cy - half + 18);
        ctx.lineTo(cx + 6, cy);
        ctx.lineTo(cx, cy + size * 0.3);
        ctx.lineTo(cx - 6, cy);
        ctx.closePath();
        ctx.fill();
        // Tie knot highlight
        ctx.fillStyle = '#881111';
        ctx.fillRect(cx - 7, cy - half + 18, 14, 6);
        break;
      }
      case 'glassCannon': {
        // Crosshair with outer ring + center dot
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.42, cy);
        ctx.lineTo(cx - size * 0.22, cy);
        ctx.moveTo(cx + size * 0.22, cy);
        ctx.lineTo(cx + size * 0.42, cy);
        ctx.moveTo(cx, cy - size * 0.42);
        ctx.lineTo(cx, cy - size * 0.22);
        ctx.moveTo(cx, cy + size * 0.22);
        ctx.lineTo(cx, cy + size * 0.42);
        ctx.stroke();
        // Center dot
        ctx.fillStyle = '#FF3333';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'fighter':
      default: {
        // Eyes (determined stare)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - size * 0.22, cy - size * 0.2, 10, 10);
        ctx.fillRect(cx + size * 0.12, cy - size * 0.2, 10, 10);
        ctx.fillStyle = '#000000';
        ctx.fillRect(cx - size * 0.2, cy - size * 0.18, 5, 6);
        ctx.fillRect(cx + size * 0.14, cy - size * 0.18, 5, 6);
        // Determined mouth arc
        ctx.strokeStyle = '#003300';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.22, cy + size * 0.1);
        ctx.lineTo(cx, cy - size * 0.1);
        ctx.lineTo(cx + size * 0.22, cy + size * 0.1);
        ctx.stroke();
        ctx.lineCap = 'square';
        break;
      }
    }

    ctx.globalAlpha = prevAlpha;
  }

  drawStatBars(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    stats: PlayerStats,
    fromStats: PlayerStats | null = null,
    animT: number = 1
  ): void {
    const t = this.easeOutCubic(Math.max(0, Math.min(1, animT)));
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const fs = fromStats;
    const bars: { label: string; value: number; from: number; max: number; color: string }[] = [
      { label: 'HP',  value: stats.health, from: fs ? fs.health : stats.health, max: 50,  color: '#FF5555' },
      { label: 'SPD', value: stats.speed,  from: fs ? fs.speed  : stats.speed,  max: 300, color: '#55AAFF' },
      { label: 'DMG', value: stats.damage, from: fs ? fs.damage : stats.damage, max: 3,   color: '#FFAA55' },
    ];
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const by = y + i * 22;
      const curValue = fs ? lerp(b.from, b.value) : b.value;
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.fillText(b.label, x, by + 12);
      const barX = x + 42;
      const barW = w - 42;
      ctx.fillStyle = '#111111';
      ctx.fillRect(barX, by, barW, 14);
      const pct = Math.min(1, curValue / b.max);
      ctx.fillStyle = b.color;
      ctx.fillRect(barX, by, barW * pct, 14);
      // Highlight the animating tip
      if (fs && t < 1 && Math.abs(b.value - b.from) > 0.001) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(barX + Math.max(0, barW * pct - 2), by, 2, 14);
      }
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, by, barW, 14);
    }
  }

  drawCardBody(ctx: CanvasRenderingContext2D, card: CharacterCard, cx: number, cy: number, scale: number, alpha: number, isCenter: boolean = false): void {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;

    const cardW = 440 * scale;
    const cardH = 520 * scale;
    const x = cx - cardW / 2;
    const y = cy - cardH / 2;
    // Portrait shrunk slightly (was 220) to give the description block room
    // to show 6 lines instead of 4 — character kits need more than a tagline.
    const portraitSize = 200 * scale;

    // Card background
    if (card.isSelected) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.08)';
      ctx.fillRect(x, y, cardW, cardH);
    } else if (!card.isUnlocked) {
      ctx.fillStyle = 'rgba(20, 20, 20, 0.5)';
      ctx.fillRect(x, y, cardW, cardH);
    } else {
      ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
      ctx.fillRect(x, y, cardW, cardH);
    }

    ctx.strokeStyle = card.isUnlocked ? (card.isSelected ? COLORS.UI_TEXT : card.color) : '#333333';
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.strokeRect(x, y, cardW, cardH);

    // Pulsing ring for Glass Cannon identity
    if (card.id === 'glassCannon' && card.isUnlocked) {
      const pulse = 0.5 + 0.5 * Math.sin(this.pulseTime * 4);
      ctx.strokeStyle = '#FF3333';
      ctx.globalAlpha = prevAlpha * alpha * (0.3 + 0.4 * pulse);
      ctx.lineWidth = 4 * scale;
      const pad = 12 * scale;
      ctx.strokeRect(x - pad, y - pad, cardW + pad * 2, cardH + pad * 2);
      ctx.globalAlpha = prevAlpha * alpha;
    }

    const portraitCX = cx;
    const portraitCY = y + 30 * scale + portraitSize / 2;
    this.drawCharacterPortrait(ctx, portraitCX, portraitCY, portraitSize, card, alpha);

    if (!card.isUnlocked) {
      // Draw a simple geometric padlock (reads consistently across platforms)
      const lockCX = portraitCX;
      const lockCY = portraitCY + 6 * scale;
      const bodyW = 52 * scale;
      const bodyH = 40 * scale;
      const shackleR = 16 * scale;
      // Shackle
      ctx.strokeStyle = '#DDDDDD';
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.arc(lockCX, lockCY - bodyH * 0.5, shackleR, Math.PI, 0, false);
      ctx.stroke();
      // Body
      ctx.fillStyle = '#BBBBBB';
      ctx.fillRect(lockCX - bodyW / 2, lockCY - bodyH / 2 + 4 * scale, bodyW, bodyH);
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(lockCX - bodyW / 2, lockCY - bodyH / 2 + 4 * scale, bodyW, bodyH);
      // Keyhole
      ctx.fillStyle = '#222222';
      ctx.beginPath();
      ctx.arc(lockCX, lockCY, 4 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(lockCX - 2 * scale, lockCY, 4 * scale, 10 * scale);
    }

    // NEW badge
    if (card.isUnlocked && !card.everPlayed) {
      const badgeW = 52 * scale;
      const badgeH = 22 * scale;
      const badgeX = x + cardW - badgeW - 10 * scale;
      const badgeY = y + 10 * scale;
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.floor(14 * scale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('NEW', badgeX + badgeW / 2, badgeY + badgeH / 2 + 5 * scale);
    }

    // Name
    ctx.font = `bold ${Math.floor(28 * scale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = card.isUnlocked ? COLORS.UI_TEXT : '#AAAAAA';
    ctx.fillText(card.name, cx, y + portraitSize + 70 * scale);

    // Description / unlock hint (wrapped). The description block starts well
    // below the name baseline — 28px name + its descenders (e.g. the `g` in
    // "Fighter") need ~12-14px of breathing room before the 13px description
    // font starts, or the two blocks visually collide on any character whose
    // name contains a descender. 6-line cap keeps us clear of the stat bars.
    ctx.font = `${Math.floor(13 * scale)}px monospace`;
    ctx.fillStyle = COLORS.UI_INACTIVE;
    const body = card.isUnlocked ? card.description : card.unlockDescription;
    const lines = this.wrapText(body, cardW - 40 * scale, 13 * scale);
    const descStartY = y + portraitSize + 100 * scale;
    const descLineH = 15 * scale;
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      ctx.fillText(lines[i], cx, descStartY + i * descLineH);
    }

    // Stats / unlock cost
    if (card.isUnlocked && card.stats) {
      const fromStats = isCenter && this.barAnimT < 1 && this.prevStats ? this.prevStats : null;
      const animT = isCenter ? this.barAnimT : 1;
      this.drawStatBars(ctx, x + 40 * scale, y + cardH - 110 * scale, cardW - 80 * scale, card.stats, fromStats, animT);
    } else if (card.unlockCost > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = `bold ${Math.floor(22 * scale)}px monospace`;
      ctx.fillText(`${card.unlockCost} PP to unlock`, cx, y + cardH - 60 * scale);
    }

    // Tags along the bottom
    if (card.tags.length > 0) {
      const tagY = y + cardH - 30 * scale;
      let tagX = x + 20 * scale;
      ctx.font = `bold ${Math.floor(11 * scale)}px monospace`;
      ctx.textAlign = 'left';
      for (const tag of card.tags) {
        const tagW = tag.length * 7 * scale + 12 * scale;
        ctx.strokeStyle = card.isUnlocked ? card.color : '#444444';
        ctx.lineWidth = 1;
        ctx.strokeRect(tagX, tagY - 13 * scale, tagW, 18 * scale);
        ctx.fillStyle = card.isUnlocked ? card.color : '#666666';
        ctx.fillText(tag, tagX + 6 * scale, tagY);
        tagX += tagW + 6 * scale;
      }
    }

    ctx.globalAlpha = prevAlpha;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.pulseTime += dt;

    // Advance slide animation
    if (this.slideDir !== 0) {
      this.slideProgress += dt / SLIDE_DURATION;
      if (this.slideProgress >= 1) {
        this.slideProgress = 0;
        this.slideDir = 0;
      }
    }
    // Advance stat-bar animation independently (runs a bit longer than slide)
    if (this.barAnimT < 1) {
      this.barAnimT = Math.min(1, this.barAnimT + dt / this.barAnimDuration);
    }

    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);

    // Title
    drawTitle(ctx, 'SELECT CHARACTER', w / 2, 58, { size: 36, shimmer: true });

    // Top bar: PP + position indicator
    const cards = this.getCharacterCards();
    const meta = this.gameState.getMeta();
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ACCENT_GOLD;
    ctx.fillText(`PP: ${meta.prestigePoints}`, w - 30, 34);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '14px monospace';
    ctx.fillText(`${this.currentIndex + 1} / ${cards.length}`, 30, 34);

    // Position dots
    const dotY = 78;
    const dotGap = 18;
    const totalDotsW = (cards.length - 1) * dotGap;
    const dotStartX = w / 2 - totalDotsW / 2;
    for (let i = 0; i < cards.length; i++) {
      const isActive = i === this.currentIndex;
      ctx.fillStyle = isActive ? COLORS.UI_TEXT : '#444444';
      ctx.beginPath();
      ctx.arc(dotStartX + i * dotGap, dotY, isActive ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw carousel: center + side cards during slide
    const centerX = w / 2;
    const centerY = h / 2 + 10;

    const prevIdx = (this.currentIndex - this.slideDir + cards.length) % cards.length;

    if (this.slideDir !== 0) {
      const t = this.easeOutCubic(this.slideProgress);
      // Outgoing card slides from center to -slideDir
      const outOffset = centerX + -this.slideDir * (w * 0.9) * t;
      const outScale = 1 - 0.2 * t;
      const outAlpha = 1 - t;
      this.drawCardBody(ctx, cards[prevIdx], outOffset, centerY, outScale, outAlpha, false);
      // Incoming slides from +slideDir to center
      const inOffset = centerX + this.slideDir * (w * 0.9) * (1 - t);
      const inScale = 0.8 + 0.2 * t;
      const inAlpha = t;
      this.drawCardBody(ctx, cards[this.currentIndex], inOffset, centerY, inScale, inAlpha, true);
    } else {
      this.drawCardBody(ctx, cards[this.currentIndex], centerX, centerY, 1, 1, true);
    }

    // Side peek: show the next/prev cards faintly on either side.
    // Hide peeks at narrow widths to avoid overlap with the center card
    // (center card is 440 wide; at 0.45 scale peeks are ~200 wide).
    if (this.slideDir === 0 && w >= 1080) {
      const peekOffset = Math.min(340, (w - 440) / 2 - 40);
      if (peekOffset >= 260) {
        const prevIndex = (this.currentIndex - 1 + cards.length) % cards.length;
        const nextIndex = (this.currentIndex + 1) % cards.length;
        this.drawCardBody(ctx, cards[prevIndex], centerX - peekOffset, centerY, 0.45, 0.35);
        this.drawCardBody(ctx, cards[nextIndex], centerX + peekOffset, centerY, 0.45, 0.35);
      }
    }

    // Arrow buttons
    this.drawArrowButton(ctx, 'arrowLeft', '<');
    this.drawArrowButton(ctx, 'arrowRight', '>');

    // Bottom buttons
    for (const btn of this.getButtons()) {
      if (btn.id === 'arrowLeft' || btn.id === 'arrowRight') continue;
      const hovered = this.hoveredButton === btn.id;
      if (btn.primary) {
        drawPrimaryButton(ctx, btn.x, btn.y, btn.w, btn.h, 'SELECT', {
          hovered,
          hint: '[ENTER]',
        });
      } else {
        drawSecondaryButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, { hovered });
      }
    }

    // Hint text
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Left/Right: rotate  -  Enter: select  -  Esc: back', w / 2, h - 18);
  }

  private drawArrowButton(ctx: CanvasRenderingContext2D, id: string, label: string): void {
    const btn = this.getButtons().find(b => b.id === id);
    if (!btn) return;
    const hovered = this.hoveredButton === id;
    ctx.fillStyle = hovered ? 'rgba(0, 255, 0, 0.14)' : 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = hovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = hovered ? 3 : 2;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = hovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 14);
  }

  private easeOutCubic(t: number): number {
    const x = 1 - t;
    return 1 - x * x * x;
  }

  wrapText(text: string, maxWidth: number, fontSizePx: number = 13): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    const charW = fontSizePx * 0.6;
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (test.length * charW > maxWidth) {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          lines.push(word);
        }
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
