import { BALANCE } from './config/balance.js';

export const GAME_CONFIG = {
  CANVAS_WIDTH: BALANCE.ui.canvasWidth,
  CANVAS_HEIGHT: BALANCE.ui.canvasHeight,
  GAME_AREA_HEIGHT: BALANCE.ui.gameAreaHeight,
  UI_BAR_HEIGHT: BALANCE.ui.uiBarHeight,
  ROUND_DURATION: BALANCE.spawning.waveDuration,
  TOTAL_LEVELS: 30,
  PLAYER_SPEED: BALANCE.player.baseSpeed,
  PLAYER_SIZE: BALANCE.player.size,
  PLAYER_HEALTH: BALANCE.player.baseHealth,
  ENEMY_SIZE: BALANCE.enemy.size,
  ENEMY_SPEED: BALANCE.enemy.baseSpeed,
  ENEMY_HEALTH: BALANCE.enemy.baseHealth,
  ENEMY_DAMAGE: BALANCE.enemy.baseDamage,
  ENEMY_COLORS: {
    BASIC: '#FF0000', // Red
    FAST: '#800080', // Purple
    TANK: '#FFA500', // Orange
    BURST: '#FFC0CB', // Pink
    ZIGZAG: '#FFFF00', // Yellow
  },
  PROJECTILE_SIZE: BALANCE.projectile.baseSize,
  PROJECTILE_SPEED: BALANCE.projectile.baseSpeed,
  MONEY_DROP_CHANCE: BALANCE.economy.moneyDropChance,
  MONEY_VALUE: BALANCE.economy.moneyDropValue,
  REROLL_COST: BALANCE.endWaveUpgrades.rerollCost,
};

export const GAME_STATES = {
  MENU: 'MENU',
  LEVEL_SELECT: 'LEVEL_SELECT',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
  GAME_OVER: 'GAME_OVER',
};

export const CONTROL_SCHEMES = {
  MOUSE: 'MOUSE',
  KEYBOARD: 'KEYBOARD',
};

export const COLORS = {
  BACKGROUND: '#000000',
  PLAYER: '#00FF00',
  UI_TEXT: '#00FF00',
  UI_INACTIVE: '#006600',  // Made brighter for better visibility
  GRID: '#001100',
  UI_BACKGROUND: '#0a0a0a',
  UI_BORDER: '#00FF00',
};