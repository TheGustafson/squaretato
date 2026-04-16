export function setupHiDPICanvas(canvas) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const w = 800; // Hardcoded base logical width
  const aspect = window.innerHeight / window.innerWidth;
  const h = Math.round(w * aspect); // Fluid height calculated seamlessly
  
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
