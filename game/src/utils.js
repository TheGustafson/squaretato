export function setupHiDPICanvas(canvas) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const w = 800; // Hardcoded base logical width
  
  // Pull directly from physically modeled SVH client constraints safely avoiding raw window bounds natively
  const innerW = document.body.clientWidth || window.innerWidth;
  const innerH = document.body.clientHeight || window.innerHeight;
  let aspect;
  
  if (innerH > innerW) {
    // Portrait (Mobile) - fluid fill
    aspect = innerH / innerW;
    canvas.style.width = `${innerW}px`;
    canvas.style.height = `${innerH}px`;
  } else {
    // Landscape (Desktop) - lock to a comfortable mobile aspect ratio (16:9)
    aspect = 16 / 9; // 1.777...
    const canvasHeight = innerH;
    const canvasWidth = canvasHeight / aspect;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
  }
  
  const h = Math.round(w * aspect); // Fluid height calculated seamlessly
  
  // Center horizontally on Desktop
  document.body.style.display = 'flex';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  document.body.style.margin = '0';
  document.body.style.backgroundColor = '#000000';
  
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
