# Squaretato

[![Play Squaretato](https://img.shields.io/badge/Play-Squaretato_Now-FF6666?style=for-the-badge)](https://thegustafson.github.io/squaretato/)

![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

A brutally fast, top-down geometric **roguelike auto-survivor** built with vanilla TypeScript and Canvas 2D. Pick one of 9 characters, survive 30 escalating waves, and fight 3 bosses along the way. Death is final per run, but meta progress (achievements, lifetime stats, save slots) carries forward.

<!-- TODO: add screenshot -->

## Game Overview

- **8 unique characters**, each with a distinct passive buildup meter instead of an active ability. Every new character-run starts with **$25 pocket money**.
- **30 waves** of escalating geometric swarms.
- **Boss fights at waves 10, 20, and 30** — each permanently amps the run's difficulty.
- **Auto-aim, auto-fire**: weapons target and shoot on their own. Your job is positioning and reading resources.
- **3-slot save system** so multiple characters/runs can live side-by-side.
- **Achievements and lifetime stats** persist across every run.
- **Tutorial overlays** ease new players into each system.

## Controls

| Input | Action |
|-------|--------|
| `W` `A` `S` `D` | Move |
| `Esc` | Pause / resume |

That's it. No dash, no active abilities, no manual aim — the entire game is built around movement and resource management.

## Core Loop

1. **Main Menu** → choose one of 3 save slots.
2. **New Run** → pick a character from the carousel.
3. **Starting Loadout** → pick your starting weapon and item.
4. **Wave** → survive the swarm. Weapons auto-fire, pickups get vacuumed.
5. **Post-wave flow**:
   - **Round Stats** — damage dealt, kills, economy capture.
   - **Upgrade** — level core stats (HP, regen, dodge, fire rate, speed, luck, crit).
   - **Shop** — buy/sell weapons and items (up to 6 weapon slots).
   - **Character Screen** — review your build and passive meter.
   - **Level Select** — confirm the next wave.
6. Repeat until wave 30 clears or you die.
7. **Death** resets per-run state. Meta (slots, achievements, lifetime stats) persists.

## Characters

Each character is defined by a **unique passive buildup meter** that you feed through play — no buttons to press, only windows to exploit.

| Character | Pitch | Passive |
|-----------|-------|---------|
| **Fighter** | Weapon-stacker who snowballs through momentum bursts. | **Momentum** — kills fill the meter; Burst grants +100% fire rate / +25% damage for 4s. Each Burst in the same wave raises the next threshold by 1.5×. |
| **Wizard** | Four-slot cooldown caster with a mana pool, no guns. | **Arcane Surge** — kills charge Overcharge (spell power + cooldown boost). Spells: Magic Missile, Fireball, Chain Lightning, Ice Nova, Meteor Storm, Arcane Beam, Teleport, Familiar, Time Warp, Shield Bubble. |
| **Hulk** | 50 HP melee tank. Fists only, 0.6× speed. | **Rage** — damage taken fills Rage; vent unleashes stance-scaled shockwave slams (Juggernaut / Earthshaker / Berserker, picked at start). Unstoppable burst at cap. |
| **Vampire** | Weapon-based lifesteal diver; kill-to-heal or die. | **Blood Bank** — kills + damage fill the bank; auto-triggers a radial blood-burst at cap (heals you, damages nearby). **Thirst** bleeds 0.25 HP/s when the bank is empty and HP is above the frenzy threshold. Frenzy under 30% HP: +200% damage, +50% speed/fire rate. Shop: Weapons + Items. |
| **Speedster** | Pure-melee mobility build, no weapons. | **Velocity** — movement scales dash damage; afterimages trail behind dealing 50% dash damage for 1.5s. Mach Break at cap. Dash style (Blink / Phantom / Overdrive) chosen at start. |
| **GlassCannon** | 2 HP, 2× damage / speed / fire rate baseline. | **Kill Streak** — consecutive kills stack crit; any hit resets the streak. Max streak triggers Deadeye burst. |
| **Manager** | Commander. Hires up to 8 Recruits; no direct damage. | **Command / Rally Cry** — ally kills fill Command; Rally Cry is a team-wide +damage/+fire rate burst. Multi-slot equipment per recruit. Shop: Recruit / Roster / Equipment / Items. |
| **Capitalist** | Tycoon. Places Businesses on a 3×3 grid; no weapons. Hoarding = damage. | **Bull Market → Monopoly** — structure kills stack Bull Market; Monopoly burst = +250% production / +50% damage for 7s. CEO Aura boosts nearby businesses; Dividend Drizzle drops business coins passively (distinct emerald palette). **Capital Supremacy**: every $1000 in your bank = +0.5% damage AND production to all businesses (cap +200% at $400k). Stocks include compounding late-game sinks (Hedge Fund pays % of bank, Holdings Group pays per stock owned). Shop: Businesses + Stocks + Items. |

## Design Philosophy

- **No active abilities.** Every character's "ability" is a passive meter that fills via play. You don't press a button — you create the conditions for it to pay off.
- **Positioning and resource reading are the only tactical levers.** Where you stand, what you collect, when you commit to a fight — that's the entire skill expression.
- **Shared abstractions.** Weapons, spells, and systems are reused across characters rather than duplicated per class.
- **Readable buildup.** Every passive is visible on the HUD so you can plan around its threshold.

## Tech Stack

- **Vanilla TypeScript** — no frameworks.
- **Canvas 2D** — all rendering is hand-rolled.
- **Vite** — dev server and bundler.
- **LocalStorage** — save slots, achievements, and lifetime stats.

## Quick Start

```bash
# Install dependencies
npm install

# Dev server
npx vite

# Production build
npx vite build
```

The game lives under `game/` with source in `game/src/`.

## Debug Helpers

Open your browser devtools and use the global helpers exposed on `window`:

```js
giveMoney(10000)  // grant cash for testing shop flows
debugGame()       // dump current game state (player, wave, systems)
```

## Repository Layout

```
game/
  index.html
  public/              # music and static assets
  src/
    characters/        # per-class definitions and passive meters
    config/balance.ts  # all tunable numbers
    entities/          # Player, Enemy, Projectile, Pickup
    systems/           # Weapon, Spell, Aura, Debuff, Mana, Ally, etc.
    ui/                # Menu, CharacterSelect, Shop, Upgrade, RoundStats, ...
    game.ts            # main loop
    main.ts            # entry point
```

## License

MIT.
