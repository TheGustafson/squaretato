import { GAME_STATES } from '../constants.js';
import { BALANCE } from '../config/balance.js';

export class GameState {
  constructor() {
    this.currentState = GAME_STATES.MENU;
    this.playerData = this.loadPlayerData();
    this.currentLevel = 1;
    this.roundTimer = 0;
  }

  loadPlayerData() {
    const saved = localStorage.getItem('roguelikeGameData');
    if (saved) {
      const data = JSON.parse(saved);
      // Ensure weaponLevels exists for older saves
      if (!data.weaponLevels) {
        data.weaponLevels = {};
        // Set all owned weapons to level 1
        if (data.weapons) {
          for (const weaponId of data.weapons) {
            data.weaponLevels[weaponId] = 1;
          }
        }
      }
      return data;
    }
    return {
      unlockedLevels: 1,
      money: 0,
      stats: {
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
      },
      upgradePurchases: {
        health: 0,
        speed: 0,
        damage: 0,
        fireRate: 0,
        dodge: 0,
        luck: 0,
        critChance: 0,
        critDamage: 0,
        regeneration: 0,
      },
      weapons: ['pistol'], // Start with pistol
      weaponLevels: { pistol: 1 }, // Track upgrade level for each weapon (1-4)
      items: [], // unique items/perks purchased
      controlScheme: 'MOUSE',
    };
  }

  savePlayerData() {
    localStorage.setItem('roguelikeGameData', JSON.stringify(this.playerData));
  }

  resetProgress() {
    this.playerData = {
      unlockedLevels: 1,
      money: 0,
      stats: {
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
      },
      upgradePurchases: {
        health: 0,
        speed: 0,
        damage: 0,
        fireRate: 0,
        dodge: 0,
        luck: 0,
        critChance: 0,
        critDamage: 0,
        regeneration: 0,
      },
      weapons: ['pistol'],
      weaponLevels: { pistol: 1 },
      items: [],
      controlScheme: this.playerData.controlScheme, // Keep control preference
    };
    this.savePlayerData();
  }

  completeLevel(level, moneyEarned) {
    this.playerData.money += moneyEarned;
    
    if (level >= this.playerData.unlockedLevels && level < 30) {
      this.playerData.unlockedLevels = level + 1;
    }
    this.savePlayerData();
  }

  setState(newState) {
    this.currentState = newState;
  }

  getState() {
    return this.currentState;
  }
}