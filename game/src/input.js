export class Input {
  #keys = new Set();
  constructor(target = window) {
    target.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.#keys.add(e.key);
    });
    target.addEventListener('keyup', (e) => this.#keys.delete(e.key));
  }
  pressed(key) {
    return this.#keys.has(key);
  }
}
