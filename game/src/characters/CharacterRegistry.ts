import { FighterCharacter } from './FighterCharacter';
import { GlassCannonCharacter } from './GlassCannonCharacter';
import { VampireCharacter } from './VampireCharacter';
import { HulkCharacter } from './HulkCharacter';
import { SpeedsterCharacter } from './SpeedsterCharacter';
import { WizardCharacter } from './WizardCharacter';
import { ManagerCharacter } from './ManagerCharacter';
import { CapitalistCharacter } from './CapitalistCharacter';
import type { BaseCharacter } from './BaseCharacter';

const CHARACTER_CLASSES: Record<string, new () => BaseCharacter> = {
  fighter: FighterCharacter,
  glassCannon: GlassCannonCharacter,
  vampire: VampireCharacter,
  hulk: HulkCharacter,
  speedster: SpeedsterCharacter,
  wizard: WizardCharacter,
  manager: ManagerCharacter,
  capitalist: CapitalistCharacter,
};

interface UnlockCondition {
  cost: number;
  description: string;
  starter?: boolean;
  unlockedBy?: string;
}

const UNLOCK_CONDITIONS: Record<string, UnlockCondition> = {
  fighter: { cost: 0, description: 'Starter character', starter: true },
  wizard: { cost: 0, description: 'Starter character', starter: true },
  manager: { cost: 0, description: 'Starter character', starter: true },
  capitalist: { cost: 0, description: 'Starter character', starter: true },
  glassCannon: { cost: 0, description: 'Win a run with Fighter', unlockedBy: 'fighter' },
  vampire: { cost: 0, description: 'Win a run with Wizard', unlockedBy: 'wizard' },
  hulk: { cost: 0, description: 'Win a run with Manager', unlockedBy: 'manager' },
  speedster: { cost: 0, description: 'Win a run with Capitalist', unlockedBy: 'capitalist' },
};

class CharacterRegistryClass {
  characters: Record<string, BaseCharacter>;

  constructor() {
    this.characters = {};
    this.registerDefaults();
  }

  registerDefaults(): void {
    for (const [id, CharClass] of Object.entries(CHARACTER_CLASSES)) {
      this.characters[id] = new CharClass();
    }
  }

  register(id: string, characterInstance: BaseCharacter): void {
    this.characters[id] = characterInstance;
  }

  get(id: string): BaseCharacter | null {
    return this.characters[id] || null;
  }

  getAll(): Record<string, BaseCharacter> {
    return { ...this.characters };
  }

  getAllIds(): string[] {
    return Object.keys(UNLOCK_CONDITIONS);
  }

  getUnlockCondition(id: string): UnlockCondition | null {
    return UNLOCK_CONDITIONS[id] || null;
  }

  getUnlockCost(id: string): number {
    const condition = UNLOCK_CONDITIONS[id];
    return condition ? condition.cost : 0;
  }
}

export const CharacterRegistry = new CharacterRegistryClass();
