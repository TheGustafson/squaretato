import { Enemy } from '../entities/Enemy';
import { Boss, type BossTypeId } from '../entities/Boss';
import { GAME_CONFIG } from '../constants';
import { BALANCE, getSpawnRate, selectEnemyType } from '../config/balance';
import type { Player } from '../entities/Player';
import type { Projectile } from '../entities/Projectile';
import type { EffectsSystem } from './EffectsSystem';

export class SpawnSystem {
  level: number;
  timeSinceLastSpawn: number;
  totalTime: number;
  spawnTimer: number;
  effectsSystem: EffectsSystem | null;
  bossQueueCount: number;
  bossSpawnDelayTimer: number;
  private _bossRef: Enemy | null = null;
  private _bossWaveSpawned: boolean = false;
  private _bossWaveId: BossTypeId | null = null;
  // Dramatic wave-start countdown (3-2-1-FIGHT) before any spawns.
  static readonly WAVE_START_DELAY: number = 2.6;
  private _waveStartDelay: number = SpawnSystem.WAVE_START_DELAY;
  // Brief hold after a boss is killed before the wave is considered "cleared"
  // so the celebration reads rather than cutting abruptly.
  static readonly BOSS_POST_KILL_DELAY: number = 1.2;
  private _bossKillHoldTimer: number = 0;
  private _bossWasAlive: boolean = false;

  constructor(level: number = 1, effectsSystem: EffectsSystem | null = null) {
    this.level = level;
    this.timeSinceLastSpawn = 0;
    this.totalTime = 0;
    this.spawnTimer = 0;
    this.effectsSystem = effectsSystem;
    this.bossQueueCount = 0;
    this.bossSpawnDelayTimer = 0;
    this._bossWaveId = this.getBossWaveId(level);
  }

  /** True while the pre-wave banner/countdown is playing (no spawns yet). */
  isWaveStarting(): boolean {
    return this.totalTime < this._waveStartDelay;
  }

  /** Seconds remaining in the countdown; 0 once the wave has started. */
  getWaveStartTimer(): number {
    return Math.max(0, this._waveStartDelay - this.totalTime);
  }

  /** Total length of the opening countdown — lets UI compute progress. */
  getWaveStartDuration(): number {
    return this._waveStartDelay;
  }

  /** True just after a boss dies, during the post-kill celebration hold. */
  isBossPostKillHold(): boolean {
    return this._bossKillHoldTimer > 0;
  }

  private getBossWaveId(level: number): BossTypeId | null {
    if (level === 10) return 'wave10';
    if (level === 20) return 'wave20';
    if (level === 30) return 'wave30';
    return null;
  }

  isBossWave(): boolean { return this._bossWaveId !== null; }
  getBoss(): Enemy | null { return this._bossRef; }
  isBossDefeated(): boolean {
    const dead = this._bossWaveSpawned && (!this._bossRef || !this._bossRef.alive || this._bossRef.health <= 0);
    // Gate the "cleared" signal behind the post-kill celebration hold so the
    // transition to the next screen doesn't feel abrupt.
    return dead && this._bossKillHoldTimer <= 0;
  }

  update(deltaTime: number, enemies: Enemy[], canvasWidth: number, canvasHeight: number, player: Player | null = null, projectiles: Projectile[] | null = null): void {
    this.totalTime += deltaTime;
    this.timeSinceLastSpawn += deltaTime;
    this.spawnTimer += deltaTime;

    // Drain static queues populated by Enemy.takeDamage (splitter children + big-enemy death FX).
    if (Enemy.pendingSpawns.length > 0) {
      for (let i = 0; i < Enemy.pendingSpawns.length; i++) {
        const e = Enemy.pendingSpawns[i];
        if (player) e.player = player;
        enemies.push(e);
      }
      Enemy.pendingSpawns.length = 0;
    }
    if (Enemy.pendingDeathEffects.length > 0 && this.effectsSystem) {
      for (let i = 0; i < Enemy.pendingDeathEffects.length; i++) {
        const fx = Enemy.pendingDeathEffects[i];
        // Priority-tiered so a wave of tank deaths doesn't max the shake budget.
        const pri: 'low' | 'medium' | 'high' = fx.intensity >= 5 ? 'medium' : 'low';
        this.effectsSystem.addScreenShake(fx.intensity, 0.18, pri);
        this.effectsSystem.addImpactEffect(fx.x, fx.y, fx.color);
      }
      Enemy.pendingDeathEffects.length = 0;
    } else if (Enemy.pendingDeathEffects.length > 0) {
      // No effects system wired yet; discard so the queue doesn't grow unbounded.
      Enemy.pendingDeathEffects.length = 0;
    }
    // Damage numbers — queued by Enemy.takeDamage from every damage source
    // (projectile, spell, structure, ally, melee). Drain into floating text.
    if (Enemy.pendingDamageNumbers.length > 0 && this.effectsSystem) {
      for (let i = 0; i < Enemy.pendingDamageNumbers.length; i++) {
        const d = Enemy.pendingDamageNumbers[i];
        this.effectsSystem.addDamageNumber(d.x, d.y, d.amount);
      }
      Enemy.pendingDamageNumbers.length = 0;
    } else if (Enemy.pendingDamageNumbers.length > 0) {
      Enemy.pendingDamageNumbers.length = 0;
    }

    // Track boss death transition → start a brief celebration hold.
    if (this._bossRef && (!this._bossRef.alive || this._bossRef.health <= 0)) {
      if (this._bossWasAlive) {
        this._bossKillHoldTimer = SpawnSystem.BOSS_POST_KILL_DELAY;
        this._bossWasAlive = false;
      }
      this._bossRef = null;
    } else if (this._bossRef) {
      this._bossWasAlive = true;
    }
    if (this._bossKillHoldTimer > 0) this._bossKillHoldTimer = Math.max(0, this._bossKillHoldTimer - deltaTime);

    // Pre-wave countdown: pause all spawning so the "WAVE N / 3-2-1-FIGHT"
    // banner can play. Keep timers reset so the first spawn fires cleanly.
    if (this.isWaveStarting()) {
      this.timeSinceLastSpawn = 0;
      return;
    }

    // Boss wave handling: spawn boss ONLY, no normal pool.
    if (this._bossWaveId) {
      if (!this._bossWaveSpawned) {
        // Brief entry beat after the countdown so the boss banner reads.
        if (this.totalTime - this._waveStartDelay >= 0.6) {
          const boss = new Boss(
            this._bossWaveId,
            canvasWidth / 2,
            GAME_CONFIG.UI_BAR_HEIGHT + 80,
            this.level,
          );
          boss.effectsSystem = this.effectsSystem ?? undefined;
          boss.player = player;
          enemies.push(boss);
          this._bossRef = boss;
          this._bossWaveSpawned = true;
          if (this.effectsSystem) {
            this.effectsSystem.addScreenShake(14, 0.8, 'cinematic');
            this.effectsSystem.addFlash(boss.cfg.strokeColor, 0.4, 'cinematic');
          }
        }
      }
      // Do NOT spawn normal pool enemies during boss waves.
      return;
    }

    // Non-boss wave: existing queued boss spawn fallback
    const bossAlive = !!this._bossRef;
    if (!bossAlive && this.bossQueueCount > 0) {
      if (this.bossSpawnDelayTimer > 0) this.bossSpawnDelayTimer -= deltaTime;
      if (this.bossSpawnDelayTimer <= 0) {
        this.bossQueueCount--;
        const boss = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, 'boss');
        boss.effectsSystem = this.effectsSystem ?? undefined;
        this.applyBossVariant(boss);
        enemies.push(boss);
        this._bossRef = boss;
        this.bossSpawnDelayTimer = 5.0;
      }
    } else if (bossAlive) {
      this.bossSpawnDelayTimer = 5.0;
    }

    let spawnRate = getSpawnRate(this.level, this.totalTime);
    const isFlood = (this.level === 9 || this.level === 13 || this.level === 17 || this.level === 24 || this.level === 27);
    if (isFlood) spawnRate *= 3.0;

    // Wave 1: gentle intro. Throttle spawn rate and cap concurrent enemies.
    if (this.level === 1) {
      spawnRate *= 0.55;
      if (enemies.length >= 5) {
        this.timeSinceLastSpawn = 0;
        return;
      }
    } else if (this.level === 2 && enemies.length >= 10) {
      this.timeSinceLastSpawn = 0;
      return;
    }

    const timeBetweenSpawns = 1 / spawnRate;
    if (this.timeSinceLastSpawn >= timeBetweenSpawns) {
      this.spawnEnemy(enemies, canvasWidth, canvasHeight, player, projectiles);
      this.timeSinceLastSpawn = 0;
    }
  }

  private spawnEnemy(enemies: Enemy[], canvasWidth: number, canvasHeight: number, player: Player | null, _projectiles: Projectile[] | null): void {
    let enemyType = selectEnemyType(this.level);

    if (enemyType === 'wave' && Math.random() < 0.5) enemyType = 'basic';
    if (enemyType === 'tank' && Math.random() < 0.5) enemyType = 'basic';

    if (enemyType === 'wave') {
      const groupSize = Math.floor(Math.random() * 9) + 2;
      const edge = Math.floor(Math.random() * 4);
      for (let i = 0; i < groupSize; i++) {
        const enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, 'wave');
        if (edge === 0 || edge === 2) enemy.position.x += (i - groupSize / 2) * 20;
        else enemy.position.y += (i - groupSize / 2) * 20;

        if (player && player.alive) {
          const dx = enemy.position.x - player.position.x;
          const dy = enemy.position.y - player.position.y;
          if (dx * dx + dy * dy < 200 * 200) continue;
        }

        const waveConfig = BALANCE.enemyTypes.wave;
        enemy.wavePhase = Math.random() * Math.PI * 2;
        const ampRange = waveConfig.amplitudeVariation.max - waveConfig.amplitudeVariation.min;
        const freqRange = waveConfig.frequencyVariation.max - waveConfig.frequencyVariation.min;
        enemy.waveAmplitude = (enemy.waveAmplitude ?? 0) * (waveConfig.amplitudeVariation.min + Math.random() * ampRange);
        enemy.waveFrequency = (enemy.waveFrequency ?? 0) * (waveConfig.frequencyVariation.min + Math.random() * freqRange);
        enemy.trail = true;
        enemy.effectsSystem = this.effectsSystem ?? undefined;
        enemy.lastTrailDistance = 0;
        enemy.trailSpacing = waveConfig.trailSpacing;
        enemies.push(enemy);
      }
      return;
    }

    if (enemyType === 'boss') {
      const bossAlive = enemies.some(e => e.behavior === 'boss');
      if (bossAlive || this.bossSpawnDelayTimer > 0) {
        this.bossQueueCount++;
        return;
      } else {
        this.bossSpawnDelayTimer = 5.0;
      }
    }

    let enemy: Enemy;
    const isFlood = (this.level === 9 || this.level === 13 || this.level === 17 || this.level === 24 || this.level === 27);

    if (isFlood && enemyType === 'tracker') {
      enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
      const spawnPoint = Math.floor(Math.random() * 6);
      const midY = GAME_CONFIG.UI_BAR_HEIGHT + (canvasHeight - GAME_CONFIG.UI_BAR_HEIGHT) / 2;
      if (spawnPoint === 0) { enemy.position.x = 0; enemy.position.y = GAME_CONFIG.UI_BAR_HEIGHT; }
      else if (spawnPoint === 1) { enemy.position.x = canvasWidth; enemy.position.y = GAME_CONFIG.UI_BAR_HEIGHT; }
      else if (spawnPoint === 2) { enemy.position.x = 0; enemy.position.y = canvasHeight; }
      else if (spawnPoint === 3) { enemy.position.x = canvasWidth; enemy.position.y = canvasHeight; }
      else if (spawnPoint === 4) { enemy.position.x = 0; enemy.position.y = midY; }
      else { enemy.position.x = canvasWidth; enemy.position.y = midY; }
      if (!enemy.isEnraged) enemy.speed *= 1.5;
    } else if (enemyType === 'tracker') {
      enemy = Enemy.spawnInside(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
    } else {
      enemy = Enemy.spawnFromEdge(canvasWidth, canvasHeight, GAME_CONFIG.UI_BAR_HEIGHT, this.level, enemyType);
    }

    if (player && player.alive) {
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      if (dx * dx + dy * dy < 200 * 200) return;
    }

    if (enemy.behavior === 'tracker' || enemy.behavior === 'tank' || enemy.behavior === 'shooter' ||
        enemy.behavior === 'boss' || enemy.behavior === 'charger' || enemy.behavior === 'sniper' ||
        enemy.behavior === 'exploder') {
      enemy.player = player;
    }
    // Exploder needs effects system for explosion shake
    if (enemy.behavior === 'exploder') {
      enemy.effectsSystem = this.effectsSystem ?? undefined;
    }

    if (enemy.behavior === 'boss') {
      this.applyBossVariant(enemy);
      this._bossRef = enemy;
    }

    enemies.push(enemy);
  }

  private applyBossVariant(boss: Enemy): void {
    if (this.level >= 30) {
      boss.bossVariant = 'nexus';
      boss.color = '#FFD700';
      boss.health *= 3;
      boss.maxHealth = boss.health;
      boss.size = Math.floor(boss.size * 1.3);
      boss.bossPhase = 1;
    } else if (this.level >= 20) {
      boss.bossVariant = 'artilleryTitan';
      boss.color = '#FF6600';
      boss.health *= 2;
      boss.maxHealth = boss.health;
      boss.size = Math.floor(boss.size * 1.2);
    } else if (this.level >= 10) {
      boss.bossVariant = 'swarmKing';
      boss.color = '#FF2222';
      boss.health *= 0.7;
      boss.maxHealth = boss.health;
    } else {
      boss.bossVariant = 'standard';
    }
  }

  reset(): void {
    this.timeSinceLastSpawn = 0;
    this.totalTime = 0;
    this._bossWaveSpawned = false;
    this._bossRef = null;
    this._bossKillHoldTimer = 0;
    this._bossWasAlive = false;
  }
}
