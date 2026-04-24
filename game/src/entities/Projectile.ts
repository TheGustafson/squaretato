import { Entity } from './Entity';
import { GAME_CONFIG, COLORS } from '../constants';
import type { ProjectileOwner, Vec2 } from '../types';
import type { Enemy } from './Enemy';

const TRAIL_LEN = 10;
const FADE_TIME = 0.3;
const ENEMY_CORE = '#FF3366';
const ENEMY_HALO = 'rgba(255, 51, 102, 0.28)';

// Cached halo colors keyed by core color.
const HALO_CACHE = new Map<string, string>();

function hexToRgba(hex: string, alpha: number): string {
  // Supports #RGB, #RRGGBB, and rgba()/rgb()/named fallback.
  if (hex.charAt(0) === '#') {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex.charAt(1) + hex.charAt(1), 16);
      g = parseInt(hex.charAt(2) + hex.charAt(2), 16);
      b = parseInt(hex.charAt(3) + hex.charAt(3), 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

function haloFor(core: string): string {
  let halo = HALO_CACHE.get(core);
  if (!halo) {
    halo = hexToRgba(core, 0.28);
    HALO_CACHE.set(core, halo);
  }
  return halo;
}

export class Projectile extends Entity {
  speed: number;
  damage: number;
  owner: ProjectileOwner;
  bounces: number;
  maxBounces: number;
  lifetime: number;
  maxLifetime: number;
  color: string | null;
  weaponId: string = '';

  explosive: boolean;
  explosionRadius: number;
  explosionDamage: number;

  piercing: boolean;
  hitEnemies: Set<Enemy>;

  waveMotion: boolean;
  wavePhase: number;
  waveAmplitude: number;
  initialAngle: number;
  distanceTraveled: number;

  smartBounce: boolean;
  trail: boolean;
  lastTrailPosition: Vec2;

  chainLightning: boolean;
  chainJumps: number;
  chainRange: number;
  chainDamageDecay: number;
  chainsRemaining: number;

  boomerang: boolean;
  boomerangDistance: number;
  boomerangStartPos: Vec2 | null;
  boomerangReturning: boolean;
  boomerangTravelDistance: number;

  gravityWell: boolean;
  wellDuration: number;
  wellRadius: number;
  wellStrength: number;
  wellDamage: number;
  wellActive: boolean;
  wellTimer: number;

  autoAimRadius: number;

  homing: boolean;
  homingTarget: Enemy | null;
  homingStrength: number;

  // Visual polish state.
  rotation: number;
  spin: number;
  // Float32Array ring buffer of past positions: [x0,y0,x1,y1,...].
  private trailBuffer: Float32Array;
  private trailHead: number;
  private trailFilled: number;
  // Sparks for piercing pass-through (x,y,vx,vy,life) per spark, max 6.
  private sparks: Float32Array;
  private sparkCount: number;

  constructor(x: number, y: number, angle: number, owner: ProjectileOwner = 'player') {
    super(x, y);
    this.size = GAME_CONFIG.PROJECTILE_SIZE;
    this.speed = GAME_CONFIG.PROJECTILE_SPEED;
    this.damage = 25;
    this.owner = owner;
    this.bounces = 0;
    this.maxBounces = 0;
    this.lifetime = 5;
    this.maxLifetime = 5;
    this.color = null;

    this.explosive = false;
    this.explosionRadius = 0;
    this.explosionDamage = 0;

    this.piercing = false;
    this.hitEnemies = new Set();

    this.waveMotion = false;
    this.wavePhase = 0;
    this.waveAmplitude = 0;
    this.initialAngle = angle;
    this.distanceTraveled = 0;

    this.smartBounce = false;
    this.trail = false;
    this.lastTrailPosition = { x, y };

    this.chainLightning = false;
    this.chainJumps = 0;
    this.chainRange = 0;
    this.chainDamageDecay = 1;
    this.chainsRemaining = 0;

    this.boomerang = false;
    this.boomerangDistance = 0;
    this.boomerangStartPos = null;
    this.boomerangReturning = false;
    this.boomerangTravelDistance = 0;

    this.gravityWell = false;
    this.wellDuration = 0;
    this.wellRadius = 0;
    this.wellStrength = 0;
    this.wellDamage = 0;
    this.wellActive = false;
    this.wellTimer = 0;

    this.autoAimRadius = 25;

    this.homing = false;
    this.homingTarget = null;
    this.homingStrength = 0;

    this.rotation = angle;
    this.spin = 0;
    this.trailBuffer = new Float32Array(TRAIL_LEN * 2);
    this.trailHead = 0;
    this.trailFilled = 0;
    this.sparks = new Float32Array(6 * 5);
    this.sparkCount = 0;

    this.velocity.x = Math.cos(angle) * this.speed;
    this.velocity.y = Math.sin(angle) * this.speed;
  }

  // Call when a piercing projectile passes through an enemy.
  emitPierceSparks(): void {
    const maxSparks = 6;
    // Emit 2 sparks perpendicular to travel direction.
    const ang = Math.atan2(this.velocity.y, this.velocity.x);
    for (let i = 0; i < 2 && this.sparkCount < maxSparks; i++) {
      const perp = ang + (i === 0 ? Math.PI / 2 : -Math.PI / 2);
      const spd = 60 + Math.random() * 40;
      const idx = this.sparkCount * 5;
      this.sparks[idx] = this.position.x;
      this.sparks[idx + 1] = this.position.y;
      this.sparks[idx + 2] = Math.cos(perp) * spd;
      this.sparks[idx + 3] = Math.sin(perp) * spd;
      this.sparks[idx + 4] = 0.25;
      this.sparkCount++;
    }
  }

  update(deltaTime: number, canvasWidth?: number, canvasHeight?: number, enemies?: Enemy[] | null): void {
    if (this.homing && enemies && this.alive) {
      if (this.homingTarget && (!this.homingTarget.alive || this.homingTarget.health <= 0)) {
        this.homingTarget = null;
      }

      if (!this.homingTarget) {
        let closestEnemy: Enemy | null = null;
        let closestDistSq = Infinity;
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const dx = enemy.position.x - this.position.x;
          const dy = enemy.position.y - this.position.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestEnemy = enemy;
          }
        }
        this.homingTarget = closestEnemy;
      }

      if (this.homingTarget) {
        const dx = this.homingTarget.position.x - this.position.x;
        const dy = this.homingTarget.position.y - this.position.y;
        const targetAngle = Math.atan2(dy, dx);
        const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);

        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const turnSpeed = this.homingStrength * deltaTime;
        const newAngle = currentAngle + Math.min(Math.max(angleDiff, -turnSpeed), turnSpeed);

        this.velocity.x = Math.cos(newAngle) * this.speed;
        this.velocity.y = Math.sin(newAngle) * this.speed;
      }
    } else if (this.owner === 'player' && !this.piercing && !this.homing && enemies && this.alive) {
      let closestEnemy: Enemy | null = null;
      let closestDistSq = this.autoAimRadius * this.autoAimRadius;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - this.position.x;
        const dy = enemy.position.y - this.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        const dx = closestEnemy.position.x - this.position.x;
        const dy = closestEnemy.position.y - this.position.y;
        const targetAngle = Math.atan2(dy, dx);
        this.velocity.x = Math.cos(targetAngle) * this.speed;
        this.velocity.y = Math.sin(targetAngle) * this.speed;
      }
    }

    if (this.gravityWell && this.owner === 'player') {
      if (!this.wellActive && this.lifetime <= 0) {
        this.wellActive = true;
        this.wellTimer = this.wellDuration;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.lifetime = this.wellDuration;
        this.maxLifetime = this.wellDuration;
      }

      if (this.wellActive && enemies) {
        const wellRadiusSq = this.wellRadius * this.wellRadius;
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const dx = this.position.x - enemy.position.x;
          const dy = this.position.y - enemy.position.y;
          const distSq = dx * dx + dy * dy;
          // Squared-radius gate avoids sqrt on every non-pulled enemy.
          if (distSq <= wellRadiusSq && distSq > 0) {
            const distance = Math.sqrt(distSq);
            const pullForce = this.wellStrength / (distance + 1);
            enemy.velocity.x += (dx / distance) * pullForce * deltaTime;
            enemy.velocity.y += (dy / distance) * pullForce * deltaTime;
            if (this.wellDamage > 0) {
              enemy.takeDamage(this.wellDamage * deltaTime);
            }
          }
        }
      }
    }

    if (this.boomerang && this.owner === 'player') {
      this.boomerangTravelDistance += this.speed * deltaTime;

      if (!this.boomerangReturning && this.boomerangTravelDistance >= this.boomerangDistance) {
        this.boomerangReturning = true;
        this.hitEnemies.clear();
      }

      if (this.boomerangReturning && this.boomerangStartPos) {
        const dx = this.boomerangStartPos.x - this.position.x;
        const dy = this.boomerangStartPos.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 20) {
          this.alive = false;
          return;
        }

        const returnAngle = Math.atan2(dy, dx);
        this.velocity.x = Math.cos(returnAngle) * this.speed;
        this.velocity.y = Math.sin(returnAngle) * this.speed;
      }

      // Boomerangs "roll" visually.
      this.spin = 18;
    }

    if (this.waveMotion) {
      this.distanceTraveled += this.speed * deltaTime;
      const waveOffset = Math.sin(this.distanceTraveled * 0.07 + this.wavePhase) * this.waveAmplitude;
      const perpAngle = this.initialAngle + Math.PI / 2;
      this.velocity.x = Math.cos(this.initialAngle) * this.speed + Math.cos(perpAngle) * waveOffset * 2.0;
      this.velocity.y = Math.sin(this.initialAngle) * this.speed + Math.sin(perpAngle) * waveOffset * 2.0;
    }

    // Sub-step integration to prevent tunneling when projectiles move far per frame.
    // Entity.update integrates in one step; replace that with a sub-stepped loop here.
    const vx = this.velocity.x;
    const vy = this.velocity.y;
    const maxStep = Math.max(this.size * 0.75, 8);
    // Compare against squared magnitude first to skip sqrt in the common case
    // where the projectile moves less than maxStep per frame (vast majority).
    const stepDistSq = (vx * vx + vy * vy) * deltaTime * deltaTime;
    const maxStepSq = maxStep * maxStep;
    let subSteps = 1;
    if (stepDistSq > maxStepSq) {
      const stepDist = Math.sqrt(stepDistSq);
      subSteps = Math.min(8, Math.ceil(stepDist / maxStep));
    }
    const sub = deltaTime / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.position.x += this.velocity.x * sub;
      this.position.y += this.velocity.y * sub;
    }

    // Rotation (rolling visual).
    if (this.spin !== 0 || this.size >= 10 || this.boomerang) {
      if (this.spin === 0 && (this.size >= 10 || this.boomerang)) {
        // Face travel direction for elongated projectiles.
        this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
      } else {
        this.rotation += this.spin * deltaTime;
      }
    }

    // Trail ring buffer push.
    if (this.trail) {
      const idx = this.trailHead * 2;
      this.trailBuffer[idx] = this.position.x;
      this.trailBuffer[idx + 1] = this.position.y;
      this.trailHead = (this.trailHead + 1) % TRAIL_LEN;
      if (this.trailFilled < TRAIL_LEN) this.trailFilled++;
    }

    // Update sparks (piercing pass-through).
    if (this.sparkCount > 0) {
      let write = 0;
      for (let i = 0; i < this.sparkCount; i++) {
        const idx = i * 5;
        let life = this.sparks[idx + 4] - deltaTime;
        if (life <= 0) continue;
        const nx = this.sparks[idx] + this.sparks[idx + 2] * deltaTime;
        const ny = this.sparks[idx + 1] + this.sparks[idx + 3] * deltaTime;
        // Swap-and-pop style compaction.
        const wIdx = write * 5;
        this.sparks[wIdx] = nx;
        this.sparks[wIdx + 1] = ny;
        this.sparks[wIdx + 2] = this.sparks[idx + 2];
        this.sparks[wIdx + 3] = this.sparks[idx + 3];
        this.sparks[wIdx + 4] = life;
        write++;
      }
      this.sparkCount = write;
    }

    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.alive = false;
      return;
    }

    if (canvasWidth === undefined || canvasHeight === undefined) return;

    if (this.maxBounces > 0 && this.bounces < this.maxBounces) {
      const halfSize = this.size / 2;
      if (this.position.x - halfSize <= 0 || this.position.x + halfSize >= canvasWidth) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
        this.bounces++;
        if (this.waveMotion) this.initialAngle = Math.atan2(this.velocity.y, this.velocity.x);
      }
      if (this.position.y - halfSize <= 0 || this.position.y + halfSize >= canvasHeight) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Math.max(halfSize, Math.min(canvasHeight - halfSize, this.position.y));
        this.bounces++;
        if (this.waveMotion) this.initialAngle = Math.atan2(this.velocity.y, this.velocity.x);
      }
    } else {
      if (
        this.position.x < -50 || this.position.x > canvasWidth + 50 ||
        this.position.y < -50 || this.position.y > canvasHeight + 50
      ) {
        this.alive = false;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Resolve core color.
    let core: string;
    if (this.owner === 'enemy') {
      core = this.color || ENEMY_CORE;
    } else {
      core = this.color || COLORS.PLAYER;
    }

    // Lifetime fade during last FADE_TIME seconds.
    const fade = this.lifetime < FADE_TIME ? Math.max(0, this.lifetime / FADE_TIME) : 1;
    const prevAlpha = ctx.globalAlpha;
    if (fade < 1) ctx.globalAlpha = prevAlpha * fade;

    // Render trail as fading line segments via ring buffer.
    if (this.trail && this.trailFilled > 1) {
      ctx.strokeStyle = core;
      ctx.lineCap = 'round';
      const baseW = Math.max(1, this.size * 0.5);
      // Walk oldest -> newest.
      const start = (this.trailHead - this.trailFilled + TRAIL_LEN) % TRAIL_LEN;
      let prevX = this.trailBuffer[start * 2];
      let prevY = this.trailBuffer[start * 2 + 1];
      for (let i = 1; i < this.trailFilled; i++) {
        const idx = ((start + i) % TRAIL_LEN) * 2;
        const nx = this.trailBuffer[idx];
        const ny = this.trailBuffer[idx + 1];
        const t = i / this.trailFilled; // 0..1, newer = larger
        ctx.globalAlpha = prevAlpha * fade * t * 0.55;
        ctx.lineWidth = baseW * t;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        prevX = nx;
        prevY = ny;
      }
      ctx.globalAlpha = prevAlpha * fade;
    }

    // Sparks (piercing pass-through).
    if (this.sparkCount > 0) {
      ctx.fillStyle = core;
      for (let i = 0; i < this.sparkCount; i++) {
        const idx = i * 5;
        const life = this.sparks[idx + 4];
        ctx.globalAlpha = prevAlpha * fade * Math.max(0, life / 0.25);
        ctx.beginPath();
        ctx.arc(this.sparks[idx], this.sparks[idx + 1], 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = prevAlpha * fade;
    }

    const halfSize = this.size / 2;
    const haloR = halfSize * 1.9;
    const halo = this.owner === 'enemy' && !this.color ? ENEMY_HALO : haloFor(core);

    if (this.size >= 10) {
      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      ctx.rotate(this.rotation);

      // Halo glow.
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Core body.
      ctx.fillStyle = core;
      ctx.fillRect(-halfSize, -this.size / 4, this.size, this.size / 2);

      // Piercing outline.
      if (this.piercing) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(-halfSize, -this.size / 4, this.size, this.size / 2);
      }
      // Bouncing second ring.
      if (this.maxBounces > 0) {
        ctx.strokeStyle = core;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, halfSize + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Halo.
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Core.
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, halfSize, 0, Math.PI * 2);
      ctx.fill();

      // Piercing outline.
      if (this.piercing) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, halfSize + 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Bouncing second outer ring + brighter core already via halo.
      if (this.maxBounces > 0) {
        ctx.strokeStyle = core;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, halfSize + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (fade < 1) ctx.globalAlpha = prevAlpha;
  }
}
