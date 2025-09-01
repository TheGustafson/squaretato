export function setupHiDPICanvas(canvas) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: w, height: h };
}
