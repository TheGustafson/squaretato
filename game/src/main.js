import { setupHiDPICanvas } from './utils.js';
import { Input } from './input.js';
import { Game } from './game.js';

console.log('main.js loaded');

const canvas = document.getElementById('game');
if (!canvas) throw new Error('No <canvas id="game"> found');

const { ctx, width, height } = setupHiDPICanvas(canvas);
const input = new Input();
const game = new Game(canvas, ctx, input);

let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 15); // clamp big hiccups

  game.update(dt);
  game.render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('resize', () => {
  // Re-apply DPR transform if you ever change canvas size dynamically.
  setupHiDPICanvas(canvas);
});
