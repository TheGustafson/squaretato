import type { Vec2, Bounds } from '../types';

/**
 * Base class for all moving things in the world (Player, Enemy, Projectile,
 * Pickup). `position` and `velocity` are allocated once in the constructor
 * and mutated in place every frame -- do NOT replace them with new objects
 * from subclasses (hot-path allocation kills perf under bullet-heavy waves).
 */
export class Entity {
  /** World-space position, mutated in place each update. */
  position: Vec2;
  /** World-space velocity in units/sec, mutated in place. */
  velocity: Vec2;
  size: number;
  health: number;
  maxHealth: number;
  alive: boolean;

  constructor(x: number, y: number) {
    // Pre-allocated; never reassigned -- keep these stable for shape caching.
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.size = 20;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
  }

  /**
   * Integrates position from velocity. Zero per-frame allocation.
   * Subclasses may override but should preserve the in-place mutation pattern.
   */
  update(deltaTime: number, ..._args: unknown[]): void {
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
  }

  takeDamage(amount: number): void {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  render(_ctx: CanvasRenderingContext2D): void {}

  /** Circle-based overlap test using combined half-size as radius. */
  checkCollision(other: Entity): boolean {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    const threshold = (this.size + other.size) / 2;
    return dx * dx + dy * dy < threshold * threshold;
  }

  getBounds(): Bounds {
    return {
      left: this.position.x - this.size / 2,
      right: this.position.x + this.size / 2,
      top: this.position.y - this.size / 2,
      bottom: this.position.y + this.size / 2,
    };
  }

  /**
   * True if the entity's bounding box is fully outside the given canvas.
   * Useful for despawning off-screen projectiles / pickups.
   */
  isOffscreen(canvasW: number, canvasH: number): boolean {
    const half = this.size / 2;
    return (
      this.position.x + half < 0 ||
      this.position.y + half < 0 ||
      this.position.x - half > canvasW ||
      this.position.y - half > canvasH
    );
  }
}
