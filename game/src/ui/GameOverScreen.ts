import { COLORS } from '../constants';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import { drawPrimaryButton, drawPanel, drawVignette } from './drawHelpers';

interface FinalStats {
  wave?: number;
  money?: number;
  kills?: number;
  timePlayed?: number;
  ppEarned?: number;
}

interface RainDrop {
  x: number;
  y: number;
  vy: number;
  len: number;
  alpha: number;
}

export class GameOverScreen {
  canvas: GameCanvas;
  gameState: GameState;
  continueHovered: boolean;
  finalStats: FinalStats | null;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  private activatedAt: number;
  private rain: RainDrop[];
  private pulsePhase: number;
  private capturedCharacterId: string;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.continueHovered = false;
    this.finalStats = null;
    this.activatedAt = 0;
    this.rain = [];
    this.pulsePhase = 0;
    this.capturedCharacterId = 'fighter';

    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(stats: FinalStats = {}): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
    this.finalStats = stats;
    this.activatedAt = performance.now();
    this.capturedCharacterId = this.gameState.selectedCharacter || 'fighter';

    // Seed rain particles
    this.rain = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      this.rain.push({
        x: Math.random() * this.canvas.logicalWidth,
        y: Math.random() * this.canvas.logicalHeight,
        vy: 40 + Math.random() * 80,
        len: 6 + Math.random() * 14,
        alpha: 0.15 + Math.random() * 0.35,
      });
    }
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private buttonRect() {
    const y = this.canvas.logicalHeight * 0.82;
    return { x: this.canvas.logicalWidth / 2 - 160, y, w: 320, h: 54 };
  }

  onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    const b = this.buttonRect();
    this.continueHovered = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  onClick(_e: MouseEvent): void {
    if (this.continueHovered) this.onContinueClick();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.onContinueClick();
    }
  }

  onContinueClick(): void {}

  private formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
  }

  private getEpitaph(wave: number): string {
    if (wave >= 20) return 'A legendary journey.';
    if (wave >= 10) return 'A valiant effort.';
    if (wave >= 5) return 'A respectable run.';
    if (wave >= 2) return 'The grind continues.';
    return 'Gone too soon.';
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const elapsed = (now - this.activatedAt) / 1000;
    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;

    // Dark backdrop with faint red pulse
    this.pulsePhase = elapsed * 0.8;
    const pulse = 0.82 + Math.sin(this.pulsePhase) * 0.03;
    ctx.fillStyle = `rgba(0, 0, 0, ${pulse})`;
    ctx.fillRect(0, 0, W, H);

    // Subtle red vignette pulse
    const vignetteAlpha = 0.06 + Math.sin(this.pulsePhase) * 0.03;
    ctx.fillStyle = `rgba(120, 0, 0, ${vignetteAlpha})`;
    ctx.fillRect(0, 0, W, H);
    drawVignette(ctx, W, H, 0.55, '#200000');

    // Red particle rain
    const dt = 1 / 60;
    for (const d of this.rain) {
      d.y += d.vy * dt;
      if (d.y > H) {
        d.y = -d.len;
        d.x = Math.random() * W;
      }
      ctx.strokeStyle = `rgba(200, 20, 20, ${d.alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y + d.len);
      ctx.stroke();
    }

    const cx = W / 2;

    // Title with entry glitch flash
    const glitch = elapsed < 0.5 ? (Math.random() - 0.5) * (1 - elapsed * 2) * 8 : 0;
    const titleY = H * 0.18;
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px monospace';

    // Glitch shadow layers
    if (elapsed < 0.6) {
      ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
      ctx.fillText('YOU HAVE FALLEN', cx + glitch + 3, titleY);
      ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
      ctx.fillText('YOU HAVE FALLEN', cx - glitch - 3, titleY);
    }
    // Main title with flicker
    const flicker = elapsed < 0.4 && Math.random() < 0.3 ? 0.3 : 1.0;
    ctx.fillStyle = `rgba(255, 30, 30, ${flicker})`;
    ctx.fillText('YOU HAVE FALLEN', cx, titleY);

    // Underline accent
    ctx.strokeStyle = '#660000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 200, titleY + 12);
    ctx.lineTo(cx + 200, titleY + 12);
    ctx.stroke();

    const wave = this.finalStats?.wave || 1;

    // Character portrait (faded/gray)
    const character = CharacterRegistry.get(this.capturedCharacterId);
    const portraitSize = 64;
    const portraitX = cx - portraitSize / 2;
    const portraitY = H * 0.24;

    // Portrait frame
    ctx.strokeStyle = '#550000';
    ctx.lineWidth = 2;
    ctx.strokeRect(portraitX - 4, portraitY - 4, portraitSize + 8, portraitSize + 8);

    // Portrait body (faded)
    const charColor = character ? character.getColor() : '#00FF00';
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = charColor;
    ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
    // Eyes (gone / X)
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    const eyeSpan = 12;
    const eyeY = portraitY + portraitSize * 0.4;
    // X eye left
    ctx.beginPath();
    ctx.moveTo(portraitX + portraitSize * 0.3 - 4, eyeY - 4);
    ctx.lineTo(portraitX + portraitSize * 0.3 + 4, eyeY + 4);
    ctx.moveTo(portraitX + portraitSize * 0.3 + 4, eyeY - 4);
    ctx.lineTo(portraitX + portraitSize * 0.3 - 4, eyeY + 4);
    // X eye right
    ctx.moveTo(portraitX + portraitSize * 0.7 - 4, eyeY - 4);
    ctx.lineTo(portraitX + portraitSize * 0.7 + 4, eyeY + 4);
    ctx.moveTo(portraitX + portraitSize * 0.7 + 4, eyeY - 4);
    ctx.lineTo(portraitX + portraitSize * 0.7 - 4, eyeY + 4);
    ctx.stroke();
    ctx.restore();
    // Gray overlay tint
    ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
    ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);

    void eyeSpan;

    // Character name
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = 'bold 14px monospace';
    ctx.fillText((character?.getName() || '').toUpperCase(), cx, portraitY + portraitSize + 20);

    // Epitaph
    ctx.fillStyle = '#FFD54A';
    ctx.font = 'italic 20px monospace';
    ctx.fillText(`"${this.getEpitaph(wave)}"`, cx, H * 0.44);

    // Stats panel
    const panelW = 420;
    const panelH = 180;
    const px = cx - panelW / 2;
    const py = H * 0.48;

    drawPanel(ctx, px, py, panelW, panelH, { accent: 'red', borderColor: '#663333' });

    // Panel header
    ctx.fillStyle = '#993333';
    ctx.fillRect(px, py, panelW, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('— RUN SUMMARY —', cx, py + 15);

    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';

    const lx = px + 28;
    let ly = py + 52;
    const line = (label: string, value: string, highlight = false): void => {
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, ly);
      ctx.fillStyle = highlight ? '#FFD54A' : COLORS.UI_TEXT;
      ctx.textAlign = 'right';
      ctx.fillText(value, px + panelW - 28, ly);
      ly += 26;
    };

    const kills = this.finalStats?.kills ?? 0;
    const money = this.finalStats?.money ?? 0;
    const pp = this.finalStats?.ppEarned ?? 0;

    line('Wave reached', String(wave), wave >= 10);
    line('Enemies defeated', String(kills), kills >= 200);
    line('Money earned', `$${money}`, money >= 500);
    line('Time played', this.formatTime(this.finalStats?.timePlayed ?? 0));
    line('Prestige earned', `${pp} PP`, pp > 0);

    // Preservation note
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Prestige, unlocks, and meta progress are preserved.', cx, H * 0.77);

    // Button - primary green
    const b = this.buttonRect();
    drawPrimaryButton(ctx, b.x, b.y, b.w, b.h, 'RETURN TO MENU', {
      hovered: this.continueHovered,
      hint: '[ENTER]',
      fontSize: 22,
    });

    void cx;
  }
}
