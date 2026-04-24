import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import { drawPanel, drawSecondaryButton, drawTitle, drawSectionHeader } from './drawHelpers';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(rs)}`;
}

export class StatsScreen {
  canvas: GameCanvas;
  gameState: GameState;
  backHovered: boolean;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.backHovered = false;
    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      this.onBackClick();
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
    // Back button pinned top-right so it never overlaps the "LIFETIME STATS" title.
    const w = this.canvas.logicalWidth;
    return { back: { x: w - 120, y: 24, w: 100, h: 40 } };
  }

  onMouseMove(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    this.backHovered = p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h;
  }

  onClick(e: MouseEvent): void {
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    if (p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h) {
      this.onBackClick();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const meta = this.gameState.getMeta();

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);

    // Title
    drawTitle(ctx, 'LIFETIME STATS', 40, 62, { size: 34, align: 'left', shimmer: true });

    // Back button (top-right)
    const L = this.getLayout();
    drawSecondaryButton(ctx, L.back.x, L.back.y, L.back.w, L.back.h, '< BACK', {
      hovered: this.backHovered,
    });

    // Summary panel
    const summaryPanelX = 32;
    const summaryPanelY = 96;
    const summaryPanelW = w - 64;
    const summaryPanelH = 148;
    drawPanel(ctx, summaryPanelX, summaryPanelY, summaryPanelW, summaryPanelH, { accent: 'green' });
    drawSectionHeader(ctx, 'Summary', summaryPanelX + 16, summaryPanelY + 22, summaryPanelW - 32);

    // Summary grid
    const startY = summaryPanelY + 42;
    const stats: [string, string][] = [
      ['Total Playtime', formatTime(meta.lifetimePlaytimeSeconds || 0)],
      ['Total Runs', String(meta.lifetimeRuns || 0)],
      ['Total Wins', String(meta.lifetimeWins || 0)],
      ['Total Deaths', String(meta.lifetimeDeaths || 0)],
      ['Enemies Killed', String(meta.lifetimeKills || 0)],
      ['Money Earned', `$${meta.lifetimeMoney || 0}`],
      ['Prestige Points (Total)', String(meta.lifetimePpEarned || 0)],
      ['Prestige Points (Current)', String(meta.prestigePoints || 0)],
    ];

    ctx.textAlign = 'left';
    const cols = w >= 1100 ? 4 : 2;
    const colW = Math.floor((summaryPanelW - 32) / cols);
    for (let i = 0; i < stats.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = summaryPanelX + 16 + col * colW;
      const y = startY + row * 28;
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.font = '12px monospace';
      ctx.fillText(stats[i][0], x, y);
      const valueColor = stats[i][0].toLowerCase().includes('money') ? COLORS.ACCENT_GOLD
        : stats[i][0].toLowerCase().includes('prestige') ? COLORS.ACCENT_GOLD
        : COLORS.UI_TEXT;
      ctx.fillStyle = valueColor;
      ctx.font = 'bold 15px monospace';
      ctx.fillText(stats[i][1], x, y + 16);
    }

    // Per-character panel
    const tablePanelX = 32;
    const tablePanelY = summaryPanelY + summaryPanelH + 16;
    const tablePanelW = w - 64;
    const tablePanelH = h - tablePanelY - 24;
    drawPanel(ctx, tablePanelX, tablePanelY, tablePanelW, tablePanelH, { accent: 'cyan' });
    drawSectionHeader(ctx, 'Per-Character', tablePanelX + 16, tablePanelY + 22, tablePanelW - 32);
    const tableY = tablePanelY + 22;

    const headers = ['CHARACTER', 'RUNS', 'WINS', 'BEST', 'KILLS', 'PLAYTIME'];
    // Responsive column layout.
    const tableLeft = tablePanelX + 16;
    const tableRight = tablePanelX + tablePanelW - 16;
    const colX = [
      tableLeft,
      tableLeft + 180,
      tableLeft + 250,
      tableLeft + 320,
      tableLeft + 390,
      Math.min(tableLeft + 480, tableRight - 90),
    ];
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    for (let i = 0; i < headers.length; i++) {
      ctx.fillText(headers[i], colX[i], tableY + 48);
    }
    ctx.strokeStyle = COLORS.BORDER_SUBTLE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableLeft, tableY + 54);
    ctx.lineTo(tableRight, tableY + 54);
    ctx.stroke();

    const charIds = CharacterRegistry.getAllIds();
    const unlocked = meta.unlockedCharacters || [];
    const pcs = meta.perCharacterStats || {};

    let rowY = tableY + 74;
    for (const id of charIds) {
      const char = CharacterRegistry.get(id);
      if (!char) continue;
      const isUnlocked = unlocked.includes(id);
      const name = char.getName();
      if (isUnlocked) {
        const s = pcs[id] || { runs: 0, wins: 0, deaths: 0, bestWave: 0, kills: 0, playtimeSeconds: 0 };
        ctx.fillStyle = COLORS.UI_TEXT;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(name, colX[0], rowY);
        ctx.font = '13px monospace';
        ctx.fillText(String(s.runs), colX[1], rowY);
        ctx.fillText(String(s.wins), colX[2], rowY);
        ctx.fillText(String(s.bestWave), colX[3], rowY);
        ctx.fillText(String(s.kills), colX[4], rowY);
        ctx.fillText(formatTime(s.playtimeSeconds), colX[5], rowY);
      } else {
        ctx.fillStyle = '#888';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(name, colX[0], rowY);
        ctx.font = 'italic 12px monospace';
        ctx.fillText('locked', colX[1], rowY);
      }
      rowY += 22;
      if (rowY > h - 40) break;
    }
  }
}
