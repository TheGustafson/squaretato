# Squaretato — Agent Reference

> **Keep this file up to date.** If you make architectural changes, add new systems, change the menu flow, or introduce new patterns — update this document before finishing.

## What Is This

A roguelike survivor game built with **TypeScript + Canvas 2D**, bundled with **Vite**. No framework, no React. Players pick a save slot on the Menu, choose one of 8 characters (carousel), pick starting equipment, and survive 30 waves. Between waves they visit the shop and upgrade screen. Bosses at waves 10, 20, and 30 — killing the wave-30 boss ends the run at the Run Complete screen.

## Design Rules

- **WASD-only input during gameplay.** Movement is the only keyboard binding while fighting. No Q / E / Space / F / R ability keys. Arrows also accepted; diagonals normalized; blur clears input state.
- **Auto-aim, auto-fire.** Weapons and spells target and fire automatically. The player never manually aims.
- **No active abilities.** Every character's kit is passive — triggers come from movement, kills, damage, or timers. Never add a key-gated ability.
- **Every character needs a passive identity bar.** A visible buildup meter is mandatory. See Characters section for the nine existing meters.
- **Reuse shared abstractions.** Weapons, spells, auras, debuffs, allies, structures, and item effects are shared systems — don't fork them per character. Extend `BALANCE` and hook methods instead.

## Characters

Each character expresses identity through a single visible passive meter.

- **Fighter** — *Momentum*: kills fill meter → Burst (+100% fire rate / +25% damage, 4s). Each Burst in a wave raises the next threshold by 1.5× (reset per wave) — prevents always-on late game.
- **Wizard** — *Arcane Surge*: kills charge a meter that triggers Overcharge (brief spell-power + cooldown spike). 4 spell slots, 100 mana with 10/s regen, no weapons.
- **Hulk** — *Rage*: damage taken fills rage; vent unleashes shockwave slams scaled by chosen stance (Juggernaut / Earthshaker / Berserker). 50 HP, 0.6× speed, fists only.
- **Vampire** — *Blood Bank*: lifesteal/kills fill the bank, auto-releasing a radial blood-burst AoE (heals the player, damages nearby enemies) when full. Frenzy under 30% HP: +200% damage, +50% speed/fire rate. **Thirst**: when the Blood Bank is empty AND HP is above the frenzy threshold, drain 0.25 HP/s — forces the player to keep killing to stay alive. Shop: Weapons + Items (no spells, no regeneration items).
- **Speedster** — *Velocity*: sustained movement ramps velocity and scales dash damage; afterimages deal 50% dash damage for 1.5s. Dash style (Blink / Phantom / Overdrive) picked at start. No weapons.
- **GlassCannon** — *Kill Streak*: consecutive kills stack crit and damage until hit; 2 HP, 2× damage/speed/fire rate baseline. Max-streak Deadeye burst.
- **Manager** — *Command / Rally Cry*: ally-kill-driven meter that triggers a team-wide +damage/+fire-rate burst. Hires up to 8 Recruits with multi-slot equipment; no direct player damage.
- **Capitalist** — *Bull Market → Monopoly*: structure kills stack Bull Market; Monopoly burst grants +250% production / +50% damage for 7s. CEO Aura (+70% production in 180px radius) + Dividend Drizzle (passive business coins — distinct emerald palette so you can see what came from businesses vs enemies) as baseline. **Capital Supremacy**: bank balance → uncapped scaling to both structure production AND damage; every $1000 in your wallet = +0.5% to both, cap +200% at $400k. This is the wealth-to-power payoff: hoarding is correct late-game. Stocks include compounding sinks (Hedge Fund — 2%/wave of current bank; Holdings Group — $30/wave per stock owned). Fresh runs seed a synergy pair based on the StartingSetup pick (Burger Joint → Farm; Mercenary Camp → Bank, etc.).

Adding a character without a passive identity bar is a design failure.

## Project Structure

```
/root/projects/squaretato/
├── vite.config.js          # root: 'game', base: '/squaretato/', outDir: '../dist'
├── package.json
└── game/
    ├── index.html
    └── src/
        ├── main.ts             # Entry: canvas, DPR-aware resize, error overlay, first-frame skip
        ├── game.ts             # Central controller
        ├── constants.ts        # GAME_CONFIG, GAME_STATES, COLORS
        ├── types.ts
        ├── config/balance.ts   # ALL numbers: player, enemies, weapons, spells, items, bosses, spawning, UI
        ├── characters/         # BaseCharacter + CharacterRegistry + 9 characters
        ├── entities/           # Entity, Player, Enemy, Boss, Projectile, Pickup
        ├── systems/            # See Systems table
        └── ui/                 # Menu, CharacterSelect, StartingSetup, LevelSelect, Shop, Upgrade,
                                # RoundStats, Character, GameOver, RunComplete, Achievements, Stats,
                                # AchievementToast, TutorialOverlay, ConfirmDialog, Settings, Pause,
                                # VirtualJoystick
```

## Systems

| System | Responsibility |
| --- | --- |
| `GameState` | 3-slot save/load (v3 schema), activeRun resume, lifetime stats, achievements. Save throttled to 500ms; corrupt-save recovery. |
| `StorageAdapter` | localStorage wrapper; envelope `{ version, settings, slots }`. |
| `WeaponSystem` | All weapon firing logic incl. Railgun (charge-shot piercer). Conditional — only created when `getMaxWeapons() > 0`. |
| `SpellSystem` | Spell classes + `getSpellScaling()` reading `BALANCE.spells`. Data-driven scaling; Magic Missile bolt cap; cooldown scaling wired. |
| `SpawnSystem` | Enemy wave spawning + boss wave handoff. `_bossRef` for O(1) boss-alive check. |
| `EffectsSystem` | Visual effects with budget system. Pooled particles, shockwave, crit pop, heal sparkle. **Priority-tiered screen shake** (`low`/`medium`/`high`/`cinematic`) with saturating energy budget; **flash budget** caps combined alpha to prevent whiteout; **tiered explosions** (small ≤35px = particles only, medium = + shockwave + modest shake, large ≥90px = full treatment); damage-number coalescing (55ms window). Rocket spam no longer shakes the camera constantly. |
| `SoundSystem` | Steam-ready Web Audio mixer. **Voice manager** with 4-tier priority + voice stealing (20-voice cap). **Swarm grouping**: identical sounds within a short window merge into one richer layered voice — late-wave audio stays punchy, never muddy. **Sidechain ducking** on high-priority events. **Distance attenuation** via `setListener(x,y)`. Richer synthesis (transient + body + tail, ADSR with anti-click ramps, filter sweeps). Short synthesized convolution reverb send. Central aggregators `registerHit(isCrit,x,y)` and `registerEnemyDeath(type,x,y)` collapse per-hit and per-death flood into tiered cluster voices. Drive via `tick()` each frame. |
| `ItemEffects` | Shared `applyItemEffect()` + `applyUpgrade()` used by Shop and StartingSetup. |
| `AllySystem` | Manager's ally units. |
| `StructureSystem` | Capitalist's structures (businesses). |
| `RecruitSystem` | Manager recruit classes / XP / synergies. |
| `SynergySystem` | Manager team synergies. |
| `AuraSystem` | Persistent AOE auras (CEO Aura, Leader's Presence, etc.). |
| `DebuffSystem` | Freezing / slow / bleed / poison application + tick. |
| `ManaSystem` | Wizard resource pool. |

### Enemies & Bosses

- Base enemies plus: **charger** (dashes), **sniper** (ranged), **exploder** (death AOE), **splitter** (spawns minions on death), **sporeling** (DOT puffs).
- Bosses (`entities/Boss.ts`, configured in `BALANCE.bosses`):
  - Wave 10 — **Geometric Warlord**: telegraphed beam sweeps, shockwaves.
  - Wave 20 — **Nexus Prism**: resonance pools, phase transitions (time-slow + screen shake).
  - Wave 30 — **Hollow King**: shadow clones, multi-phase finale. Death ends the run.

## Menu Flow

```
Menu (slot picker + CONTINUE / NEW / ACHIEVEMENTS / STATS / SETTINGS)
  ├─ CONTINUE → restore RunState → LevelSelect
  └─ NEW RUN  → CharacterSelect (carousel) → StartingSetup → LevelSelect → Play Level
```

## Post-Wave Flow

```
Wave Win     → RoundStats (damage summary + stat badges) → UpgradeScreen → Shop → CharacterScreen → LevelSelect
               (top-right CONTINUE on UpgradeScreen skips the upgrade)
Wave 30 Win  → RoundStats → RunCompleteScreen (unlock reveal)
Death        → GameOverScreen (dramatic) → Menu  (resetActiveCharacterToDefaults: clears per-run state; keeps highestWave + permanent upgrades)
```

- `game.ts` owns all screen instances and wires callbacks.
- Each screen has `activate()` / `deactivate()`; the render loop switches on `this.activeScreen`.
- Shop: scrollable list, drag scrollbar, hover tooltips, character-driven tabs (weapons / spells / items / recruit / roster / equipment / businesses / stocks).
- PauseMenu: selection carets on RESUME / OPTIONS / SAVE & QUIT / MAIN MENU.

## Key Patterns

### Character System (Strategy)
- `BaseCharacter` is character-agnostic: zero weapons, no spells, items-only shop, safe upgrade pool. Subclasses explicitly declare capabilities:
  - `getShopTabs()`, `getAvailableItems()`, `getAvailableWeapons()`, `getUpgradePool()`
  - `getMaxWeapons()`, `getStartingWeapons()`, `getStartingSpells()`
  - `canBuyHealthUpgrades()`, `canBuyRegeneration()`
- Hooks: `onStartLevel`, `onLevelEnd`, `onUpdate`, `onKill`, `onDamage`, `onRender`, `onWaveComplete`.
- `onLevelEnd` fires on both wave complete and game over — clean up listeners/timers here.

### Data Flow
- `GameState` holds `saveData` (persisted) and `playerData` (working copy).
- `getDefaultCharacterDataFor(id)` seeds via `getStartingWeapons()` / `getStartingSpells()` — no hardcoded ID checks.
- `syncCharacterData()` copies playerData → saveData before save. **Never save in the game loop.**

### Shared Abstractions
- **Equippable pattern** (ShopScreen): weapons + spells share `getEquippableInfo()`, `sellEquippable()`, `upgradeEquippable()`, and shared render helpers.
- **Item effects**: `systems/ItemEffects.ts` single `applyItemEffect(itemId, playerData)` used by Shop + StartingSetup.
- **Damage recording**: `game.recordDamage(sourceId, amount)` fed by projectiles and direct spell damage; feeds RoundStats.

### balance.ts Is The Source of Truth
All numbers live in `BALANCE`: player, weapons, spells, items (cost, maxStacks, stat bonuses, `wizardOnly` etc.), enemies, bosses, spawning, UI.

Universal items include: `reinforcedPlating`, `sniperScope`, `evasionTraining`, `prospectorsCharm`. Per-class item whitelists wired via `getAvailableItems()`.

### Audio & Visual Economy

Late-wave fights involve hundreds of enemies dying and projectiles firing. To keep the game Steam-ready, both audio and visuals run a **budget-and-priority** model rather than stacking every event equally:

- **Never call `soundSystem.play('hit')` or `play('enemyDeath')` per hit/kill.** Use `soundSystem.registerHit(isCrit, x, y)` and `soundSystem.registerEnemyDeath(type, x, y)`. These aggregate, tier, and swarm internally.
- **Always pass priority + position** for big events: `soundSystem.play('explosion', { x, y, priority: 'critical' })`. Distance attenuation and ducking depend on this.
- **Screen shake takes a priority tag**: `addScreenShake(intensity, duration, 'low' | 'medium' | 'high' | 'cinematic')`. Reserve `cinematic` for run-defining moments (boss spawn, boss death). Low-priority shakes suppress while higher-priority shakes hold the budget.
- **Flashes take a priority tag** too: `addFlash(color, duration, 'high')` for damage/boss moments. Combined alpha is capped in the renderer.
- **Explosions auto-tier by radius**: pass a radius that matches the gameplay scale. Small rockets ≤35px get particles only. Don't compensate by adding extra shake/flash calls alongside — tiered explosions already do it.
- **`game.update()` must call `soundSystem.setListener(x, y)` and `soundSystem.tick()` each frame** (already wired — don't remove).

### Canvas Rendering
- Logical resolution fixed in balance.ts, scaled to fit viewport (DPR-aware).
- All screens render to a 2D context — no DOM during gameplay.
- Rect-based hit detection; `getMousePosition(e)` converts physical → logical coords.

### UI Layout Safety

Interactive elements must never overlap with scrollable content. When adding a screen or layout:

- **Anchor CTAs to the canvas edge** (e.g. CONTINUE at `canvas.logicalHeight - 60`) and compute content regions relative to that anchor — **not** the full canvas height. `ShopScreen.getLayout()` and `getBusinessesLayout()` both now derive `contentHeight`/`listH` from `continueButtonY` so scrolling lists clip above the button.
- **Clip scrollable regions** with `ctx.clip()` against their computed rect — don't rely on hit-testing alone to hide overflow.
- **Default pad:** leave ≥16px between the bottom of a scroll region and any fixed-position button.
- If you change `canvas.logicalHeight` or any anchor position, audit every screen's content-region math — especially ShopScreen (multiple tabs with custom layouts: items, weapons, spells, recruits, roster, equipment, businesses, stocks).

### Starting Money

Every new character-run seeds **$25** pocket money via `STARTING_MONEY` in `GameState.ts`. `getDefaultCharacterData()` and `getDefaultCharacterDataFor()` both apply it. Don't hardcode a different starting amount per character — if you need per-character economy, do it via a starting item / starting business instead.

## Adding a New Character

1. Create `game/src/characters/NewCharacter.ts` extending `BaseCharacter`.
2. Implement `getId()`, `getName()`, `getDescription()`, `getColor()`, `getBaseStats()`.
3. **Explicitly declare all capabilities** (don't lean on base defaults):
   - `getStartingWeapons()`, `getStartingSpells()`
   - `getShopTabs()`, `getMaxWeapons()`
   - `getUpgradePool()`, `getAvailableItems()`
4. **Design a passive buildup meter** — no active abilities allowed.
   - Pick a trigger (movement / kills / damage taken / time / money).
   - Store meter state on the character instance.
   - Tick it in `onUpdate`; trigger auto-burst at cap.
   - Render a visible bar in `onRender` — this is mandatory.
5. Override hooks (`onStartLevel`, `onUpdate`, `onKill`, `onRender`, `onLevelEnd`). If `onStartLevel` adds listeners, `onLevelEnd` must remove them.
6. **Reuse existing systems.** If your passive spawns projectiles, use `WeaponSystem`/`SpellSystem`. If it applies status, use `DebuffSystem`. If it's a persistent AOE, use `AuraSystem`. Don't fork.
7. Register in `CharacterRegistry.ts`: import, `CHARACTER_CLASSES`, `UNLOCK_CONDITIONS`.
8. Add entry to `StartingSetupScreen.ts` `STARTING_CHOICES`.
9. Unique items → `balance.ts` + character's `getAvailableItems()`.
10. Add new damage source IDs to `DAMAGE_SOURCE_NAMES` in `RoundStatsScreen.ts`.

## Adding a New Item / Spell

**Item**: add to `BALANCE.items` → stat case in `ItemEffects.ts` → gameplay-time hook in `game.ts#updateItemEffects()` if needed → include in relevant character whitelists.

**Spell**: extend `Spell` in `SpellSystem.ts`, implement `onCast` / `onRender` / `update`, call `game.recordDamage(spellId, amount)`, set `enemy.lastHitWeaponId`, register in `SPELL_CLASSES` + `SPELL_CONFIGS`, add scaling entry in `BALANCE.spells`, add display name in `DAMAGE_SOURCE_NAMES`.

## Performance Rules

This game runs at 60fps with 100+ enemies and dozens of projectiles. Follow these rules in any per-frame code:

### Never allocate in hot paths
- **No `{ x, y }` literals** in update/render — mutate pre-created objects.
- **No `push`/`splice`/`shift`** for entity removal. Use **swap-and-pop**: `arr[i] = arr[arr.length-1]; arr.pop();`.
- **No template literals for `ctx.fillStyle`** — use `ctx.globalAlpha` with a cached color.
- **No `Array.from(map.entries()).sort()`** every frame. Cache and recompute on change.

### Avoid expensive math in O(n²) loops
- **Use dist² comparisons** (`dx*dx + dy*dy < r*r`) instead of `Math.sqrt`.
- Only `sqrt`/`hypot` when you need the actual distance.

### Canvas rendering
- **One `ctx.save()`/`restore()` per system**, not per particle/entity.
- **Batch paths**: one `beginPath()` → many `moveTo/lineTo` → one `stroke()`.
- **Cache gradients** on the instance.

### Audio / Timers
- Pre-generate noise buffers at init. SoundSystem uses `_initPending` guard.
- **Never `setTimeout`** in the game loop. Use `this._fooTimer -= deltaTime`.

### Reference patterns
- `Float32Array` ring buffers for trails (MagicMissile, Fireball).
- Swap-and-pop for EffectsSystem particles and game enemies/projectiles/pickups.
- Pooled particle primitives in EffectsSystem (shockwave, crit pop, heal sparkle).

## Common Pitfalls

- **Don't save in the game loop.** Only on discrete events.
- **Deactivate screens.** Every `showXxx()` must deactivate the prior screen.
- **Clean up event listeners** in `onLevelEnd`.
- **Spell target may die.** Handle dead-enemy refs — retarget or detonate.
- **Character data sync.** New persisted fields must be handled in `GameState.syncCharacterData()` and seeded via `getStartingWeapons/Spells`.
- **Item stat keys must match** the key the character reads in `onStartLevel`.
- **SoundSystem init requires a user gesture.** First `play()` triggers async init.
- **WeaponSystem is conditional** — not created when `getMaxWeapons() === 0`.
- **Upgrade pools are mandatory** — both UpgradeScreen and CharacterScreen filter by `getUpgradePool()`.

## Build & Test

```bash
npx vite build          # Verify no build errors
npx vite                # Dev server with hot reload
giveMoney()             # Console: add $9999
debugGame()             # Console: game state info
```

Note: the user handles manual browser testing — do not run Chrome DevTools MCP tooling.

## Unlocked Characters

- 4 starters: Fighter, Wizard, Manager, Capitalist.
- 4 unlocked by winning a run: GlassCannon (Fighter), Vampire (Wizard), Hulk (Manager), Speedster (Capitalist).

## Current State / Known TODOs

**Complete:**
- Passive buildup meter for every character (8 total).
- Bosses at 10 / 20 / 30 with telegraphs, phase transitions, resonance pools, shadow clones, shockwaves.
- New enemy types: charger, sniper, exploder, splitter, sporeling.
- Railgun weapon (charge-shot piercer).
- Data-driven spell scaling via `BALANCE.spells`; Magic Missile bolt cap + cooldown scaling.
- Universal items: reinforcedPlating, sniperScope, evasionTraining, prospectorsCharm. Per-class item whitelists.
- 3-slot save system (v3 schema), 500ms throttle, corrupt-save recovery, mid-run resume.
- UI overhaul: carousel CharacterSelect, 3-column LevelSelect with tooltips, scrollable Shop with tooltips + drag scrollbar, stat badges on RoundStats, PauseMenu carets, dramatic GameOver, RunCompleteScreen with unlock reveal.
- EffectsSystem particle pooling + shockwave / crit pop / heal sparkle primitives.
- EffectsSystem budget system: priority-tiered screen shake, flash alpha cap, tiered explosions by radius, damage-number coalescing.
- SoundSystem overhaul: priority/voice manager with stealing, swarm grouping, sidechain ducking, distance attenuation, richer synthesis + convolution reverb, central hit/death aggregators.
- Balance pass: 2x enemy health scaling after wave 10, +50% spawn rate after wave 10, fire-rate upgrades/items nerfed, weapon price rebalance (SMG/Burst/Nova/Orbital 2x, Laser 1.5x, Wave 4x), Fighter momentum threshold scales per-burst per round.
- $25 starting cash for every new character-run — smooths wave-1 economy.
- Capitalist redesign: base HP 10→18, CEO Aura radius 140→180 / bonus +50%→+70%, Dividend Drizzle 6s→4s / coin +33%, Bull Market +20%/stack max 4 stacks 5s window, Monopoly +250% production / +50% damage / 7s duration (from +200%/+25%/5s), fresh runs seed Burger Joint + Farm (synergy pair) instead of just Burger Joint.
- Multi-slot recruit equipment (previously single-slot): `RecruitData.equipment: string[]`. Removing an item goes through sell (50% refund) — no unequip. Ally stats sum across all equipped items; all equipment specials apply.
- Stats & achievements pass: damage attribution unified (spells/allies/structures now appear in HUD strip), run-total damage on RunComplete, 4 new win achievements for unlockables (winGlassCannon/winVampire/winHulk/winSpeedster), lateFinish tied to timer expiry, playtime PLAYING-only, stat caps enforced in applyUpgrade, beforeunload save flush.
- AuraSystem + DebuffSystem wired and visually polished.
- Input: WASD + arrows, normalized diagonals, blur clears state.
- main.ts: error boundary overlay, first-frame skip, DPR-aware resize.
- Hulk stances + Speedster dash styles chosen in StartingSetup.
- Manager recruit/roster/equipment tabs; Capitalist businesses/stocks tabs.

**Open / future:**
- Legacy `VictoryScreen` is unused (wave-30 now routes through `RunCompleteScreen`) — safe to delete.
- Per-hit `_damageTakenThisWave` / `_shotsFiredThisWave` counters for finer achievements (currently derived from roundStats).
- CharacterScreen respec system.
- Floating damage crit-scaling flourish.
