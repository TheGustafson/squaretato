# Squaretato Character System — Design & Implementation Plan

## Overview

Add 8 playable characters with radically different gameplay mechanics, plus a meta-progression system for unlocking them. This transforms the game from a single-mechanic survivor into a deep, replayable experience with distinct playstyles.

---

## Characters

### 1. The Fighter (Default / Unlocked)
- **Theme:** Balanced starter, no strengths or weaknesses
- **Stats:** Standard base stats from current `BALANCE.player`
- **Mechanics:** Uses the current weapon system exactly as-is
- **Shop:** Full weapon + item shop access
- **Visual:** Current green square

### 2. Glass Cannon
- **Theme:** Extreme offense, paper-thin defense
- **Stats:** 2 HP, 2x fire rate, 2x base damage, 2x base speed
- **Mechanics:** Same weapon system, but starts with SMG. Death comes fast — survival depends on killing before being touched.
- **Shop:** Full access, but health upgrades capped at 5
- **Visual:** Thin red square with pulsing outline (danger aesthetic)
- **Unlock:** Reach wave 10 with Fighter

### 3. The Hulk
- **Theme:** Pure melee brute
- **Stats:** 50 HP, 0.6x speed, size 60 (huge green square)
- **Mechanics:**
  - Cannot use guns — weapon shop disabled entirely
  - Has exactly 2 FISTS (always, cannot sell)
  - Fists are Sword-class weapons with aggressive scaling:
    - Base damage scales 2x per upgrade level (not 1.2x)
    - Attack speed increases 30% per level
    - AoE ground slam radius = `baseDamage * 3` pixels (grows with damage upgrades)
  - Ground slam: Every 3rd hit from each fist triggers a circular shockwave instead of an arc
  - Fists upgrade automatically every 5 waves (free)
- **Shop:** Items only (no weapons tab). Special "Protein" items that are Hulk-exclusive (more HP, more fist damage, bigger slam radius)
- **Visual:** Large dark green square, fists rendered as big brown rectangles that visibly wind up
- **Unlock:** Kill 500 total enemies across all runs

### 4. The Wizard
- **Theme:** Spellcaster with mana and cooldown-based abilities
- **Stats:** 12 HP, 0.8x speed, no fire rate stat (spells have individual cooldowns)
- **Mechanics:**
  - Cannot use guns — weapon shop replaced with Spell Shop
  - Starts with Magic Missile (free)
  - Has a Mana bar (100 max) that regenerates 10/sec. Spells cost mana.
  - Can equip up to 4 spells at once (like weapon slots)
  - Spell upgrades increase spell level (more damage/effects)
- **Spells (10):**
  1. **Magic Missile** (free, 5 mana) — Auto-targeting single projectile, 1.0x damage. Fast cooldown.
  2. **Fireball** ($50, 15 mana) — Explodes on impact, 60px AoE, 3x damage. 3s cooldown.
  3. **Chain Lightning** ($175, 20 mana) — Jumps to 5 enemies, 2x damage per jump with 0.8 decay. 4s cooldown.
  4. **Ice Nova** ($120, 25 mana) — 360-degree burst, freezes enemies for 2s (they stop moving). 1x damage. 6s cooldown.
  5. **Teleport** ($80, 10 mana) — Blink to mouse position, damages enemies at arrival point. 2x damage in 40px radius. 5s cooldown.
  6. **Meteor Storm** ($300, 40 mana) — 5 random impacts across screen over 3s. Each does 5x damage in 80px radius. 12s cooldown.
  7. **Shield Bubble** ($150, 30 mana) — 4s of invulnerability. 15s cooldown.
  8. **Arcane Beam** ($250, 3 mana/sec) — Continuous beam (like laser) but with 2x damage and homing. Drains mana while active.
  9. **Summon Familiar** ($200, 50 mana) — Spawns a small ally that auto-attacks for 20s. Fires magic missiles at 2/sec. 30s cooldown.
  10. **Time Warp** ($400, 60 mana) — Slows all enemies to 25% speed for 5s. 20s cooldown.
- **Shop:** Spell shop (buy/upgrade spells) + items. Special mana items: Mana Crystal (+25 max mana), Mana Regen Ring (+3/sec), Spell Amplifier (+25% all spell damage)
- **Visual:** Blue square with a pointed "hat" triangle on top. Spells have flashy particle effects.
- **Unlock:** Buy 8 different weapons in a single run

### 5. The Manager
- **Theme:** Doesn't fight personally — recruits and manages a team
- **Stats:** 15 HP, 1.2x speed, 0 damage (cannot deal damage directly)
- **Mechanics:**
  - Cannot use weapons — has no weapon slots
  - Shop is replaced with "Recruitment Office"
  - Recruits are weaker copies of other characters (0.6x stats) with pre-assigned weapons
  - Recruits move randomly, auto-aim at nearest enemy, and fight independently
  - Recruits have their own HP bar and can die permanently (gone for the run)
  - Manager's job: collect money (recruits don't pick up money), buy more recruits, buy items that buff all recruits
  - No cap on recruits (but they cost exponentially more)
  - Recruit types available in shop:
    - Gunner ($30) — has Pistol, 8 HP
    - Sniper ($80) — has Burst Rifle, 5 HP, slow but high damage
    - Brawler ($60) — has Sword, 15 HP, melee only
    - Mage ($150) — has Chain Lightning, 6 HP
    - Tank ($120) — has Shotgun, 25 HP, very slow
    - Mini-Hulk ($200) — has Fists, 30 HP, slow, big damage
    - Healer ($250) — no damage, but heals nearest recruit 1 HP/sec
  - Special items for Manager: Megaphone (+20% recruit damage), Health Insurance (recruits regen 0.5 HP/s), Training Camp (new recruits start at level 2)
- **Visual:** Small blue square with a tiny "tie" drawn on it. Recruits are smaller squares in various colors.
- **Unlock:** Complete wave 20

### 6. The Capitalist
- **Theme:** Money makes money. Invests in businesses that do the fighting.
- **Stats:** 10 HP, 1.0x speed, 0 damage (cannot fight directly)
- **Mechanics:**
  - Cannot use weapons directly
  - **Businesses:** Place on map (up to 5). Each business produces "product fighters" that attack enemies:
    - Burger Joint ($50) — produces cheeseburgers every 3s that roll toward enemies (low damage, fast)
    - Robot Factory ($200) — produces fighting robots every 5s (medium damage, moderate HP, persist until killed)
    - Tank Depot ($500) — produces mini-tanks every 10s (high damage, AoE, very slow)
    - Drone Hub ($350) — produces drones that fly and shoot (ranged, fragile, fast)
    - Mercenary Camp ($150) — produces soldiers similar to Manager recruits
  - **Stocks:** Buy stocks that pay dividends at end of each wave:
    - Blue Chip ($100) — pays $20/wave (safe, reliable)
    - Growth Stock ($200) — pays $10/wave but doubles every 5 waves
    - Penny Stock ($25) — 50% chance to pay $100, 50% chance to lose the stock
    - Index Fund ($500) — pays 10% of total money earned that wave
  - **Private Equity Takeover:** Special ability. Target an owned business → it runs "extra hard" next wave (3x production) but at the end of the wave it explodes into a massive cash pile (5x business cost) that the Capitalist must run over to collect. The business is destroyed.
  - Businesses can be damaged by enemies walking through them. If HP reaches 0, business destroyed (no payout).
- **Shop:** Business tab + Stocks tab + Items tab. No weapons.
- **Visual:** Gold/yellow square with a "$" symbol. Businesses are small colored rectangles on the map.
- **Unlock:** Accumulate $5000 total across all runs

### 7. The Vampire
- **Theme:** Risk/reward predator. Dangerous when hurt.
- **Stats:** 8 HP, 1.0x speed, 1.5x damage
- **Mechanics:**
  - Standard weapon access (starts with Pistol)
  - **Blood Drain:** Heals 0.3 HP per kill (always, no item needed)
  - **Frenzy:** Below 30% HP, gains +200% damage, +50% speed, +50% fire rate
  - **Blood Bank:** Passive ability. Every kill stores 0.1 "blood points." Press Q (or tap button) to spend all blood points as a circular damage blast (1 damage per blood point, 150px radius). Resets blood bank to 0.
  - **Weakness:** Cannot buy health upgrades. Max HP is always 8. Regeneration items disabled.
  - **Daylight Curse:** Every even-numbered wave, takes 0.5 damage per second passively (must out-heal with kills)
- **Shop:** Weapons + items (minus health/regen items). Special Vampire items: Crimson Fang (+50% blood drain), Dark Pact (Frenzy triggers at 50% HP instead of 30%), Blood Chalice (Blood Bank capacity 2x)
- **Visual:** Dark red square with small "fang" triangles. Pulses red during Frenzy. Blood Bank shown as a filling vial in HUD.
- **Unlock:** Survive 3 waves with less than 2 HP remaining at end of each

### 8. The Speedster
- **Theme:** Movement IS the weapon. Speed kills.
- **Stats:** 5 HP, 3x speed, 0 base damage (weapons disabled)
- **Mechanics:**
  - Cannot use guns — no weapon slots
  - **Dash Damage:** Moving through/near enemies deals damage. Damage = `currentSpeed * 0.05` per frame of contact. Faster = more damage.
  - **Afterimages:** Every 0.2s of movement, leaves a ghostly afterimage at previous position. Afterimages persist for 1.5s and deal 50% of dash damage to enemies that touch them.
  - **Dash Strike:** Press spacebar/tap to dash forward 200px instantly. Enemies in the dash path take 5x normal movement damage. 3s cooldown.
  - **Time Dilation:** Special ability (every 30s). Enemies move at 10% speed for 4s. Speedster keeps full speed. Massive damage window.
  - **Momentum:** Speed increases by 5% every wave (permanent), but max HP decreases by 0.5 every 5 waves.
  - **Upgrade path:** Speed upgrades, afterimage duration, dash distance, dash cooldown reduction, time dilation duration
- **Shop:** Items only. Special Speedster items: Friction Boots (afterimages last 2x longer), Warp Core (dash distance +100px), Chrono Shard (time dilation lasts 2x longer), Speed Demon (+1% speed per kill for current wave)
- **Visual:** Cyan/light blue square with a "streak" trail. Afterimages are semi-transparent copies. During Time Dilation, screen gets a blue tint.
- **Unlock:** Complete a wave in under 15 seconds

### 9. The Mimic
- **Theme:** Adaptive predator. Becomes what it kills.
- **Stats:** 10 HP, 1.0x speed, 0.8x damage (starts weak)
- **Mechanics:**
  - Starts with only Pistol
  - **Absorption:** Kill count per enemy type is tracked. At thresholds (10, 25, 50 kills), gain that enemy's ability permanently:
    - **Basic (10):** +10% damage. (25): +5% dodge. (50): Bouncing projectiles (all shots bounce once)
    - **Tracker (10):** Shots gain slight homing. (25): +15% move speed. (50): Full homing on all projectiles
    - **Tank (10):** +5 max HP. (25): 15% damage reduction. (50): +15 max HP, knockback immunity
    - **Shooter (10):** Fire rate +20%. (25): Projectiles pierce 1 enemy. (50): All projectiles pierce
    - **Wave (10):** Projectiles gain sine wave motion. (25): +2 projectiles per shot. (50): Full wave pattern on all guns
    - **Zoomer (10):** +20% speed. (25): +50% projectile speed. (50): Dash ability (free, 5s cooldown)
    - **Boss (5):** +25% all damage. (10): AoE on all projectiles. (15): Spawn 2 mini-allies every 30s
  - **Visual Transformation:** Player square changes color as abilities are absorbed. At max absorption, becomes a multicolored shifting square.
  - Absorption progress shown in HUD as small colored bars per enemy type
- **Shop:** Normal weapon + item access. Special Mimic items: Gene Splicer (absorption thresholds reduced by 25%), Predator Instinct (absorbed enemy type spawns +20% more — more food), Evolution Catalyst (at 50-kill threshold, gain an extra random ability from another type)
- **Visual:** Starts as white/gray square. Gradually shifts colors as absorptions unlock. Each threshold adds a subtle visual element (orange glow for tracker, red outline for tank, etc.)
- **Unlock:** Kill at least one of every enemy type in a single run

---

## Meta-Progression System

### Unlock Currency: "Prestige Points" (PP)

Earned every run based on performance:
- 1 PP per wave survived
- 5 PP for killing a boss
- Bonus PP for completing challenges (first time bonuses)

### Unlock Costs
- Glass Cannon: 50 PP (or reach wave 10)
- Hulk: 100 PP (or 500 total kills)
- Wizard: 150 PP (or buy 8 weapons in one run)
- Manager: 200 PP (or complete wave 20)
- Capitalist: 250 PP (or accumulate $5000 total)
- Vampire: 200 PP (or survive 3 waves below 2 HP)
- Speedster: 300 PP (or complete a wave in <15s)
- Mimic: 350 PP (or kill every enemy type in one run)

### Per-Character Progress

Each character has its own:
- Money (earned in that character's runs)
- Stat upgrades (bought in that character's shop)
- Weapon/spell levels
- Highest wave reached

Characters do NOT share money or upgrades. This gives each character its own progression arc.

---

## Data Persistence Design

### localStorage Schema (v2)

```js
{
  version: 2,
  // Global meta
  meta: {
    prestigePoints: number,
    totalKills: number,
    totalMoneyEarned: number,
    totalWavesSurvived: number,
    unlockedCharacters: string[],  // ['fighter'] initially
    achievements: string[],
  },
  // Per-character save data
  characters: {
    fighter: {
      money: number,
      stats: { health, speed, damage, fireRate, dodge, luck, critChance, critDamage, pickupRange, regeneration },
      upgradePurchases: { ... },
      weapons: string[],
      weaponLevels: { [id]: number },
      items: string[],
      itemStacks: { [id]: number },
      highestWave: number,
      // Character-specific:
    },
    glassCannon: { ... },
    hulk: {
      // ... standard fields
      fistLevel: number,  // auto-upgrades
    },
    wizard: {
      // ... standard fields minus weapons
      spells: string[],
      spellLevels: { [id]: number },
      maxMana: number,
      manaRegen: number,
    },
    manager: {
      // ... standard fields minus weapons
      recruits: [{ type: string, level: number, hp: number }],  // runtime only, not persisted between runs
      recruitUpgrades: { ... },
    },
    capitalist: {
      // ... standard fields minus weapons
      businesses: [{ type: string, level: number }],  // persist between waves in a run
      stocks: [{ type: string, purchaseWave: number }],
    },
    vampire: {
      // ... standard fields
      bloodBank: number,  // runtime only
    },
    speedster: {
      // ... standard fields minus weapons
      dashLevel: number,
      afterimageLevel: number,
      timeDilationLevel: number,
    },
    mimic: {
      // ... standard fields
      absorptionKills: { basic: n, tracker: n, tank: n, shooter: n, wave: n, zoomer: n, boss: n },
      unlockedAbsorptions: { [enemyType]: 1|2|3 },  // threshold level reached
    }
  },
  // Settings (character-independent)
  settings: {
    controlScheme: string,
    aimMode: string,
    musicEnabled: boolean,
  },
  selectedCharacter: string,  // last played character
}
```

### Migration

On load, check `version` field. If missing or `1`, run migration:
1. Map old flat structure into `characters.fighter`
2. Set `meta.unlockedCharacters = ['fighter']`
3. Set `version: 2`

### Electron/Steam Persistence

For future Electron build:
- Use `electron-store` (wraps JSON file in app data directory)
- Same schema, just different I/O layer
- Add a `StorageAdapter` interface now:
  ```js
  class StorageAdapter {
    load() { ... }
    save(data) { ... }
  }
  class LocalStorageAdapter extends StorageAdapter { ... }
  class ElectronAdapter extends StorageAdapter { ... }  // future
  ```
- `GameState` receives adapter via constructor injection
- This one abstraction layer means zero refactoring when wrapping in Electron later

---

## Implementation Architecture

### New Files to Create

```
game/src/
├── characters/
│   ├── CharacterRegistry.js      — Character definitions, factory, unlock conditions
│   ├── BaseCharacter.js          — Abstract character interface
│   ├── FighterCharacter.js       — Standard (current behavior)
│   ├── GlassCannonCharacter.js   — Stat overrides only
│   ├── HulkCharacter.js          — Fist weapon creation, shop filtering
│   ├── WizardCharacter.js        — Spell system, mana management
│   ├── ManagerCharacter.js       — Recruit system, ally management
│   ├── CapitalistCharacter.js    — Business/stock system
│   ├── VampireCharacter.js       — Blood mechanics, frenzy
│   ├── SpeedsterCharacter.js     — Movement damage, afterimages, dash
│   └── MimicCharacter.js         — Absorption tracking, ability unlocks
├── systems/
│   ├── AllySystem.js             — Manages recruits/allies (Manager, Wizard familiar)
│   ├── StructureSystem.js        — Manages placed structures (Capitalist businesses)
│   ├── ManaSystem.js             — Mana bar, regen, cost checking (Wizard)
│   ├── AbsorptionSystem.js       — Kill tracking, threshold checks (Mimic)
│   └── StorageAdapter.js         — Abstraction for localStorage/Electron persistence
├── entities/
│   ├── Ally.js                   — Autonomous friendly entity (extends Entity)
│   └── Structure.js              — Map-placed building entity (extends Entity)
├── ui/
│   ├── CharacterSelectScreen.js  — Pre-game character picker
│   ├── SpellShopScreen.js        — Wizard's spell purchase UI
│   ├── RecruitShopScreen.js      — Manager's recruitment UI
│   ├── BusinessShopScreen.js     — Capitalist's investment UI
│   └── AbsorptionHUD.js         — Mimic's absorption progress overlay
└── config/
    ├── characters.js             — Character stat definitions and metadata
    ├── spells.js                 — All 10 spell configurations
    ├── recruits.js               — Recruit type definitions
    └── businesses.js             — Business and stock definitions
```

### Files to Modify

```
game/src/game.js                  — Character-aware startLevel(), new system loops
game/src/systems/GameState.js     — v2 schema, migration, StorageAdapter usage
game/src/systems/WeaponSystem.js  — Add spell weapon subclasses, Hulk fist variants
game/src/config/balance.js        — Add character section, new items
game/src/entities/Player.js       — characterType field, character-specific render
game/src/ui/ShopScreen.js         — Character-aware weapon/item filtering
game/src/ui/UpgradeScreen.js      — Character-specific upgrade pools
game/src/ui/Menu.js               — Add "Select Character" button
game/src/constants.js             — New game states, colors
```

---

## Implementation Sequence

### Phase 1: Foundation (do first, enables everything else)

**Step 1.1 — StorageAdapter + Schema v2 Migration**
- Create `StorageAdapter.js` with `LocalStorageAdapter`
- Refactor `GameState.js` to use adapter
- Implement v2 schema with per-character data
- Write migration from v1 → v2
- All existing gameplay should still work (Fighter = default)

**Step 1.2 — Character Registry + Base Interface**
- Create `CharacterRegistry.js` with character definitions
- Create `BaseCharacter.js` interface:
  ```js
  class BaseCharacter {
    getId() {}
    getName() {}
    getBaseStats() {}
    getStartingWeapons() {}
    getAvailableWeapons() {}    // filter for shop
    getAvailableItems() {}      // filter for shop
    getShopTabs() {}            // ['weapons', 'items'] default
    onStartLevel(game) {}       // hook for character-specific init
    onUpdate(game, deltaTime) {} // hook for character-specific logic per frame
    onKill(game, enemy) {}      // hook for kill events
    onRender(ctx, player) {}    // hook for character-specific rendering
    getUpgradePool() {}         // end-of-wave upgrade options
  }
  ```
- Implement `FighterCharacter` (wraps current behavior exactly)

**Step 1.3 — Character Selection Screen**
- Create `CharacterSelectScreen.js`
- Add to Menu flow: Menu → Character Select → Shop/Upgrade → Play
- Wire `selectedCharacter` into GameState
- `Game.startLevel()` reads character from registry and uses its hooks

**Step 1.4 — Game.js Character Hook Integration**
- Refactor `startLevel()` to call `character.onStartLevel()`
- Add `character.onUpdate()` call in update loop
- Add `character.onKill()` call in enemy death handler
- Add `character.onRender()` call in render
- ShopScreen reads `character.getAvailableWeapons()` for filtering

### Phase 2: Simple Characters (stat variations only)

**Step 2.1 — Glass Cannon**
- Implement `GlassCannonCharacter` (just stat overrides + health cap)
- Test that 2 HP + 2x damage feels right

**Step 2.2 — Vampire**
- Implement blood drain in `onKill()` hook
- Implement Frenzy in `onUpdate()` hook (check HP threshold, apply stat buffs)
- Add Blood Bank ability (track via character state, consume on input)
- Add Daylight Curse (damage on even waves in `onUpdate`)
- Add HUD element for blood bank vial

### Phase 3: Melee Characters

**Step 3.1 — Hulk Fists**
- Create `HulkFist` weapon class extending `Sword`
- Bigger arc, bigger range, ground slam every 3rd hit
- Ground slam = circular damage (reuse explosion AoE code pattern)
- Auto-level-up every 5 waves in `onStartLevel` hook
- Aggressive scaling: 2x damage per level, AoE radius = damage * 3
- Shop filter: items only, add Hulk-exclusive items to balance.js
- Player render: large green square

**Step 3.2 — Speedster**
- No weapons. Damage in `onUpdate()`:
  - Calculate speed magnitude each frame
  - Check enemy proximity, deal damage based on speed
- Afterimage system: store positions, render semi-transparent, deal damage from afterimage positions
- Dash: on input, teleport forward, check enemies in path
- Time Dilation: multiply all enemy speeds by 0.1 for duration
- Shop: speed/dash/afterimage upgrade items

### Phase 4: Wizard (Spell System)

**Step 4.1 — Mana System**
- Create `ManaSystem.js` (bar, regen, cost check, spend)
- HUD rendering for mana bar (below health)

**Step 4.2 — Spell Base Class**
- Spells are Weapon subclasses but with mana cost + independent cooldown (not fire-rate based)
- `Spell extends Weapon` with `manaCost`, `cooldownDuration`, `currentCooldown`
- Override `update()` to check mana + cooldown instead of fire rate

**Step 4.3 — Implement 10 Spells**
- Magic Missile, Fireball, Chain Lightning (port existing), Ice Nova, Teleport, Meteor Storm, Shield Bubble, Arcane Beam, Summon Familiar, Time Warp
- Each is a class file or defined in `spells.js` config + factory

**Step 4.4 — Spell Shop UI**
- `SpellShopScreen.js` — similar to weapon shop but shows mana cost, cooldown, spell level

### Phase 5: Manager (Ally System)

**Step 5.1 — Ally Entity**
- `Ally.js` extends Entity: has HP, weapon, AI movement (random walk + chase nearest enemy within range)
- Ally fires its weapon independently using same Weapon classes
- Ally collision with enemies = ally takes damage
- Ally death = removed permanently

**Step 5.2 — AllySystem**
- Manages `allies[]` array in Game
- Update loop: move allies, fire weapons, check collisions
- Render loop: draw allies as small colored squares with HP bars

**Step 5.3 — Recruit Shop**
- `RecruitShopScreen.js` — list of recruit types with stats preview
- Exponential cost scaling per recruit purchased
- Manager items that buff all recruits globally

**Step 5.4 — Manager Character**
- `onUpdate`: allies fight, manager collects money
- `onKill`: only counts if ally killed it (for stats)
- Manager cannot deal damage directly — 0 damage stat

### Phase 6: Capitalist (Structure System)

**Step 6.1 — Structure Entity**
- `Structure.js` extends Entity: has HP, type, production timer, product list
- Structures are stationary, can be damaged by enemies walking through
- Products are either projectile-like (cheeseburgers roll) or ally-like (robots walk and fight)

**Step 6.2 — StructureSystem**
- Manages `structures[]` in Game
- Production loop: each structure spawns products on timer
- Products managed as either projectiles or allies depending on type
- PE Takeover: mark structure as "corrupted", 3x production next wave, explode at wave end into pickups

**Step 6.3 — Stock System**
- Simple: at wave end, iterate stocks, calculate dividends, add to money
- Penny stocks: random roll for payout vs loss
- Growth stocks: track purchase wave, dividend doubles every 5 waves since purchase

**Step 6.4 — Business/Stock Shop**
- `BusinessShopScreen.js` — two sub-tabs: Businesses and Stocks
- Business placement: after buying, next click on game area places it
- Stock purchase is immediate

### Phase 7: Mimic (Absorption System)

**Step 7.1 — AbsorptionSystem**
- Track kills per enemy type
- At thresholds (10/25/50), unlock abilities
- Abilities are permanent stat mods or projectile property mods applied to player/weapons
- `onKill` hook increments counters and checks thresholds

**Step 7.2 — Ability Application**
- Homing: set `autoAimRadius` on all projectiles
- Piercing: set `piercing = true` on all projectiles
- Bouncing: set `maxBounces` on all projectiles
- Wave pattern: set `waveMotion = true`
- Stat buffs: directly modify player stats
- These stack — a fully-absorbed Mimic has homing + piercing + bouncing + wave + AoE projectiles

**Step 7.3 — Visual Transformation**
- Player color shifts based on dominant absorption
- At max thresholds, add visual flair (outline pulses, particle trail)

**Step 7.4 — Absorption HUD**
- Small overlay showing kill progress bars per enemy type
- Color-coded, shows next threshold

### Phase 8: Polish & Meta

**Step 8.1 — Prestige Points**
- Award PP at run end based on waves + kills + bonuses
- Display on character select screen
- Use to unlock characters (alternative to achievement unlocks)

**Step 8.2 — Achievement System**
- Track unlock conditions per character
- Show locked characters as silhouettes with unlock hint text
- Notification popup when unlock condition met

**Step 8.3 — Character-Specific End-of-Wave Upgrades**
- Wizard: spell-specific upgrades in pool (mana regen, cooldown reduction, spell damage)
- Hulk: fist-specific (slam radius, attack speed, damage)
- Speedster: movement-specific (speed, afterimage, dash)
- Manager: team-specific (recruit HP, recruit damage, recruit speed)
- Capitalist: business-specific (production speed, product HP, dividend bonus)

**Step 8.4 — Balance Pass**
- Each character should feel viable to wave 30
- Glass Cannon should feel hard but rewarding
- Hulk should feel satisfying to slam groups
- Manager should feel like growing an army
- Capitalist should feel like snowballing wealth

---

## Key Architectural Decisions

### 1. Character as Strategy Object (not inheritance on Player)

The Player entity stays thin. Characters are strategy objects that hook into the game loop. This avoids a deep inheritance hierarchy and keeps each character's logic isolated in its own file.

```js
// Game.js
this.#character = CharacterRegistry.create(characterId);
this.#character.onStartLevel(this);  // passes game context
// In update loop:
this.#character.onUpdate(this, deltaTime);
// In enemy death:
this.#character.onKill(this, enemy);
```

### 2. System Arrays as Game Properties (not character-owned)

`allies[]`, `structures[]`, `products[]` are arrays on the Game instance, not on the character. Characters create/manage them via hooks, but the Game loop owns iteration and collision. This keeps the collision/rendering code centralized.

### 3. Weapon Filtering via Character Config (not hardcoded)

Characters declare what's available:
```js
getAvailableWeapons() {
  return Object.keys(BALANCE.weapons); // Fighter: all
}
// vs Hulk:
getAvailableWeapons() {
  return []; // No weapons available
}
```

### 4. Minimal Game.js Changes Per Character

The goal is that adding a new character requires:
1. A new character file in `characters/`
2. Balance config entries
3. Registration in `CharacterRegistry`
4. Potentially a new System class if the character has novel mechanics

It should NOT require editing `Game.update()` logic for each character. The hook system handles this.

### 5. Electron-Ready Persistence

The `StorageAdapter` abstraction means the Electron port is literally:
```js
// main.js (Electron)
const adapter = new ElectronAdapter(app.getPath('userData'));
const game = new Game(canvas, ctx, input, adapter);
```

No other code changes needed.

---

## Risk Areas

1. **Performance with many allies/structures:** The Manager with 20+ recruits firing weapons means 20+ entities running weapon systems + projectile loops. May need projectile pooling or ally count soft-caps.

2. **Speedster balance:** Movement damage is continuous, not discrete shots. Frame-rate independence is critical — damage must be `speed * deltaTime * factor`, not per-frame.

3. **Mimic complexity:** 7 enemy types × 3 thresholds = 21 abilities stacking. Need to ensure combinations don't break (e.g., homing + wave motion + bouncing could cause projectile chaos).

4. **Capitalist map space:** 5 businesses + enemies + player on an 800x800 canvas. May need to increase canvas size or make businesses compact.

5. **Save data size:** With 8 characters having full progression data, localStorage has a 5-10MB limit (browser-dependent). Should be fine — the data is mostly numbers — but worth monitoring.

---

## Estimated Effort

| Phase | Effort | Characters Added |
|-------|--------|-----------------|
| Phase 1: Foundation | Large (architecture) | Fighter (refactor) |
| Phase 2: Simple chars | Small | Glass Cannon, Vampire |
| Phase 3: Melee | Medium | Hulk, Speedster |
| Phase 4: Wizard | Large (new system) | Wizard |
| Phase 5: Manager | Large (new system) | Manager |
| Phase 6: Capitalist | Large (new system) | Capitalist |
| Phase 7: Mimic | Medium | Mimic |
| Phase 8: Polish | Medium | None (polish all) |

Recommended order: Phase 1 → 2 → 3 → 7 → 4 → 5 → 6 → 8

(Mimic before Wizard/Manager/Capitalist because it reuses existing weapon system. Wizard/Manager/Capitalist each introduce entirely new gameplay systems.)
