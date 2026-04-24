import { COLORS } from '../constants';
import type { GameCanvas, AchievementDefinition, AchievementTier, MetaData } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawSecondaryButton, drawTitle } from './drawHelpers';

function tierColor(tier: AchievementTier): string {
  if (tier === 'gold') return '#FFD700';
  if (tier === 'silver') return '#C0C0C0';
  return '#CD7F32';
}

const ROW_H = 72;

export class AchievementsScreen {
  canvas: GameCanvas;
  gameState: GameState;
  scrollY: number;
  maxScroll: number;
  backHovered: boolean;
  draggingThumb: boolean;
  dragOffsetY: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleWheel: (e: WheelEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.scrollY = 0;
    this.maxScroll = 0;
    this.backHovered = false;
    this.draggingThumb = false;
    this.dragOffsetY = 0;
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleMouseDown = (e) => this.onMouseDown(e);
    this.handleMouseUp = () => this.onMouseUp();
    this.handleClick = (e) => this.onClick(e);
    this.handleWheel = (e) => this.onWheel(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(): void {
    this.scrollY = 0;
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.draggingThumb = false;
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      this.onBackClick();
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      this.scrollY = Math.min(this.maxScroll, this.scrollY + 60);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      this.scrollY = Math.max(0, this.scrollY - 60);
    }
  }

  onBackClick(): void {}

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private getLayout() {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const listTop = 140;
    const listBottom = h - 40;
    const listH = listBottom - listTop;
    const listX = 40;
    const listW = w - 80 - 16; // scrollbar column on right
    return {
      back: { x: w - 120, y: 24, w: 100, h: 40 },
      listX, listTop, listH, listW,
      scrollbar: { x: listX + listW + 4, y: listTop, w: 12, h: listH },
    };
  }

  onMouseMove(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    this.backHovered = p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h;
    if (this.draggingThumb) {
      const track = L.scrollbar;
      const contentH = this.getContentHeight();
      const thumbH = Math.max(30, (L.listH / contentH) * L.listH);
      const available = L.listH - thumbH;
      const newTop = p.y - this.dragOffsetY - track.y;
      const ratio = Math.max(0, Math.min(1, newTop / available));
      this.scrollY = ratio * this.maxScroll;
    }
  }

  onMouseDown(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    const contentH = this.getContentHeight();
    if (contentH <= L.listH) return;
    const track = L.scrollbar;
    const thumbH = Math.max(30, (L.listH / contentH) * L.listH);
    const ratio = this.maxScroll > 0 ? this.scrollY / this.maxScroll : 0;
    const thumbY = track.y + ratio * (L.listH - thumbH);
    if (p.x >= track.x && p.x <= track.x + track.w && p.y >= thumbY && p.y <= thumbY + thumbH) {
      this.draggingThumb = true;
      this.dragOffsetY = p.y - thumbY;
    }
  }

  onMouseUp(): void { this.draggingThumb = false; }

  onClick(e: MouseEvent): void {
    if (this.draggingThumb) return;
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    if (p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h) {
      this.onBackClick();
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scrollY = Math.max(0, Math.min(this.maxScroll, this.scrollY + e.deltaY));
  }

  private getContentHeight(): number {
    const defs = this.gameState.getAchievementDefinitions();
    return defs.length * (ROW_H + 6);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);

    const meta = this.gameState.getMeta();
    const defs = this.gameState.getAchievementDefinitions();
    const unlocked = meta.achievements || [];
    const totalPp = defs.reduce((sum, d) => sum + (unlocked.includes(d.id) ? (d.reward?.prestigePoints || 0) : 0), 0);

    // Title
    drawTitle(ctx, 'ACHIEVEMENTS', 40, 62, { size: 34, align: 'left', shimmer: true });

    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText(`${unlocked.length} / ${defs.length} unlocked`, 40, 88);
    ctx.fillStyle = COLORS.ACCENT_GOLD;
    ctx.fillText(`+${totalPp} PP earned from achievements`, 40, 108);

    // Back button (top-right)
    const L = this.getLayout();
    drawSecondaryButton(ctx, L.back.x, L.back.y, L.back.w, L.back.h, '< BACK', {
      hovered: this.backHovered,
    });

    // Clip area for list
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.listX, L.listTop, L.listW, L.listH);
    ctx.clip();

    // Rows
    const contentH = this.getContentHeight();
    this.maxScroll = Math.max(0, contentH - L.listH);
    if (this.scrollY > this.maxScroll) this.scrollY = this.maxScroll;

    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const isUnlocked = unlocked.includes(def.id);
      const rowY = L.listTop + i * (ROW_H + 6) - this.scrollY;
      if (rowY + ROW_H < L.listTop || rowY > L.listTop + L.listH) continue;
      this.renderRow(ctx, def, isUnlocked, meta, L.listX, rowY, L.listW);
    }

    ctx.restore();

    // Scrollbar
    if (contentH > L.listH) {
      const track = L.scrollbar;
      ctx.strokeStyle = COLORS.UI_INACTIVE;
      ctx.lineWidth = 1;
      ctx.strokeRect(track.x, track.y, track.w, track.h);
      const thumbH = Math.max(30, (L.listH / contentH) * L.listH);
      const ratio = this.maxScroll > 0 ? this.scrollY / this.maxScroll : 0;
      const thumbY = track.y + ratio * (L.listH - thumbH);
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillRect(track.x + 2, thumbY, track.w - 4, thumbH);
    }
  }

  private renderRow(
    ctx: CanvasRenderingContext2D,
    def: AchievementDefinition,
    unlocked: boolean,
    meta: MetaData,
    x: number, y: number, w: number,
  ): void {
    const tc = tierColor(def.tier);
    const hidden = !!def.hidden && !unlocked;

    // Panel row with tier-colored border + left accent stripe.
    drawPanel(ctx, x, y, w, ROW_H, {
      borderColor: unlocked ? tc : COLORS.BORDER_STRONG,
      raised: true,
      alpha: unlocked ? 1 : 0.75,
    });
    ctx.fillStyle = unlocked ? tc : COLORS.BORDER_STRONG;
    ctx.fillRect(x, y, 3, ROW_H);

    // Icon square
    const iconSize = 50;
    const ix = x + 10, iy = y + (ROW_H - iconSize) / 2;
    ctx.fillStyle = unlocked ? tc : '#222';
    ctx.fillRect(ix, iy, iconSize, iconSize);
    ctx.fillStyle = unlocked ? '#000' : '#555';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(hidden ? '?' : def.icon, ix + iconSize / 2, iy + iconSize / 2 + 11);

    // Name + desc
    ctx.textAlign = 'left';
    ctx.fillStyle = unlocked ? COLORS.UI_TEXT : '#888';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(hidden ? '???' : def.name, ix + iconSize + 14, y + 22);

    ctx.fillStyle = unlocked ? COLORS.UI_INACTIVE : '#888';
    ctx.font = '12px monospace';
    // Truncate long descriptions with an ellipsis so the cutoff is visible.
    const descText = hidden
      ? 'Hidden — unlock to reveal'
      : (def.description.length > 60 ? def.description.substring(0, 57) + '…' : def.description);
    ctx.fillText(descText, ix + iconSize + 14, y + 42);

    // Progress text
    if (def.progressField && def.progressTarget) {
      const metaAny = meta as unknown as Record<string, number>;
      const cur = Math.min(metaAny[def.progressField] || 0, def.progressTarget);
      ctx.fillStyle = unlocked ? tc : '#777';
      ctx.font = '11px monospace';
      ctx.fillText(`${cur} / ${def.progressTarget}`, ix + iconSize + 14, y + 60);
    } else {
      ctx.fillStyle = unlocked ? tc : '#888';
      ctx.font = '11px monospace';
      ctx.fillText(unlocked ? 'UNLOCKED' : 'LOCKED', ix + iconSize + 14, y + 60);
    }

    // Reward badge
    if (def.reward?.prestigePoints) {
      ctx.textAlign = 'right';
      ctx.fillStyle = unlocked ? '#FFD700' : '#555';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`+${def.reward.prestigePoints} PP`, x + w - 12, y + 24);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = unlocked ? tc : '#888';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(def.tier.toUpperCase(), x + w - 12, y + 44);
  }
}
