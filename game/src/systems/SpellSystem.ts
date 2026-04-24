import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { GameAPI, Vec2 } from '../types';
import { BALANCE } from '../config/balance';

interface SpellConfig {
  name: string;
  cooldown: number;
  damage: number;
}

// Default per-level scaling when a spell is not listed in BALANCE.spells.
const DEFAULT_SPELL_SCALING = {
  damageScalePerLevel: 0.30,
  cooldownScalePerLevel: 0,
  radiusScalePerLevel: 0,
  jumpsPerLevel: 0,
  meteorsPerLevel: 0,
  durationPerLevel: 0,
};

export function getSpellScaling(id: string): Record<string, number> {
  const cfg = (BALANCE as unknown as Record<string, Record<string, Record<string, number>>>).spells;
  const base = cfg?.[id] || {};
  return { ...DEFAULT_SPELL_SCALING, ...base } as Record<string, number>;
}

export class Spell {
  id: string;
  name: string;
  cooldownDuration: number;
  currentCooldown: number;
  baseDamage: number;
  level: number;
  config: SpellConfig;
  spellPowerBonus: number;

  constructor(id: string, config: SpellConfig, level: number = 1) {
    this.id = id;
    this.name = config.name;
    this.baseDamage = config.damage;
    this.level = level;
    this.config = config;
    this.spellPowerBonus = 0;
    // Apply per-level cooldown scaling from BALANCE.spells (e.g. -0.05 => -5% cd per level beyond 1).
    const scaling = getSpellScaling(id);
    const cdScale = scaling.cooldownScalePerLevel || 0;
    const cdMult = Math.max(0.1, 1 + (level - 1) * cdScale);
    this.cooldownDuration = config.cooldown * cdMult;
    this.currentCooldown = 0;
  }

  getDamage(): number {
    const scaling = getSpellScaling(this.id);
    const dScale = scaling.damageScalePerLevel ?? 0.3;
    return this.baseDamage * (1 + (this.level - 1) * dScale) * (1 + (this.spellPowerBonus || 0));
  }

  isReady(): boolean {
    return this.currentCooldown <= 0;
  }

  cast(game: GameAPI): boolean {
    if (!this.isReady()) return false;
    this.currentCooldown = this.cooldownDuration;
    this.onCast(game);
    return true;
  }

  update(deltaTime: number): void {
    if (this.currentCooldown > 0) {
      this.currentCooldown -= deltaTime;
    }
  }

  getCooldownPercent(): number {
    if (this.cooldownDuration <= 0) return 0;
    return Math.max(0, this.currentCooldown / this.cooldownDuration);
  }

  onCast(_game: GameAPI): void {}
  onRender(_ctx: CanvasRenderingContext2D, _player: Player): void {}
}

interface MissileProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: Enemy | null;
  life: number;
  trail: Float32Array;
  trailHead: number;
  trailCount: number;
  color: string;
  trailColor: string;
}

export class MagicMissile extends Spell {
  projectiles: MissileProjectile[];
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('magicMissile', { name: 'Magic Missile',cooldown: 0.8, damage: 1.2 }, level);
    this.projectiles = [];
    this._game = null;
  }

  static MAX_BOLTS = 8;

  getDamage(): number {
    const scaling = getSpellScaling(this.id);
    const dScale = scaling.damageScalePerLevel ?? 0.10;
    return this.baseDamage * (1 + (this.level - 1) * dScale) * (1 + (this.spellPowerBonus || 0));
  }

  static BOLT_COLORS: string[][] = [
    ['#88CCFF', '#64B4FF'],
    ['#CC88FF', '#A064FF'],
    ['#88FFCC', '#64FFB4'],
    ['#FFCC88', '#FFB464'],
    ['#FF88CC', '#FF64A0'],
    ['#CCFF88', '#B4FF64'],
    ['#88FFFF', '#64FFFF'],
    ['#FFFF88', '#FFFF64'],
  ];

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    const enemies = game.getEnemies();
    if (!player || enemies.length === 0) return;

    const px = player.position.x, py = player.position.y;
    const bolts = Math.min(MagicMissile.MAX_BOLTS, this.level);

    const sorted: { enemy: Enemy; distSq: number }[] = [];
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - px, dy = e.position.y - py;
      sorted.push({ enemy: e, distSq: dx * dx + dy * dy });
    }
    if (sorted.length === 0) return;
    sorted.sort((a, b) => a.distSq - b.distSq);

    for (let b = 0; b < bolts; b++) {
      const target = sorted[b % sorted.length].enemy;
      const angle = Math.atan2(target.position.y - py, target.position.x - px);
      const spread = bolts > 1 ? (b / (bolts - 1) - 0.5) * 0.3 : 0;
      const trail = new Float32Array(24);
      const colors = MagicMissile.BOLT_COLORS[b % MagicMissile.BOLT_COLORS.length];
      this.projectiles.push({
        x: px, y: py,
        vx: Math.cos(angle + spread) * 400,
        vy: Math.sin(angle + spread) * 400,
        target,
        life: 2,
        trail, trailHead: 0, trailCount: 0,
        color: colors[0], trailColor: colors[1],
      });
    }
    this._game = game;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    const player = this._game?.getPlayer();
    let n = this.projectiles.length;
    for (let i = n - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let orbiting = false;

      if (p.target && p.target.alive) {
        const dx = p.target.position.x - p.x;
        const dy = p.target.position.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 225) {
          const dmg = this.getDamage();
          const eff = Math.min(p.target.health, dmg);
          p.target.takeDamage(dmg);
          p.target.lastHitWeaponId = 'magicMissile';
          if (this._game) {
            if (eff > 0) this._game.recordDamage('magicMissile', eff);
            this._game.getEffectsSystem().addImpactEffect(p.x, p.y, p.color);
          }
          this.projectiles[i] = this.projectiles[--n];
          continue;
        }
        const angle = Math.atan2(dy, dx);
        p.vx = Math.cos(angle) * 400;
        p.vy = Math.sin(angle) * 400;
      } else if (this._game) {
        const enemies = this._game.getEnemies();
        let closest: Enemy | null = null;
        let minDistSq = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.position.x - p.x;
          const dy = e.position.y - p.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) { minDistSq = dSq; closest = e; }
        }
        if (closest) {
          p.target = closest;
          const angle = Math.atan2(closest.position.y - p.y, closest.position.x - p.x);
          p.vx = Math.cos(angle) * 400;
          p.vy = Math.sin(angle) * 400;
        } else if (player && player.alive) {
          orbiting = true;
          const orbitRadius = 40;
          const orbitSpeed = 5;
          const dx = p.x - player.position.x;
          const dy = p.y - player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const currentAngle = Math.atan2(dy, dx);

          if (dist < orbitRadius - 5 || dist > orbitRadius + 20) {
            const targetX = player.position.x + Math.cos(currentAngle) * orbitRadius;
            const targetY = player.position.y + Math.sin(currentAngle) * orbitRadius;
            const pullAngle = Math.atan2(targetY - p.y, targetX - p.x);
            p.vx = Math.cos(pullAngle) * 200;
            p.vy = Math.sin(pullAngle) * 200;
          } else {
            const tangentAngle = currentAngle + Math.PI / 2;
            p.vx = Math.cos(tangentAngle) * orbitRadius * orbitSpeed;
            p.vy = Math.sin(tangentAngle) * orbitRadius * orbitSpeed;
          }
        }
      }

      if (orbiting) {
        p.life = Math.max(p.life, 1);
      } else {
        p.life -= deltaTime;
      }

      const idx = p.trailHead * 3;
      p.trail[idx] = p.x;
      p.trail[idx + 1] = p.y;
      p.trail[idx + 2] = 0.2;
      p.trailHead = (p.trailHead + 1) % 8;
      if (p.trailCount < 8) p.trailCount++;

      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      if (p.life <= 0) {
        this.projectiles[i] = this.projectiles[--n];
      }
    }
    this.projectiles.length = n;
    for (const p of this.projectiles) {
      for (let j = 0; j < p.trailCount; j++) {
        p.trail[j * 3 + 2] -= deltaTime;
      }
    }
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    const prevAlpha = ctx.globalAlpha;
    for (const p of this.projectiles) {
      ctx.fillStyle = p.trailColor;
      for (let j = 0; j < p.trailCount; j++) {
        const base = j * 3;
        const life = p.trail[base + 2];
        if (life <= 0) continue;
        ctx.globalAlpha = (life / 0.2) * 0.5;
        ctx.fillRect(p.trail[base] - 2, p.trail[base + 1] - 2, 4, 4);
      }
      ctx.globalAlpha = prevAlpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

interface FireballProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  trail: Float32Array;
  trailHead: number;
  trailCount: number;
}

interface Explosion {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

interface BurningZone {
  x: number;
  y: number;
  radius: number;
  life: number;
  tickTimer: number;
  dmgPerTick: number;
}

export class Fireball extends Spell {
  projectiles: FireballProjectile[];
  explosions: Explosion[];
  burningZones: BurningZone[];
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('fireball', { name: 'Fireball',cooldown: 3, damage: 3.0 }, level);
    this.projectiles = [];
    this.explosions = [];
    this.burningZones = [];
    this._game = null;
  }

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    const enemies = game.getEnemies();
    if (!player || enemies.length === 0) return;

    let closest: Enemy | null = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y);
      if (d < minDist) { minDist = d; closest = e; }
    }
    if (!closest) return;

    const angle = Math.atan2(closest.position.y - player.position.y, closest.position.x - player.position.x);
    const trail = new Float32Array(36);
    this.projectiles.push({
      x: player.position.x, y: player.position.y,
      vx: Math.cos(angle) * 250, vy: Math.sin(angle) * 250,
      life: 1.0, trail, trailHead: 0, trailCount: 0,
    });
    this._game = game;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= deltaTime;
      const idx = p.trailHead * 3;
      p.trail[idx] = p.x;
      p.trail[idx + 1] = p.y;
      p.trail[idx + 2] = 0.3;
      p.trailHead = (p.trailHead + 1) % 12;
      if (p.trailCount < 12) p.trailCount++;
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      let hit = false;
      if (this._game) {
        for (const e of this._game.getEnemies()) {
          if (!e.alive) continue;
          if (Math.hypot(e.position.x - p.x, e.position.y - p.y) < 20) { hit = true; break; }
        }
      }

      if (hit || p.life <= 0) {
        this.detonate(p.x, p.y);
        this.projectiles.splice(i, 1);
      }
    }
    for (const p of this.projectiles) {
      for (let j = 0; j < p.trailCount; j++) {
        p.trail[j * 3 + 2] -= deltaTime;
      }
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].life -= deltaTime;
      if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
    }
    for (let i = this.burningZones.length - 1; i >= 0; i--) {
      const z = this.burningZones[i];
      z.life -= deltaTime;
      z.tickTimer -= deltaTime;
      if (z.tickTimer <= 0 && this._game) {
        z.tickTimer = 0.5;
        const enemies = this._game.getEnemies();
        let totalDealt = 0;
        for (const e of enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.position.x - z.x, e.position.y - z.y) <= z.radius) {
            totalDealt += Math.min(e.health, z.dmgPerTick);
            e.takeDamage(z.dmgPerTick);
            e.lastHitWeaponId = 'fireball';
          }
        }
        if (totalDealt > 0) this._game.recordDamage('fireball', totalDealt);
      }
      if (z.life <= 0) this.burningZones.splice(i, 1);
    }
  }

  detonate(x: number, y: number): void {
    if (!this._game) return;
    const enemies = this._game.getEnemies();
    const dmg = this.getDamage();
    const ext = this as unknown as Record<string, number>;
    const aoeBonus = ext._aoeBonus || 0;
    const frozenMult = ext._frozenDmgMult || 1.0;
    const scaling = getSpellScaling(this.id);
    const radiusScale = 1 + (this.level - 1) * (scaling.radiusScalePerLevel || 0);
    const radius = (60 + this.level * 10) * radiusScale * (1 + aoeBonus);
    let totalDealt = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - x, e.position.y - y);
      if (d <= radius) {
        const isFrozen = ((e as unknown as Record<string, number>)._frozenTimer || 0) > 0;
        const finalDmg = isFrozen ? dmg * frozenMult : dmg;
        totalDealt += Math.min(e.health, finalDmg);
        e.takeDamage(finalDmg);
        e.lastHitWeaponId = 'fireball';
      }
    }
    if (totalDealt > 0) this._game.recordDamage('fireball', totalDealt);
    this.explosions.push({ x, y, radius, life: 0.4, maxLife: 0.4 });
    const fx = this._game.getEffectsSystem();
    fx.addExplosionEffect(x, y, radius);
    fx.addScreenShake(4, 0.2, 'medium');
    if (this.level >= 4) {
      this.burningZones.push({
        x, y, radius: radius * 0.7,
        life: 3, tickTimer: 0.5, dmgPerTick: dmg * 0.2
      });
    }
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    for (const p of this.projectiles) {
      for (let j = 0; j < p.trailCount; j++) {
        const base = j * 3;
        const life = p.trail[base + 2];
        if (life <= 0) continue;
        const a = life / 0.3;
        ctx.fillStyle = `rgba(255, 100, 0, ${a * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.trail[base], p.trail[base + 1], 4 * a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of this.explosions) {
      const t = e.life / e.maxLife;
      ctx.strokeStyle = `rgba(255, 100, 0, ${t})`;
      ctx.lineWidth = 3 * t;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (1 - t * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 200, 0, ${t * 0.2})`;
      ctx.fill();
    }
    for (const z of this.burningZones) {
      const a = Math.min(1, z.life / 1.0) * 0.2;
      const flicker = Math.sin(Date.now() * 0.01 + z.x) * 0.05;
      ctx.fillStyle = `rgba(255, 80, 0, ${a + flicker})`;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 150, 0, ${a * 1.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

interface ChainPoint {
  points: Vec2[];
  life: number;
}

export class ChainLightningSpell extends Spell {
  chains: ChainPoint[];

  constructor(level: number = 1) {
    super('chainLightning', { name: 'Chain Lightning',cooldown: 4, damage: 2.0 }, level);
    this.chains = [];
  }

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    const enemies = game.getEnemies();
    if (!player || enemies.length === 0) return;

    const ext = this as unknown as Record<string, number>;
    const extraJumps = ext._extraJumps || 0;
    const cdrPerJump = ext._cdrPerJump || 0;
    const chainScaling = getSpellScaling(this.id);
    const jumpsPerLevel = chainScaling.jumpsPerLevel ?? 1;
    const jumps = 5 + Math.floor(this.level * jumpsPerLevel) + extraJumps;
    let dmg = this.getDamage();
    const hit = new Set<Enemy>();
    const points: Vec2[] = [{ x: player.position.x, y: player.position.y }];

    const startTargets: Enemy[] = [];
    if (this.level >= 4) {
      const sorted = enemies.filter(e => e.alive).sort((a, b) => {
        const da = Math.hypot(a.position.x - player.position.x, a.position.y - player.position.y);
        const db = Math.hypot(b.position.x - player.position.x, b.position.y - player.position.y);
        return da - db;
      });
      if (sorted.length >= 2) { startTargets.push(sorted[0], sorted[1]); }
      else if (sorted.length === 1) { startTargets.push(sorted[0]); }
    } else {
      let closest: Enemy | null = null;
      let minDist2 = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y);
        if (d < minDist2) { minDist2 = d; closest = e; }
      }
      if (closest) startTargets.push(closest);
    }

    let totalDealt = 0;
    let totalCdr = 0;
    const fx = game.getEffectsSystem();
    for (const startEnemy of startTargets) {
      const forkHit = new Set<Enemy>(hit);
      let forkDmg = dmg;
      let current: Enemy | null = startEnemy;
      let prevX = player.position.x;
      let prevY = player.position.y;
      for (let i = 0; i < jumps && current; i++) {
        totalDealt += Math.min(current.health, forkDmg);
        current.takeDamage(forkDmg);
        current.lastHitWeaponId = 'chainLightning';
        forkHit.add(current);
        hit.add(current);
        points.push({ x: current.position.x, y: current.position.y });
        fx.addChainLightningEffect(prevX, prevY, current.position.x, current.position.y);
        prevX = current.position.x;
        prevY = current.position.y;
        forkDmg *= 0.8;
        totalCdr += cdrPerJump;

        let next: Enemy | null = null;
        let nextDist = Infinity;
        for (const e of enemies) {
          if (!e.alive || forkHit.has(e)) continue;
          const d = Math.hypot(e.position.x - current!.position.x, e.position.y - current!.position.y);
          if (d < nextDist && d < 200) { nextDist = d; next = e; }
        }
        current = next;
      }
    }
    if (totalDealt > 0) game.recordDamage('chainLightning', totalDealt);
    if (totalCdr > 0) {
      (this as unknown as Record<string, number>)._pendingCdr = totalCdr;
    }

    if (points.length > 1) {
      this.chains.push({ points, life: 0.4 });
    }
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    for (let i = this.chains.length - 1; i >= 0; i--) {
      this.chains[i].life -= deltaTime;
      if (this.chains[i].life <= 0) this.chains.splice(i, 1);
    }
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    for (const chain of this.chains) {
      const a = chain.life / 0.4;
      ctx.strokeStyle = `rgba(100, 200, 255, ${a})`;
      ctx.lineWidth = 2 + a * 2;
      ctx.beginPath();
      for (let i = 0; i < chain.points.length; i++) {
        const p = chain.points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          const prev = chain.points[i - 1];
          const mx = (prev.x + p.x) / 2 + (Math.random() - 0.5) * 20 * a;
          const my = (prev.y + p.y) / 2 + (Math.random() - 0.5) * 20 * a;
          ctx.lineTo(mx, my);
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }
  }
}

interface Nova {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

export class IceNova extends Spell {
  novas: Nova[];

  constructor(level: number = 1) {
    super('iceNova', { name: 'Ice Nova',cooldown: 6, damage: 1.0 }, level);
    this.novas = [];
  }

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    const enemies = game.getEnemies();
    if (!player) return;

    const novaScaling = getSpellScaling(this.id);
    const novaRadiusScale = 1 + (this.level - 1) * (novaScaling.radiusScalePerLevel || 0);
    const radius = (120 + this.level * 20) * novaRadiusScale;
    const dmg = this.getDamage();
    const freezeBonus = (this as unknown as Record<string, number>)._freezeDurationBonus || 0;
    const freezeDuration = (2 + this.level * 0.5) * (1 + freezeBonus);
    let totalDealt = 0;

    const fx = game.getEffectsSystem();
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y);
      if (d <= radius) {
        totalDealt += Math.min(e.health, dmg);
        e.takeDamage(dmg);
        e.lastHitWeaponId = 'iceNova';
        const eExt = e as unknown as Record<string, number | undefined>;
        eExt._frozenTimer = freezeDuration;
        if (eExt._frozenOriginalSpeed === undefined || eExt._frozenOriginalSpeed === 0) {
          eExt._frozenOriginalSpeed = (eExt._timeWarpSpeed as number | undefined) || e.speed;
        }
        e.speed = 0;
        fx.addImpactEffect(e.position.x, e.position.y, '#88DDFF');
      }
    }
    if (totalDealt > 0) game.recordDamage('iceNova', totalDealt);
    this.novas.push({ x: player.position.x, y: player.position.y, radius, life: 0.5, maxLife: 0.5 });
    fx.addScreenShake(3, 0.15, 'medium');
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    for (let i = this.novas.length - 1; i >= 0; i--) {
      this.novas[i].life -= deltaTime;
      if (this.novas[i].life <= 0) this.novas.splice(i, 1);
    }
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    for (const n of this.novas) {
      const t = 1 - n.life / n.maxLife;
      const r = n.radius * t;
      ctx.strokeStyle = `rgba(136, 221, 255, ${1 - t})`;
      ctx.lineWidth = 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(136, 221, 255, ${(1 - t) * 0.1})`;
      ctx.fill();
    }
  }
}

interface TeleportFlash {
  x: number;
  y: number;
  life: number;
  arrival?: boolean;
  radius?: number;
}

export class TeleportSpell extends Spell {
  flashes: TeleportFlash[];
  charging: boolean;
  chargeTimer: number;
  previewX: number;
  previewY: number;
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('teleport', { name: 'Teleport',cooldown: 5, damage: 2.0 }, level);
    this.flashes = [];
    this.charging = false;
    this.chargeTimer = 0;
    this.previewX = 0;
    this.previewY = 0;
    this._game = null;
  }

  onCast(game: GameAPI): void {
    this._game = game;
    const player = game.getPlayer();
    if (!player) return;
    this.charging = true;
    this.chargeTimer = 0.5;
    this._updatePreviewPosition(player, game);
  }

  _updatePreviewPosition(player: Player, game: GameAPI): void {
    const vx = player.velocity.x;
    const vy = player.velocity.y;
    let angle: number;
    if (vx !== 0 || vy !== 0) {
      angle = Math.atan2(vy, vx);
    } else {
      angle = player.aimAngle || 0;
    }
    const dist = 150 + this.level * 30;
    let px = player.position.x + Math.cos(angle) * dist;
    let py = player.position.y + Math.sin(angle) * dist;

    const canvas = game.getCanvas();
    px = Math.max(player.size / 2, Math.min(canvas.logicalWidth - player.size / 2, px));
    py = Math.max(player.size / 2, Math.min(canvas.logicalHeight - player.size / 2, py));
    this.previewX = px;
    this.previewY = py;
  }

  _executeTeleport(): void {
    if (!this._game) return;
    const player = this._game.getPlayer();
    const enemies = this._game.getEnemies();
    if (!player) return;

    const startX = player.position.x;
    const startY = player.position.y;

    this._updatePreviewPosition(player, this._game);
    player.position.x = this.previewX;
    player.position.y = this.previewY;

    const dmg = this.getDamage();
    const tScaling = getSpellScaling(this.id);
    const tRadiusScale = 1 + (this.level - 1) * (tScaling.radiusScalePerLevel || 0);
    const radius = (40 + this.level * 10) * tRadiusScale;
    let totalDealt = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y);
      if (d <= radius) {
        totalDealt += Math.min(e.health, dmg);
        e.takeDamage(dmg);
        e.lastHitWeaponId = 'teleport';
      }
    }
    if (totalDealt > 0) this._game.recordDamage('teleport', totalDealt);
    this.flashes.push({ x: startX, y: startY, life: 0.3 });
    this.flashes.push({ x: player.position.x, y: player.position.y, life: 0.3, arrival: true, radius });
    const fx = this._game.getEffectsSystem();
    fx.addImpactEffect(startX, startY, '#9944FF');
    fx.addImpactEffect(player.position.x, player.position.y, '#CC88FF');
    (player as unknown as Record<string, number>)._teleportInvuln = 0.2;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.charging) {
      if (this._game) {
        const player = this._game.getPlayer();
        if (player) this._updatePreviewPosition(player, this._game);
      }
      this.chargeTimer -= deltaTime;
      if (this.chargeTimer <= 0) {
        this.charging = false;
        this._executeTeleport();
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= deltaTime;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (this.charging && player) {
      const pulse = Math.sin(Date.now() * 0.02) * 0.3 + 0.5;
      ctx.strokeStyle = `rgba(153, 68, 255, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(this.previewX, this.previewY, player.size * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(153, 68, 255, ${pulse * 0.3})`;
      ctx.fillRect(this.previewX - player.size / 2, this.previewY - player.size / 2, player.size, player.size);
      ctx.setLineDash([]);
    }
    for (const f of this.flashes) {
      const a = f.life / 0.3;
      if (f.arrival) {
        ctx.strokeStyle = `rgba(153, 68, 255, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, (f.radius || 40) * (1 - a * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(153, 68, 255, ${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 15 * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

interface Meteor {
  targetX: number;
  targetY: number;
  delay: number;
  fired: boolean;
}

interface Impact {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

export class MeteorStorm extends Spell {
  meteors: Meteor[];
  impacts: Impact[];
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('meteorStorm', { name: 'Meteor Storm',cooldown: 12, damage: 5.0 }, level);
    this.meteors = [];
    this.impacts = [];
    this._game = null;
  }

  onCast(game: GameAPI): void {
    const canvas = game.getCanvas();
    const msScaling = getSpellScaling(this.id);
    const meteorsPerLevel = msScaling.meteorsPerLevel ?? 1;
    const count = Math.min(10, 5 + Math.floor((this.level - 1) * meteorsPerLevel));
    for (let i = 0; i < count; i++) {
      this.meteors.push({
        targetX: Math.random() * canvas.logicalWidth,
        targetY: Math.random() * canvas.logicalHeight,
        delay: i * 0.4,
        fired: false,
      });
    }
    this._game = game;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.delay -= deltaTime;
      if (m.delay <= 0 && !m.fired) {
        m.fired = true;
        this.detonateMeteor(m);
        this.meteors.splice(i, 1);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].life -= deltaTime;
      if (this.impacts[i].life <= 0) this.impacts.splice(i, 1);
    }
  }

  detonateMeteor(m: Meteor): void {
    if (!this._game) return;
    const enemies = this._game.getEnemies();
    const dmg = this.getDamage();
    const radius = 80;
    let totalDealt = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - m.targetX, e.position.y - m.targetY);
      if (d <= radius) {
        totalDealt += Math.min(e.health, dmg);
        e.takeDamage(dmg);
        e.lastHitWeaponId = 'meteorStorm';
      }
    }
    if (totalDealt > 0) this._game.recordDamage('meteorStorm', totalDealt);
    this.impacts.push({ x: m.targetX, y: m.targetY, radius, life: 0.5, maxLife: 0.5 });
    const fx = this._game.getEffectsSystem();
    fx.addExplosionEffect(m.targetX, m.targetY, radius);
    fx.addScreenShake(5, 0.2, 'high');
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    for (const m of this.meteors) {
      if (m.delay < 1.5) {
        const a = Math.min(1, 1.5 - m.delay);
        const pulse = (Math.sin(Date.now() * 0.02) + 1) * 0.5;
        ctx.strokeStyle = `rgba(255, 100, 0, ${a * (0.5 + pulse * 0.4)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.targetX, m.targetY, 24 + pulse * 8, 0, Math.PI * 2);
        ctx.stroke();
        // Crosshair
        ctx.beginPath();
        ctx.moveTo(m.targetX - 14, m.targetY);
        ctx.lineTo(m.targetX + 14, m.targetY);
        ctx.moveTo(m.targetX, m.targetY - 14);
        ctx.lineTo(m.targetX, m.targetY + 14);
        ctx.stroke();
        // Falling streak from above
        if (m.delay < 0.5) {
          const streakLen = (0.5 - m.delay) * 600;
          ctx.strokeStyle = `rgba(255, 180, 60, ${a})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(m.targetX, m.targetY - streakLen);
          ctx.lineTo(m.targetX, m.targetY);
          ctx.stroke();
        }
      }
    }
    for (const imp of this.impacts) {
      const t = 1 - imp.life / imp.maxLife;
      ctx.fillStyle = `rgba(255, 100, 0, ${(1 - t) * 0.3})`;
      ctx.beginPath();
      ctx.arc(imp.x, imp.y, imp.radius * (0.5 + t * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 200, 0, ${1 - t})`;
      ctx.lineWidth = 3 * (1 - t);
      ctx.stroke();
    }
  }
}

export class ShieldBubble extends Spell {
  shieldActive: boolean;
  _game: GameAPI | null;
  bounceFlash: number;

  constructor(level: number = 1) {
    super('shieldBubble', { name: 'Shield Bubble', cooldown: 15, damage: 0 }, level);
    this.shieldActive = false;
    this._game = null;
    this.bounceFlash = 0;
  }

  onCast(game: GameAPI): void {
    this._game = game;
    this.shieldActive = true;
    const player = game.getPlayer();
    if (player) (player as unknown as Record<string, unknown>)._shieldBubble = this;
  }

  consumeShield(enemy: Enemy): boolean {
    if (!this.shieldActive) return false;
    if ((enemy as unknown as Record<string, boolean>).isBoss) return false;

    this.shieldActive = false;
    this.bounceFlash = 0.4;
    if (this._game) {
      const player = this._game.getPlayer();
      if (player) {
        (player as unknown as Record<string, unknown>)._shieldBubble = null;
        const dx = enemy.position.x - player.position.x;
        const dy = enemy.position.y - player.position.y;
        const dist = Math.hypot(dx, dy) || 1;
        const knockback = 200;
        enemy.position.x += (dx / dist) * knockback;
        enemy.position.y += (dy / dist) * knockback;
        const fx = this._game.getEffectsSystem();
        fx.addImpactEffect(enemy.position.x, enemy.position.y, '#66CCFF');
        fx.addScreenShake(3, 0.15, 'medium');
      }
    }
    return true;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.bounceFlash > 0) this.bounceFlash -= deltaTime;
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;
    if (this.bounceFlash > 0) {
      const a = this.bounceFlash / 0.4;
      ctx.strokeStyle = `rgba(100, 200, 255, ${a})`;
      ctx.lineWidth = 4 * a;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, player.size * (0.8 + (1 - a) * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!this.shieldActive) return;
    const pulse = Math.sin(Date.now() * 0.005) * 0.15 + 0.7;
    ctx.strokeStyle = `rgba(100, 200, 255, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, player.size * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(100, 200, 255, 0.08)`;
    ctx.fill();
  }
}

export class ArcaneBeam extends Spell {
  beamTarget: Vec2;
  _playerPos: Vec2;
  beamTimer: number;

  constructor(level: number = 1) {
    super('arcaneBeam', { name: 'Arcane Beam',cooldown: 0.1, damage: 3.0 }, level);
    this.beamTarget = { x: 0, y: 0 };
    this._playerPos = { x: 0, y: 0 };
    this.beamTimer = 0;
  }

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    const enemies = game.getEnemies();
    if (!player || enemies.length === 0) return;

    let closest: Enemy | null = null;
    let minDistSq = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - player.position.x;
      const dy = e.position.y - player.position.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) { minDistSq = dSq; closest = e; }
    }
    if (closest) {
      const dmg = this.getDamage() * 0.2;
      const effPrimary = Math.min(closest.health, dmg);
      closest.takeDamage(dmg);
      closest.lastHitWeaponId = 'arcaneBeam';
      if (effPrimary > 0) game.recordDamage('arcaneBeam', effPrimary);
      this.beamTarget.x = closest.position.x;
      this.beamTarget.y = closest.position.y;
      this.beamTimer = 0.1;

      if (this.level >= 3) {
        const px = player.position.x, py = player.position.y;
        const angle = Math.atan2(closest.position.y - py, closest.position.x - px);
        const pierceDmg = dmg * 0.5;
        for (const e of enemies) {
          if (e === closest || !e.alive) continue;
          const dx = e.position.x - px, dy = e.position.y - py;
          const dot = dx * Math.cos(angle) + dy * Math.sin(angle);
          if (dot <= 0) continue;
          const cross = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
          if (cross < 20) {
            const effPierce = Math.min(e.health, pierceDmg);
            e.takeDamage(pierceDmg);
            e.lastHitWeaponId = 'arcaneBeam';
            if (effPierce > 0) game.recordDamage('arcaneBeam', effPierce);
          }
        }
      }
    }
    this._playerPos.x = player.position.x;
    this._playerPos.y = player.position.y;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.beamTimer > 0) this.beamTimer -= deltaTime;
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    if (this.beamTimer <= 0) return;
    const a = Math.max(0.5, this.beamTimer / 0.1);
    const pulse = (Math.sin(Date.now() * 0.04) + 1) * 0.5;
    const dx = this.beamTarget.x - this._playerPos.x;
    const dy = this.beamTarget.y - this._playerPos.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const wobble = Math.sin(Date.now() * 0.03) * 4;
    const midX = (this._playerPos.x + this.beamTarget.x) / 2 + nx * wobble;
    const midY = (this._playerPos.y + this.beamTarget.y) / 2 + ny * wobble;
    // Outer glow
    ctx.strokeStyle = `rgba(200, 100, 255, ${a * 0.25})`;
    ctx.lineWidth = 8 + pulse * 3 + (this.level >= 3 ? 3 : 0);
    ctx.beginPath();
    ctx.moveTo(this._playerPos.x, this._playerPos.y);
    ctx.quadraticCurveTo(midX, midY, this.beamTarget.x, this.beamTarget.y);
    ctx.stroke();
    // Core beam
    ctx.strokeStyle = `rgba(220, 150, 255, ${a * 0.9})`;
    ctx.lineWidth = 2 + pulse * 1.5 + (this.level >= 3 ? 2 : 0);
    ctx.beginPath();
    ctx.moveTo(this._playerPos.x, this._playerPos.y);
    ctx.quadraticCurveTo(midX, midY, this.beamTarget.x, this.beamTarget.y);
    ctx.stroke();
    // Inner white
    ctx.strokeStyle = `rgba(255, 230, 255, ${a * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this._playerPos.x, this._playerPos.y);
    ctx.quadraticCurveTo(midX, midY, this.beamTarget.x, this.beamTarget.y);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 200, 255, ${a})`;
    ctx.beginPath();
    ctx.arc(this.beamTarget.x, this.beamTarget.y, 6 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class TimeWarp extends Spell {
  warpActive: boolean;
  warpTimer: number;
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('timeWarp', { name: 'Time Warp',cooldown: 20, damage: 0 }, level);
    this.warpActive = false;
    this.warpTimer = 0;
    this._game = null;
  }

  onCast(game: GameAPI): void {
    this.warpActive = true;
    const twScaling = getSpellScaling(this.id);
    const twDur = twScaling.durationPerLevel ?? 1;
    this.warpTimer = 5 + this.level * twDur;
    this._game = game;
    const enemies = game.getEnemies();
    for (const e of enemies) {
      const ext = e as unknown as Record<string, number>;
      // Capture true original speed even if currently frozen/slowed by another effect
      if (!ext._timeWarpSpeed) {
        ext._timeWarpSpeed = (ext._frozenOriginalSpeed as number | undefined) || e.speed;
      }
      e.speed *= 0.25;
    }
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.warpActive) {
      this.warpTimer -= deltaTime;
      if (this.warpTimer <= 0) {
        this.warpActive = false;
        if (this._game) {
          const enemies = this._game.getEnemies();
          for (const e of enemies) {
            const ext = e as unknown as Record<string, number | undefined>;
            if (ext._timeWarpSpeed) {
              if (ext._frozenTimer && (ext._frozenTimer as number) > 0) {
                ext._frozenOriginalSpeed = ext._timeWarpSpeed;
              } else {
                e.speed = ext._timeWarpSpeed as number;
              }
              delete ext._timeWarpSpeed;
            }
          }
        }
      }
    }
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!this.warpActive || !player) return;
    // World tint overlay (slight blue-desaturation feel).
    // Use logical dims (ctx is pre-scaled by DPR); canvas.width is physical px.
    const canvas = ctx.canvas as unknown as { logicalWidth?: number; logicalHeight?: number; width: number; height: number };
    const w = canvas.logicalWidth ?? canvas.width;
    const h = canvas.logicalHeight ?? canvas.height;
    ctx.fillStyle = 'rgba(80, 140, 220, 0.08)';
    ctx.fillRect(0, 0, w, h);
    // Player halo clock
    const pulse = Math.sin(Date.now() * 0.006) * 0.15 + 0.35;
    ctx.strokeStyle = `rgba(180, 220, 255, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, 60, 0, Math.PI * 2);
    ctx.stroke();
    // Clock hand
    const handAngle = Date.now() * 0.0008;
    ctx.strokeStyle = `rgba(220, 240, 255, ${pulse * 1.2})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(player.position.x, player.position.y);
    ctx.lineTo(player.position.x + Math.cos(handAngle) * 55, player.position.y + Math.sin(handAngle) * 55);
    ctx.stroke();
  }
}

export class SummonFamiliar extends Spell {
  familiar: Vec2 | null;
  familiarTimer: number;
  familiarFireCooldown: number;
  _game: GameAPI | null;

  constructor(level: number = 1) {
    super('summonFamiliar', { name: 'Summon Familiar',cooldown: 30, damage: 1.0 }, level);
    this.familiar = null;
    this.familiarTimer = 0;
    this.familiarFireCooldown = 0;
    this._game = null;
  }

  onCast(game: GameAPI): void {
    const player = game.getPlayer();
    if (!player) return;
    this.familiar = { x: player.position.x + 30, y: player.position.y - 30 };
    const sfScaling = getSpellScaling(this.id);
    const sfDur = sfScaling.durationPerLevel ?? 5;
    this.familiarTimer = 20 + this.level * sfDur;
    this._game = game;
  }

  update(deltaTime: number): void {
    super.update(deltaTime);
    if (!this.familiar) return;

    this.familiarTimer -= deltaTime;
    if (this.familiarTimer <= 0) {
      this.familiar = null;
      return;
    }

    this.familiarFireCooldown -= deltaTime;
    if (this.familiarFireCooldown <= 0 && this._game) {
      this.familiarFireCooldown = 0.5;
      const enemies = this._game.getEnemies();
      let closest: Enemy | null = null;
      let minDist = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.position.x - this.familiar.x, e.position.y - this.familiar.y);
        if (d < minDist) { minDist = d; closest = e; }
      }
      if (closest && minDist < 300) {
        const dmg = this.getDamage();
        const eff = Math.min(closest.health, dmg);
        closest.takeDamage(dmg);
        closest.lastHitWeaponId = 'familiar';
        if (eff > 0) this._game.recordDamage('familiar', eff);
        const fx = this._game.getEffectsSystem();
        const ang = Math.atan2(closest.position.y - this.familiar.y, closest.position.x - this.familiar.x);
        fx.addMuzzleFlash(this.familiar.x, this.familiar.y, ang, '#CC99FF');
        fx.addChainLightningEffect(this.familiar.x, this.familiar.y, closest.position.x, closest.position.y);
        fx.addImpactEffect(closest.position.x, closest.position.y, '#CC99FF');
      }
    }

    if (this._game) {
      const player = this._game.getPlayer();
      if (player) {
        const dx = (player.position.x + 30) - this.familiar.x;
        const dy = (player.position.y - 30) - this.familiar.y;
        this.familiar.x += dx * 3 * deltaTime;
        this.familiar.y += dy * 3 * deltaTime;
      }
    }
  }

  onRender(ctx: CanvasRenderingContext2D): void {
    if (!this.familiar) return;
    const t = Date.now() * 0.005;
    const bob = Math.sin(t) * 3;
    const pulse = (Math.sin(t * 2) + 1) * 0.5;
    // Glow halo
    ctx.fillStyle = `rgba(204, 153, 255, ${0.15 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.arc(this.familiar.x, this.familiar.y + bob, 14 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    // Fading-out warning ring when duration low
    if (this.familiarTimer < 3) {
      const blink = (Math.sin(Date.now() * 0.02) + 1) * 0.5;
      ctx.strokeStyle = `rgba(204, 153, 255, ${blink * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.familiar.x, this.familiar.y + bob, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#9966FF';
    ctx.beginPath();
    ctx.moveTo(this.familiar.x, this.familiar.y - 8 + bob);
    ctx.lineTo(this.familiar.x - 6, this.familiar.y + 4 + bob);
    ctx.lineTo(this.familiar.x + 6, this.familiar.y + 4 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#CC99FF';
    ctx.beginPath();
    ctx.arc(this.familiar.x, this.familiar.y + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const SPELL_CLASSES: Record<string, new (level: number) => Spell> = {
  magicMissile: MagicMissile,
  fireball: Fireball,
  chainLightning: ChainLightningSpell,
  iceNova: IceNova,
  teleport: TeleportSpell,
  meteorStorm: MeteorStorm,
  shieldBubble: ShieldBubble,
  arcaneBeam: ArcaneBeam,
  timeWarp: TimeWarp,
  summonFamiliar: SummonFamiliar,
};

export function createSpell(spellId: string, level: number = 1): Spell {
  const SpellClass = SPELL_CLASSES[spellId];
  if (!SpellClass) return new MagicMissile(level);
  return new SpellClass(level);
}

// `cost` = money price in the shop. Spells are cooldown-gated; there is no mana resource.
export const SPELL_CONFIGS: Record<string, { name: string; cost: number; cooldown: number; description: string }> = {
  magicMissile:  { name: 'Magic Missile',   cost: 0,   cooldown: 0.8, description: 'Homing bolts. +1 bolt per level (max 8)' },
  fireball:      { name: 'Fireball',        cost: 50,  cooldown: 3,   description: 'AoE explosion. Lv4: burning ground' },
  chainLightning:{ name: 'Chain Lightning', cost: 175, cooldown: 4,   description: 'Jumps 5+ enemies. Lv4: forks to 2' },
  iceNova:       { name: 'Ice Nova',        cost: 120, cooldown: 6,   description: 'Freeze nearby enemies 2s' },
  teleport:      { name: 'Teleport',        cost: 80,  cooldown: 5,   description: 'Blink in move direction + AoE' },
  meteorStorm:   { name: 'Meteor Storm',    cost: 300, cooldown: 12,  description: '5+ random impacts' },
  shieldBubble:  { name: 'Shield Bubble',   cost: 150, cooldown: 15,  description: 'Bounces 1 enemy away' },
  arcaneBeam:    { name: 'Arcane Beam',     cost: 250, cooldown: 0.1, description: 'Continuous beam. Lv3: pierces in line' },
  timeWarp:      { name: 'Time Warp',       cost: 400, cooldown: 20,  description: 'Slow all enemies 75%' },
  summonFamiliar:{ name: 'Summon Familiar', cost: 200, cooldown: 30,  description: 'Ally attacks for 20s' },
};
