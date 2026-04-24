import { BALANCE } from '../config/balance';
import type { PlayerData } from '../types';

export function applyItemEffect(itemId: string, playerData: PlayerData): void {
  const item = (BALANCE.items as Record<string, Record<string, unknown>>)[itemId];
  if (!item) return;

  const stats = playerData.stats;

  // Same cap helpers as applyUpgrade — items were a second stat path that
  // completely bypassed the upgrade caps, so a stack of proteinBar + tankArmor
  // + reinforcedPlating could push health past BALANCE.upgrades.health.maxValue.
  const caps = BALANCE.upgrades as Record<string, { maxValue?: number } | undefined>;
  const capFor = (t: string): number | null => {
    const e = caps[t];
    return e && typeof e.maxValue === 'number' ? e.maxValue : null;
  };
  const clamp = (t: string, v: number): number => {
    const c = capFor(t);
    return c !== null ? Math.min(c, v) : v;
  };

  switch (itemId) {
    case 'moneyMagnet': stats.pickupRange *= item.rangeMultiplier as number; break;
    case 'luckyPenny': stats.luck = clamp('luck', stats.luck + (item.luckBonus as number)); break;
    case 'speedBoots': stats.speed = clamp('speed', stats.speed * (item.speedMultiplier as number)); break;
    case 'sharpShooter':
      stats.critChance = clamp('critChance', stats.critChance + (item.critChanceBonus as number));
      stats.critDamage = clamp('critDamage', stats.critDamage + (item.critDamageBonus as number));
      break;
    case 'tankArmor': stats.health = clamp('health', stats.health + (item.healthBonus as number)); break;
    case 'titansBelt': stats.health = clamp('health', stats.health + (item.healthBonus as number)); break;
    case 'rapidReload': stats.fireRate = clamp('fireRate', stats.fireRate * (item.fireRateMultiplier as number)); break;
    case 'luckyCoin': stats.luck = clamp('luck', stats.luck + (item.luckBonus as number)); break;
    case 'energyDrink': stats.speed = clamp('speed', stats.speed + (item.speedBonus as number)); break;
    case 'proteinBar': stats.health = clamp('health', stats.health + (item.healthBonus as number)); break;
    case 'sharpTips': stats.damage = clamp('damage', stats.damage * (1 + (item.damagePercent as number))); break;
    case 'quickHands': stats.fireRate = clamp('fireRate', stats.fireRate * (1 + (item.fireRatePercent as number))); break;
    case 'bandaidPack': stats.regeneration = clamp('regeneration', stats.regeneration + (item.regenBonus as number)); break;
    case 'coffeeShot':
      stats.speed = clamp('speed', stats.speed * (1 + (item.speedPercent as number)));
      stats.fireRate = clamp('fireRate', stats.fireRate * (1 + (item.fireRatePercent as number)));
      break;
    case 'magnetGloves': stats.pickupRange += item.pickupRangeBonus as number; break;
    case 'criticalEye': stats.critChance = clamp('critChance', stats.critChance + (item.critChanceBonus as number)); break;
    case 'heavyRounds':
      stats.damage = clamp('damage', stats.damage * (item.damageMultiplier as number));
      stats.fireRate = clamp('fireRate', stats.fireRate * (item.fireRateMultiplier as number));
      break;
    case 'glassCannon':
      stats.damage = clamp('damage', stats.damage * (item.damageMultiplier as number));
      stats.health *= item.healthMultiplier as number; // reductive, no cap needed
      break;
    case 'chronoCrystal': stats.cooldownReduction = (stats.cooldownReduction || 0) + (item.cooldownReduction as number); break;
    case 'spellFocus': stats.spellPower = (stats.spellPower || 0) + (item.spellPowerBonus as number); break;
    case 'arcaneConduit': stats.cooldownReduction = (stats.cooldownReduction || 0) + (item.cooldownReduction as number); break;
    case 'temporalFlow': stats.cooldownSpeed = (stats.cooldownSpeed || 0) + (item.cooldownSpeedBonus as number); break;
    case 'voidchannel': stats.spellPower = (stats.spellPower || 0) + (item.spellPowerBonus as number); break;
    // Universal items — clamped to the same upgrade caps as upgrade-screen purchases.
    case 'reinforcedPlating':
      stats.health = clamp('health', stats.health + (item.healthBonus as number));
      stats.regeneration = clamp('regeneration', stats.regeneration + (item.regenBonus as number));
      break;
    case 'sniperScope':
      stats.critDamage = clamp('critDamage', stats.critDamage + (item.critDamageBonus as number));
      break;
    case 'evasionTraining':
      stats.dodge = Math.min(capFor('dodge') ?? 95, (stats.dodge || 0) + (item.dodgeBonus as number));
      break;
    case 'prospectorsCharm':
      stats.luck = clamp('luck', stats.luck + (item.luckBonus as number));
      stats.pickupRange += item.pickupRangeBonus as number;
      break;
  }
}

// Apply end-of-wave upgrade effects. Extends the basic stat upgrades handled
// directly in UpgradeScreen.selectUpgrade() with character-specific stats.
// Character-specific stats are stored on playerData.stats as optional numeric
// fields and then read by the relevant character in its onStartLevel/onUpdate.
export function applyUpgrade(type: string, value: number, playerData: PlayerData): void {
  const stats = playerData.stats;
  // Generic upgrades pulled from BALANCE.upgrades honor their maxValue cap so
  // end-of-wave random upgrades + shop purchases can't stack past the design
  // cap set in balance.ts.
  const caps = BALANCE.upgrades as Record<string, { maxValue?: number } | undefined>;
  const capFor = (t: string): number | null => {
    const e = caps[t];
    return e && typeof e.maxValue === 'number' ? e.maxValue : null;
  };
  const addCapped = (cur: number, t: string, hardCap: number | null = null): number => {
    const cap = hardCap ?? capFor(t);
    return cap !== null ? Math.min(cap, cur + value) : cur + value;
  };
  switch (type) {
    // Generic stats — maxValue comes from BALANCE.upgrades entries.
    case 'health': stats.health = addCapped(stats.health, 'health'); break;
    case 'damage': stats.damage = addCapped(stats.damage, 'damage'); break;
    case 'fireRate': stats.fireRate = addCapped(stats.fireRate, 'fireRate'); break;
    case 'speed': stats.speed = addCapped(stats.speed, 'speed'); break;
    case 'dodge': stats.dodge = Math.min(capFor('dodge') ?? 95, (stats.dodge || 0) + value); break;
    case 'luck': stats.luck = addCapped(stats.luck, 'luck'); break;
    case 'critChance': stats.critChance = Math.min(capFor('critChance') ?? 100, (stats.critChance || 0) + value); break;
    case 'critDamage': stats.critDamage = addCapped(stats.critDamage, 'critDamage'); break;
    case 'regeneration': stats.regeneration = addCapped(stats.regeneration, 'regeneration'); break;
    case 'cooldownSpeed': stats.cooldownSpeed = Math.min(capFor('cooldownSpeed') ?? Infinity, (stats.cooldownSpeed || 0) + value); break;
    case 'spellPower': stats.spellPower = Math.min(capFor('spellPower') ?? Infinity, (stats.spellPower || 0) + value); break;
    // Hulk
    case 'slamRadius': stats.slamRadiusBonus = (stats.slamRadiusBonus || 0) + value; break;
    case 'fistSwingSpeed': stats.fistSwingSpeedBonus = (stats.fistSwingSpeedBonus || 0) + value; break;
    case 'armor': stats.armor = Math.min(0.75, (stats.armor || 0) + value); break;
    // Vampire
    case 'bloodDrain': stats.bloodDrainBonus = (stats.bloodDrainBonus || 0) + value; break;
    case 'frenzyThreshold': stats.frenzyThresholdBonus = (stats.frenzyThresholdBonus || 0) + value; break;
    case 'bloodBankCapacity': stats.bloodBankCapacityBonus = (stats.bloodBankCapacityBonus || 0) + value; break;
    // Speedster
    case 'afterimageDamage': stats.afterimageDamageBonus = (stats.afterimageDamageBonus || 0) + value; break;
    case 'dashDistance': stats.dashDistanceBonus = (stats.dashDistanceBonus || 0) + value; break;
    case 'timeDilationDuration': stats.timeDilationDurationBonus = (stats.timeDilationDurationBonus || 0) + value; break;
    // Manager
    case 'recruitDamage': stats.recruitDamageBonus = (stats.recruitDamageBonus || 0) + value; break;
    case 'recruitHealth': stats.recruitHealthBonus = (stats.recruitHealthBonus || 0) + value; break;
    case 'recruitSpeed': stats.recruitSpeedBonus = (stats.recruitSpeedBonus || 0) + value; break;
    case 'synergyBonus': stats.synergyBonus = (stats.synergyBonus || 0) + value; break;
    // Capitalist
    case 'productionSpeed': stats.productionSpeedBonus = (stats.productionSpeedBonus || 0) + value; break;
    case 'dividendRate': stats.dividendRateBonus = (stats.dividendRateBonus || 0) + value; break;
    case 'structureHealth': stats.structureHealthBonus = (stats.structureHealthBonus || 0) + value; break;
    // Fighter
    case 'burstDuration': stats.burstDurationBonus = (stats.burstDurationBonus || 0) + value; break;
    case 'momentumDecayRate': stats.momentumDecayRateBonus = (stats.momentumDecayRateBonus || 0) + value; break;
  }
}
