import { GAME_STATES } from '../constants';
import { BALANCE } from '../config/balance';
import { LocalStorageAdapter } from './StorageAdapter';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import { applyUpgrade } from './ItemEffects';

// Every new character-run starts with this pocket money so a rough wave 1
// still leaves the player with a small shop move.
const STARTING_MONEY = 25;

// Session-local `_`-prefixed fields that live on playerData but MUST NOT be
// persisted to disk. `syncCharacterData` filters these out; `saveActiveRun`
// (the activeRun.extras snapshot) should filter the same set.
const SESSION_LOCAL_PLAYER_KEYS: Set<string> = new Set([
  '_prevMoneyForWaveTrack',  // Capitalist: per-frame money delta tracker
  '_lastWaveStockSummary',   // Capitalist: post-wave display cache
]);
import type {
  PlayerData, SaveData, PlayerStats, CharacterSaveData,
  MetaData, UpgradePurchases, SlotData, SettingsData, RunState, RunPhase,
  PerCharacterStats, AchievementDefinition,
} from '../types';

const SAVE_VERSION = 3;
const SLOT_COUNT = 3;

export class GameState {
  storage: LocalStorageAdapter;
  currentState: string;
  currentLevel: number;
  roundTimer: number;
  saveData: SaveData;
  activeSlotIndex: number;
  selectedCharacter: string;
  playerData: PlayerData;
  // Runtime-only: achievement toast queue consumed by game.ts each frame
  pendingAchievementToasts: string[] = [];
  // Runtime-only: per-run counters used for one-run achievements (not persisted)
  runCounters: Record<string, unknown> = {};

  constructor(storageAdapter: LocalStorageAdapter | null = null) {
    this.storage = storageAdapter || new LocalStorageAdapter();
    this.currentState = GAME_STATES.MENU;
    this.currentLevel = 1;
    this.roundTimer = 0;

    this.saveData = this.loadSaveData();
    this.activeSlotIndex = this.pickInitialSlot();
    const slot = this.getActiveSlot();
    this.selectedCharacter = slot.selectedCharacter || 'fighter';
    this.playerData = this.getCharacterData(this.selectedCharacter);

    // Flush any pending throttled write before the tab closes or goes to the
    // background. Without this, a save issued in the last 500ms (kill, purchase,
    // wave end) was silently dropped on refresh/close.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flushSave());
      window.addEventListener('pagehide', () => this.flushSave());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.flushSave();
      });
    }
  }

  pickInitialSlot(): number {
    for (let i = 0; i < this.saveData.slots.length; i++) {
      if (!this.saveData.slots[i].empty) return i;
    }
    return 0;
  }

  getActiveSlot(): SlotData {
    return this.saveData.slots[this.activeSlotIndex];
  }

  // ---------- Load + Migration ----------

  loadSaveData(): SaveData {
    let raw: Record<string, unknown> | null = null;
    try {
      raw = this.storage.load() as unknown as Record<string, unknown> | null;
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.getDefaultSaveData();
    }

    try {
      return this.parseAndMigrate(raw);
    } catch (err) {
      // Any unexpected shape corruption — fall back to a clean save rather than crash.
      console.warn('[GameState] save load failed, resetting:', err);
      return this.getDefaultSaveData();
    }
  }

  private parseAndMigrate(raw: Record<string, unknown>): SaveData {
    const version = typeof raw.version === 'number' ? raw.version : 0;

    // Future-version guard. If a rollback patch serves this build to a user who
    // played on a later schema, don't try to read their v4+ save as v3 —
    // reset to a clean state rather than silently corrupt their data.
    if (version > SAVE_VERSION) {
      console.warn('[GameState] save from future version (v' + version + '), resetting');
      return this.getDefaultSaveData();
    }

    if (version < 2) {
      // v1 → inline migrate to v2 structure, then continue to v3
      raw.version = 2;
      const migratedV2 = this.migrateV1(raw);
      return this.migrateV2ToV3(migratedV2 as unknown as Record<string, unknown>);
    }

    if (version < 3) {
      return this.migrateV2ToV3(raw);
    }

    // v3 — ensure structure
    const save = raw as unknown as SaveData;
    if (!save.slots || !Array.isArray(save.slots)) {
      return this.getDefaultSaveData();
    }
    // Replace any non-object slot entries (null, strings from corrupt writes)
    // with empty slot templates — otherwise pickInitialSlot derefs null.
    for (let i = 0; i < save.slots.length; i++) {
      const s = save.slots[i];
      if (!s || typeof s !== 'object' || Array.isArray(s)) {
        save.slots[i] = this.makeEmptySlot();
      }
    }
    while (save.slots.length < SLOT_COUNT) save.slots.push(this.makeEmptySlot());
    if (save.slots.length > SLOT_COUNT) save.slots.length = SLOT_COUNT;

    if (!save.settings) save.settings = this.getDefaultSettings();
    save.settings = this.fillSettingsDefaults(save.settings);

    for (const slot of save.slots) {
      this.ensureSlotDefaults(slot);
    }

    this.installCompatAccessors(save);
    return save;
  }

  migrateV1(v1Data: Record<string, unknown>): SaveData {
    // Ported from earlier v1→v2 migration (keeps behavior)
    if (!v1Data.weaponLevels) {
      v1Data.weaponLevels = {};
      if (v1Data.weapons) {
        for (const weaponId of v1Data.weapons as string[]) {
          (v1Data.weaponLevels as Record<string, number>)[weaponId] = 1;
        }
      }
    }

    const fighterData: CharacterSaveData = {
      money: (v1Data.money as number) || 0,
      highestWave: (v1Data.unlockedLevels as number) || 1,
      stats: (v1Data.stats as PlayerStats) || this.getDefaultStats(),
      upgradePurchases: (v1Data.upgradePurchases as UpgradePurchases) || this.getDefaultUpgradePurchases(),
      weapons: (v1Data.weapons as string[]) || ['pistol'],
      weaponLevels: (v1Data.weaponLevels as Record<string, number>) || { pistol: 1 },
      items: (v1Data.items as string[]) || [],
      itemStacks: (v1Data.itemStacks as Record<string, number>) || {},
    };

    const stub: SaveData = {
      version: 2,
      slots: [],
      settings: {
        controlScheme: (v1Data.controlScheme as string) || 'MOUSE',
        aimMode: (v1Data.aimMode as string) || 'auto',
        musicEnabled: v1Data.musicEnabled !== false,
        musicVolume: 0.5,
        sfxVolume: 0.5,
      },
    };
    // Attach legacy fields so v2→v3 migrator can find them
    (stub as unknown as Record<string, unknown>).selectedCharacter = 'fighter';
    (stub as unknown as Record<string, unknown>).meta = {
      prestigePoints: 0,
      totalKills: 0,
      totalMoneyEarned: fighterData.money,
      totalWavesSurvived: 0,
      unlockedCharacters: ['fighter', 'wizard', 'manager', 'capitalist'],
      achievements: [],
    };
    (stub as unknown as Record<string, unknown>).characters = { fighter: fighterData };
    return stub;
  }

  migrateV2ToV3(v2Raw: Record<string, unknown>): SaveData {
    const settings = this.fillSettingsDefaults(
      (v2Raw.settings as SettingsData) || this.getDefaultSettings()
    );

    const slot0 = this.makeEmptySlot();
    const chars = (v2Raw.characters as Record<string, CharacterSaveData>) || {};
    const meta = (v2Raw.meta as MetaData) || this.getDefaultMeta();
    const selected = (v2Raw.selectedCharacter as string) || 'fighter';

    const hasData = Object.keys(chars).length > 0;
    if (hasData) {
      slot0.empty = false;
      slot0.createdAt = Date.now();
      slot0.updatedAt = Date.now();
      slot0.selectedCharacter = selected;
      slot0.characters = chars;
      slot0.meta = meta;
      this.refreshSnapshot(slot0);
    }

    const save: SaveData = {
      version: SAVE_VERSION,
      settings,
      slots: [slot0, this.makeEmptySlot(), this.makeEmptySlot()],
    };

    for (const slot of save.slots) this.ensureSlotDefaults(slot);

    this.installCompatAccessors(save);
    return save;
  }

  // ---------- Defaults ----------

  getDefaultSettings(): SettingsData {
    return {
      controlScheme: 'MOUSE',
      aimMode: 'auto',
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.5,
    };
  }

  fillSettingsDefaults(s: SettingsData): SettingsData {
    return {
      controlScheme: s.controlScheme || 'MOUSE',
      aimMode: s.aimMode || 'auto',
      musicEnabled: s.musicEnabled !== false,
      musicVolume: typeof s.musicVolume === 'number' ? s.musicVolume : 0.5,
      sfxVolume: typeof s.sfxVolume === 'number' ? s.sfxVolume : 0.5,
    };
  }

  getDefaultMeta(): MetaData {
    return {
      prestigePoints: 0,
      totalKills: 0,
      totalMoneyEarned: 0,
      totalWavesSurvived: 0,
      unlockedCharacters: ['fighter', 'wizard', 'manager', 'capitalist'],
      achievements: [],
      lifetimeKills: 0,
      lifetimeMoney: 0,
      lifetimePlaytimeSeconds: 0,
      lifetimeRuns: 0,
      lifetimeWins: 0,
      lifetimeDeaths: 0,
      lifetimePpEarned: 0,
      perCharacterStats: {},
      tutorialFlags: {},
    };
  }

  makeEmptySlot(): SlotData {
    return {
      empty: true,
      createdAt: 0,
      updatedAt: 0,
      playtimeSeconds: 0,
      selectedCharacter: 'fighter',
      meta: this.getDefaultMeta(),
      characters: {},
      activeRun: null,
      snapshot: { highestWave: 0, prestigePoints: 0, unlockedCount: 4 },
    };
  }

  ensureSlotDefaults(slot: SlotData): void {
    if (!slot || typeof slot !== 'object') return;
    if (typeof slot.empty !== 'boolean') slot.empty = Object.keys(slot.characters || {}).length === 0;
    if (typeof slot.createdAt !== 'number') slot.createdAt = 0;
    if (typeof slot.updatedAt !== 'number') slot.updatedAt = 0;
    if (typeof slot.selectedCharacter !== 'string') slot.selectedCharacter = 'fighter';
    if (!slot.meta) slot.meta = this.getDefaultMeta();
    if (!slot.characters) slot.characters = {};
    if (!slot.snapshot) slot.snapshot = { highestWave: 0, prestigePoints: 0, unlockedCount: 4 };
    if (typeof slot.playtimeSeconds !== 'number') slot.playtimeSeconds = 0;
    if (slot.activeRun === undefined) slot.activeRun = null;

    if (!Array.isArray(slot.meta.unlockedCharacters)) slot.meta.unlockedCharacters = [];
    const starters = ['fighter', 'wizard', 'manager', 'capitalist'];
    for (const id of starters) {
      if (!slot.meta.unlockedCharacters.includes(id)) {
        slot.meta.unlockedCharacters.push(id);
      }
    }

    // Fill lifetime/stat/tutorial defaults safely (no save version bump)
    const m = slot.meta;
    if (typeof m.lifetimeKills !== 'number') m.lifetimeKills = m.totalKills || 0;
    if (typeof m.lifetimeMoney !== 'number') m.lifetimeMoney = m.totalMoneyEarned || 0;
    if (typeof m.lifetimePlaytimeSeconds !== 'number') m.lifetimePlaytimeSeconds = 0;
    if (typeof m.lifetimeRuns !== 'number') m.lifetimeRuns = 0;
    if (typeof m.lifetimeWins !== 'number') m.lifetimeWins = 0;
    if (typeof m.lifetimeDeaths !== 'number') m.lifetimeDeaths = 0;
    if (typeof m.lifetimePpEarned !== 'number') m.lifetimePpEarned = m.prestigePoints || 0;
    if (!m.perCharacterStats) m.perCharacterStats = {};
    if (!m.tutorialFlags) m.tutorialFlags = {};
    if (!m.achievements) m.achievements = [];
  }

  getPerCharacterStats(characterId: string): PerCharacterStats {
    const meta = this.getMeta();
    if (!meta.perCharacterStats) meta.perCharacterStats = {};
    if (!meta.perCharacterStats[characterId]) {
      meta.perCharacterStats[characterId] = {
        runs: 0, wins: 0, deaths: 0, bestWave: 0, kills: 0, playtimeSeconds: 0,
      };
    }
    return meta.perCharacterStats[characterId];
  }

  getDefaultSaveData(): SaveData {
    const save: SaveData = {
      version: SAVE_VERSION,
      settings: this.getDefaultSettings(),
      slots: [this.makeEmptySlot(), this.makeEmptySlot(), this.makeEmptySlot()],
    };
    this.installCompatAccessors(save);
    return save;
  }

  getDefaultStats(): PlayerStats {
    return {
      health: BALANCE.player.baseHealth,
      speed: BALANCE.player.baseSpeed,
      damage: BALANCE.player.baseDamage,
      fireRate: BALANCE.player.baseFireRate,
      dodge: BALANCE.player.baseDodge,
      luck: BALANCE.player.baseLuck,
      critChance: BALANCE.player.baseCritChance,
      critDamage: BALANCE.player.baseCritDamage,
      pickupRange: BALANCE.player.basePickupRange,
      regeneration: BALANCE.player.baseRegeneration,
    };
  }

  getDefaultUpgradePurchases(): UpgradePurchases {
    return {
      health: 0, speed: 0, damage: 0, fireRate: 0,
      dodge: 0, luck: 0, critChance: 0, critDamage: 0, regeneration: 0,
      spellPower: 0, cooldownSpeed: 0,
    };
  }

  getDefaultCharacterData(): CharacterSaveData {
    return {
      // Starting pocket money — gives the player a buffer to make a shop move
      // even if wave 1 is rough and earns nothing.
      money: STARTING_MONEY,
      highestWave: 1,
      stats: this.getDefaultStats(),
      upgradePurchases: this.getDefaultUpgradePurchases(),
      weapons: ['pistol'],
      weaponLevels: { pistol: 1 },
      items: [],
      itemStacks: {},
    };
  }

  getDefaultCharacterDataFor(characterId: string): CharacterSaveData {
    const character = CharacterRegistry.get(characterId);
    if (!character) return this.getDefaultCharacterData();

    const startingWeapons = character.getStartingWeapons();
    const weaponLevels: Record<string, number> = {};
    for (const w of startingWeapons) {
      weaponLevels[w] = (weaponLevels[w] || 0) + 1;
    }

    const data: CharacterSaveData = {
      money: STARTING_MONEY,
      highestWave: 1,
      stats: character.getBaseStats(),
      upgradePurchases: this.getDefaultUpgradePurchases(),
      weapons: startingWeapons,
      weaponLevels,
      items: [],
      itemStacks: {},
    };

    const startingSpells = character.getStartingSpells();
    if (startingSpells) {
      data.spells = startingSpells;
      data.spellLevels = {};
      for (const s of startingSpells) data.spellLevels[s] = 1;
    }

    return data;
  }

  // ---------- Backward-compat accessors ----------

  installCompatAccessors(save: SaveData): void {
    const gs = this;
    Object.defineProperty(save, 'meta', {
      configurable: true,
      get() { return gs.getActiveSlot().meta; },
      set(v: MetaData) { gs.getActiveSlot().meta = v; },
    });
    Object.defineProperty(save, 'characters', {
      configurable: true,
      get() { return gs.getActiveSlot().characters; },
      set(v: Record<string, CharacterSaveData>) { gs.getActiveSlot().characters = v; },
    });
    Object.defineProperty(save, 'selectedCharacter', {
      configurable: true,
      get() { return gs.getActiveSlot().selectedCharacter; },
      set(v: string) { gs.getActiveSlot().selectedCharacter = v; },
    });
  }

  // ---------- Character data on active slot ----------

  getCharacterData(characterId: string): PlayerData {
    const slot = this.getActiveSlot();
    if (!slot.characters[characterId]) {
      slot.characters[characterId] = this.getDefaultCharacterDataFor(characterId);
    }
    const charData = slot.characters[characterId];

    return {
      ...charData,
      unlockedLevels: charData.highestWave,
      controlScheme: this.saveData.settings.controlScheme,
      aimMode: this.saveData.settings.aimMode,
      musicEnabled: this.saveData.settings.musicEnabled,
      spells: charData.spells || null,
      spellLevels: charData.spellLevels || null,
    } as PlayerData;
  }

  selectCharacter(characterId: string): void {
    this.syncCharacterData();
    const slot = this.getActiveSlot();
    this.selectedCharacter = characterId;
    slot.selectedCharacter = characterId;
    this.playerData = this.getCharacterData(characterId);
    this.save();
  }

  syncCharacterData(): void {
    const slot = this.getActiveSlot();
    const charData = slot.characters[this.selectedCharacter];
    if (!charData) return;
    charData.money = this.playerData.money;
    charData.highestWave = this.playerData.unlockedLevels || charData.highestWave;
    charData.stats = this.playerData.stats;
    charData.upgradePurchases = this.playerData.upgradePurchases;
    charData.weapons = this.playerData.weapons;
    charData.weaponLevels = this.playerData.weaponLevels;
    charData.items = this.playerData.items;
    charData.itemStacks = this.playerData.itemStacks;
    if (this.playerData.spells) charData.spells = this.playerData.spells;
    if (this.playerData.spellLevels) charData.spellLevels = this.playerData.spellLevels;

    // Copy through `_`-prefixed character extras (e.g. `_roster`, `_deadRoster`,
    // `_placedBusinesses`, `_ownedStocks`, `_capitalistSeeded`) so character
    // subclasses can stash persistent state on playerData. The denylist below
    // excludes session-local caches that MUST NOT cross a save boundary —
    // restoring them would corrupt next session's wave tracking / display.
    const playerAny = this.playerData as unknown as Record<string, unknown>;
    const charAny = charData as unknown as Record<string, unknown>;
    for (const key of Object.keys(playerAny)) {
      if (!key.startsWith('_')) continue;
      if (SESSION_LOCAL_PLAYER_KEYS.has(key)) continue;
      charAny[key] = playerAny[key];
    }
  }

  savePlayerData(): void {
    this.syncCharacterData();
    this.saveData.settings.controlScheme = this.playerData.controlScheme;
    this.saveData.settings.aimMode = this.playerData.aimMode;
    this.save();
  }

  refreshSnapshot(slot: SlotData): void {
    let highest = 0;
    for (const id in slot.characters) {
      const c = slot.characters[id];
      if (c.highestWave > highest) highest = c.highestWave;
    }
    slot.snapshot = {
      highestWave: highest,
      prestigePoints: slot.meta.prestigePoints,
      unlockedCount: slot.meta.unlockedCharacters.length,
    };
  }

  save(): void {
    const slot = this.getActiveSlot();
    slot.updatedAt = Date.now();
    if (!slot.empty) this.refreshSnapshot(slot);
    this.storage.save(this.saveData);
  }

  // Force pending throttled writes to disk. Call on critical events
  // (page unload, death, run end) where we cannot afford to lose state.
  flushSave(): void {
    this.storage.flush();
  }

  // ---------- Slot operations ----------

  loadSlot(idx: number): void {
    if (idx < 0 || idx >= this.saveData.slots.length) return;
    this.activeSlotIndex = idx;
    const slot = this.getActiveSlot();
    this.ensureSlotDefaults(slot);
    this.selectedCharacter = slot.selectedCharacter || 'fighter';
    this.playerData = this.getCharacterData(this.selectedCharacter);
  }

  deleteSlot(idx: number): void {
    if (idx < 0 || idx >= this.saveData.slots.length) return;
    this.saveData.slots[idx] = this.makeEmptySlot();
    if (this.activeSlotIndex === idx) {
      // Active slot was wiped — reset in-memory references so nothing leaks
      // from the deleted slot into later reads.
      this.selectedCharacter = 'fighter';
      this.saveData.slots[idx].selectedCharacter = 'fighter';
      this.playerData = this.getCharacterData('fighter');
    }
    this.storage.flush();
    this.storage.save(this.saveData);
    this.storage.flush();
  }

  // Mark the active slot as in-use without resetting playerData. Use this when
  // the player has already picked a character and populated playerData via
  // selectCharacter + starting setup; calling createNewSlot at that point would
  // throw away the starting-setup selections.
  markActiveSlotInUse(characterId: string): void {
    const slot = this.getActiveSlot();
    if (!slot.empty) return;
    slot.empty = false;
    slot.createdAt = Date.now();
    slot.updatedAt = Date.now();
    slot.selectedCharacter = characterId;
    this.syncCharacterData();
    this.save();
  }

  createNewSlot(idx: number, characterId: string): void {
    if (idx < 0 || idx >= this.saveData.slots.length) return;
    const slot = this.makeEmptySlot();
    slot.empty = false;
    slot.createdAt = Date.now();
    slot.updatedAt = Date.now();
    slot.selectedCharacter = characterId;
    this.saveData.slots[idx] = slot;
    this.activeSlotIndex = idx;
    this.selectedCharacter = characterId;
    this.playerData = this.getCharacterData(characterId);
    this.save();
  }

  getSlots(): SlotData[] { return this.saveData.slots; }

  // ---------- Active run ----------

  hasActiveRun(): boolean {
    const slot = this.getActiveSlot();
    return !slot.empty && slot.activeRun !== null;
  }

  getActiveRun(): RunState | null {
    return this.getActiveSlot().activeRun;
  }

  saveActiveRun(phase: RunPhase, currentWave: number): void {
    const slot = this.getActiveSlot();
    if (slot.empty) return;
    const pd = this.playerData;

    const extras: Record<string, unknown> = {};
    const pdAny = pd as unknown as Record<string, unknown>;
    for (const key of Object.keys(pdAny)) {
      if (!key.startsWith('_')) continue;
      if (SESSION_LOCAL_PLAYER_KEYS.has(key)) continue;
      extras[key] = pdAny[key];
    }

    slot.activeRun = {
      characterId: this.selectedCharacter,
      currentWave,
      money: pd.money,
      stats: { ...pd.stats },
      weapons: [...pd.weapons],
      weaponLevels: { ...pd.weaponLevels },
      items: [...pd.items],
      itemStacks: { ...pd.itemStacks },
      spells: pd.spells ? [...pd.spells] : null,
      spellLevels: pd.spellLevels ? { ...pd.spellLevels } : null,
      phase,
      extras: extras as unknown as RunState['extras'],
    };
    this.save();
  }

  clearActiveRun(): void {
    const slot = this.getActiveSlot();
    slot.activeRun = null;
    this.save();
  }

  // Reset the active character's per-run state (weapons, items, money, spells) back
  // to fresh defaults. Preserves highestWave, stat upgrade purchases, and meta progression.
  resetActiveCharacterToDefaults(): void {
    const characterId = this.selectedCharacter;
    const slot = this.getActiveSlot();
    const existing = slot.characters[characterId];
    const fresh = this.getDefaultCharacterDataFor(characterId);
    if (existing) {
      // Keep permanent meta progression on the character.
      fresh.highestWave = existing.highestWave;
      fresh.upgradePurchases = existing.upgradePurchases;
      // Replay each purchased stat upgrade onto the fresh base stats so the
      // character's actual stat values stay consistent with their purchase
      // count across deaths. Previously the counts were preserved but the
      // stats weren't, so costs scaled correctly while the stats silently
      // reverted to base on every death.
      const purchases = existing.upgradePurchases as Record<string, number>;
      const up = BALANCE.upgrades as Record<string, { value: number }>;
      for (const key in purchases) {
        const count = purchases[key] || 0;
        const def = up[key];
        if (!def || count <= 0) continue;
        for (let i = 0; i < count; i++) {
          applyUpgrade(key, def.value, fresh as unknown as import('../types').PlayerData);
        }
      }
    }
    slot.characters[characterId] = fresh;
    this.playerData = this.getCharacterData(characterId);
    this.save();
  }

  // ---------- Progression ----------

  resetProgress(): void {
    // Preserve user settings (volumes, control scheme) but wipe everything else.
    const preservedSettings = this.saveData.settings;
    this.saveData = {
      version: SAVE_VERSION,
      settings: preservedSettings,
      slots: [this.makeEmptySlot(), this.makeEmptySlot(), this.makeEmptySlot()],
    };
    this.installCompatAccessors(this.saveData);
    this.activeSlotIndex = 0;
    this.selectedCharacter = 'fighter';
    this.pendingAchievementToasts.length = 0;
    this.runCounters = {};
    this.playerData = this.getCharacterData('fighter');
    this.storage.flush();
    this.storage.save(this.saveData);
    this.storage.flush();
  }

  completeLevel(level: number, moneyEarned: number, kills: number = 0): void {
    this.playerData.money += moneyEarned;

    if (level >= (this.playerData.unlockedLevels || 1) && level < 30) {
      this.playerData.unlockedLevels = level + 1;
    }

    let pp = 1;
    if (level % 10 === 0) pp += 5;
    const slot = this.getActiveSlot();
    slot.meta.prestigePoints += pp;
    slot.meta.totalWavesSurvived++;
    slot.meta.totalKills += kills;
    slot.meta.totalMoneyEarned += moneyEarned;
    // NOTE: `lifetimeKills` is incremented per-kill inside `recordKill()`. Do
    // NOT re-add the wave's `kills` here — that caused every kill-threshold
    // achievement (kills100 / kills500 / kills1000) to fire at ~half the
    // intended count. Keep `lifetimeMoney` aggregation here because per-pickup
    // tracking would require a different plumbing path.
    slot.meta.lifetimeMoney = (slot.meta.lifetimeMoney || 0) + moneyEarned;
    slot.meta.lifetimePpEarned = (slot.meta.lifetimePpEarned || 0) + pp;

    // Per-character wave best
    const pcs = this.getPerCharacterStats(this.selectedCharacter);
    if (level > pcs.bestWave) pcs.bestWave = level;
    pcs.kills += kills;

    // Achievement checks
    const extras = this.runCounters.lastWaveExtras as unknown as Record<string, unknown> | undefined;
    this.checkAchievements('waveComplete', {
      wave: level,
      character: this.selectedCharacter,
      noDamage: extras?.noDamage || false,
      noShots: extras?.noShots || false,
      lateFinish: extras?.lateFinish || false,
    });
    delete this.runCounters.lastWaveExtras;

    if (level >= 30) {
      this.checkRunWinUnlocks();
      slot.meta.lifetimeWins = (slot.meta.lifetimeWins || 0) + 1;
      pcs.wins++;
      this.checkAchievements('runWin', { character: this.selectedCharacter });
    }

    this.savePlayerData();
  }

  checkRunWinUnlocks(): void {
    const UNLOCK_MAP: Record<string, string> = {
      fighter: 'glassCannon',
      wizard: 'vampire',
      manager: 'hulk',
      capitalist: 'speedster',
    };
    const reward = UNLOCK_MAP[this.selectedCharacter];
    const slot = this.getActiveSlot();
    if (reward && !slot.meta.unlockedCharacters.includes(reward)) {
      slot.meta.unlockedCharacters.push(reward);
    }
  }

  addPrestigePoints(amount: number): void {
    this.getActiveSlot().meta.prestigePoints += amount;
    this.save();
  }

  unlockCharacter(characterId: string): void {
    const slot = this.getActiveSlot();
    if (!slot.meta.unlockedCharacters.includes(characterId)) {
      slot.meta.unlockedCharacters.push(characterId);
      this.save();
    }
  }

  isCharacterUnlocked(characterId: string): boolean {
    return this.getActiveSlot().meta.unlockedCharacters.includes(characterId);
  }

  // Runtime override: when set, getUnlockedCharacters returns a superset (used by dev mode).
  _devUnlockAll: string[] | null = null;

  getUnlockedCharacters(): string[] {
    if (this._devUnlockAll) return this._devUnlockAll;
    return this.getActiveSlot().meta.unlockedCharacters;
  }

  getMeta(): MetaData {
    return this.getActiveSlot().meta;
  }

  getSettings(): SettingsData {
    return this.saveData.settings;
  }

  setState(newState: string): void {
    this.currentState = newState;
  }

  getState(): string {
    return this.currentState;
  }

  addPlaytime(seconds: number): void {
    const slot = this.getActiveSlot();
    if (!slot.empty) {
      slot.playtimeSeconds += seconds;
      slot.meta.lifetimePlaytimeSeconds = (slot.meta.lifetimePlaytimeSeconds || 0) + seconds;
      const pcs = this.getPerCharacterStats(this.selectedCharacter);
      pcs.playtimeSeconds += seconds;
    }
  }

  // ---------- Tutorial flags ----------

  hasTutorialFlag(key: string): boolean {
    const flags = this.getMeta().tutorialFlags || {};
    return !!flags[key];
  }

  setTutorialFlag(key: string): void {
    const meta = this.getMeta();
    if (!meta.tutorialFlags) meta.tutorialFlags = {};
    if (meta.tutorialFlags[key]) return;
    meta.tutorialFlags[key] = true;
    this.save();
  }

  // ---------- Achievements ----------

  getAchievementDefinitions(): AchievementDefinition[] {
    return (BALANCE as unknown as { achievements?: AchievementDefinition[] }).achievements || [];
  }

  getAchievementDefinition(id: string): AchievementDefinition | null {
    return this.getAchievementDefinitions().find(a => a.id === id) || null;
  }

  hasAchievement(id: string): boolean {
    return this.getMeta().achievements.includes(id);
  }

  grantAchievement(id: string): boolean {
    const meta = this.getMeta();
    if (meta.achievements.includes(id)) return false;
    const def = this.getAchievementDefinition(id);
    if (!def) return false;
    meta.achievements.push(id);

    if (def.reward) {
      if (def.reward.prestigePoints) {
        meta.prestigePoints += def.reward.prestigePoints;
        // NOTE: we intentionally do NOT credit achievement-reward PP to
        // `lifetimePpEarned`. That field is what gates `pp500`; mixing rewards
        // in creates a feedback loop where granting a PP achievement advances
        // the player toward the next PP-threshold achievement on the same tick.
      }
      if (def.reward.character && !meta.unlockedCharacters.includes(def.reward.character)) {
        meta.unlockedCharacters.push(def.reward.character);
      }
    }

    this.pendingAchievementToasts.push(id);
    this.save();
    return true;
  }

  // Incremental achievement check. payload shape varies by eventType.
  checkAchievements(eventType: string, payload?: Record<string, unknown>): void {
    const meta = this.getMeta();
    const p = payload || {};

    if (eventType === 'kill') {
      if (!this.hasAchievement('firstBlood')) this.grantAchievement('firstBlood');
      const total = meta.lifetimeKills || 0;
      if (total >= 100) this.grantAchievement('kills100');
      if (total >= 500) this.grantAchievement('kills500');
      if (total >= 1000) this.grantAchievement('kills1000');
    } else if (eventType === 'death') {
      if (!this.hasAchievement('firstDeath')) this.grantAchievement('firstDeath');
    } else if (eventType === 'bossKill') {
      if (!this.hasAchievement('firstBoss')) this.grantAchievement('firstBoss');
    } else if (eventType === 'waveComplete') {
      const wave = (p.wave as number) || 0;
      if (wave >= 5) this.grantAchievement('wave5');
      if (wave >= 10) this.grantAchievement('wave10');
      if (wave >= 20) this.grantAchievement('wave20');
      if (wave >= 30) this.grantAchievement('wave30');
      if (p.noDamage) this.grantAchievement('flawlessWave');
      if (p.noShots) this.grantAchievement('pacifistWave');
      if (p.lateFinish) this.grantAchievement('veryLate');
      if ((meta.lifetimeMoney || 0) >= 5000) this.grantAchievement('bigSpender');
      if ((meta.lifetimePpEarned || 0) >= 500) this.grantAchievement('pp500');
      const wepCount = (this.playerData.weapons || []).length;
      if (wepCount >= 10) this.grantAchievement('weaponCollector');
      // Distinct characters played (have per-character runs > 0)
      const pcs = meta.perCharacterStats || {};
      let distinct = 0;
      for (const id in pcs) if (pcs[id].runs > 0) distinct++;
      if (distinct >= 4) this.grantAchievement('fourCharacters');
    } else if (eventType === 'runWin') {
      const id = (p.character as string) || this.selectedCharacter;
      const map: Record<string, string> = {
        fighter: 'winFighter', wizard: 'winWizard',
        manager: 'winManager', capitalist: 'winCapitalist',
        glassCannon: 'winGlassCannon', vampire: 'winVampire',
        hulk: 'winHulk', speedster: 'winSpeedster',
      };
      if (map[id]) this.grantAchievement(map[id]);
    } else if (eventType === 'weaponPurchased') {
      // Per-run counter
      const cur = (this.runCounters.weaponsBought as number) || 0;
      this.runCounters.weaponsBought = cur + 1;
      if (cur + 1 >= 10) this.grantAchievement('weaponCollector');
    } else if (eventType === 'runStart') {
      // Count a run and distinct-character check
      meta.lifetimeRuns = (meta.lifetimeRuns || 0) + 1;
      const pcs = this.getPerCharacterStats((p.character as string) || this.selectedCharacter);
      pcs.runs++;
      this.runCounters = {}; // reset per-run counters
      this.save();
    } else if (eventType === 'runDeath') {
      meta.lifetimeDeaths = (meta.lifetimeDeaths || 0) + 1;
      const pcs = this.getPerCharacterStats((p.character as string) || this.selectedCharacter);
      pcs.deaths++;
      if (!this.hasAchievement('firstDeath')) this.grantAchievement('firstDeath');
      this.save();
    }
  }

  // Helper: increment a lifetime kill and fire achievement check.
  // Save-throttling: regular kills rely on the next waveComplete/achievement
  // flush (removed the per-kill `save()` — on a dense wave that produced
  // 60–100 synchronous localStorage writes per wave, causing frame hitches).
  // Boss kills still force a save immediately (rare + high-value).
  recordKill(enemyType?: string): void {
    const slot = this.getActiveSlot();
    if (slot.empty) return;
    slot.meta.lifetimeKills = (slot.meta.lifetimeKills || 0) + 1;
    this.checkAchievements('kill');
    if (enemyType === 'boss') {
      this.checkAchievements('bossKill');
      this.save();
    }
  }

  consumePendingToasts(): string[] {
    if (this.pendingAchievementToasts.length === 0) return [];
    const out = this.pendingAchievementToasts.slice();
    this.pendingAchievementToasts.length = 0;
    return out;
  }
}
