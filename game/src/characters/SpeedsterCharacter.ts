import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

interface Afterimage {
  x: number;
  y: number;
  ttl: number;
  size: number;
}

export class SpeedsterCharacter extends BaseCharacter {
  afterimages: Afterimage[];
  afterimageTimer: number;
  dashCooldown: number;
  timeDilationCooldown: number;
  timeDilationActive: boolean;
  timeDilationDuration: number;
  lastPosition: { x: number; y: number } | null;
  dashStyle: string;
  dashDistance: number;
  dashCooldownMax: number;
  overdriveStacks: number;
  overdriveTimer: number;

  // Mach Break (Velocity meter) — Fighter-style buildup passive
  velocity: number;
  velocityMax: number;
  machBreakTimer: number;
  machBreakFlash: number;
  _machBreakSpeedApplied: boolean;
  _machBreakBaseSpeed: number;
  totalMachBreaks: number;

  // Cached item effects
  afterimageTtl: number;
  timeDilationMaxDuration: number;
  afterimageDamageMult: number;
  hasSpeedDemon: boolean;
  speedDemonKills: number;
  _baseSpeed: number;
  velocityFillMult: number;
  speedLines: Array<{ x: number; y: number; vx: number; vy: number; ttl: number; len: number }>;

  constructor() {
    super();
    this.afterimages = [];
    this.afterimageTimer = 0;
    this.dashCooldown = 0;
    this.timeDilationCooldown = 0;
    this.timeDilationActive = false;
    this.timeDilationDuration = 0;
    this.lastPosition = null;
    this.dashStyle = 'blink';
    this.dashDistance = 200;
    this.dashCooldownMax = 3;
    this.overdriveStacks = 0;
    this.overdriveTimer = 0;
    this.velocity = 0;
    this.velocityMax = 100;
    this.machBreakTimer = 0;
    this.machBreakFlash = 0;
    this._machBreakSpeedApplied = false;
    this._machBreakBaseSpeed = 0;
    this.totalMachBreaks = 0;
    this.afterimageTtl = 1.5;
    this.timeDilationMaxDuration = 4;
    this.afterimageDamageMult = 1;
    this.hasSpeedDemon = false;
    this.speedDemonKills = 0;
    this._baseSpeed = 0;
    this.velocityFillMult = 1;
    this.speedLines = [];
  }

  // Each Mach Break in a wave makes the next one 1.5× harder to fill.
  getEffectiveVelocityMax(): number {
    return this.velocityMax * Math.pow(1.5, this.totalMachBreaks);
  }

  getId(): string { return 'speedster'; }
  getName(): string { return 'The Speedster'; }
  getDescription(): string {
    return 'Melee mobility. No weapons — damage comes from running into enemies. Sustained movement fills Velocity which scales dash damage; afterimages trail behind dealing 50% dash damage for 1.5s. Pick a dash style at start (Blink / Phantom / Overdrive). Mach Break at cap. Shop: items only.';
  }
  getColor(): string { return '#00DDFF'; }

  getBaseStats(): PlayerStats {
    return {
      health: 5,
      speed: BALANCE.player.baseSpeed * 3,
      damage: 0,
      fireRate: 0,
      dodge: BALANCE.player.baseDodge + 10,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange * 1.5,
      regeneration: 0,
    };
  }

  getPlayerSize(): number { return 28; }
  getStartingWeapons(): string[] { return []; }
  getAvailableWeapons(): string[] | null { return []; }
  getShopTabs(): string[] { return ['items']; }
  getMaxWeapons(): number { return 0; }
  // Glass-ish but not GC-tier. 40 HP gives room to scale without making
  // Speedster feel like a bruiser.
  getMaxHealthValue(): number { return 40; }
  getUpgradePool(): string[] {
    // No weapons / fire rate / damage — no-weapons kit, damage comes from
    // motion (afterimages, dash). Critchance/critDamage skipped — speedster
    // damage path doesn't route through crit.
    return [
      'health', 'speed', 'dodge', 'luck', 'regeneration',
      'afterimageDamage', 'dashDistance', 'timeDilationDuration',
    ];
  }

  getAvailableItems(): string[] {
    // Drop weapon-only items (heavyRounds, sharpShooter, rapidReload, doubleTap,
    // explosiveRounds, bounceHouse, glassCannon+weapons) — this is a no-weapons
    // kit. Add defensive options so 5-HP runs are survivable.
    return [
      // Speedster exclusives
      'frictionBoots', 'warpCore', 'chronoShard', 'speedDemon',
      'lightSpeed', 'slipstream',
      // Generic micro-stats + mobility
      'luckyCoin', 'energyDrink', 'proteinBar', 'bandaidPack', 'coffeeShot',
      'moneyMagnet', 'luckyPenny', 'speedBoots', 'magnetGloves',
      // Survivability — 5-HP Speedster needs more than shield + adrenaline
      'shieldGenerator', 'adrenalineRush', 'tankArmor', 'reinforcedPlating',
      'evasionTraining', 'prospectorsCharm', 'bloodPact', 'vampiric',
    ];
  }

  onStartLevel(game: GameAPI): void {
    this.afterimages = [];
    this.afterimageTimer = 0;
    this.dashCooldown = 0;
    this.timeDilationCooldown = 0;
    this.timeDilationActive = false;
    this.timeDilationDuration = 0;
    this.lastPosition = null;
    this.overdriveStacks = 0;
    this.overdriveTimer = 0;
    this.velocity = 0;
    this.machBreakTimer = 0;
    this.machBreakFlash = 0;
    this._machBreakSpeedApplied = false;
    this._machBreakBaseSpeed = 0;
    this.totalMachBreaks = 0;
    this.speedLines = [];

    const gameState = game.getGameState();
    const charData = gameState.playerData as unknown as Record<string, unknown>;
    this.dashStyle = (charData.startingDashStyle as string) || (charData.startingStyle as string) || 'blink';

    if (this.dashStyle === 'overdrive') {
      this.dashDistance = 120;
      this.dashCooldownMax = 1;
    } else {
      this.dashDistance = 200;
      this.dashCooldownMax = 3;
    }

    // Slipstream reduces dash cooldown
    if ((gameState.playerData.items || []).includes('slipstream')) {
      this.dashCooldownMax *= 0.75;
    }

    // Item effects
    const items = gameState.playerData.items || [];
    const itemStacks = gameState.playerData.itemStacks || {};
    const stats = gameState.playerData.stats;

    this.afterimageTtl = items.includes('frictionBoots') ? 3.0 : 1.5;
    this.timeDilationMaxDuration = items.includes('chronoShard') ? 8 : 4;

    // warpCore: +100 per stack, capped at +300.
    const warpStacks = Math.min(3, itemStacks['warpCore'] || (items.includes('warpCore') ? 1 : 0));
    const warpBonus = Math.min(300, warpStacks * 100);
    this.dashDistance += warpBonus;
    this.dashDistance += stats.dashDistanceBonus || 0;

    this.timeDilationMaxDuration += stats.timeDilationDurationBonus || 0;
    this.afterimageDamageMult = 1 + (stats.afterimageDamageBonus || 0);

    this.hasSpeedDemon = items.includes('speedDemon');
    this.speedDemonKills = 0;
    const player = game.getPlayer();
    this._baseSpeed = player ? player.speed : 0;

    this.velocityFillMult = items.includes('lightSpeed') ? 1.3 : 1;
  }

  onLevelEnd(): void {
    this.speedDemonKills = 0;
    // Clear Mach Break so the 1.5x speed multiplier doesn't leak into the next
    // level (onStartLevel re-reads player.speed as base and would lock in the
    // boosted value otherwise).
    this.velocity = 0;
    this.machBreakTimer = 0;
    this.machBreakFlash = 0;
    this._machBreakSpeedApplied = false;
    this._machBreakBaseSpeed = 0;
    this.speedLines = [];
  }

  onKill(game: GameAPI, _enemy: Enemy): void {
    if (!this.hasSpeedDemon) return;
    this.speedDemonKills++;
    const player = game.getPlayer();
    if (!player) return;
    if (this._baseSpeed <= 0) this._baseSpeed = player.speed;
    const newBase = this._baseSpeed * (1 + this.speedDemonKills * 0.01);
    if (this._machBreakSpeedApplied) {
      // Mach Break is multiplying speed by 1.5 — preserve it.
      player.speed = newBase * 1.5;
    } else {
      player.speed = newBase;
    }
  }

  onWaveComplete(game: GameAPI, _wave: number): void {
    this.speedDemonKills = 0;
    const player = game.getPlayer();
    if (player && this._baseSpeed > 0) {
      player.speed = this._machBreakSpeedApplied ? this._baseSpeed * 1.5 : this._baseSpeed;
    }
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    const player = game.getPlayer();
    if (!player || !player.alive) return;

    const vx = player.velocity ? player.velocity.x : 0;
    const vy = player.velocity ? player.velocity.y : 0;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (this.overdriveTimer > 0) {
      this.overdriveTimer -= deltaTime;
      if (this.overdriveTimer <= 0) this.overdriveStacks = 0;
    }

    // --- Velocity meter / Mach Break ---
    if (this.machBreakTimer > 0) {
      this.machBreakTimer -= deltaTime;
      if (!this._machBreakSpeedApplied) {
        this._machBreakBaseSpeed = player.speed;
        player.speed = player.speed * 1.5;
        this._machBreakSpeedApplied = true;
      }
      // Spawn speed lines while Mach Break active
      if (Math.random() < deltaTime * 30) {
        const ang = Math.atan2(vy, vx || 0.0001);
        const perp = ang + Math.PI / 2;
        const off = (Math.random() - 0.5) * 120;
        this.speedLines.push({
          x: player.position.x + Math.cos(perp) * off - Math.cos(ang) * 40,
          y: player.position.y + Math.sin(perp) * off - Math.sin(ang) * 40,
          vx: Math.cos(ang) * 400,
          vy: Math.sin(ang) * 400,
          ttl: 0.3,
          len: 18 + Math.random() * 14,
        });
      }
      if (this.machBreakTimer <= 0) {
        this.machBreakTimer = 0;
        if (this._machBreakSpeedApplied) {
          // Restore by inverse ratio so any base-speed changes (Speed Demon)
          // during Mach Break are preserved.
          player.speed = player.speed / 1.5;
          this._machBreakSpeedApplied = false;
        }
        this.velocity = 0;
        this.machBreakFlash = 0.5;
      }
    } else {
      if (this.machBreakFlash > 0) this.machBreakFlash -= deltaTime;
      if (speed < 10) {
        this.velocity = Math.max(0, this.velocity - 30 * deltaTime);
      } else {
        this.velocity = Math.min(
          this.getEffectiveVelocityMax(),
          this.velocity + speed * deltaTime * 0.08 * this.velocityFillMult
        );
      }
      if (this.velocity >= this.getEffectiveVelocityMax()) {
        this.machBreakTimer = 4;
        this.totalMachBreaks++;
        const effects = game.getEffectsSystem();
        if (effects) {
          effects.floatingTexts.push({
            x: player.position.x,
            y: player.position.y - 30,
            text: 'MACH BREAK',
            color: '#00DDFF',
            life: 1.5,
            fontSize: 16,
          });
          effects.addExplosion(player.position.x, player.position.y, 60, '#66EEFF');
        }
      }
    }

    // Update speed lines (cheap particle system)
    if (this.speedLines.length > 0) {
      for (let i = this.speedLines.length - 1; i >= 0; i--) {
        const sl = this.speedLines[i];
        sl.ttl -= deltaTime;
        if (sl.ttl <= 0) {
          this.speedLines[i] = this.speedLines[this.speedLines.length - 1];
          this.speedLines.pop();
          continue;
        }
        sl.x += sl.vx * deltaTime;
        sl.y += sl.vy * deltaTime;
      }
    }

    const machActive = this.machBreakTimer > 0;
    const machDmgMult = machActive ? 2 : 1; // contact damage 2x during Mach Break
    const machAfterimageMult = machActive ? 2 : 1; // +100% afterimage damage
    const dmgMult = 1 + this.overdriveStacks * 0.1;

    if (speed > 10) {
      const enemies = game.getEnemies();
      const dashDamage = speed * 0.05 * deltaTime * dmgMult * machDmgMult;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - player.position.x;
        const dy = enemy.position.y - player.position.y;
        const threshold = player.size + enemy.size / 2;
        if (dx * dx + dy * dy < threshold * threshold) {
          enemy.takeDamage(dashDamage);
          enemy.lastHitWeaponId = 'speedsterDash';
          game.recordDamage('speedsterDash', dashDamage);
        }
      }
    }

    this.afterimageTimer -= deltaTime;
    if (this.afterimageTimer <= 0 && speed > 10) {
      this.afterimages.push({
        x: player.position.x,
        y: player.position.y,
        ttl: this.afterimageTtl,
        size: player.size,
      });
      this.afterimageTimer = 0.2;
    }

    const enemies = game.getEnemies();
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const img = this.afterimages[i];
      img.ttl -= deltaTime;
      if (img.ttl <= 0) {
        this.afterimages[i] = this.afterimages[this.afterimages.length - 1];
        this.afterimages.pop();
        continue;
      }
      const imgMult = this.dashStyle === 'phantom' ? 2 : 1;
      const imgDamage = speed * 0.025 * deltaTime * imgMult * dmgMult * this.afterimageDamageMult * machAfterimageMult;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.position.x - img.x;
        const dy = enemy.position.y - img.y;
        const threshold = img.size + enemy.size / 2;
        if (dx * dx + dy * dy < threshold * threshold) {
          enemy.takeDamage(imgDamage);
          enemy.lastHitWeaponId = 'speedsterAfterimage';
          game.recordDamage('speedsterAfterimage', imgDamage);
        }
      }
    }

    if (this.timeDilationCooldown > 0) this.timeDilationCooldown -= deltaTime;

    // Auto-dash: trigger automatically when off cooldown, in the direction the
    // player is currently moving. If the player is standing still, skip (and
    // pause the cooldown) so the dash fires on their next movement.
    if (this.dashCooldown > 0) {
      this.dashCooldown -= deltaTime;
    } else if (speed > 10) {
      const dirAngle = Math.atan2(vy, vx);
      this.dashStrike(game, dirAngle);
    }

    // Auto-dilation: trigger the moment it comes off cooldown.
    if (!this.timeDilationActive && this.timeDilationCooldown <= 0) {
      this.activateTimeDilation(game);
    }

    if (this.timeDilationActive) {
      this.timeDilationDuration -= deltaTime;
      if (this.timeDilationDuration <= 0) {
        this.timeDilationActive = false;
        for (const enemy of enemies) {
          const ext = enemy as unknown as Record<string, number | undefined>;
          if (ext._originalSpeed) {
            enemy.speed = ext._originalSpeed as number;
            delete ext._originalSpeed;
          }
        }
      }
    }
  }

  dashStrike(game: GameAPI, directionAngle?: number): void {
    if (this.dashCooldown > 0) return;
    const player = game.getPlayer();
    if (!player || !player.alive) return;

    this.dashCooldown = this.dashCooldownMax;
    const angle = directionAngle !== undefined ? directionAngle : (player.aimAngle || 0);
    const dashDist = this.dashDistance;
    const oldX = player.position.x;
    const oldY = player.position.y;

    player.position.x += Math.cos(angle) * dashDist;
    player.position.y += Math.sin(angle) * dashDist;

    const canvas = game.getCanvas();
    const halfSize = player.size / 2;
    player.position.x = Math.max(halfSize, Math.min(canvas.logicalWidth - halfSize, player.position.x));
    player.position.y = Math.max(halfSize, Math.min(canvas.logicalHeight - halfSize, player.position.y));

    const enemies = game.getEnemies();
    const dx = player.position.x - oldX;
    const dy = player.position.y - oldY;
    const pathLen = Math.sqrt(dx * dx + dy * dy);

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.position.x - oldX;
      const ey = enemy.position.y - oldY;
      const t = Math.max(0, Math.min(1, (ex * dx + ey * dy) / (pathLen * pathLen)));
      const projX = oldX + t * dx;
      const projY = oldY + t * dy;
      const distToPath = Math.sqrt((enemy.position.x - projX) ** 2 + (enemy.position.y - projY) ** 2);

      if (distToPath < enemy.size + player.size) {
        const machDashMult = this.machBreakTimer > 0 ? 1.6 : 1;
        const damage = player.speed * 0.25 * machDashMult;
        enemy.takeDamage(damage);
        enemy.lastHitWeaponId = 'speedsterDash';
        game.recordDamage('speedsterDash', damage);
      }
    }

    const effects = game.getEffectsSystem();
    if (effects) {
      effects.addExplosion(player.position.x, player.position.y, 40, '#00DDFF');
    }

    if (this.dashStyle === 'phantom') {
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        this.afterimages.push({
          x: oldX + dx * t,
          y: oldY + dy * t,
          ttl: 3.0,
          size: player.size,
        });
      }
    } else if (this.dashStyle === 'overdrive') {
      this.overdriveStacks = Math.min(3, this.overdriveStacks + 1);
      this.overdriveTimer = 2;
    }
  }

  activateTimeDilation(game: GameAPI): void {
    if (this.timeDilationCooldown > 0 || this.timeDilationActive) return;
    this.timeDilationActive = true;
    this.timeDilationDuration = this.timeDilationMaxDuration;
    this.timeDilationCooldown = 20;
    const enemies = game.getEnemies();
    for (const enemy of enemies) {
      (enemy as unknown as Record<string, number>)._originalSpeed = enemy.speed;
      enemy.speed *= 0.1;
    }
    const effects = game.getEffectsSystem();
    const p = game.getPlayer();
    if (effects && p) {
      effects.floatingTexts.push({
        x: p.position.x,
        y: p.position.y - 30,
        text: 'TIME WARP',
        color: '#00DDFF',
        life: 1.5,
        fontSize: 16,
      });
    }
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;

    for (const img of this.afterimages) {
      const trailMult = this.machBreakTimer > 0 ? 0.7 : 0.4;
      const alpha = (img.ttl / this.afterimageTtl) * trailMult;
      ctx.fillStyle = this.machBreakTimer > 0
        ? `rgba(80, 220, 255, ${alpha})`
        : `rgba(0, 221, 255, ${alpha})`;
      ctx.fillRect(img.x - img.size / 2, img.y - img.size / 2, img.size, img.size);
    }

    if (this.timeDilationActive) {
      ctx.fillStyle = 'rgba(0, 100, 200, 0.05)';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // Speed lines (Mach Break particle trail)
    if (this.speedLines.length > 0) {
      ctx.lineWidth = 2;
      for (const sl of this.speedLines) {
        const a = Math.min(1, sl.ttl / 0.3);
        ctx.strokeStyle = `rgba(150, 240, 255, ${a * 0.85})`;
        const bx = sl.x - sl.vx * 0.03;
        const by = sl.y - sl.vy * 0.03;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(sl.x, sl.y);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    // Mach Break pulsing outline
    if (this.machBreakTimer > 0) {
      const pulse = Math.sin(Date.now() * 0.02) * 0.35 + 0.55;
      ctx.strokeStyle = `rgba(80, 220, 255, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 3,
        player.position.y - player.size / 2 - 3,
        player.size + 6,
        player.size + 6
      );
    } else if (this.velocity >= this.getEffectiveVelocityMax() * 0.75) {
      const pulse = Math.sin(Date.now() * 0.012) * 0.15 + 0.25;
      ctx.strokeStyle = `rgba(0, 221, 255, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 2,
        player.position.y - player.size / 2 - 2,
        player.size + 4,
        player.size + 4
      );
    }

    // Velocity bar (mirrors Fighter's momentum bar placement)
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);
    const vpct = Math.min(1, this.velocity / this.getEffectiveVelocityMax());
    if (this.machBreakTimer > 0) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#66EEFF' : '#00DDFF';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (vpct > 0) {
      ctx.fillStyle = '#00DDFF';
      ctx.fillRect(barX, barY, barW * vpct, barH);
    }
    if (this.machBreakFlash > 0) {
      const flashA = this.machBreakFlash / 0.5;
      ctx.fillStyle = `rgba(80, 220, 255, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }
    ctx.strokeStyle = vpct > 0.8 ? '#66EEFF' : '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    const vLabelY = barY + barH + 9;
    if (this.machBreakTimer > 0) {
      ctx.fillStyle = '#66EEFF';
      ctx.fillText(`MACH BREAK ${this.machBreakTimer.toFixed(1)}s`, player.position.x, vLabelY);
    } else {
      ctx.fillStyle = '#00DDFF';
      ctx.fillText(`Velocity ${Math.floor(vpct * 100)}%`, player.position.x, vLabelY);
    }

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const y1 = player.position.y + player.size / 2 + 30;
    const y2 = y1 + 12;

    if (this.dashCooldown > 0) {
      ctx.fillStyle = '#666666';
      ctx.fillText(`DASH ${this.dashCooldown.toFixed(1)}s`, player.position.x, y1);
    } else {
      ctx.fillStyle = '#00DDFF';
      ctx.fillText('DASH READY', player.position.x, y1);
    }

    if (this.timeDilationActive) {
      ctx.fillStyle = '#00FFFF';
      ctx.fillText(`WARP ${this.timeDilationDuration.toFixed(1)}s`, player.position.x, y2);
    } else if (this.timeDilationCooldown > 0) {
      ctx.fillStyle = '#666666';
      ctx.fillText(`WARP ${this.timeDilationCooldown.toFixed(1)}s`, player.position.x, y2);
    }

    if (this.dashStyle === 'overdrive' && this.overdriveStacks > 0) {
      ctx.fillStyle = '#FFAA00';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`OVERDRIVE x${this.overdriveStacks}`, player.position.x, y2 + 12);
    }
  }
}
