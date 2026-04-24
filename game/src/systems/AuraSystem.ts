// AuraSystem — persistent AOE effects (damage zones, slow zones, buff zones).
//
// API:
//   addAura({ id, source, radius, duration, statMods, visual, position?, onTick?, onExpire?, permanent? })
//   - Re-adding an aura with the same (id, source) refreshes duration and replaces stats.
//   - `permanent: true` auras never expire until removed manually or cleared.
//   - `onTick(dt)` fires each update; `onExpire()` fires when the aura is removed by timeout.
//   - `position` is optional; when absent the aura follows the render center each frame
//     (e.g. auras bound to the player).
//
// Cleanup: expired auras are removed via swap-and-pop; no per-frame allocations.

export interface Aura {
  id: string;
  source: string;
  radius: number;
  duration: number;
  elapsed: number;
  permanent: boolean;
  statMods: Partial<AuraStats>;
  visual?: AuraVisual;
  position?: { x: number; y: number };
  onTick?: (dt: number) => void;
  onExpire?: () => void;
}

export interface AuraStats {
  damageMultiplier: number;
  speedMultiplier: number;
  fireRateMultiplier: number;
  damageReduction: number;
  regenPerSecond: number;
}

export interface AuraVisual {
  color: string;
  pulseSpeed: number;
  opacity: number;
}

export interface AuraTarget {
  position: { x: number; y: number };
  getActiveAuras?(): Aura[];
}

export function getAuraBonus(auras: Aura[], stat: keyof AuraStats): number {
  let result = stat.endsWith('Multiplier') ? 1 : 0;
  for (let i = 0; i < auras.length; i++) {
    const val = auras[i].statMods[stat];
    if (val === undefined) continue;
    if (stat.endsWith('Multiplier')) {
      result *= val;
    } else {
      result += val;
    }
  }
  return result;
}

// Squared-distance helper — avoids sqrt in hot paths.
export function auraContains(aura: Aura, x: number, y: number, centerX: number, centerY: number): boolean {
  const ax = aura.position ? aura.position.x : centerX;
  const ay = aura.position ? aura.position.y : centerY;
  const dx = x - ax;
  const dy = y - ay;
  return dx * dx + dy * dy <= aura.radius * aura.radius;
}

export class AuraSystem {
  auras: Aura[] = [];

  addAura(aura: Omit<Aura, 'elapsed'>): void {
    for (let i = 0; i < this.auras.length; i++) {
      const existing = this.auras[i];
      if (existing.id === aura.id && existing.source === aura.source) {
        existing.duration = aura.duration;
        existing.elapsed = 0;
        existing.statMods = aura.statMods;
        existing.radius = aura.radius;
        if (aura.visual) existing.visual = aura.visual;
        if (aura.position) existing.position = aura.position;
        if (aura.onTick) existing.onTick = aura.onTick;
        if (aura.onExpire) existing.onExpire = aura.onExpire;
        existing.permanent = !!aura.permanent;
        return;
      }
    }
    this.auras.push({ ...aura, elapsed: 0 });
  }

  removeAura(id: string, source?: string): void {
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      if (a.id === id && (!source || a.source === source)) {
        if (a.onExpire) a.onExpire();
        this.auras[i] = this.auras[this.auras.length - 1];
        this.auras.pop();
      }
    }
  }

  update(deltaTime: number): void {
    // Single pass: tick callback + expiry via swap-and-pop.
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const aura = this.auras[i];
      if (aura.onTick) aura.onTick(deltaTime);
      if (aura.permanent) continue;
      aura.elapsed += deltaTime;
      if (aura.elapsed >= aura.duration) {
        if (aura.onExpire) aura.onExpire();
        this.auras[i] = this.auras[this.auras.length - 1];
        this.auras.pop();
      }
    }
  }

  getAll(): Aura[] {
    return this.auras;
  }

  clear(): void {
    this.auras = [];
  }

  // Render each aura as a filled radial gradient with a pulsing dashed outline.
  // `centerX/centerY` is the fallback origin for auras without a fixed position.
  render(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    for (let i = 0; i < this.auras.length; i++) {
      const aura = this.auras[i];
      if (!aura.visual) continue;
      const v = aura.visual;
      const cx = aura.position ? aura.position.x : centerX;
      const cy = aura.position ? aura.position.y : centerY;

      const lifeFrac = aura.permanent ? 1 : Math.max(0, 1 - aura.elapsed / aura.duration);
      const pulse = 1 + Math.sin(aura.elapsed * v.pulseSpeed) * 0.08;
      const r = aura.radius * pulse;

      ctx.save();

      // Soft filled gradient — stronger at center, fade near edge.
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, v.color);
      gradient.addColorStop(0.6, v.color);
      gradient.addColorStop(1, v.color);
      ctx.globalAlpha = v.opacity * 0.18 * lifeFrac;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing dashed outline.
      ctx.globalAlpha = v.opacity * lifeFrac;
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -aura.elapsed * 40;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Faint inner ring for readability.
      ctx.globalAlpha = v.opacity * 0.4 * lifeFrac;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }
}
