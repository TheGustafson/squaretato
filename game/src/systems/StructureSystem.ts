import type { Enemy } from '../entities/Enemy';

export interface StructureConfig {
  name: string;
  tier?: 1 | 2 | 3;
  cost?: number;
  sellValueFraction?: number;
  upgradesTo?: string;
  health?: number;
  productionRate?: number;
  damage?: number;
  productSpeed?: number;
  color?: string;
  passiveIncome?: number;
  stockDividendBonus?: number;
  productionAura?: number;
  damageAura?: number;
  synergiesWith?: string[];
  description?: string;
}

interface Product {
  x: number;
  y: number;
  ttl: number;
  spin: number;
}

const PRODUCT_SIZE = 14;

export class Structure {
  type: string;
  name: string;
  tier: 1 | 2 | 3;
  health: number;
  maxHealth: number;
  baseProductionRate: number;
  productionRate: number;
  productionTimer: number;
  damage: number;
  productSpeed: number;
  color: string;
  size: number;
  alive: boolean;
  position: { x: number; y: number };
  gridX: number;
  gridY: number;
  products: Product[];

  // Whether this structure spawns product projectiles (false for banks/labs/radio).
  producesProjectiles: boolean;

  // Surge state: temporary production multiplier set by Market Surge.
  surgeMultiplier: number;
  surgeTimer: number;

  // CEO Aura bonus applied each frame when player is nearby.
  ceoBoost: number;

  // Adjacency bonuses, refreshed by CapitalistCharacter when the grid changes.
  adjProductionBonus: number;
  adjDamageMult: number;

  // Subtle wiggle/bob animation timer for life.
  animTime: number;

  // Upgrade flash (set by setTier); 0 if not flashing. Ring expands over 0.4s.
  upgradeFlashTimer: number;

  damageCallback: ((sourceId: string, amount: number) => void) | null = null;

  constructor(type: string, config: StructureConfig, x: number, y: number, gridX: number = 0, gridY: number = 0) {
    this.type = type;
    this.name = config.name;
    this.tier = (config.tier as 1 | 2 | 3) || 1;
    this.health = config.health || 50;
    this.maxHealth = this.health;
    this.baseProductionRate = config.productionRate || 3;
    this.productionRate = this.baseProductionRate;
    this.productionTimer = this.productionRate || 2;
    this.damage = config.damage || 0;
    this.productSpeed = config.productSpeed || 100;
    this.color = config.color || '#FFAA00';
    this.size = this.sizeForTier(this.tier);
    this.alive = true;
    this.position = { x, y };
    this.gridX = gridX;
    this.gridY = gridY;
    this.products = [];
    this.producesProjectiles = !!config.productionRate && config.productionRate > 0 && (config.damage || 0) > 0;
    this.surgeMultiplier = 1;
    this.surgeTimer = 0;
    this.ceoBoost = 0;
    this.adjProductionBonus = 0;
    this.adjDamageMult = 1;
    this.animTime = Math.random() * Math.PI * 2;
    this.upgradeFlashTimer = 0;
  }

  private sizeForTier(tier: number): number {
    if (tier === 3) return 60;
    if (tier === 2) return 50;
    return 44;
  }

  /**
   * Replace this structure's config in-place with the tier-upgraded version.
   * Keeps HP-percentage, position, and grid slot.
   */
  setTier(newType: string, config: StructureConfig): void {
    const hpPct = Math.max(0.1, this.health / Math.max(1, this.maxHealth));
    this.type = newType;
    this.name = config.name;
    this.tier = (config.tier as 1 | 2 | 3) || this.tier;
    this.maxHealth = config.health || this.maxHealth;
    this.health = this.maxHealth * hpPct;
    this.baseProductionRate = config.productionRate || 0;
    this.damage = config.damage || 0;
    this.productSpeed = config.productSpeed || this.productSpeed;
    this.color = config.color || this.color;
    this.size = this.sizeForTier(this.tier);
    this.producesProjectiles = !!config.productionRate && config.productionRate > 0 && (config.damage || 0) > 0;
    this.upgradeFlashTimer = 0.4;
    // Snappy first product after upgrade
    if (this.producesProjectiles) this.productionTimer = 0.3;
  }

  effectiveProductionRate(): number {
    const mult = (1 + this.ceoBoost + this.adjProductionBonus) * this.surgeMultiplier;
    return this.baseProductionRate / Math.max(0.01, mult);
  }

  update(deltaTime: number, enemies: Enemy[]): void {
    if (!this.alive) return;
    this.animTime += deltaTime * 2;

    if (this.upgradeFlashTimer > 0) {
      this.upgradeFlashTimer = Math.max(0, this.upgradeFlashTimer - deltaTime);
    }

    if (this.surgeTimer > 0) {
      this.surgeTimer -= deltaTime;
      if (this.surgeTimer <= 0) {
        this.surgeTimer = 0;
        this.surgeMultiplier = 1;
      }
    }

    if (this.producesProjectiles) {
      this.productionTimer -= deltaTime;
      if (this.productionTimer <= 0) {
        this.productionTimer = this.effectiveProductionRate();
        this.spawnProduct();
      }

      // Swap-and-pop removal for per-frame products (up to ~24/structure × 9 = 216 live).
      for (let i = this.products.length - 1; i >= 0; i--) {
        const p = this.products[i];
        p.ttl -= deltaTime;
        p.spin += deltaTime * 8;
        if (p.ttl <= 0) {
          this.products[i] = this.products[this.products.length - 1];
          this.products.pop();
          continue;
        }

        let closest: Enemy | null = null;
        let minDist = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.position.x - p.x;
          const dy = e.position.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < minDist) { minDist = d2; closest = e; }
        }
        if (closest) {
          const dist = Math.sqrt(minDist);
          const angle = Math.atan2(closest.position.y - p.y, closest.position.x - p.x);
          p.x += Math.cos(angle) * this.productSpeed * deltaTime;
          p.y += Math.sin(angle) * this.productSpeed * deltaTime;
          if (dist < 20) {
            const effectiveDmg = Math.min(closest.health, this.damage * this.adjDamageMult);
            closest.takeDamage(this.damage * this.adjDamageMult);
            closest.lastHitWeaponId = `biz_${this.type}`;
            this.products[i] = this.products[this.products.length - 1];
            this.products.pop();
            if (this.damageCallback && effectiveDmg > 0) {
              this.damageCallback(`biz_${this.type}`, effectiveDmg);
            }
          }
        }
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - this.position.x, e.position.y - this.position.y);
      if (d < this.size / 2 + e.size / 2) {
        this.health -= e.damage * deltaTime * 0.3;
        if (this.health <= 0) this.alive = false;
      }
    }

    this.ceoBoost *= Math.pow(0.001, deltaTime);
  }

  setSurge(multiplier: number, duration: number): void {
    this.surgeMultiplier = multiplier;
    this.surgeTimer = duration;
  }

  applyCeoAura(boost: number): void {
    this.ceoBoost = boost;
  }

  private spawnProduct(): void {
    this.products.push({
      x: this.position.x + (Math.random() - 0.5) * 20,
      y: this.position.y + (Math.random() - 0.5) * 20,
      ttl: 8,
      spin: Math.random() * Math.PI * 2,
    });
  }

  // ============ ICON DRAWERS ============

  private drawBurgerJoint(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#FFD066';
    ctx.fillRect(x - halfS, y - halfS + 4, s, s - 4);
    ctx.fillStyle = '#CC2222';
    ctx.beginPath();
    ctx.moveTo(x - halfS - 2, y - halfS + 6);
    ctx.lineTo(x, y - halfS - 8);
    ctx.lineTo(x + halfS + 2, y - halfS + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 10, y - 4, 20, 10);
    ctx.fillStyle = '#8B4513';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.tier === 1) ctx.fillText('BURG', x, y + 1);
    else if (this.tier === 2) ctx.fillText('DINE', x, y + 1);
    else ctx.fillText('RSTR', x, y + 1);
    ctx.textBaseline = 'alphabetic';
    const puff = (Math.sin(this.animTime) + 1) * 0.5;
    ctx.fillStyle = `rgba(200,200,200,${0.3 + puff * 0.3})`;
    ctx.beginPath();
    ctx.arc(x + halfS - 6, y - halfS - 6 - puff * 4, 4 + puff * 2, 0, Math.PI * 2);
    ctx.fill();
    if (this.tier >= 2) {
      // Neon sign
      const glow = 0.5 + 0.5 * Math.sin(this.animTime * 4);
      ctx.fillStyle = `rgba(255,80,80,${0.7 + glow * 0.3})`;
      ctx.fillRect(x - halfS + 4, y + halfS - 10, s - 8, 3);
    }
    if (this.tier >= 3) {
      // Golden awning stripes
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x - halfS - 2, y - halfS + 6, s + 4, 2);
      ctx.fillStyle = '#CC9900';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x - halfS + 2 + i * (s / 5), y - halfS + 8, 2, 2);
      }
    }
  }

  private drawMercenaryCamp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#5A3A22';
    ctx.fillRect(x - halfS, y - halfS + 8, s, s - 8);
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.moveTo(x - halfS, y - halfS + 8);
    ctx.lineTo(x, y - halfS - 10);
    ctx.lineTo(x + halfS, y - halfS + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - halfS - 10);
    ctx.lineTo(x, y - halfS - 22);
    ctx.stroke();
    const wave = Math.sin(this.animTime * 3) * 2;
    ctx.fillStyle = this.tier === 3 ? '#FFD700' : (this.tier === 2 ? '#FF7744' : '#CC2222');
    ctx.beginPath();
    ctx.moveTo(x, y - halfS - 22);
    ctx.lineTo(x + 10 + wave, y - halfS - 18);
    ctx.lineTo(x, y - halfS - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#221100';
    ctx.fillRect(x - 4, y + 4, 8, halfS - 4);
    if (this.tier >= 2) {
      // Extra tower
      ctx.fillStyle = '#6A4A2A';
      ctx.fillRect(x - halfS + 2, y - halfS - 4, 6, 10);
      ctx.fillRect(x + halfS - 8, y - halfS - 4, 6, 10);
    }
    if (this.tier >= 3) {
      // Battlements
      ctx.fillStyle = '#8B4513';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - halfS + i * (s / 4) + 2, y - halfS + 4, 4, 4);
      }
    }
  }

  private drawRobotFactory(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#AAAAAA';
    ctx.fillRect(x - halfS, y - halfS, s, s);
    ctx.fillStyle = '#555';
    for (const [rx, ry] of [[-halfS + 4, -halfS + 4], [halfS - 6, -halfS + 4], [-halfS + 4, halfS - 6], [halfS - 6, halfS - 6]]) {
      ctx.beginPath(); ctx.arc(x + rx, y + ry, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#333';
    ctx.fillRect(x - halfS + 4, y + 2, s - 8, 8);
    ctx.fillStyle = '#FFFF00';
    const slot = ((this.animTime * 30) % 12);
    for (let i = -slot; i < s; i += 12) {
      ctx.fillRect(x - halfS + 4 + i, y + 4, 4, 4);
    }
    ctx.fillStyle = '#444';
    ctx.fillRect(x + halfS - 10, y - halfS - 8, 6, 8);
    if (this.tier >= 2) {
      // Second smokestack + glowing core
      ctx.fillStyle = '#444';
      ctx.fillRect(x - halfS + 4, y - halfS - 8, 6, 8);
      const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 5);
      ctx.fillStyle = `rgba(255,100,100,${0.5 + 0.5 * pulse})`;
      ctx.fillRect(x - 4, y - halfS - 4, 8, 4);
    }
    if (this.tier >= 3) {
      // Gold trim
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - halfS + 2, y - halfS + 2, s - 4, s - 4);
    }
  }

  private drawDroneHub(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#3355AA';
    ctx.fillRect(x - halfS, y - halfS + 6, s, s - 6);
    const rotate = this.animTime * 1.5;
    ctx.save();
    ctx.translate(x, y - halfS - 4);
    ctx.rotate(rotate);
    ctx.fillStyle = '#AADDFF';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    const glow = 0.6 + 0.4 * Math.sin(this.animTime * 6);
    ctx.fillStyle = `rgba(100, 200, 255, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (this.tier >= 2) {
      // Second dish
      ctx.save();
      ctx.translate(x, y - halfS - 4);
      ctx.rotate(-rotate * 1.3);
      ctx.fillStyle = '#8BC8FF';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.tier >= 3) {
      // Gold spire + aura
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x - 1, y - halfS - 14, 2, 8);
      ctx.beginPath();
      ctx.arc(x, y - halfS - 14, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTankDepot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#4A5D23';
    ctx.fillRect(x - halfS, y - halfS, s, s);
    ctx.fillStyle = '#2E3C15';
    ctx.fillRect(x - halfS + 4, y - 4, 8, 6);
    ctx.fillRect(x + 2, y - halfS + 4, 10, 6);
    ctx.fillRect(x - 4, y + 6, 6, 6);
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 3, y - halfS - 10, 6, 12);
    ctx.fillRect(x - 8, y - halfS - 14, 16, 6);
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(x - halfS, y + halfS - 4, s, 3);
    if (this.tier >= 2) {
      // Extra turret
      ctx.fillStyle = '#222';
      ctx.fillRect(x + halfS - 10, y - halfS - 8, 6, 10);
    }
    if (this.tier >= 3) {
      // Gold command bar
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x - halfS + 4, y - halfS + 4, s - 8, 3);
    }
  }

  private drawBank(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    // Marble facade
    ctx.fillStyle = '#EAEAEA';
    ctx.fillRect(x - halfS, y - halfS + 6, s, s - 6);
    // Pediment
    ctx.fillStyle = '#CFCFCF';
    ctx.beginPath();
    ctx.moveTo(x - halfS - 2, y - halfS + 8);
    ctx.lineTo(x, y - halfS - 6);
    ctx.lineTo(x + halfS + 2, y - halfS + 8);
    ctx.closePath();
    ctx.fill();
    // Columns
    ctx.fillStyle = '#FFFFFF';
    const colCount = this.tier === 3 ? 5 : (this.tier === 2 ? 4 : 3);
    for (let i = 0; i < colCount; i++) {
      const cx = x - halfS + 4 + i * ((s - 8) / (colCount - 1));
      ctx.fillRect(cx - 2, y - halfS + 12, 3, s - 18);
    }
    // Pulsing gold $
    const pulse = 0.6 + 0.4 * Math.sin(this.animTime * 3);
    ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
    ctx.font = `bold ${Math.floor(s * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x, y + 4);
    ctx.textBaseline = 'alphabetic';
    if (this.tier >= 2) {
      // Gold trim
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - halfS + 2, y - halfS + 10, s - 4, 4);
    }
    if (this.tier >= 3) {
      // Spire
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x - 1, y - halfS - 14, 2, 8);
      ctx.beginPath();
      ctx.moveTo(x - 4, y - halfS - 6);
      ctx.lineTo(x + 4, y - halfS - 6);
      ctx.lineTo(x, y - halfS - 16);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawCasino(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#3A0A4A';
    ctx.fillRect(x - halfS, y - halfS + 4, s, s - 4);
    // Flashing neon border
    const t = Math.floor(this.animTime * 3);
    const colors = ['#FF00FF', '#FFFF00', '#00FFFF', '#FF3366'];
    ctx.strokeStyle = colors[t % colors.length];
    ctx.lineWidth = 2;
    ctx.strokeRect(x - halfS + 2, y - halfS + 6, s - 4, s - 10);
    // Dice pips
    ctx.fillStyle = '#FFF';
    ctx.fillRect(x - 8, y - 4, 4, 4);
    ctx.fillRect(x + 4, y - 4, 4, 4);
    ctx.fillRect(x - 8, y + 4, 4, 4);
    ctx.fillRect(x + 4, y + 4, 4, 4);
    if (this.tier >= 2) {
      // Top sign
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(x - halfS + 4, y - halfS - 6, s - 8, 4);
    }
    if (this.tier >= 3) {
      // Gold star
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('*', x, y - halfS - 8);
    }
  }

  private drawLaboratory(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    ctx.fillStyle = '#204A4C';
    ctx.fillRect(x - halfS, y - halfS, s, s);
    // Beaker
    ctx.fillStyle = '#00CED1';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - halfS + 6);
    ctx.lineTo(x + 6, y - halfS + 6);
    ctx.lineTo(x + 4, y + 4);
    ctx.lineTo(x - 4, y + 4);
    ctx.closePath();
    ctx.fill();
    // Bubbles
    const b = 0.5 + 0.5 * Math.sin(this.animTime * 4);
    ctx.fillStyle = `rgba(180,255,255,${0.4 + 0.4 * b})`;
    ctx.beginPath(); ctx.arc(x - 2, y - 2 - b * 4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 5 - b * 3, 1.5, 0, Math.PI * 2); ctx.fill();
    if (this.tier >= 2) {
      // Antenna
      ctx.strokeStyle = '#7DF0F2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - halfS + 4, y + halfS - 2);
      ctx.lineTo(x - halfS + 4, y + halfS - 10);
      ctx.stroke();
    }
    if (this.tier >= 3) {
      // Gold dome top
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(x, y - halfS, 5, Math.PI, 0);
      ctx.fill();
    }
  }

  private drawFarm(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    // Barn body
    ctx.fillStyle = '#A52A2A';
    ctx.fillRect(x - halfS, y - halfS + 6, s, s - 6);
    // Roof
    ctx.fillStyle = '#6B1A1A';
    ctx.beginPath();
    ctx.moveTo(x - halfS - 2, y - halfS + 8);
    ctx.lineTo(x, y - halfS - 6);
    ctx.lineTo(x + halfS + 2, y - halfS + 8);
    ctx.closePath();
    ctx.fill();
    // Barn-door cross
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 6, y + halfS - 2);
    ctx.moveTo(x + 6, y + 2); ctx.lineTo(x - 6, y + halfS - 2);
    ctx.stroke();
    // Crops
    ctx.fillStyle = '#9ACD32';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - halfS + 4 + i * 6, y + halfS - 8, 2, 6);
    }
    if (this.tier >= 2) {
      // Greenhouse glass strip
      ctx.fillStyle = 'rgba(180,255,180,0.4)';
      ctx.fillRect(x - halfS, y - halfS + 4, s, 4);
    }
    if (this.tier >= 3) {
      // Silo
      ctx.fillStyle = '#C0C0C0';
      ctx.fillRect(x + halfS - 6, y - halfS - 2, 6, 10);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(x + halfS - 3, y - halfS - 2, 3, Math.PI, 0);
      ctx.fill();
    }
  }

  private drawRadioTower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const halfS = s / 2;
    // Expanding ring pulse
    const pulseT = (this.animTime * 0.5) % 1;
    const ringR = pulseT * s;
    ctx.strokeStyle = `rgba(255,64,129,${0.5 * (1 - pulseT)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Base
    ctx.fillStyle = '#553344';
    ctx.fillRect(x - halfS + 6, y + halfS - 10, s - 12, 10);
    // Tower X struts
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + halfS - 10); ctx.lineTo(x, y - halfS + 2);
    ctx.moveTo(x + 10, y + halfS - 10); ctx.lineTo(x, y - halfS + 2);
    ctx.moveTo(x - 10, y + halfS - 10); ctx.lineTo(x + 10, y + halfS - 10);
    ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
    ctx.stroke();
    // Blinking top light
    const blink = Math.floor(this.animTime * 4) % 2 === 0;
    ctx.fillStyle = blink ? '#FF4081' : '#661020';
    ctx.beginPath();
    ctx.arc(x, y - halfS + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    if (this.tier >= 3) {
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(x - 2, y - halfS - 4, 4, 4);
    }
  }

  // ============ PRODUCT DRAWERS ============

  private drawProduct(ctx: CanvasRenderingContext2D, p: Product): void {
    const size = PRODUCT_SIZE;
    const half = size / 2;
    // Product visuals key off the base family (tier-2/3 share visual lineage with tier-1).
    const family = this.productFamily();
    switch (family) {
      case 'burger': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(p.spin) * 0.2);
        ctx.fillStyle = '#D4A574';
        ctx.beginPath();
        ctx.ellipse(0, -4, half, 3, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(-half, -2, size, 2);
        ctx.fillStyle = '#6B3410';
        ctx.fillRect(-half, 0, size, 3);
        ctx.fillStyle = '#C9924F';
        ctx.beginPath();
        ctx.ellipse(0, 5, half, 2.5, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#FFF7B0';
        ctx.fillRect(-3, -5, 1, 1);
        ctx.fillRect(2, -5, 1, 1);
        ctx.restore();
        break;
      }
      case 'soldier': {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(p.x - 4, p.y - 6, 8, 10);
        ctx.fillStyle = '#FFD7A8';
        ctx.fillRect(p.x - 2, p.y - 8, 4, 4);
        ctx.fillStyle = '#222';
        ctx.fillRect(p.x + 3, p.y - 3, 6, 1);
        break;
      }
      case 'robot': {
        ctx.fillStyle = '#BBBBBB';
        ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(p.x - 2, p.y - 3, 4, 2);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x, p.y - 8);
        ctx.stroke();
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 9, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'drone': {
        ctx.fillStyle = '#4169E1';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = Math.floor(p.spin * 4) % 2 === 0 ? '#FF0000' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x - 4, p.y, 1.2, 0, Math.PI * 2);
        ctx.arc(p.x + 4, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'tank': {
        ctx.fillStyle = '#4A5D23';
        ctx.fillRect(p.x - 6, p.y - 3, 12, 6);
        ctx.fillStyle = '#2E3C15';
        ctx.fillRect(p.x - 3, p.y - 6, 6, 4);
        ctx.fillStyle = '#222';
        ctx.fillRect(p.x + 2, p.y - 5, 5, 2);
        break;
      }
      case 'crop': {
        // Small green leafy projectile
        ctx.fillStyle = '#8BC34A';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 5, 3, p.spin, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFEB3B';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        break;
      }
      default: {
        ctx.fillStyle = this.color;
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    }
  }

  private productFamily(): string {
    switch (this.type) {
      case 'burgerJoint': case 'diner': case 'restaurant': return 'burger';
      case 'mercenaryCamp': case 'barracks': case 'fortress': return 'soldier';
      case 'robotFactory': case 'mechPlant': case 'gigafactory': return 'robot';
      case 'droneHub': case 'droneSwarm': case 'skyCommand': return 'drone';
      case 'tankDepot': case 'armoredDivision': case 'warMachine': return 'tank';
      case 'farm': case 'greenhouse': case 'megaFarm': return 'crop';
      default: return 'default';
    }
  }

  private iconFamily(): string {
    switch (this.type) {
      case 'burgerJoint': case 'diner': case 'restaurant': return 'burger';
      case 'mercenaryCamp': case 'barracks': case 'fortress': return 'merc';
      case 'robotFactory': case 'mechPlant': case 'gigafactory': return 'robot';
      case 'droneHub': case 'droneSwarm': case 'skyCommand': return 'drone';
      case 'tankDepot': case 'armoredDivision': case 'warMachine': return 'tank';
      case 'bank': case 'bigBank': case 'skyscraper': return 'bank';
      case 'casino': case 'resort': case 'vegasStrip': return 'casino';
      case 'laboratory': case 'researchCenter': case 'innovationHub': return 'lab';
      case 'farm': case 'greenhouse': case 'megaFarm': return 'farm';
      case 'radioTower': case 'broadcastStation': case 'networkHQ': return 'radio';
      default: return 'default';
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;

    const bob = Math.sin(this.animTime * 0.8) * 1.5;
    const x = this.position.x;
    const y = this.position.y + bob;

    // Surge glow
    if (this.surgeTimer > 0) {
      const pulse = 0.4 + 0.4 * Math.sin(this.animTime * 12);
      ctx.fillStyle = `rgba(255, 215, 0, ${pulse * 0.35})`;
      const r = this.size * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // CEO Aura glow
    if (this.ceoBoost > 0.05) {
      ctx.fillStyle = `rgba(0, 255, 180, ${0.22 * this.ceoBoost})`;
      ctx.beginPath();
      ctx.arc(x, y, this.size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // Upgrade flash: expanding gold ring
    if (this.upgradeFlashTimer > 0) {
      const t = 1 - this.upgradeFlashTimer / 0.4;
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.9 * (1 - t)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, this.size * (0.4 + t * 1.2), 0, Math.PI * 2);
      ctx.stroke();
    }

    switch (this.iconFamily()) {
      case 'burger':  this.drawBurgerJoint(ctx, x, y, this.size); break;
      case 'merc':    this.drawMercenaryCamp(ctx, x, y, this.size); break;
      case 'robot':   this.drawRobotFactory(ctx, x, y, this.size); break;
      case 'drone':   this.drawDroneHub(ctx, x, y, this.size); break;
      case 'tank':    this.drawTankDepot(ctx, x, y, this.size); break;
      case 'bank':    this.drawBank(ctx, x, y, this.size); break;
      case 'casino':  this.drawCasino(ctx, x, y, this.size); break;
      case 'lab':     this.drawLaboratory(ctx, x, y, this.size); break;
      case 'farm':    this.drawFarm(ctx, x, y, this.size); break;
      case 'radio':   this.drawRadioTower(ctx, x, y, this.size); break;
      default: {
        ctx.fillStyle = this.color;
        ctx.fillRect(x - this.size / 2, y - this.size / 2, this.size, this.size);
      }
    }

    // Outline + corruption highlight
    const corrupted = (this as unknown as Record<string, boolean>)._corrupted;
    ctx.strokeStyle = corrupted ? '#FF00FF' : (this.tier === 3 ? '#FFD700' : (this.tier === 2 ? '#DDDDDD' : '#FFFFFF'));
    ctx.lineWidth = corrupted ? 2 : (this.tier === 3 ? 2 : 1);
    ctx.strokeRect(x - this.size / 2, y - this.size / 2, this.size, this.size);

    // Tier pip (small Roman numeral marker at top-left)
    if (this.tier >= 2) {
      ctx.fillStyle = this.tier === 3 ? '#FFD700' : '#CCCCFF';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(this.tier === 3 ? 'III' : 'II', x - this.size / 2 + 2, y - this.size / 2 + 2);
      ctx.textBaseline = 'alphabetic';
    }

    // HP bar
    const barW = this.size; const barH = 3;
    const barY = y - this.size / 2 - 6;
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    const hpPct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = hpPct > 0.3 ? '#00FF00' : '#FF3333';
    ctx.fillRect(x - barW / 2, barY, barW * hpPct, barH);

    // Products
    for (const p of this.products) this.drawProduct(ctx, p);
  }
}

export class StructureSystem {
  structures: Structure[];
  damageCallback: ((sourceId: string, amount: number) => void) | null;

  // Synergy pairs for subtle in-game line rendering: [structA, structB].
  synergyPairs: Array<[Structure, Structure]>;

  constructor() {
    this.structures = [];
    this.damageCallback = null;
    this.synergyPairs = [];
  }

  addStructure(type: string, config: StructureConfig, x: number, y: number, gridX: number = 0, gridY: number = 0): Structure {
    const s = new Structure(type, config, x, y, gridX, gridY);
    s.damageCallback = this.damageCallback;
    this.structures.push(s);
    return s;
  }

  update(deltaTime: number, enemies: Enemy[]): void {
    for (const s of this.structures) s.update(deltaTime, enemies);
    for (let i = this.structures.length - 1; i >= 0; i--) {
      if (!this.structures[i].alive) {
        this.structures[i] = this.structures[this.structures.length - 1];
        this.structures.pop();
      }
    }
  }

  applySurge(multiplier: number, duration: number): void {
    for (const s of this.structures) s.setSurge(multiplier, duration);
  }

  applyCeoAuraFromPlayer(px: number, py: number, radius: number, boost: number): void {
    const r2 = radius * radius;
    for (const s of this.structures) {
      const dx = s.position.x - px;
      const dy = s.position.y - py;
      if (dx * dx + dy * dy <= r2) s.applyCeoAura(boost);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Render synergy links first (under structures).
    if (this.synergyPairs.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 255, 180, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      for (const [a, b] of this.synergyPairs) {
        if (!a.alive || !b.alive) continue;
        ctx.beginPath();
        ctx.moveTo(a.position.x, a.position.y);
        ctx.lineTo(b.position.x, b.position.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const s of this.structures) s.render(ctx);
  }

  getCount(): number { return this.structures.length; }
  clear(): void { this.structures = []; this.synergyPairs = []; }
}
