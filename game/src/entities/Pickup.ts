import { Entity } from './Entity';
import { GAME_CONFIG } from '../constants';
import type { PickupType } from '../types';

// Cached font strings (avoid per-frame allocation).
const COIN_FONT_SMALL = 'bold 11px monospace';
const COIN_FONT_MED = 'bold 13px monospace';
const COIN_FONT_LARGE = 'bold 15px monospace';

export class Pickup extends Entity {
  type: PickupType;
  value: number;
  lifetime: number;
  maxLifetime: number;
  // Animation state.
  bobPhase: number;
  rotPhase: number;
  age: number;
  spawnBurst: number; // 0..1, decays quickly after spawn for a little pop
  // True when this coin was produced by a Capitalist business (as opposed to
  // a normal enemy drop). Renders with a distinct emerald-green palette and
  // receives an initial outward velocity so it pops out of the business sprite.
  fromBusiness: boolean = false;

  constructor(x: number, y: number, type: PickupType = 'money') {
    super(x, y);
    this.type = type;
    this.size = type === 'money' ? 16 : 18;
    this.value = type === 'money' ? GAME_CONFIG.MONEY_VALUE : 0;
    this.maxLifetime = 10;
    this.lifetime = this.maxLifetime;
    // Randomized phases so a cluster of pickups doesn't pulse in lockstep.
    this.bobPhase = Math.random() * Math.PI * 2;
    this.rotPhase = Math.random() * Math.PI * 2;
    this.age = 0;
    this.spawnBurst = 1;
  }

  update(deltaTime: number): void {
    this.lifetime -= deltaTime;
    this.age += deltaTime;
    if (this.spawnBurst > 0) {
      this.spawnBurst = Math.max(0, this.spawnBurst - deltaTime * 2.5);
    }
    // Business-coin pop-out arc: apply velocity with quick damping so the coin
    // flies up and out of the business sprite and then settles nearby.
    if (this.velocity.x !== 0 || this.velocity.y !== 0) {
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
      const damp = Math.pow(0.04, deltaTime);
      this.velocity.x *= damp;
      this.velocity.y *= damp;
      if (Math.abs(this.velocity.x) < 2 && Math.abs(this.velocity.y) < 2) {
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
    }
    if (this.lifetime <= 0) {
      this.alive = false;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Despawn fade + near-death pulse.
    const timeLeft = this.lifetime;
    let alpha = 1;
    if (timeLeft < 2) {
      // Fade out with a flicker pulse in the last 2s.
      const fade = Math.max(0, timeLeft / 2);
      const pulse = 0.65 + 0.35 * Math.sin(this.age * 18);
      alpha = fade * pulse;
    }
    if (alpha <= 0) return;

    const t = this.age;
    const bobY = Math.sin(t * 3 + this.bobPhase) * 2;
    const px = this.position.x;
    const py = this.position.y + bobY;

    ctx.globalAlpha = alpha;

    if (this.type === 'money') {
      this.renderCoin(ctx, px, py, t);
    } else {
      this.renderHeart(ctx, px, py, t);
    }

    ctx.globalAlpha = 1;
  }

  private renderCoin(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
    // Size tier based on value.
    const v = this.value;
    let radius: number;
    let font: string;
    if (v >= 15) {
      radius = 11;
      font = COIN_FONT_LARGE;
    } else if (v >= 5) {
      radius = 9;
      font = COIN_FONT_MED;
    } else {
      radius = 7;
      font = COIN_FONT_SMALL;
    }

    // Flip: oscillate ellipse width between -radius..+radius.
    const flip = Math.cos(t * 4 + this.rotPhase);
    const rx = Math.max(1.2, Math.abs(flip) * radius);
    const showingBack = flip < 0;

    // Business-coin palette: cool mint/emerald instead of warm gold so the
    // player can tell at a glance where the money came from. Also adds a
    // brighter halo so it stands out against business-sprite clutter.
    const halo = this.fromBusiness ? '#44FFAA' : '#FFD700';
    const ringColor = this.fromBusiness ? '#1e7a55' : '#B8860B';
    const faceFront = this.fromBusiness ? '#44FFAA' : '#FFD700';
    const faceBack = this.fromBusiness ? '#2BCC85' : '#D4A017';
    const hlFront = this.fromBusiness ? '#C8FFE4' : '#FFF4A8';
    const hlBack = this.fromBusiness ? '#A8FFD0' : '#FFE98A';

    // Glow halo. Always present, extra strong during spawn burst.
    const haloR = radius + 6 + this.spawnBurst * 6;
    const haloAlpha = (0.18 + this.spawnBurst * 0.35) * (this.fromBusiness ? 1.3 : 1);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * haloAlpha;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(px, py, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;

    // Outer coin ring.
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.ellipse(px, py, rx + 1, radius + 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coin face.
    ctx.fillStyle = showingBack ? faceBack : faceFront;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, radius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight (lighter circle, offset up-left).
    const hlRx = Math.max(0.6, rx * 0.45);
    const hlRy = radius * 0.45;
    ctx.fillStyle = showingBack ? hlBack : hlFront;
    ctx.beginPath();
    ctx.ellipse(px - rx * 0.25, py - radius * 0.3, hlRx, hlRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // "$" glyph on the face when close to flat-on.
    if (Math.abs(flip) > 0.55) {
      ctx.font = font;
      ctx.fillStyle = this.fromBusiness ? '#0B4A30' : '#7A5A00';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', px, py + 0.5);
    }
  }

  private renderHeart(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
    // Pulsing scale + glow.
    const pulse = 0.9 + 0.15 * Math.sin(t * 5 + this.rotPhase);
    const s = 2 * pulse; // unit size; heart ~ 10-12 px wide

    // Glow halo.
    const haloR = 10 + pulse * 3 + this.spawnBurst * 5;
    const haloAlpha = Math.max(0, 0.22 + 0.12 * Math.sin(t * 5) + this.spawnBurst * 0.3);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * haloAlpha;
    ctx.fillStyle = '#FF4050';
    ctx.beginPath();
    ctx.arc(px, py, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;

    // Pixel heart: two circles (lobes) + triangle bottom, dark outline underneath.
    const lobeR = 3.2 * pulse;
    const lobeOffX = 2.6 * pulse;
    const lobeOffY = -1.2 * pulse;

    // Outline layer.
    ctx.fillStyle = '#5A0010';
    ctx.beginPath();
    ctx.arc(px - lobeOffX, py + lobeOffY, lobeR + 1, 0, Math.PI * 2);
    ctx.arc(px + lobeOffX, py + lobeOffY, lobeR + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - (lobeOffX + lobeR), py + lobeOffY);
    ctx.lineTo(px + (lobeOffX + lobeR), py + lobeOffY);
    ctx.lineTo(px, py + 5 * pulse + 1);
    ctx.closePath();
    ctx.fill();

    // Red fill.
    ctx.fillStyle = '#FF3048';
    ctx.beginPath();
    ctx.arc(px - lobeOffX, py + lobeOffY, lobeR, 0, Math.PI * 2);
    ctx.arc(px + lobeOffX, py + lobeOffY, lobeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - (lobeOffX + lobeR) + 0.5, py + lobeOffY);
    ctx.lineTo(px + (lobeOffX + lobeR) - 0.5, py + lobeOffY);
    ctx.lineTo(px, py + 5 * pulse);
    ctx.closePath();
    ctx.fill();

    // Bright highlight dot on the left lobe.
    ctx.fillStyle = '#FFB0B8';
    ctx.beginPath();
    ctx.arc(px - lobeOffX - 0.6 * s, py + lobeOffY - 0.6 * s, 1.1 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}
