import { BALANCE } from './config/balance';

// GAME_CONFIG: logical canvas sizing + a few commonly-imported gameplay
// constants. Most per-entity numbers now live in config/balance.ts; only keep
// entries here that are actually read from non-balance call-sites.
export const GAME_CONFIG = {
  CANVAS_WIDTH: BALANCE.ui.canvasWidth,
  CANVAS_HEIGHT: BALANCE.ui.canvasHeight,
  UI_BAR_HEIGHT: BALANCE.ui.uiBarHeight,
  TOTAL_LEVELS: 30,
  PLAYER_SPEED: BALANCE.player.baseSpeed,
  PLAYER_SIZE: BALANCE.player.size,
  PLAYER_HEALTH: BALANCE.player.baseHealth,
  ENEMY_SIZE: BALANCE.enemy.size,
  PROJECTILE_SIZE: BALANCE.projectile.baseSize,
  PROJECTILE_SPEED: BALANCE.projectile.baseSpeed,
  MONEY_VALUE: BALANCE.economy.moneyDropValue,
} as const;

export const GAME_STATES = {
  MENU: 'MENU',
  LEVEL_SELECT: 'LEVEL_SELECT',
  CHARACTER_SELECT: 'CHARACTER_SELECT',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
  GAME_OVER: 'GAME_OVER',
  RUN_COMPLETE: 'RUN_COMPLETE',
} as const;

export const CONTROL_SCHEMES = {
  MOUSE: 'MOUSE',
  KEYBOARD: 'KEYBOARD',
} as const;

// COLORS: cohesive terminal-green palette with a few accent hues for HUD
// (money, low HP warning, wave counter) and special grid tints used during
// boss / flood waves. Keep additions here rather than scattering hex values.
export const COLORS = {
  // Base palette
  BACKGROUND: '#000000',
  PLAYER: '#00FF00',
  UI_TEXT: '#00FF00',
  UI_INACTIVE: '#006600',
  UI_BACKGROUND: '#0a0a0a',
  UI_BORDER: '#00FF00',
  // Grid variants
  GRID: '#001100',
  GRID_MAJOR: '#002200',
  GRID_BOSS: '#1a0404',
  GRID_FLOOD: '#1a1a04',
  // HUD accents
  HUD_MONEY: '#FFD54A',
  HUD_WAVE: '#9CFFB0',
  HUD_LOWHP: '#FF3030',
  // Unified UI surface palette (menus / panels / dialogs).
  // Dark-to-light panel fills, subtle-to-strong borders, and accent hues for
  // contextual meaning (gold for money/rewards, cyan for info, red for danger).
  PANEL_DARK: '#0A0F0A',
  PANEL_MID: '#0F1511',
  PANEL_HIGHLIGHT: '#1A2419',
  BORDER_SUBTLE: '#1E2A1E',
  BORDER_STRONG: '#2E3E2E',
  ACCENT_GOLD: '#FFD56B',
  ACCENT_CYAN: '#6BD5FF',
  ACCENT_RED: '#FF5A5A',
} as const;
