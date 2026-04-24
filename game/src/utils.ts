import type { GameCanvas } from './types';

export function setupHiDPICanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  const logicalW = 800;

  const innerW = document.body.clientWidth || window.innerWidth;
  const innerH = document.body.clientHeight || window.innerHeight;

  let cssW: number;
  let cssH: number;
  let aspect: number;

  if (innerH > innerW) {
    aspect = innerH / innerW;
    cssW = innerW;
    cssH = innerH;
  } else {
    aspect = 1;
    cssH = innerH;
    cssW = cssH;
  }

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const logicalH = Math.round(logicalW * aspect);

  document.body.style.display = 'flex';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  document.body.style.margin = '0';
  document.body.style.backgroundColor = '#000000';

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  (canvas as GameCanvas).logicalWidth = logicalW;
  (canvas as GameCanvas).logicalHeight = logicalH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  const scaleX = canvas.width / logicalW;
  const scaleY = canvas.height / logicalH;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  return { ctx, width: logicalW, height: logicalH };
}
