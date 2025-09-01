export class Entity {
  constructor(x, y) {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.size = 20;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
  }

  update(deltaTime) {
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  render(ctx) {
    // Override in subclasses
  }

  checkCollision(other) {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (this.size + other.size) / 2;
  }

  getBounds() {
    return {
      left: this.position.x - this.size / 2,
      right: this.position.x + this.size / 2,
      top: this.position.y - this.size / 2,
      bottom: this.position.y + this.size / 2,
    };
  }
}