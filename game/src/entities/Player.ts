import { Entity } from './Entity';
import { GAME_CONFIG, COLORS } from '../constants';
import type { Vec2 } from '../types';
import type { Input } from '../input';
import type { Enemy } from './Enemy';

export class Player extends Entity {
  speed: number;
  color: string;
  aimAngle: number;

  // Item flags set by game.js during level start
  hasVampiric = false;
  hasDoubleTap = false;
  hasBounceHouse = false;
  bounceHouseStacks = 0;
  hasExplosiveRounds = false;
  hasLifeSteal = false;
  hasBloodPact = false;
  hasAdrenalineRush = false;
  adrenalineActive = false;
  baseSpeed = 0;
  killCount = 0;
  stats: Record<string, number> = {};
  _teleportInvuln = 0;
  _shieldBubble: unknown = null;

  // Render polish state
  private _prevHealth: number = 0;
  private _hitFlashTimer: number = 0;   // 0..0.1 seconds
  private _damagePulseTimer: number = 0; // 0..0.25 seconds
  private _lowHpPhase: number = 0;
  private _visualTime: number = 0;
  private _tiltX: number = 0;
  private _tiltY: number = 0;
  // Directional recoil from last damage source (decays in ~0.2s).
  private _recoilX: number = 0;
  private _recoilY: number = 0;
  private _recoilTimer: number = 0;
  // Dodge feedback: "DODGE!" float + blue flash.
  private _dodgeTimer: number = 0;       // 0..0.6 seconds
  // Heal sparkle particles (on HP increase from regen or pickup).
  private _healParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number }> = [];
  // Kill-streak combo tracking (best-effort based on killCount deltas).
  private _prevKillCount: number = 0;
  private _comboCount: number = 0;
  private _comboTimer: number = 0;       // seconds until combo resets (2s grace)
  private _comboFlashTimer: number = 0;  // brief punch on increment

  constructor(x: number, y: number) {
    super(x, y);
    this.size = GAME_CONFIG.PLAYER_SIZE;
    this.speed = GAME_CONFIG.PLAYER_SPEED;
    this.health = GAME_CONFIG.PLAYER_HEALTH;
    this.maxHealth = GAME_CONFIG.PLAYER_HEALTH;
    this.color = COLORS.PLAYER;
    this.aimAngle = 0;
    this._prevHealth = this.health;
    this._prevKillCount = this.killCount;
  }

  /** External notify: player dodged an incoming attack. Triggers "DODGE!" + blue flash. */
  notifyDodge(): void {
    this._dodgeTimer = 0.6;
  }

  /** External notify: player scored a kill. Increments combo counter. */
  notifyKill(): void {
    this._comboCount++;
    this._comboTimer = 2.0;
    this._comboFlashTimer = 0.2;
  }

  /** Override so damage sources can hint a recoil direction. */
  override takeDamage(amount: number, sourceX?: number, sourceY?: number): void {
    const before = this.health;
    super.takeDamage(amount);
    if (this.health < before && sourceX !== undefined && sourceY !== undefined) {
      const dx = this.position.x - sourceX;
      const dy = this.position.y - sourceY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this._recoilX = (dx / len);
      this._recoilY = (dy / len);
      this._recoilTimer = 0.2;
    }
  }

  update(
    deltaTime: number,
    input: Input,
    mousePosition: Vec2 | null,
    canvasWidth: number,
    canvasHeight: number,
    gameAreaTop = 0,
    joystickVector: Vec2 | null = null,
    enemies: Enemy[] = [],
    aimMode: string = 'auto'
  ): void {
    this.velocity.x = 0;
    this.velocity.y = 0;

    if (joystickVector && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
      this.velocity.x = joystickVector.x * this.speed;
      this.velocity.y = joystickVector.y * this.speed;
    } else {
      if (input.pressed('ArrowLeft') || input.pressed('a')) this.velocity.x = -this.speed;
      if (input.pressed('ArrowRight') || input.pressed('d')) this.velocity.x = this.speed;
      if (input.pressed('ArrowUp') || input.pressed('w')) this.velocity.y = -this.speed;
      if (input.pressed('ArrowDown') || input.pressed('s')) this.velocity.y = this.speed;

      if (this.velocity.x !== 0 && this.velocity.y !== 0) {
        const factor = 1 / Math.sqrt(2);
        this.velocity.x *= factor;
        this.velocity.y *= factor;
      }
    }

    if (aimMode === 'manual') {
      if (mousePosition) {
        const dx = mousePosition.x - this.position.x;
        const dy = mousePosition.y - this.position.y;
        this.aimAngle = Math.atan2(dy, dx);
      }
    } else {
      let closestEnemy: Enemy | null = null;
      let minDistanceSq = Infinity;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - this.position.x;
        const dy = enemy.position.y - this.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        const dx = closestEnemy.position.x - this.position.x;
        const dy = closestEnemy.position.y - this.position.y;
        this.aimAngle = Math.atan2(dy, dx);
      } else if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        this.aimAngle = Math.atan2(this.velocity.y, this.velocity.x);
      }
    }

    super.update(deltaTime);

    const halfSize = this.size / 2;
    this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
    this.position.y = Math.max(gameAreaTop + halfSize, Math.min(canvasHeight - halfSize, this.position.y));

    // Visual polish timers
    this._visualTime += deltaTime;
    if (this.health < this._prevHealth) {
      this._hitFlashTimer = 0.1;
      this._damagePulseTimer = 0.25;
    } else if (this.health > this._prevHealth) {
      // HP went up: spawn a small green sparkle burst.
      const n = 4;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 30 + Math.random() * 40;
        this._healParticles.push({
          x: this.position.x + (Math.random() - 0.5) * this.size,
          y: this.position.y + (Math.random() - 0.5) * this.size,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 20,
          life: 0.5 + Math.random() * 0.2,
          max: 0.7,
        });
      }
    }
    this._prevHealth = this.health;

    // Kill-streak: best-effort from killCount deltas. killCount is bumped on
    // every kill (and may be periodically reset to 0 by vampiric). A reset to
    // zero still represents (at least) one kill crossing the threshold.
    if (this.killCount > this._prevKillCount) {
      const delta = this.killCount - this._prevKillCount;
      this._comboCount += delta;
      this._comboTimer = 2.0;
      this._comboFlashTimer = 0.2;
    } else if (this.killCount < this._prevKillCount && this.killCount === 0) {
      this._comboCount += 1;
      this._comboTimer = 2.0;
      this._comboFlashTimer = 0.2;
    }
    this._prevKillCount = this.killCount;
    if (this._comboTimer > 0) {
      this._comboTimer = Math.max(0, this._comboTimer - deltaTime);
      if (this._comboTimer <= 0) this._comboCount = 0;
    }
    if (this._comboFlashTimer > 0) this._comboFlashTimer = Math.max(0, this._comboFlashTimer - deltaTime);

    if (this._hitFlashTimer > 0) this._hitFlashTimer = Math.max(0, this._hitFlashTimer - deltaTime);
    if (this._damagePulseTimer > 0) this._damagePulseTimer = Math.max(0, this._damagePulseTimer - deltaTime);
    if (this._recoilTimer > 0) this._recoilTimer = Math.max(0, this._recoilTimer - deltaTime);
    if (this._dodgeTimer > 0) this._dodgeTimer = Math.max(0, this._dodgeTimer - deltaTime);
    this._lowHpPhase += deltaTime * 6;

    // Heal sparkles: simple gravity-less decay, swap-and-pop.
    if (this._healParticles.length > 0) {
      let hpN = this._healParticles.length;
      for (let i = hpN - 1; i >= 0; i--) {
        const p = this._healParticles[i];
        p.life -= deltaTime;
        if (p.life <= 0) {
          this._healParticles[i] = this._healParticles[--hpN];
          continue;
        }
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.vy += 40 * deltaTime; // soft fall
      }
      this._healParticles.length = hpN;
    }

    // Smoothly lean into motion vector
    const targetTiltX = this.velocity.x !== 0 ? (this.velocity.x / this.speed) : 0;
    const targetTiltY = this.velocity.y !== 0 ? (this.velocity.y / this.speed) : 0;
    const tiltLerp = Math.min(1, deltaTime * 10);
    this._tiltX += (targetTiltX - this._tiltX) * tiltLerp;
    this._tiltY += (targetTiltY - this._tiltY) * tiltLerp;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const px = this.position.x;
    const py = this.position.y;
    const half = this.size / 2;
    const healthPercent = this.health / this.maxHealth;
    const lowHp = healthPercent < 0.25;

    // Damage scale pulse (1.15 → 1.0 over 0.25s)
    const pulse = this._damagePulseTimer > 0 ? 1 + (this._damagePulseTimer / 0.25) * 0.15 : 1;
    const tiltX = this._tiltX * 3; // skew offset in pixels
    const tiltY = this._tiltY * 3;
    // Directional recoil "hop" away from damage source (~5px peak, decays 0.2s)
    const recoilK = this._recoilTimer > 0 ? (this._recoilTimer / 0.2) : 0;
    const recoilPx = this._recoilX * recoilK * 5;
    const recoilPy = this._recoilY * recoilK * 5;
    const drawHalf = half * pulse;

    ctx.save();

    // Drop shadow underline
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - drawHalf + 2, py - drawHalf + 4, drawHalf * 2, drawHalf * 2);

    // Base square with subtle lean + recoil offset
    const bx = px - drawHalf + tiltX * 0.4 + recoilPx;
    const by = py - drawHalf + tiltY * 0.4 + recoilPy;
    const bw = drawHalf * 2;
    const bh = drawHalf * 2;

    ctx.fillStyle = this.color;
    ctx.fillRect(bx, by, bw, bh);

    // Inner highlight stripe (top edge) for dimension
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(bx, by, bw, Math.max(2, drawHalf * 0.25));

    // Hit flash overlay (~100ms)
    if (this._hitFlashTimer > 0) {
      const a = this._hitFlashTimer / 0.1;
      ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`;
      ctx.fillRect(bx, by, bw, bh);
    }

    // Low-HP pulsing red outline
    if (lowHp) {
      const pulseA = 0.5 + 0.5 * Math.sin(this._lowHpPhase);
      ctx.strokeStyle = `rgba(255,48,48,${0.45 + pulseA * 0.5})`;
      ctx.lineWidth = 2 + pulseA * 1.5;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    }

    // Underline accent in player color
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(bx - 2, by + bh + 2, bw + 4, 2);
    ctx.globalAlpha = 1;

    // Health bar
    const barWidth = this.size * 1.5;
    const barHeight = 4;
    const barY = py - half - 10;
    const barX = px - barWidth / 2;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = healthPercent > 0.5 ? this.color : (healthPercent > 0.25 ? '#FFCC00' : '#FF0000');
    ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

    // Heal sparkles
    if (this._healParticles.length > 0) {
      for (const p of this._healParticles) {
        const a = Math.max(0, p.life / p.max);
        ctx.fillStyle = `rgba(80,255,140,${0.85 * a})`;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }

    // Dodge feedback: blue flash ring + "DODGE!" float
    if (this._dodgeTimer > 0) {
      const t = this._dodgeTimer / 0.6;
      const ringR = drawHalf + 4 + (1 - t) * 14;
      ctx.strokeStyle = `rgba(80,180,255,${0.85 * t})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(px - ringR, py - ringR, ringR * 2, ringR * 2);
      // Soft blue overlay on the player
      ctx.fillStyle = `rgba(80,180,255,${0.35 * t})`;
      ctx.fillRect(bx, by, bw, bh);
      ctx.save();
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      const floatY = py - half - 20 - (1 - t) * 10;
      ctx.fillStyle = `rgba(0,0,0,${0.7 * t})`;
      ctx.fillText('DODGE!', px + 1, floatY + 1);
      ctx.fillStyle = `rgba(120,200,255,${t})`;
      ctx.fillText('DODGE!', px, floatY);
      ctx.restore();
    }

    // Kill-streak combo counter (only visible when >= 2)
    if (this._comboCount >= 2) {
      const punch = this._comboFlashTimer > 0 ? 1 + (this._comboFlashTimer / 0.2) * 0.4 : 1;
      const scale = punch;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(11 * scale)}px monospace`;
      const cy = py - half - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(`x${this._comboCount}`, px + 1, cy + 1);
      // Color ramps with streak size
      const warm = Math.min(1, (this._comboCount - 2) / 8);
      const r = 255;
      const g = Math.round(220 - warm * 140);
      const b = Math.round(80 - warm * 80);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillText(`x${this._comboCount}`, px, cy);
      ctx.restore();
    }

    ctx.restore();
  }
}
