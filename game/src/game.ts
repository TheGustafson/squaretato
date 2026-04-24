import { Player } from './entities/Player';
import { Pickup } from './entities/Pickup';
import { Enemy } from './entities/Enemy';
import { WeaponSystem, createWeapon } from './systems/WeaponSystem';
import { SpawnSystem } from './systems/SpawnSystem';
import { GameState } from './systems/GameState';
import { Menu } from './ui/Menu';
import { CharacterScreen } from './ui/CharacterScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { ControlsScreen } from './ui/ControlsScreen';
import { ShopScreen } from './ui/ShopScreen';
import { UpgradeScreen } from './ui/UpgradeScreen';
import { GameOverScreen } from './ui/GameOverScreen';
import { RoundStatsScreen } from './ui/RoundStatsScreen';
import { PauseMenu } from './ui/PauseMenu';
import { CharacterSelectScreen } from './ui/CharacterSelectScreen';
import { LevelSelectScreen } from './ui/LevelSelectScreen';
import { StartingSetupScreen } from './ui/StartingSetupScreen';
import { CharacterRegistry } from './characters/CharacterRegistry';
import { EffectsSystem } from './systems/EffectsSystem';
import { SoundSystem } from './systems/SoundSystem';
import { VirtualJoystick } from './ui/VirtualJoystick';
import { RunCompleteScreen } from './ui/RunCompleteScreen';
import { Boss } from './entities/Boss';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { AchievementToast } from './ui/AchievementToast';
import { AchievementsScreen } from './ui/AchievementsScreen';
import { StatsScreen } from './ui/StatsScreen';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { GAME_CONFIG, GAME_STATES, COLORS } from './constants';
import { BALANCE } from './config/balance';
import type { GameCanvas, GameAPI, Vec2 } from './types';
import type { BaseCharacter } from './characters/BaseCharacter';
import type { Input } from './input';

type ActiveScreen =
  | 'menu' | 'character' | 'characterSelect' | 'startingSetup'
  | 'levelSelect' | 'settings' | 'controls' | 'shop' | 'upgrade'
  | 'roundStats' | 'gameOver' | 'runComplete'
  | 'achievements' | 'stats';

interface RoundStats {
  damageTaken: number;
  enemiesKilled: number;
  totalDamageDealt: number;
  moneyCollected: number;
  moneySpawned: number;
  killsByWeapon: Map<string, number>;
  killsByType: Map<string, number>;
  damageByWeapon: Map<string, number>;
}

declare global {
  interface Window {
    debugGame?: () => string;
    giveMoney?: (amount?: number) => string;
    skipToWave?: (n: number) => string;
    unlockAllCharacters?: () => string;
    grantAllItems?: () => string;
    killAllEnemies?: () => string;
    maxMeter?: () => string;
    maxMomentum?: () => string;
    maxSurge?: () => string;
    maxRage?: () => string;
    maxVelocity?: () => string;
    maxBullMarket?: () => string;
    maxBloodBank?: () => string;
    maxStreak?: () => string;
    maxAdaptation?: () => string;
    maxCommand?: () => string;
    triggerAllAchievements?: () => string;
    godMode?: () => string;
    devMode?: (on?: boolean) => string;
    listCommands?: () => string;
  }
}

export class Game implements GameAPI {
  private canvas: GameCanvas;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private gameState: GameState;
  private player!: Player;
  private enemies: Enemy[];
  private projectiles: import('./entities/Projectile').Projectile[];
  private pickups: Pickup[];
  private weaponSystem!: WeaponSystem;
  private spawnSystem!: SpawnSystem;
  private effectsSystem: EffectsSystem;
  private soundSystem: SoundSystem;
  private mousePosition: Vec2 | null;
  private roundTimer: number;
  private moneyEarned: number;
  private lastCountdownSecond: number = 0;
  private totalKills: number;
  private isPaused: boolean;
  private weaponDamageStats: Map<string, number>;
  private roundStats: RoundStats | null;
  private character: BaseCharacter | null;
  private delayedRageTimer: number;
  private delayedBasicSeedTimer: number;
  private secondBasicSeedTimer: number;
  // Boss-wave only: recurring speedy-cyan burst. Fires first at 2s then every 10s.
  private bossSpeedyBurstTimer: number;
  private bossSpeedyBurstActive: boolean;
  private vacuumWaitTimer: number;
  private vacuumActive: boolean;
  private vacuumDuration: number;
  private bgm: HTMLAudioElement;
  private musicStarted: boolean;
  private musicBaseVolume: number = 0.5;
  private _devMode: boolean = false;
  private musicLastPlayed: string | null = null;
  private musicCrossfading: boolean = false;
  private playtimeAccumulator: number = 0;
  private runTimeAccumulator: number = 0;
  private runPpEarned: number = 0;
  private runMoneyEarned: number = 0;
  private runKills: number = 0;
  private runDamageDealt: number = 0;
  // True iff the most recent wave ended via timer-expiry (the "last possible
  // second" condition for the veryLate achievement). Boss wave kills clear it.
  private _lastWaveCompletedByTimer: boolean = false;
  private pendingOverlayScreen: ActiveScreen | null = null;
  private musicTracks: string[];
  private musicPlaylist: string[];
  private musicIndex: number;
  private joystick: VirtualJoystick;
  private lastTouchY: number | null;

  private _activeScreen: ActiveScreen = 'menu';
  private _transitionAlpha: number = 0;
  private _transitionDuration: number = 0.12;
  private _lastDt: number = 0;
  private _musicDynamicsTimer: number = 0;
  get activeScreen(): ActiveScreen { return this._activeScreen; }
  set activeScreen(v: ActiveScreen) {
    if (this._activeScreen !== v) this._transitionAlpha = 1.0;
    this._activeScreen = v;
  }
  menu: Menu;
  characterScreen: CharacterScreen;
  characterSelectScreen: CharacterSelectScreen;
  startingSetupScreen: StartingSetupScreen;
  levelSelectScreen: LevelSelectScreen;
  settingsScreen: SettingsScreen;
  controlsScreen: ControlsScreen;
  shopScreen: ShopScreen;
  upgradeScreen: UpgradeScreen;
  gameOverScreen: GameOverScreen;
  roundStatsScreen: RoundStatsScreen;
  pauseMenu: PauseMenu;
  runCompleteScreen: RunCompleteScreen;
  achievementsScreen!: AchievementsScreen;
  statsScreen!: StatsScreen;
  achievementToast!: AchievementToast;
  tutorialOverlay!: TutorialOverlay;
  shopBackAction: () => void;
  private _bossPhaseSlowTimer: number = 0;
  private _newlyUnlockedThisRun: string[] = [];

  private _charScreenBackTarget: string | null = null;
  private _cachedDmgText: string | null = null;
  private _cachedDmgAt: number = 0;

  // HUD/grid render-scratch (avoids per-frame object literals & string churn)
  private static readonly FONT_HP_LABEL = 'bold 18px monospace';
  private static readonly FONT_HP_VAL = 'bold 13px monospace';
  private static readonly FONT_MONEY = 'bold 20px monospace';
  private static readonly FONT_WAVE = 'bold 32px monospace';
  private static readonly FONT_TIMER = 'bold 40px monospace';
  private static readonly FONT_BOSS = 'bold 28px monospace';
  private static readonly FONT_STATS = 'bold 12px monospace';
  private static readonly FONT_RIGHT = 'bold 16px monospace';
  private static readonly FONT_HINT = '11px monospace';
  private static readonly FONT_DMG = 'bold 12px monospace';
  private static readonly FONT_COIN = 'bold 9px monospace';
  private static readonly FONT_BOSS_LABEL = 'bold 13px monospace';
  private static readonly FONT_BANNER = 'bold 36px monospace';

  constructor(canvas: GameCanvas, ctx: CanvasRenderingContext2D, input: Input) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = input;
    this.gameState = new GameState();
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.mousePosition = null;
    this.roundTimer = 0;
    this.moneyEarned = 0;
    this.totalKills = 0;
    this.isPaused = false;
    this.weaponDamageStats = new Map();
    this.roundStats = null;
    this.character = null;
    this.delayedRageTimer = 0;
    this.delayedBasicSeedTimer = 0;
    this.secondBasicSeedTimer = 0;
    this.bossSpeedyBurstTimer = 0;
    this.bossSpeedyBurstActive = false;
    this.vacuumWaitTimer = 0;
    this.vacuumActive = false;
    this.vacuumDuration = 0;
    this.lastTouchY = null;
    this.musicIndex = 0;

    this.effectsSystem = new EffectsSystem(canvas);
    this.soundSystem = new SoundSystem();

    this.menu = new Menu(canvas, this.gameState);
    this.characterScreen = new CharacterScreen(canvas, this.gameState);
    this.characterScreen.onBackClick = () => {
      if (this._charScreenBackTarget === 'levelSelect' || this._charScreenBackTarget === 'afterWaveShop') {
        this._charScreenBackTarget = null;
        this.showLevelSelect();
      } else {
        this.showCharacterSelectScreen();
      }
    };
    this.characterScreen.onContinueClick = () => {
      this._charScreenBackTarget = null;
      this.showLevelSelect();
    };
    this.settingsScreen = new SettingsScreen(canvas, this.gameState);
    this.controlsScreen = new ControlsScreen(canvas);
    this.shopScreen = new ShopScreen(canvas, this.gameState, this.soundSystem);
    this.upgradeScreen = new UpgradeScreen(canvas, this.gameState, this.soundSystem);
    this.gameOverScreen = new GameOverScreen(canvas, this.gameState);

    this.musicTracks = [
      'Last_Quarter_Run.mp3',
      'Against_the_Drain.mp3',
      'Run_The_Gauntlet.mp3',
      'Ten_Second_Profit.mp3',
      'The_Wizard_s_Last_Wave.mp3',
    ];
    this.musicPlaylist = [];
    this.shufflePlaylist();
    this.bgm = new Audio(this.musicPlaylist[0]);
    // Default mix: -20% music so it sits under SFX (which gets +20% in SoundSystem).
    // Slider stays 0-1; the scalar lives at the audio-output layer.
    this.musicBaseVolume = Math.max(0, Math.min(1, (this.gameState.getSettings().musicVolume ?? 0.5) * 0.64));
    this.bgm.volume = this.musicBaseVolume;
    this.soundSystem.setSfxVolume(this.gameState.getSettings().sfxVolume ?? 0.5);
    this.musicStarted = false;
    // Crossfade scheduler: when the current track is within ~1s of ending, start fading to next.
    this.bgm.addEventListener('timeupdate', () => this.maybeStartCrossfade());
    // Fallback when crossfade didn't run (short tracks, seek, etc.)
    this.bgm.addEventListener('ended', () => {
      if (!this.musicCrossfading) this.playNextTrack();
    });
    // Dynamics: duck when paused (-50%), boost during boss waves (+20%).
    // Driven from the main update loop via _musicDynamicsTimer (no setInterval;
    // interval timers can't be paused with the game, leak on teardown, and
    // violate the "no setTimeout in the game loop" rule).

    const tryPlayMusic = (): void => {
      if (this.musicStarted) return;
      if ((this.gameState.playerData as unknown as Record<string, unknown>).musicEnabled === false) return;
      this.bgm.play().then(() => {
        this.musicStarted = true;
        window.removeEventListener('click', tryPlayMusic, true);
        window.removeEventListener('touchend', tryPlayMusic, true);
        window.removeEventListener('keydown', tryPlayMusic, true);
      }).catch(() => {});
    };
    window.addEventListener('click', tryPlayMusic, true);
    window.addEventListener('touchend', tryPlayMusic, true);
    window.addEventListener('keydown', tryPlayMusic, true);

    this.characterSelectScreen = new CharacterSelectScreen(canvas, this.gameState);
    this.startingSetupScreen = new StartingSetupScreen(canvas, this.gameState);
    this.levelSelectScreen = new LevelSelectScreen(canvas, this.gameState);
    this.roundStatsScreen = new RoundStatsScreen(canvas, this.gameState);
    this.runCompleteScreen = new RunCompleteScreen(canvas, this.gameState);
    this.runCompleteScreen.onNewRun = () => {
      this.runCompleteScreen.deactivate();
      this.runTimeAccumulator = 0;
      this.runPpEarned = 0;
      this.runMoneyEarned = 0;
      this.runKills = 0; this.runDamageDealt = 0;
      // Create a fresh slot for same character
      this.gameState.createNewSlot(this.gameState.activeSlotIndex, this.gameState.selectedCharacter);
      this.showStartingSetup();
    };
    this.runCompleteScreen.onChangeCharacter = () => {
      this.runCompleteScreen.deactivate();
      this.showCharacterSelectScreen();
    };
    this.runCompleteScreen.onMainMenu = () => {
      this.runCompleteScreen.deactivate();
      this.showMenu();
    };
    this.pauseMenu = new PauseMenu(canvas);
    this.achievementsScreen = new AchievementsScreen(canvas, this.gameState);
    this.statsScreen = new StatsScreen(canvas, this.gameState);
    this.achievementToast = new AchievementToast(canvas, this.gameState, this.soundSystem);
    this.tutorialOverlay = new TutorialOverlay(canvas, this.gameState);
    this.achievementsScreen.onBackClick = () => this.showMenu();
    this.statsScreen.onBackClick = () => this.showMenu();
    this.activeScreen = 'menu';
    this.joystick = new VirtualJoystick(canvas);

    ConfirmDialog.register(canvas);

    this.menu.onContinueRun = () => this.continueRunFromSlot();
    this.menu.onNewRunClick = () => this.menu.requestNewRun();
    this.menu.onNewRunConfirmed = () => this.showCharacterSelectScreen();
    this.menu.onSettingsClick = () => this.showSettings();
    this.menu.onHelpClick = () => this.showControls();
    this.controlsScreen.onBackClick = () => this.showMenu();
    this.menu.onAchievementsClick = () => this.showAchievementsScreen();
    this.menu.onStatsClick = () => this.showStatsScreen();
    this.characterSelectScreen.onEndRunClick = () => this.showMenu();
    this.characterSelectScreen.onStartWaveClick = () => this.showStartingSetup();
    this.startingSetupScreen.onContinue = () => {
      this.runTimeAccumulator = 0;
      this.runPpEarned = 0;
      this.runMoneyEarned = 0;
      this.runKills = 0; this.runDamageDealt = 0;
      // Mark the slot as active without destroying playerData the starting setup
      // just wrote (startingBusiness, startingStance, startingDashStyle, etc.).
      // createNewSlot reassigns playerData — don't use it here.
      this.gameState.markActiveSlotInUse(this.gameState.selectedCharacter);
      this.showLevelSelect();
    };
    this.startingSetupScreen.onBack = () => this.showCharacterSelectScreen();
    this.levelSelectScreen.onLevelSelect = (level: number) => this.startLevel(level);
    this.levelSelectScreen.onEndRunClick = () => this.showMenu();
    this.levelSelectScreen.onShopClick = () => this.showShopFromRun();
    this.levelSelectScreen.onUpgradesClick = () => this.showCharacterScreenFromRun();

    this.settingsScreen.onBackClick = () => {
      if (this.pendingOverlayScreen) {
        const back = this.pendingOverlayScreen;
        this.pendingOverlayScreen = null;
        if (back === 'menu') this.showMenu();
        // Otherwise just close settings; pause state is preserved
        else this.activeScreen = back;
      } else {
        this.showMenu();
      }
    };
    this.settingsScreen.onMusicChange = (enabled: boolean) => {
      if (enabled) {
        this.musicStarted = false;
        this.bgm.play().then(() => { this.musicStarted = true; }).catch(() => {});
      } else {
        this.bgm.pause();
        this.musicStarted = false;
      }
    };
    this.settingsScreen.onVolumeChange = (kind, value) => {
      if (kind === 'music') {
        // Stacked default-mix scalar (-20% twice). Slider stays centered; actual
        // output is 0.64× so music sits well under SFX.
        this.musicBaseVolume = Math.max(0, Math.min(1, value * 0.64));
        this.applyMusicDynamics();
      } else {
        this.soundSystem.setSfxVolume(value);
      }
    };
    this.shopScreen.onBackClick = () => this.shopBackAction();
    this.shopScreen.onContinueClick = () => this.afterWaveShopContinue();
    this.upgradeScreen.onUpgradeSelected = () => this.showShopAfterWave();
    this.upgradeScreen.onContinueToNextLevel = () => this.showShopAfterWave();
    this.roundStatsScreen.onContinueClick = () => this.showUpgradeScreen();
    this.shopBackAction = () => this.showLevelSelect();
    this.gameOverScreen.onContinueClick = () => this.showMenu();
    this.pauseMenu.onResumeClick = () => this.resumeGame();
    this.pauseMenu.onMainMenuClick = () => this.pauseToMenu();
    this.pauseMenu.onOptionsClick = () => this.showSettingsFromPause();
    this.pauseMenu.onSaveQuitClick = () => this.saveAndQuitToMenu();

    this.setupMouseTracking();
    this.showMenu();

    window.debugGame = (): string => {
      console.log('=== GAME DEBUG INFO ===');
      console.log('Enemies:', this.enemies.length);
      console.log('Projectiles:', this.projectiles.length);
      console.log('Game State:', this.gameState.getState());
      console.log('GAME_CONFIG.UI_BAR_HEIGHT:', GAME_CONFIG.UI_BAR_HEIGHT);
      console.log('GAME_CONFIG.ENEMY_SIZE:', GAME_CONFIG.ENEMY_SIZE);
      console.log('BALANCE.enemy.size:', BALANCE.enemy.size);
      if (this.enemies.length > 0) {
        console.log('Sample enemy:', this.enemies[0]);
      }
      return 'Debug info printed above';
    };
    window.giveMoney = (amount: number = 9999): string => {
      this.gameState.playerData.money += amount;
      this.gameState.savePlayerData();
      return `Added $${amount}. Total: $${this.gameState.playerData.money}`;
    };

    // ---- Dev / playtesting helpers ----
    const safe = <T>(fn: () => T, label: string): string => {
      try {
        const out = fn();
        return typeof out === 'string' ? out : `${label}: ok`;
      } catch (err) {
        console.error(`[debug:${label}]`, err);
        return `${label}: error (see console)`;
      }
    };

    window.skipToWave = (n: number): string => safe(() => {
      const target = Math.max(1, Math.min(GAME_CONFIG.TOTAL_LEVELS || 30, Math.floor(n)));
      this.startLevel(target);
      return `Jumped to wave ${target}.`;
    }, 'skipToWave');

    window.unlockAllCharacters = (): string => safe(() => {
      const ids = CharacterRegistry.getAllIds();
      let added = 0;
      for (const id of ids) {
        if (!this.gameState.isCharacterUnlocked(id)) {
          this.gameState.unlockCharacter(id);
          added++;
        }
      }
      return `Unlocked ${added} characters (${ids.length} total).`;
    }, 'unlockAllCharacters');

    window.grantAllItems = (): string => safe(() => {
      const pd = this.gameState.playerData as unknown as {
        items: string[]; itemStacks: Record<string, number>;
      };
      if (!pd.items) pd.items = [];
      if (!pd.itemStacks) pd.itemStacks = {};
      const itemIds = Object.keys(BALANCE.items as Record<string, unknown>);
      let granted = 0;
      for (const id of itemIds) {
        if (!pd.items.includes(id)) {
          pd.items.push(id);
          granted++;
        }
        if (!pd.itemStacks[id] || pd.itemStacks[id] < 1) {
          pd.itemStacks[id] = 1;
        }
      }
      this.gameState.savePlayerData();
      return `Granted ${granted} new items (${itemIds.length} total, stack 1 each). Restart wave to fully apply stats.`;
    }, 'grantAllItems');

    window.killAllEnemies = (): string => safe(() => {
      let n = 0;
      for (const e of this.enemies) {
        if (e.alive) {
          e.health = 0;
          e.alive = false;
          n++;
        }
      }
      return `Killed ${n} enemies.`;
    }, 'killAllEnemies');

    const setMeter = (): string => {
      const ch = this.character as unknown as Record<string, number | boolean> | null;
      if (!ch) return 'No active character (not in a run).';
      const id = this.gameState.selectedCharacter;
      // Pair of (field, max-field-or-fallback)
      const pairs: Array<[string, string | number]> = [
        ['momentum', 'momentumMax'],
        ['surge', 100],
        ['rage', 'rageMax'],
        ['velocity', 'velocityMax'],
        ['bullMarketFill', 'bullMarketFillMax'],
        ['bloodBank', 'bloodBankCapacity'],
        ['killStreak', 'streakCap'],
        ['adaptation', 'adaptationMax'],
        ['command', 'commandMax'],
      ];
      const filled: string[] = [];
      for (const [field, maxRef] of pairs) {
        if (typeof ch[field] === 'number') {
          const max = typeof maxRef === 'number'
            ? maxRef
            : (typeof ch[maxRef] === 'number' ? ch[maxRef] as number : 100);
          ch[field] = max;
          filled.push(`${field}=${max}`);
        }
      }
      if (filled.length === 0) return `No known meter on character ${id}.`;
      return `Filled ${id} meter(s): ${filled.join(', ')}.`;
    };
    window.maxMeter = (): string => safe(setMeter, 'maxMeter');
    window.maxMomentum = window.maxMeter;
    window.maxSurge = window.maxMeter;
    window.maxRage = window.maxMeter;
    window.maxVelocity = window.maxMeter;
    window.maxBullMarket = window.maxMeter;
    window.maxBloodBank = window.maxMeter;
    window.maxStreak = window.maxMeter;
    window.maxAdaptation = window.maxMeter;
    window.maxCommand = window.maxMeter;

    window.triggerAllAchievements = (): string => safe(() => {
      const defs = this.gameState.getAchievementDefinitions();
      let granted = 0;
      for (const def of defs) {
        if (this.gameState.grantAchievement(def.id)) granted++;
      }
      return `Granted ${granted} new achievements (${defs.length} defined).`;
    }, 'triggerAllAchievements');

    window.godMode = (): string => safe(() => {
      const p = this.player as unknown as {
        _godMode?: boolean;
        _origTakeDamage?: (amount: number, sx?: number, sy?: number) => void;
        takeDamage: (amount: number, sx?: number, sy?: number) => void;
      } | undefined;
      if (!p) return 'No player yet (start a run first).';
      if (!p._godMode) {
        p._origTakeDamage = p.takeDamage.bind(this.player);
        p.takeDamage = (_amount: number, _sx?: number, _sy?: number): void => { /* invincible */ };
        p._godMode = true;
        return 'God mode ON.';
      } else {
        if (p._origTakeDamage) p.takeDamage = p._origTakeDamage;
        p._godMode = false;
        return 'God mode OFF.';
      }
    }, 'godMode');

    window.devMode = (on?: boolean): string => safe(() => {
      const next = typeof on === 'boolean' ? on : !this._devMode;
      this._devMode = next;
      if (next) {
        const allIds = CharacterRegistry.getAllIds();
        // Persist unlocks on the current slot AND install a runtime override so
        // every slot reads "everything unlocked" while dev mode is on.
        for (const id of allIds) this.gameState.unlockCharacter(id);
        this.gameState._devUnlockAll = allIds.slice();
        // Mark all 30 waves reachable on the current character.
        this.gameState.playerData.unlockedLevels = 30;
        this.gameState.playerData.highestWave = 30;
        this.gameState.playerData.money = 999999;
        this.gameState.savePlayerData();
        console.log('[DEV MODE ON] — infinite money, all characters, all levels.');
        return 'Dev mode ON.';
      }
      // Clear the runtime override but leave persisted unlocks alone.
      this.gameState._devUnlockAll = null;
      console.log('[DEV MODE OFF]');
      return 'Dev mode OFF.';
    }, 'devMode');

    window.listCommands = (): string => safe(() => {
      const cmds = [
        'debugGame()                 - dump game debug info',
        'devMode(on?)                - toggle hidden dev mode (infinite money,',
        '                              all characters, all levels unlocked)',
        'giveMoney(amount=9999)      - add money to player',
        'skipToWave(n)               - start wave N instantly',
        'unlockAllCharacters()       - unlock every character',
        'grantAllItems()             - grant every BALANCE.items at stack 1',
        'killAllEnemies()            - kill every enemy on screen',
        'maxMeter() / maxMomentum() / maxSurge() / maxRage() / maxVelocity() /',
        '  maxBullMarket() / maxBloodBank() / maxStreak() / maxAdaptation() /',
        '  maxCommand()              - fill active character buildup meter',
        'triggerAllAchievements()    - grant every achievement',
        'godMode()                   - toggle player invincibility',
        'listCommands()              - show this list',
      ];
      console.log('=== DEBUG COMMANDS ===\n' + cmds.join('\n'));
      return `${cmds.length} commands printed to console.`;
    }, 'listCommands');
  }

  private shufflePlaylist(): void {
    this.musicPlaylist = [...this.musicTracks];
    for (let i = this.musicPlaylist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.musicPlaylist[i], this.musicPlaylist[j]] = [this.musicPlaylist[j], this.musicPlaylist[i]];
    }
    // Avoid immediately replaying the last-played track.
    if (
      this.musicLastPlayed !== null &&
      this.musicPlaylist.length > 1 &&
      this.musicPlaylist[0] === this.musicLastPlayed
    ) {
      [this.musicPlaylist[0], this.musicPlaylist[1]] = [this.musicPlaylist[1], this.musicPlaylist[0]];
    }
    this.musicIndex = 0;
  }

  private currentMusicVolumeMultiplier(): number {
    let mult = 1;
    if (this.isPaused) mult *= 0.5;
    if (this.spawnSystem && this.spawnSystem.isBossWave && this.spawnSystem.isBossWave()) {
      mult *= 1.2;
    }
    return mult;
  }

  private applyMusicDynamics(): void {
    const target = Math.max(0, Math.min(1, this.musicBaseVolume * this.currentMusicVolumeMultiplier()));
    // During crossfade, the fader owns bgm/bgmNext volumes; skip.
    if (this.musicCrossfading) return;
    this.bgm.volume = target;
  }

  private maybeStartCrossfade(): void {
    if (this.musicCrossfading) return;
    if (!this.musicStarted) return;
    const dur = this.bgm.duration;
    if (!isFinite(dur) || dur <= 2) return;
    if (dur - this.bgm.currentTime > 1.0) return;

    // Pick the next track (advance index, reshuffle if needed).
    this.musicLastPlayed = this.musicPlaylist[this.musicIndex] ?? null;
    let nextIndex = this.musicIndex + 1;
    if (nextIndex >= this.musicPlaylist.length) {
      this.shufflePlaylist();
      nextIndex = 0;
    }
    const nextSrc = this.musicPlaylist[nextIndex];

    const next = new Audio(nextSrc);
    next.volume = 0;
    const targetVol = Math.max(0, Math.min(1, this.musicBaseVolume * this.currentMusicVolumeMultiplier()));
    this.musicCrossfading = true;

    next.play().then(() => {
      const startVol = this.bgm.volume;
      const startedAt = performance.now();
      const durationMs = 1000;
      const step = (): void => {
        const t = Math.min(1, (performance.now() - startedAt) / durationMs);
        this.bgm.volume = Math.max(0, startVol * (1 - t));
        next.volume = Math.max(0, Math.min(1, targetVol * t));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          // Swap: retire old, promote next.
          try { this.bgm.pause(); } catch { /* ignore */ }
          const old = this.bgm;
          old.src = '';
          this.bgm = next;
          this.musicIndex = nextIndex;
          this.musicCrossfading = false;
          this.bgm.addEventListener('timeupdate', () => this.maybeStartCrossfade());
          this.bgm.addEventListener('ended', () => {
            if (!this.musicCrossfading) this.playNextTrack();
          });
          this.applyMusicDynamics();
        }
      };
      requestAnimationFrame(step);
    }).catch(() => {
      // Fallback: abort crossfade; let 'ended' handler hard-swap.
      this.musicCrossfading = false;
    });
  }

  private playNextTrack(): void {
    this.musicLastPlayed = this.musicPlaylist[this.musicIndex] ?? null;
    this.musicIndex++;
    if (this.musicIndex >= this.musicPlaylist.length) {
      this.shufflePlaylist();
    }
    this.bgm.src = this.musicPlaylist[this.musicIndex];
    this.applyMusicDynamics();
    this.bgm.play().catch(() => {});
  }

  setupMouseTracking(): void {
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.logicalWidth / rect.width;
      const scaleY = this.canvas.logicalHeight / rect.height;
      this.mousePosition = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mousePosition = null;
    });

    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      if (this.gameState.getState() === GAME_STATES.PLAYING) e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.logicalWidth / rect.width;
      const scaleY = this.canvas.logicalHeight / rect.height;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const sx = (t.clientX - rect.left) * scaleX;
        const sy = (t.clientY - rect.top) * scaleY;

        if (this.gameState.getState() === GAME_STATES.PLAYING && !this.isPaused) {
          this.joystick.handleTouchStart(t, sx, sy);
        } else {
          this.mousePosition = { x: sx, y: sy };
          this.lastTouchY = sy;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (this.gameState.getState() === GAME_STATES.PLAYING) e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.logicalWidth / rect.width;
      const scaleY = this.canvas.logicalHeight / rect.height;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const sx = (t.clientX - rect.left) * scaleX;
        const sy = (t.clientY - rect.top) * scaleY;

        if (this.gameState.getState() === GAME_STATES.PLAYING && !this.isPaused) {
          if (t.identifier === this.joystick.touchId || !this.joystick.active) {
            this.joystick.handleTouchMove(t, sx, sy);
          }
        } else {
          this.mousePosition = { x: sx, y: sy };
          if (this.lastTouchY !== null) {
            const deltaY = this.lastTouchY - sy;
            this.lastTouchY = sy;
            if (Math.abs(deltaY) > 0) {
              const wheelEvent = new WheelEvent('wheel', {
                deltaY: deltaY * 2,
                clientX: t.clientX,
                clientY: t.clientY,
              });
              this.canvas.dispatchEvent(wheelEvent);
            }
          }
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      if (this.gameState.getState() === GAME_STATES.PLAYING) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.gameState.getState() === GAME_STATES.PLAYING && !this.isPaused) {
          if (t.identifier === this.joystick.touchId) {
            this.joystick.handleTouchEnd(t);
          }
        } else {
          this.mousePosition = null;
          this.lastTouchY = null;
        }
      }
    }, { passive: false });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Allow pause during both PLAYING and ROUND_COMPLETE (vacuum phase).
        // Previously Esc was swallowed silently during the post-wave vacuum.
        const st = this.gameState.getState();
        if ((st === GAME_STATES.PLAYING || st === GAME_STATES.ROUND_COMPLETE) && !this.isPaused) {
          this.pauseGame();
        }
      }
    });
  }

  /**
   * Deactivate every screen's event listeners. Every showXxx() must call this
   * before activating its target screen — otherwise stale click handlers from
   * the previous screen will keep firing (e.g. a "Buy Pistol" click in Shop
   * also hitting the level-select confirm button).
   */
  private deactivateAllScreens(): void {
    this.menu.deactivate();
    this.characterScreen.deactivate();
    this.characterSelectScreen.deactivate();
    this.startingSetupScreen.deactivate();
    this.levelSelectScreen.deactivate();
    this.settingsScreen.deactivate();
    this.controlsScreen.deactivate();
    this.shopScreen.deactivate();
    this.upgradeScreen.deactivate();
    if (this.roundStatsScreen) this.roundStatsScreen.deactivate();
    if (this.runCompleteScreen) this.runCompleteScreen.deactivate();
    this.pauseMenu.deactivate();
    this.gameOverScreen.deactivate();
    if (this.achievementsScreen) this.achievementsScreen.deactivate();
    if (this.statsScreen) this.statsScreen.deactivate();
  }

  showMenu(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'menu';
    this.deactivateAllScreens();
    this.menu.activate();
    this.canvas.style.cursor = 'pointer';
  }

  showCharacterScreen(showContinueButton: boolean = false): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'character';
    this.deactivateAllScreens();
    this.characterScreen.showContinueButton = showContinueButton;
    this.characterScreen.activate();
  }

  showCharacterSelectScreen(): void {
    this.gameState.setState(GAME_STATES.CHARACTER_SELECT);
    this.activeScreen = 'characterSelect';
    this.deactivateAllScreens();
    this.characterSelectScreen.activate();
    this.canvas.style.cursor = 'pointer';
  }

  showStartingSetup(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'startingSetup';
    this.deactivateAllScreens();
    this.startingSetupScreen.activate();
    this.canvas.style.cursor = 'pointer';
  }

  showLevelSelect(): void {
    this.gameState.setState(GAME_STATES.MENU);
    if (!this.gameState.getActiveSlot().empty) {
      this.gameState.saveActiveRun('levelSelect', this.gameState.currentLevel);
    }
    this.activeScreen = 'levelSelect';
    this.deactivateAllScreens();
    // Dev mode: allow clicking any unlocked wave, not just the current-max one.
    this.levelSelectScreen.devBypass = this._devMode;
    this.levelSelectScreen.activate();
    this.canvas.style.cursor = 'pointer';
  }

  showShopFromRun(): void {
    this.shopBackAction = () => this.showLevelSelect();
    this.showShop();
    if (!this.gameState.getActiveSlot().empty) {
      this.gameState.saveActiveRun('shop', this.gameState.currentLevel);
    }
  }

  showCharacterScreenFromRun(): void {
    this._charScreenBackTarget = 'levelSelect';
    this.showCharacterScreen();
  }

  showSettings(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'settings';
    this.deactivateAllScreens();
    this.settingsScreen.activate();
  }

  showControls(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'controls';
    this.deactivateAllScreens();
    this.controlsScreen.activate();
  }

  showAchievementsScreen(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'achievements';
    this.deactivateAllScreens();
    this.achievementsScreen.activate();
  }

  showStatsScreen(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'stats';
    this.deactivateAllScreens();
    this.statsScreen.activate();
  }

  showShop(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'shop';
    this.deactivateAllScreens();
    this.shopScreen.showContinueButton = false;
    this.shopScreen.activeCharacter = CharacterRegistry.get(this.gameState.selectedCharacter);
    this.shopScreen.activate();
    if (this.tutorialOverlay) this.tutorialOverlay.maybeShow('shop');
    this.canvas.style.cursor = 'pointer';
  }

  afterWaveShopContinue(): void {
    this._charScreenBackTarget = 'afterWaveShop';
    this.showCharacterScreen(true);
  }

  showShopAfterWave(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'shop';
    this.deactivateAllScreens();
    this.shopScreen.showContinueButton = true;
    this.shopScreen.activeCharacter = this.character;
    this.shopScreen.activate();
    if (this.tutorialOverlay) this.tutorialOverlay.maybeShow('shop');
    if (!this.gameState.getActiveSlot().empty) {
      this.gameState.saveActiveRun('shop', this.gameState.currentLevel);
    }
    this.canvas.style.cursor = 'pointer';
  }

  showSettingsFromPause(): void {
    this.pendingOverlayScreen = 'menu';
    this.pauseMenu.deactivate();
    this.activeScreen = 'settings';
    this.settingsScreen.activate();
  }

  saveAndQuitToMenu(): void {
    // Fire onLevelEnd FIRST so characters (GlassCannon, Vampire) can
    // normalize mid-wave-only stats (e.g. streaked fireRate) back to their
    // baseline BEFORE saveActiveRun snapshots playerData. Otherwise the save
    // captures the inflated mid-wave value and the player resumes with it.
    if (this.character && this.character.onLevelEnd) this.character.onLevelEnd(this);
    if (!this.gameState.getActiveSlot().empty) {
      this.gameState.saveActiveRun('levelSelect', this.gameState.currentLevel);
    }
    this.isPaused = false;
    this.pauseMenu.deactivate();
    this.showMenu();
  }

  continueRunFromSlot(): void {
    const run = this.gameState.getActiveRun();
    if (!run) return;
    const slot = this.gameState.getActiveSlot();
    this.gameState.selectedCharacter = run.characterId;
    slot.selectedCharacter = run.characterId;
    const existing = slot.characters[run.characterId] || this.gameState.getDefaultCharacterDataFor(run.characterId);
    slot.characters[run.characterId] = {
      ...existing,
      money: run.money,
      stats: run.stats,
      weapons: run.weapons,
      weaponLevels: run.weaponLevels,
      items: run.items,
      itemStacks: run.itemStacks,
      spells: run.spells || null,
      spellLevels: run.spellLevels || null,
      highestWave: Math.max(run.currentWave, existing.highestWave || 1),
    };
    if (run.extras) {
      const charAny = slot.characters[run.characterId] as unknown as Record<string, unknown>;
      for (const k of Object.keys(run.extras)) charAny[k] = run.extras[k];
    }
    this.gameState.playerData = this.gameState.getCharacterData(run.characterId);
    this.gameState.currentLevel = run.currentWave;
    this.runTimeAccumulator = 0;
    this.runPpEarned = 0;
    this.runMoneyEarned = 0;
    this.runKills = 0; this.runDamageDealt = 0;
    // Credit this as a run-start so lifetimeRuns / per-character runs counters
    // cover continued saves (not only fresh wave-1 starts). Guarded by a flag on
    // the active-run envelope so the increment is idempotent across reloads.
    const rWithFlag = run as unknown as Record<string, unknown>;
    if (!rWithFlag._runStartCounted) {
      this.gameState.checkAchievements('runStart', { character: run.characterId });
      rWithFlag._runStartCounted = true;
    }
    this.showLevelSelect();
  }

  pauseGame(): void {
    if (this.gameState.getState() !== GAME_STATES.PLAYING) return;
    this.isPaused = true;
    this.gameState.setState(GAME_STATES.PAUSED);
    this.pauseMenu.activate();
    this.canvas.style.cursor = 'pointer';
  }

  resumeGame(): void {
    this.isPaused = false;
    this.gameState.setState(GAME_STATES.PLAYING);
    this.pauseMenu.deactivate();
    this.canvas.style.cursor = 'crosshair';
  }

  pauseToMenu(): void {
    this.isPaused = false;
    this.pauseMenu.deactivate();
    this.showMenu();
  }

  startLevel(level: number): void {
    this.menu.deactivate();
    this.characterScreen.deactivate();
    this.characterSelectScreen.deactivate();
    this.levelSelectScreen.deactivate();
    this.settingsScreen.deactivate();
    this.shopScreen.deactivate();
    this.canvas.style.cursor = 'crosshair';

    if (this.joystick) this.joystick.reset();

    this.weaponDamageStats.clear();
    // Reset per-wave completion source so a past timer-completion doesn't
    // falsely grant `lateFinish` on a later wave that ends differently.
    this._lastWaveCompletedByTimer = false;

    const activeChar = CharacterRegistry.get(this.gameState.selectedCharacter);
    this.player = new Player(this.canvas.logicalWidth / 2, (this.canvas.logicalHeight + GAME_CONFIG.UI_BAR_HEIGHT) / 2);
    this.player.health = this.gameState.playerData.stats.health;
    this.player.maxHealth = this.gameState.playerData.stats.health;
    this.player.speed = this.gameState.playerData.stats.speed;
    if (activeChar) {
      this.player.color = activeChar.getColor();
      this.player.size = activeChar.getPlayerSize();
    }

    const items = this.gameState.playerData.items || [];
    const playerAny = this.player as unknown as Record<string, unknown>;
    playerAny.hasBounceHouse = items.includes('bounceHouse');
    playerAny.bounceHouseStacks = (this.gameState.playerData.itemStacks as Record<string, number>)?.bounceHouse ||
      (this.gameState.playerData as unknown as Record<string, number>).bounceHouseStacks || 0;
    playerAny.hasExplosiveRounds = items.includes('explosiveRounds');
    playerAny.hasVampiric = items.includes('vampiric');
    playerAny.hasLifeSteal = items.includes('lifeSteal');
    playerAny.hasShieldGenerator = items.includes('shieldGenerator');
    playerAny.hasAdrenalineRush = items.includes('adrenalineRush');
    playerAny.hasDoubleTap = items.includes('doubleTap');
    playerAny.hasBloodPact = items.includes('bloodPact');
    playerAny.killCount = 0;

    this.weaponSystem = new WeaponSystem(this.effectsSystem, this.soundSystem);
    // Route direct-damage weapons (Sword, HulkFist, ChainLightning) through
    // recordDamage so roundStats.damageByWeapon includes them — they used to
    // write only to the HUD's weaponDamageStats, making RoundStats attribute
    // zero damage to them despite real kills.
    this.weaponSystem.damageRecorder = (id, amt) => this.recordDamage(id, amt);
    if (!activeChar || activeChar.getMaxWeapons() > 0) {
      const ownedWeapons = this.gameState.playerData.weapons || ['pistol'];
      const weaponLevels = this.gameState.playerData.weaponLevels || { pistol: 1 };
      for (const weaponId of ownedWeapons) {
        const weaponLevel = weaponLevels[weaponId] || 1;
        const weapon = createWeapon(weaponId, weaponLevel);
        this.weaponSystem.addWeapon(weapon);
      }
    }

    (this.player as unknown as Record<string, unknown>).stats = this.gameState.playerData.stats;

    this.spawnSystem = new SpawnSystem(level, this.effectsSystem);

    // Static Enemy queues persist across waves/runs — drop any residue from a
    // prior wave so stale splitter-children / death effects / damage numbers
    // don't leak into the new wave's first frame at old-canvas coordinates.
    Enemy.pendingSpawns.length = 0;
    Enemy.pendingDeathEffects.length = 0;
    Enemy.pendingDamageNumbers.length = 0;

    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];

    this.delayedRageTimer = 3.0;
    const FLOOD_WAVES = [9, 13, 17, 24, 27];
    const isBossWave = level === 10 || level === 20 || level === 30;
    const isFloodWave = FLOOD_WAVES.indexOf(level) !== -1;
    // Boss waves: skip the standard 2s "10 basic + 3 speedy" and 30s "13 speedy" bursts.
    // Instead run a recurring 13-speedy burst every 10s starting at 2s.
    this.delayedBasicSeedTimer = isBossWave ? 0 : 2.0;
    this.secondBasicSeedTimer = (isBossWave || isFloodWave) ? 0 : 30.0;
    this.bossSpeedyBurstActive = isBossWave;
    this.bossSpeedyBurstTimer = isBossWave ? 2.0 : 0;

    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    this.enemies.push(new Enemy(20, h - 20, 'tracker', level));
    this.enemies.push(new Enemy(w - 20, h - 20, 'tracker', level));

    this.roundStats = {
      damageTaken: 0,
      enemiesKilled: 0,
      totalDamageDealt: 0,
      moneyCollected: 0,
      moneySpawned: 0,
      killsByWeapon: new Map(),
      killsByType: new Map(),
      damageByWeapon: new Map(),
    };

    this._bossPhaseSlowTimer = 0;
    this.roundTimer = BALANCE.spawning.waveDuration;
    this.moneyEarned = 0;
    this.totalKills = 0;
    this.lastCountdownSecond = Math.ceil(this.roundTimer);

    this.vacuumWaitTimer = 0;
    this.vacuumActive = false;
    this.vacuumDuration = 0;

    this.gameState.currentLevel = level;

    this.character = CharacterRegistry.get(this.gameState.selectedCharacter);
    if (this.character) {
      this.character.onStartLevel(this);
    }

    // First-run tutorials: gameplay movement hint + passive meter explainer.
    if (this.tutorialOverlay) {
      this.tutorialOverlay.maybeShow('gameplay');
      // Passive meter is the universal character mechanic — every class has
      // one. The tutorial message explaining it was defined but never triggered.
      this.tutorialOverlay.maybeShow('buildupMeter');
    }

    // Run-start achievement pathway. Only fires once per run-envelope; the
    // `_runStartCounted` flag guards against double-counting a continued run
    // whose wave-1 start was already credited in a prior session.
    if (level === 1) {
      const run = this.gameState.getActiveRun() as unknown as Record<string, unknown> | null;
      if (!run || !run._runStartCounted) {
        this.gameState.checkAchievements('runStart', { character: this.gameState.selectedCharacter });
        if (run) run._runStartCounted = true;
      }
    }

    this.gameState.setState(GAME_STATES.PLAYING);
  }

  update(deltaTime: number): void {
    this._lastDt = deltaTime;
    // Drive the sound mixer: update listener position (for distance attenuation)
    // and flush aggregated hit/death events + swarm buckets.
    if (this.player && this.player.position) {
      this.soundSystem.setListener(this.player.position.x, this.player.position.y);
    }
    this.soundSystem.tick();

    // Music dynamics: pulse every ~100ms from the frame clock.
    this._musicDynamicsTimer -= deltaTime;
    if (this._musicDynamicsTimer <= 0) {
      this.applyMusicDynamics();
      this._musicDynamicsTimer = 0.1;
    }
    // Dev mode: refill money and keep all levels unlocked each frame.
    if (this._devMode) {
      if (this.gameState.playerData.money < 900000) this.gameState.playerData.money = 999999;
      if ((this.gameState.playerData.unlockedLevels ?? 1) < 30) this.gameState.playerData.unlockedLevels = 30;
    }
    // Achievement toasts always tick
    if (this.achievementToast) this.achievementToast.update(deltaTime);
    // Playtime accumulates when a slot is active and not in main menu.
    // Don't tick while paused — that's not real play time.
    // Only tick play-time while the player is actually in a wave — not during
    // shop, upgrade, round-stats, or post-run screens, which inflated lifetime
    // playtime by a large factor under the previous `activeScreen !== 'menu'` check.
    if (!this.gameState.getActiveSlot().empty
        && this.gameState.getState() === GAME_STATES.PLAYING
        && !this.isPaused) {
      this.playtimeAccumulator += deltaTime;
      if (this.playtimeAccumulator > 5) {
        this.gameState.addPlaytime(this.playtimeAccumulator);
        this.playtimeAccumulator = 0;
      }
    }
    if (this.gameState.getState() === GAME_STATES.PLAYING && !this.isPaused) {
      this.runTimeAccumulator += deltaTime;
    }

    if (this.isPaused) return;

    // Phase-transition time-slow for drama
    if (this._bossPhaseSlowTimer > 0) {
      this._bossPhaseSlowTimer -= deltaTime;
      deltaTime *= 0.1;
    }

    if (this.gameState.getState() === GAME_STATES.ROUND_COMPLETE) {
      // If the player died during the vacuum phase (e.g. Vampire Thirst bleed or
      // a DoT expiring lethally), route to GameOver instead of advancing to the
      // post-wave screen as if the wave was cleanly won.
      if (this.player && !this.player.alive) {
        this.gameOver();
        return;
      }
      this.effectsSystem.update(deltaTime);

      if (this.vacuumWaitTimer > 0) {
        this.vacuumWaitTimer -= deltaTime;
        if (this.vacuumWaitTimer <= 0) {
          this.vacuumActive = true;
          this.vacuumDuration = 1.5;
        }
      } else if (this.vacuumActive) {
        this.vacuumDuration -= deltaTime;
        for (let i = this.pickups.length - 1; i >= 0; i--) {
          const pickup = this.pickups[i];
          const dx = this.player.position.x - pickup.position.x;
          const dy = this.player.position.y - pickup.position.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < 900) {
            if (pickup.type === 'money') {
              this.moneyEarned += pickup.value;
              if (this.roundStats) this.roundStats.moneyCollected += pickup.value;
              this.effectsSystem.addMoneyPickupEffect(pickup.position.x, pickup.position.y, pickup.value);
              this.soundSystem.play('pickup');
            } else if (pickup.type === 'health' && this.player.health < this.player.maxHealth) {
              this.player.health = Math.min(this.player.maxHealth, this.player.health + pickup.value);
            }
            this.pickups[i] = this.pickups[this.pickups.length - 1];
            this.pickups.pop();
          } else {
            const dist = Math.sqrt(distSq);
            pickup.position.x += (dx / Math.max(1, dist)) * 800 * deltaTime;
            pickup.position.y += (dy / Math.max(1, dist)) * 800 * deltaTime;
          }
        }

        if (this.pickups.length === 0 || this.vacuumDuration <= 0) {
          this.vacuumActive = false;
          for (const pickup of this.pickups) {
            if (pickup.type === 'money' && pickup.alive) {
              this.moneyEarned += pickup.value;
              if (this.roundStats) this.roundStats.moneyCollected += pickup.value;
            }
          }
          this.pickups = [];
          const ppBefore = this.gameState.getMeta().prestigePoints;
          const unlockedBefore = this.gameState.getUnlockedCharacters().slice();
          this.gameState.completeLevel(this.gameState.currentLevel, this.moneyEarned, this.totalKills);
          const ppAfter = this.gameState.getMeta().prestigePoints;
          const unlockedAfter = this.gameState.getUnlockedCharacters();
          this._newlyUnlockedThisRun = unlockedAfter.filter((c) => !unlockedBefore.includes(c));
          this.runPpEarned += (ppAfter - ppBefore);
          this.runMoneyEarned += this.moneyEarned;
          this.runKills += this.totalKills;
          if (this.roundStats) this.runDamageDealt += this.roundStats.totalDamageDealt;
          this.showRoundStatsScreen();
        }
      }
      return;
    }

    if (this.gameState.getState() !== GAME_STATES.PLAYING) {
      return;
    }

    this.effectsSystem.update(deltaTime);

    if (this.character) {
      this.character.onUpdate(this, deltaTime);
    }

    if (this.player.health < this.player.maxHealth && this.gameState.playerData.stats.regeneration > 0) {
      // Display convention throughout the UI is `regeneration * 10` as HP/s
      // (see CharacterScreen / UpgradeScreen / HUD strip). The actual heal math
      // was using the raw value without the ×10, so players were getting 1/10th
      // the promised regen rate. The ×10 here restores the display's promise.
      this.player.health = Math.min(
        this.player.maxHealth,
        this.player.health + this.gameState.playerData.stats.regeneration * 10 * deltaTime
      );
    }

    const isBossWave = this.spawnSystem.isBossWave();
    if (!isBossWave) {
      this.roundTimer -= deltaTime;
      if (this.roundTimer <= 0) {
        this._lastWaveCompletedByTimer = true;
        this.completeRound();
        return;
      }
    } else {
      // Boss wave: completion gated on boss death.
      if (this.spawnSystem.isBossDefeated()) {
        this._lastWaveCompletedByTimer = false;
        this.completeRound();
        return;
      }
    }

    const currentSecond = Math.ceil(this.roundTimer);
    if (currentSecond <= 10 && currentSecond !== this.lastCountdownSecond) {
      this.lastCountdownSecond = currentSecond;
      if (currentSecond <= 3) {
        this.soundSystem.play('countdownUrgent');
      } else {
        this.soundSystem.play('countdown');
      }
    }

    this.updateItemEffects();

    this.player.update(
      deltaTime,
      this.input,
      this.mousePosition,
      this.canvas.logicalWidth,
      this.canvas.logicalHeight,
      GAME_CONFIG.UI_BAR_HEIGHT,
      this.joystick.active ? this.joystick.vector : null,
      this.enemies,
      ((this.gameState.playerData as unknown as Record<string, unknown>).settings as Record<string, string>)?.aimMode || 'auto'
    );

    const playerExt = this.player as unknown as Record<string, number>;
    if (playerExt._teleportInvuln > 0) playerExt._teleportInvuln -= deltaTime;

    this.spawnSystem.update(deltaTime, this.enemies, this.canvas.logicalWidth, this.canvas.logicalHeight, this.player, this.projectiles);

    // Boss area/continuous damage (sweep beam, constrict walls) + phase-transition time slow
    const bossEntity = this.spawnSystem.getBoss();
    if (bossEntity && bossEntity.alive && bossEntity instanceof Boss && this.player.alive) {
      bossEntity.applyAreaDamage(this.player, deltaTime, (amt: number) => {
        let d = amt;
        if (this.character && this.character.onDamage) d = this.character.onDamage(this, d);
        this.player.takeDamage(d);
        if (this.roundStats) this.roundStats.damageTaken += d;
        this.effectsSystem.addDamageFlash();
      });
      if (bossEntity.phaseTransitionPending) {
        bossEntity.phaseTransitionPending = false;
        this._bossPhaseSlowTimer = 0.3;
      }
    }

    if (this.delayedBasicSeedTimer > 0) {
      this.delayedBasicSeedTimer -= deltaTime;
      if (this.delayedBasicSeedTimer <= 0) {
        this.spawnBasicSeedBurst(10, 3);
      }
    }

    if (this.secondBasicSeedTimer > 0) {
      this.secondBasicSeedTimer -= deltaTime;
      if (this.secondBasicSeedTimer <= 0) {
        this.spawnBasicSeedBurst(0, 13);
      }
    }

    // Boss-wave recurring speedy-cyan burst: first at 2s, then every 10s.
    if (this.bossSpeedyBurstActive) {
      this.bossSpeedyBurstTimer -= deltaTime;
      if (this.bossSpeedyBurstTimer <= 0) {
        this.spawnBasicSeedBurst(0, 13);
        this.bossSpeedyBurstTimer = 10.0;
      }
    }

    if (this.delayedRageTimer > 0) {
      this.delayedRageTimer -= deltaTime;
      if (this.delayedRageTimer <= 0) {
        const w = this.canvas.logicalWidth;
        const h = this.canvas.logicalHeight;
        const pts = [
          { x: 20, y: GAME_CONFIG.UI_BAR_HEIGHT + 20 },
          { x: w - 20, y: GAME_CONFIG.UI_BAR_HEIGHT + 20 },
          { x: 20, y: h - 20 },
          { x: w - 20, y: h - 20 },
        ];
        for (const p of pts) {
          const rage = new Enemy(p.x, p.y, 'tracker', this.gameState.currentLevel);
          const rageExt = rage as unknown as Record<string, unknown>;
          rageExt.isEnraged = true;
          rage.color = '#FFAAAA';
          rage.health = 0.1;
          rage.maxHealth = 0.1;
          rage.speed *= 3.0;
          rageExt.rageTextTimer = 1.5;
          this.enemies.push(rage);
        }
      }
    }

    if (this.character && 'getDamageMultiplier' in this.character) {
      const vamp = this.character as unknown as { getDamageMultiplier(): number; getFireRateMultiplier(): number };
      this.weaponSystem.characterDamageMultiplier = vamp.getDamageMultiplier();
      this.weaponSystem.characterFireRateMultiplier = vamp.getFireRateMultiplier();
    } else {
      this.weaponSystem.characterDamageMultiplier = 1;
      this.weaponSystem.characterFireRateMultiplier = 1;
    }

    this.weaponSystem.update(
      deltaTime,
      this.player,
      this.enemies,
      this.projectiles,
      this.weaponDamageStats,
      (this.gameState.playerData as unknown as Record<string, string>).aimMode,
      this.mousePosition
    );

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(deltaTime, this.canvas.logicalWidth, this.canvas.logicalHeight, this.player, this.projectiles, this.enemies);

      if (enemy.checkCollision(this.player) && !(enemy._hitBounceTimer && enemy._hitBounceTimer > 0)) {
        const pExt = this.player as unknown as Record<string, unknown>;
        if (pExt._teleportInvuln && (pExt._teleportInvuln as number) > 0) {
          const dx = enemy.position.x - this.player.position.x;
          const dy = enemy.position.y - this.player.position.y;
          const dist = Math.hypot(dx, dy) || 1;
          enemy.position.x += (dx / dist) * 80;
          enemy.position.y += (dy / dist) * 80;
          continue;
        }

        const shieldBubble = pExt._shieldBubble as { consumeShield(e: Enemy): boolean } | undefined;
        if (shieldBubble && shieldBubble.consumeShield(enemy)) {
          this.effectsSystem.floatingTexts.push({
            x: this.player.position.x,
            y: this.player.position.y - 20,
            text: 'BOUNCED!',
            vy: -30,
            life: 0.5,
            color: '#66CCFF',
          });
          continue;
        }

        const dodgeRoll = Math.random() * 100;
        if (dodgeRoll < this.gameState.playerData.stats.dodge) {
          this.effectsSystem.floatingTexts.push({
            x: this.player.position.x,
            y: this.player.position.y - 20,
            text: 'DODGE!',
            vy: -30,
            life: 0.5,
            color: '#00FFFF',
          });
          this.player.notifyDodge();
          this.soundSystem.play('dodge');
        } else if ((this.player as unknown as Record<string, boolean>).hasShieldGenerator && Math.random() < BALANCE.items.shieldGenerator.blockChance / 100) {
          this.effectsSystem.floatingTexts.push({
            x: this.player.position.x,
            y: this.player.position.y - 20,
            text: 'BLOCKED!',
            vy: -30,
            life: 0.5,
            color: '#00AAFF',
          });
        } else {
          let dmg = enemy.damage;
          if (this.character && this.character.onDamage) {
            dmg = this.character.onDamage(this, dmg);
          }
          this.player.takeDamage(dmg);
          if (this.roundStats) this.roundStats.damageTaken += dmg;
          this.effectsSystem.addDamageFlash();
          this.soundSystem.play('playerHurt');
        }
        // Bounce the enemy away instead of killing it on contact. Enemy flies
        // opposite from the player at ~3x its normal speed for 1.5s, then resumes AI.
        const bdx = enemy.position.x - this.player.position.x;
        const bdy = enemy.position.y - this.player.position.y;
        const bd = Math.hypot(bdx, bdy) || 1;
        const bspeed = Math.max(260, enemy.speed * 3);
        enemy._hitBounceVX = (bdx / bd) * bspeed;
        enemy._hitBounceVY = (bdy / bd) * bspeed;
        enemy._hitBounceTimer = 1.5;

        if (!this.player.alive) {
          this.gameOver();
          return;
        }
      }

      if (!enemy.alive) {
        this.effectsSystem.addKillEffect(enemy.position.x, enemy.position.y);
        this.soundSystem.registerEnemyDeath(enemy.type, enemy.position.x, enemy.position.y);
        this.totalKills++;
        this.gameState.recordKill(enemy.type);

        if (this.character) {
          this.character.onKill(this, enemy);
        }

        if (this.roundStats) {
          this.roundStats.enemiesKilled++;
          let enemyKey = enemy.type;
          const enemyExt = enemy as unknown as Record<string, unknown>;
          if (enemyExt.isEnraged) enemyKey = `RAGE ${enemy.type}`;
          else if (enemyExt.isSpeed) enemyKey = `SPEED ${enemy.type}`;

          const tCount = this.roundStats.killsByType.get(enemyKey) || 0;
          this.roundStats.killsByType.set(enemyKey, tCount + 1);
          if (enemy.lastHitWeaponId) {
            const wCount = this.roundStats.killsByWeapon.get(enemy.lastHitWeaponId) || 0;
            this.roundStats.killsByWeapon.set(enemy.lastHitWeaponId, wCount + 1);
          }
        }

        this.onEnemyKill(enemy);

        // Boss death: guaranteed cash pile + heart + dramatic effects
        if (enemy instanceof Boss) {
          enemy.onDeathSpawn(this.pickups);
          this.effectsSystem.addScreenShake(18, 1.2, 'cinematic');
          this.effectsSystem.addFlash('#FFD700', 0.5, 'cinematic');
          this.effectsSystem.addExplosionEffect(enemy.position.x, enemy.position.y, 140);
          this.soundSystem.play('explosion', { x: enemy.position.x, y: enemy.position.y, priority: 'critical', volumeScale: 1.4 });
        }

        this.enemies[i] = this.enemies[this.enemies.length - 1];
        this.enemies.pop();
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.update(deltaTime, this.canvas.logicalWidth, this.canvas.logicalHeight, this.enemies);

      if (projectile.owner === 'player') {
        // Wave20 drone shield: absorb player projectile if it hits a drone
        if (bossEntity && bossEntity instanceof Boss && bossEntity.bossTypeId === 'wave20' && bossEntity.alive) {
          if (bossEntity.absorbProjectile(projectile.position.x, projectile.position.y, projectile.damage)) {
            projectile.alive = false;
            this.effectsSystem.addImpactEffect(projectile.position.x, projectile.position.y, '#CC66FF');
            this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
            this.projectiles.pop();
            continue;
          }
        }
        for (const enemy of this.enemies) {
          if ((projectile.piercing || projectile.boomerang) && projectile.hitEnemies.has(enemy)) {
            continue;
          }

          if (enemy.alive && projectile.checkCollision(enemy)) {
            let damage = projectile.damage;
            const critRoll = Math.random() * 100;
            if (critRoll < this.gameState.playerData.stats.critChance) {
              damage *= this.gameState.playerData.stats.critDamage / 100;
              this.effectsSystem.addCritEffect(enemy.position.x, enemy.position.y);
              this.soundSystem.registerHit(true, enemy.position.x, enemy.position.y);
            } else {
              this.soundSystem.registerHit(false, enemy.position.x, enemy.position.y);
            }
            const effectiveDamage = Math.min(enemy.health, damage);
            enemy.takeDamage(damage);
            if (projectile.weaponId) enemy.lastHitWeaponId = projectile.weaponId;

            if (effectiveDamage > 0 && this.roundStats) {
              this.roundStats.totalDamageDealt += effectiveDamage;
              if (projectile.weaponId) {
                const wd = this.roundStats.damageByWeapon.get(projectile.weaponId) || 0;
                this.roundStats.damageByWeapon.set(projectile.weaponId, wd + effectiveDamage);
              }
            }

            // Damage number is now queued inside Enemy.takeDamage (fires for every
            // damage source: projectile, spell, structure, ally, melee). Only add
            // the impact effect here since that's projectile-specific.
            this.effectsSystem.addImpactEffect(enemy.position.x, enemy.position.y);

            if (projectile.weaponId) {
              const currentDamage = this.weaponDamageStats.get(projectile.weaponId) || 0;
              this.weaponDamageStats.set(projectile.weaponId, currentDamage + effectiveDamage);
            }

            if ((this.player as unknown as Record<string, boolean>).hasLifeSteal) {
              // Heal 5% of damage dealt — always, not gated at 0.5 HP. The old
              // threshold suppressed virtually all early-game healing (needed
              // a single hit for >10 damage to matter).
              const healAmount = damage * BALANCE.items.lifeSteal.lifeStealPercent;
              if (healAmount > 0) {
                this.player.health = Math.min(this.player.maxHealth, this.player.health + healAmount);
              }
            }

            if (projectile.explosive) {
              this.effectsSystem.addExplosionEffect(projectile.position.x, projectile.position.y, projectile.explosionRadius);
              this.soundSystem.play('explosion', { x: projectile.position.x, y: projectile.position.y, priority: 'secondary' });

              const explosionRadiusSq = projectile.explosionRadius * projectile.explosionRadius;
              for (const otherEnemy of this.enemies) {
                if (otherEnemy !== enemy && otherEnemy.alive) {
                  const dx = otherEnemy.position.x - projectile.position.x;
                  const dy = otherEnemy.position.y - projectile.position.y;
                  const distSq = dx * dx + dy * dy;

                  if (distSq <= explosionRadiusSq) {
                    const effDamage = Math.min(otherEnemy.health, projectile.explosionDamage);
                    otherEnemy.takeDamage(projectile.explosionDamage);

                    if (projectile.weaponId) otherEnemy.lastHitWeaponId = projectile.weaponId;

                    if (effDamage > 0 && this.roundStats) {
                      this.roundStats.totalDamageDealt += effDamage;
                      if (projectile.weaponId) {
                        const wd = this.roundStats.damageByWeapon.get(projectile.weaponId) || 0;
                        this.roundStats.damageByWeapon.set(projectile.weaponId, wd + effDamage);
                      }
                    }

                    this.effectsSystem.addImpactEffect(otherEnemy.position.x, otherEnemy.position.y);
                    // Damage number already queued inside Enemy.takeDamage.

                    if (projectile.weaponId) {
                      const currentDamage = this.weaponDamageStats.get(projectile.weaponId) || 0;
                      this.weaponDamageStats.set(projectile.weaponId, currentDamage + effDamage);
                    }
                  }
                }
              }
            }

            if (projectile.piercing || projectile.boomerang) {
              projectile.hitEnemies.add(enemy);
            } else {
              projectile.alive = false;
              break;
            }
          }
        }
      } else if (projectile.owner === 'enemy') {
        if (this.player.alive && projectile.checkCollision(this.player)) {
          const dodgeRoll = Math.random() * 100;
          if (dodgeRoll < this.gameState.playerData.stats.dodge) {
            this.effectsSystem.floatingTexts.push({
              x: this.player.position.x,
              y: this.player.position.y - 20,
              text: 'DODGE!',
              vy: -30,
              life: 0.5,
              color: '#00FFFF',
            });
            // Notify player + play sound — matches the melee-contact dodge path.
            // Character-specific dodge passives (Speedster afterimage, etc.)
            // were silently skipping on ranged dodges before this.
            this.player.notifyDodge();
            this.soundSystem.play('dodge');
          } else {
            let dmg = projectile.damage;
            if (this.character && this.character.onDamage) {
              dmg = this.character.onDamage(this, dmg);
            }
            this.player.takeDamage(dmg);
            if (this.roundStats) this.roundStats.damageTaken += dmg;
            this.effectsSystem.addDamageFlash();
            this.soundSystem.play('playerHurt');

            if (!this.player.alive) {
              this.gameOver();
              return;
            }
          }
          projectile.alive = false;
        }
      }

      if (projectile.trail && projectile.alive) {
        this.effectsSystem.addProjectileTrail(
          projectile.position.x,
          projectile.position.y,
          '#666666',
          projectile.size / 2
        );
      }

      if (!projectile.alive) {
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.update(deltaTime);

      const dx = pickup.position.x - this.player.position.x;
      const dy = pickup.position.y - this.player.position.y;
      const distSq = dx * dx + dy * dy;
      const range = this.gameState.playerData.stats.pickupRange;

      if (distSq <= range * range || pickup.checkCollision(this.player)) {
        if (pickup.type === 'money') {
          this.moneyEarned += pickup.value;
          if (this.roundStats) this.roundStats.moneyCollected += pickup.value;
          this.effectsSystem.addMoneyPickupEffect(pickup.position.x, pickup.position.y, pickup.value);
          this.soundSystem.play('pickup');
        } else if (pickup.type === 'health') {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + pickup.value);
          this.effectsSystem.floatingTexts.push({
            x: pickup.position.x,
            y: pickup.position.y - 10,
            text: `+${pickup.value} HP`,
            vy: -30,
            life: 1,
            color: '#00FF00',
          });
          this.soundSystem.play('heal');
        }
        pickup.alive = false;
      }

      if (!pickup.alive) {
        this.pickups[i] = this.pickups[this.pickups.length - 1];
        this.pickups.pop();
      }
    }
  }

  completeRound(): void {
    this.gameState.setState(GAME_STATES.ROUND_COMPLETE);
    this.soundSystem.play('waveComplete');
    this.vacuumWaitTimer = 1.0;
    this.vacuumActive = false;

    // Stash per-wave flags for achievement check inside completeLevel
    const dmgTaken = this.roundStats?.damageTaken || 0;
    const dmgDealt = this.roundStats?.totalDamageDealt || 0;
    this.gameState.runCounters.lastWaveExtras = {
      noDamage: dmgTaken <= 0,
      noShots: dmgDealt <= 0,
      // "Last possible second": round was completed by timer expiry (not boss
      // kill) AND the player ended with ≤1 HP. Previously this only checked HP,
      // firing spuriously at 1 HP regardless of how much time was left.
      lateFinish: this._lastWaveCompletedByTimer && !!this.player && this.player.health <= 1,
    };

    if (this.character) {
      this.character.onWaveComplete(this, this.gameState.currentLevel);
    }
  }

  showRoundStatsScreen(): void {
    const charSummary = this.character?.getRoundSummary?.() || [];
    if (this.character && this.character.onLevelEnd) this.character.onLevelEnd(this);
    this.gameState.setState(GAME_STATES.MENU);

    this.effectsSystem.screenShake.duration = 0;
    this.effectsSystem.screenShake.intensity = 0;
    this.effectsSystem.screenShake.offset.x = 0;
    this.effectsSystem.screenShake.offset.y = 0;

    if (this.gameState.currentLevel >= 30) {
      this.gameState.clearActiveRun();
      this.gameState.resetActiveCharacterToDefaults();
      this.activeScreen = 'runComplete';
      this.deactivateAllScreens();
      const charName = this.character ? this.character.getName() : 'Unknown';
      const bossCfg = (BALANCE.bosses as Record<string, { name: string }>).wave30;
      this.runCompleteScreen.activate(charName, {
        wavesCleared: 30,
        totalKills: this.runKills,
        moneyEarned: this.runMoneyEarned,
        damageDealt: this.runDamageDealt,
        playtimeSeconds: this.runTimeAccumulator,
        ppEarned: this.runPpEarned,
        bossName: bossCfg ? bossCfg.name : 'The Hollow King',
      }, this._newlyUnlockedThisRun);
      this.canvas.style.cursor = 'pointer';
      return;
    }

    this.activeScreen = 'roundStats';
    this.deactivateAllScreens();
    this.roundStatsScreen.updateStats(this.roundStats!);
    this.roundStatsScreen.characterSummary = charSummary;
    this.roundStatsScreen.activate();
    this.canvas.style.cursor = 'pointer';
  }

  showUpgradeScreen(): void {
    this.gameState.setState(GAME_STATES.MENU);
    this.activeScreen = 'upgrade';
    this.deactivateAllScreens();
    this.effectsSystem.screenShake.duration = 0;
    this.effectsSystem.screenShake.intensity = 0;
    this.effectsSystem.screenShake.offset.x = 0;
    this.effectsSystem.screenShake.offset.y = 0;
    this.upgradeScreen.activeCharacter = this.character;
    this.upgradeScreen.activate();
    if (this.tutorialOverlay) this.tutorialOverlay.maybeShow('upgrade');
    this.canvas.style.cursor = 'pointer';
  }

  gameOver(): void {
    if (this.character && this.character.onLevelEnd) this.character.onLevelEnd(this);
    this.gameState.setState(GAME_STATES.GAME_OVER);
    this.gameState.checkAchievements('runDeath', { character: this.gameState.selectedCharacter });
    if (this.tutorialOverlay) this.tutorialOverlay.maybeShow('death');

    this.gameState.clearActiveRun();
    this.gameState.resetActiveCharacterToDefaults();
    this.deactivateAllScreens();

    this.gameOverScreen.activate({
      wave: this.gameState.currentLevel,
      money: this.runMoneyEarned,
      kills: this.runKills,
      timePlayed: this.runTimeAccumulator,
      ppEarned: this.runPpEarned,
    });

    this.activeScreen = 'gameOver';
    this.canvas.style.cursor = 'pointer';
  }

  private onEnemyKill(enemy: Enemy): void {
    const pExt = this.player as unknown as Record<string, unknown>;
    if (pExt.hasVampiric) {
      (pExt.killCount as number)++;
      if ((pExt.killCount as number) >= BALANCE.items.vampiric.healPerKills) {
        pExt.killCount = 0;
        this.player.health = Math.min(this.player.maxHealth, this.player.health + BALANCE.items.vampiric.healAmount);
        this.effectsSystem.floatingTexts.push({
          x: this.player.position.x,
          y: this.player.position.y - 30,
          text: `+${BALANCE.items.vampiric.healAmount} HP`,
          vy: -30,
          life: 1,
          color: '#FF00FF',
        });
      }
    }

    // Luck scaling pulled from BALANCE.economy (was hardcoded to 0.01 / 0.02
    // here, which made luck effectively 2× stronger than the balance constants
    // documented. The constants are the source of truth; this site now reads them.)
    const luck = this.gameState.playerData.stats.luck;
    const dropChance = enemy.moneyDropChance + luck * BALANCE.economy.luckDropBonus;
    if (Math.random() < dropChance) {
      const pickup = new Pickup(enemy.position.x, enemy.position.y, 'money');
      const baseValue = (enemy.moneyValue * 0.5) * (1 + (enemy.wave - 1) * 0.1);
      pickup.value = Math.ceil(baseValue * (1 + luck * BALANCE.economy.luckMoneyBonus));
      this.pickups.push(pickup);
      if (this.roundStats) this.roundStats.moneySpawned += pickup.value;
    }

    if (pExt.hasBloodPact && Math.random() < BALANCE.items.bloodPact.healthDropChance) {
      const healthPickup = new Pickup(enemy.position.x, enemy.position.y, 'health');
      healthPickup.value = BALANCE.items.bloodPact.healthDropAmount;
      this.pickups.push(healthPickup);
    }
  }

  private updateItemEffects(): void {
    const pExt = this.player as unknown as Record<string, unknown>;
    if (pExt.hasAdrenalineRush) {
      const healthPercent = this.player.health / this.player.maxHealth;
      if (healthPercent <= BALANCE.items.adrenalineRush.triggerHealthPercent) {
        if (!pExt.adrenalineActive) {
          pExt.adrenalineActive = true;
          pExt.baseSpeed = this.player.speed;
          this.player.speed *= (1 + BALANCE.items.adrenalineRush.statBoostPercent);
        }
      } else if (pExt.adrenalineActive) {
        pExt.adrenalineActive = false;
        this.player.speed = pExt.baseSpeed as number;
      }
    }
  }

  render(): void {
    this.renderInner();
    if (this.tutorialOverlay && this.tutorialOverlay.isActive()) {
      this.tutorialOverlay.render(this.ctx);
    }
    if (this.achievementToast) this.achievementToast.render(this.ctx);
    const dlg = ConfirmDialog.get();
    if (dlg && dlg.isOpen()) dlg.render(this.ctx);
    if (this._transitionAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, this._transitionAlpha);
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);
      this.ctx.restore();
      this._transitionAlpha -= this._lastDt / this._transitionDuration;
      if (this._transitionAlpha < 0) this._transitionAlpha = 0;
    }
  }

  renderInner(): void {
    const state = this.gameState.getState();

    if (state === GAME_STATES.MENU || state === GAME_STATES.GAME_OVER || state === GAME_STATES.CHARACTER_SELECT) {
      switch (this.activeScreen) {
        case 'character':
          this.characterScreen.render(this.ctx);
          break;
        case 'characterSelect':
          this.characterSelectScreen.render(this.ctx);
          break;
        case 'startingSetup':
          this.startingSetupScreen.render(this.ctx);
          break;
        case 'levelSelect':
          this.levelSelectScreen.render(this.ctx);
          break;
        case 'settings':
          this.settingsScreen.render(this.ctx);
          break;
        case 'controls':
          this.controlsScreen.render(this.ctx);
          break;
        case 'shop':
          this.shopScreen.render(this.ctx);
          break;
        case 'upgrade':
          this.renderGameState();
          this.upgradeScreen.render(this.ctx);
          break;
        case 'roundStats':
          this.roundStatsScreen.render(this.ctx);
          break;
        case 'gameOver':
          this.gameOverScreen.render(this.ctx);
          break;
        case 'runComplete':
          this.runCompleteScreen.render(this.ctx);
          break;
        case 'achievements':
          this.achievementsScreen.render(this.ctx);
          break;
        case 'stats':
          this.statsScreen.render(this.ctx);
          break;
        case 'menu':
        default:
          this.menu.render(this.ctx);
          break;
      }
      return;
    }

    if (state === GAME_STATES.PAUSED) {
      this.renderGame();
      this.pauseMenu.render(this.ctx);
      return;
    }

    this.effectsSystem.applyScreenShake(this.ctx);

    this.ctx.fillStyle = COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    this.ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);

    this.ctx.strokeStyle = COLORS.UI_BORDER;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.lineTo(this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.stroke();

    this.drawGrid();

    if (state === GAME_STATES.PLAYING) {
      this.renderGame();
      if (this.joystick && this.joystick.active) this.joystick.render(this.ctx);
    } else if (state === GAME_STATES.ROUND_COMPLETE) {
      this.renderGame();
      if (this.joystick && this.joystick.active) this.joystick.render(this.ctx);
      this.renderRoundComplete();
    } else if (state === GAME_STATES.GAME_OVER) {
      this.renderGameOver();
    }

    this.effectsSystem.restoreScreenShake(this.ctx);
  }

  drawGrid(): void {
    const ctx = this.ctx;
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;
    const top = GAME_CONFIG.UI_BAR_HEIGHT;
    const gridSize = 40;

    // Parallax offset from player position
    let offX = 0;
    let offY = 0;
    if (this.player) {
      offX = -(this.player.position.x * 0.08) % gridSize;
      offY = -(this.player.position.y * 0.08) % gridSize;
    }

    // Wave-based tint: boss=red, flood=yellow, otherwise normal green
    const level = this.gameState?.currentLevel || 1;
    const isBoss = !!(this.spawnSystem && this.spawnSystem.isBossWave());
    const isFlood = (level === 9 || level === 13 || level === 17 || level === 24 || level === 27);

    // Subtle pulse factor — slower, very low amplitude
    const t = performance.now() * 0.001;
    const pulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 1.2));

    let minorColor: string = COLORS.GRID;
    let majorColor: string = COLORS.GRID_MAJOR;
    if (isBoss) {
      minorColor = COLORS.GRID_BOSS;
      majorColor = '#2a0606';
    } else if (isFlood) {
      minorColor = COLORS.GRID_FLOOD;
      majorColor = '#2a2a06';
    }

    // Minor grid lines: single batched path
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = minorColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offX; x <= w; x += gridSize) {
      const xi = x | 0;
      ctx.moveTo(xi + 0.5, top);
      ctx.lineTo(xi + 0.5, h);
    }
    for (let y = top + offY; y <= h; y += gridSize) {
      const yi = y | 0;
      ctx.moveTo(0, yi + 0.5);
      ctx.lineTo(w, yi + 0.5);
    }
    ctx.stroke();

    // Major grid every 4 cells — batched path, slightly brighter
    ctx.strokeStyle = majorColor;
    ctx.beginPath();
    const major = gridSize * 4;
    for (let x = offX; x <= w; x += major) {
      const xi = x | 0;
      ctx.moveTo(xi + 0.5, top);
      ctx.lineTo(xi + 0.5, h);
    }
    for (let y = top + offY; y <= h; y += major) {
      const yi = y | 0;
      ctx.moveTo(0, yi + 0.5);
      ctx.lineTo(w, yi + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderUI(): void {
    const ctx = this.ctx;
    const w = this.canvas.logicalWidth;
    const h = this.canvas.logicalHeight;

    // Reset screen-shake translate for HUD (shake applies to arena, not UI)
    const shake = this.effectsSystem?.screenShake;
    const shakeActive = !!(shake && shake.duration > 0);
    if (shakeActive) {
      ctx.save();
      ctx.translate(-shake.offset.x, -shake.offset.y);
    }

    // Low-HP vignette pulse (<20%)
    const hpPercent = this.player.health / this.player.maxHealth;
    if (hpPercent < 0.2 && hpPercent > 0) {
      const t = performance.now() * 0.001;
      const pulseA = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6));
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,0,0,${pulseA})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, GAME_CONFIG.UI_BAR_HEIGHT, w, h - GAME_CONFIG.UI_BAR_HEIGHT);
    }

    const barY = 20;

    ctx.textAlign = 'left';

    // --- Health bar: segmented up to 30 HP, proportional beyond ---
    const hpBarY = barY;
    ctx.font = Game.FONT_HP_LABEL;
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.fillText('HP', 20, hpBarY + 10);

    const hpBarX = 45;
    const hpBarWidth = 160;
    const hpBarHeight = 14;

    // Background trough
    ctx.fillStyle = '#1a0505';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    ctx.strokeStyle = hpPercent < 0.25 ? COLORS.HUD_LOWHP : COLORS.UI_INACTIVE;
    ctx.lineWidth = 1;
    ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);

    // Round for display — float drift in stat-upgrade chains can leave
    // maxHealth at e.g. 21.9999999, which renders badly in "curHp/maxHp".
    const maxHp = Math.round(this.player.maxHealth);
    // Round (not ceil) so a rare `health > maxHealth` overshoot from lifesteal
    // or regen doesn't render as "22/21".
    const curHp = Math.max(0, Math.min(maxHp, Math.round(this.player.health)));
    const fillColor = hpPercent > 0.5 ? '#00FF6A' : (hpPercent > 0.25 ? '#FFCC00' : '#FF3030');

    if (maxHp <= 30) {
      // Segmented — 1 segment per HP point
      const gap = 1;
      const segW = (hpBarWidth - gap * (maxHp - 1)) / maxHp;
      for (let i = 0; i < maxHp; i++) {
        ctx.fillStyle = i < curHp ? fillColor : '#2a0a0a';
        const sx = hpBarX + i * (segW + gap);
        ctx.fillRect(sx, hpBarY + 1, segW, hpBarHeight - 2);
      }
    } else {
      // Proportional fill for high max HP
      ctx.fillStyle = fillColor;
      ctx.fillRect(hpBarX + 1, hpBarY + 1, (hpBarWidth - 2) * hpPercent, hpBarHeight - 2);
    }

    ctx.font = Game.FONT_HP_VAL;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${curHp}/${maxHp}`, hpBarX + hpBarWidth / 2, hpBarY + 11);

    // --- Money with coin icon ---
    const moneyY = hpBarY + 36;
    const coinX = 22;
    const coinR = 7;
    ctx.beginPath();
    ctx.arc(coinX, moneyY, coinR, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.HUD_MONEY;
    ctx.fill();
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#8B6914';
    ctx.font = Game.FONT_COIN;
    ctx.textAlign = 'center';
    ctx.fillText('$', coinX, moneyY + 3);

    ctx.font = Game.FONT_MONEY;
    ctx.fillStyle = COLORS.HUD_MONEY;
    ctx.textAlign = 'left';
    ctx.fillText(`${this.gameState.playerData.money + this.moneyEarned}`, coinX + coinR + 6, moneyY + 6);
    if (this.moneyEarned > 0) {
      ctx.font = Game.FONT_HP_VAL;
      ctx.fillStyle = '#9CFFB0';
      ctx.fillText(`+${this.moneyEarned}`, coinX + coinR + 6 + 82, moneyY + 6);
    }

    if (this.weaponDamageStats.size > 0) {
      // Throttle the sort+rebuild to ~3Hz. Late-wave damage is hundreds of events/sec;
      // rebuilding the HUD string every frame is wasted work.
      const nowMs = performance.now();
      if (!this._cachedDmgText || nowMs - this._cachedDmgAt > 350) {
        this._cachedDmgAt = nowMs;
        const sorted = [...this.weaponDamageStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        let text = 'DMG: ';
        for (const [weaponId, damage] of sorted) {
          const weaponConfig = (BALANCE.weapons as unknown as Record<string, Record<string, string>>)[weaponId];
          const weaponName = weaponConfig?.name || weaponId;
          const shortName = weaponName.split(' ')[0].substring(0, 4).toUpperCase();
          text += `${shortName}:${damage.toFixed(0)} `;
        }
        this._cachedDmgText = text.trim();
      }
      ctx.font = Game.FONT_DMG;
      ctx.fillStyle = '#FF8800';
      ctx.textAlign = 'left';
      ctx.fillText(this._cachedDmgText, coinX + coinR + 6, moneyY + 22);
    }

    // --- Wave counter (top-center, large) ---
    const centerX = w / 2;
    ctx.textAlign = 'center';
    ctx.font = Game.FONT_WAVE;
    ctx.fillStyle = COLORS.HUD_WAVE;
    ctx.fillText(`WAVE ${this.gameState.currentLevel} / ${GAME_CONFIG.TOTAL_LEVELS}`, centerX, barY + 8);

    // Timer / boss label underneath
    if (this.spawnSystem && this.spawnSystem.isBossWave()) {
      ctx.font = Game.FONT_BOSS;
      const t = performance.now() * 0.001;
      const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 4));
      ctx.fillStyle = `rgba(255,68,68,${pulse})`;
      ctx.fillText('BOSS FIGHT', centerX, barY + 42);
    } else {
      const timeRemaining = Math.max(0, Math.ceil(this.roundTimer));
      ctx.font = Game.FONT_TIMER;
      ctx.fillStyle = timeRemaining <= 10 ? COLORS.HUD_LOWHP : COLORS.UI_TEXT;
      ctx.fillText(`${timeRemaining}s`, centerX, barY + 48);
    }
    ctx.font = Game.FONT_RIGHT;

    this.ctx.textAlign = 'right';
    this.ctx.font = Game.FONT_RIGHT;
    this.ctx.fillStyle = COLORS.UI_TEXT;

    const rightX = this.canvas.logicalWidth - 20;
    this.ctx.fillText(`Enemies: ${this.enemies.length}`, rightX, barY);

    const itemCount = (this.gameState.playerData.items || []).length;
    if (this.character && this.character.getMaxWeapons() > 0) {
      const weaponCount = (this.gameState.playerData.weapons || []).length;
      this.ctx.fillText(`Weapons: ${weaponCount} | Items: ${itemCount}`, rightX, barY + 20);
    } else {
      this.ctx.fillText(`Items: ${itemCount}`, rightX, barY + 20);
    }

    this.ctx.font = Game.FONT_STATS;
    this.ctx.fillStyle = '#00FF00';
    const stats = this.gameState.playerData.stats;
    // Round all HUD stat values — float drift in upgrade chains otherwise shows
    // e.g. "9.9999999%" dodge or "3.99999" luck.
    const spd = Math.round(stats.speed);
    const dodge = `${Math.round(stats.dodge)}%`;
    const luck = Math.round(stats.luck * 10) / 10; // one decimal place, drift-safe
    const armor = Math.round(stats.armor ?? 0);
    const regen = (Math.round(stats.regeneration * 100) / 10).toFixed(1);
    const pickup = Math.round(stats.pickupRange);

    if (this.character && this.character.getMaxWeapons() > 0) {
      // Round damage/fireRate to 1dp (genuinely fractional); crit % are integer.
      // Math.round before toFixed avoids 9.9999% rendering as "9%".
      const dmg = (Math.round(stats.damage * 10) / 10).toFixed(1);
      const fire = (Math.round(stats.fireRate * 10) / 10).toFixed(1);
      const crit = `${Math.round(stats.critChance)}%`;
      const critDmg = `${Math.round(stats.critDamage)}%`;
      this.ctx.fillText(`DMG:${dmg} FIRE:${fire}x CRIT:${crit}/${critDmg}`, rightX, barY + 35);
    }
    this.ctx.fillText(`SPD:${spd} DODGE:${dodge} LUCK:${luck}`, rightX, barY + 47);
    this.ctx.fillText(`ARM:${armor} REGEN:${regen}/s RNG:${pickup}`, rightX, barY + 59);

    // Boss HUD: health bar across top, banner
    const boss = this.spawnSystem?.getBoss();
    if (boss && boss instanceof Boss && boss.alive) {
      const bw2 = this.canvas.logicalWidth;
      const bh = 18;
      const bw = bw2 * 0.7;
      const bx = (bw2 - bw) / 2;
      const by = GAME_CONFIG.UI_BAR_HEIGHT + 10;
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 22);
      this.ctx.strokeStyle = boss.cfg.strokeColor;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(bx, by, bw, bh);
      const pct = Math.max(0, boss.health / boss.maxHealth);
      this.ctx.fillStyle = '#440000';
      this.ctx.fillRect(bx, by, bw, bh);
      this.ctx.fillStyle = boss.cfg.strokeColor;
      this.ctx.fillRect(bx, by, bw * pct, bh);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = Game.FONT_BOSS_LABEL;
      this.ctx.textAlign = 'left';
      const totalPhases = boss.cfg.phases ? boss.cfg.phases.length : 1;
      this.ctx.fillText(`${boss.bossName}  —  PHASE ${boss.bossPhase || 1}/${totalPhases}`, bx, by + bh + 14);
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${Math.ceil(boss.health)} / ${Math.ceil(boss.maxHealth)}`, bx + bw, by + bh + 14);

      // Banner
      if (boss.bannerLife > 0 && boss.pendingBanner) {
        const alpha = Math.min(1, boss.bannerLife / 0.5);
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = '#000';
        const by2 = this.canvas.logicalHeight * 0.3;
        this.ctx.fillRect(0, by2 - 32, bw2, 70);
        this.ctx.fillStyle = boss.cfg.strokeColor;
        this.ctx.font = Game.FONT_BANNER;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(boss.pendingBanner, bw2 / 2, by2 + 8);
        this.ctx.restore();
      }
    }

    // Pause hint (ESC is the only allowed non-WASD key)
    ctx.font = Game.FONT_HINT;
    ctx.fillStyle = 'rgba(0,255,0,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('ESC: pause', w - 8, h - 8);

    if (shakeActive) ctx.restore();
  }

  renderRoundComplete(): void {
    this.ctx.fillStyle = COLORS.UI_TEXT;
    this.ctx.font = 'bold 42px monospace';
    this.ctx.textAlign = 'center';
    const centerY = (this.canvas.logicalHeight + GAME_CONFIG.UI_BAR_HEIGHT) / 2;
    this.ctx.fillText('ROUND COMPLETE!', this.canvas.logicalWidth / 2, centerY - 40);

    this.ctx.font = 'bold 26px monospace';
    this.ctx.fillText(
      `Money Earned: $${this.moneyEarned}`,
      this.canvas.logicalWidth / 2,
      centerY + 10
    );
  }

  renderGameOver(): void {
    this.ctx.fillStyle = '#FF0000';
    this.ctx.font = 'bold 62px monospace';
    this.ctx.textAlign = 'center';
    const centerY = (this.canvas.logicalHeight + GAME_CONFIG.UI_BAR_HEIGHT) / 2;
    this.ctx.fillText('GAME OVER', this.canvas.logicalWidth / 2, centerY);

    this.ctx.fillStyle = COLORS.UI_TEXT;
    this.ctx.font = 'bold 26px monospace';
    this.ctx.fillText('Restarting...', this.canvas.logicalWidth / 2, centerY + 40);
  }

  renderGame(): void {
    this.ctx.fillStyle = COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    this.ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);

    this.ctx.strokeStyle = COLORS.UI_BORDER;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.lineTo(this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.stroke();

    this.drawGrid();

    if (this.gameState.currentLevel === 1 && this.roundTimer > 55) {
      if (Math.floor(this.roundTimer * 2) % 2 === 0) {
        const isMobile = this.canvas.logicalHeight > this.canvas.logicalWidth;
        const msg = isMobile ? 'USE VIRTUAL JOYSTICK TO MOVE' : 'USE W A S D TO MOVE';
        this.ctx.save();
        this.ctx.fillStyle = COLORS.UI_TEXT;
        this.ctx.font = Game.FONT_BANNER;
        this.ctx.textAlign = 'center';
        this.ctx.globalAlpha = 0.8;
        this.ctx.fillText(msg, this.canvas.logicalWidth / 2, this.canvas.logicalHeight / 2 + 150);
        this.ctx.restore();
      }
    }

    for (const pickup of this.pickups) {
      pickup.render(this.ctx);
    }

    for (const enemy of this.enemies) {
      enemy.render(this.ctx);
    }

    for (const projectile of this.projectiles) {
      projectile.render(this.ctx);
    }

    if (this.player) {
      this.player.render(this.ctx);
      this.weaponSystem.render(this.ctx, this.player);
      if (this.character) {
        this.character.onRender(this.ctx, this.player);
      }
    }

    this.effectsSystem.renderParticles(this.ctx);
    this.effectsSystem.renderFloatingTexts(this.ctx);

    if (this.player) {
      this.renderUI();
    }

    this.effectsSystem.renderFlashes(this.ctx);
  }

  renderGameState(): void {
    this.ctx.fillStyle = COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    this.ctx.fillStyle = COLORS.UI_BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);

    this.ctx.strokeStyle = COLORS.UI_BORDER;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.lineTo(this.canvas.logicalWidth, GAME_CONFIG.UI_BAR_HEIGHT);
    this.ctx.stroke();

    this.drawGrid();

    if (this.player) {
      this.renderUI();
    }
  }

  // GameAPI implementation
  getPlayer(): Player { return this.player; }
  getEnemies(): Enemy[] { return this.enemies; }
  recordDamage(sourceId: string, amount: number): void {
    if (amount <= 0) return;
    // Always mirror into the in-HUD "DMG:" strip so spells / allies / structures
    // show up there, not just weapon projectiles. Previously only the projectile
    // path wrote to weaponDamageStats, leaving Wizard/Manager/Capitalist HUDs empty.
    const cur = this.weaponDamageStats.get(sourceId) || 0;
    this.weaponDamageStats.set(sourceId, cur + amount);
    if (!this.roundStats) return;
    this.roundStats.totalDamageDealt += amount;
    const prev = this.roundStats.damageByWeapon.get(sourceId) || 0;
    this.roundStats.damageByWeapon.set(sourceId, prev + amount);
  }
  getProjectiles(): import('./entities/Projectile').Projectile[] { return this.projectiles; }
  getPickups(): Pickup[] { return this.pickups; }
  getEffectsSystem(): EffectsSystem { return this.effectsSystem; }
  getSoundSystem(): SoundSystem { return this.soundSystem; }
  getWeaponSystem(): WeaponSystem { return this.weaponSystem; }
  getGameState(): GameState { return this.gameState; }
  getCanvas(): GameCanvas { return this.canvas; }
  spawnMoneyPickup(x: number, y: number, value: number, fromBusiness: boolean = false): void {
    const pickup = new Pickup(x, y, 'money');
    pickup.value = Math.max(1, Math.floor(value));
    if (fromBusiness) {
      pickup.fromBusiness = true;
      // Pop the coin out of the business sprite: random outward velocity +
      // gentle gravity arc via the existing bob/age math (velocity damps
      // naturally since pickups don't self-update velocity).
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 140 + Math.random() * 60;
      pickup.velocity.x = Math.cos(ang) * speed;
      pickup.velocity.y = Math.sin(ang) * speed;
      pickup.spawnBurst = 1.2;
    }
    this.pickups.push(pickup);
    if (this.roundStats) this.roundStats.moneySpawned += pickup.value;
  }

  /**
   * Seed a burst of basic blue bouncers (and optional speedy cyan variants) from
   * random corners. Used at wave-start (+2s) and mid-wave (+30s on non-flood/boss
   * waves) for reinforcement bursts.
   */
  private spawnBasicSeedBurst(basicCount: number, speedyCount: number): void {
    const w2 = this.canvas.logicalWidth;
    const h2 = this.canvas.logicalHeight;
    const corners = [
      { x: 20, y: GAME_CONFIG.UI_BAR_HEIGHT + 20 },
      { x: w2 - 20, y: GAME_CONFIG.UI_BAR_HEIGHT + 20 },
      { x: 20, y: h2 - 20 },
      { x: w2 - 20, y: h2 - 20 },
    ];
    const seed = (makeSpeedy: boolean): void => {
      const corner = corners[Math.floor(Math.random() * 4)];
      // Nudge inward so the enemy doesn't spawn on the exact edge.
      const sx = corner.x < w2 / 2 ? corner.x + 30 : corner.x - 30;
      const sy = corner.y < h2 / 2 ? corner.y + 30 : corner.y - 30;
      const e = new Enemy(sx, sy, 'basic', this.gameState.currentLevel);
      e.bounceOffWalls = true;
      const toCenterX = w2 / 2 - sx;
      const toCenterY = h2 / 2 - sy;
      const baseAngle = Math.atan2(toCenterY, toCenterX);
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.9;
      if (makeSpeedy) {
        const ext = e as unknown as Record<string, unknown>;
        ext.isSpeed = true;
        e.color = '#00FFFF';
        e.speed *= 4.0;
        ext.speedTextTimer = 1.5;
        // 1 in 5 cyan speedies in the seed burst is a glowing ultra variant.
        if (Math.random() < 0.20) {
          ext.isMegaSpeed = true;
          e.speed *= 2.5; // 4.0 × 2.5 = 10× base
        }
      }
      e.velocity.x = Math.cos(angle) * e.speed;
      e.velocity.y = Math.sin(angle) * e.speed;
      const eExt = e as unknown as { randomDirection?: { x: number; y: number } };
      eExt.randomDirection = { x: e.velocity.x, y: e.velocity.y };
      this.enemies.push(e);
    };
    for (let i = 0; i < basicCount; i++) seed(false);
    for (let i = 0; i < speedyCount; i++) seed(true);
  }
  getCurrentLevel(): number { return this.gameState.currentLevel; }
}
