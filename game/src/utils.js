export function setupHiDPICanvas(canvas) {
  const dpr = window.devicePixelRatio || 1; // Pull exact Float natively mapping raw Retina scales precisely
  const logicalW = 800; // Hardcoded base logical width
  
  // Pull directly from physically modeled SVH client constraints safely avoiding raw window bounds natively
  const innerW = document.body.clientWidth || window.innerWidth;
  const innerH = document.body.clientHeight || window.innerHeight;
  
  let aspect;
  let cssW, cssH;
  
  if (innerH > innerW) {
    // Portrait (Mobile) - fluid fill
    aspect = innerH / innerW;
    cssW = innerW;
    cssH = innerH;
  } else {
    // Landscape (Desktop) - Revert to beautiful 1:1 Square maximizing vertical screen bounds
    aspect = 1; // 1:1 perfect square
    cssH = innerH;
    cssW = cssH; // fill the square fully
  }
  
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  
  const logicalH = Math.round(logicalW * aspect); // Fluid vertical logical height dynamically computed
  
  // Center horizontally on Desktop
  document.body.style.display = 'flex';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  document.body.style.margin = '0';
  document.body.style.backgroundColor = '#000000';
  
  // Lock the native drawing buffer EXACTLY to Retina Physical display pixels natively avoiding CSS blurring absolutely!
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  
  canvas.logicalWidth = logicalW;
  canvas.logicalHeight = logicalH;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  
  // Fluidly scale the underlying mathematical logical bounds natively mapping properly into massive Retina Pixels precisely
  const scaleX = canvas.width / logicalW;
  const scaleY = canvas.height / logicalH;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  
  return { ctx, width: logicalW, height: logicalH };
}
