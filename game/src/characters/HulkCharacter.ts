import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

export class HulkCharacter extends BaseCharacter {
  slamRadius: number;
  slamCooldownMax: number;
  damageMult: number;
  speedMult: number;
  healthMult: number;
  berserkerRegenActive: boolean;
  stance: string;
  armorReduction: number;
  _lastFistFireCount: number;
  _swingCounter: number;
  _slamEveryNSwings: number;

  // Rage meter / Unstoppable buildup state.
  rage: number;
  rageMax: number;
  unstoppableTimer: number;
  unstoppableFlash: number;
  _unstoppableDurationBase: number;
  _lastFistHitTotal: number;
  _cachedDamageMult: number;
  _cachedFireRateMult: number;
  _totalUnstoppables: number;

  // Item-derived state.
  _hasFuryChain: boolean;
  _furyChainExtend: number;
  _slamDamageBonus: number;

  // Visual cache.
  _lastSlamFlash: number;

  constructor() {
    super();
    this.slamRadius = 150;
    this.slamCooldownMax = 8;
    this.damageMult = 1;
    this.speedMult = 1;
    this.healthMult = 1;
    this.berserkerRegenActive = false;
    this.stance = 'juggernaut';
    this.armorReduction = 0;
    this._lastFistFireCount = 0;
    this._swingCounter = 0;
    this._slamEveryNSwings = 3;

    this.rage = 0;
    this.rageMax = 80;
    this.unstoppableTimer = 0;
    this.unstoppableFlash = 0;
    this._unstoppableDurationBase = 6;
    this._lastFistHitTotal = 0;
    this._cachedDamageMult = 1;
    this._cachedFireRateMult = 1;
    this._totalUnstoppables = 0;

    this._hasFuryChain = false;
    this._furyChainExtend = 0.5;
    this._slamDamageBonus = 0;

    this._lastSlamFlash = 0;
  }

  getId(): string { return 'hulk'; }
  getName(): string { return 'The Hulk'; }
  getDescription(): string {
    return 'Melee tank. 50 HP, 0.6× speed, fists only — no guns. Damage taken fills Rage; venting unleashes ground-slam shockwaves scaled by stance (Juggernaut / Earthshaker / Berserker, picked at start). Unstoppable burst when Rage caps. Shop: items only. Walk into the swarm.';
  }
  getColor(): string { return '#2E8B57'; }

  getBaseStats(): PlayerStats {
    return {
      health: 50,
      speed: BALANCE.player.baseSpeed * 0.6,
      damage: BALANCE.player.baseDamage,
      fireRate: BALANCE.player.baseFireRate,
      dodge: 0,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration * 2,
    };
  }

  getPlayerSize(): number { return 60; }
  getStartingWeapons(): string[] { return ['hulkFist', 'hulkFist']; }
  getAvailableWeapons(): string[] | null { return []; }
  getShopTabs(): string[] { return ['items']; }
  getMaxWeapons(): number { return 2; }
  // Hulk's HP cap is well above the default 50 — he's designed to absorb a mountain of
  // damage and convert it to Rage. Keeps HP upgrades meaningful for his whole kit.
  getMaxHealthValue(): number { return 250; }
  getUpgradePool(): string[] {
    // Removed 'dodge' (anti-synergy — Hulk fills Rage by taking hits).
    // Removed 'speed' — Hulk is intentionally slow; speedBoots item handles mobility.
    // Added 'critChance' and 'critDamage' so fist hits can roll for big hits.
    return [
      'health', 'damage', 'regeneration',
      'slamRadius', 'fistSwingSpeed', 'armor',
      'critChance', 'critDamage',
    ];
  }

  getAvailableItems(): string[] {
    return [
      // Hulk-flavored — directly amplify Rage / Unstoppable / slam.
      'furyChain', 'titansBelt', 'seismicCore',
      // Sustain — kills heal, regen mid-fight, low-HP burst.
      // Dropped 'shieldGenerator' — it blocks incoming damage and starves the Rage meter.
      'tankArmor', 'adrenalineRush', 'bloodPact',
      'lifeSteal', 'vampiric', 'bandaidPack',
      // Mobility / pickup — Hulk is slow; these get him into and out of melee.
      'moneyMagnet', 'magnetGloves', 'speedBoots',
      // Crit stacking items.
      'sharpTips', 'criticalEye',
      // Cheap stat micros for a melee brute.
      'luckyCoin', 'energyDrink', 'proteinBar', 'coffeeShot',
    ];
  }

  getDamageMultiplier(): number { return this._cachedDamageMult; }
  getFireRateMultiplier(): number { return this._cachedFireRateMult; }

  // Each Unstoppable in a wave makes the next one 1.5× harder to fill.
  getEffectiveRageMax(): number {
    return this.rageMax * Math.pow(1.5, this._totalUnstoppables);
  }

  onStartLevel(game: GameAPI): void {
    this.slamRadius = 150;
    this.slamCooldownMax = 8;
    this.damageMult = 1;
    this.speedMult = 1;
    this.healthMult = 1;
    this.berserkerRegenActive = false;
    this._lastFistFireCount = 0;
    this._swingCounter = 0;

    this.rage = 0;
    this.unstoppableTimer = 0;
    this.unstoppableFlash = 0;
    this._lastFistHitTotal = 0;
    this._cachedDamageMult = 1;
    this._cachedFireRateMult = 1;
    this._totalUnstoppables = 0;
    this._lastSlamFlash = 0;

    const gameState = game.getGameState();
    const upgradeStats = gameState.playerData.stats;
    this.slamRadius += upgradeStats.slamRadiusBonus || 0;
    const fistSpeedBonus = upgradeStats.fistSwingSpeedBonus || 0;
    this.armorReduction = Math.min(0.75, upgradeStats.armor || 0);

    const charData = gameState.playerData as unknown as Record<string, unknown>;
    this.stance = (charData.startingStance as string) || 'juggernaut';

    // Read Hulk item stacks for character-level effects.
    const items = gameState.playerData.items || [];
    const itemStacks = (gameState.playerData.itemStacks as Record<string, number> | undefined) || {};
    this._hasFuryChain = items.includes('furyChain');
    this._furyChainExtend = (BALANCE.items as unknown as Record<string, Record<string, number>>).furyChain?.extendSeconds || 0.5;
    const seismicStacks = itemStacks.seismicCore || 0;
    const seismicPer = (BALANCE.items as unknown as Record<string, Record<string, number>>).seismicCore?.slamDamageBonus || 0.25;
    this._slamDamageBonus = seismicStacks * seismicPer;

    // Titan's Belt is handled by its healthBonus applied in ItemEffects (standard healthBonus pathway).

    const player = game.getPlayer();
    if (this.stance === 'earthshaker') {
      this.slamRadius = 150 * 1.3 + (upgradeStats.slamRadiusBonus || 0);
      this.slamCooldownMax = 8 * 0.8;
      // Softened from -20% to -15% — the +30% slam range wasn't worth crawling.
      if (player) player.speed = player.speed * 0.85;
      this.speedMult = 0.85;
    } else if (this.stance === 'berserker') {
      this.damageMult = 1.25;
      this.healthMult = 0.8;
      if (player) {
        player.maxHealth = Math.max(1, Math.round(player.maxHealth * 0.8));
        player.health = Math.min(player.health, player.maxHealth);
      }
    }

    const level = game.getCurrentLevel();
    const fistLevel = 1 + Math.floor((level - 1) / 5);
    const weaponSystem = game.getWeaponSystem();
    if (weaponSystem) {
      for (const weapon of weaponSystem.weapons) {
        if (weapon.id === 'hulkFist') {
          const ext = weapon as unknown as Record<string, unknown>;
          (ext as Record<string, number>).fistLevel = fistLevel;
          (ext as Record<string, number>).swingRange = 120 + (fistLevel - 1) * 15;
          (ext as Record<string, number>).swingArc = Math.PI * 0.8 + (fistLevel - 1) * (Math.PI / 8);
          if (this.stance === 'earthshaker') {
            (ext as Record<string, number>).swingRange = (ext.swingRange as number) * 1.3;
          }
          if (this.stance === 'berserker') {
            (ext as Record<string, number>).damageMultiplier =
              ((ext.damageMultiplier as number) || 2) * 1.25;
          }
          if (fistSpeedBonus > 0) {
            (ext as Record<string, number>).fireRate =
              ((ext.fireRate as number) || 0.6) * (1 + fistSpeedBonus);
          }
          (ext as Record<string, number>)._hulkHitTotal = 0;
          (ext as Record<string, boolean>)._hulkPrevSwinging = false;

          // Neutralize the weapon's internal groundSlam — the character owns
          // the single authoritative auto-slam now. Prevents double-slam and
          // ensures damage is recorded via game.recordDamage() (the weapon's
          // version bypassed kill tracking + upgrade/stance scaling).
          (ext as unknown as { groundSlam: (p: unknown, e: unknown) => void }).groundSlam = () => { /* no-op: superseded by HulkCharacter.groundSlam */ };
        }
      }
    }
  }

  onLevelEnd(): void {
    this.rage = 0;
    this.unstoppableTimer = 0;
    this.unstoppableFlash = 0;
    // Reset auto-slam counter so players don't carry half a streak across waves.
    this._swingCounter = 0;
    this._lastFistHitTotal = 0;
    this._lastSlamFlash = 0;
  }

  onDamage(_game: GameAPI, amount: number): number {
    let dmg = amount;
    if (this.armorReduction > 0) dmg *= (1 - this.armorReduction);
    if (this.unstoppableTimer > 0) dmg *= 0.25; // -75% incoming damage during Unstoppable.
    // +1 rage per HP of damage taken (post-mitigation) — rewards face-tanking.
    if (this.unstoppableTimer <= 0) {
      this.rage = Math.min(this.getEffectiveRageMax(), this.rage + dmg);
      this._checkUnstoppable(_game);
    }
    return dmg;
  }

  onKill(_game: GameAPI, _enemy: Enemy): void {
    // Fury Chain: kills during Unstoppable extend duration.
    if (this._hasFuryChain && this.unstoppableTimer > 0) {
      this.unstoppableTimer = Math.min(this._unstoppableDurationBase * 2.5, this.unstoppableTimer + this._furyChainExtend);
    }
  }

  _checkUnstoppable(game: GameAPI): void {
    if (this.unstoppableTimer > 0) return;
    if (this.rage >= this.getEffectiveRageMax()) {
      this.unstoppableTimer = this._unstoppableDurationBase;
      this._totalUnstoppables++;
      const effects = game.getEffectsSystem();
      const player = game.getPlayer();
      if (effects && player) {
        effects.floatingTexts.push({
          x: player.position.x, y: player.position.y - 30,
          text: 'UNSTOPPABLE!', color: '#FF2020', life: 1.5, vy: -30, fontSize: 18,
        });
        // Louder screen shake on Unstoppable trigger.
        effects.addScreenShake(10, 0.5, 'cinematic');
      }
      game.getSoundSystem()?.play('levelUp');
    }
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    if (this.unstoppableFlash > 0) this.unstoppableFlash -= deltaTime;
    if (this._lastSlamFlash > 0) this._lastSlamFlash -= deltaTime;

    // Tick Unstoppable timer down; reset rage when it ends.
    if (this.unstoppableTimer > 0) {
      this.unstoppableTimer -= deltaTime;
      if (this.unstoppableTimer <= 0) {
        this.unstoppableTimer = 0;
        this.rage = 0;
        this.unstoppableFlash = 0.5;
      }
    } else {
      // Gentle decay when out of combat — prevents perma-rage between waves.
      this.rage = Math.max(0, this.rage - 1 * deltaTime);
    }

    // Rage-from-fist-hit: read hit counter diff from HulkFist weapons.
    const weaponSystem = game.getWeaponSystem();
    if (weaponSystem) {
      let hitTotal = 0;
      const weapons = weaponSystem.weapons;
      for (let i = 0; i < weapons.length; i++) {
        const weapon = weapons[i];
        if (weapon.id !== 'hulkFist') continue;
        const ext = weapon as unknown as Record<string, number>;
        hitTotal += ext._hulkHitTotal || 0;
      }
      const delta = hitTotal - this._lastFistHitTotal;
      if (delta > 0 && this.unstoppableTimer <= 0) {
        // +3/hit (up from +2): in wave 1 with ~2 enemies/swing, hits-alone fills
        // the 80-cap bar in ~13 seconds, keeping Unstoppable in reach without
        // free-casting it every other wave.
        this.rage = Math.min(this.getEffectiveRageMax(), this.rage + delta * 3);
        this._checkUnstoppable(game);
      }
      this._lastFistHitTotal = hitTotal;
    }

    // Auto-slam: trigger character-level slam every Nth fist swing completion.
    if (weaponSystem) {
      const weapons = weaponSystem.weapons;
      for (let i = 0; i < weapons.length; i++) {
        const weapon = weapons[i];
        if (weapon.id !== 'hulkFist') continue;
        const ext = weapon as unknown as Record<string, boolean>;
        const swinging = !!(weapon as unknown as { isSwinging?: boolean }).isSwinging;
        const prev = !!ext._hulkPrevSwinging;
        if (prev && !swinging) {
          this._swingCounter++;
          if (this._swingCounter >= this._slamEveryNSwings) {
            this._swingCounter = 0;
            this.groundSlam(game);
            this._lastSlamFlash = 0.35;
          }
        }
        ext._hulkPrevSwinging = swinging;
      }
    }

    // Cache multipliers for WeaponSystem (applies to fist damage + swing rate).
    let dmgMult = this.damageMult;
    let frMult = 1.0;
    if (this.unstoppableTimer > 0) {
      dmgMult *= 1.75;
      frMult *= 1.5;
    }
    this._cachedDamageMult = dmgMult;
    this._cachedFireRateMult = frMult;

    if (this.stance === 'berserker') {
      const player = game.getPlayer();
      if (player && player.alive) {
        const pct = player.health / Math.max(1, player.maxHealth);
        // Threshold bumped 0.5 -> 0.6 so Berserker actually triggers in wave 1
        // skirmishes, not only once the player is nearly dead.
        if (pct < 0.6) {
          const gameState = game.getGameState();
          const regen = gameState.playerData.stats.regeneration || 0;
          // Adds a small flat component so the stance has value even before
          // regen upgrades exist.
          player.health = Math.min(player.maxHealth, player.health + (regen * 10 + 0.5) * deltaTime);
          this.berserkerRegenActive = true;
        } else {
          this.berserkerRegenActive = false;
        }
      }
    }
  }

  groundSlam(game: GameAPI): void {
    const player = game.getPlayer();
    if (!player || !player.alive) return;

    const enemies = game.getEnemies();
    const effects = game.getEffectsSystem();
    const level = game.getCurrentLevel();
    const slamBase = (5 + level * 2 + (game.getGameState().playerData.stats.damage || 1) * 3) * this.damageMult;
    const slamWithItems = slamBase * (1 + this._slamDamageBonus);
    const slamDamage = this.unstoppableTimer > 0 ? slamWithItems * 1.75 : slamWithItems;
    const radius = this.unstoppableTimer > 0 ? this.slamRadius * 1.5 : this.slamRadius;
    const r2 = radius * radius;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.alive) continue;
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const dist = Math.sqrt(d2);
        const falloff = 1 - (dist / radius) * 0.5;
        const dmg = slamDamage * falloff;
        const preHealth = enemy.health;
        enemy.takeDamage(dmg);
        enemy.lastHitWeaponId = 'hulkSlam';
        game.recordDamage('hulkSlam', Math.min(preHealth, dmg));
        const knockDist = 60 * falloff;
        if (dist > 0) {
          enemy.position.x += (dx / dist) * knockDist;
          enemy.position.y += (dy / dist) * knockDist;
        }
      }
    }

    if (effects) {
      effects.addExplosion(
        player.position.x,
        player.position.y,
        radius,
        this.unstoppableTimer > 0 ? '#FF3030' : '#2E8B57',
      );
      effects.addScreenShake(this.unstoppableTimer > 0 ? 6 : 3, this.unstoppableTimer > 0 ? 0.35 : 0.25, this.unstoppableTimer > 0 ? 'high' : 'medium');
    }
    const sound = game.getSoundSystem();
    if (sound) sound.play('explosion');
  }

  getRoundSummary(): { label: string; value: string }[] {
    const stats: { label: string; value: string }[] = [];
    if (this._totalUnstoppables > 0) stats.push({ label: 'Unstoppable Procs', value: `${this._totalUnstoppables}` });
    return stats;
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player) return;

    ctx.save();

    // Rage bar below player (below the HP bar).
    this.renderRageBar(ctx, player);

    // Slam counter: grows/pulses as we approach the 3rd swing so the player
    // can anticipate the slam.
    const counterColor =
      this._swingCounter === 0 ? '#2E8B57' :
      this._swingCounter === 1 ? '#88AA55' :
      '#FFAA22';
    const counterSize = 10 + this._swingCounter * 2;
    ctx.font = `bold ${counterSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = counterColor;
    ctx.fillText(
      `SLAM ${this._swingCounter}/${this._slamEveryNSwings}`,
      player.position.x,
      player.position.y + player.size / 2 + 26,
    );

    // Slam telegraph: when counter hits (slamEveryN - 1), draw a faint ring
    // at slamRadius so the player sees where the next slam will land.
    if (this._swingCounter === this._slamEveryNSwings - 1) {
      const pulse = 0.15 + Math.sin(Date.now() * 0.015) * 0.1;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#FFAA22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, this.slamRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Brief flash on actual slam fire.
    if (this._lastSlamFlash > 0) {
      const a = this._lastSlamFlash / 0.35;
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = this.unstoppableTimer > 0 ? '#FF4040' : '#FFDD66';
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, this.slamRadius * (1 - a * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    if (this.stance && this.stance !== 'juggernaut') {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = this.berserkerRegenActive ? '#FF4444' : '#88AA88';
      ctx.fillText(
        `[${this.stance.toUpperCase()}]`,
        player.position.x,
        player.position.y + player.size / 2 + 40 + this._swingCounter * 2,
      );
    }

    // Unstoppable visuals: red pulsing outline + particle orbit.
    if (this.unstoppableTimer > 0) {
      const pulse = Math.sin(Date.now() * 0.02) * 0.3 + 0.6;
      ctx.strokeStyle = `rgba(255, 30, 30, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 4,
        player.position.y - player.size / 2 - 4,
        player.size + 8,
        player.size + 8,
      );
      // Inner pulse.
      ctx.strokeStyle = `rgba(255, 120, 60, ${pulse * 0.5})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 1,
        player.position.y - player.size / 2 - 1,
        player.size + 2,
        player.size + 2,
      );
      // Orbiting ember particles.
      const now = Date.now() * 0.006;
      ctx.fillStyle = `rgba(255, 60, 30, ${pulse})`;
      for (let i = 0; i < 8; i++) {
        const a = now + (i * Math.PI * 2) / 8;
        const r = player.size / 2 + 10 + Math.sin(now * 2 + i) * 4;
        const px = player.position.x + Math.cos(a) * r;
        const py = player.position.y + Math.sin(a) * r;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    } else if (this.rage >= this.getEffectiveRageMax() * 0.75) {
      // About-to-pop hint.
      const pulse = Math.sin(Date.now() * 0.012) * 0.2 + 0.3;
      ctx.strokeStyle = `rgba(200, 40, 40, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        player.position.x - player.size / 2 - 2,
        player.position.y - player.size / 2 - 2,
        player.size + 4,
        player.size + 4,
      );
    }

    ctx.restore();
  }

  renderRageBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 4;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.min(1, this.rage / this.getEffectiveRageMax());
    if (this.unstoppableTimer > 0) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#FF3030' : '#FF8040';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (pct > 0) {
      const r = 180 + Math.floor(75 * pct);
      const g = Math.floor(40 * (1 - pct));
      ctx.fillStyle = `rgb(${r}, ${g}, ${g})`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    if (this.unstoppableFlash > 0) {
      const flashA = this.unstoppableFlash / 0.5;
      ctx.fillStyle = `rgba(255, 40, 40, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    ctx.strokeStyle = this.unstoppableTimer > 0 ? '#FF2020' : (pct >= 1 ? '#FF4040' : '#552020');
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Label above bar.
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    if (this.unstoppableTimer > 0) {
      ctx.fillStyle = '#FF6040';
      ctx.fillText(`UNSTOPPABLE ${this.unstoppableTimer.toFixed(1)}s`, player.position.x, barY - 2);
    } else if (pct > 0.01) {
      ctx.fillStyle = '#CC5050';
      ctx.fillText(`Rage ${Math.floor(pct * 100)}%`, player.position.x, barY - 2);
    }
  }
}
