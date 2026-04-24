import { COLORS } from '../constants';
import type { GameCanvas, AchievementToastItem, AchievementTier } from '../types';
import type { GameState } from '../systems/GameState';
import type { SoundSystem } from '../systems/SoundSystem';
import { drawPanel } from './drawHelpers';

const SLIDE_IN = 0.25;
const HOLD = 3.5;
const SLIDE_OUT = 0.25;
const TOTAL_LIFE = SLIDE_IN + HOLD + SLIDE_OUT;
const TOAST_W = 320;
const TOAST_H = 66;
const GAP = 8;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 20;
// Cap the visible stack so a long unlock window (e.g. on a final-boss kill)
// can't grow the queue indefinitely. Older toasts get evicted.
const MAX_TOASTS = 5;

function tierColor(tier: AchievementTier): string {
  if (tier === 'gold') return '#FFD700';
  if (tier === 'silver') return '#C0C0C0';
  return '#CD7F32';
}

export class AchievementToast {
  canvas: GameCanvas;
  gameState: GameState;
  soundSystem: SoundSystem | null;
  toasts: AchievementToastItem[] = [];

  constructor(canvas: GameCanvas, gameState: GameState, soundSystem: SoundSystem | null = null) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.soundSystem = soundSystem;
  }

  poll(): void {
    const ids = this.gameState.consumePendingToasts();
    for (const id of ids) {
      const def = this.gameState.getAchievementDefinition(id);
      if (!def) continue;
      const rewardPp = def.reward?.prestigePoints || 0;
      const toast = {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        tier: def.tier,
        rewardPp,
        age: 0,
        life: TOTAL_LIFE,
        y: -TOAST_H,
        targetY: 0,
      };
      this.toasts.push(toast);
      // Evict oldest if exceeding the visible cap.
      while (this.toasts.length > MAX_TOASTS) this.toasts.shift();
      // Only play the unlock stinger if the new toast actually made it into
      // the visible stack (previous code played for evicted entries too).
      if (this.soundSystem && this.toasts.includes(toast)) {
        this.soundSystem.play('levelUp');
      }
    }
  }

  update(deltaTime: number): void {
    this.poll();
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.age += deltaTime;
      if (t.age >= TOTAL_LIFE) {
        this.toasts[i] = this.toasts[this.toasts.length - 1];
        this.toasts.pop();
      }
    }
    // Set stacked target Y positions based on index
    for (let i = 0; i < this.toasts.length; i++) {
      this.toasts[i].targetY = TOP_MARGIN + i * (TOAST_H + GAP);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.toasts.length === 0) return;
    const xRight = this.canvas.logicalWidth - RIGHT_MARGIN;

    ctx.save();
    for (const t of this.toasts) {
      // Compute slide factor
      let xOffset = 0;
      let alpha = 1;
      if (t.age < SLIDE_IN) {
        const k = t.age / SLIDE_IN;
        xOffset = (1 - k) * (TOAST_W + RIGHT_MARGIN);
        alpha = k;
      } else if (t.age > SLIDE_IN + HOLD) {
        const k = (t.age - SLIDE_IN - HOLD) / SLIDE_OUT;
        xOffset = k * (TOAST_W + RIGHT_MARGIN);
        alpha = 1 - k;
      }
      const x = xRight - TOAST_W + xOffset;
      const y = t.targetY;

      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      // Background panel with tier-colored border + left accent stripe
      drawPanel(ctx, x, y, TOAST_W, TOAST_H, {
        borderColor: tierColor(t.tier),
        raised: true,
      });
      ctx.fillStyle = tierColor(t.tier);
      ctx.fillRect(x, y, 3, TOAST_H);

      // Icon box
      const iconSize = 46;
      const ix = x + 10;
      const iy = y + (TOAST_H - iconSize) / 2;
      ctx.fillStyle = tierColor(t.tier);
      ctx.fillRect(ix, iy, iconSize, iconSize);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.icon, ix + iconSize / 2, iy + iconSize / 2 + 10);

      // Text
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('ACHIEVEMENT UNLOCKED', ix + iconSize + 10, y + 16);
      ctx.fillStyle = tierColor(t.tier);
      ctx.font = 'bold 15px monospace';
      ctx.fillText(t.name.substring(0, 28), ix + iconSize + 10, y + 34);
      if (t.rewardPp > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`+${t.rewardPp} PP`, ix + iconSize + 10, y + 54);
      } else {
        ctx.fillStyle = COLORS.UI_INACTIVE;
        ctx.font = '11px monospace';
        ctx.fillText(t.description.substring(0, 34), ix + iconSize + 10, y + 54);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
