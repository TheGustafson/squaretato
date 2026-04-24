import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import { drawPanel, drawSecondaryButton, drawTitle, drawSectionHeader } from './drawHelpers';

interface Section {
  heading: string;
  lines: string[];
}

const SECTIONS: Section[] = [
  {
    heading: 'CONTROLS',
    lines: [
      'WASD / Arrow keys  -  Move',
      'Esc                -  Pause (in-game) / Back (in menus)',
      'Enter              -  Primary action / Confirm',
      'Tab                -  Cycle focus (menus)',
    ],
  },
  {
    heading: 'CORE LOOP',
    lines: [
      'Auto-aim, auto-fire. No manual aiming.',
      'Every character has a passive buildup meter (below the player',
      'square). Fill it to trigger a short burst.',
      'Survive 30 waves. Bosses at 10, 20, 30.',
      'Death resets per-run items/weapons. Lifetime progress',
      '(prestige, stats, unlocks) persists.',
    ],
  },
  {
    heading: 'POST-WAVE FLOW',
    lines: ['Round Stats -> Upgrade card -> Shop -> Character upgrades -> Next wave'],
  },
  {
    heading: 'TIPS',
    lines: [
      'Kill enemies to drop gold. Pick it up to afford upgrades.',
      "Standing near certain characters' allies (Manager) or",
      'structures (Capitalist) buffs them.',
      'Pressing Tab in menus cycles button focus.',
    ],
  },
  {
    heading: 'CREDITS',
    lines: ['Squaretato. Built with TypeScript + Canvas 2D.'],
  },
];

export class ControlsScreen {
  canvas: GameCanvas;
  backHovered: boolean;
  private scrollY: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleWheel: (e: WheelEvent) => void;

  constructor(canvas: GameCanvas) {
    this.canvas = canvas;
    this.backHovered = false;
    this.scrollY = 0;
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
    this.handleWheel = (e) => this.onWheel(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  // Overridable callback
  onBackClick(): void {}

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private getLayout() {
    const w = this.canvas.logicalWidth;
    return { back: { x: w - 120, y: 24, w: 100, h: 40 } };
  }

  onMouseMove(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    this.backHovered =
      p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h;
  }

  onClick(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    if (p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h) {
      this.onBackClick();
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      this.onBackClick();
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      this.scrollY += 40;
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      this.scrollY = Math.max(0, this.scrollY - 40);
    }
  }

  onWheel(e: WheelEvent): void {
    this.scrollY = Math.max(0, this.scrollY + e.deltaY);
  }

  // Small 3x2 WASD diagram. Pure Canvas 2D, drawn in the top-right of the
  // panel as a visual anchor for the monospace "movement" instructions.
  private drawKeyboardDiagram(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const keyW = 34, keyH = 34, gap = 6;
    const drawKey = (kx: number, ky: number, label: string, hot = false): void => {
      ctx.fillStyle = hot ? 'rgba(0,255,0,0.12)' : COLORS.PANEL_MID;
      ctx.fillRect(kx, ky, keyW, keyH);
      ctx.strokeStyle = hot ? COLORS.UI_TEXT : COLORS.BORDER_STRONG;
      ctx.lineWidth = hot ? 2 : 1;
      ctx.strokeRect(kx + 0.5, ky + 0.5, keyW - 1, keyH - 1);
      ctx.fillStyle = hot ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, kx + keyW / 2, ky + keyH / 2);
      ctx.textBaseline = 'alphabetic';
    };
    // Row 1: W
    drawKey(x + keyW + gap, y, 'W', true);
    // Row 2: A S D
    drawKey(x, y + keyH + gap, 'A', true);
    drawKey(x + keyW + gap, y + keyH + gap, 'S', true);
    drawKey(x + (keyW + gap) * 2, y + keyH + gap, 'D', true);
    // Label
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOVE', x + keyW * 1.5 + gap, y + keyH * 2 + gap + 16);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);

    // Backing panel
    const panelW = Math.min(760, w - 60);
    const panelX = (w - panelW) / 2;
    drawPanel(ctx, panelX, 80, panelW, h - 120, { accent: 'green' });

    // Title
    drawTitle(ctx, 'CONTROLS & HELP', panelX + 28, 64, { size: 30, align: 'left', glow: true });

    // WASD keyboard diagram at top
    this.drawKeyboardDiagram(ctx, panelX + panelW - 220, 96);

    // Back button (top-right of screen)
    const L = this.getLayout();
    drawSecondaryButton(ctx, L.back.x, L.back.y, L.back.w, L.back.h, 'BACK', {
      hovered: this.backHovered, fontSize: 14,
    });

    // Scrollable content region
    const regionTop = 100;
    const regionBottom = h - 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, regionTop, w, regionBottom - regionTop);
    ctx.clip();

    let y = regionTop + 20 - this.scrollY;
    const leftX = 40;

    ctx.textAlign = 'left';
    for (const sec of SECTIONS) {
      drawSectionHeader(ctx, sec.heading, leftX, y, w - leftX * 2);
      y += 22;
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.font = '14px monospace';
      for (const line of sec.lines) {
        ctx.fillText(line, leftX + 12, y);
        y += 20;
      }
      y += 16;
    }

    // Clamp scroll so you can't scroll far past the content
    const contentHeight = y + this.scrollY - (regionTop + 20);
    const maxScroll = Math.max(0, contentHeight - (regionBottom - regionTop - 20));
    if (this.scrollY > maxScroll) this.scrollY = maxScroll;

    ctx.restore();

    // Footer hint
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Esc/Enter: back  -  Wheel/Arrows: scroll', w - 20, h - 18);
  }
}
