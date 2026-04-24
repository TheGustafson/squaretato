import type { RecruitData } from './RecruitSystem';
import { RECRUIT_CLASSES } from './RecruitSystem';

export interface Synergy {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (roster: RecruitData[]) => boolean;
  bonuses: SynergyBonus;
}

export interface SynergyBonus {
  damageMultiplier?: number;
  healthMultiplier?: number;
  fireRateMultiplier?: number;
  speedMultiplier?: number;
  moneyMultiplier?: number;
  healingMultiplier?: number;
  filter?: (r: RecruitData) => boolean;
}

export interface ActiveSynergy {
  synergy: Synergy;
  bonuses: SynergyBonus;
}

function countByPredicate(roster: RecruitData[], pred: (r: RecruitData) => boolean): number {
  let c = 0;
  for (const r of roster) if (!r.dead && pred(r)) c++;
  return c;
}

function countMelee(roster: RecruitData[]): number {
  return countByPredicate(roster, r => RECRUIT_CLASSES[r.className]?.isMelee === true);
}

function countRanged(roster: RecruitData[]): number {
  return countByPredicate(roster, r => {
    const cls = RECRUIT_CLASSES[r.className];
    return cls ? !cls.isMelee && !cls.isHealer && !cls.isUtility : false;
  });
}

function countClass(roster: RecruitData[], className: string): number {
  return countByPredicate(roster, r => r.className === className);
}

function countUniqueClasses(roster: RecruitData[]): number {
  const seen = new Set<string>();
  for (const r of roster) if (!r.dead) seen.add(r.className);
  return seen.size;
}

function hasClass(roster: RecruitData[], cls: string): boolean {
  return roster.some(r => !r.dead && r.className === cls);
}

function mostCommonClass(roster: RecruitData[]): { className: string; count: number } {
  const counts: Record<string, number> = {};
  for (const r of roster) {
    if (r.dead) continue;
    counts[r.className] = (counts[r.className] || 0) + 1;
  }
  let best = '';
  let bestCount = 0;
  for (const [cls, count] of Object.entries(counts)) {
    if (count > bestCount) { best = cls; bestCount = count; }
  }
  return { className: best, count: bestCount };
}

export const SYNERGIES: Synergy[] = [
  {
    id: 'meleeBrotherhood',
    name: 'Melee Brotherhood',
    description: '2+ melee: +15% HP for melee recruits',
    icon: 'M',
    check: r => countMelee(r) >= 2,
    bonuses: {
      healthMultiplier: 1.15,
      filter: r => RECRUIT_CLASSES[r.className]?.isMelee === true,
    },
  },
  {
    id: 'firingLine',
    name: 'Firing Line',
    description: '2+ ranged: +10% fire rate for ranged recruits',
    icon: 'R',
    check: r => countRanged(r) >= 2,
    bonuses: {
      fireRateMultiplier: 1.1,
      filter: r => {
        const cls = RECRUIT_CLASSES[r.className];
        return cls ? !cls.isMelee && !cls.isHealer && !cls.isUtility : false;
      },
    },
  },
  {
    id: 'specialization',
    name: 'Specialization',
    description: '3 of same class: +20% damage for that class',
    icon: 'S',
    check: r => mostCommonClass(r).count >= 3,
    bonuses: {
      damageMultiplier: 1.2,
      filter: () => false,
    },
  },
  {
    id: 'fullSpectrum',
    name: 'Full Spectrum',
    description: '5+ different classes: all recruits +10% damage',
    icon: 'F',
    check: r => countUniqueClasses(r) >= 5,
    bonuses: { damageMultiplier: 1.1 },
  },
  {
    id: 'frontlineSupport',
    name: 'Frontline Support',
    description: 'Healer + Tank: healer doubles healing on tanks',
    icon: '+',
    check: r => hasClass(r, 'healer') && hasClass(r, 'tank'),
    bonuses: { healingMultiplier: 2.0, filter: r => r.className === 'tank' },
  },
  {
    id: 'marksmanship',
    name: 'Marksmanship',
    description: 'Scout + Sniper: marks deal 2x damage instead of 1.15x',
    icon: 'X',
    check: r => hasClass(r, 'scout') && hasClass(r, 'sniper'),
    bonuses: { damageMultiplier: 2.0 / 1.15, filter: r => r.className === 'sniper' },
  },
  {
    id: 'corporation',
    name: 'Corporation',
    description: 'Tax Collector + 3 support/utility: double tax income',
    icon: '$',
    check: r => {
      if (!hasClass(r, 'taxCollector')) return false;
      const support = countByPredicate(r, rec => {
        const cls = RECRUIT_CLASSES[rec.className];
        return cls ? (cls.isHealer || cls.isUtility) === true : false;
      });
      return support >= 3;
    },
    bonuses: { moneyMultiplier: 2.0, filter: r => r.className === 'taxCollector' },
  },
  {
    id: 'berserkerPack',
    name: 'Berserker Pack',
    description: '2+ berserkers: +20% speed for berserkers',
    icon: 'B',
    check: r => countClass(r, 'berserker') >= 2,
    bonuses: {
      speedMultiplier: 1.2,
      filter: r => r.className === 'berserker',
    },
  },
  {
    id: 'gunline',
    name: 'Gunline',
    description: '3+ gunners: +20% fire rate for all gunners',
    icon: 'G',
    check: r => countClass(r, 'gunner') >= 3,
    bonuses: {
      fireRateMultiplier: 1.2,
      filter: r => r.className === 'gunner',
    },
  },
  {
    id: 'arcaneBattalion',
    name: 'Arcane Battalion',
    description: 'Mage + any healer/medic: +25% damage for mages',
    icon: 'A',
    check: r =>
      hasClass(r, 'mage') && (hasClass(r, 'healer') || hasClass(r, 'medic')),
    bonuses: {
      damageMultiplier: 1.25,
      filter: r => r.className === 'mage',
    },
  },
  {
    id: 'fieldHospital',
    name: 'Field Hospital',
    description: 'Healer + Medic: +50% healing from both',
    icon: 'H',
    check: r => hasClass(r, 'healer') && hasClass(r, 'medic'),
    bonuses: {
      healingMultiplier: 1.5,
      filter: r => r.className === 'healer' || r.className === 'medic',
    },
  },
  {
    id: 'wallOfSteel',
    name: 'Wall of Steel',
    description: '2+ tanks: +25% HP for tanks',
    icon: 'W',
    check: r => countClass(r, 'tank') >= 2,
    bonuses: {
      healthMultiplier: 1.25,
      filter: r => r.className === 'tank',
    },
  },
];

export function calculateActiveSynergies(roster: RecruitData[]): ActiveSynergy[] {
  const alive = roster.filter(r => !r.dead);
  const active: ActiveSynergy[] = [];

  for (const synergy of SYNERGIES) {
    if (!synergy.check(alive)) continue;

    if (synergy.id === 'specialization') {
      const { className } = mostCommonClass(alive);
      active.push({
        synergy,
        bonuses: {
          ...synergy.bonuses,
          filter: r => r.className === className,
        },
      });
    } else {
      active.push({ synergy, bonuses: synergy.bonuses });
    }
  }

  return active;
}

export function getSynergyMultiplier(
  activeSynergies: ActiveSynergy[],
  recruit: RecruitData,
  stat: keyof Omit<SynergyBonus, 'filter'>
): number {
  let mult = 1;
  for (const { bonuses } of activeSynergies) {
    if (bonuses.filter && !bonuses.filter(recruit)) continue;
    const val = bonuses[stat];
    if (val !== undefined) mult *= val;
  }
  return mult;
}
