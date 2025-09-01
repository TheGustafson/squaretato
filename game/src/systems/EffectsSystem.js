export class EffectsSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.screenShake = {
      intensity: 0,
      duration: 0,
      offset: { x: 0, y: 0 }
    };
    this.flashes = [];
    this.particles = [];
    this.floatingTexts = [];
  }

  addScreenShake(intensity = 5, duration = 0.2) {
    this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
    this.screenShake.duration = Math.max(this.screenShake.duration, duration);
  }

  addFlash(color = '#FFFFFF', duration = 0.1) {
    this.flashes.push({
      color,
      duration,
      maxDuration: duration
    });
  }

  addDamageFlash() {
    this.addFlash('#FF0000', 0.15);
    this.addScreenShake(4, 0.25);
  }

  addKillEffect(x, y) {
    // Add explosion particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 100 + Math.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5,
        maxLife: 0.5,
        color: '#FF0000',
        size: 3
      });
    }
    this.addScreenShake(1.5, 0.1);
  }

  addMoneyPickupEffect(x, y, value) {
    this.floatingTexts.push({
      x,
      y,
      text: `+$${value}`,
      vy: -50,
      life: 1,
      color: '#00FF00'
    });
    
    // Add sparkle particles
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3,
        maxLife: 0.3,
        color: '#00FF00',
        size: 2
      });
    }
  }

  addLevelUpEffect(x, y) {
    this.floatingTexts.push({
      x,
      y,
      text: 'LEVEL UP!',
      vy: -30,
      life: 2,
      color: '#FFFF00'
    });
    
    // Add ring of particles
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color: '#FFFF00',
        size: 4
      });
    }
    
    this.addFlash('#FFFF00', 0.3);
  }

  // Muzzle flash effect for shooting
  addMuzzleFlash(x, y, angle, color = '#FFFF00') {
    // Small flash at gun position
    for (let i = 0; i < 3; i++) {
      const spread = (Math.random() - 0.5) * 0.3;
      const particleAngle = angle + spread;
      const speed = 200 + Math.random() * 100;
      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(particleAngle) * speed,
        vy: Math.sin(particleAngle) * speed,
        life: 0.1,
        maxLife: 0.1,
        color,
        size: 2
      });
    }
  }

  // Shell casing effect
  addShellCasing(x, y) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 100,
      vy: -100 - Math.random() * 50,
      life: 0.5,
      maxLife: 0.5,
      color: '#FFD700',
      size: 3,
      gravity: 300
    });
  }

  // Impact effect when projectile hits
  addImpactEffect(x, y, color = '#00FF00') {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2,
        maxLife: 0.2,
        color,
        size: 2
      });
    }
  }

  // Explosion effect for rockets
  addExplosionEffect(x, y, radius = 50) {
    // Big flash
    this.addFlash('#FFA500', 0.2);
    this.addScreenShake(6, 0.4);
    
    // Ring of fire particles
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const speed = 100 + Math.random() * 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6,
        maxLife: 0.6,
        color: Math.random() > 0.5 ? '#FF4500' : '#FFA500',
        size: 5 + Math.random() * 3
      });
    }
    
    // Smoke particles
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life: 1,
        maxLife: 1,
        color: '#666666',
        size: 8
      });
    }
  }

  // Chain lightning effect - creates zigzag lightning animation
  addChainLightningEffect(x1, y1, x2, y2) {
    // Calculate distance and angle
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    // Create zigzag lightning path
    const segments = Math.floor(distance / 15); // Segment every 15 pixels
    const points = [{ x: x1, y: y1 }];
    
    // Generate zigzag points
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = x1 + dx * t;
      const baseY = y1 + dy * t;
      
      // Add perpendicular offset for zigzag
      const perpAngle = angle + Math.PI / 2;
      const offset = (Math.random() - 0.5) * 20; // Random offset up to 20px
      
      points.push({
        x: baseX + Math.cos(perpAngle) * offset,
        y: baseY + Math.sin(perpAngle) * offset
      });
    }
    points.push({ x: x2, y: y2 });
    
    // Create lightning segments with varying intensity
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Main bolt - thick and bright
      this.particles.push({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        vx: 0, vy: 0,
        life: 0.2,
        maxLife: 0.2,
        color: '#00FFFF', // Cyan
        size: 4,
        lightning: true,
        segment: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      });
      
      // Secondary bolt - thinner, slightly transparent
      this.particles.push({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        vx: 0, vy: 0,
        life: 0.15,
        maxLife: 0.15,
        color: '#88FFFF', // Lighter cyan
        size: 2,
        lightning: true,
        segment: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
      });
    }
    
    // Add glow particles at connection points
    for (const point of points) {
      this.particles.push({
        x: point.x,
        y: point.y,
        vx: 0, vy: 0,
        life: 0.25,
        maxLife: 0.25,
        color: '#00FFFF',
        size: 8,
        glow: true
      });
    }
  }

  // Crit effect
  addCritEffect(x, y) {
    // Star burst pattern
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3,
        maxLife: 0.3,
        color: '#FF00FF',
        size: 3
      });
    }
  }

  // Reload effect
  addReloadEffect(x, y) {
    this.floatingTexts.push({
      x,
      y,
      text: 'RELOAD',
      vy: -20,
      life: 0.5,
      color: '#888888'
    });
  }

  // Damage number effect
  addDamageNumber(x, y, damage) {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 20, // Slight random offset to prevent overlap
      y,
      text: damage.toFixed(1),  // Show 1 decimal place
      vy: -40, // Float upward
      life: 0.8, // Fade over 0.8 seconds
      color: '#FFFFFF', // White color
      size: 14 // Smaller font
    });
  }

  // Trail effect for projectiles
  addProjectileTrail(x, y, color = '#00FF00', size = 2) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      life: 0.2,
      maxLife: 0.2,
      color,
      size,
      fade: true
    });
  }

  // Long-lasting trail for wave enemies
  addWaveTrail(x, y, color = '#FF8800') {
    this.particles.push({
      x,
      y,
      vx: 0,  // Stationary
      vy: 0,  // Stationary
      life: 2.0,  // Much longer lasting
      maxLife: 2.0,
      color,
      size: 3,
      fade: true,
      trail: true  // Special flag for trail particles
    });
  }

  update(deltaTime) {
    // Update screen shake
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaTime;
      if (this.screenShake.duration <= 0) {
        this.screenShake.offset = { x: 0, y: 0 };
      } else {
        this.screenShake.offset = {
          x: (Math.random() - 0.5) * this.screenShake.intensity,
          y: (Math.random() - 0.5) * this.screenShake.intensity
        };
      }
    }

    // Update flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].duration -= deltaTime;
      if (this.flashes[i].duration <= 0) {
        this.flashes.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.life -= deltaTime;
      
      // Add gravity if specified
      if (particle.gravity) {
        particle.vy += particle.gravity * deltaTime;
      }
      
      // Add friction
      particle.vx *= 0.98;
      if (!particle.gravity) {
        particle.vy *= 0.98;
      }
      
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const text = this.floatingTexts[i];
      text.y += text.vy * deltaTime;
      text.life -= deltaTime;
      
      if (text.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  applyScreenShake(ctx) {
    if (this.screenShake.duration > 0) {
      ctx.save();
      ctx.translate(this.screenShake.offset.x, this.screenShake.offset.y);
    }
  }

  restoreScreenShake(ctx) {
    if (this.screenShake.duration > 0) {
      ctx.restore();
    }
  }

  renderParticles(ctx) {
    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      
      // Render lightning segments as lines
      if (particle.segment) {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(particle.segment.x1, particle.segment.y1);
        ctx.lineTo(particle.segment.x2, particle.segment.y2);
        ctx.stroke();
      }
      // Render glow effects as circles
      else if (particle.glow) {
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = particle.size;
        ctx.shadowColor = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Regular square particles
      else {
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          particle.x - particle.size / 2,
          particle.y - particle.size / 2,
          particle.size,
          particle.size
        );
      }
      
      ctx.restore();
    }
  }

  renderFloatingTexts(ctx) {
    ctx.textAlign = 'center';
    
    for (const text of this.floatingTexts) {
      const alpha = text.life;
      ctx.save();
      ctx.globalAlpha = alpha * 0.7; // Make text slightly transparent
      ctx.fillStyle = text.color;
      // Use custom size if specified, otherwise default to 16px
      ctx.font = text.size ? `bold ${text.size}px monospace` : 'bold 16px monospace';
      ctx.fillText(text.text, text.x, text.y);
      ctx.restore();
    }
  }

  renderFlashes(ctx) {
    for (const flash of this.flashes) {
      const alpha = (flash.duration / flash.maxDuration) * 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }
}