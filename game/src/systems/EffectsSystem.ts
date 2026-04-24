import type { GameCanvas, Particle, FloatingText, Flash } from '../types';

// Extended particle for internal use — supports rings (shockwaves) and rotation for tumbling text.
interface PooledParticle extends Particle {
  active?: boolean;
  ring?: boolean;
  ringMaxRadius?: number;
  ringStartRadius?: number;
}

interface ExtendedFloatingText extends FloatingText {
  vx?: number;
  rotation?: number;
  rotSpeed?: number;
  maxLife?: number;
  scale?: number;
}

// Priority tiers control how much visual attention an event deserves.
// The system suppresses low-priority shakes/flashes when high-priority ones are active,
// and soft-clamps total visual "energy" so late-game swarms don't whiteout the screen.
export type FxPriority = 'low' | 'medium' | 'high' | 'cinematic';

export class EffectsSystem {
  canvas: GameCanvas;
  screenShake: { intensity: number; duration: number; offset: { x: number; y: number } };
  flashes: Flash[];
  particles: PooledParticle[];
  floatingTexts: ExtendedFloatingText[];

  // Shake budget: we accumulate shake "energy" instead of stacking intensities linearly.
  // Low-priority shakes contribute a tiny amount once the budget is full; high-priority
  // shakes still push through. This is the single fix for late-wave seizure-cam.
  private _shakeEnergy: number = 0;          // 0..~1.0 envelope
  private _shakeMaxIntensity: number = 0;    // cap this frame's displacement
  private _shakeDuration: number = 0;
  private _activeShakePriority: number = 0;  // priority level currently holding the budget
  private _lastShakeAt: number = 0;          // perf.now() of last accepted shake

  // Flash budget: rate-limits flashes and caps alpha so rapid fires don't whiteout.
  private _flashEnergy: number = 0;          // accumulator, drains over time
  private _lastDamageFlashAt: number = 0;

  // Damage-number aggregation — when many damage events land in a tight window
  // we coalesce to a single "+N" reading instead of spraying dozens of numbers.
  private _damageAccum: { amount: number; x: number; y: number; flushAt: number; count: number } | null = null;
  private readonly _DAMAGE_FLUSH_MS = 55;

  // Particle pool — pre-allocated, managed via activeCount + swap-and-pop.
  private _pool: PooledParticle[];
  private _poolCap: number;

  constructor(canvas: GameCanvas) {
    this.canvas = canvas;
    this.screenShake = { intensity: 0, duration: 0, offset: { x: 0, y: 0 } };
    this.flashes = [];
    this.floatingTexts = [];

    // Pool of recyclable particle objects — refilled on particle death to reduce GC pressure.
    this._poolCap = 2048;
    this._pool = [];
    this.particles = [];
  }

  private _priorityValue(p: FxPriority | undefined): number {
    switch (p) {
      case 'cinematic': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      default: return 1;
    }
  }

  // Acquire a particle object (from pool if available), push onto particles, return it.
  // Returns null only if total active particles exceed hard cap (graceful drop).
  private _acquire(): PooledParticle | null {
    if (this.particles.length >= this._poolCap) return null;
    const p: PooledParticle = this._pool.pop() ?? {
      x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#FFFFFF', size: 1,
    };
    // Reset optional flags. p.segment is intentionally NOT reset — rendering
    // gates on p.lightning, so a stale segment value is ignored. This lets
    // chain-lightning reuse the segment object instead of allocating a new
    // {x1,y1,x2,y2} literal per particle (many per call).
    p.gravity = undefined;
    p.fade = undefined;
    p.trail = undefined;
    p.lightning = undefined;
    p.glow = undefined;
    p.ring = undefined;
    p.ringMaxRadius = undefined;
    p.ringStartRadius = undefined;
    p.active = true;
    this.particles.push(p);
    return p;
  }

  // Release a particle back to the pool for reuse.
  private _release(p: PooledParticle): void {
    p.active = false;
    if (this._pool.length < this._poolCap) this._pool.push(p);
  }

  // Priority-aware, budget-saturating shake. Low-priority shakes get suppressed
  // while a higher-priority shake is currently holding the budget.
  addScreenShake(intensity: number = 5, duration: number = 0.2, priority: FxPriority = 'low'): void {
    const p = this._priorityValue(priority);
    const now = performance.now();
    // While a higher-priority shake is still active, ignore low-priority requests.
    if (p < this._activeShakePriority && this._shakeDuration > 0) {
      return;
    }
    // Short-window rate limit: at most one accepted "low" shake per 80ms.
    if (p === 1 && now - this._lastShakeAt < 80) return;

    // Saturating contribution: diminishing returns as energy fills.
    const headroom = Math.max(0, 1 - this._shakeEnergy);
    const contrib = Math.min(1, intensity / 14) * (0.35 + 0.65 * headroom) * (0.6 + 0.15 * p);
    this._shakeEnergy = Math.min(1, this._shakeEnergy + contrib);

    // Cap the visible intensity — cinematic caps at 16px, high at 10, medium 6, low 3.
    const ceilings = [0, 3, 6, 10, 16];
    const ceil = ceilings[p];
    this._shakeMaxIntensity = Math.max(this._shakeMaxIntensity, Math.min(ceil, intensity * (0.35 + 0.65 * headroom)));
    this._shakeDuration = Math.max(this._shakeDuration, duration);
    this.screenShake.intensity = this._shakeMaxIntensity;
    this.screenShake.duration = this._shakeDuration;
    this._activeShakePriority = Math.max(this._activeShakePriority, p);
    this._lastShakeAt = now;
  }

  // Priority-aware flash. Alpha contribution shrinks as flash energy fills.
  addFlash(color: string = '#FFFFFF', duration: number = 0.1, priority: FxPriority = 'low'): void {
    const p = this._priorityValue(priority);
    // Soft-suppress low-priority flashes when screen is already lit up.
    if (p === 1 && this._flashEnergy > 0.6) return;
    const headroom = Math.max(0, 1 - this._flashEnergy);
    const alphaScale = 0.35 + 0.65 * headroom;
    this._flashEnergy = Math.min(1, this._flashEnergy + (0.18 + 0.12 * p));
    // We encode priority-scaled alpha directly into the flash entry so render is cheap.
    const scaledDuration = duration * (p >= 3 ? 1 : 0.75);
    this.flashes.push({ color, duration: scaledDuration, maxDuration: scaledDuration, priority: p, alphaScale } as unknown as Flash);
  }

  addDamageFlash(): void {
    const now = performance.now();
    // Rate limit: player takes damage many times per second under boss area damage.
    if (now - this._lastDamageFlashAt < 220) return;
    this._lastDamageFlashAt = now;
    this.addFlash('#FF0000', 0.15, 'high');
    this.addScreenShake(4, 0.25, 'high');
  }

  addHealFlash(): void {
    this.addFlash('#00FF88', 0.18);
  }

  addPickupFlash(): void {
    this.addFlash('#FFFFFF', 0.06);
  }

  addKillEffect(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 100 + Math.random() * 100;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.life = 0.5; p.maxLife = 0.5; p.color = '#FF0000'; p.size = 3;
    }
    // No shake on individual kills — budgets ensure this is silent in crowds anyway,
    // and large kills now route through addScreenShake directly with 'high' priority.
  }

  addMoneyPickupEffect(x: number, y: number, value: number): void {
    this.floatingTexts.push({
      x, y, text: `+$${value}`, vy: -60, vx: (Math.random() - 0.5) * 20,
      life: 1, maxLife: 1, color: '#00FF88', rotation: 0, rotSpeed: (Math.random() - 0.5) * 1.5, scale: 1,
    });
    // Coin sparkle: small gold particles rising with gravity
    for (let i = 0; i < 6; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
      const speed = 60 + Math.random() * 80;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.life = 0.4; p.maxLife = 0.4; p.color = Math.random() < 0.5 ? '#FFD700' : '#FFEE55'; p.size = 2;
      p.gravity = 200;
    }
    this.addPickupFlash();
  }

  addLevelUpEffect(x: number, y: number): void {
    this.floatingTexts.push({
      x, y, text: 'LEVEL UP!', vy: -30, life: 2, maxLife: 2, color: '#FFFF00',
      size: 20, rotation: 0, rotSpeed: 0, scale: 1.2,
    });
    for (let i = 0; i < 16; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = (Math.PI * 2 * i) / 16;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * 150; p.vy = Math.sin(angle) * 150;
      p.life = 1; p.maxLife = 1; p.color = '#FFFF00'; p.size = 4;
    }
    this.addShockwave(x, y, '#FFFF00', 80, 0.4);
    this.addFlash('#FFFF00', 0.3);
  }

  addMuzzleFlash(x: number, y: number, angle: number, color: string = '#FFFF00'): void {
    for (let i = 0; i < 3; i++) {
      const p = this._acquire(); if (!p) break;
      const spread = (Math.random() - 0.5) * 0.3;
      const particleAngle = angle + spread;
      const speed = 200 + Math.random() * 100;
      p.x = x + Math.cos(angle) * 10; p.y = y + Math.sin(angle) * 10;
      p.vx = Math.cos(particleAngle) * speed; p.vy = Math.sin(particleAngle) * speed;
      p.life = 0.1; p.maxLife = 0.1; p.color = color; p.size = 2;
    }
  }

  addShellCasing(x: number, y: number): void {
    const p = this._acquire(); if (!p) return;
    p.x = x; p.y = y;
    p.vx = (Math.random() - 0.5) * 100; p.vy = -100 - Math.random() * 50;
    p.life = 0.5; p.maxLife = 0.5; p.color = '#FFD700'; p.size = 3; p.gravity = 300;
  }

  addImpactEffect(x: number, y: number, color: string = '#00FF00'): void {
    for (let i = 0; i < 4; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.life = 0.2; p.maxLife = 0.2; p.color = color; p.size = 2;
    }
  }

  // Tiered explosion — radius determines whether this is a small pop or a cinematic boom.
  // Small (≤35): particles only. Medium (36..89): particles + shockwave + modest shake.
  // Large (≥90): full treatment. Keeps rocket spam from being a constant white screen.
  addExplosionEffect(x: number, y: number, radius: number = 50): void {
    this._tieredExplosion(x, y, radius, '#FFA500');
  }

  addExplosion(x: number, y: number, radius: number, color: string): void {
    this._tieredExplosion(x, y, radius || 50, color || '#FFA500');
  }

  private _tieredExplosion(x: number, y: number, radius: number, color: string): void {
    const tier: 'small' | 'medium' | 'large' = radius <= 35 ? 'small' : (radius < 90 ? 'medium' : 'large');

    // Particle debris — always present, count scaled to tier.
    const debrisCount = tier === 'small' ? 6 : tier === 'medium' ? 10 : 14;
    const accent = color === '#FFA500' ? '#FF4500' : color;
    for (let i = 0; i < debrisCount; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = (Math.PI * 2 * i) / debrisCount + Math.random() * 0.25;
      const speed = (tier === 'small' ? 80 : tier === 'medium' ? 120 : 150) + Math.random() * 100;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      p.life = tier === 'small' ? 0.4 : tier === 'medium' ? 0.55 : 0.7;
      p.maxLife = p.life;
      p.color = Math.random() > 0.5 ? accent : color;
      p.size = tier === 'small' ? 3 + Math.random() * 2 : 4 + Math.random() * 3;
    }

    // Smoke puffs — only medium+.
    if (tier !== 'small') {
      const smokeCount = tier === 'medium' ? 3 : 5;
      for (let i = 0; i < smokeCount; i++) {
        const p = this._acquire(); if (!p) break;
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 50;
        p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed - 50;
        p.life = 1; p.maxLife = 1; p.color = '#666666'; p.size = 6 + Math.random() * 3;
      }
    }

    // Shockwave: medium+ only.
    if (tier !== 'small') {
      this.addShockwave(x, y, color, radius, tier === 'medium' ? 0.3 : 0.4);
    }

    // Shake & flash: strictly tiered. Small explosions contribute NOTHING to shake/flash.
    if (tier === 'medium') {
      this.addScreenShake(2, 0.15, 'medium');
    } else if (tier === 'large') {
      this.addFlash(color, 0.14, 'high');
      this.addScreenShake(5, 0.22, 'high');
    }
  }

  addShockwave(x: number, y: number, color: string, maxRadius: number, duration: number): void {
    const p = this._acquire(); if (!p) return;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.life = duration; p.maxLife = duration; p.color = color; p.size = 3;
    p.ring = true; p.ringStartRadius = 4; p.ringMaxRadius = maxRadius;
  }

  addTrail(x: number, y: number, dx: number, dy: number, color: string, count: number = 4): void {
    for (let i = 0; i < count; i++) {
      const p = this._acquire(); if (!p) break;
      const jitter = 0.4;
      p.x = x + (Math.random() - 0.5) * 3;
      p.y = y + (Math.random() - 0.5) * 3;
      p.vx = dx * (1 + (Math.random() - 0.5) * jitter);
      p.vy = dy * (1 + (Math.random() - 0.5) * jitter);
      p.life = 0.25; p.maxLife = 0.25; p.color = color; p.size = 2; p.fade = true;
    }
  }

  addCritPop(x: number, y: number, value: number): void {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 10, y,
      text: value.toFixed(0) + '!', vy: -70, vx: (Math.random() - 0.5) * 30,
      life: 1.1, maxLife: 1.1, color: '#FFDD00', size: 22,
      rotation: 0, rotSpeed: (Math.random() - 0.5) * 3, scale: 1.4,
    });
    // Yellow star burst
    for (let i = 0; i < 6; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = (Math.PI * 2 * i) / 6;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * 180; p.vy = Math.sin(angle) * 180;
      p.life = 0.35; p.maxLife = 0.35; p.color = '#FFDD00'; p.size = 3;
    }
  }

  addHealSparkle(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this._acquire(); if (!p) break;
      p.x = x + (Math.random() - 0.5) * 20;
      p.y = y + (Math.random() - 0.5) * 10;
      p.vx = (Math.random() - 0.5) * 30;
      p.vy = -40 - Math.random() * 40;
      p.life = 0.7; p.maxLife = 0.7;
      p.color = Math.random() < 0.5 ? '#66FFAA' : '#AAFFCC';
      p.size = 2 + Math.random() * 2;
    }
  }

  addChainLightningEffect(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1; const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const segments = Math.max(1, Math.floor(distance / 15));
    const perpAngle = angle + Math.PI / 2;
    const perpCos = Math.cos(perpAngle);
    const perpSin = Math.sin(perpAngle);

    // Iterate segment pairs inline — avoids building an intermediate
    // points[] of {x,y} literals (segments+1 allocs per call).
    let prevX = x1;
    let prevY = y1;
    for (let i = 1; i <= segments; i++) {
      let nx: number, ny: number;
      if (i === segments) {
        nx = x2; ny = y2;
      } else {
        const t = i / segments;
        const baseX = x1 + dx * t; const baseY = y1 + dy * t;
        const offset = (Math.random() - 0.5) * 20;
        nx = baseX + perpCos * offset;
        ny = baseY + perpSin * offset;
      }
      const midX = (prevX + nx) / 2;
      const midY = (prevY + ny) / 2;
      const a = this._acquire(); if (a) {
        a.x = midX; a.y = midY; a.vx = 0; a.vy = 0;
        a.life = 0.2; a.maxLife = 0.2; a.color = '#00FFFF'; a.size = 4; a.lightning = true;
        // Reuse existing segment object on the pooled particle if present.
        if (a.segment) {
          a.segment.x1 = prevX; a.segment.y1 = prevY; a.segment.x2 = nx; a.segment.y2 = ny;
        } else {
          a.segment = { x1: prevX, y1: prevY, x2: nx, y2: ny };
        }
      }
      const b = this._acquire(); if (b) {
        b.x = midX; b.y = midY; b.vx = 0; b.vy = 0;
        b.life = 0.15; b.maxLife = 0.15; b.color = '#88FFFF'; b.size = 2; b.lightning = true;
        if (b.segment) {
          b.segment.x1 = prevX; b.segment.y1 = prevY; b.segment.x2 = nx; b.segment.y2 = ny;
        } else {
          b.segment = { x1: prevX, y1: prevY, x2: nx, y2: ny };
        }
      }
      // Glow point at each segment joint (previous point).
      const g = this._acquire();
      if (g) {
        g.x = prevX; g.y = prevY; g.vx = 0; g.vy = 0;
        g.life = 0.25; g.maxLife = 0.25; g.color = '#00FFFF'; g.size = 8; g.glow = true;
      }
      prevX = nx;
      prevY = ny;
    }
    // Final endpoint glow.
    const gEnd = this._acquire();
    if (gEnd) {
      gEnd.x = x2; gEnd.y = y2; gEnd.vx = 0; gEnd.vy = 0;
      gEnd.life = 0.25; gEnd.maxLife = 0.25; gEnd.color = '#00FFFF'; gEnd.size = 8; gEnd.glow = true;
    }
  }

  addCritEffect(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this._acquire(); if (!p) break;
      const angle = (Math.PI * 2 * i) / 8;
      p.x = x; p.y = y; p.vx = Math.cos(angle) * 200; p.vy = Math.sin(angle) * 200;
      p.life = 0.3; p.maxLife = 0.3; p.color = '#FF00FF'; p.size = 3;
    }
  }

  addDamageNumber(x: number, y: number, damage: number, isCrit: boolean = false, isBoss: boolean = false): void {
    if (isCrit) { this.addCritPop(x, y, damage); return; }
    // Boss damage shows individually so players can read the DPS against the single target.
    if (isBoss) { this._spawnDamageText(x, y, damage, true); return; }

    // Otherwise: accumulate for a short window. Stops the screen from filling with
    // dozens of overlapping "+1.2" texts when 20 bullets hit 20 enemies in a frame.
    if (!this._damageAccum) {
      this._damageAccum = { amount: damage, x, y, flushAt: performance.now() + this._DAMAGE_FLUSH_MS, count: 1 };
    } else {
      this._damageAccum.amount += damage;
      this._damageAccum.x = x;
      this._damageAccum.y = y;
      this._damageAccum.count++;
    }
  }

  private _spawnDamageText(x: number, y: number, damage: number, isBoss: boolean): void {
    const mag = Math.min(1.8, 0.9 + Math.log10(Math.max(1, damage)) * 0.35);
    const color = isBoss ? '#FFAA33' : '#FFFFFF';
    const baseSize = isBoss ? 18 : 14;
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 20, y,
      text: damage.toFixed(damage >= 10 ? 0 : 1), vy: -40, vx: (Math.random() - 0.5) * 15,
      life: 0.8, maxLife: 0.8, color, size: baseSize,
      rotation: 0, rotSpeed: (Math.random() - 0.5) * 1.2, scale: mag,
    });
  }

  addProjectileTrail(x: number, y: number, color: string = '#00FF00', size: number = 2): void {
    const p = this._acquire(); if (!p) return;
    p.x = x; p.y = y;
    p.vx = (Math.random() - 0.5) * 20; p.vy = (Math.random() - 0.5) * 20;
    p.life = 0.2; p.maxLife = 0.2; p.color = color; p.size = size; p.fade = true;
  }

  addWaveTrail(x: number, y: number, color: string = '#FF8800'): void {
    const p = this._acquire(); if (!p) return;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.life = 2.0; p.maxLife = 2.0; p.color = color; p.size = 3; p.fade = true; p.trail = true;
  }

  update(deltaTime: number): void {
    // Drain shake + flash energy budgets so new events gradually get full weight again.
    this._shakeEnergy = Math.max(0, this._shakeEnergy - deltaTime * 1.4);
    this._flashEnergy = Math.max(0, this._flashEnergy - deltaTime * 2.2);

    // Flush aggregated damage number.
    if (this._damageAccum) {
      const now = performance.now();
      if (now >= this._damageAccum.flushAt) {
        this._spawnDamageText(this._damageAccum.x, this._damageAccum.y, this._damageAccum.amount, false);
        this._damageAccum = null;
      }
    }

    // Screen shake — decay intensity so accumulated shakes settle naturally.
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaTime;
      this._shakeDuration = this.screenShake.duration;
      if (this.screenShake.duration <= 0) {
        this.screenShake.offset.x = 0;
        this.screenShake.offset.y = 0;
        this.screenShake.intensity = 0;
        this._shakeMaxIntensity = 0;
        this._activeShakePriority = 0;
      } else {
        this.screenShake.offset.x = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.offset.y = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.intensity *= Math.max(0, 1 - deltaTime * 2.6);
        this._shakeMaxIntensity = this.screenShake.intensity;
      }
    }

    let n = this.flashes.length;
    for (let i = n - 1; i >= 0; i--) {
      this.flashes[i].duration -= deltaTime;
      if (this.flashes[i].duration <= 0) { this.flashes[i] = this.flashes[--n]; }
    }
    this.flashes.length = n;

    // Particle update with swap-and-pop + object pool recycling.
    const arr = this.particles;
    let len = arr.length;
    for (let i = len - 1; i >= 0; i--) {
      const p = arr[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      if (p.gravity) p.vy += p.gravity * deltaTime;
      p.vx *= 0.98;
      if (!p.gravity) p.vy *= 0.98;
      if (p.life <= 0) {
        len--;
        arr[i] = arr[len];
        this._release(p);
      }
    }
    arr.length = len;

    n = this.floatingTexts.length;
    for (let i = n - 1; i >= 0; i--) {
      const text = this.floatingTexts[i];
      text.y += (text.vy ?? 0) * deltaTime;
      text.x += (text.vx ?? 0) * deltaTime;
      // Decelerate horizontal drift, apply gravity-ish
      if (text.vx !== undefined) text.vx *= 0.95;
      if (text.vy !== undefined) text.vy += 20 * deltaTime; // gentle float-and-fall
      if (text.rotSpeed !== undefined) {
        text.rotation = (text.rotation ?? 0) + text.rotSpeed * deltaTime;
        text.rotSpeed *= 0.9;
      }
      text.life -= deltaTime;
      if (text.life <= 0) { this.floatingTexts[i] = this.floatingTexts[--n]; }
    }
    this.floatingTexts.length = n;
  }

  applyScreenShake(ctx: CanvasRenderingContext2D): void {
    if (this.screenShake.duration > 0) {
      ctx.save();
      ctx.translate(this.screenShake.offset.x, this.screenShake.offset.y);
    }
  }

  restoreScreenShake(ctx: CanvasRenderingContext2D): void {
    if (this.screenShake.duration > 0) ctx.restore();
  }

  renderParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const arr = this.particles;
    const count = arr.length;
    for (let i = 0; i < count; i++) {
      const p = arr[i];
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      if (p.ring) {
        const t = 1 - alpha;
        const startR = p.ringStartRadius ?? 2;
        const maxR = p.ringMaxRadius ?? 50;
        const r = startR + (maxR - startR) * t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.lightning && p.segment) {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.segment.x1, p.segment.y1); ctx.lineTo(p.segment.x2, p.segment.y2); ctx.stroke();
      } else if (p.glow) {
        ctx.fillStyle = p.color; ctx.shadowBlur = p.size; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.restore();
  }

  renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    for (const text of this.floatingTexts) {
      const maxLife = text.maxLife ?? 1;
      const lifeFrac = Math.max(0, Math.min(1, text.life / maxLife));
      // Fade in quickly, fade out smoothly
      const fadeIn = Math.min(1, (1 - lifeFrac) * 8);
      const fadeOut = Math.min(1, lifeFrac * 2);
      ctx.globalAlpha = Math.min(fadeIn, fadeOut) * 0.95;
      ctx.fillStyle = text.color;
      const baseSize = text.size ?? text.fontSize ?? 14;
      const scale = text.scale ?? 1;
      const fontPx = ((baseSize * 1.3 * scale) | 0) || 14;
      ctx.font = `bold ${fontPx}px monospace`;
      if (text.rotation) {
        ctx.save();
        ctx.translate(text.x, text.y);
        ctx.rotate(text.rotation);
        ctx.fillText(text.text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(text.text, text.x, text.y);
      }
    }
    ctx.restore();
  }

  renderFlashes(ctx: CanvasRenderingContext2D): void {
    if (this.flashes.length === 0) return;
    ctx.save();
    // Cap total alpha budget across all flashes to prevent whiteout when many stack.
    let remainingAlpha = 0.4;
    for (const flash of this.flashes) {
      const f = flash as unknown as Flash & { alphaScale?: number };
      const scale = f.alphaScale ?? 1;
      const a = (flash.duration / flash.maxDuration) * 0.28 * scale;
      const applied = Math.min(a, remainingAlpha);
      if (applied <= 0.002) continue;
      ctx.globalAlpha = applied;
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);
      remainingAlpha -= applied;
      if (remainingAlpha <= 0) break;
    }
    ctx.restore();
  }
}
