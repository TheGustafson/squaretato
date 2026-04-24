import { COLORS } from '../constants';
import type { GameCanvas, SlotData } from '../types';
import type { GameState } from '../systems/GameState';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import { ConfirmDialog } from './ConfirmDialog';
import {
  drawPanel,
  drawPrimaryButton,
  drawSecondaryButton,
  drawTitle,
  drawSectionHeader,
  ParticleField,
  easeOutCubic,
} from './drawHelpers';

interface ActionButton {
  id: string;
  label: string;
  x: number; y: number; w: number; h: number;
  primary: boolean;
  disabled?: boolean;
}

interface SlotRect {
  index: number;
  x: number; y: number; w: number; h: number;
  trashX: number; trashY: number; trashSize: number;
}

const VERSION_LABEL = 'v3';

interface Particle { x: number; y: number; vx: number; vy: number; r: number; a: number; }

export class Menu {
  canvas: GameCanvas;
  gameState: GameState;
  hoveredAction: string | null;
  hoveredSlot: number | null;
  hoveredTrash: number | null;
  focusedActionIndex: number; // keyboard focus within action column
  private particles: Particle[];
  private lastTime: number;
  private pulsePhase: number;
  private field: ParticleField;
  private activatedAt: number;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.hoveredAction = null;
    this.hoveredSlot = null;
    this.hoveredTrash = null;
    this.focusedActionIndex = -1;
    this.particles = [];
    this.lastTime = performance.now();
    this.pulsePhase = 0;
    this.field = new ParticleField({ count: 56 });
    this.activatedAt = 0;

    this.handleMouseMove = (e) => this.onMouseMove(e);
    this.handleClick = (e) => this.onClick(e);
    this.handleKeyDown = (e) => this.onKeyDown(e);
  }

  activate(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
    this.initParticles();
    this.lastTime = performance.now();
    this.activatedAt = performance.now();
    this.field.resize(this.canvas.logicalWidth, this.canvas.logicalHeight);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private initParticles(): void {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    this.particles = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        r: 1 + Math.random() * 1.5,
        a: 0.15 + Math.random() * 0.25,
      });
    }
  }

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.logicalWidth / rect.width;
    const sy = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  getSlotRects(): SlotRect[] {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const topBarH = 110;
    const colW = Math.min(360, w * 0.45);
    const colX = Math.max(40, w * 0.06);
    const slotH = 110;
    const gap = 14;
    const totalH = slotH * 3 + gap * 2;
    const startY = topBarH + Math.max(20, (h - topBarH - totalH - 60) / 2);

    const rects: SlotRect[] = [];
    for (let i = 0; i < 3; i++) {
      const y = startY + i * (slotH + gap);
      rects.push({
        index: i,
        x: colX, y, w: colW, h: slotH,
        trashX: colX + colW - 28,
        trashY: y + 8,
        trashSize: 20,
      });
    }
    return rects;
  }

  getActionButtons(): ActionButton[] {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const topBarH = 110;
    const colW = Math.min(300, w * 0.38);
    const colX = w - colW - Math.max(40, w * 0.06);
    const btnH = 46;
    const gap = 10;
    const count = 6;
    const totalH = btnH * count + gap * (count - 1);
    const startY = topBarH + Math.max(20, (h - topBarH - totalH - 60) / 2);

    const hasRun = this.gameState.hasActiveRun();

    return [
      { id: 'continue', label: 'CONTINUE RUN', x: colX, y: startY, w: colW, h: btnH, primary: true, disabled: !hasRun },
      { id: 'newRun', label: 'NEW RUN', x: colX, y: startY + (btnH + gap), w: colW, h: btnH, primary: !hasRun },
      { id: 'achievements', label: 'ACHIEVEMENTS', x: colX, y: startY + (btnH + gap) * 2, w: colW, h: btnH, primary: false },
      { id: 'stats', label: 'STATS', x: colX, y: startY + (btnH + gap) * 3, w: colW, h: btnH, primary: false },
      { id: 'settings', label: 'SETTINGS', x: colX, y: startY + (btnH + gap) * 4, w: colW, h: btnH, primary: false },
      { id: 'help', label: 'HELP', x: colX, y: startY + (btnH + gap) * 5, w: colW, h: btnH, primary: false },
    ];
  }

  onMouseMove(e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    const p = this.getMousePosition(e);

    this.hoveredAction = null;
    for (const b of this.getActionButtons()) {
      if (b.disabled) continue;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.hoveredAction = b.id;
        break;
      }
    }

    this.hoveredSlot = null;
    this.hoveredTrash = null;
    for (const s of this.getSlotRects()) {
      const slotData = this.gameState.getSlots()[s.index];
      if (!slotData.empty) {
        if (p.x >= s.trashX && p.x <= s.trashX + s.trashSize &&
            p.y >= s.trashY && p.y <= s.trashY + s.trashSize) {
          this.hoveredTrash = s.index;
          continue;
        }
      }
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
        this.hoveredSlot = s.index;
      }
    }
  }

  onClick(_e: MouseEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;

    if (this.hoveredTrash !== null) {
      const idx = this.hoveredTrash;
      ConfirmDialog.show({
        title: 'DELETE SLOT',
        message: `Delete slot ${idx + 1}? This cannot be undone.`,
        confirmText: 'DELETE',
        danger: true,
        onConfirm: () => {
          this.gameState.deleteSlot(idx);
        },
      });
      return;
    }

    if (this.hoveredSlot !== null) {
      this.gameState.loadSlot(this.hoveredSlot);
      return;
    }

    if (this.hoveredAction) {
      this.activateAction(this.hoveredAction);
    }
  }

  private activateAction(id: string): void {
    if (id === 'continue') {
      if (!this.gameState.hasActiveRun()) return;
      this.onContinueRun();
    } else if (id === 'newRun') {
      this.onNewRunClick();
    } else if (id === 'achievements') {
      this.onAchievementsClick();
    } else if (id === 'stats') {
      this.onStatsClick();
    } else if (id === 'settings') {
      this.onSettingsClick();
    } else if (id === 'help') {
      this.onHelpClick();
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (ConfirmDialog.get()?.isOpen()) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focusedActionIndex = -1;
      this.gameState.loadSlot(Math.max(0, this.gameState.activeSlotIndex - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focusedActionIndex = -1;
      this.gameState.loadSlot(Math.min(2, this.gameState.activeSlotIndex + 1));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const actions = this.getActionButtons();
      const dir = e.shiftKey ? -1 : 1;
      let next = this.focusedActionIndex;
      for (let i = 0; i < actions.length; i++) {
        next = (next + dir + actions.length) % actions.length;
        if (!actions[next].disabled) break;
      }
      this.focusedActionIndex = next;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const actions = this.getActionButtons();
      if (this.focusedActionIndex >= 0 && this.focusedActionIndex < actions.length) {
        const btn = actions[this.focusedActionIndex];
        if (!btn.disabled) this.activateAction(btn.id);
        return;
      }
      if (this.gameState.hasActiveRun()) this.onContinueRun();
      else this.onNewRunClick();
    }
  }

  // Overridable callbacks
  onContinueRun(): void {}
  onNewRunClick(): void {}
  onSettingsClick(): void {}
  onAchievementsClick(): void {}
  onStatsClick(): void {}
  // To wire the HELP button: in game.ts, instantiate ControlsScreen and assign
  // menu.onHelpClick = () => this.showHelpScreen(); where showHelpScreen()
  // deactivates the menu, activates helpScreen, and sets helpScreen.onBackClick
  // to return to the menu (mirroring how onSettingsClick drives SettingsScreen).
  onHelpClick(): void {}
  onStartRunClick(): void { this.onNewRunClick(); } // legacy

  requestNewRun(): void {
    // If active slot is empty, new run means just proceed; else prompt
    if (this.gameState.hasActiveRun()) {
      ConfirmDialog.show({
        title: 'OVERWRITE RUN',
        message: 'Starting a new run will overwrite your current run. Continue?',
        confirmText: 'NEW RUN',
        danger: true,
        onConfirm: () => {
          this.gameState.clearActiveRun();
          this.onNewRunConfirmed();
        },
      });
    } else {
      this.onNewRunConfirmed();
    }
  }

  onNewRunConfirmed(): void {}

  private formatPlaytime(seconds: number): string {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  private updateParticles(dt: number): void {
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    if (this.particles.length === 0) this.initParticles();
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += w;
      else if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y > h) p.y -= h;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.pulsePhase += dt * 2.5;

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    // Faint diagonal grid wash for depth.
    ctx.strokeStyle = 'rgba(0,40,0,0.35)';
    ctx.lineWidth = 1;
    const step = 42;
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }

    // Drifting ambient dust via shared field.
    this.field.resize(w, h);
    this.field.render(ctx);
    // keep legacy particles updated (harmless) but skip drawing.
    this.updateParticles(dt);

    // Entry fade-in over ~250ms.
    const enter = easeOutCubic(Math.min(1, (now - this.activatedAt) / 250));
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * enter;

    // Title with subtle shimmer.
    drawTitle(ctx, 'SQUARETATO', 40, 76, { size: 56, align: 'left', shimmer: true, glow: true });

    // Subtitle top right
    ctx.textAlign = 'right';
    ctx.font = '14px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Survive. Upgrade. Repeat.', w - 40, 68);

    // Column labels (shared section headers w/ underline)
    const slots = this.getSlotRects();
    const actions = this.getActionButtons();
    if (slots.length > 0) {
      drawSectionHeader(ctx, 'Save Slots', slots[0].x, slots[0].y - 10, slots[0].w);
    }
    if (actions.length > 0) {
      drawSectionHeader(ctx, 'Actions', actions[0].x, actions[0].y - 10, actions[0].w);
    }

    // Slot cards
    for (const rect of slots) {
      const slot = this.gameState.getSlots()[rect.index];
      const isActive = rect.index === this.gameState.activeSlotIndex;
      const isHover = this.hoveredSlot === rect.index;

      drawPanel(ctx, rect.x, rect.y, rect.w, rect.h, {
        accent: isActive ? 'green' : 'none',
        borderColor: isActive ? COLORS.UI_TEXT : (isHover ? '#4aaa4a' : COLORS.BORDER_STRONG),
      });
      if (isActive) {
        ctx.fillStyle = 'rgba(0,255,0,0.05)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }

      // Slot label
      ctx.fillStyle = COLORS.UI_INACTIVE;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SLOT ${rect.index + 1}`, rect.x + 12, rect.y + 18);

      if (slot.empty) {
        ctx.fillStyle = COLORS.UI_INACTIVE;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('- EMPTY -', rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
      } else {
        this.renderSlotPreview(ctx, slot, rect);
        // Trash icon
        const tx = rect.trashX, ty = rect.trashY, ts = rect.trashSize;
        const trashHover = this.hoveredTrash === rect.index;
        ctx.strokeStyle = trashHover ? '#FF3333' : COLORS.UI_INACTIVE;
        ctx.lineWidth = trashHover ? 2 : 1;
        ctx.strokeRect(tx, ty, ts, ts);
        ctx.beginPath();
        ctx.moveTo(tx + 4, ty + 6);
        ctx.lineTo(tx + ts - 4, ty + 6);
        ctx.stroke();
        ctx.fillStyle = trashHover ? '#FF3333' : COLORS.UI_INACTIVE;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('X', tx + ts / 2, ty + ts - 4);
      }
    }

    // Action buttons — primary CTA pulses, secondaries flat.
    for (let i = 0; i < actions.length; i++) {
      const btn = actions[i];
      const hover = this.hoveredAction === btn.id && !btn.disabled;
      const focused = this.focusedActionIndex === i && !btn.disabled;
      if (btn.primary) {
        drawPrimaryButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, {
          hovered: hover, focused, disabled: btn.disabled,
          hint: (hover || focused) ? '[ENTER]' : undefined,
          pulsePhase: this.pulsePhase,
          fontSize: 20,
        });
      } else {
        drawSecondaryButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, {
          hovered: hover, focused, disabled: btn.disabled,
          fontSize: 16,
        });
      }
    }

    // PP display + instructions
    const meta = this.gameState.getMeta();
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ACCENT_GOLD;
    ctx.fillText(`* Prestige: ${meta.prestigePoints} PP`, w - 20, h - 58);
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText('Up/Down: cycle slots  -  Tab: focus action  -  Enter: activate', w - 20, h - 38);

    // Version bottom-right
    ctx.font = '11px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.textAlign = 'right';
    ctx.fillText(VERSION_LABEL, w - 20, h - 18);

    // Close entry-fade alpha scope opened above.
    ctx.globalAlpha = prevAlpha;
  }

  private renderSlotPreview(ctx: CanvasRenderingContext2D, slot: SlotData, rect: SlotRect): void {
    // Character portrait (colored square)
    const char = CharacterRegistry.get(slot.selectedCharacter);
    const color = char ? char.getColor() : '#00FF00';
    const px = rect.x + 14;
    const py = rect.y + 34;
    const ps = 48;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, ps, ps);
    ctx.strokeStyle = COLORS.UI_INACTIVE;
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, ps, ps);

    // Right: stats
    const tx = px + ps + 14;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.font = 'bold 16px monospace';
    const charName = char ? char.getName() : slot.selectedCharacter;
    ctx.fillText(charName, tx, py + 14);

    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.fillText(`Wave ${slot.snapshot.highestWave || 1}  -  ${slot.meta.prestigePoints} PP`, tx, py + 32);
    ctx.fillText(`Playtime: ${this.formatPlaytime(slot.playtimeSeconds)}`, tx, py + 48);

    if (slot.activeRun) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`IN RUN - Wave ${slot.activeRun.currentWave}`, tx, py + 64);
    }
  }
}
