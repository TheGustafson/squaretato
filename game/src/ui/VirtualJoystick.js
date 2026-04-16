export class VirtualJoystick {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.origin = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.vector = { x: 0, y: 0 };
    this.touchId = null;
    this.maxRadius = 50;
  }

  handleTouchStart(touch, scaledX, scaledY) {
    if (this.active) return;
    
    // Activate joystick absolutely anywhere structurally on mobile layout natively
    this.active = true;
    this.touchId = touch.identifier;
    this.origin = { x: scaledX, y: scaledY };
    this.current = { x: scaledX, y: scaledY };
    this.updateVector();
  }

  handleTouchMove(touch, scaledX, scaledY) {
    if (!this.active || touch.identifier !== this.touchId) return;
    
    this.current = { x: scaledX, y: scaledY };
    this.updateVector();
  }

  handleTouchEnd(touch) {
    if (!this.active || touch.identifier !== this.touchId) return;
    
    this.active = false;
    this.touchId = null;
    this.vector = { x: 0, y: 0 };
  }

  updateVector() {
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) {
      this.vector = { x: 0, y: 0 };
    } else {
      // Normalize and cap distance to 1
      const normalizedDist = Math.min(distance / this.maxRadius, 1);
      this.vector = { 
        x: (dx / distance) * normalizedDist, 
        y: (dy / distance) * normalizedDist 
      };
      
      // Keep visual 'current' handle within max radius constraints
      if (distance > this.maxRadius) {
        this.current.x = this.origin.x + (dx / distance) * this.maxRadius;
        this.current.y = this.origin.y + (dy / distance) * this.maxRadius;
      }
    }
  }

  render(ctx) {
    if (!this.active) return;
    
    // Draw base outer ring
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(this.origin.x, this.origin.y, this.maxRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw border for clarity
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    
    // Draw center knob
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(this.current.x, this.current.y, this.maxRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
