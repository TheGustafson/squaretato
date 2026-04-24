import { setupHiDPICanvas } from './utils';
import { Input } from './input';
import { Game } from './game';
import type { GameCanvas } from './types';

console.log('main.ts loaded');

const MAX_DT = 0.1; // clamp deltaTime to avoid physics explosion after tab restore

const canvasEl = document.getElementById('game') as GameCanvas | null;
if (!canvasEl) throw new Error('No <canvas id="game"> found');
const canvas: GameCanvas = canvasEl as GameCanvas;

let ctx = setupHiDPICanvas(canvas).ctx;
const input = new Input();
const game = new Game(canvas, ctx, input);

function showErrorOverlay(err: unknown): void {
  console.error('Fatal game error:', err);
  if (document.getElementById('fatal-error-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'fatal-error-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.92)',
    'color:#fff',
    'font-family:monospace',
    'font-size:18px',
    'text-align:center',
    'padding:24px',
    'z-index:99999',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Something broke';
  title.style.cssText = 'font-size:24px;margin-bottom:12px;';

  const msg = document.createElement('div');
  msg.textContent = 'Reload the page to continue.';
  msg.style.cssText = 'margin-bottom:20px;';

  const btn = document.createElement('button');
  btn.textContent = 'Reload';
  btn.style.cssText = 'padding:10px 20px;font-family:monospace;font-size:16px;cursor:pointer;';
  btn.addEventListener('click', () => window.location.reload());

  overlay.appendChild(title);
  overlay.appendChild(msg);
  overlay.appendChild(btn);
  document.body.appendChild(overlay);
}

// Resize: update physical canvas size + DPR scale; logical coords unchanged for game.
let resizeQueued = false;
function handleResize(): void {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    try {
      ctx = setupHiDPICanvas(canvas).ctx;
      // Re-render immediately at new scale so we don't show a stretched/blank frame.
      game.render();
    } catch (err) {
      showErrorOverlay(err);
    }
  });
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

let last = performance.now();
let fatal = false;

function loop(now: number): void {
  if (fatal) return;
  try {
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;

    game.update(dt);
    game.render();

    requestAnimationFrame(loop);
  } catch (err) {
    fatal = true;
    showErrorOverlay(err);
  }
}

window.addEventListener('error', (e) => showErrorOverlay(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay(e.reason));

// Await one frame before starting to avoid blank-canvas flash on first paint.
requestAnimationFrame(() => {
  last = performance.now();
  requestAnimationFrame(loop);
});
