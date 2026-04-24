import { Entity } from './Entity';
import { Projectile } from './Projectile';
import { BALANCE, getEnemyStats } from '../config/balance';
import type { EnemyBehavior } from '../types';
import type { Player } from './Player';
import type { EffectsSystem } from '../systems/EffectsSystem';

// Module-level render constants — lifted out of Enemy.render to avoid
// reallocating these lookup tables every frame for every boss enemy.
const BOSS_STROKE_COLORS: Record<string, string> = {
  standard: '#FF00FF', swarmKing: '#FF4444', artilleryTitan: '#FF6600', nexus: '#FFD700',
};
const BOSS_CORE_COLORS: Record<string, string> = {
  standard: '#FF00FF', swarmKing: '#FF0000', artilleryTitan: '#FF8800', nexus: '#FFFFFF',
};
const BOSS_NAMES: Record<string, string> = {
  standard: 'BOSS', swarmKing: 'SWARM KING', artilleryTitan: 'TITAN', nexus: 'THE NEXUS',
};

export class Enemy extends Entity {
  // Queue filled during takeDamage for splitter-style enemies.
  // SpawnSystem drains this into the live enemies array each frame so
  // Enemy doesn't need a direct reference to the game's enemy list.
  static pendingSpawns: Enemy[] = [];
  // Damage numbers — one per non-fatal or fatal hit, drained by game.ts each frame.
  static pendingDamageNumbers: { x: number; y: number; amount: number }[] = [];
  // Queue of (x, y, intensity) death-effect requests drained by SpawnSystem.
  static pendingDeathEffects: { x: number; y: number; intensity: number; color: string }[] = [];

  type: string;
  wave: number;
  typeConfig: Record<string, unknown>;
  color: string;
  hitboxSize: number;
  speed: number;
  damage: number;
  xpValue: number;
  moneyDropChance: number;
  moneyValue: number;
  behavior: EnemyBehavior;
  bounceOffWalls: boolean;
  lastHitWeaponId: string = '';

  // Animation time accumulator (used by render tells; update() ticks it).
  private _anim: number = 0;
  // Shooter windup: seconds until next shot (mirrors shootTimer for render tint).
  private _shootWindup: number = 0;
  // Hit flash: seconds remaining of post-damage white overlay (microsecond juice).
  private _hitFlash: number = 0;
  // Splitter: did we already spawn children?
  private _splitDone: boolean = false;
  // Elite shine flag (applied by SpawnSystem for boss-minions / enraged etc.)
  isElite?: boolean;

  // Variant flags
  isEnraged: boolean;
  isSpeed: boolean;
  isMegaSpeed: boolean; // 1-in-5 of cyan speedies: glows, 10x base speed
  rageTextTimer?: number;
  speedTextTimer?: number;

  // Tank-specific
  aggroRadius?: number;
  isAggro?: boolean;
  randomDirection?: { x: number; y: number };
  directionChangeTimer?: number;

  // Shooter-specific
  shootCooldown?: number;
  shootTimer?: number;
  projectileSpeed?: number;
  projectileDamage?: number;
  projectileSize?: number;
  projectileBounces?: number;

  // Wave-specific
  waveAmplitude?: number;
  waveFrequency?: number;
  initialX?: number;
  wavePhase?: number;
  trail?: boolean;
  effectsSystem?: EffectsSystem;
  lastTrailDistance?: number;
  trailSpacing?: number;

  // Charger
  chargeState?: 'idle' | 'windup' | 'dash' | 'recover';
  chargeTimer?: number;
  chargeDirX?: number;
  chargeDirY?: number;
  chargeBaseSpeed?: number;
  chargeSpeedMultiplier?: number;
  chargeWindup?: number;
  chargeDuration?: number;
  chargeCooldown?: number;

  // Sniper
  chargeTime?: number;  // laser telegraph windup
  preferredDistance?: number;

  // Exploder
  fuseRange?: number;
  fuseDuration?: number;
  fuseTimer?: number;
  isFusing?: boolean;
  explosionRadius?: number;
  explosionDamage?: number;
  hasExploded?: boolean;

  // Boss-specific
  waveSpawnCooldown?: number;
  waveSpawnTimer?: number;
  isBoss?: boolean;
  bossVariant?: 'standard' | 'swarmKing' | 'artilleryTitan' | 'nexus';
  bossPhase?: number;
  bossPhaseTimer?: number;

  // Player ref for some behaviors
  player?: Player | null;

  // Frozen state (from ice nova)
  _frozenTimer?: number;
  _frozenOriginalSpeed?: number;
  _originalSpeed?: number;

  // Bounce-back state after colliding with player. While timer > 0, enemy flies
  // along a fixed velocity, ignores behavior AI, and cannot deal contact damage.
  _hitBounceTimer?: number;
  _hitBounceVX?: number;
  _hitBounceVY?: number;

  // Cached gradient
  _waveGradient?: CanvasGradient;

  constructor(x: number, y: number, type: string = 'basic', wave: number = 1) {
    super(x, y);
    this.type = type;
    this.wave = wave;

    const typeConfig = (BALANCE.enemyTypes as Record<string, Record<string, unknown>>)[type] || BALANCE.enemyTypes.basic;
    this.typeConfig = typeConfig;

    this.color = typeConfig.color as string;
    this.size = typeConfig.size as number;
    this.hitboxSize = this.size * 1.1;

    const stats = getEnemyStats(wave, type);
    this.health = stats.health;
    this.maxHealth = stats.health;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.xpValue = stats.xpValue;
    this.moneyDropChance = stats.moneyDropChance;
    this.moneyValue = stats.moneyValue;

    this.isEnraged = false;
    this.isSpeed = false;
    this.isMegaSpeed = false;
    if (this.type === 'tracker') {
      if (Math.random() < 0.10) {
        this.isEnraged = true;
        this.color = '#FFAAAA';
        this.health = 0.1;
        this.maxHealth = 0.1;
        this.speed *= 3.0;
        this.rageTextTimer = 1.5;
      }
    } else if (this.type === 'basic') {
      if (Math.random() < 0.20) {
        this.isSpeed = true;
        this.color = '#00FFFF';
        this.speed *= 4.0;
        this.speedTextTimer = 1.5;
        // 1 in 5 cyan speedies is an extra-fast glowing ultra variant.
        if (Math.random() < 0.20) {
          this.isMegaSpeed = true;
          this.speed *= 2.5; // 4.0 × 2.5 = 10× base
        }
      }
    }

    this.behavior = typeConfig.behavior as EnemyBehavior;
    this.bounceOffWalls = false;

    if (type === 'tank') {
      this.aggroRadius = typeConfig.aggroRadius as number;
      this.isAggro = false;
      this.randomDirection = { x: 0, y: 0 };
      this.directionChangeTimer = 0;
    } else if (type === 'shooter') {
      this.shootCooldown = typeConfig.shootCooldown as number;
      this.shootTimer = 0;
      this.projectileSpeed = typeConfig.projectileSpeed as number;
      this.projectileDamage = typeConfig.projectileDamage as number;
      this.projectileSize = typeConfig.projectileSize as number;
      this.projectileBounces = typeConfig.projectileBounces as number;
    } else if (type === 'wave') {
      this.waveAmplitude = typeConfig.waveAmplitude as number;
      this.waveFrequency = typeConfig.waveFrequency as number;
      this.initialX = x;
      this.wavePhase = Math.random() * Math.PI * 2;
    } else if (type === 'splitter') {
      // Splitter chases like a tracker but dies into two sporelings.
      // Behavior field is already 'tracker' from config.
      this._splitDone = false;
    } else if (type === 'sporeling') {
      // Fast fragile tracker spawned by splitters.
      this._splitDone = true; // never splits
    } else if (type === 'charger') {
      this.chargeState = 'idle';
      this.chargeTimer = 0.5 + Math.random() * 0.5;
      this.chargeDirX = 0;
      this.chargeDirY = 0;
      this.chargeBaseSpeed = this.speed;
      this.chargeSpeedMultiplier = typeConfig.chargeSpeedMultiplier as number;
      this.chargeWindup = typeConfig.chargeWindup as number;
      this.chargeDuration = typeConfig.chargeDuration as number;
      this.chargeCooldown = typeConfig.chargeCooldown as number;
      this.aggroRadius = typeConfig.aggroRadius as number;
    } else if (type === 'sniper') {
      this.shootCooldown = typeConfig.shootCooldown as number;
      this.shootTimer = 1.0 + Math.random();
      this.chargeTime = typeConfig.chargeTime as number;
      this.projectileSpeed = typeConfig.projectileSpeed as number;
      this.projectileDamage = typeConfig.projectileDamage as number;
      this.projectileSize = typeConfig.projectileSize as number;
      this.projectileBounces = typeConfig.projectileBounces as number;
      this.preferredDistance = typeConfig.preferredDistance as number;
    } else if (type === 'exploder') {
      this.fuseRange = typeConfig.fuseRange as number;
      this.fuseDuration = typeConfig.fuseDuration as number;
      this.fuseTimer = 0;
      this.isFusing = false;
      this.explosionRadius = typeConfig.explosionRadius as number;
      const baseBoom = typeConfig.explosionDamage as number;
      const perWave = (typeConfig.explosionDamagePerWave as number) ?? 0;
      this.explosionDamage = baseBoom + (wave - 1) * perWave;
      this.hasExploded = false;
    } else if (type === 'boss') {
      this.shootCooldown = typeConfig.shootCooldown as number;
      this.shootTimer = 0;
      this.waveSpawnCooldown = typeConfig.waveSpawnCooldown as number;
      this.waveSpawnTimer = 0;
      this.projectileSpeed = typeConfig.projectileSpeed as number;
      this.projectileDamage = typeConfig.projectileDamage as number;
      this.projectileSize = typeConfig.projectileSize as number;
      this.projectileBounces = typeConfig.projectileBounces as number;
      this.isBoss = true;
    }
  }

  static spawnFromEdge(canvasWidth: number, canvasHeight: number, topOffset: number = 0, wave: number = 1, type: string = 'basic'): Enemy {
    const edge = Math.floor(Math.random() * 4);
    let x: number, y: number;
    const gameAreaHeight = canvasHeight - topOffset;

    switch (edge) {
      case 0: x = Math.random() * canvasWidth; y = topOffset - 30; break;
      case 1: x = canvasWidth + 20; y = topOffset + Math.random() * gameAreaHeight; break;
      case 2: x = Math.random() * canvasWidth; y = canvasHeight + 20; break;
      default: x = -20; y = topOffset + Math.random() * gameAreaHeight; break;
    }

    const enemy = new Enemy(x, y, type, wave);

    if (type === 'tracker' || type === 'splitter' || type === 'sporeling' || type === 'charger' || type === 'exploder') {
      enemy.velocity.x = 0;
      enemy.velocity.y = 0;
    } else if (type === 'sniper') {
      // Sniper enters from edge moving toward play area slowly
      const targetX = canvasWidth * 0.3 + Math.random() * canvasWidth * 0.4;
      const targetY = topOffset + gameAreaHeight * 0.3 + Math.random() * gameAreaHeight * 0.4;
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
    } else if (type === 'tank') {
      const angle = Math.random() * Math.PI * 2;
      enemy.velocity.x = Math.cos(angle) * enemy.speed;
      enemy.velocity.y = Math.sin(angle) * enemy.speed;
      enemy.randomDirection = { x: enemy.velocity.x, y: enemy.velocity.y };
      enemy.bounceOffWalls = true;
    } else if (type === 'shooter') {
      const targetX = Math.random() * canvasWidth;
      const targetY = topOffset + Math.random() * gameAreaHeight;
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    } else if (type === 'wave') {
      const centerRange = 0.6; const centerOffset = 0.2;
      if (edge === 0 || edge === 2) {
        x = canvasWidth * (centerOffset + Math.random() * centerRange);
      } else {
        y = topOffset + gameAreaHeight * (centerOffset + Math.random() * centerRange);
      }
      enemy.position.x = x; enemy.position.y = y;
      const centerX = canvasWidth / 2;
      const centerY = topOffset + gameAreaHeight / 2;
      let targetX: number, targetY: number;
      switch (edge) {
        case 0: targetX = centerX + (Math.random() - 0.5) * canvasWidth * 0.4; targetY = centerY + gameAreaHeight * 0.3; break;
        case 1: targetX = centerX - canvasWidth * 0.2; targetY = centerY + (Math.random() - 0.5) * gameAreaHeight * 0.4; break;
        case 2: targetX = centerX + (Math.random() - 0.5) * canvasWidth * 0.4; targetY = centerY - gameAreaHeight * 0.3; break;
        default: targetX = centerX + canvasWidth * 0.2; targetY = centerY + (Math.random() - 0.5) * gameAreaHeight * 0.4; break;
      }
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.initialX = x;
      enemy.bounceOffWalls = false;
    } else if (type === 'boss') {
      const targetX = canvasWidth / 2;
      const targetY = topOffset + gameAreaHeight / 2;
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    } else if (type === 'zoomer') {
      const centerRange2 = 0.4; const centerOffset2 = 0.3;
      if (edge === 0 || edge === 2) {
        x = canvasWidth * (centerOffset2 + Math.random() * centerRange2);
      } else {
        y = topOffset + gameAreaHeight * (centerOffset2 + Math.random() * centerRange2);
      }
      enemy.position.x = x; enemy.position.y = y;
      let targetX: number, targetY: number;
      switch (edge) {
        case 0: targetX = x + (Math.random() - 0.5) * canvasWidth * 0.3; targetY = canvasHeight + 50; break;
        case 1: targetX = -50; targetY = y + (Math.random() - 0.5) * gameAreaHeight * 0.3; break;
        case 2: targetX = x + (Math.random() - 0.5) * canvasWidth * 0.3; targetY = topOffset - 50; break;
        default: targetX = canvasWidth + 50; targetY = y + (Math.random() - 0.5) * gameAreaHeight * 0.3; break;
      }
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = false;
    } else {
      const targetX = Math.random() * canvasWidth;
      const targetY = topOffset + Math.random() * gameAreaHeight;
      const dx = targetX - x; const dy = targetY - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      enemy.velocity.x = (dx / distance) * enemy.speed;
      enemy.velocity.y = (dy / distance) * enemy.speed;
      enemy.bounceOffWalls = true;
    }

    return enemy;
  }

  static spawnInside(canvasWidth: number, canvasHeight: number, topOffset: number = 0, wave: number = 1, type: string = 'tracker'): Enemy {
    const padding = 30;
    const x = padding + Math.random() * (canvasWidth - padding * 2);
    const y = topOffset + padding + Math.random() * (canvasHeight - topOffset - padding * 2);
    return new Enemy(x, y, type, wave);
  }

  checkCollision(other: Entity): boolean {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    const threshold = (this.hitboxSize + other.size) / 2;
    return dx * dx + dy * dy < threshold * threshold;
  }

  update(deltaTime: number, canvasWidth?: number, canvasHeight?: number, player?: Player | null, projectiles?: Projectile[] | null, enemies?: Enemy[] | null): void {
    this._anim += deltaTime;
    if (this._hitFlash > 0) this._hitFlash -= deltaTime;

    // Self-managed freeze tick (IceNova). Previously lived in WizardCharacter.onUpdate
    // which iterated every enemy every frame and could race ally slow-debuffs.
    if (this._frozenTimer && this._frozenTimer > 0) {
      this._frozenTimer -= deltaTime;
      if (this._frozenTimer <= 0) {
        this._frozenTimer = 0;
        if (this._frozenOriginalSpeed !== undefined && this._frozenOriginalSpeed !== 0) {
          this.speed = this._frozenOriginalSpeed;
        }
        this._frozenOriginalSpeed = undefined;
      }
    }
    if (this.rageTextTimer !== undefined && this.rageTextTimer > 0) this.rageTextTimer -= deltaTime;
    if (this.speedTextTimer !== undefined && this.speedTextTimer > 0) this.speedTextTimer -= deltaTime;
    if (this.shootTimer !== undefined) this._shootWindup = Math.max(0, this.shootTimer);

    // Post-contact bounce-back: skip AI, fly along the stored reverse velocity.
    // Also keep within canvas bounds so a bouncing enemy doesn't leave the arena.
    if (this._hitBounceTimer !== undefined && this._hitBounceTimer > 0) {
      this._hitBounceTimer -= deltaTime;
      this.velocity.x = this._hitBounceVX ?? 0;
      this.velocity.y = this._hitBounceVY ?? 0;
      super.update(deltaTime);
      if (canvasWidth && canvasHeight) {
        const half = this.size / 2;
        if (this.position.x < half) { this.position.x = half; if (this._hitBounceVX) this._hitBounceVX = -this._hitBounceVX; }
        if (this.position.x > canvasWidth - half) { this.position.x = canvasWidth - half; if (this._hitBounceVX) this._hitBounceVX = -this._hitBounceVX; }
        if (this.position.y < half) { this.position.y = half; if (this._hitBounceVY) this._hitBounceVY = -this._hitBounceVY; }
        if (this.position.y > canvasHeight - half) { this.position.y = canvasHeight - half; if (this._hitBounceVY) this._hitBounceVY = -this._hitBounceVY; }
      }
      return;
    }

    switch (this.behavior) {
      case 'tracker': this.updateTracker(deltaTime, player ?? null); break;
      case 'tank': this.updateTank(deltaTime, canvasWidth!, canvasHeight!, player ?? null); break;
      case 'shooter': this.updateShooter(deltaTime, canvasWidth!, canvasHeight!, player ?? null, projectiles ?? null); break;
      case 'wave': this.updateWave(deltaTime, canvasWidth!, canvasHeight!); break;
      case 'boss': this.updateBoss(deltaTime, canvasWidth!, canvasHeight!, player ?? null, projectiles ?? null, enemies ?? null); break;
      case 'zoomer': this.updateZoomer(deltaTime, canvasWidth!, canvasHeight!); break;
      case 'charger': this.updateCharger(deltaTime, player ?? null); break;
      case 'sniper': this.updateSniper(deltaTime, player ?? null, projectiles ?? null); break;
      case 'exploder': this.updateExploder(deltaTime, player ?? null); break;
      default: this.updateBouncer(deltaTime, canvasWidth!, canvasHeight!); break;
    }

    super.update(deltaTime);
  }

  private updateTracker(deltaTime: number, player: Player | null): void {
    if (!player || !player.alive) return;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 0) {
      const invDist = 1 / Math.sqrt(distSq);
      const targetVx = dx * invDist * this.speed;
      const targetVy = dy * invDist * this.speed;
      // Smooth velocity change - reduces jitter, especially near player.
      // Time-correct lerp: factor = 1 - exp(-rate * dt); rate ~ 12 feels snappy.
      const t = 1 - Math.exp(-12 * deltaTime);
      this.velocity.x += (targetVx - this.velocity.x) * t;
      this.velocity.y += (targetVy - this.velocity.y) * t;
    }
  }

  private updateTank(deltaTime: number, canvasWidth: number, canvasHeight: number, player: Player | null): void {
    if (!player || !player.alive) {
      this.isAggro = false;
    } else {
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const distSq = dx * dx + dy * dy;
      const aggroSq = this.aggroRadius! * this.aggroRadius!;
      if (distSq <= aggroSq) {
        if (!this.isAggro) this.rageTextTimer = 1.0;
        this.isAggro = true;
        const distance = Math.sqrt(distSq) || 1;
        this.velocity.x = (dx / distance) * this.speed * 1.5;
        this.velocity.y = (dy / distance) * this.speed * 1.5;
      } else {
        this.isAggro = false;
      }
    }

    if (!this.isAggro) {
      this.directionChangeTimer! -= deltaTime;
      if (this.directionChangeTimer! <= 0) {
        this.directionChangeTimer = 1 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        this.randomDirection!.x = Math.cos(angle) * this.speed;
        this.randomDirection!.y = Math.sin(angle) * this.speed;
      }
      this.velocity.x = this.randomDirection!.x;
      this.velocity.y = this.randomDirection!.y;
    }

    this.handleWallBounce(canvasWidth, canvasHeight);
  }

  private updateShooter(deltaTime: number, canvasWidth: number, canvasHeight: number, player: Player | null, projectiles: Projectile[] | null): void {
    this.handleWallBounce(canvasWidth, canvasHeight);

    if (player && player.alive && projectiles) {
      this.shootTimer! -= deltaTime;
      if (this.shootTimer! <= 0) {
        this.shootTimer = this.shootCooldown!;
        const dx = player.position.x - this.position.x;
        const dy = player.position.y - this.position.y;
        const angle = Math.atan2(dy, dx);

        const projectile = new Projectile(this.position.x, this.position.y, angle, 'enemy');
        projectile.damage = this.projectileDamage!;
        projectile.size = this.projectileSize!;
        projectile.speed = this.projectileSpeed!;
        projectile.maxBounces = this.projectileBounces!;
        projectile.color = this.color;
        projectile.velocity.x = Math.cos(angle) * this.projectileSpeed!;
        projectile.velocity.y = Math.sin(angle) * this.projectileSpeed!;
        projectiles.push(projectile);
      }
    }
  }

  private updateBouncer(_deltaTime: number, canvasWidth: number, canvasHeight: number): void {
    this.handleWallBounce(canvasWidth, canvasHeight);
  }

  private updateWave(deltaTime: number, canvasWidth: number, canvasHeight: number): void {
    const prevX = this.position.x;
    const prevY = this.position.y;
    const distanceTraveled = Math.abs(this.position.x - this.initialX!);
    const waveOffset = Math.sin((distanceTraveled / canvasWidth) * this.waveFrequency! * Math.PI * 2 + this.wavePhase!) * this.waveAmplitude!;
    this.position.y += waveOffset * deltaTime;

    if (this.trail && this.effectsSystem) {
      const dx = this.position.x - prevX;
      const dy = this.position.y - prevY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (!this.lastTrailDistance) this.lastTrailDistance = 0;
      this.lastTrailDistance += distance;
      if (this.lastTrailDistance > (this.trailSpacing || 1.2)) {
        this.effectsSystem.addWaveTrail(prevX, prevY, this.color);
        this.lastTrailDistance = 0;
      }
    }

    if (this.position.x < -50 || this.position.x > canvasWidth + 50 ||
      this.position.y < -50 || this.position.y > canvasHeight + 50) {
      this.alive = false;
    }
  }

  private updateZoomer(_deltaTime: number, canvasWidth: number, canvasHeight: number): void {
    if (this.position.x < -50 || this.position.x > canvasWidth + 50 ||
      this.position.y < -50 || this.position.y > canvasHeight + 50) {
      this.alive = false;
    }
  }

  private updateBoss(deltaTime: number, _canvasWidth: number, _canvasHeight: number, player: Player | null, projectiles: Projectile[] | null, enemies: Enemy[] | null): void {
    if (!player || !player.alive) return;

    const variant = this.bossVariant || 'standard';

    // All bosses chase the player
    const chaseSpeed = variant === 'artilleryTitan' ? player.speed * 0.4 : player.speed * 0.7;
    this.speed = chaseSpeed;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0) {
      this.velocity.x = (dx / distance) * this.speed;
      this.velocity.y = (dy / distance) * this.speed;
    }

    // Nexus phase tracking
    if (variant === 'nexus') {
      const hpPct = this.health / this.maxHealth;
      if (hpPct < 0.33) this.bossPhase = 3;
      else if (hpPct < 0.66) this.bossPhase = 2;
      else this.bossPhase = 1;
    }

    // Spawn minions
    if (enemies) {
      this.shootTimer! -= deltaTime;
      const spawnRate = variant === 'swarmKing' ? 2.5 : (variant === 'nexus' && this.bossPhase === 3 ? 3.0 : 5.0);
      if (this.shootTimer! <= 0) {
        this.shootTimer = spawnRate;
        const minionCount = variant === 'swarmKing' ? 3 : 1;
        for (let m = 0; m < minionCount; m++) {
          const tracker = new Enemy(this.position.x + (Math.random() - 0.5) * 40, this.position.y + (Math.random() - 0.5) * 40, 'tracker', this.wave || 1);
          tracker.color = variant === 'swarmKing' ? '#FF4444' : '#8A2BE2';
          tracker.health *= variant === 'swarmKing' ? 0.5 : 2.0;
          tracker.maxHealth = tracker.health;
          tracker.speed *= 2.0;
          tracker.player = player;
          tracker.isElite = true;
          enemies.push(tracker);
        }
      }
    }

    // Artillery Titan fires spread projectiles
    if ((variant === 'artilleryTitan' || (variant === 'nexus' && (this.bossPhase || 1) >= 2)) && projectiles) {
      this.waveSpawnTimer! -= deltaTime;
      const fireRate = variant === 'nexus' ? 2.0 : 3.0;
      if (this.waveSpawnTimer! <= 0) {
        this.waveSpawnTimer = fireRate;
        const count = variant === 'nexus' ? 8 : 5;
        const baseAngle = Math.atan2(dy, dx);
        const spread = Math.PI * 0.6;
        for (let i = 0; i < count; i++) {
          const angle = baseAngle - spread / 2 + (spread / (count - 1)) * i;
          const proj = new Projectile(this.position.x, this.position.y, angle, 'enemy');
          proj.damage = this.damage * 0.5;
          proj.size = 8;
          proj.speed = 200;
          proj.color = variant === 'nexus' ? '#FF00FF' : '#FF6600';
          proj.velocity.x = Math.cos(angle) * 200;
          proj.velocity.y = Math.sin(angle) * 200;
          projectiles.push(proj);
        }
      }
    } else if (variant === 'standard' || variant === 'swarmKing') {
      // Standard/swarm wave spawning
      if (enemies) {
        this.waveSpawnTimer! -= deltaTime;
        if (this.waveSpawnTimer! <= 0) {
          this.waveSpawnTimer = this.waveSpawnCooldown!;
          for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
            const spawnDist = this.size + 20;
            const waveEnemy = new Enemy(
              this.position.x + Math.cos(angle) * spawnDist,
              this.position.y + Math.sin(angle) * spawnDist,
              'wave', this.wave
            );
            waveEnemy.velocity.x = Math.cos(angle) * waveEnemy.speed;
            waveEnemy.velocity.y = Math.sin(angle) * waveEnemy.speed * 0.3;
            waveEnemy.initialX = waveEnemy.position.x;
            enemies.push(waveEnemy);
          }
        }
      }
    }
  }

  private updateCharger(deltaTime: number, player: Player | null): void {
    if (!player || !player.alive) {
      this.velocity.x = 0; this.velocity.y = 0;
      return;
    }
    this.chargeTimer = (this.chargeTimer ?? 0) - deltaTime;

    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;

    switch (this.chargeState) {
      case 'idle': {
        // Slow approach; watch for aggro range to trigger dash
        const distSq = dx * dx + dy * dy;
        const aggroSq = (this.aggroRadius ?? 280) * (this.aggroRadius ?? 280);
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          this.velocity.x = (dx / dist) * (this.chargeBaseSpeed ?? this.speed) * 0.6;
          this.velocity.y = (dy / dist) * (this.chargeBaseSpeed ?? this.speed) * 0.6;
        }
        if ((this.chargeTimer ?? 0) <= 0 && distSq <= aggroSq) {
          this.chargeState = 'windup';
          this.chargeTimer = this.chargeWindup ?? 0.9;
          this.velocity.x = 0;
          this.velocity.y = 0;
        }
        break;
      }
      case 'windup': {
        // Lock dash direction at start of windup; keep updating for telegraph
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.chargeDirX = dx / dist;
          this.chargeDirY = dy / dist;
        }
        this.velocity.x = 0; this.velocity.y = 0;
        if ((this.chargeTimer ?? 0) <= 0) {
          this.chargeState = 'dash';
          this.chargeTimer = this.chargeDuration ?? 0.6;
        }
        break;
      }
      case 'dash': {
        const boost = (this.chargeBaseSpeed ?? this.speed) * (this.chargeSpeedMultiplier ?? 5);
        this.velocity.x = (this.chargeDirX ?? 0) * boost;
        this.velocity.y = (this.chargeDirY ?? 0) * boost;
        if ((this.chargeTimer ?? 0) <= 0) {
          this.chargeState = 'recover';
          this.chargeTimer = this.chargeCooldown ?? 2.0;
        }
        break;
      }
      case 'recover':
      default: {
        // Brief slowdown, then back to idle chasing
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.velocity.x = (dx / dist) * (this.chargeBaseSpeed ?? this.speed) * 0.3;
          this.velocity.y = (dy / dist) * (this.chargeBaseSpeed ?? this.speed) * 0.3;
        }
        if ((this.chargeTimer ?? 0) <= 0) {
          this.chargeState = 'idle';
          this.chargeTimer = 0.5 + Math.random() * 0.5;
        }
        break;
      }
    }
  }

  private updateSniper(deltaTime: number, player: Player | null, projectiles: Projectile[] | null): void {
    if (!player || !player.alive) { this.velocity.x = 0; this.velocity.y = 0; return; }
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;
    const pref = this.preferredDistance ?? 280;
    const prefSq = pref * pref;
    const dist = Math.sqrt(distSq);

    // Kiting: move away if too close, approach if too far, else strafe slowly.
    if (dist > 0.0001) {
      const invDist = 1 / dist;
      const nx = dx * invDist;
      const ny = dy * invDist;
      if (distSq < prefSq * 0.7) {
        this.velocity.x = -nx * this.speed;
        this.velocity.y = -ny * this.speed;
      } else if (distSq > prefSq * 1.3) {
        this.velocity.x = nx * this.speed * 0.8;
        this.velocity.y = ny * this.speed * 0.8;
      } else {
        // strafe perpendicular
        this.velocity.x = -ny * this.speed * 0.5;
        this.velocity.y = nx * this.speed * 0.5;
      }
    }

    this.shootTimer = (this.shootTimer ?? 0) - deltaTime;
    if ((this.shootTimer ?? 0) <= 0 && projectiles) {
      this.shootTimer = this.shootCooldown ?? 3.0;
      const angle = Math.atan2(dy, dx);
      const proj = new Projectile(this.position.x, this.position.y, angle, 'enemy');
      proj.damage = this.projectileDamage!;
      proj.size = this.projectileSize!;
      proj.speed = this.projectileSpeed!;
      proj.maxBounces = this.projectileBounces!;
      proj.color = this.color;
      // Give the sniper shot a visible trail so it's readable against the arena.
      proj.trail = true;
      proj.velocity.x = Math.cos(angle) * this.projectileSpeed!;
      proj.velocity.y = Math.sin(angle) * this.projectileSpeed!;
      projectiles.push(proj);
    }
  }

  private updateExploder(deltaTime: number, player: Player | null): void {
    if (!player || !player.alive || this.hasExploded) { this.velocity.x = 0; this.velocity.y = 0; return; }
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;
    const fuseR = this.fuseRange ?? 55;
    const fuseRSq = fuseR * fuseR;

    if (!this.isFusing) {
      // Chase player
      const dist = Math.sqrt(distSq);
      if (dist > 0) {
        this.velocity.x = (dx / dist) * this.speed;
        this.velocity.y = (dy / dist) * this.speed;
      }
      if (distSq <= fuseRSq) {
        this.isFusing = true;
        this.fuseTimer = this.fuseDuration ?? 0.7;
      }
    } else {
      // Slow during fuse
      this.velocity.x *= 0.85;
      this.velocity.y *= 0.85;
      this.fuseTimer = (this.fuseTimer ?? 0) - deltaTime;
      if ((this.fuseTimer ?? 0) <= 0) {
        this.explode(player);
      }
    }
  }

  private explode(player: Player): void {
    if (this.hasExploded) return;
    this.hasExploded = true;
    const radius = this.explosionRadius ?? 70;
    const radiusSq = radius * radius;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq && player.alive) {
      player.takeDamage(this.explosionDamage ?? 2);
    }
    // Shake is delivered via pendingDeathEffects (SpawnSystem drains it with
    // priority-tiered calls). Don't double-apply here.
    Enemy.pendingDeathEffects.push({
      x: this.position.x,
      y: this.position.y,
      intensity: 4,
      color: '#FF4500',
    });
    this.alive = false;
    this.health = 0;
  }

  private handleWallBounce(canvasWidth: number, canvasHeight: number): void {
    if (!this.bounceOffWalls) return;
    const halfSize = this.size / 2;
    const topBound = BALANCE.ui.uiBarHeight;

    const inBounds =
      this.position.x > -halfSize && this.position.x < canvasWidth + halfSize &&
      this.position.y > topBound - halfSize && this.position.y < canvasHeight + halfSize;

    if (inBounds) {
      if (this.position.x - halfSize <= 0 || this.position.x + halfSize >= canvasWidth) {
        this.velocity.x = -this.velocity.x;
        this.position.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, this.position.x));
        if (this.behavior === 'tank' && !this.isAggro) this.randomDirection!.x = this.velocity.x;
      }
      if (this.position.y - halfSize <= topBound || this.position.y + halfSize >= canvasHeight) {
        this.velocity.y = -this.velocity.y;
        this.position.y = Math.max(topBound + halfSize, Math.min(canvasHeight - halfSize, this.position.y));
        if (this.behavior === 'tank' && !this.isAggro) this.randomDirection!.y = this.velocity.y;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);

    // Low HP "finish me" pulse - soft red aura when <30% HP. Skip for bosses
    // (they have a dedicated health bar), frozen, and already-glowing variants.
    if (this.maxHealth > 0 && !this.isBoss && !(this._frozenTimer && this._frozenTimer > 0)) {
      const hpPct = this.health / this.maxHealth;
      if (hpPct > 0 && hpPct < 0.3) {
        const urgency = 1 - hpPct / 0.3; // 0..1 as HP drops
        const pulse = 0.5 + 0.5 * Math.sin(this._anim * 10);
        const _pa = ctx.globalAlpha;
        ctx.globalAlpha = _pa * (0.3 + 0.4 * pulse * urgency);
        ctx.strokeStyle = '#FF3C3C';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 0.75 + 3 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = _pa;
      }
    }

    // Elite outer shine pulse (precomputed, single ring — cheap).
    if (this.isElite) {
      const pulse = 0.5 + 0.5 * Math.sin(this._anim * 4);
      const _pa = ctx.globalAlpha;
      ctx.globalAlpha = _pa * (0.35 + 0.35 * pulse);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.85 + 2 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = _pa;
      // Elite inner dark ring so boss minions are distinct from plain trackers.
      ctx.strokeStyle = 'rgba(40, 0, 60, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.type === 'splitter') {
      // Dark-green hex with inner crack lines; bobs slightly.
      const bob = Math.sin(this._anim * 3) * 1.2;
      ctx.translate(0, bob);
      ctx.fillStyle = this.color;
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = Math.cos(a) * (this.size * 0.55);
        const py = Math.sin(a) * (this.size * 0.55);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cracks show more as it takes damage.
      const dmgPct = 1 - (this.health / Math.max(0.0001, this.maxHealth));
      if (dmgPct > 0.15) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * Math.min(1, dmgPct);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-this.size * 0.35, -this.size * 0.1);
        ctx.lineTo(this.size * 0.2, this.size * 0.25);
        ctx.moveTo(-this.size * 0.1, this.size * 0.3);
        ctx.lineTo(this.size * 0.3, -this.size * 0.2);
        ctx.stroke();
        ctx.globalAlpha = prevAlpha;
      }
    } else if (this.type === 'sporeling') {
      // Tiny rotating diamond.
      ctx.rotate(this._anim * 4);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size * 0.6);
      ctx.lineTo(this.size * 0.6, 0);
      ctx.lineTo(0, this.size * 0.6);
      ctx.lineTo(-this.size * 0.6, 0);
      ctx.closePath();
      ctx.fill();
    } else if (this.behavior === 'wave') {
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath();
      if (!this._waveGradient) {
        this._waveGradient = ctx.createLinearGradient(-this.size / 2, 0, this.size / 2, 0);
        this._waveGradient.addColorStop(0, '#FFA500');
        this._waveGradient.addColorStop(0.5, '#FFA500');
        this._waveGradient.addColorStop(0.5, '#FFFF00');
        this._waveGradient.addColorStop(1, '#FFFF00');
      }
      ctx.fillStyle = this._waveGradient;
      ctx.fill();
    } else if (this.behavior === 'boss') {
      const variant = this.bossVariant || 'standard';
      const strokeColors = BOSS_STROKE_COLORS;
      const coreColors = BOSS_CORE_COLORS;
      ctx.fillStyle = this.color;
      ctx.strokeStyle = strokeColors[variant] || '#FF00FF';
      ctx.lineWidth = 3;
      const sides = variant === 'nexus' ? 8 : 6;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = Math.cos(angle) * this.size;
        const py = Math.sin(angle) * this.size;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = coreColors[variant] || '#FF00FF'; ctx.fill();
      // Boss name label
      const bossNames = BOSS_NAMES;
      ctx.fillStyle = strokeColors[variant] || '#FF00FF';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bossNames[variant] || 'BOSS', 0, -this.size - 8);
      // Boss health bar
      const barW = this.size * 2;
      const barH = 4;
      const barY = -this.size - 4;
      ctx.fillStyle = '#333';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.fillStyle = this.health / this.maxHealth > 0.3 ? strokeColors[variant] || '#FF00FF' : '#FF0000';
      ctx.fillRect(-barW / 2, barY, barW * (this.health / this.maxHealth), barH);
    } else if (this.behavior === 'tank') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const sides = 5;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        const px = Math.cos(angle) * this.size;
        const py = Math.sin(angle) * this.size;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    } else if (this.behavior === 'charger') {
      const state = this.chargeState ?? 'idle';
      // Rotate to face charge direction during windup/dash
      let facing = 0;
      if (state === 'windup' || state === 'dash') {
        facing = Math.atan2(this.chargeDirY ?? 0, this.chargeDirX ?? 0);
      } else {
        facing = Math.atan2(this.velocity.y, this.velocity.x);
      }
      ctx.rotate(facing);
      ctx.fillStyle = this.color;
      // Arrow shape
      const s = this.size;
      ctx.beginPath();
      ctx.moveTo(s * 0.7, 0);
      ctx.lineTo(-s * 0.5, -s * 0.55);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.5, s * 0.55);
      ctx.closePath();
      ctx.fill();
      // Telegraph during windup
      if (state === 'windup') {
        const t = 1 - Math.max(0, Math.min(1, (this.chargeTimer ?? 0) / (this.chargeWindup ?? 1)));
        const prevA = ctx.globalAlpha;
        ctx.globalAlpha = prevA * (0.5 + 0.5 * t);
        ctx.strokeStyle = '#FF3296';
        ctx.lineWidth = 2 + 2 * t;
        ctx.beginPath();
        ctx.moveTo(s * 0.7, 0);
        ctx.lineTo(s * 0.7 + 60 * t, 0);
        ctx.stroke();
        ctx.globalAlpha = prevA;
      }
    } else if (this.behavior === 'sniper') {
      // Face player
      let facing = 0;
      if (this.player && this.player.alive) {
        facing = Math.atan2(this.player.position.y - this.position.y, this.player.position.x - this.position.x);
      }
      ctx.rotate(facing);
      ctx.fillStyle = this.color;
      // Diamond body
      const s = this.size;
      ctx.beginPath();
      ctx.moveTo(s * 0.6, 0);
      ctx.lineTo(0, -s * 0.55);
      ctx.lineTo(-s * 0.55, 0);
      ctx.lineTo(0, s * 0.55);
      ctx.closePath();
      ctx.fill();
      // Long barrel
      ctx.fillStyle = '#222';
      ctx.fillRect(0, -2, s * 0.9, 4);
      // Aim laser when about to fire
      const chargeT = this.chargeTime ?? 1.0;
      if ((this.shootTimer ?? 99) < chargeT) {
        const t = 1 - (this.shootTimer ?? 0) / chargeT;
        const prevA = ctx.globalAlpha;
        ctx.globalAlpha = prevA * (0.2 + 0.6 * t);
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1 + 1.5 * t;
        ctx.beginPath();
        ctx.moveTo(s * 0.9, 0);
        ctx.lineTo(s * 0.9 + 1000, 0);
        ctx.stroke();
        ctx.globalAlpha = prevA;
      }
    } else if (this.behavior === 'exploder') {
      // Pulsing red square, faster pulse when fusing
      const pulse = this.isFusing
        ? 0.5 + 0.5 * Math.sin(this._anim * 30)
        : 0.3 + 0.3 * Math.sin(this._anim * 6);
      ctx.fillStyle = this.color;
      const s = this.size;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      // Fuse ring
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * (0.4 + 0.6 * pulse);
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = this.isFusing ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = prevA;
      // Core dot
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.behavior === 'zoomer') {
      ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x) + Math.PI / 2);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size * 1.5);
      ctx.lineTo(-this.size * 0.3, this.size);
      ctx.lineTo(this.size * 0.3, this.size);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-this.size * 0.5 - i * 3, this.size); ctx.lineTo(-this.size * 0.5 - i * 3, this.size + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.size * 0.5 + i * 3, this.size); ctx.lineTo(this.size * 0.5 + i * 3, this.size + 10); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (this.behavior === 'shooter') {
      // Shooter: triangle with a "charge" glow when windup is near. Telegraphs intent.
      const cd = this.shootCooldown || 1;
      const windupFrac = Math.max(0, Math.min(1, 1 - this._shootWindup / cd));
      if (windupFrac > 0.6) {
        ctx.shadowColor = '#FFFFAA';
        ctx.shadowBlur = 6 + (windupFrac - 0.6) * 30;
      }
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // Pulsing windup ring - very clear telegraph when shot is imminent.
      if (windupFrac > 0.5) {
        const pulse = 0.5 + 0.5 * Math.sin(this._anim * 18);
        const alpha = (windupFrac - 0.5) * 2 * (0.4 + 0.6 * pulse);
        const radius = this.size * 0.7 + (1 - windupFrac) * 6;
        const prevA = ctx.globalAlpha;
        ctx.globalAlpha = prevA * alpha;
        ctx.strokeStyle = '#FFFF96';
        ctx.lineWidth = 1.5 + windupFrac * 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = prevA;
      }
      // Black "barrel" dot near apex indicates firing direction side.
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, -this.size * 0.15, this.size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.behavior === 'tracker') {
      // Tracker: small triangle with a pulsing "eye" aimed at the player.
      ctx.fillStyle = this.color;
      if (this.isEnraged) { ctx.shadowColor = '#FFAAAA'; ctx.shadowBlur = 15; }
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath(); ctx.fill();
      if (this.isEnraged) ctx.shadowBlur = 0;
      const pulse = 0.7 + 0.3 * Math.sin(this._anim * 8);
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * pulse;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = prevA;
    } else {
      ctx.fillStyle = this.color;
      if (this.isEnraged) { ctx.shadowColor = '#FFAAAA'; ctx.shadowBlur = 15; }
      else if (this.isMegaSpeed) {
        // Intense pulsing rainbow-ish glow for the 1-in-5 ultra variant.
        const pulse = 0.6 + 0.4 * Math.sin(this._anim * 12);
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 25 + pulse * 12;
        ctx.fillStyle = pulse > 0.7 ? '#FFFFFF' : '#88FFFF';
      }
      else if (this.isSpeed) { ctx.shadowColor = '#00FFFF'; ctx.shadowBlur = 15; }
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.closePath(); ctx.fill();
      if (this.isEnraged || this.isSpeed || this.isMegaSpeed) ctx.shadowBlur = 0;
    }

    if (this._frozenTimer && this._frozenTimer > 0) {
      ctx.strokeStyle = 'rgba(136, 221, 255, 0.8)';
      ctx.lineWidth = 2;
      const halfSize = this.size / 2 + 3;
      ctx.strokeRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
      ctx.fillStyle = 'rgba(136, 221, 255, 0.15)';
      ctx.fillRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
    }

    // Hit flash: bright white overlay immediately after taking damage.
    // Sits on top of the body but under RAGE/SPEED text. ~0.08s feels punchy.
    if (this._hitFlash > 0) {
      const alpha = Math.min(1, this._hitFlash / 0.08) * 0.7;
      // Use globalAlpha instead of building a fresh rgba() string every frame
      // per enemy — avoids per-frame template-literal allocation in a hot path.
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = prevAlpha * alpha;
      ctx.fillStyle = '#FFFFFF';
      const s = this.size;
      // Use a circle that covers typical enemy shapes - cheap, shape-agnostic.
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = prevAlpha;
    }

    if (this.rageTextTimer !== undefined && this.rageTextTimer > 0) {
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * Math.min(1, this.rageTextTimer / 0.5);
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('RAGE', 0, -this.size - 10);
      ctx.globalAlpha = prevA;
    } else if (this.speedTextTimer !== undefined && this.speedTextTimer > 0) {
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = prevA * Math.min(1, this.speedTextTimer / 0.5);
      ctx.fillStyle = '#00FFFF';
      ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('SPEED', 0, -this.size - 10);
      ctx.globalAlpha = prevA;
    }

    ctx.restore();
  }

  takeDamage(amount: number): void {
    const wasAlive = this.alive && this.health > 0;
    // Trigger hit flash on any non-fatal damage tick so players see feedback
    // even from DoTs / small hits. Keep brief to avoid smearing.
    if (wasAlive && amount > 0) {
      this._hitFlash = 0.08;
      // Queue a floating damage number for every damage tick regardless of
      // source (projectile, spell, structure, ally, melee). game.ts drains
      // this queue each frame and hands off to EffectsSystem.
      Enemy.pendingDamageNumbers.push({
        x: this.position.x,
        y: this.position.y - 10,
        amount,
      });
    }
    super.takeDamage(amount);
    if (wasAlive && !this.alive) {
      // Splitter: split into two sporelings on death.
      if (this.type === 'splitter' && !this._splitDone) {
        this._splitDone = true;
        for (let i = 0; i < 2; i++) {
          const angle = (Math.PI * 2 * i) / 2 + Math.random() * 0.5;
          const offset = 14;
          const child = new Enemy(
            this.position.x + Math.cos(angle) * offset,
            this.position.y + Math.sin(angle) * offset,
            'sporeling',
            this.wave,
          );
          child.velocity.x = Math.cos(angle) * child.speed;
          child.velocity.y = Math.sin(angle) * child.speed;
          child.player = this.player;
          Enemy.pendingSpawns.push(child);
        }
      }
      // Crunchy death feedback for big enemies. Smaller ones already get addKillEffect from game.ts.
      let intensity = 0;
      if (this.type === 'tank') intensity = 5;
      else if (this.type === 'splitter') intensity = 3;
      else if (this.type === 'shooter') intensity = 2;
      if (intensity > 0) {
        Enemy.pendingDeathEffects.push({
          x: this.position.x,
          y: this.position.y,
          intensity,
          color: this.color,
        });
      }
    }
  }
}
