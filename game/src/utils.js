export function setupHiDPICanvas(canvas) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  // Guarantee recursive-safe parsing matching explicitly off the DOM node or existing logical mapping safely
  const w = canvas.logicalWidth || parseInt(canvas.getAttribute('width'), 10) || 800;
  const h = canvas.logicalHeight || parseInt(canvas.getAttribute('height'), 10) || 800;
  
  // Physically stretch the native drawing buffer natively exclusively
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  
  canvas.logicalWidth = w;
  canvas.logicalHeight = h;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: w, height: h };
}
