// Shared Canvas 2D drawing primitives used across menu screens to provide a
// cohesive, Steam-release-grade look while preserving the retro green terminal
// tone. These helpers are intentionally small and allocation-light: they cache
// timers on a global clock and avoid creating objects per frame.
//
// Usage: each screen reaches for drawPanel / drawPrimaryButton / etc. rather
// than reinventing rectangles. Screens that want ambient motion instantiate a
// single ParticleField and call update()/render() per frame.

import { COLORS } from '../constants';

// Shared monotonic clock, used for pulse/shimmer timing. Callers pass `now`
// explicitly where they already have one to keep render() deterministic.
export function nowMs(): number {
  return performance.now();
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export interface PanelOpts {
  // Optional top 1px accent bar in green/gold/cyan/red.
  accent?: 'green' | 'gold' | 'cyan' | 'red' | 'none';
  // Softer inner gradient for "raised" panels.
  raised?: boolean;
  // Override border color.
  borderColor?: string;
  // Skip the outline entirely.
  noBorder?: boolean;
  // Additional fill alpha scale (0..1).
  alpha?: number;
}

const ACCENT_COLORS: Record<string, string> = {
  green: COLORS.UI_TEXT,
  gold: COLORS.ACCENT_GOLD,
  cyan: COLORS.ACCENT_CYAN,
  red: COLORS.ACCENT_RED,
};

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: PanelOpts = {},
): void {
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;

  // Base fill.
  ctx.fillStyle = COLORS.PANEL_DARK;
  ctx.fillRect(x, y, w, h);

  // Subtle inner gradient for depth.
  if (opts.raised !== false) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.03)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  // Border.
  if (!opts.noBorder) {
    ctx.strokeStyle = opts.borderColor || COLORS.BORDER_STRONG;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // Top accent.
  if (opts.accent && opts.accent !== 'none') {
    ctx.fillStyle = ACCENT_COLORS[opts.accent] || COLORS.UI_TEXT;
    ctx.fillRect(x, y, w, 2);
  }

  ctx.globalAlpha = prevAlpha;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export interface ButtonOpts {
  hovered?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  focused?: boolean;
  // Optional "[ENTER]" style hint drawn beneath the right edge.
  hint?: string;
  // Override font size.
  fontSize?: number;
  // Pulse phase in radians for primary CTAs; defaults to nowMs()-derived.
  pulsePhase?: number;
}

function buttonPressOffset(pressed?: boolean): number {
  return pressed ? 1 : 0;
}

export function drawPrimaryButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string,
  opts: ButtonOpts = {},
): void {
  const dy = buttonPressOffset(opts.pressed);
  const phase = opts.pulsePhase ?? (nowMs() / 1000) * 2.5;
  const pulse = 0.5 + 0.5 * Math.sin(phase);

  if (opts.disabled) {
    ctx.fillStyle = 'rgba(0,30,0,0.35)';
    ctx.fillRect(x, y + dy, w, h);
    ctx.strokeStyle = '#1f2a1f';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5 + dy, w - 1, h - 1);
    ctx.fillStyle = '#2e3e2e';
    ctx.font = `bold ${opts.fontSize ?? 18}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + dy);
    return;
  }

  const hover = opts.hovered || opts.focused;

  // Outer glow on hover (shadow-based; cleared after).
  if (hover) {
    ctx.save();
    ctx.shadowColor = '#00FF66';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(x, y + dy, w, h);
    ctx.restore();
  }

  // Fill with pulse.
  const fillAlpha = 0.10 + 0.10 * pulse + (hover ? 0.12 : 0);
  ctx.fillStyle = `rgba(0,255,0,${fillAlpha.toFixed(3)})`;
  ctx.fillRect(x, y + dy, w, h);

  // Inner gradient sheen.
  const grad = ctx.createLinearGradient(x, y + dy, x, y + h + dy);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + dy, w, h);

  // Border + pulse width.
  ctx.strokeStyle = hover ? '#AAFFAA' : COLORS.UI_TEXT;
  ctx.lineWidth = hover ? 2.5 : 1.6 + pulse * 0.8;
  ctx.strokeRect(x + 0.5, y + 0.5 + dy, w - 1, h - 1);

  if (opts.focused) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 3 + dy, w + 6, h + 6);
  }

  // Label.
  ctx.fillStyle = hover ? '#FFFFFF' : '#D5FFD5';
  ctx.font = `bold ${opts.fontSize ?? 18}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + dy);
  ctx.textBaseline = 'alphabetic';

  if (opts.hint) {
    ctx.font = '11px monospace';
    ctx.fillStyle = COLORS.UI_INACTIVE;
    ctx.textAlign = 'right';
    ctx.fillText(opts.hint, x + w, y + h + 14 + dy);
    ctx.textAlign = 'left';
  }
}

export function drawSecondaryButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string,
  opts: ButtonOpts = {},
): void {
  const dy = buttonPressOffset(opts.pressed);
  const hover = opts.hovered || opts.focused;
  const disabled = opts.disabled;

  ctx.fillStyle = hover ? 'rgba(40,56,40,0.5)' : COLORS.PANEL_MID;
  ctx.fillRect(x, y + dy, w, h);

  ctx.strokeStyle = disabled ? '#1e2a1e' : (hover ? COLORS.UI_TEXT : COLORS.BORDER_STRONG);
  ctx.lineWidth = hover ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5 + dy, w - 1, h - 1);

  if (opts.focused) {
    ctx.strokeStyle = COLORS.UI_TEXT;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 3 + dy, w + 6, h + 6);
  }

  ctx.fillStyle = disabled ? '#2e3e2e' : (hover ? COLORS.UI_TEXT : COLORS.UI_INACTIVE);
  ctx.font = `bold ${opts.fontSize ?? 16}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + dy);
  ctx.textBaseline = 'alphabetic';
}

export function drawDangerButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string,
  opts: ButtonOpts = {},
): void {
  const dy = buttonPressOffset(opts.pressed);
  const hover = opts.hovered || opts.focused;

  ctx.fillStyle = hover ? 'rgba(80,10,10,0.55)' : 'rgba(40,6,6,0.45)';
  ctx.fillRect(x, y + dy, w, h);
  ctx.strokeStyle = hover ? COLORS.ACCENT_RED : '#7a1e1e';
  ctx.lineWidth = hover ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5 + dy, w - 1, h - 1);
  ctx.fillStyle = hover ? '#FFFFFF' : COLORS.ACCENT_RED;
  ctx.font = `bold ${opts.fontSize ?? 16}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + dy);
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export interface TitleOpts {
  size?: number;
  align?: CanvasTextAlign;
  color?: string;
  shimmer?: boolean;
  glow?: boolean;
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  opts: TitleOpts = {},
): void {
  const size = opts.size ?? 40;
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'alphabetic';

  const base = opts.color ?? COLORS.UI_TEXT;

  if (opts.shimmer) {
    const metrics = ctx.measureText(text);
    const approxW = metrics.width || size * text.length * 0.6;
    const ax = opts.align === 'left' ? x : opts.align === 'right' ? x - approxW : x - approxW / 2;
    const t = (nowMs() % 3000) / 3000;
    const grad = ctx.createLinearGradient(ax, 0, ax + approxW, 0);
    const pos = t;
    grad.addColorStop(Math.max(0, pos - 0.25), base);
    grad.addColorStop(Math.min(1, pos), '#CFFFCF');
    grad.addColorStop(Math.min(1, pos + 0.25), base);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = base;
  }

  if (opts.glow !== false) {
    ctx.shadowColor = base;
    ctx.shadowBlur = 14;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawSectionHeader(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number, width: number,
  color: string = COLORS.UI_TEXT,
): void {
  ctx.save();
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  // Letter-spaced all-caps feel via manual kerning.
  const spaced = text.toUpperCase().split('').join(' ');
  ctx.fillText(spaced, x, y);

  ctx.strokeStyle = COLORS.BORDER_SUBTLE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x + width, y + 6);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Particle field (ambient drifting dust)
// ---------------------------------------------------------------------------

interface Dust {
  x: number; y: number;
  vx: number; vy: number;
  r: number; a: number;
  hue: number; // 0 = green, 1 = gold
}

export interface ParticleFieldOpts {
  count?: number;
  colorMix?: number; // 0..1 gold mix
}

export class ParticleField {
  private dust: Dust[] = [];
  private w: number = 0;
  private h: number = 0;
  private lastTime: number = nowMs();
  private colorMix: number;

  constructor(opts: ParticleFieldOpts = {}) {
    this.colorMix = opts.colorMix ?? 0;
    const count = opts.count ?? 48;
    for (let i = 0; i < count; i++) {
      this.dust.push({
        x: 0, y: 0, vx: 0, vy: 0,
        r: 1 + Math.random() * 1.5,
        a: 0.10 + Math.random() * 0.25,
        hue: Math.random() < this.colorMix ? 1 : 0,
      });
    }
  }

  resize(w: number, h: number): void {
    if (this.w === w && this.h === h && this.dust[0] && (this.dust[0].x || this.dust[0].y)) return;
    this.w = w;
    this.h = h;
    for (const d of this.dust) {
      d.x = Math.random() * w;
      d.y = Math.random() * h;
      d.vx = (Math.random() - 0.5) * 10;
      d.vy = -5 - Math.random() * 12; // gently drift up
    }
  }

  update(dt: number): void {
    const w = this.w, h = this.h;
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < 0) d.x += w;
      else if (d.x > w) d.x -= w;
      if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
      else if (d.y > h + 4) d.y = -4;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = nowMs();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    for (const d of this.dust) {
      ctx.fillStyle = d.hue === 1
        ? `rgba(255,213,107,${d.a})`
        : `rgba(0,255,0,${d.a})`;
      ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: draw a vignette (corner darkening) — used by dramatic screens.
// ---------------------------------------------------------------------------

export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  strength: number = 0.55,
  tint: string = '#000000',
): void {
  const cx = w / 2, cy = h / 2;
  const r = Math.hypot(cx, cy);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, tint === '#000000'
    ? `rgba(0,0,0,${strength})`
    : `rgba(${parseInt(tint.slice(1,3),16)},${parseInt(tint.slice(3,5),16)},${parseInt(tint.slice(5,7),16)},${strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// Tween helper: ease-out cubic.
export function easeOutCubic(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - t, 3);
}
