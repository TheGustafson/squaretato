# Squaretato

[![Play Squaretato](https://img.shields.io/badge/🎮_Play-Squaretato_Now-FF6666?style=for-the-badge)](https://thegustafson.github.io/squaretato/)

![Gameplay mechanics](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

**Squaretato** is a brutally fast, top-down geometric wave-survival game built strictly with JavaScript and Canvas. Drawing heavy inspiration from modern roguelite heavy-hitters like *Brotato* and *Vampire Survivors*, the game challenges you to survive increasingly dense floods of geometric swarms, collect dropped currency before it decays, and strategically rebuild your arsenal and stat-lines between rounds.

## Overwhelming Mechanics
- **Geometric Swarms:** Survive tightly packed arenas flooded by specialized units including sine-wave shifting interceptors, aggressively fast enraged Trackers, bullet-sponge Tanks, and massive map-controlling Bosses.
- **The Epoch System:** Play linearly through infinitely scaling waves—every single time you execute a Boss (every 10 waves), the underlying map difficulty mathematically rips into a new "Epoch", permanently compounding all adversary health metrics geometrically (1x → 2x → 4x → 8x).
- **Flood Rounds:** Extreme density waves where the tracker spawn-rate triples, velocity spikes, and relentless enemies stream diagonally from all four absolute map corners (plus lateral axes) to suffocate your movement.
- **Micro-Economy:** Enemies physically drop cash on the floor. You have exactly 10 seconds to collect their funds before they permanently decay and log against you as "Missed Funds".

## The Arsenel & Upgrades
Surviving the swarm requires surgical upgrades. Upon surviving a wave, the post-round analytics dashboard cleanly breaks down exactly how much damage each of your weapons dealt and how many enemies of each archetype you killed. 

You seamlessly route through a deterministic progression flow:
1. **Analytics Dashboard:** Review your combat efficiency, damage sustained vs dealt, and economy capture rates.
2. **Stat Leveling:** Permanently upgrade core character variables (*Regeneration, Dodge, Hit Points, Fire Rate, Speed, Luck, Crit Damage*).
3. **The Shop:** Purchase and hold up to six dynamic weapons simultaneously (spanning precision Snipers, Shotguns, Miniguns, Flamethrowers, and Plasma Rifles) alongside passive artifacts like *Blood Pact* (trading max health for vampirism drops) or *Piercing Rounds*.

## Local Development Execution
The repository is bundled using Vite and maintains zero external heavy frameworks intentionally leaving standard vanilla implementations directly exposed.

```bash
# Install dependencies
npm install

# Run the local Vite dev server
npm run dev

# Compile for production
npm run build
```

## Contributing
If you're deploying custom enemy logic or new weapon behaviors, map them directly into `/src/config/balance.js` which universally globally controls all physical thresholds without needing to chase down individual entity classes.
