import type { GameCanvas } from '../types';

// Detect touch capability once at module load. Desktop (no touch) skips rendering.
const HAS_TOUCH: boolean = (() => {
  if (typeof window === 'undefined') return false;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const maxTouch = nav && typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  return ('ontouchstart' in window) || maxTouch > 0;
})();

export class VirtualJoystick {
  canvas: GameCanvas;
  active: boolean;
  origin: { x: number; y: number };
  current: { x: number; y: number };
  vector: { x: number; y: number };
  touchId: number | null;
  maxRadius: number;
  deadZone: number;

  constructor(canvas: GameCanvas) {
    this.canvas = canvas;
    this.active = false;
    this.origin = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.vector = { x: 0, y: 0 };
    this.touchId = null;
    this.maxRadius = 50;
    // Dead zone in pixels (relative to maxRadius). 15% of radius avoids accidental drift.
    this.deadZone = this.maxRadius * 0.15;
  }

  static hasTouchSupport(): boolean {
    return HAS_TOUCH;
  }

  handleTouchStart(touch: Touch, scaledX: number, scaledY: number): void {
    if (this.active) return;

    this.active = true;
    this.touchId = touch.identifier;
    this.origin.x = scaledX;
    this.origin.y = scaledY;
    this.current.x = scaledX;
    this.current.y = scaledY;
    this.updateVector();
  }

  handleTouchMove(touch: Touch, scaledX: number, scaledY: number): void {
    if (!this.active || touch.identifier !== this.touchId) return;

    this.current.x = scaledX;
    this.current.y = scaledY;
    this.updateVector();
  }

  handleTouchEnd(touch: Touch): void {
    if (!this.active || touch.identifier !== this.touchId) return;
    this.reset();
  }

  reset(): void {
    this.active = false;
    this.touchId = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.current.x = this.origin.x;
    this.current.y = this.origin.y;
  }

  updateVector(): void {
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const distSq = dx * dx + dy * dy;

    if (distSq === 0 || distSq < this.deadZone * this.deadZone) {
      // Dead zone: output zero but keep knob visual near origin
      this.vector.x = 0;
      this.vector.y = 0;
      return;
    }

    const distance = Math.sqrt(distSq);
    // Scale so that the dead zone maps to 0 and maxRadius maps to 1 (clamped)
    const usable = Math.max(0, distance - this.deadZone);
    const range = Math.max(1e-6, this.maxRadius - this.deadZone);
    let magnitude = usable / range;
    if (magnitude > 1) magnitude = 1;

    const invDist = 1 / distance;
    this.vector.x = dx * invDist * magnitude;
    this.vector.y = dy * invDist * magnitude;

    // Safety clamp — guarantee |vector| <= 1
    const vLenSq = this.vector.x * this.vector.x + this.vector.y * this.vector.y;
    if (vLenSq > 1) {
      const vLen = Math.sqrt(vLenSq);
      this.vector.x /= vLen;
      this.vector.y /= vLen;
    }

    // Clamp visual knob position to ring
    if (distance > this.maxRadius) {
      this.current.x = this.origin.x + dx * invDist * this.maxRadius;
      this.current.y = this.origin.y + dy * invDist * this.maxRadius;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    // Never render on non-touch devices
    if (!HAS_TOUCH) return;

    ctx.save();

    // Outer ring — translucent fill with soft border
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, this.maxRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, this.maxRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Dead zone indicator (subtle)
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, this.deadZone, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner knob — filled circle with border
    const knobR = this.maxRadius * 0.4;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(this.current.x, this.current.y, knobR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(this.current.x, this.current.y, knobR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
