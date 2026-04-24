import { Enemy } from './Enemy';
import { Projectile } from './Projectile';
import { Pickup } from './Pickup';
import { BALANCE } from '../config/balance';
import { GAME_CONFIG } from '../constants';
import type { Player } from './Player';

export type BossTypeId = 'wave10' | 'wave20' | 'wave30';

type BossPhaseDef = { name: string; hpThreshold: number; outline: string; banner?: string };

interface BossConfig {
  id: BossTypeId;
  name: string;
  hp: number;
  contactDamage: number;
  speed: number;
  size: number;
  color: string;
  strokeColor: string;
  coreColor: string;
  banner: string;
  cashPileValue: number;
  phases?: BossPhaseDef[];
  // wave10
  minionCooldown?: number;
  radialFireCooldown?: number;
  radialShots?: number;
  dashCooldown?: number;
  dashDuration?: number;
  dashSpeedMultiplier?: number;
  // wave20
  droneCount?: number;
  droneRadius?: number;
  droneSize?: number;
  droneHp?: number;
  droneRespawn?: number;
  shieldReduction?: number;
  enrageDuration?: number;
  enrageFireRateMul?: number;
  seekerCooldown?: number;
  seekerSpeed?: number;
  seekerDamage?: number;
  droneDeathAoeDamage?: number;
  droneDeathAoeShots?: number;
  poolCooldown?: number;
  poolLifetime?: number;
  poolRadius?: number;
  poolDamage?: number;
  // wave30
  echoCount?: number;
  echoDamageMul?: number;
  sweepBeamCooldown?: number;
  sweepBeamDuration?: number;
  sweepBeamDamage?: number;
  constrictCycle?: number;
  constrictDuration?: number;
  constrictWallDamage?: number;
  teleportCooldown?: number;
  shockwaveDamage?: number;
  shockwaveRadius?: number;
}

// Drone attached to wave20 boss
export interface BossDrone {
  angle: number;
  orbitSpeed: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  x: number;
  y: number;
  size: number;
}

// Echo shadow for wave30
export interface BossEcho {
  x: number;
  y: number;
  angle: number;
  radius: number;
  orbitSpeed: number;
  fireTimer: number;
}

// Constricting wall representation (four walls that shrink inward)
export interface ConstrictBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  damageTimer: number; // per-player damage cooldown
}

// Resonance pool — wave20 new mechanic: damaging floor zone
export interface ResonancePool {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  damageTimer: number;
}

export class Boss extends Enemy {
  bossTypeId: BossTypeId;
  bossName: string;
  cfg: BossConfig;
  phaseIndex: number;
  phasePulse: number;
  invulnTimer: number;

  // wave10
  minionTimer: number;
  radialTimer: number;
  radialChargeTimer: number; // telegraph windup for radial fire
  dashTimer: number;
  dashActive: boolean;
  dashRemaining: number;
  dashVelX: number;
  dashVelY: number;
  dashWindupTimer: number;   // telegraph before dash launch
  dashWindupAngle: number;   // locked-in dash direction during windup

  // wave20
  drones: BossDrone[];
  droneRespawnTimer: number;
  enrageTimer: number;
  seekerTimer: number;
  seekerChargeTimer: number; // telegraph before seeker fires
  poolTimer: number;         // resonance pool spawn cadence
  pools: ResonancePool[];

  // wave30
  echoes: BossEcho[];
  sweepTimer: number;
  sweepActiveTimer: number;
  sweepAngle: number;
  sweepDir: number;
  sweepChargeTimer: number;  // telegraph charging arc before sweep
  sweepChargeAngle: number;  // aim lock during charge
  constrictCycleTimer: number;
  constrictActive: boolean;
  constrictActiveTimer: number;
  constrictBox: ConstrictBox | null;
  constrictWarnTimer: number; // pre-constrict warning flash
  teleportTimer: number;
  teleportTelegraph: { x: number; y: number; life: number } | null;

  // Banner popup (consumed by game renderer)
  pendingBanner: string | null;
  bannerLife: number;
  bannerMaxLife: number;

  // Phase transition flash
  phaseFlashTimer: number;
  // Consumed by game to trigger time-slow effects
  phaseTransitionPending: boolean;

  constructor(bossTypeId: BossTypeId, x: number, y: number, wave: number) {
    // Seed with 'boss' type so existing systems treat it as a boss; override after
    super(x, y, 'boss', wave);
    this.bossTypeId = bossTypeId;

    const cfg = (BALANCE.bosses as Record<string, BossConfig>)[bossTypeId];
    this.cfg = cfg;
    this.bossName = cfg.name;

    this.color = cfg.color;
    this.size = cfg.size;
    this.hitboxSize = this.size * 1.05;
    this.health = cfg.hp;
    this.maxHealth = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.contactDamage;

    this.xpValue = 200;
    this.moneyDropChance = 1.0;
    this.moneyValue = cfg.cashPileValue;
    this.isBoss = true;
    this.bossVariant = 'standard';
    this.bossPhase = 1;

    this.phaseIndex = 0;
    this.phasePulse = 0;
    this.invulnTimer = 0;

    this.minionTimer = 2.0;
    this.radialTimer = 2.0;
    this.radialChargeTimer = 0;
    this.dashTimer = 3.0;
    this.dashActive = false;
    this.dashRemaining = 0;
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.dashWindupTimer = 0;
    this.dashWindupAngle = 0;

    this.drones = [];
    this.droneRespawnTimer = 0;
    this.enrageTimer = 0;
    this.seekerTimer = 3.0;
    this.seekerChargeTimer = 0;
    this.poolTimer = 6.0;
    this.pools = [];

    this.echoes = [];
    this.sweepTimer = 4.0;
    this.sweepActiveTimer = 0;
    this.sweepAngle = 0;
    this.sweepDir = 1;
    this.sweepChargeTimer = 0;
    this.sweepChargeAngle = 0;
    this.constrictCycleTimer = cfg.constrictCycle ?? 10.0;
    this.constrictActive = false;
    this.constrictActiveTimer = 0;
    this.constrictBox = null;
    this.constrictWarnTimer = 0;
    this.teleportTimer = cfg.teleportCooldown ?? 3.0;
    this.teleportTelegraph = null;

    this.pendingBanner = cfg.banner;
    this.bannerLife = 1.8;
    this.bannerMaxLife = 1.8;
    this.phaseFlashTimer = 0;
    this.phaseTransitionPending = false;

    if (bossTypeId === 'wave20') {
      const count = cfg.droneCount ?? 3;
      for (let i = 0; i < count; i++) {
        this.drones.push({
          angle: (i / count) * Math.PI * 2,
          orbitSpeed: 1.2,
          hp: cfg.droneHp ?? 100,
          maxHp: cfg.droneHp ?? 100,
          alive: true,
          x: x,
          y: y,
          size: cfg.droneSize ?? 28,
        });
      }
    }

    if (bossTypeId === 'wave30') {
      const count = cfg.echoCount ?? 3;
      for (let i = 0; i < count; i++) {
        this.echoes.push({
          x: x,
          y: y,
          angle: (i / count) * Math.PI * 2,
          radius: 110,
          orbitSpeed: 0.9 + i * 0.15,
          fireTimer: 2.0 + i * 0.7,
        });
      }
    }
  }

  // Total drones alive (wave20)
  getAliveDrones(): number {
    let n = 0;
    for (const d of this.drones) if (d.alive) n++;
    return n;
  }

  // Damage scaling shield (wave20: 80% reduction while all drones alive)
  takeDamage(amount: number): void {
    if (this.invulnTimer > 0) return;
    if (this.bossTypeId === 'wave20') {
      const allAlive = this.getAliveDrones() >= (this.cfg.droneCount ?? 3);
      if (allAlive) amount *= (1 - (this.cfg.shieldReduction ?? 0.8));
    }
    super.takeDamage(amount);
  }

  // Called by game each frame to advance mechanics. Replaces the generic Enemy update.
  update(
    deltaTime: number,
    canvasWidth?: number,
    canvasHeight?: number,
    player?: Player | null,
    projectiles?: Projectile[] | null,
    enemies?: Enemy[] | null,
  ): void {
    const cw = canvasWidth ?? GAME_CONFIG.CANVAS_WIDTH;
    const ch = canvasHeight ?? GAME_CONFIG.CANVAS_HEIGHT;
    this.phasePulse += deltaTime;

    if (this.invulnTimer > 0) this.invulnTimer -= deltaTime;
    if (this.phaseFlashTimer > 0) this.phaseFlashTimer -= deltaTime;
    if (this.bannerLife > 0) this.bannerLife -= deltaTime;
    if (this.constrictWarnTimer > 0) this.constrictWarnTimer -= deltaTime;
    if (this.teleportTelegraph) {
      this.teleportTelegraph.life -= deltaTime;
      // Do NOT null here; the phase-2 teleport resolver below consumes it.
      // Nulling would race the resolver on frames with large dt.
    }
    // Age resonance pools
    if (this.pools.length) {
      let n = this.pools.length;
      for (let i = n - 1; i >= 0; i--) {
        this.pools[i].life -= deltaTime;
        if (this.pools[i].life <= 0) {
          this.pools[i] = this.pools[--n];
        }
      }
      this.pools.length = n;
    }

    if (player && player.alive) this.player = player;

    // Phase progression
    this.updatePhase();

    if (this.bossTypeId === 'wave10') this.updateWave10(deltaTime, cw, ch, player ?? null, projectiles ?? null, enemies ?? null);
    else if (this.bossTypeId === 'wave20') this.updateWave20(deltaTime, cw, ch, player ?? null, projectiles ?? null);
    else if (this.bossTypeId === 'wave30') this.updateWave30(deltaTime, cw, ch, player ?? null, projectiles ?? null, enemies ?? null);

    // Apply accumulated velocity (skip Enemy.update's behavior switch)
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    // Clamp to arena
    const half = this.size / 2;
    const topBound = GAME_CONFIG.UI_BAR_HEIGHT + half;
    if (this.position.x < half) this.position.x = half;
    if (this.position.x > cw - half) this.position.x = cw - half;
    if (this.position.y < topBound) this.position.y = topBound;
    if (this.position.y > ch - half) this.position.y = ch - half;
  }

  private updatePhase(): void {
    if (!this.cfg.phases || this.cfg.phases.length === 0) return;
    const hpPct = this.health / this.maxHealth;
    let newIdx = 0;
    for (let i = 0; i < this.cfg.phases.length; i++) {
      if (hpPct <= this.cfg.phases[i].hpThreshold) newIdx = i;
    }
    // Clamp to one-step advances so a burst that drops HP past multiple
    // thresholds in a single frame still fires each intermediate phase banner
    // on successive frames. Previously a big hit could skip directly from 0 → 2.
    if (newIdx > this.phaseIndex + 1) newIdx = this.phaseIndex + 1;
    if (newIdx !== this.phaseIndex) {
      this.phaseIndex = newIdx;
      this.bossPhase = newIdx + 1;
      this.phaseTransitionPending = true;
      // Trigger transition: brief invuln + banner + flash
      this.invulnTimer = 0.6;
      this.phaseFlashTimer = 0.4;
      const phase = this.cfg.phases[newIdx];
      if (phase.banner) {
        this.pendingBanner = phase.banner;
        this.bannerLife = 1.5;
        this.bannerMaxLife = 1.5;
      }
      if (this.effectsSystem) {
        this.effectsSystem.addScreenShake(10, 0.6);
        this.effectsSystem.addFlash(phase.outline, 0.3);
      }
    }
  }

  // =========================================================
  // Wave 10 — Geometric Warlord
  // =========================================================
  private updateWave10(
    deltaTime: number, _cw: number, _ch: number,
    player: Player | null, projectiles: Projectile[] | null, enemies: Enemy[] | null,
  ): void {
    if (!player || !player.alive) return;

    const phase = this.phaseIndex; // 0=Spawn/Radial, 1=Charge
    const cfg = this.cfg;

    // Phase 1 behavior
    if (phase === 0) {
      // Chase slowly
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      this.velocity.x = (dx / d) * this.speed * 0.6;
      this.velocity.y = (dy / d) * this.speed * 0.6;

      // Minion spawn
      this.minionTimer -= deltaTime;
      if (this.minionTimer <= 0 && enemies) {
        this.minionTimer = cfg.minionCooldown ?? 6.0;
        const count = (cfg as unknown as Record<string, number>).minionCount ?? 4;
        for (let i = 0; i < count; i++) {
          const ang = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const dist = this.size + 20;
          const minion = new Enemy(
            this.position.x + Math.cos(ang) * dist,
            this.position.y + Math.sin(ang) * dist,
            'tracker',
            this.wave,
          );
          minion.color = '#FF6666';
          minion.player = player;
          enemies.push(minion);
        }
      }

      // Radial fire — with telegraph windup
      if (this.radialChargeTimer > 0) {
        this.radialChargeTimer -= deltaTime;
        // Slow to a crawl during windup so player can read it
        this.velocity.x *= 0.3;
        this.velocity.y *= 0.3;
        if (this.radialChargeTimer <= 0 && projectiles) {
          const count = cfg.radialShots ?? 6;
          for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + this.phasePulse * 0.3;
            const p = new Projectile(this.position.x, this.position.y, angle, 'enemy');
            p.damage = 3;
            p.size = 10;
            p.speed = 220;
            p.color = '#FFAA00';
            p.velocity.x = Math.cos(angle) * 220;
            p.velocity.y = Math.sin(angle) * 220;
            projectiles.push(p);
          }
          if (this.effectsSystem) this.effectsSystem.addFlash('#FFAA00', 0.12);
        }
      } else {
        this.radialTimer -= deltaTime;
        if (this.radialTimer <= 0) {
          this.radialTimer = cfg.radialFireCooldown ?? 3.0;
          this.radialChargeTimer = 0.5; // 0.5s yellow telegraph ring
          if (this.effectsSystem) this.effectsSystem.addFlash('#FFD700', 0.08);
        }
      }
    } else {
      // Phase 2: dash-and-contact. Stop spawning. Windup-telegraphed dashes.
      if (this.dashActive) {
        this.dashRemaining -= deltaTime;
        this.velocity.x = this.dashVelX;
        this.velocity.y = this.dashVelY;
        if (this.dashRemaining <= 0) {
          this.dashActive = false;
          this.dashTimer = cfg.dashCooldown ?? 2.5;
          this.velocity.x = 0;
          this.velocity.y = 0;
        }
      } else if (this.dashWindupTimer > 0) {
        // Windup: freeze in place while telegraphing
        this.dashWindupTimer -= deltaTime;
        this.velocity.x = 0;
        this.velocity.y = 0;
        if (this.dashWindupTimer <= 0) {
          // Launch!
          this.dashActive = true;
          this.dashRemaining = cfg.dashDuration ?? 0.8;
          const mul = cfg.dashSpeedMultiplier ?? 4.5;
          this.dashVelX = Math.cos(this.dashWindupAngle) * this.speed * mul;
          this.dashVelY = Math.sin(this.dashWindupAngle) * this.speed * mul;
          if (this.effectsSystem) this.effectsSystem.addScreenShake(6, 0.25);
        }
      } else {
        // Aim at player slowly
        const dx = player.position.x - this.position.x;
        const dy = player.position.y - this.position.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        this.velocity.x = (dx / d) * this.speed * 0.3;
        this.velocity.y = (dy / d) * this.speed * 0.3;

        this.dashTimer -= deltaTime;
        if (this.dashTimer <= 0) {
          // Begin windup telegraph instead of launching immediately
          this.dashWindupTimer = 0.5;
          this.dashWindupAngle = Math.atan2(dy, dx);
          if (this.effectsSystem) this.effectsSystem.addFlash('#FFD700', 0.1);
        }
      }
    }
  }

  // =========================================================
  // Wave 20 — Nexus Prism
  // =========================================================
  private updateWave20(
    deltaTime: number, _cw: number, _ch: number,
    player: Player | null, projectiles: Projectile[] | null,
  ): void {
    if (!player || !player.alive) return;
    const cfg = this.cfg;

    // Drift toward player
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    this.velocity.x = (dx / d) * this.speed * 0.5;
    this.velocity.y = (dy / d) * this.speed * 0.5;

    // Update drone positions (orbit around boss)
    const orbitR = cfg.droneRadius ?? 95;
    for (const drone of this.drones) {
      drone.angle += drone.orbitSpeed * deltaTime;
      drone.x = this.position.x + Math.cos(drone.angle) * orbitR;
      drone.y = this.position.y + Math.sin(drone.angle) * orbitR;
    }

    // Drone respawn
    const aliveCount = this.getAliveDrones();
    if (aliveCount < (cfg.droneCount ?? 3)) {
      this.droneRespawnTimer -= deltaTime;
      if (this.droneRespawnTimer <= 0) {
        for (const drone of this.drones) {
          if (!drone.alive) {
            drone.alive = true;
            drone.hp = drone.maxHp;
          }
        }
        this.droneRespawnTimer = cfg.droneRespawn ?? 15.0;
        if (this.effectsSystem) this.effectsSystem.addFlash('#CC66FF', 0.2);
      }
    } else {
      this.droneRespawnTimer = cfg.droneRespawn ?? 15.0;
    }

    // Enrage window when all drones dead
    if (aliveCount === 0) {
      if (this.enrageTimer <= 0) {
        this.enrageTimer = cfg.enrageDuration ?? 8.0;
      }
      this.enrageTimer -= deltaTime;
    } else {
      this.enrageTimer = 0;
    }
    const enraged = this.enrageTimer > 0;

    // Seeker fire — with 0.5s charge telegraph
    const fireCd = (cfg.seekerCooldown ?? 4.0) / (enraged ? (cfg.enrageFireRateMul ?? 1.5) : 1);
    if (this.seekerChargeTimer > 0) {
      this.seekerChargeTimer -= deltaTime;
      if (this.seekerChargeTimer <= 0 && projectiles) {
        const angle = Math.atan2(dy, dx);
        const p = new Projectile(this.position.x, this.position.y, angle, 'enemy');
        p.damage = cfg.seekerDamage ?? 5;
        p.size = 12;
        p.speed = cfg.seekerSpeed ?? 160;
        p.color = '#FF00FF';
        p.velocity.x = Math.cos(angle) * p.speed;
        p.velocity.y = Math.sin(angle) * p.speed;
        projectiles.push(p);
        this.seekerTimer = fireCd;
      }
    } else {
      this.seekerTimer -= deltaTime;
      if (this.seekerTimer <= 0) {
        this.seekerChargeTimer = 0.5;
      }
    }

    // NEW MECHANIC — Resonance Pools: damaging floor zones, faster when enraged
    this.poolTimer -= deltaTime * (enraged ? 1.5 : 1.0);
    if (this.poolTimer <= 0 && player) {
      this.poolTimer = cfg.poolCooldown ?? 7.0;
      // Drop a pool on the player's last position (so they must keep moving)
      const poolLife = cfg.poolLifetime ?? 5.0;
      this.pools.push({
        x: player.position.x,
        y: player.position.y,
        radius: cfg.poolRadius ?? 75,
        life: poolLife,
        maxLife: poolLife,
        damageTimer: 0,
      });
      if (this.effectsSystem) this.effectsSystem.addFlash('#CC66FF', 0.1);
    }
  }

  // =========================================================
  // Wave 30 — The Hollow King
  // =========================================================
  private updateWave30(
    deltaTime: number, cw: number, ch: number,
    player: Player | null, projectiles: Projectile[] | null, _enemies: Enemy[] | null,
  ): void {
    if (!player || !player.alive) return;
    const cfg = this.cfg;
    const phase = this.phaseIndex;

    // Base chase
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    this.velocity.x = (dx / d) * this.speed * 0.55;
    this.velocity.y = (dy / d) * this.speed * 0.55;

    // Echoes orbit + fire. In P3 they become aggressive shadow-clones (faster cd + orbit).
    if (phase >= 0) {
      const p3 = phase >= 2;
      const orbitMul = p3 ? 1.8 : 1.0;
      const fireCd = p3 ? 1.6 : 3.0;
      for (const e of this.echoes) {
        e.angle += e.orbitSpeed * deltaTime * orbitMul;
        e.x = this.position.x + Math.cos(e.angle) * e.radius;
        e.y = this.position.y + Math.sin(e.angle) * e.radius;
        e.fireTimer -= deltaTime;
        if (e.fireTimer <= 0 && projectiles) {
          e.fireTimer = fireCd;
          const a = Math.atan2(player.position.y - e.y, player.position.x - e.x);
          const p = new Projectile(e.x, e.y, a, 'enemy');
          p.damage = (cfg.sweepBeamDamage ?? 4) * (cfg.echoDamageMul ?? 0.4) * (p3 ? 1.25 : 1);
          p.size = p3 ? 10 : 8;
          p.speed = p3 ? 220 : 180;
          p.color = p3 ? '#AA22FF' : '#552288';
          p.velocity.x = Math.cos(a) * p.speed;
          p.velocity.y = Math.sin(a) * p.speed;
          projectiles.push(p);
        }
      }
    }

    // Sweep beam (phase 2+) — with charge telegraph
    if (phase >= 1) {
      if (this.sweepActiveTimer > 0) {
        this.sweepActiveTimer -= deltaTime;
        this.sweepAngle += this.sweepDir * deltaTime * 1.8;
      } else if (this.sweepChargeTimer > 0) {
        this.sweepChargeTimer -= deltaTime;
        // Keep aim tracking updated until near the end of charge (last 0.2s locks)
        if (this.sweepChargeTimer > 0.2) {
          this.sweepChargeAngle = Math.atan2(dy, dx);
        }
        if (this.sweepChargeTimer <= 0) {
          this.sweepActiveTimer = cfg.sweepBeamDuration ?? 1.8;
          this.sweepAngle = this.sweepChargeAngle - 0.6;
          this.sweepDir = 1;
          if (this.effectsSystem) {
            this.effectsSystem.addFlash('#FFD700', 0.2);
            this.effectsSystem.addScreenShake(5, 0.3);
          }
        }
      } else {
        this.sweepTimer -= deltaTime;
        if (this.sweepTimer <= 0) {
          this.sweepTimer = cfg.sweepBeamCooldown ?? 5.0;
          this.sweepChargeTimer = 0.7; // 0.7s charging arc
          this.sweepChargeAngle = Math.atan2(dy, dx);
        }
      }

      // Constricting walls — with 1.2s pre-warning
      this.constrictCycleTimer -= deltaTime;
      if (!this.constrictActive && this.constrictWarnTimer <= 0 && this.constrictCycleTimer <= 1.2 && this.constrictCycleTimer > 0) {
        this.constrictWarnTimer = this.constrictCycleTimer;
        if (this.effectsSystem) this.effectsSystem.addFlash('#FF4400', 0.15);
      }
      if (!this.constrictActive && this.constrictCycleTimer <= 0) {
        this.constrictActive = true;
        this.constrictActiveTimer = cfg.constrictDuration ?? 8.0;
        this.constrictBox = {
          left: 20,
          right: cw - 20,
          top: GAME_CONFIG.UI_BAR_HEIGHT + 20,
          bottom: ch - 20,
          damageTimer: 0,
        };
        if (this.effectsSystem) this.effectsSystem.addScreenShake(6, 0.4);
      }
      if (this.constrictActive && this.constrictBox) {
        this.constrictActiveTimer -= deltaTime;
        const total = cfg.constrictDuration ?? 8.0;
        const progress = 1 - Math.max(0, this.constrictActiveTimer / total);
        // Shrink inward to a minimum central region
        // Wider minimum floor keeps the fight dodgeable (tuned up from 260)
        const minW = 340;
        const minH = 340;
        const cx = cw / 2;
        const cy = (GAME_CONFIG.UI_BAR_HEIGHT + ch) / 2;
        const fullLeft = 20;
        const fullRight = cw - 20;
        const fullTop = GAME_CONFIG.UI_BAR_HEIGHT + 20;
        const fullBottom = ch - 20;
        const targetLeft = cx - minW / 2;
        const targetRight = cx + minW / 2;
        const targetTop = cy - minH / 2;
        const targetBottom = cy + minH / 2;
        this.constrictBox.left = fullLeft + (targetLeft - fullLeft) * progress;
        this.constrictBox.right = fullRight + (targetRight - fullRight) * progress;
        this.constrictBox.top = fullTop + (targetTop - fullTop) * progress;
        this.constrictBox.bottom = fullBottom + (targetBottom - fullBottom) * progress;
        if (this.constrictActiveTimer <= 0) {
          this.constrictActive = false;
          this.constrictBox = null;
          this.constrictCycleTimer = cfg.constrictCycle ?? 10.0;
        }
      }
    }

    // Teleport (phase 3) — with pre-telegraph marker
    if (phase >= 2) {
      this.teleportTimer -= deltaTime;
      if (this.teleportTimer <= 0 && !this.teleportTelegraph) {
        // Pick destination, show telegraph for 0.4s, then teleport
        const ang = Math.random() * Math.PI * 2;
        const dist = 140 + Math.random() * 60;
        const tx = player.position.x + Math.cos(ang) * dist;
        const ty = player.position.y + Math.sin(ang) * dist;
        this.teleportTelegraph = { x: tx, y: ty, life: 0.4 };
        // Queue actual teleport at end of telegraph by re-using teleportTimer as resolution marker
        this.teleportTimer = 0.4;
        if (this.effectsSystem) this.effectsSystem.addFlash('#FF0000', 0.12);
      } else if (this.teleportTelegraph && this.teleportTelegraph.life <= 0) {
        // Resolve teleport
        this.position.x = this.teleportTelegraph.x;
        this.position.y = this.teleportTelegraph.y;
        this.teleportTelegraph = null;
        this.teleportTimer = cfg.teleportCooldown ?? 3.0;
        if (this.effectsSystem) {
          this.effectsSystem.addFlash('#FF0000', 0.2);
          this.effectsSystem.addScreenShake(7, 0.35);
        }
        // Shockwave
        if (projectiles) {
          const shots = 16;
          for (let i = 0; i < shots; i++) {
            const a = (Math.PI * 2 * i) / shots;
            const p = new Projectile(this.position.x, this.position.y, a, 'enemy');
            p.damage = cfg.shockwaveDamage ?? 8;
            p.size = 10;
            p.speed = 260;
            p.color = '#FF2222';
            p.velocity.x = Math.cos(a) * 260;
            p.velocity.y = Math.sin(a) * 260;
            projectiles.push(p);
          }
        }
      }
    }
  }

  // Apply per-frame effects on player (called from game update): beam + walls + shockwave
  applyAreaDamage(player: Player, deltaTime: number, onDamage: (amount: number) => void): void {
    // Sweep beam
    if (this.bossTypeId === 'wave30' && this.sweepActiveTimer > 0) {
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const playerAng = Math.atan2(dy, dx);
      let delta = Math.abs(this.normalizeAngle(playerAng - this.sweepAngle));
      if (delta <= 0.35) {
        onDamage((this.cfg.sweepBeamDamage ?? 4) * deltaTime * 2);
      }
    }
    // Resonance pool damage (wave20)
    if (this.bossTypeId === 'wave20' && this.pools.length) {
      const poolDmg = this.cfg.poolDamage ?? 3;
      for (const pool of this.pools) {
        const dx = player.position.x - pool.x;
        const dy = player.position.y - pool.y;
        if (dx * dx + dy * dy <= pool.radius * pool.radius) {
          pool.damageTimer -= deltaTime;
          if (pool.damageTimer <= 0) {
            pool.damageTimer = 0.4;
            onDamage(poolDmg);
          }
        }
      }
    }
    // Constrict wall damage (player outside safe box)
    if (this.constrictBox) {
      const box = this.constrictBox;
      if (
        player.position.x < box.left ||
        player.position.x > box.right ||
        player.position.y < box.top ||
        player.position.y > box.bottom
      ) {
        box.damageTimer -= deltaTime;
        if (box.damageTimer <= 0) {
          box.damageTimer = 0.5;
          onDamage(this.cfg.constrictWallDamage ?? 3);
        }
      }
    }
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Intercept projectile path: if projectile would hit a drone, apply damage there instead.
  // Returns true if absorbed.
  absorbProjectile(px: number, py: number, damage: number): boolean {
    if (this.bossTypeId !== 'wave20') return false;
    for (const d of this.drones) {
      if (!d.alive) continue;
      const dx = px - d.x;
      const dy = py - d.y;
      const r = d.size;
      if (dx * dx + dy * dy <= r * r) {
        d.hp -= damage;
        if (d.hp <= 0) {
          d.alive = false;
          // Drone death AOE: spawn a lingering resonance pool at death site
          this.pools.push({
            x: d.x,
            y: d.y,
            radius: this.cfg.poolRadius ?? 70,
            life: 3.5,
            maxLife: 3.5,
            damageTimer: 0,
          });
          if (this.effectsSystem) {
            this.effectsSystem.addKillEffect(d.x, d.y);
            this.effectsSystem.addFlash('#CC66FF', 0.25);
            this.effectsSystem.addExplosionEffect(d.x, d.y, 80);
            this.effectsSystem.addScreenShake(4, 0.25);
          }
        }
        return true;
      }
    }
    return false;
  }

  // Drops at death: massive cash pile + guaranteed heart + epic effects
  onDeathSpawn(pickups: Pickup[]): void {
    const total = this.cfg.cashPileValue;
    // Two rings of coins for a big, visible pile
    const innerChunks = 8;
    for (let i = 0; i < innerChunks; i++) {
      const a = (Math.PI * 2 * i) / innerChunks + Math.random() * 0.25;
      const r = 18 + Math.random() * 22;
      const p = new Pickup(this.position.x + Math.cos(a) * r, this.position.y + Math.sin(a) * r, 'money');
      p.value = Math.ceil((total * 0.6) / innerChunks);
      pickups.push(p);
    }
    const outerChunks = 12;
    for (let i = 0; i < outerChunks; i++) {
      const a = (Math.PI * 2 * i) / outerChunks + Math.random() * 0.25;
      const r = 55 + Math.random() * 40;
      const p = new Pickup(this.position.x + Math.cos(a) * r, this.position.y + Math.sin(a) * r, 'money');
      p.value = Math.ceil((total * 0.4) / outerChunks);
      pickups.push(p);
    }
    const heart = new Pickup(this.position.x, this.position.y, 'health');
    heart.value = 10;
    pickups.push(heart);
    // Layered explosion effects
    if (this.effectsSystem) {
      this.effectsSystem.addExplosionEffect(this.position.x, this.position.y, 150);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const r = this.size * 0.8;
        this.effectsSystem.addExplosionEffect(
          this.position.x + Math.cos(a) * r,
          this.position.y + Math.sin(a) * r,
          80,
        );
      }
      this.effectsSystem.addFlash(this.cfg.strokeColor, 0.35);
      this.effectsSystem.addScreenShake(22, 1.4);
    }
  }

  // Called by game on boss death — trigger phase-slow for ~300ms via existing timer hook.
  // Game.ts already reads phaseTransitionPending; re-use it to freeze the frame.
  triggerDeathFreeze(): void {
    this.phaseTransitionPending = true;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const cfg = this.cfg;
    const pulse = 0.5 + 0.5 * Math.sin(this.phasePulse * 4);

    // ---------- Aura (per-boss personality, drawn behind body) ----------
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    if (this.bossTypeId === 'wave10') {
      // Red diamond spike aura — orbiting chevrons
      const spikes = 8;
      ctx.strokeStyle = '#FF3322';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + 0.3 * pulse;
      for (let i = 0; i < spikes; i++) {
        const a = (Math.PI * 2 * i) / spikes + this.phasePulse * 0.8;
        const r = this.size * 1.15 + pulse * 4;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(sx * 0.9, sy * 0.9);
        ctx.lineTo(sx * 1.08, sy * 1.08);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (this.bossTypeId === 'wave20') {
      // Crystalline refraction shards — radiating cyan/purple
      const shards = 10;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < shards; i++) {
        const a = (Math.PI * 2 * i) / shards + this.phasePulse * 0.3;
        const inner = this.size * 0.7;
        const outer = this.size * 1.05 + pulse * 6;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(120,230,255,0.45)' : 'rgba(200,120,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.stroke();
      }
    } else if (this.bossTypeId === 'wave30') {
      // Shadow halo + orbiting gold flecks; grows with phaseIndex (dread escalates)
      const rings = 2 + this.phaseIndex;
      for (let r = 0; r < rings; r++) {
        const rr = this.size * (0.9 + r * 0.18) + pulse * 3;
        ctx.strokeStyle = r === 0 ? 'rgba(255,215,0,0.35)' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3 - r;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      const flecks = 6;
      ctx.fillStyle = '#FFD700';
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < flecks; i++) {
        const a = (Math.PI * 2 * i) / flecks + this.phasePulse * 0.6;
        const r = this.size * 1.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    ctx.save();
    ctx.translate(this.position.x, this.position.y);

    // Body
    ctx.fillStyle = cfg.color;
    ctx.strokeStyle = cfg.strokeColor;
    ctx.lineWidth = 3 + pulse * 2;

    if (this.bossTypeId === 'wave10') {
      // Sharp diamond with inner chevron highlight
      const s = this.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(0, s * 0.5);
      ctx.lineTo(-s * 0.5, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (this.bossTypeId === 'wave20') {
      // Square + cyan facet + inner diamond + pulsing cyan core
      const s = this.size;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = 'rgba(120,230,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(-s / 2, -s / 2);
      ctx.lineTo(s / 2, -s / 2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3);
      ctx.lineTo(s * 0.3, 0);
      ctx.lineTo(0, s * 0.3);
      ctx.lineTo(-s * 0.3, 0);
      ctx.closePath();
      ctx.fillStyle = cfg.coreColor;
      ctx.fill();
      ctx.fillStyle = `rgba(120,230,255,${0.5 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // wave30: square + gold cracks (intensify per phase) + hollow void core
      const s = this.size;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = cfg.coreColor;
      ctx.lineWidth = 2 + this.phaseIndex;
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      ctx.beginPath();
      ctx.moveTo(-s / 2, -s / 4); ctx.lineTo(0, 0); ctx.lineTo(s / 3, s / 2);
      ctx.moveTo(s / 2, -s / 3); ctx.lineTo(0, 0); ctx.lineTo(-s / 3, s / 3);
      if (this.phaseIndex >= 1) {
        ctx.moveTo(-s / 3, -s / 2); ctx.lineTo(-s / 6, -s / 6);
        ctx.moveTo(s / 4, s / 2); ctx.lineTo(s / 6, s / 6);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.13 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Invuln pulse
    if (this.invulnTimer > 0) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.globalAlpha = Math.abs(Math.sin(this.phasePulse * 20));
      ctx.strokeRect(-this.size / 2 - 6, -this.size / 2 - 6, this.size + 12, this.size + 12);
      ctx.globalAlpha = 1;
    }

    // Phase flash
    if (this.phaseFlashTimer > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = this.phaseFlashTimer / 0.4;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Wave10 dash-windup telegraph (projecting red lance from boss)
    if (this.bossTypeId === 'wave10' && this.dashWindupTimer > 0) {
      const windupPct = 1 - this.dashWindupTimer / 0.5;
      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      ctx.rotate(this.dashWindupAngle);
      ctx.strokeStyle = '#FF3333';
      ctx.globalAlpha = 0.35 + 0.55 * windupPct;
      ctx.lineWidth = 5 + windupPct * 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(720, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#FFDD44';
      const tipR = 8 + 6 * Math.sin(this.phasePulse * 22);
      ctx.beginPath();
      ctx.arc(60 + windupPct * 40, 0, tipR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Wave20 resonance pools
    if (this.bossTypeId === 'wave20' && this.pools.length) {
      for (const pool of this.pools) {
        const pulse2 = 0.5 + 0.5 * Math.sin(this.phasePulse * 6);
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.15 * pulse2;
        ctx.fillStyle = '#AA44FF';
        ctx.beginPath();
        ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 3;
        ctx.stroke();
        const lifePct = pool.life / pool.maxLife;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pool.x, pool.y, pool.radius * lifePct, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Wave20 seeker charge glow
    if (this.bossTypeId === 'wave20' && this.seekerChargeTimer > 0) {
      const p = 1 - this.seekerChargeTimer / 0.5;
      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      ctx.strokeStyle = '#FF00FF';
      ctx.globalAlpha = 0.4 + 0.55 * p;
      ctx.lineWidth = 4 + 6 * p;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.65 + p * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Drones (wave20)
    if (this.bossTypeId === 'wave20') {
      for (const d of this.drones) {
        if (!d.alive) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.fillStyle = '#AA44FF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -d.size / 2);
        ctx.lineTo(d.size / 2, 0);
        ctx.lineTo(0, d.size / 2);
        ctx.lineTo(-d.size / 2, 0);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Drone HP bar
        const barW = d.size * 1.4;
        ctx.fillStyle = '#333';
        ctx.fillRect(-barW / 2, -d.size / 2 - 8, barW, 3);
        ctx.fillStyle = '#CC66FF';
        ctx.fillRect(-barW / 2, -d.size / 2 - 8, barW * (d.hp / d.maxHp), 3);
        ctx.restore();
      }
    }

    // Echoes (wave30) — visually distinct with dashed gold outline + ghostly sway
    if (this.bossTypeId === 'wave30') {
      for (const e of this.echoes) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.PI / 4); // diamond orientation distinguishes from boss square
        ctx.fillStyle = '#1a0a1f';
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([6, 4]);
        }
        const es = this.size * 0.42;
        ctx.fillRect(-es / 2, -es / 2, es, es);
        ctx.strokeRect(-es / 2, -es / 2, es, es);
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([]);
        }
        // inner glow dot
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Constrict pre-warning (pulsing red rectangle before the box actually activates)
      if (this.constrictWarnTimer > 0 && !this.constrictActive) {
        ctx.save();
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(this.phasePulse * 18));
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([12, 8]);
        }
        // Draw the eventual "full arena" outline as warning
        ctx.strokeRect(20, GAME_CONFIG.UI_BAR_HEIGHT + 20, GAME_CONFIG.CANVAS_WIDTH - 40, GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.UI_BAR_HEIGHT - 40);
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([]);
        }
        ctx.restore();
      }

      // Constrict walls visualization
      if (this.constrictBox) {
        const b = this.constrictBox;
        ctx.save();
        ctx.strokeStyle = '#FF4400';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.phasePulse * 8);
        ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
        ctx.restore();
      }

      // Sweep beam charging arc (telegraph)
      if (this.sweepChargeTimer > 0) {
        const cp = 1 - this.sweepChargeTimer / 0.7;
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.sweepChargeAngle);
        ctx.strokeStyle = '#FFD700';
        ctx.globalAlpha = 0.3 + 0.6 * cp;
        ctx.lineWidth = 2 + 4 * cp;
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([10, 6]);
        }
        // Thin line showing aim
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(1200, 0);
        ctx.stroke();
        if (typeof (ctx as unknown as { setLineDash?: (d: number[]) => void }).setLineDash === 'function') {
          (ctx as unknown as { setLineDash: (d: number[]) => void }).setLineDash([]);
        }
        // Growing charge orb at origin
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#FFDD66';
        ctx.beginPath();
        ctx.arc(0, 0, 8 + cp * 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sweep beam
      if (this.sweepActiveTimer > 0) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.sweepAngle);
        const grad = ctx.createLinearGradient(0, 0, 1200, 0);
        grad.addColorStop(0, 'rgba(255,215,0,0.85)');
        grad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, -22, 1200, 44);
        // Bright core line
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(1200, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Teleport telegraph — X marker at destination
      if (this.teleportTelegraph && this.teleportTelegraph.life > 0) {
        const tt = this.teleportTelegraph;
        const tp = 1 - Math.max(0, tt.life / 0.4);
        ctx.save();
        ctx.translate(tt.x, tt.y);
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3 + tp * 3;
        ctx.globalAlpha = 0.5 + 0.5 * tp;
        const r = this.size * 0.55;
        ctx.beginPath();
        ctx.moveTo(-r, -r); ctx.lineTo(r, r);
        ctx.moveTo(r, -r); ctx.lineTo(-r, r);
        ctx.stroke();
        // Expanding warning ring
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.5 + tp * 1.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
