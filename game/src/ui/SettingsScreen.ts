import { COLORS, CONTROL_SCHEMES } from '../constants';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { ConfirmDialog } from './ConfirmDialog';
import {
  drawPanel,
  drawSecondaryButton,
  drawDangerButton,
  drawTitle,
  drawSectionHeader,
} from './drawHelpers';

type DraggingSlider = 'music' | 'sfx' | null;

export class SettingsScreen {
  canvas: GameCanvas;
  gameState: GameState;
  hoveredOption: string | null;
  backHovered: boolean;
  resetHovered: boolean;
  musicMuteHovered: boolean;
  dragging: DraggingSlider;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredOption = null;
    this.backHovered = false;
    this.resetHovered = false;
    this.musicMuteHovered = false;
    this.dragging = null;

    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleMouseDown = (e) => this.onMouseDown(e);
    this.handleMouseUp = (e) => this.onMouseUp(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.dragging = null;
  }

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private getLayout() {
    const w = this.canvas.logicalWidth;
    const sliderW = 280;
    const sliderX = w / 2 - sliderW / 2;
    return {
      back: { x: 20, y: 20, w: 100, h: 40 },
      mouse: { x: 200, y: 170, w: 150, h: 50 },
      keyboard: { x: 450, y: 170, w: 150, h: 50 },
      musicSlider: { x: sliderX, y: 300, w: sliderW, h: 10 },
      musicMute: { x: sliderX - 60, y: 292, w: 50, h: 26 },
      sfxSlider: { x: sliderX, y: 370, w: sliderW, h: 10 },
      reset: { x: w / 2 - 120, y: 450, w: 240, h: 40 },
    };
  }

  onMouseMove(e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    const p = this.getMousePosition(e);
    const L = this.getLayout();

    if (this.dragging) {
      const target = this.dragging === 'music' ? L.musicSlider : L.sfxSlider;
      const v = Math.max(0, Math.min(1, (p.x - target.x) / target.w));
      if (this.dragging === 'music') {
        this.gameState.saveData.settings.musicVolume = v;
        this.onVolumeChange('music', v);
      } else {
        this.gameState.saveData.settings.sfxVolume = v;
        this.onVolumeChange('sfx', v);
      }
      return;
    }

    this.backHovered = p.x >= L.back.x && p.x <= L.back.x + L.back.w && p.y >= L.back.y && p.y <= L.back.y + L.back.h;

    this.hoveredOption = null;
    if (this.hit(p, L.mouse)) this.hoveredOption = 'mouse';
    else if (this.hit(p, L.keyboard)) this.hoveredOption = 'keyboard';

    this.musicMuteHovered = this.hit(p, L.musicMute);
    this.resetHovered = this.hit(p, L.reset);
  }

  private hit(p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  onMouseDown(e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    const p = this.getMousePosition(e);
    const L = this.getLayout();
    // Expand hit area vertically
    const musicArea = { x: L.musicSlider.x, y: L.musicSlider.y - 10, w: L.musicSlider.w, h: L.musicSlider.h + 20 };
    const sfxArea = { x: L.sfxSlider.x, y: L.sfxSlider.y - 10, w: L.sfxSlider.w, h: L.sfxSlider.h + 20 };

    if (this.hit(p, musicArea)) {
      this.dragging = 'music';
      const v = Math.max(0, Math.min(1, (p.x - L.musicSlider.x) / L.musicSlider.w));
      this.gameState.saveData.settings.musicVolume = v;
      this.onVolumeChange('music', v);
    } else if (this.hit(p, sfxArea)) {
      this.dragging = 'sfx';
      const v = Math.max(0, Math.min(1, (p.x - L.sfxSlider.x) / L.sfxSlider.w));
      this.gameState.saveData.settings.sfxVolume = v;
      this.onVolumeChange('sfx', v);
    }
  }

  onMouseUp(_e: MouseEvent): void {
    if (this.dragging) {
      this.dragging = null;
      this.gameState.savePlayerData();
    }
  }

  onClick(_e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    if (this.dragging) return;

    if (this.backHovered) {
      this.onBackClick();
      return;
    }
    if (this.musicMuteHovered) {
      const s = this.gameState.saveData.settings;
      s.musicEnabled = !s.musicEnabled;
      this.gameState.savePlayerData();
      this.onMusicChange(s.musicEnabled);
      return;
    }
    if (this.hoveredOption === 'mouse') {
      this.gameState.playerData.controlScheme = CONTROL_SCHEMES.MOUSE;
      this.gameState.savePlayerData();
    } else if (this.hoveredOption === 'keyboard') {
      this.gameState.playerData.controlScheme = CONTROL_SCHEMES.KEYBOARD;
      this.gameState.savePlayerData();
    } else if (this.resetHovered) {
      ConfirmDialog.show({
        title: 'RESET ALL PROGRESS',
        message: 'Reset ALL progress across all slots? This cannot be undone.',
        confirmText: 'RESET',
        danger: true,
        onConfirm: () => this.gameState.resetProgress(),
      });
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.onBackClick();
    }
  }

  onBackClick(): void {}
  onMusicChange(_enabled: boolean): void {}
  onVolumeChange(_kind: 'music' | 'sfx', _value: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    const L = this.getLayout();
    const settings = this.gameState.saveData.settings;
    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;

    // Central panel backing.
    const panelW = Math.min(680, W - 80);
    const panelX = (W - panelW) / 2;
    drawPanel(ctx, panelX, 90, panelW, H - 150, { accent: 'green' });

    // Back
    drawSecondaryButton(ctx, L.back.x, L.back.y, L.back.w, L.back.h, '< BACK', {
      hovered: this.backHovered, fontSize: 16,
    });

    // Title
    drawTitle(ctx, 'SETTINGS', W / 2, 70, { size: 34, align: 'center', glow: true });

    // Sections
    drawSectionHeader(ctx, 'Control Scheme', panelX + 40, 130, panelW - 80);

    this.drawOption(ctx, L.mouse, 'MOUSE', this.gameState.playerData.controlScheme === CONTROL_SCHEMES.MOUSE, this.hoveredOption === 'mouse');
    this.drawOption(ctx, L.keyboard, 'WASD', this.gameState.playerData.controlScheme === CONTROL_SCHEMES.KEYBOARD, this.hoveredOption === 'keyboard');

    // Audio section header
    drawSectionHeader(ctx, 'Audio', panelX + 40, 260, panelW - 80);

    // Music slider
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MUSIC', L.musicSlider.x, L.musicSlider.y - 10);
    this.drawSlider(ctx, L.musicSlider, settings.musicVolume, settings.musicEnabled);
    // Mute toggle
    ctx.strokeStyle = this.musicMuteHovered ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = 1;
    ctx.strokeRect(L.musicMute.x, L.musicMute.y, L.musicMute.w, L.musicMute.h);
    ctx.fillStyle = settings.musicEnabled ? COLORS.UI_INACTIVE : '#FF6600';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(settings.musicEnabled ? 'ON' : 'MUTE', L.musicMute.x + L.musicMute.w / 2, L.musicMute.y + 17);

    // SFX slider
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SFX', L.sfxSlider.x, L.sfxSlider.y - 10);
    this.drawSlider(ctx, L.sfxSlider, settings.sfxVolume, true);

    // Danger zone header
    drawSectionHeader(ctx, 'Danger Zone', panelX + 40, L.reset.y - 22, panelW - 80, COLORS.ACCENT_RED);
    drawDangerButton(ctx, L.reset.x, L.reset.y, L.reset.w, L.reset.h, 'RESET ALL PROGRESS', {
      hovered: this.resetHovered, fontSize: 16,
    });

    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '12px monospace';
    ctx.fillText('Press ESC to go back  -  ESC during game to pause', this.canvas.logicalWidth / 2, L.reset.y + L.reset.h + 28);

    // Credits (bottom)
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Squaretato — made with ❤', this.canvas.logicalWidth / 2, this.canvas.logicalHeight - 16);
  }

  private drawOption(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, active: boolean, hover: boolean): void {
    ctx.strokeStyle = active || hover ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = active || hover ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 7);
  }

  private drawSlider(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, value: number, enabled: boolean): void {
    const col = enabled ? COLORS.UI_TEXT : COLORS.UI_INACTIVE;
    // Track
    ctx.fillStyle = COLORS.PANEL_DARK;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = COLORS.BORDER_STRONG;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    // Tick marks
    ctx.strokeStyle = COLORS.UI_INACTIVE;
    for (let i = 0; i <= 10; i++) {
      const tx = r.x + (r.w * i) / 10;
      const th = (i % 5 === 0) ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(tx + 0.5, r.y + r.h + 2);
      ctx.lineTo(tx + 0.5, r.y + r.h + 2 + th);
      ctx.stroke();
    }
    // Fill with inner gradient
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, enabled ? '#66FF66' : '#225522');
    g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w * value, r.h);
    // Knob
    const kx = r.x + r.w * value;
    ctx.fillStyle = col;
    ctx.fillRect(kx - 3, r.y - 5, 6, r.h + 10);
    ctx.fillStyle = '#CFFFCF';
    ctx.fillRect(kx - 2, r.y - 4, 4, r.h + 8);
    // Percent
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(value * 100)}%`, r.x + r.w + 12, r.y + r.h + 4);
  }
}
