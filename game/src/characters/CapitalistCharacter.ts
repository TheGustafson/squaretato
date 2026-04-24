import { BaseCharacter } from './BaseCharacter';
import { BALANCE } from '../config/balance';
import { StructureSystem, StructureConfig, Structure } from '../systems/StructureSystem';
import type { PlayerStats, GameAPI } from '../types';
import type { Player } from '../entities/Player';

interface StockConfig {
  name: string;
  cost: number;
  dividend?: number;
  baseDividend?: number;
  growthInterval?: number;
  payout?: number;
  loseChance?: number;
  percentPayout?: number;
}

interface OwnedStock {
  type: string;
  purchaseWave: number;
}

export interface PlacedEntry {
  type: string;
  gridX: number;
  gridY: number;
}

export const GRID_SIZE = 3;
export const GRID_MAX = GRID_SIZE * GRID_SIZE; // 9

function getBusinessTypes(): Record<string, StructureConfig> {
  return BALANCE.businesses as unknown as Record<string, StructureConfig>;
}
function getStockTypes(): Record<string, StockConfig> {
  return BALANCE.stocks as unknown as Record<string, StockConfig>;
}

export class CapitalistCharacter extends BaseCharacter {
  structureSystem: StructureSystem | null;
  stocks: OwnedStock[];
  waveMoneyEarned: number;
  private _prevMoneyForWaveTrack: number | undefined = undefined;

  // Populated at the end of each wave so the post-round stats screen can
  // surface "Stock income" and "Shares lost" per type. Reset at wave start.
  lastWaveStockSummary: { payouts: Record<string, number>; lost: Record<string, number> } | null = null;

  // Snapshot of the Capital Supremacy multiplier (0..maxBonus) computed each
  // frame in onUpdate — read by onRender for the HUD display.
  private _lastWealthBoost: number = 0;

  placedBusinesses: PlacedEntry[];

  // Bull Market / Monopoly
  bullMarketStacks: number;
  bullMarketTimer: number;
  bullMarketFill: number;
  bullMarketFillMax: number;
  bullMarketFillDecay: number;
  bullMarketFillPerStack: number;
  monopolyActive: boolean;
  monopolyTimer: number;
  monopolyDuration: number;
  monopolyEndFlash: number;
  totalMonopolies: number;
  monopoliesThisWave: number;
  // WeakMap so entries for dead structures get GC'd instead of leaking.
  private _baseStructureDamage: WeakMap<Structure, number>;

  drizzleTimers: number[];


  constructor() {
    super();
    this.structureSystem = null;
    this.stocks = [];
    this.waveMoneyEarned = 0;
    this.placedBusinesses = [];
    this.bullMarketStacks = 0;
    this.bullMarketTimer = 0;
    this.bullMarketFill = 0;
    // Lower fillMax + gentler decay so Monopoly is actually reachable on
    // mid-length waves instead of requiring an uninterrupted kill chain.
    this.bullMarketFillMax = 75;
    this.bullMarketFillDecay = 4;
    this.bullMarketFillPerStack = 35;
    this.monopolyActive = false;
    this.monopolyTimer = 0;
    // Longer Monopoly window so the reward reads as a real power spike, not a blip.
    this.monopolyDuration = 7;
    this.monopolyEndFlash = 0;
    this.totalMonopolies = 0;
    this.monopoliesThisWave = 0;
    this._baseStructureDamage = new WeakMap();
    this.drizzleTimers = [];
  }

  getId(): string { return 'capitalist'; }
  getName(): string { return 'The Capitalist'; }
  getDescription(): string {
    return 'Tycoon economy. No weapons — place up to 9 Businesses on a 3×3 grid; adjacency synergies amplify production. CEO Aura boosts nearby structures. Structure kills fill Bull Market → Monopoly burst (+250% production, +50% damage). CAPITAL SUPREMACY: every $1000 in your bank grants +0.5% damage AND production to all businesses — holding a fat wallet directly makes them hit harder. Shop: Businesses + Stocks (inc. compounding Hedge Fund) + Items.';
  }
  getColor(): string { return '#FFD700'; }

  getBaseStats(): PlayerStats {
    return {
      // Capitalist is a non-combatant "stand near your holdings" character.
      // Raised from 10 → 18 so wave 1 doesn't auto-bleed while the first
      // businesses are still warming up their production timers.
      health: 18,
      speed: BALANCE.player.baseSpeed,
      damage: 0,
      fireRate: 0,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck + 5,
      critChance: 0,
      critDamage: 0,
      // Extra-wide pickup range pairs with the CEO-Aura positioning play —
      // you can hover the grid and still vacuum drizzle coins.
      pickupRange: BALANCE.player.basePickupRange * 2.25,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getStartingWeapons(): string[] { return []; }
  getAvailableWeapons(): string[] | null { return []; }
  getShopTabs(): string[] { return ['businesses', 'stocks', 'items']; }
  getMaxWeapons(): number { return 0; }
  // Tycoon — doesn't fight, but expected to survive near his holdings. 80 HP
  // matches Manager; both are command-class non-combatants.
  getMaxHealthValue(): number { return 80; }
  getUpgradePool(): string[] {
    return ['health', 'speed', 'dodge', 'luck', 'regeneration',
      'productionSpeed', 'dividendRate', 'structureHealth'];
  }

  getAvailableItems(): string[] {
    // Player doesn't fight — weapon-specific items are useless. Focus on
    // (1) business-scaling exclusives, (2) personal survivability for the
    // CEO-aura proximity play, (3) economy boosters (luck amplifies money drops).
    return [
      // Capitalist exclusives
      'accountant', 'marketingCampaign', 'venturCapital',
      // Survivability
      'luckyCoin', 'energyDrink', 'proteinBar', 'bandaidPack', 'coffeeShot',
      'tankArmor', 'reinforcedPlating', 'shieldGenerator', 'adrenalineRush',
      'evasionTraining',
      // Economy / mobility (synergy with CEO Aura proximity bonus)
      'moneyMagnet', 'luckyPenny', 'speedBoots', 'magnetGloves',
      'prospectorsCharm', 'bloodPact',
    ];
  }

  /**
   * Map a grid cell (0..2, 0..2) to canvas coordinates.
   * Uses a left-center area of the playfield, ~100..700 x, ~120..520 y.
   */
  gridToCanvas(gridX: number, gridY: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const minX = 100, maxX = Math.min(700, canvasW - 100);
    const minY = 120, maxY = Math.min(520, canvasH - 200);
    const stepX = (maxX - minX) / GRID_SIZE;
    const stepY = (maxY - minY) / GRID_SIZE;
    return {
      x: minX + (gridX + 0.5) * stepX,
      y: minY + (gridY + 0.5) * stepY,
    };
  }

  private migrateLegacyPlacements(legacy: unknown): PlacedEntry[] {
    if (!Array.isArray(legacy)) return [];
    // Already-new shape?
    if (legacy.length > 0 && typeof legacy[0] === 'object' && legacy[0] !== null && 'gridX' in (legacy[0] as object)) {
      return (legacy as PlacedEntry[]).map(e => ({ type: e.type, gridX: e.gridX, gridY: e.gridY }));
    }
    // Legacy string[] — pack sequentially into the grid.
    const out: PlacedEntry[] = [];
    let idx = 0;
    for (const type of legacy as string[]) {
      if (typeof type !== 'string') continue;
      if (idx >= GRID_MAX) break;
      const gx = idx % GRID_SIZE;
      const gy = Math.floor(idx / GRID_SIZE);
      out.push({ type, gridX: gx, gridY: gy });
      idx++;
    }
    return out;
  }

  onStartLevel(game: GameAPI): void {
    const canvas = game.getCanvas();
    const canvasW = canvas.logicalWidth;
    const canvasH = canvas.logicalHeight;

    this.structureSystem = new StructureSystem();
    this.structureSystem.damageCallback = (sourceId, amount) => game.recordDamage(sourceId, amount);
    this.waveMoneyEarned = 0;
    this._prevMoneyForWaveTrack = undefined;
    this.lastWaveStockSummary = null;
    this.bullMarketStacks = 0;
    this.bullMarketTimer = 0;
    this.bullMarketFill = 0;
    this.monopolyActive = false;
    this.monopolyTimer = 0;
    this.monopolyEndFlash = 0;
    this.monopoliesThisWave = 0;
    this._baseStructureDamage = new WeakMap();

    const gameState = game.getGameState();
    const charData = gameState.playerData as unknown as Record<string, unknown>;

    this.placedBusinesses = this.migrateLegacyPlacements(charData._placedBusinesses);

    this.stocks = Array.isArray(charData._ownedStocks)
      ? [...(charData._ownedStocks as OwnedStock[])]
      : [];

    // Fresh-run (first wave of a new Capitalist run): seed a synergy PAIR so
    // wave 1 actually has damage output. This branch runs once per run; a
    // persistent flag on the character save blocks re-seeding on later waves
    // even if the player later sells both starters.
    const isFreshRun = !charData._capitalistSeeded && this.placedBusinesses.length === 0;

    // Starting-setup choice (from StartingSetup screen) becomes the primary
    // tier-1 business on the pair.
    const startingPick = typeof charData.startingBusiness === 'string' ? charData.startingBusiness : null;
    const primary = (startingPick && getBusinessTypes()[startingPick]) ? startingPick : 'burgerJoint';

    // Thematic synergy partner — matches the `synergiesWith` links in
    // balance.ts so the starter pair triggers an adjacency production bonus
    // the moment the first wave begins.
    const SYNERGY_PARTNER: Record<string, string> = {
      burgerJoint: 'farm',
      mercenaryCamp: 'bank',
      robotFactory: 'laboratory',
      farm: 'burgerJoint',
      bank: 'mercenaryCamp',
      laboratory: 'robotFactory',
      tankDepot: 'mercenaryCamp',
    };

    if (isFreshRun) {
      this.placedBusinesses.push({ type: primary, gridX: 1, gridY: 1 });
      const partner = SYNERGY_PARTNER[primary] || 'farm';
      this.placedBusinesses.push({ type: partner, gridX: 0, gridY: 1 });
      charData._capitalistSeeded = true;
    } else if (startingPick) {
      // Late "starting pick" token left on the save — fold it into an empty
      // slot (defensive, in case of mid-run character re-selection).
      const cell = this.findFirstEmptyCell();
      if (cell) this.placedBusinesses.push({ type: startingPick, gridX: cell.gridX, gridY: cell.gridY });
    }
    if (startingPick) delete charData.startingBusiness;

    // Persist normalized shape back.
    charData._placedBusinesses = this.placedBusinesses.map(e => ({ ...e }));

    // Instantiate structures from the grid.
    const types = getBusinessTypes();
    for (const entry of this.placedBusinesses) {
      const config = types[entry.type];
      if (!config) continue;
      const { x, y } = this.gridToCanvas(entry.gridX, entry.gridY, canvasW, canvasH);
      this.structureSystem.addStructure(entry.type, config, x, y, entry.gridX, entry.gridY);
    }

    // Drizzle timers.
    const drizzleInterval = (BALANCE as unknown as Record<string, { interval: number; coinValue: number }>).dividendDrizzle.interval;
    this.drizzleTimers = this.structureSystem.structures.map((_, i) => drizzleInterval * 0.5 + i * 1.5);

    // Marketing Campaign item: faster baseline production.
    const items = gameState.playerData.items || [];
    if (items.includes('marketingCampaign')) {
      for (const s of this.structureSystem.structures) {
        s.baseProductionRate = s.baseProductionRate / 1.2;
      }
    }

    // Upgrade bonuses applied to baseline.
    const upStats = gameState.playerData.stats;
    const prodBonus = upStats.productionSpeedBonus || 0;
    const hpBonus = upStats.structureHealthBonus || 0;
    if (prodBonus > 0 || hpBonus > 0) {
      for (const s of this.structureSystem.structures) {
        if (prodBonus > 0 && s.baseProductionRate > 0) s.baseProductionRate = s.baseProductionRate / (1 + prodBonus);
        if (hpBonus > 0) {
          s.maxHealth = s.maxHealth * (1 + hpBonus);
          s.health = s.maxHealth;
        }
      }
    }

    // Jumpstart first products
    for (const s of this.structureSystem.structures) s.productionTimer = 0.3;

    this.recomputeAdjacency();
    gameState.savePlayerData();
  }

  onLevelEnd(): void {
    // no-op; structure damage map is a WeakMap that GCs dead structures.
  }

  /** Post-wave summary — shown on RoundStatsScreen. Breaks out per-stock
   *  payouts + any Penny Stock shares lost on the wave's dividend roll. */
  getRoundSummary(): { label: string; value: string }[] {
    const out: { label: string; value: string }[] = [];
    const stockTypes = getStockTypes();
    if (this.lastWaveStockSummary) {
      const { payouts, lost } = this.lastWaveStockSummary;
      let total = 0;
      for (const t in payouts) total += payouts[t];
      if (total > 0) out.push({ label: 'Stock Income', value: `+$${total}` });
      for (const t in payouts) {
        const name = stockTypes[t]?.name || t;
        out.push({ label: `  ${name}`, value: `+$${payouts[t]}` });
      }
      for (const t in lost) {
        const name = stockTypes[t]?.name || t;
        out.push({ label: `  ${name} lost`, value: `-${lost[t]}` });
      }
    }
    if (this.totalMonopolies > 0) {
      out.push({ label: 'Monopolies Triggered', value: `${this.totalMonopolies}` });
    }
    if (this._lastWealthBoost > 0.01) {
      out.push({ label: 'Capital Supremacy', value: `+${Math.round(this._lastWealthBoost * 100)}%` });
    }
    return out;
  }

  onUpdate(game: GameAPI, deltaTime: number): void {
    if (!this.structureSystem) return;
    const enemies = game.getEnemies();
    const player = game.getPlayer();

    // Track wave income (for Index Fund payout). Before this existed the field
    // was only ever zeroed, so Index Fund silently paid $0 every wave.
    const nowMoney = game.getGameState().playerData.money;
    const prev = this._prevMoneyForWaveTrack;
    if (prev !== undefined) {
      const delta = nowMoney - prev;
      if (delta > 0) this.waveMoneyEarned += delta;
    }
    this._prevMoneyForWaveTrack = nowMoney;

    // Passive: CEO Aura — boost structures within radius of the player.
    // Proximity check is performed inline in the main structure loop below
    // (was previously done here via applyCeoAuraFromPlayer, but that pre-set
    // ceoBoost which then accumulated with bullBoost/monopoly in the combined
    // value and grew unbounded over time).
    const aura = (BALANCE as unknown as Record<string, { radius: number; productionBonus: number }>).ceoAura;

    // Bull Market timer decay.
    if (this.bullMarketTimer > 0) {
      this.bullMarketTimer -= deltaTime;
      if (this.bullMarketTimer <= 0) {
        this.bullMarketStacks = 0;
        this.bullMarketTimer = 0;
      }
    }

    // Monopoly / Bull Market fill decay.
    if (this.monopolyEndFlash > 0) this.monopolyEndFlash -= deltaTime;
    if (this.monopolyActive) {
      this.monopolyTimer -= deltaTime;
      if (this.monopolyTimer <= 0) {
        this.monopolyActive = false;
        this.monopolyTimer = 0;
        this.bullMarketFill = 0;
        this.bullMarketStacks = 0;
        this.bullMarketTimer = 0;
        this.monopolyEndFlash = 0.5;
      }
    } else {
      this.bullMarketFill = Math.max(0, this.bullMarketFill - this.bullMarketFillDecay * deltaTime);
    }

    // Kill tracking for Bull Market stacks.
    // Apply Bull Market + Monopoly + Capital Supremacy multipliers.
    // Monopoly: +250% production / +50% damage / 7s duration.
    // Capital Supremacy: bank balance → uncapped-ish scaling to BOTH production
    // and damage. Linear per-dollar, clamped at maxBonus. This is how the
    // Capitalist converts a fat wallet into raw killing power late-wave.
    const bm = (BALANCE as unknown as Record<string, { bonusPerStack: number; maxStacks: number; duration: number }>).bullMarket;
    const bullBoost = this.bullMarketStacks * bm.bonusPerStack;
    const monopolyProdBoost = this.monopolyActive ? 2.5 : 0;
    const cs = (BALANCE as unknown as Record<string, { bonusPerDollar: number; maxBonus: number }>).capitalSupremacy;
    const bankBalance = Math.max(0, game.getGameState().playerData.money);
    const wealthBoost = Math.min(cs.maxBonus, bankBalance * cs.bonusPerDollar);
    this._lastWealthBoost = wealthBoost; // cached for HUD render
    // Production multiplier resolution.
    //
    // Previously this was `s.applyCeoAura(Math.max(s.ceoBoost, 0) + bullBoost
    // + monopolyProdBoost + wealthBoost)` — but `s.ceoBoost` was set by the
    // previous frame's applyCeoAura and then decayed inside Structure.update.
    // Re-adding the residual every frame caused bullBoost/monopoly/wealth to
    // grow unbounded (6–10× their intended value at steady state).
    //
    // Fix: write a fresh combined value each frame. `applyCeoAuraFromPlayer`
    // (called above) already set ceoBoost = 0.7 for in-range and left out-of-
    // range's residual alone. We preserve the in-range 0.7 bonus by reading
    // the structure's CURRENT ceoBoost and using it ONLY if the structure is
    // actually in range right now.
    const playerPos = player ? player.position : null;
    const radiusSq = aura.radius * aura.radius;
    for (const s of this.structureSystem.structures) {
      let proximityBoost = 0;
      if (playerPos) {
        const dx = s.position.x - playerPos.x;
        const dy = s.position.y - playerPos.y;
        if (dx * dx + dy * dy <= radiusSq) proximityBoost = aura.productionBonus;
      }
      s.applyCeoAura(proximityBoost + bullBoost + monopolyProdBoost + wealthBoost);

      if (!this._baseStructureDamage.has(s)) {
        this._baseStructureDamage.set(s, s.damage);
      }
      const baseDmg = this._baseStructureDamage.get(s) ?? s.damage;
      const monopolyDmgMult = this.monopolyActive ? 1.5 : 1;
      // Damage stacking: Capital Supremacy + Bull Market additively, Monopoly multiplicatively.
      s.damage = baseDmg * monopolyDmgMult * (1 + wealthBoost + bullBoost);
    }

    this.structureSystem.update(deltaTime, enemies);

    // Bull Market kill detection — MUST run AFTER structureSystem.update so we
    // catch enemies that structures killed this frame (dead enemies are cleared
    // from the main enemies[] array later in game.ts's own update cycle, but
    // they're still present here with `alive = false` and `lastHitWeaponId`
    // set to `biz_${type}` by the structure's hit path).
    for (const e of enemies) {
      const tag = (e as unknown as { _bullChecked?: boolean; lastHitWeaponId?: string }).lastHitWeaponId;
      const checked = (e as unknown as { _bullChecked?: boolean })._bullChecked;
      if (!e.alive && tag && tag.startsWith('biz_') && !checked) {
        (e as unknown as { _bullChecked?: boolean })._bullChecked = true;
        this.triggerBullMarketStack(game);
      }
    }

    // Dividend Drizzle — skip structures that don't actively produce (banks/labs/radio still drizzle,
    // since it's a flat passive from the Capitalist, not the business). Keep legacy behavior for all.
    const drizzle = (BALANCE as unknown as Record<string, { interval: number; coinValue: number }>).dividendDrizzle;
    for (let i = 0; i < this.structureSystem.structures.length; i++) {
      this.drizzleTimers[i] = (this.drizzleTimers[i] ?? drizzle.interval) - deltaTime;
      if (this.drizzleTimers[i] <= 0) {
        this.drizzleTimers[i] = drizzle.interval;
        const s = this.structureSystem.structures[i];
        const ox = (Math.random() - 0.5) * 40;
        const oy = (Math.random() - 0.5) * 40;
        game.spawnMoneyPickup(s.position.x + ox, s.position.y + oy, drizzle.coinValue, true);
      }
    }

    // Rebuild placedBusinesses if any died to enemies this frame.
    if (this.structureSystem.structures.length !== this.placedBusinesses.length) {
      this.placedBusinesses = this.structureSystem.structures.map(s => ({
        type: s.type, gridX: s.gridX, gridY: s.gridY,
      }));
      const charData = game.getGameState().playerData as unknown as Record<string, unknown>;
      charData._placedBusinesses = this.placedBusinesses.map(e => ({ ...e }));
      this.drizzleTimers = this.drizzleTimers.slice(0, this.structureSystem.structures.length);
      while (this.drizzleTimers.length < this.structureSystem.structures.length) {
        this.drizzleTimers.push(drizzle.interval);
      }
      this.recomputeAdjacency();
    }
  }

  // Each Monopoly in a wave makes the next one 2× harder to fill.
  getEffectiveBullMarketFillMax(): number {
    return this.bullMarketFillMax * Math.pow(2, this.monopoliesThisWave);
  }

  private triggerBullMarketStack(game: GameAPI): void {
    const bm = (BALANCE as unknown as Record<string, { bonusPerStack: number; maxStacks: number; duration: number }>).bullMarket;
    this.bullMarketStacks = Math.min(bm.maxStacks, this.bullMarketStacks + 1);
    this.bullMarketTimer = bm.duration;
    if (!this.monopolyActive) {
      const cap = this.getEffectiveBullMarketFillMax();
      this.bullMarketFill = Math.min(cap, this.bullMarketFill + this.bullMarketFillPerStack);
      if (this.bullMarketFill >= cap) {
        this._triggerMonopoly(game);
      }
    }
  }

  private _triggerMonopoly(game: GameAPI): void {
    this.monopolyActive = true;
    this.monopolyTimer = this.monopolyDuration;
    this.totalMonopolies++;
    this.monopoliesThisWave++;
    if (this.structureSystem) {
      const drizzle = (BALANCE as unknown as Record<string, { coinValue: number }>).dividendDrizzle;
      const coin = drizzle.coinValue;
      for (const s of this.structureSystem.structures) {
        s.health = s.maxHealth;
        for (let c = 0; c < 3; c++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 20 + Math.random() * 40;
          game.spawnMoneyPickup(s.position.x + Math.cos(ang) * rad, s.position.y + Math.sin(ang) * rad, coin, true);
        }
      }
    }
    const effects = game.getEffectsSystem();
    const player = game.getPlayer();
    if (effects && player) {
      effects.floatingTexts.push({
        x: player.position.x, y: player.position.y - 30,
        text: 'MONOPOLY!', color: '#FFD700', life: 2.0, vy: -30, fontSize: 18,
      });
      effects.addScreenShake(5, 0.35, 'high');
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        effects.particles.push({
          x: player.position.x, y: player.position.y,
          vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
          life: 0.6, maxLife: 0.6, color: '#FFD700', size: 4,
        });
      }
    }
    game.getSoundSystem()?.play('levelUp');
  }

  getBusinessCostMultiplier(gameState: import('../systems/GameState').GameState): number {
    const items = gameState.playerData.items || [];
    if (items.includes('venturCapital')) {
      const reduction = (BALANCE.items as Record<string, { businessCostReduction?: number }>).venturCapital?.businessCostReduction ?? 0.3;
      return 1 - reduction;
    }
    return 1;
  }

  onWaveComplete(game: GameAPI, waveNumber: number): void {
    const gameState = game.getGameState();

    // --- Passive & bank income from structures ---
    const types = getBusinessTypes();
    let structurePassive = 0;
    if (this.structureSystem) {
      for (const s of this.structureSystem.structures) {
        const cfg = types[s.type];
        if (!cfg) continue;
        // Casinos gamble: 50% nothing, 50% 2x passiveIncome.
        if (s.type === 'casino' || s.type === 'resort' || s.type === 'vegasStrip') {
          if (Math.random() < 0.5) structurePassive += (cfg.passiveIncome || 0) * 2;
        } else if (cfg.passiveIncome) {
          structurePassive += cfg.passiveIncome;
        }
      }
    }

    // --- Stocks ---
    // Per-type breakdown is captured so the post-wave summary can show the
    // player exactly what their portfolio paid out and which shares were lost.
    const stockTypes = getStockTypes();
    let dividends = 0;
    const perTypePayout: Record<string, number> = {};
    const perTypeLost: Record<string, number> = {};
    for (let i = this.stocks.length - 1; i >= 0; i--) {
      const stock = this.stocks[i];
      const config = stockTypes[stock.type];
      if (!config) continue;
      let paid = 0;

      if (stock.type === 'blueChip') {
        paid = config.dividend || 0;
      } else if (stock.type === 'growthStock') {
        const interval = config.growthInterval || 5;
        const doublings = Math.max(0, Math.floor((waveNumber - stock.purchaseWave) / interval));
        paid = (config.baseDividend || 10) * Math.pow(2, doublings);
      } else if (stock.type === 'pennyStock') {
        if (Math.random() < (config.loseChance || 0.5)) {
          this.stocks.splice(i, 1);
          perTypeLost[stock.type] = (perTypeLost[stock.type] || 0) + 1;
        } else {
          paid = config.payout || 0;
        }
      } else if (stock.type === 'indexFund') {
        paid = Math.floor(this.waveMoneyEarned * (config.percentPayout || 0.1));
      } else if (stock.type === 'hedgeFund') {
        // Compounding: pays a % of your current bank. The richer you get,
        // the bigger the payout — the late-game money sink the Capitalist
        // actually wants. Snapshots bank AT dividend time, before other
        // stocks in this loop resolve, so order within the portfolio is
        // deterministic.
        const pct = (config as unknown as { bankPercentPayout?: number }).bankPercentPayout ?? 0.02;
        paid = Math.floor(gameState.playerData.money * pct);
      } else if (stock.type === 'holdingsGroup') {
        // Flat per-stock dividend — rewards a diversified portfolio.
        const per = (config as unknown as { perStockDividend?: number }).perStockDividend ?? 30;
        paid = per * this.stocks.length;
      }
      if (paid > 0) {
        dividends += paid;
        perTypePayout[stock.type] = (perTypePayout[stock.type] || 0) + paid;
      }
    }
    this.lastWaveStockSummary = { payouts: perTypePayout, lost: perTypeLost };

    // Radio Tower family multiplies dividends.
    let radioBonus = 0;
    if (this.structureSystem) {
      for (const s of this.structureSystem.structures) {
        const cfg = types[s.type];
        if (cfg && cfg.stockDividendBonus) radioBonus += cfg.stockDividendBonus;
      }
    }
    if (dividends > 0 && radioBonus > 0) dividends = Math.floor(dividends * (1 + radioBonus));

    const charData = gameState.playerData as unknown as Record<string, unknown>;
    charData._ownedStocks = this.stocks.map(s => ({ ...s }));

    const items = gameState.playerData.items || [];
    if (dividends > 0) {
      if (items.includes('accountant')) dividends = Math.floor(dividends * 1.25);
      const divBonus = gameState.playerData.stats.dividendRateBonus || 0;
      if (divBonus > 0) dividends = Math.floor(dividends * (1 + divBonus));
      gameState.playerData.money += dividends;
    }
    if (structurePassive > 0) {
      gameState.playerData.money += structurePassive;
    }

    const totalPayout = dividends + structurePassive;
    if (totalPayout > 0) {
      const effects = game.getEffectsSystem();
      const player = game.getPlayer();
      if (effects && player) {
        effects.floatingTexts.push({
          x: player.position.x,
          y: player.position.y - 40,
          text: `PAYOUT +$${totalPayout}`,
          color: '#FFD700',
          life: 2.0,
          fontSize: 14,
        });
      }
    }

    gameState.savePlayerData();

    // Resetting the money tracker here prevents the onWaveComplete payouts
    // (structurePassive + dividends + wave-completion bonus credited elsewhere)
    // from inflating NEXT wave's first-frame delta, which would double-count
    // them into Index Fund's `waveMoneyEarned` readout.
    this._prevMoneyForWaveTrack = undefined;
    this.waveMoneyEarned = 0;
  }

  onRender(ctx: CanvasRenderingContext2D, player: Player): void {
    if (!player || !this.structureSystem) return;

    const aura = (BALANCE as unknown as Record<string, { radius: number }>).ceoAura;
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, aura.radius, 0, Math.PI * 2);
    ctx.stroke();

    this.structureSystem.render(ctx);

    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText('$', player.position.x, player.position.y + 5);

    // Capital Supremacy readout — tells the player how much extra damage /
    // production their current bank is giving their businesses. Only shows
    // when non-zero so low-wealth early game stays clean.
    if (this._lastWealthBoost > 0.01) {
      const pct = Math.round(this._lastWealthBoost * 100);
      const shimmer = 0.6 + 0.4 * Math.sin(Date.now() * 0.004);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = shimmer;
      ctx.fillStyle = '#44FFAA';
      ctx.fillText(`CAPITAL +${pct}%`, player.position.x, player.position.y - player.size / 2 - 10);
      ctx.globalAlpha = 1;
    }

    if (this.monopolyActive) {
      const canvas = ctx.canvas;
      const shimmer = 0.35 + 0.2 * Math.sin(Date.now() * 0.01);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 215, 0, ${shimmer})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
      ctx.strokeStyle = `rgba(255, 240, 120, ${shimmer * 0.6})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
      ctx.restore();

      const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.012);
      for (const s of this.structureSystem.structures) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(
          s.position.x - s.size / 2 - 3,
          s.position.y - s.size / 2 - 3,
          s.size + 6, s.size + 6,
        );
        ctx.restore();
      }
    }

    const bm = (BALANCE as unknown as Record<string, { maxStacks: number }>).bullMarket;
    const maxStacks = bm.maxStacks;
    const pipsY = player.position.y - player.size / 2 - 8;
    const pipW = 6;
    const pipSpacing = 8;
    const pipsTotalW = maxStacks * pipSpacing;
    const pipsX0 = player.position.x - pipsTotalW / 2 + pipSpacing / 2;
    for (let i = 0; i < maxStacks; i++) {
      ctx.fillStyle = i < this.bullMarketStacks ? '#00FF88' : '#333333';
      ctx.fillRect(pipsX0 + i * pipSpacing - pipW / 2, pipsY - 3, pipW, 4);
    }

    this.renderBullMarketBar(ctx, player);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(
      `Biz: ${this.structureSystem.getCount()}/${GRID_MAX} | Stocks: ${this.stocks.length}`,
      player.position.x,
      player.position.y + player.size / 2 + 30,
    );
  }

  private renderBullMarketBar(ctx: CanvasRenderingContext2D, player: Player): void {
    const barW = player.size;
    const barH = 8;
    const barX = player.position.x - barW / 2;
    const barY = player.position.y + player.size / 2 + 4;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    const pct = Math.min(1, this.bullMarketFill / this.getEffectiveBullMarketFillMax());
    if (this.monopolyActive) {
      const flash = Math.sin(Date.now() * 0.02) > 0 ? '#FFD700' : '#FFFF88';
      ctx.fillStyle = flash;
      ctx.fillRect(barX, barY, barW, barH);
    } else if (pct > 0) {
      const r = 255;
      const g = Math.floor(160 + 55 * pct);
      const b = Math.floor(40 * pct);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    if (this.monopolyEndFlash > 0) {
      const flashA = this.monopolyEndFlash / 0.5;
      ctx.fillStyle = `rgba(255, 215, 0, ${flashA * 0.6})`;
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    }

    ctx.strokeStyle = this.monopolyActive || pct > 0.8 ? '#FFD700' : '#886600';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.monopolyActive ? '#FFFF88' : '#FFAA00';
    const label = this.monopolyActive
      ? `MONOPOLY ${this.monopolyTimer.toFixed(1)}s`
      : `Bull Mkt ${Math.floor(pct * 100)}%`;
    ctx.fillText(label, player.position.x, barY + barH + 8);
  }

  // ================= GRID API =================

  getGrid(): (PlacedEntry | null)[][] {
    const grid: (PlacedEntry | null)[][] = [];
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const row: (PlacedEntry | null)[] = [];
      for (let gx = 0; gx < GRID_SIZE; gx++) row.push(null);
      grid.push(row);
    }
    for (const e of this.placedBusinesses) {
      if (e.gridX >= 0 && e.gridX < GRID_SIZE && e.gridY >= 0 && e.gridY < GRID_SIZE) {
        grid[e.gridY][e.gridX] = e;
      }
    }
    return grid;
  }

  findFirstEmptyCell(): { gridX: number; gridY: number } | null {
    const grid = this.getGrid();
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        if (!grid[gy][gx]) return { gridX: gx, gridY: gy };
      }
    }
    return null;
  }

  getBusinessTypes(): Record<string, StructureConfig> { return getBusinessTypes(); }
  getStockTypes(): Record<string, StockConfig> { return getStockTypes(); }

  /** Purchase & place a brand-new tier-1 business at a grid cell. */
  placeBusiness(type: string, gridX: number, gridY: number, gameState?: import('../systems/GameState').GameState): boolean {
    const types = getBusinessTypes();
    const config = types[type];
    if (!config) return false;
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return false;
    if (this.placedBusinesses.length >= GRID_MAX) return false;
    const grid = this.getGrid();
    if (grid[gridY][gridX]) return false;

    if (this.structureSystem) {
      const coords = this.gridToCanvas(gridX, gridY, 800, 800);
      this.structureSystem.addStructure(type, config, coords.x, coords.y, gridX, gridY);
      const drizzle = (BALANCE as unknown as Record<string, { interval: number }>).dividendDrizzle;
      this.drizzleTimers.push(drizzle.interval);
    }
    this.placedBusinesses.push({ type, gridX, gridY });
    this.recomputeAdjacency();
    if (gameState) {
      const pd = gameState.playerData as unknown as Record<string, unknown>;
      pd._placedBusinesses = this.placedBusinesses.map(e => ({ ...e }));
      gameState.savePlayerData();
    }
    return true;
  }

  /** Sell the business at (gridX, gridY). Refunds cost * sellValueFraction. */
  sellBusiness(gridX: number, gridY: number, gameState: import('../systems/GameState').GameState): boolean {
    const types = getBusinessTypes();
    const idx = this.placedBusinesses.findIndex(e => e.gridX === gridX && e.gridY === gridY);
    if (idx < 0) return false;
    const entry = this.placedBusinesses[idx];
    const cfg = types[entry.type];
    if (!cfg) return false;

    const refund = Math.floor((cfg.cost || 0) * (cfg.sellValueFraction ?? 0.5));
    gameState.playerData.money += refund;

    // Remove from system.
    if (this.structureSystem) {
      const sIdx = this.structureSystem.structures.findIndex(s => s.gridX === gridX && s.gridY === gridY);
      if (sIdx >= 0) {
        this.structureSystem.structures.splice(sIdx, 1);
        this.drizzleTimers.splice(sIdx, 1);
      }
    }
    this.placedBusinesses.splice(idx, 1);
    this.recomputeAdjacency();

    const pd = gameState.playerData as unknown as Record<string, unknown>;
    pd._placedBusinesses = this.placedBusinesses.map(e => ({ ...e }));
    gameState.savePlayerData();
    return true;
  }

  /** Upgrade the business at (gridX, gridY) to its tier-up version. */
  upgradeBusiness(gridX: number, gridY: number, gameState: import('../systems/GameState').GameState): boolean {
    const types = getBusinessTypes();
    const idx = this.placedBusinesses.findIndex(e => e.gridX === gridX && e.gridY === gridY);
    if (idx < 0) return false;
    const entry = this.placedBusinesses[idx];
    const cfg = types[entry.type];
    if (!cfg || !cfg.upgradesTo) return false;
    const nextCfg = types[cfg.upgradesTo];
    if (!nextCfg) return false;

    // Upgrade cost uses the NEXT tier's listed cost, with the same Venture
    // Capital discount that applies to tier-1 purchases. Previously the
    // upgrade path ignored the discount, so the item's "-30% business cost"
    // promise only paid out on first-purchase.
    const discount = this.getBusinessCostMultiplier(gameState);
    const upCost = Math.floor((nextCfg.cost || 0) * discount);
    if (gameState.playerData.money < upCost) return false;
    gameState.playerData.money -= upCost;

    entry.type = cfg.upgradesTo;
    // Update structure in-place.
    if (this.structureSystem) {
      const s = this.structureSystem.structures.find(ss => ss.gridX === gridX && ss.gridY === gridY);
      if (s) s.setTier(cfg.upgradesTo, nextCfg);
    }
    this.recomputeAdjacency();

    const pd = gameState.playerData as unknown as Record<string, unknown>;
    pd._placedBusinesses = this.placedBusinesses.map(e => ({ ...e }));
    gameState.savePlayerData();
    return true;
  }

  /**
   * Compute 4-directional adjacency bonuses per cell.
   * Returns a map "gx,gy" -> { production, damage }.
   * Also populates structure.adjProductionBonus / adjDamageMult and the synergy-pair list for rendering.
   */
  computeAdjacencyBonuses(): Map<string, { production: number; damage: number }> {
    const out = new Map<string, { production: number; damage: number }>();
    const types = getBusinessTypes();
    const grid = this.getGrid();
    const pairs: Array<[Structure, Structure]> = [];

    const seenPair = new Set<string>();

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const entry = grid[gy][gx];
        if (!entry) continue;
        const cfg = types[entry.type];
        if (!cfg) continue;
        let prod = 0;
        let dmg = 0;

        const neighbors = [
          [gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
          const n = grid[ny][nx];
          if (!n) continue;
          const ncfg = types[n.type];
          if (!ncfg) continue;

          // Lab aura from neighbor benefits THIS cell.
          if (ncfg.productionAura) prod += ncfg.productionAura;
          if (ncfg.damageAura) dmg += ncfg.damageAura;

          // Synergy (mutual) — same-family counted as synergy via ID lists.
          const synA = cfg.synergiesWith || [];
          const synB = ncfg.synergiesWith || [];
          if (synA.includes(n.type) || synB.includes(entry.type)) {
            prod += 0.3;
            // Record pair once for rendering.
            const key = [`${gx},${gy}`, `${nx},${ny}`].sort().join('|');
            if (!seenPair.has(key)) {
              seenPair.add(key);
              if (this.structureSystem) {
                const sA = this.structureSystem.structures.find(s => s.gridX === gx && s.gridY === gy);
                const sB = this.structureSystem.structures.find(s => s.gridX === nx && s.gridY === ny);
                if (sA && sB) pairs.push([sA, sB]);
              }
            }
          }
        }

        out.set(`${gx},${gy}`, { production: prod, damage: dmg });
      }
    }

    return out;
  }

  /** Recompute adjacency and push values onto live structures + synergy pairs for rendering. */
  recomputeAdjacency(): void {
    if (!this.structureSystem) return;
    const bonuses = this.computeAdjacencyBonuses();
    for (const s of this.structureSystem.structures) {
      const b = bonuses.get(`${s.gridX},${s.gridY}`);
      s.adjProductionBonus = b ? b.production : 0;
      s.adjDamageMult = 1 + (b ? b.damage : 0);
    }
    // Synergy pairs list for render (reuse the computation).
    const types = getBusinessTypes();
    const grid = this.getGrid();
    const pairs: Array<[Structure, Structure]> = [];
    const seen = new Set<string>();
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const entry = grid[gy][gx];
        if (!entry) continue;
        const cfg = types[entry.type];
        if (!cfg) continue;
        const neighbors = [[gx + 1, gy], [gx, gy + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
          const n = grid[ny][nx];
          if (!n) continue;
          const ncfg = types[n.type];
          if (!ncfg) continue;
          const mutualSyn = (cfg.synergiesWith || []).includes(n.type) || (ncfg.synergiesWith || []).includes(entry.type);
          if (mutualSyn) {
            const key = [`${gx},${gy}`, `${nx},${ny}`].sort().join('|');
            if (!seen.has(key)) {
              seen.add(key);
              const sA = this.structureSystem.structures.find(s => s.gridX === gx && s.gridY === gy);
              const sB = this.structureSystem.structures.find(s => s.gridX === nx && s.gridY === ny);
              if (sA && sB) pairs.push([sA, sB]);
            }
          }
        }
      }
    }
    this.structureSystem.synergyPairs = pairs;
  }

  buyStock(type: string, waveNumber: number, gameState?: import('../systems/GameState').GameState): boolean {
    const types = getStockTypes();
    const cfg = types[type];
    if (!cfg) return false;
    // Cap stacks per BALANCE.stocks[type].maxStacks (primarily for compounding
    // stocks like Hedge Fund — unbounded stacking made them game-winning).
    const maxStacks = (cfg as unknown as { maxStacks?: number }).maxStacks;
    if (typeof maxStacks === 'number') {
      const owned = this.stocks.filter(s => s.type === type).length;
      if (owned >= maxStacks) return false;
    }
    this.stocks.push({ type, purchaseWave: waveNumber || 1 });
    if (gameState) {
      const pd = gameState.playerData as unknown as Record<string, unknown>;
      pd._ownedStocks = this.stocks.map(s => ({ ...s }));
      gameState.savePlayerData();
    }
    return true;
  }
}
