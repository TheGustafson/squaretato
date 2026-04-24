import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawPrimaryButton } from './drawHelpers';

interface TutorialMessage {
  flagKey: string;
  title: string;
  body: string;
}

const MESSAGES: Record<string, TutorialMessage> = {
  gameplay: {
    flagKey: 'tut_gameplay',
    title: 'MOVEMENT',
    body: 'Move with WASD. You auto-aim and auto-fire. Keep moving — standing still gets you hit.',
  },
  shop: {
    flagKey: 'tut_shop',
    title: 'SHOP',
    body: 'Buy weapons, spells, or items with cash dropped by enemies. Stock up between waves.',
  },
  upgrade: {
    flagKey: 'tut_upgrade',
    title: 'UPGRADES',
    body: 'Pick a free stat upgrade each wave. Skip if nothing fits, or reroll (costs gold).',
  },
  death: {
    flagKey: 'tut_death',
    title: 'DEATH',
    body: 'Runs end at 0 HP. You keep prestige, unlocks, and permanent stat upgrades. Your weapons/items reset.',
  },
  buildupMeter: {
    flagKey: 'tut_buildup_meter',
    title: 'BUILDUP METER',
    body: 'Every character has a passive meter under them. Fill it (kill, damage, movement) to trigger a short burst. Watch for it to feel the power curve.',
  },
  characterScreen: {
    flagKey: 'tut_character_screen',
    title: 'CHARACTER',
    body: 'Spend gold on permanent stat upgrades. These survive death and stack across runs.',
  },
};

export class TutorialOverlay {
  canvas: GameCanvas;
  gameState: GameState;
  active: boolean;
  current: TutorialMessage | null;
  dismissHovered: boolean;
  handleClick: (e: MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  listenersActive: boolean;
  private cachedLayout: {
    card: { x: number; y: number; w: number; h: number };
    dismiss: { x: number; y: number; w: number; h: number };
    bodyLines: string[];
    titleY: number;
    bodyStartY: number;
    bodyLineHeight: number;
    bodyX: number;
    bodyMaxWidth: number;
  } | null;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.active = false;
    this.current = null;
    this.dismissHovered = false;
    this.listenersActive = false;
    this.cachedLayout = null;
    this.handleClick = (e) => this.onClick(e);
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  // Show a tutorial only the first time for a given key. Returns true if shown.
  maybeShow(key: keyof typeof MESSAGES): boolean {
    const msg = MESSAGES[key];
    if (!msg) return false;
    if (this.gameState.hasTutorialFlag(msg.flagKey)) return false;
    this.current = msg;
    this.active = true;
    this.cachedLayout = null;
    this.attach();
    return true;
  }

  isActive(): boolean { return this.active; }

  private attach(): void {
    if (this.listenersActive) return;
    this.canvas.addEventListener('click', this.handleClick, true);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('keydown', this.handleKeyDown, true);
    this.listenersActive = true;
  }

  private detach(): void {
    if (!this.listenersActive) return;
    this.canvas.removeEventListener('click', this.handleClick, true);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    this.listenersActive = false;
  }

  dismiss(): void {
    if (!this.active || !this.current) return;
    this.gameState.setTutorialFlag(this.current.flagKey);
    this.active = false;
    this.current = null;
    this.dismissHovered = false;
    this.cachedLayout = null;
    this.detach();
  }

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  // Compute wrapped body lines without drawing. Assumes ctx font is set by caller.
  private computeWrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private computeLayout(ctx: CanvasRenderingContext2D): NonNullable<TutorialOverlay['cachedLayout']> {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const cardW = Math.min(520, w - 80);
    const padX = 30;
    const bodyMaxWidth = cardW - padX * 2;
    const bodyLineHeight = 22;

    // Layout metrics.
    const titleSpace = 60;   // top padding + title baseline region
    const bodyTopGap = 24;   // gap from title bottom to body start
    const btnH = 44;
    const btnBottomPad = 24;
    const bodyBottomGap = 24; // gap between body and button

    ctx.save();
    ctx.font = '14px monospace';
    const bodyLines = this.current ? this.computeWrappedLines(ctx, this.current.body, bodyMaxWidth) : [];
    ctx.restore();

    const bodyHeight = bodyLines.length * bodyLineHeight;
    let cardH = titleSpace + bodyTopGap + bodyHeight + bodyBottomGap + btnH + btnBottomPad;
    cardH = Math.max(200, Math.min(300, cardH));

    const cardX = Math.floor((w - cardW) / 2);
    const cardY = Math.floor((h - cardH) / 2);

    const btnW = 160;
    const dismissX = cardX + (cardW - btnW) / 2;
    const dismissY = cardY + cardH - btnH - btnBottomPad;

    const titleY = cardY + 44;
    const bodyStartY = cardY + titleSpace + bodyTopGap;
    const bodyX = cardX + padX;

    return {
      card: { x: cardX, y: cardY, w: cardW, h: cardH },
      dismiss: { x: dismissX, y: dismissY, w: btnW, h: btnH },
      bodyLines,
      titleY,
      bodyStartY,
      bodyLineHeight,
      bodyX,
      bodyMaxWidth,
    };
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.active || !this.cachedLayout) return;
    const p = this.getMousePosition(e);
    const L = this.cachedLayout;
    this.dismissHovered = p.x >= L.dismiss.x && p.x <= L.dismiss.x + L.dismiss.w && p.y >= L.dismiss.y && p.y <= L.dismiss.y + L.dismiss.h;
  }

  onClick(e: MouseEvent): void {
    if (!this.active) return;
    e.stopPropagation();
    this.dismiss();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.dismiss();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.active || !this.current) return;
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    ctx.save();
    // Semi-transparent dark backdrop.
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    const L = this.computeLayout(ctx);
    this.cachedLayout = L;

    // Card background panel.
    drawPanel(ctx, L.card.x, L.card.y, L.card.w, L.card.h, { accent: 'cyan' });

    // Title: 24px bold, centered at top.
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(this.current.title, L.card.x + L.card.w / 2, L.titleY);

    // Body: 14px, left-aligned.
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    let yy = L.bodyStartY;
    for (const line of L.bodyLines) {
      ctx.fillText(line, L.bodyX, yy);
      yy += L.bodyLineHeight;
    }

    // Dismiss button: primary style, centered at bottom.
    drawPrimaryButton(ctx, L.dismiss.x, L.dismiss.y, L.dismiss.w, L.dismiss.h, 'DISMISS', {
      hovered: this.dismissHovered,
      hint: '[ENTER]',
    });

    ctx.restore();
  }
}
