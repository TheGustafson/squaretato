import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { drawTitle, drawVignette } from './drawHelpers';

type ButtonTone = 'primary' | 'neutral' | 'warn' | 'danger';

interface PauseButton {
  id: string;
  label: string;
  sublabel?: string;
  tone: ButtonTone;
  x: number; y: number; w: number; h: number;
}

interface ToneColors {
  border: string;
  borderHover: string;
  fill: string;
  fillHover: string;
  text: string;
  textHover: string;
}

const TONE_COLORS: Record<ButtonTone, ToneColors> = {
  primary: {
    border: '#00AA44', borderHover: '#00FF88',
    fill: 'rgba(0, 80, 0, 0.35)', fillHover: 'rgba(0, 255, 0, 0.18)',
    text: '#00FF88', textHover: '#FFFFFF',
  },
  neutral: {
    border: '#555555', borderHover: '#AAAAAA',
    fill: 'rgba(30, 30, 30, 0.4)', fillHover: 'rgba(80, 80, 80, 0.4)',
    text: '#BBBBBB', textHover: '#FFFFFF',
  },
  warn: {
    border: '#AA7700', borderHover: '#FFB733',
    fill: 'rgba(60, 40, 0, 0.4)', fillHover: 'rgba(255, 170, 0, 0.2)',
    text: '#FFB733', textHover: '#FFFFFF',
  },
  danger: {
    border: '#AA2222', borderHover: '#FF5555',
    fill: 'rgba(60, 0, 0, 0.4)', fillHover: 'rgba(255, 30, 30, 0.22)',
    text: '#FF7777', textHover: '#FFFFFF',
  },
};

export class PauseMenu {
  canvas: GameCanvas;
  hovered: string | null;
  selectedIndex: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas) {
    this.canvas = canvas;
    this.hovered = null;
    this.selectedIndex = 0;

    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
    this.selectedIndex = 0;
    this.hovered = null;
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  getButtons(): PauseButton[] {
    const cx = this.canvas.logicalWidth / 2;
    const btnW = 340;
    const btnH = 56;
    const gap = 14;
    const startY = this.canvas.logicalHeight * 0.38;

    const defs: Array<Omit<PauseButton, 'x' | 'y' | 'w' | 'h'>> = [
      { id: 'resume', label: 'RESUME', sublabel: 'back to the fight', tone: 'primary' },
      { id: 'options', label: 'OPTIONS', sublabel: 'audio, controls, display', tone: 'neutral' },
      { id: 'saveQuit', label: 'SAVE & QUIT', sublabel: 'returns to menu (run saved)', tone: 'warn' },
      { id: 'mainMenu', label: 'MAIN MENU', sublabel: 'keeps progress, mid-wave state lost', tone: 'danger' },
    ];

    return defs.map((d, i) => ({
      ...d,
      x: cx - btnW / 2,
      y: startY + (btnH + gap) * i,
      w: btnW,
      h: btnH,
    }));
  }

  onMouseMove(e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    const p = this.getMousePosition(e);
    this.hovered = null;
    const buttons = this.getButtons();
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.hovered = b.id;
        this.selectedIndex = i;
        break;
      }
    }
  }

  onClick(_e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    if (!this.hovered) return;
    this.activateButton(this.hovered);
  }

  private activateButton(id: string): void {
    if (id === 'resume') this.onResumeClick();
    else if (id === 'options') this.onOptionsClick();
    else if (id === 'saveQuit') this.onSaveQuitClick();
    else if (id === 'mainMenu') {
      ConfirmDialog.show({
        title: 'RETURN TO MENU',
        message: 'Return to menu? Mid-wave progress will be lost.',
        confirmText: 'RETURN',
        onConfirm: () => this.onMainMenuClick(),
      });
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onResumeClick();
      return;
    }
    const buttons = this.getButtons();
    if (e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % buttons.length;
      this.hovered = buttons[this.selectedIndex].id;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + buttons.length) % buttons.length;
      this.hovered = buttons[this.selectedIndex].id;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const btn = buttons[this.selectedIndex];
      if (btn) this.activateButton(btn.id);
    }
  }

  onResumeClick(): void {}
  onOptionsClick(): void {}
  onSaveQuitClick(): void {}
  onMainMenuClick(): void {}

  render(ctx: CanvasRenderingContext2D): void {
    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;

    // Layered dim overlay to approximate blur
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 10, 0, 0.35)';
    ctx.fillRect(0, 0, W, H);

    // Vignette for focus.
    drawVignette(ctx, W, H, 0.4);

    // Subtle scanline bands
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }

    const cx = W / 2;

    // Title with shimmer + glow.
    const titleY = H * 0.22;
    drawTitle(ctx, 'PAUSED', cx, titleY, { size: 52, align: 'center', shimmer: true, glow: true });

    // Decorative brackets
    ctx.strokeStyle = COLORS.UI_INACTIVE;
    ctx.lineWidth = 2;
    const bw = 20;
    const by = titleY - 32;
    ctx.beginPath();
    ctx.moveTo(cx - 130, by); ctx.lineTo(cx - 130 + bw, by); ctx.moveTo(cx - 130, by); ctx.lineTo(cx - 130, by + 44);
    ctx.moveTo(cx + 130, by); ctx.lineTo(cx + 130 - bw, by); ctx.moveTo(cx + 130, by); ctx.lineTo(cx + 130, by + 44);
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('ESC to resume  -  UP / DOWN to select  -  ENTER to activate', cx, titleY + 24);

    // Buttons
    const buttons = this.getButtons();
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const hover = this.hovered === btn.id || this.selectedIndex === i;
      const tc = TONE_COLORS[btn.tone];

      ctx.fillStyle = hover ? tc.fillHover : tc.fill;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

      ctx.strokeStyle = hover ? tc.borderHover : tc.border;
      ctx.lineWidth = hover ? 3 : 2;
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

      // Selection caret
      if (hover) {
        ctx.fillStyle = tc.borderHover;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('>', btn.x + 12, btn.y + btn.h / 2 + 6);
        ctx.textAlign = 'right';
        ctx.fillText('<', btn.x + btn.w - 12, btn.y + btn.h / 2 + 6);
      }

      ctx.fillStyle = hover ? tc.textHover : tc.text;
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      const labelY = btn.sublabel ? btn.y + btn.h / 2 - 4 : btn.y + btn.h / 2 + 7;
      ctx.fillText(btn.label, btn.x + btn.w / 2, labelY);

      if (btn.sublabel) {
        ctx.font = '11px monospace';
        ctx.fillStyle = hover ? tc.text : COLORS.UI_INACTIVE;
        ctx.fillText(btn.sublabel, btn.x + btn.w / 2, btn.y + btn.h / 2 + 14);
      }
    }

    // Footer hint
    ctx.font = '11px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.textAlign = 'center';
    ctx.fillText('Progress is autosaved between waves.', cx, H * 0.9);
  }
}
