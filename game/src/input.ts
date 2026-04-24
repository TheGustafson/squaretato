export type MoveVector = { x: number; y: number };

const MOVEMENT_KEYS = new Set<string>([
  'w', 'a', 's', 'd',
  'W', 'A', 'S', 'D',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

const PREVENT_DEFAULT_KEYS = new Set<string>([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ' ',
]);

export class Input {
  #keys = new Set<string>();
  #moveVec: MoveVector = { x: 0, y: 0 };
  #preventDefaultEnabled = true;

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (this.#preventDefaultEnabled && PREVENT_DEFAULT_KEYS.has(ke.key)) {
        ke.preventDefault();
      }
      this.#keys.add(ke.key);
    });
    target.addEventListener('keyup', (e) => {
      this.#keys.delete((e as KeyboardEvent).key);
    });

    // Clear held keys on blur so the player doesn't keep moving after the tab
    // is deactivated. We intentionally do NOT clear on focus — the browser
    // fires blur+focus when alt-tabbing back, and clearing on focus forced
    // the player to re-press W/A/S/D even though they were still holding them.
    window.addEventListener('blur', () => this.#keys.clear());
  }

  /**
   * Enable or disable preventDefault on movement/space keys.
   * Typically true during gameplay and false while menus are open so
   * the browser's default behavior (form input, scrolling in menus) works.
   */
  setPreventDefault(enabled: boolean): void {
    this.#preventDefaultEnabled = enabled;
  }

  isPressed(key: string): boolean {
    return this.#keys.has(key);
  }

  // Backwards-compatible alias.
  pressed(key: string): boolean {
    return this.#keys.has(key);
  }

  /**
   * Returns a normalized movement vector based on WASD + arrow keys.
   * The same object instance is returned each call to avoid per-frame
   * allocations in the game loop.
   */
  getMoveVector(): MoveVector {
    let x = 0;
    let y = 0;
    const k = this.#keys;
    if (k.has('a') || k.has('A') || k.has('ArrowLeft')) x -= 1;
    if (k.has('d') || k.has('D') || k.has('ArrowRight')) x += 1;
    if (k.has('w') || k.has('W') || k.has('ArrowUp')) y -= 1;
    if (k.has('s') || k.has('S') || k.has('ArrowDown')) y += 1;

    if (x !== 0 && y !== 0) {
      // Normalize diagonals: 1/sqrt(2)
      const inv = 0.70710678118654752;
      x *= inv;
      y *= inv;
    }

    this.#moveVec.x = x;
    this.#moveVec.y = y;
    return this.#moveVec;
  }

  clear(): void {
    this.#keys.clear();
  }

  static isMovementKey(key: string): boolean {
    return MOVEMENT_KEYS.has(key);
  }
}
