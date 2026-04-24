import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import {
  drawPanel,
  drawPrimaryButton,
  drawSecondaryButton,
  drawDangerButton,
} from './drawHelpers';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ButtonRect {
  x: number; y: number; w: number; h: number;
}

export class ConfirmDialog {
  private static instance: ConfirmDialog | null = null;

  canvas: GameCanvas;
  open: boolean;
  opts: ConfirmDialogOptions | null;
  hovered: 'confirm' | 'cancel' | null;
  private pressed: 'confirm' | 'cancel' | null;
  private openedAt: number;
  private handleMouseMove: (e: MouseEvent) => void;
  private handleClick: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas) {
    this.canvas = canvas;
    this.open = false;
    this.opts = null;
    this.hovered = null;
    this.pressed = null;
    this.openedAt = 0;

    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleMouseDown = (e) => this.onMouseDown(e);
    this.handleMouseUp = (e) => this.onMouseUp(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  static register(canvas: GameCanvas): ConfirmDialog {
    if (!ConfirmDialog.instance) {
      ConfirmDialog.instance = new ConfirmDialog(canvas);
    }
    return ConfirmDialog.instance;
  }

  static show(opts: ConfirmDialogOptions): void {
    const inst = ConfirmDialog.instance;
    if (!inst) return;
    inst.openDialog(opts);
  }

  static get(): ConfirmDialog | null {
    return ConfirmDialog.instance;
  }

  openDialog(opts: ConfirmDialogOptions): void {
    this.opts = {
      confirmText: 'CONFIRM',
      cancelText: 'CANCEL',
      danger: false,
      ...opts,
    };
    this.open = true;
    this.hovered = null;
    this.pressed = null;
    this.openedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.canvas.addEventListener('mousemove', this.handleMouseMove, true);
    this.canvas.addEventListener('mousedown', this.handleMouseDown, true);
    this.canvas.addEventListener('mouseup', this.handleMouseUp, true);
    this.canvas.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  close(): void {
    this.open = false;
    this.opts = null;
    this.hovered = null;
    this.pressed = null;
    this.canvas.removeEventListener('mousemove', this.handleMouseMove, true);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown, true);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp, true);
    this.canvas.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
  }

  isOpen(): boolean { return this.open; }

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private getLayout(): { panel: ButtonRect; confirm: ButtonRect; cancel: ButtonRect } {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const pw = Math.min(520, w - 80);
    const ph = 220;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    const btnW = 160;
    const btnH = 44;
    const gap = 24;
    const btnY = py + ph - btnH - 20;
    const cancel = { x: px + pw / 2 - btnW - gap / 2, y: btnY, w: btnW, h: btnH };
    const confirm = { x: px + pw / 2 + gap / 2, y: btnY, w: btnW, h: btnH };
    return { panel: { x: px, y: py, w: pw, h: ph }, confirm, cancel };
  }

  private hitTest(p: { x: number; y: number }, r: ButtonRect): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  private isInsidePanel(p: { x: number; y: number }): boolean {
    const { panel } = this.getLayout();
    return this.hitTest(p, panel);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.open) return;
    e.stopPropagation();
    const p = this.getMousePosition(e);
    const { confirm, cancel } = this.getLayout();
    this.hovered = null;
    if (this.hitTest(p, confirm)) this.hovered = 'confirm';
    else if (this.hitTest(p, cancel)) this.hovered = 'cancel';
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.open) return;
    e.stopPropagation();
    const p = this.getMousePosition(e);
    const { confirm, cancel } = this.getLayout();
    if (this.hitTest(p, confirm)) this.pressed = 'confirm';
    else if (this.hitTest(p, cancel)) this.pressed = 'cancel';
    else this.pressed = null;
  }

  private onMouseUp(e: MouseEvent): void {
    if (!this.open) return;
    e.stopPropagation();
    this.pressed = null;
  }

  private onClick(e: MouseEvent): void {
    if (!this.open || !this.opts) return;
    e.stopPropagation();
    e.preventDefault();
    const p = this.getMousePosition(e);
    if (this.hovered === 'confirm') {
      const cb = this.opts.onConfirm;
      this.close();
      cb();
    } else if (this.hovered === 'cancel') {
      const cb = this.opts.onCancel;
      this.close();
      if (cb) cb();
    } else if (!this.isInsidePanel(p)) {
      // Backdrop click = cancel
      const cb = this.opts.onCancel;
      this.close();
      if (cb) cb();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.open || !this.opts) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.opts.onConfirm;
      this.close();
      cb();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.opts.onCancel;
      this.close();
      if (cb) cb();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.open || !this.opts) return;

    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    // Entry animation progress (0..1 over 200ms)
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tRaw = Math.min(1, Math.max(0, (now - this.openedAt) / 200));
    // easeOutCubic
    const t = 1 - Math.pow(1 - tRaw, 3);

    // Backdrop (fades in)
    ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * t})`;
    ctx.fillRect(0, 0, w, h);

    const { panel, confirm, cancel } = this.getLayout();
    const danger = !!this.opts.danger;

    ctx.save();
    // Scale the card in from 0.9 -> 1.0 around center
    const scale = 0.92 + 0.08 * t;
    const cx = panel.x + panel.w / 2;
    const cy = panel.y + panel.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = t;

    // Drop shadow
    ctx.save();
    ctx.shadowColor = danger ? 'rgba(255, 40, 40, 0.45)' : 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    drawPanel(ctx, panel.x, panel.y, panel.w, panel.h, {
      accent: danger ? 'red' : 'green',
      borderColor: danger ? '#FF3333' : COLORS.BORDER_STRONG,
    });
    ctx.restore();

    // Outer warning halo for danger variant.
    if (danger) {
      ctx.strokeStyle = 'rgba(255, 51, 51, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(panel.x - 3, panel.y - 3, panel.w + 6, panel.h + 6);
    }

    // Warning icon for danger
    let titleX = panel.x + panel.w / 2;
    if (danger) {
      const iconX = panel.x + 28;
      const iconY = panel.y + 32;
      const r = 12;
      ctx.fillStyle = '#FF3333';
      ctx.beginPath();
      ctx.moveTo(iconX, iconY - r);
      ctx.lineTo(iconX + r, iconY + r * 0.9);
      ctx.lineTo(iconX - r, iconY + r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', iconX, iconY + 6);
    }

    // Title
    ctx.fillStyle = danger ? '#FF5555' : COLORS.UI_TEXT;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.opts.title, titleX, panel.y + 40);

    // Title underline accent
    ctx.strokeStyle = danger ? 'rgba(255, 51, 51, 0.5)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panel.x + 20, panel.y + 54);
    ctx.lineTo(panel.x + panel.w - 20, panel.y + 54);
    ctx.stroke();

    // Message (wrap)
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = '15px monospace';
    const lines = this.wrapText(ctx, this.opts.message, panel.w - 40);
    let ty = panel.y + 88;
    for (const ln of lines) {
      ctx.fillText(ln, panel.x + panel.w / 2, ty);
      ty += 20;
    }

    // Buttons (shared helpers)
    drawSecondaryButton(ctx, cancel.x, cancel.y, cancel.w, cancel.h,
      this.opts.cancelText || 'CANCEL',
      {
        hovered: this.hovered === 'cancel',
        pressed: this.pressed === 'cancel',
      });

    const confirmLabel = this.opts.confirmText || 'CONFIRM';
    const confirmOpts = {
      hovered: this.hovered === 'confirm',
      pressed: this.pressed === 'confirm',
      focused: this.hovered !== 'cancel',
    };
    if (danger) {
      drawDangerButton(ctx, confirm.x, confirm.y, confirm.w, confirm.h, confirmLabel, confirmOpts);
    } else {
      drawPrimaryButton(ctx, confirm.x, confirm.y, confirm.w, confirm.h, confirmLabel, {
        ...confirmOpts,
        hint: '[ENTER]',
      });
    }

    ctx.restore();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}
