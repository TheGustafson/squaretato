import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawPrimaryButton, drawTitle } from './drawHelpers';

interface LevelButton {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  hoverFill: string;
  text: string;
}

interface LevelLayout {
  padding: number;
  titleY: number;
  progressY: number;
  progressH: number;
  gridStartY: number;
  cellSize: number;
  cellSpacing: number;
  cols: number;
  rows: number;
  gridStartX: number;
  bottomY: number;
  statusStripY: number;
  statusStripH: number;
}

const FLOOD_WAVES = [9, 13, 17, 24, 27];

type WaveType = 'BOSS' | 'FINAL' | 'FLOOD' | 'ELITE' | 'STANDARD';
type DifficultyBand = 'Early' | 'Mid' | 'Late' | 'BOSS' | 'FINAL BOSS';

function getWaveType(level: number): WaveType {
  if (level === 30) return 'FINAL';
  if (level % 10 === 0) return 'BOSS';
  if (FLOOD_WAVES.includes(level)) return 'FLOOD';
  if (level % 5 === 0) return 'ELITE';
  return 'STANDARD';
}

function getDifficultyBand(level: number): DifficultyBand {
  if (level === 30) return 'FINAL BOSS';
  if (level === 10 || level === 20) return 'BOSS';
  if (level <= 9) return 'Early';
  if (level <= 19) return 'Mid';
  return 'Late';
}

function getBandColor(band: DifficultyBand): string {
  switch (band) {
    case 'Early': return '#77AA77';
    case 'Mid': return '#CCAA55';
    case 'Late': return '#CC6644';
    case 'BOSS': return '#FF6633';
    case 'FINAL BOSS': return '#FF2244';
  }
}

function getEnemyPreview(level: number): string {
  if (level === 30) return 'Final Boss + Elite Flood';
  if (level % 10 === 0) return 'Boss + Minions';
  if (FLOOD_WAVES.includes(level)) return 'Heavy Swarm';
  if (level % 5 === 0) return 'Elite Mix';
  if (level <= 3) return 'Basic squares';
  if (level <= 8) return 'Basic + Tracker';
  if (level <= 15) return 'Mixed threats';
  if (level <= 22) return 'Elite + Tank';
  return 'Elite Tank + Tracker';
}

// Reward estimates were pure fiction — the real wave payout depends on kills,
// drop RNG, per-character luck, items, structure income, etc. Impossible to
// precompute, so the tooltip line was removed entirely.

export class LevelSelectScreen {
  canvas: GameCanvas;
  gameState: GameState;
  hoveredLevel: number | null;
  // When true, any unlocked cell is clickable (not just the current max wave).
  // Flipped on by Game when dev mode is active.
  devBypass: boolean = false;
  hoveredCell: { level: number; x: number; y: number } | null;
  hoveredButton: string | null;
  pulseTime: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredLevel = null;
    this.hoveredCell = null;
    this.hoveredButton = null;
    this.pulseTime = 0;

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
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

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  getLayout(): LevelLayout {
    const padding = 20;
    const titleY = 44;
    const progressY = 82;
    const progressH = 10;
    const gridStartY = 118;
    const cellSize = 60;
    const cellSpacing = 10;
    const cols = 10;
    const rows = 3;
    const totalGridWidth = cols * cellSize + (cols - 1) * cellSpacing;
    const gridStartX = (this.canvas.logicalWidth - totalGridWidth) / 2;
    const bottomY = this.canvas.logicalHeight - 56;
    const statusStripH = 72;
    const statusStripY = bottomY - statusStripH - 12;

    return {
      padding, titleY, progressY, progressH, gridStartY,
      cellSize, cellSpacing, cols, rows, gridStartX,
      bottomY, statusStripY, statusStripH,
    };
  }

  getButtons(): LevelButton[] {
    const layout = this.getLayout();
    const btnH = 40;
    const y = layout.bottomY;

    return [
      { id: 'endRun',   label: '< BACK',     x: layout.padding,              y, w: 110, h: btnH, fill: '#2A2A2A', hoverFill: '#3A3A3A', text: '#BBBBBB' },
      { id: 'shop',     label: 'SHOP',       x: layout.padding + 120,        y, w: 110, h: btnH, fill: '#1B3A66', hoverFill: '#2A5590', text: '#BBDDFF' },
      { id: 'upgrades', label: 'UPGRADES',   x: layout.padding + 240,        y, w: 140, h: btnH, fill: '#1B5A2B', hoverFill: '#2A8440', text: '#BBFFCC' },
    ];
  }

  getConfirmButton(): LevelButton {
    const layout = this.getLayout();
    const btnH = 40;
    const w = 200;
    return {
      id: 'confirm',
      label: 'START WAVE ->',
      x: this.canvas.logicalWidth - layout.padding - w,
      y: layout.bottomY,
      w, h: btnH,
      fill: '#8A6A10', hoverFill: '#BB9020', text: '#FFF2B0',
    };
  }

  getCellAt(x: number, y: number): { level: number; cx: number; cy: number; unlocked: boolean; isCurrent: boolean } | null {
    const layout = this.getLayout();
    const maxLevel = this.gameState.playerData.unlockedLevels || 1;

    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const level = row * layout.cols + col + 1;
        if (level > 30) return null;
        const cx = layout.gridStartX + col * (layout.cellSize + layout.cellSpacing);
        const cy = layout.gridStartY + row * (layout.cellSize + layout.cellSpacing);
        if (x >= cx && x <= cx + layout.cellSize && y >= cy && y <= cy + layout.cellSize) {
          return { level, cx, cy, unlocked: level <= maxLevel, isCurrent: level === maxLevel };
        }
      }
    }
    return null;
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    const cell = this.getCellAt(pos.x, pos.y);
    if (cell) {
      this.hoveredCell = { level: cell.level, x: cell.cx, y: cell.cy };
      // Normally only the current max wave is clickable; dev mode allows any unlocked wave.
      this.hoveredLevel = (this.devBypass && cell.unlocked) || cell.isCurrent ? cell.level : null;
    } else {
      this.hoveredCell = null;
      this.hoveredLevel = null;
    }

    this.hoveredButton = null;
    const buttons: LevelButton[] = [...this.getButtons(), this.getConfirmButton()];
    for (const btn of buttons) {
      if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
          pos.y >= btn.y && pos.y <= btn.y + btn.h) {
        this.hoveredButton = btn.id;
        break;
      }
    }
  }

  onClick(_e?: MouseEvent): void {
    if (this.hoveredButton === 'endRun') {
      this.onEndRunClick();
      return;
    }
    if (this.hoveredButton === 'shop') {
      this.onShopClick();
      return;
    }
    if (this.hoveredButton === 'upgrades') {
      this.onUpgradesClick();
      return;
    }
    if (this.hoveredButton === 'confirm') {
      const maxLevel = this.gameState.playerData.unlockedLevels || 1;
      this.onLevelSelect(maxLevel);
      return;
    }
    if (this.hoveredLevel) {
      this.onLevelSelect(this.hoveredLevel);
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      const maxLevel = this.gameState.playerData.unlockedLevels || 1;
      this.onLevelSelect(maxLevel);
    }
  }

  onEndRunClick(): void {}
  onShopClick(): void {}
  onUpgradesClick(): void {}
  onLevelSelect(_level?: number): void {}

  drawWaveIcon(ctx: CanvasRenderingContext2D, level: number, cx: number, cy: number, size: number, color: string): void {
    const type = getWaveType(level);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    if (type === 'BOSS' || type === 'FINAL') {
      // Larger skull: rounded head with jaw, eyes, nose
      const s = size * (type === 'FINAL' ? 1.15 : 1.0);
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.05, s * 0.55, Math.PI, 0);
      ctx.lineTo(cx + s * 0.45, cy + s * 0.3);
      ctx.lineTo(cx + s * 0.25, cy + s * 0.3);
      ctx.lineTo(cx + s * 0.18, cy + s * 0.45);
      ctx.lineTo(cx - s * 0.18, cy + s * 0.45);
      ctx.lineTo(cx - s * 0.25, cy + s * 0.3);
      ctx.lineTo(cx - s * 0.45, cy + s * 0.3);
      ctx.closePath();
      ctx.fill();
      // eyes
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(cx - s * 0.22, cy - s * 0.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.22, cy - s * 0.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
      // nose
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.06, cy + s * 0.2);
      ctx.lineTo(cx + s * 0.06, cy + s * 0.2);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'FLOOD') {
      // 4 small enemy dots in swarm formation
      const positions = [
        [-0.3, -0.2], [0.3, -0.2], [-0.15, 0.2], [0.25, 0.25],
      ];
      for (const [dx, dy] of positions) {
        ctx.beginPath();
        ctx.arc(cx + dx * size, cy + dy * size, size * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'ELITE') {
      // diamond outline + fill
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.45);
      ctx.lineTo(cx + size * 0.4, cy);
      ctx.lineTo(cx, cy + size * 0.45);
      ctx.lineTo(cx - size * 0.4, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // coin: circle with inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.pulseTime += 1 / 60;
    const layout = this.getLayout();

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    // Title
    drawTitle(ctx, 'SELECT WAVE', this.canvas.logicalWidth / 2, layout.titleY + 22, {
      size: 30, shimmer: true,
    });

    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText(
      `${this.gameState.selectedCharacter.toUpperCase()}  |  $${this.gameState.playerData.money}`,
      this.canvas.logicalWidth / 2, layout.titleY + 44
    );

    const maxLevel = this.gameState.playerData.unlockedLevels || 1;

    // Progress bar
    const barW = Math.min(600, this.canvas.logicalWidth - layout.padding * 2);
    const barX = (this.canvas.logicalWidth - barW) / 2;
    const barY = layout.progressY;
    const barH = layout.progressH;
    const completed = Math.max(0, maxLevel - 1);
    const progressPct = Math.min(1, completed / 30);

    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
    ctx.fillRect(barX, barY, barW, barH);
    // filled portion gradient-ish
    ctx.fillStyle = '#3A8A4A';
    ctx.fillRect(barX, barY, barW * progressPct, barH);
    // boss markers on bar
    for (const bossLevel of [10, 20, 30]) {
      const mx = barX + barW * (bossLevel / 30);
      ctx.fillStyle = bossLevel <= completed ? '#FFD700' : '#996622';
      ctx.fillRect(mx - 1, barY - 2, 2, barH + 4);
    }
    ctx.strokeStyle = COLORS.UI_INACTIVE;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('RUN PROGRESS', barX, barY - 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#DDDDDD';
    ctx.fillText(`WAVE ${maxLevel} / 30`, barX + barW, barY - 4);

    const pulse = 0.5 + 0.5 * Math.sin(this.pulseTime * 3);
    const scalePulse = 1 + 0.04 * pulse;

    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const level = row * layout.cols + col + 1;
        if (level > 30) break;
        const cx = layout.gridStartX + col * (layout.cellSize + layout.cellSpacing);
        const cy = layout.gridStartY + row * (layout.cellSize + layout.cellSpacing);

        const unlocked = level <= maxLevel;
        const isCurrent = level === maxLevel;
        const isCompleted = level < maxLevel;
        const type = getWaveType(level);
        const band = getDifficultyBand(level);
        const isBoss = type === 'BOSS' || type === 'FINAL';
        const isFlood = type === 'FLOOD';
        const isElite = type === 'ELITE';

        // Current cell scale-up: draw shifted/expanded
        let dx = cx, dy = cy, ds = layout.cellSize;
        if (isCurrent) {
          const grow = (layout.cellSize * (scalePulse - 1));
          dx = cx - grow / 2;
          dy = cy - grow / 2;
          ds = layout.cellSize + grow;
        }

        // Background
        if (!unlocked) {
          ctx.fillStyle = 'rgba(25, 25, 25, 0.5)';
        } else if (type === 'FINAL') {
          ctx.fillStyle = 'rgba(120, 20, 30, 0.35)';
        } else if (type === 'BOSS') {
          ctx.fillStyle = 'rgba(110, 35, 20, 0.3)';
        } else if (isFlood) {
          ctx.fillStyle = 'rgba(90, 50, 50, 0.25)';
        } else if (isElite) {
          ctx.fillStyle = 'rgba(80, 70, 30, 0.2)';
        } else if (isCompleted) {
          ctx.fillStyle = 'rgba(20, 60, 30, 0.2)';
        } else {
          ctx.fillStyle = 'rgba(30, 60, 40, 0.15)';
        }
        ctx.fillRect(dx, dy, ds, ds);

        // Border
        if (isCurrent) {
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2 + pulse * 2;
        } else if (type === 'FINAL') {
          ctx.strokeStyle = '#FF3344';
          ctx.lineWidth = 2;
        } else if (type === 'BOSS' && unlocked) {
          ctx.strokeStyle = '#DD5522';
          ctx.lineWidth = 2;
        } else if (isFlood && unlocked) {
          ctx.strokeStyle = '#AA6666';
          ctx.lineWidth = 1.5;
        } else if (isElite && unlocked) {
          ctx.strokeStyle = '#AAAA55';
          ctx.lineWidth = 1.5;
        } else if (unlocked) {
          ctx.strokeStyle = '#446644';
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = '#222222';
          ctx.lineWidth = 1;
        }
        ctx.strokeRect(dx, dy, ds, ds);

        // Icon
        const iconColor = !unlocked ? '#3A3A3A' :
                         isCurrent ? '#FFE060' :
                         type === 'FINAL' ? '#FF4455' :
                         type === 'BOSS' ? '#FF6644' :
                         isFlood ? '#DD7777' :
                         isElite ? '#DDCC66' :
                         '#FFCC55';
        const iconSize = isBoss ? 22 : 18;
        this.drawWaveIcon(ctx, level, dx + ds / 2, dy + ds * 0.38, iconSize, iconColor);

        // Level number
        ctx.font = (isCurrent || isBoss) ? 'bold 15px monospace' : 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (!unlocked) {
          ctx.fillStyle = '#888888';
        } else if (isCurrent) {
          ctx.fillStyle = '#FFD700';
        } else if (type === 'FINAL') {
          ctx.fillStyle = '#FF8899';
        } else if (type === 'BOSS') {
          ctx.fillStyle = '#FFAA66';
        } else {
          ctx.fillStyle = '#DDDDDD';
        }
        ctx.fillText(`${level}`, dx + ds / 2, dy + ds * 0.78);

        // Difficulty band strip at bottom
        const bandColor = getBandColor(band);
        const bandH = 10;
        if (unlocked) {
          ctx.fillStyle = bandColor;
          ctx.fillRect(dx + 2, dy + ds - bandH - 1, ds - 4, bandH);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(band, dx + ds / 2, dy + ds - 3);
        } else {
          ctx.fillStyle = '#1A1A1A';
          ctx.fillRect(dx + 2, dy + ds - bandH - 1, ds - 4, bandH);
        }

        // Completed checkmark overlay (top-right)
        if (isCompleted) {
          ctx.fillStyle = 'rgba(0, 80, 0, 0.85)';
          ctx.fillRect(dx + ds - 16, dy + 2, 14, 14);
          ctx.strokeStyle = '#00FF66';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(dx + ds - 14, dy + 9);
          ctx.lineTo(dx + ds - 10, dy + 13);
          ctx.lineTo(dx + ds - 4, dy + 5);
          ctx.stroke();
        }

        // Lock icon for unreachable
        if (!unlocked) {
          ctx.fillStyle = '#555555';
          ctx.font = '18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('\u{1F512}', dx + ds / 2, dy + ds / 2 + 6);
        }

        // "NEXT ->" label beside current cell
        if (isCurrent) {
          const labelAlpha = 0.6 + 0.4 * pulse;
          ctx.fillStyle = `rgba(255, 215, 0, ${labelAlpha})`;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          // Place label above cell if possible
          const labelY = dy - 4;
          ctx.fillText('NEXT ->', dx, labelY);
        }
      }
    }

    // Per-run status strip
    const pd = this.gameState.playerData;
    const weapons = (pd.weapons || []) as Array<{ type?: string; name?: string } | string>;
    const items = (pd.items || []) as Array<{ type?: string; name?: string } | string>;
    const spells = (pd.spells || []) as Array<{ type?: string; name?: string } | string>;

    const nameOf = (w: { type?: string; name?: string } | string): string => {
      if (typeof w === 'string') return w;
      return (w.name || w.type || '?').toString();
    };
    const weaponNames = weapons.map(nameOf);
    const spellNames = spells.map(nameOf);

    const stripX = layout.padding;
    const stripW = this.canvas.logicalWidth - layout.padding * 2;

    drawPanel(ctx, stripX, layout.statusStripY, stripW, layout.statusStripH, { accent: 'cyan' });

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('CURRENT RUN', stripX + 10, layout.statusStripY + 14);

    // Left block: money / highest
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('MONEY', stripX + 10, layout.statusStripY + 32);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`$${pd.money}`, stripX + 10, layout.statusStripY + 52);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('HIGHEST', stripX + 100, layout.statusStripY + 32);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#DDDDDD';
    ctx.fillText(`W${pd.highestWave || 0}`, stripX + 100, layout.statusStripY + 52);

    // Middle block: weapons
    const colWX = stripX + 170;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText(`WEAPONS (${weaponNames.length})`, colWX, layout.statusStripY + 32);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#FF9966';
    const weaponList = weaponNames.length ? weaponNames.slice(0, 4).join(', ') + (weaponNames.length > 4 ? '...' : '') : '(none)';
    ctx.fillText(weaponList, colWX, layout.statusStripY + 52);

    // Spells
    const colSX = stripX + 170 + (stripW - 180) * 0.4;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText(`SPELLS (${spellNames.length})`, colSX, layout.statusStripY + 32);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#66AAFF';
    const spellList = spellNames.length ? spellNames.slice(0, 4).join(', ') + (spellNames.length > 4 ? '...' : '') : '(none)';
    ctx.fillText(spellList, colSX, layout.statusStripY + 52);

    // Items count
    const colIX = stripX + 170 + (stripW - 180) * 0.78;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText('ITEMS', colIX, layout.statusStripY + 32);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#88FF88';
    ctx.fillText(`${items.length}`, colIX, layout.statusStripY + 52);

    // Bottom secondary buttons (BACK, SHOP, UPGRADES)
    for (const btn of this.getButtons()) {
      const hovered = this.hoveredButton === btn.id;
      ctx.fillStyle = hovered ? btn.hoverFill : btn.fill;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = hovered ? '#FFFFFF' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = btn.text;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 5);
    }

    // Primary confirm CTA (bottom-right)
    const confirm = this.getConfirmButton();
    drawPrimaryButton(ctx, confirm.x, confirm.y, confirm.w, confirm.h, 'START WAVE', {
      hovered: this.hoveredButton === 'confirm',
      hint: '[ENTER]',
    });

    // Tooltip (draw last so it's on top)
    if (this.hoveredCell) {
      const tc = this.hoveredCell;
      const type = getWaveType(tc.level);
      const band = getDifficultyBand(tc.level);
      const enemyPreview = getEnemyPreview(tc.level);
      const typeLabel = type === 'FINAL' ? 'FINAL BOSS' : type;

      const tipLines: Array<{ text: string; color: string; bold?: boolean }> = [
        { text: `WAVE ${tc.level} - ${typeLabel}`, color: getBandColor(band), bold: true },
        { text: `Difficulty: ${band}`, color: '#CCCCCC' },
        { text: `Enemies: ${enemyPreview}`, color: '#DDDDDD' },
      ];
      const tipW = 260;
      const tipH = 16 + tipLines.length * 16 + 6;
      let tx = tc.x + layout.cellSize + 10;
      let ty = tc.y;
      if (tx + tipW > this.canvas.logicalWidth - 10) tx = tc.x - tipW - 10;
      if (tx < 10) tx = 10;
      if (ty + tipH > this.canvas.logicalHeight - 10) ty = this.canvas.logicalHeight - tipH - 10;
      if (ty < 10) ty = 10;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.fillRect(tx, ty, tipW, tipH);
      ctx.strokeStyle = getBandColor(band);
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tipW, tipH);

      let ly = ty + 18;
      for (const line of tipLines) {
        ctx.font = line.bold ? 'bold 12px monospace' : '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, tx + 8, ly);
        ly += 16;
      }
    }
  }
}
