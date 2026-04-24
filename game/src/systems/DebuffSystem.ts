// DebuffSystem — per-enemy debuff tracking.
//
// Stacking policy:
//   When the same (id, source) debuff is re-applied, duration REFRESHES (elapsed -> 0)
//   and effects are replaced with the newest payload. Different sources / ids stack
//   independently and their multipliers combine (multipliers multiply, flat values add).
//
// Flow per debuff:
//   applyDebuff(target, cfg)      — apply or refresh
//   updateDebuffs(target, dt)     — per-frame tick + swap-and-pop cleanup on expiry
//   clearDebuffs(target)          — called on enemy death to drop all tracking
//
// Built-in ids (by convention, used by spells/items):
//   'freeze' — movement halted; visual tint = light blue
//   'slow'   — speedMultiplier < 1; visual tint = purple
//   'burn'   — dotDamagePerSecond > 0, dotColor = orange
//   'poison' — dotDamagePerSecond > 0, dotColor = green
//
// Performance: no per-frame allocations; arrays live on the enemy, reused and
// shrunk via swap-and-pop.

export interface Debuff {
  id: string;
  source: string;
  duration: number;
  elapsed: number;
  effects: Partial<DebuffEffects>;
}

export interface DebuffEffects {
  damageTakenMultiplier: number;
  speedMultiplier: number;
  dotDamagePerSecond: number;
  dotColor: string;
}

export interface Debuffable {
  _debuffs?: Debuff[];
}

export function applyDebuff(target: Debuffable, debuff: Omit<Debuff, 'elapsed'>): void {
  if (!target._debuffs) target._debuffs = [];
  const list = target._debuffs;
  for (let i = 0; i < list.length; i++) {
    const existing = list[i];
    if (existing.id === debuff.id && existing.source === debuff.source) {
      // Refresh policy: reset timer, replace effects, take the longer remaining duration.
      existing.elapsed = 0;
      existing.duration = debuff.duration;
      existing.effects = debuff.effects;
      return;
    }
  }
  list.push({ ...debuff, elapsed: 0 });
}

export function updateDebuffs(
  target: Debuffable & { takeDamage?: (n: number) => void },
  deltaTime: number,
): void {
  const list = target._debuffs;
  if (!list || list.length === 0) return;
  // Accumulate DOT from `burn`/`poison`/custom-dot debuffs, then apply once.
  // Previously updateDebuffs only ticked elapsed time — dotDamagePerSecond
  // was set on effects but never read anywhere, so DOTs dealt zero damage.
  let dotTotal = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].elapsed += deltaTime;
    const dot = list[i].effects.dotDamagePerSecond;
    if (dot && dot > 0) dotTotal += dot * deltaTime;
    if (list[i].elapsed >= list[i].duration) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
  if (dotTotal > 0 && typeof target.takeDamage === 'function') {
    target.takeDamage(dotTotal);
  }
}

export function getDebuffMultiplier(target: Debuffable, effect: keyof DebuffEffects): number {
  const list = target._debuffs;
  const isMult = effect.endsWith('Multiplier');
  if (!list || list.length === 0) return isMult ? 1 : 0;
  let result: number = isMult ? 1 : 0;
  for (let i = 0; i < list.length; i++) {
    const val = list[i].effects[effect];
    if (val === undefined) continue;
    if (isMult) {
      result *= val as number;
    } else {
      result += val as number;
    }
  }
  return result;
}

export function hasDebuff(target: Debuffable, id: string): boolean {
  const list = target._debuffs;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return true;
  }
  return false;
}

// True if the target has any debuff with id === 'freeze'. Used by Pyromancer Lens
// (Wizard item) to double damage on frozen enemies — callsite does
// `if (isFrozen(enemy)) damage *= 2`.
export function isFrozen(target: Debuffable): boolean {
  return hasDebuff(target, 'freeze');
}

export function isSlowed(target: Debuffable): boolean {
  return hasDebuff(target, 'slow');
}

export function isBurning(target: Debuffable): boolean {
  return hasDebuff(target, 'burn');
}

// Called on enemy death to release all tracking.
export function clearDebuffs(target: Debuffable): void {
  if (target._debuffs) target._debuffs.length = 0;
}

// Visual overlay descriptor — systems rendering enemies can query this to apply
// a tint or spark effect. Returns null when the enemy has no visual debuffs.
// Priority: freeze > burn > poison > slow (most gameplay-relevant first).
export interface DebuffOverlay {
  tint: string;       // rgba color to blend over the sprite
  tintAlpha: number;  // 0..1
  sparkColor?: string; // for burn/poison particles
}

const OVERLAY_FREEZE: DebuffOverlay = { tint: '#9ed8ff', tintAlpha: 0.55 };
const OVERLAY_BURN: DebuffOverlay = { tint: '#ff8a3d', tintAlpha: 0.35, sparkColor: '#ff8a3d' };
const OVERLAY_POISON: DebuffOverlay = { tint: '#7cff5a', tintAlpha: 0.35, sparkColor: '#7cff5a' };
const OVERLAY_SLOW: DebuffOverlay = { tint: '#b48cff', tintAlpha: 0.3 };

export function getDebuffOverlay(target: Debuffable): DebuffOverlay | null {
  const list = target._debuffs;
  if (!list || list.length === 0) return null;
  let hasBurn = false;
  let hasPoison = false;
  let hasSlow = false;
  for (let i = 0; i < list.length; i++) {
    const id = list[i].id;
    if (id === 'freeze') return OVERLAY_FREEZE;
    if (id === 'burn') hasBurn = true;
    else if (id === 'poison') hasPoison = true;
    else if (id === 'slow') hasSlow = true;
  }
  if (hasBurn) return OVERLAY_BURN;
  if (hasPoison) return OVERLAY_POISON;
  if (hasSlow) return OVERLAY_SLOW;
  return null;
}
