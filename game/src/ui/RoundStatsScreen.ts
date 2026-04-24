import { COLORS } from '../constants';
import { BALANCE } from '../config/balance';
import type { GameCanvas } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawPrimaryButton, drawSectionHeader, easeOutCubic } from './drawHelpers';

const DAMAGE_SOURCE_NAMES: Record<string, string> = {
  pistol: 'Pistol', sword: 'Sword', smg: 'SMG', shotgun: 'Shotgun',
  rocketLauncher: 'Rocket Launcher', laserGun: 'Laser Gun', laserBeam: 'Laser Beam',
  ricochetGun: 'Ricochet Gun', ricochet: 'Ricochet Gun',
  waveGun: 'Wave Gun', burstRifle: 'Burst Rifle',
  novaBurst: 'Nova Burst', orbitalCannon: 'Orbital Cannon',
  sprayAndPray: 'Spray and Pray', boomerang: 'Boomerang',
  hulkFist: 'Hulk Fist', speedsterDash: 'Speed Dash', speedsterAfterimage: 'Afterimage',
  magicMissile: 'Magic Missile', fireball: 'Fireball',
  chainLightning: 'Chain Lightning', iceNova: 'Ice Nova',
  meteorStorm: 'Meteor Storm', arcaneBeam: 'Arcane Beam',
  shieldBubble: 'Shield Bubble', teleport: 'Teleport',
  timeWarp: 'Time Warp', summonFamiliar: 'Familiar', familiar: 'Familiar',
  fist: 'Fist', dash: 'Dash', turret: 'Turret',
  // Allies — one per RECRUIT_CLASSES key (ally_${className})
  ally_gunner: 'Gunner Ally', ally_sniper: 'Sniper Ally',
  ally_brawler: 'Brawler Ally', ally_mage: 'Mage Ally',
  ally_tank: 'Tank Ally', ally_healer: 'Healer Ally',
  ally_taxCollector: 'Tax Collector', ally_berserker: 'Berserker Ally',
  ally_scout: 'Scout Ally', ally_medic: 'Medic Ally',
  // Capitalist structures — one per balance.ts structures entry (biz_${type})
  biz_burgerJoint: 'Burger Joint', biz_diner: 'Diner', biz_restaurant: 'Restaurant',
  biz_mercenaryCamp: 'Mercenary Camp', biz_barracks: 'Barracks', biz_fortress: 'Fortress',
  biz_robotFactory: 'Robot Factory', biz_mechPlant: 'Mech Plant', biz_gigafactory: 'Gigafactory',
  biz_tankDepot: 'Tank Depot', biz_armoredDivision: 'Armored Division', biz_warMachine: 'War Machine',
  biz_laboratory: 'Laboratory', biz_researchCenter: 'Research Center', biz_innovationHub: 'Innovation Hub',
  biz_farm: 'Farm', biz_greenhouse: 'Greenhouse', biz_megaFarm: 'Mega Farm',
  biz_bank: 'Bank', biz_bigBank: 'Big Bank', biz_skyscraper: 'Skyscraper',
};

// Rough palette for damage-source swatches. Falls back to a neutral color.
const DAMAGE_SOURCE_COLORS: Record<string, string> = {
  pistol: '#FFD966', sword: '#C0C0C0', smg: '#FFA500', shotgun: '#FF8844',
  rocketLauncher: '#FF4444', laserGun: '#FF33FF',
  ricochetGun: '#66CCFF', waveGun: '#44AAFF', burstRifle: '#FFAA33',
  hulkFist: '#AA4400', speedsterDash: '#66FFCC', speedsterAfterimage: '#99FFEE',
  magicMissile: '#AA66FF', fireball: '#FF6633',
  chainLightning: '#66CCFF', iceNova: '#99DDFF',
  meteorStorm: '#FF8844', arcaneBeam: '#CC66FF',
  shieldBubble: '#88CCFF', teleport: '#CC99FF',
  timeWarp: '#66FFFF', summonFamiliar: '#FFFF66',
  fist: '#CCCCCC', dash: '#66FFCC', turret: '#AAAAFF',
};

interface RoundStats {
  damageTaken: number;
  totalDamageDealt: number;
  enemiesKilled: number;
  moneySpawned: number;
  moneyCollected: number;
  damageByWeapon: Map<string, number>;
  killsByWeapon: Map<string, number>;
  killsByType: Map<string, number>;
}

interface StatsLayout {
  padding: number;
  titleY: number;
  contentY: number;
  continueButtonY: number;
  continueButtonX: number;
  continueButtonW: number;
  continueButtonH: number;
}

export class RoundStatsScreen {
  canvas: GameCanvas;
  gameState: GameState;
  stats: RoundStats | null;
  characterSummary: { label: string; value: string }[];
  continueHovered: boolean;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  private activatedAt: number;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.stats = null;
    this.characterSummary = [];
    this.continueHovered = false;
    this.activatedAt = 0;

    this.handleMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent) => this.onClick(e);
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  }

  activate(): void {
    this.activatedAt = performance.now();
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  updateStats(statsObj: RoundStats): void {
    this.stats = statsObj;
  }

  getLayout(): StatsLayout {
    const padding = 40;
    const titleY = this.canvas.logicalHeight * 0.12;
    const contentY = this.canvas.logicalHeight * 0.22;
    const continueButtonW = 170;
    const continueButtonH = 44;
    // CONTINUE button lives in the top-right corner so it can never
    // collide with overflowing stat columns.
    const continueButtonY = padding / 2;
    const continueButtonX = this.canvas.logicalWidth - padding - continueButtonW;

    return {
      padding,
      titleY,
      contentY,
      continueButtonY,
      continueButtonX,
      continueButtonW,
      continueButtonH,
    };
  }

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    const layout = this.getLayout();
    this.continueHovered = pos.x >= layout.continueButtonX &&
                           pos.x <= layout.continueButtonX + layout.continueButtonW &&
                           pos.y >= layout.continueButtonY &&
                           pos.y <= layout.continueButtonY + layout.continueButtonH;
  }

  onClick(_e: MouseEvent): void {
    if (this.continueHovered) {
      this.onContinueClick();
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.code === 'Enter' || e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this.onContinueClick();
    }
  }

  onContinueClick(): void {
    // Overridden by parent
  }

  private getFadeAlpha(): number {
    const elapsed = performance.now() - this.activatedAt;
    const a = Math.max(0, Math.min(1, elapsed / 300));
    return a;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const layout = this.getLayout();

    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight);

    // Soft top gradient wash.
    const wash = ctx.createLinearGradient(0, 0, 0, this.canvas.logicalHeight * 0.35);
    wash.addColorStop(0, 'rgba(0,80,0,0.10)');
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, this.canvas.logicalWidth, this.canvas.logicalHeight * 0.35);

    // Title banner drops in with overshoot.
    const wave = this.gameState?.currentLevel ?? 0;
    const sinceActivate = (performance.now() - this.activatedAt) / 1000;
    const dropT = Math.min(1, sinceActivate / 0.45);
    // Overshoot curve: 0 -> 1.08 -> 1.
    const overshoot = dropT < 0.7
      ? easeOutCubic(dropT / 0.7) * 1.08
      : 1.08 - easeOutCubic((dropT - 0.7) / 0.3) * 0.08;
    const dropOffset = (1 - dropT) * -40;

    ctx.save();
    ctx.translate(0, dropOffset);
    const titleText = `WAVE ${wave} CLEAR`;
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    const centerX = this.canvas.logicalWidth / 2;
    const tw = ctx.measureText(titleText).width;
    // Banner background.
    // Keep banner clear of the top-right CONTINUE button.
    const maxBannerW = Math.min(
      this.canvas.logicalWidth - layout.padding * 2,
      (layout.continueButtonX - layout.padding - 20) * 2,
    );
    const bannerW = Math.max(260, Math.min(maxBannerW, tw + 120));
    const bannerH = 58;
    const bx = centerX - bannerW / 2;
    const by = layout.titleY - 40;
    drawPanel(ctx, bx, by, bannerW, bannerH, { accent: 'green' });
    ctx.save();
    ctx.translate(centerX, layout.titleY);
    ctx.scale(overshoot, overshoot);
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 18;
    ctx.fillStyle = COLORS.UI_TEXT;
    ctx.fillText(titleText, 0, 0);
    ctx.restore();
    ctx.restore();

    void layout;

    // Continue Button (always drawn, not faded, so it's clickable immediately)
    this.drawContinueButton(ctx, layout);

    if (!this.stats) return;

    // Fade in body content
    const alpha = this.getFadeAlpha();
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;

    ctx.textAlign = 'left';

    // Two-column layout - positions fixed so no reflow during fade.
    const leftX = layout.padding;
    const rightX = this.canvas.logicalWidth / 2 + 20;
    const colW = this.canvas.logicalWidth / 2 - layout.padding - 20;
    const colH = this.canvas.logicalHeight - layout.contentY - layout.padding - 40;

    // Panel backing for each column.
    drawPanel(ctx, leftX - 14, layout.contentY - 28, colW + 28, colH, { accent: 'cyan' });
    drawPanel(ctx, rightX - 14, layout.contentY - 28, colW + 28, colH, { accent: 'gold' });

    this.renderLeftColumn(ctx, leftX, layout.contentY);
    this.renderRightColumn(ctx, rightX, layout.contentY);
    this.renderBadges(ctx, layout);

    ctx.globalAlpha = prevAlpha;
  }

  // Ease a number up to target across `dur` seconds.
  private tick(value: number, dur: number = 0.5): number {
    const t = Math.min(1, Math.max(0, (performance.now() - this.activatedAt) / 1000 / dur));
    return value * easeOutCubic(t);
  }

  private drawContinueButton(ctx: CanvasRenderingContext2D, layout: StatsLayout): void {
    const { continueButtonX: x, continueButtonY: y, continueButtonW: w, continueButtonH: h } = layout;
    drawPrimaryButton(ctx, x, y, w, h, 'CONTINUE  >', {
      hovered: this.continueHovered,
      hint: '[ENTER]',
      fontSize: 18,
    });
  }

  private renderLeftColumn(ctx: CanvasRenderingContext2D, x: number, startY: number): void {
    const stats = this.stats!;
    let y = startY;

    drawSectionHeader(ctx, 'Summary', x, y, 240, COLORS.ACCENT_CYAN);
    y += 22;

    ctx.font = '14px monospace';
    const rows: { label: string; value: string; color?: string }[] = [
      // Integer formatting matches the per-weapon breakdown column below.
      { label: 'Damage Dealt', value: Math.round(this.tick(stats.totalDamageDealt)).toString() },
      { label: 'Damage Taken', value: Math.round(this.tick(stats.damageTaken)).toString(), color: stats.damageTaken === 0 ? '#66FF66' : undefined },
      { label: 'Enemies Killed', value: String(Math.floor(this.tick(stats.enemiesKilled))) },
      { label: 'Money Earned', value: `$${Math.floor(this.tick(stats.moneyCollected))}` },
    ];
    for (const row of rows) {
      ctx.fillStyle = '#AAAAAA';
      ctx.fillText(row.label, x, y);
      ctx.fillStyle = row.color || COLORS.UI_TEXT;
      ctx.fillText(row.value, x + 170, y);
      y += 18;
    }

    const notCollected = Math.max(0, stats.moneySpawned - stats.moneyCollected);
    if (notCollected > 0) {
      ctx.fillStyle = '#FFB347'; // amber
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`MISSED $${notCollected}`, x, y);
      ctx.font = '11px monospace';
      ctx.fillStyle = '#997744';
      ctx.fillText(`(of $${stats.moneySpawned} total)`, x + 130, y);
      y += 20;
    }

    // Character summary (distinct buildup stats live here)
    if (this.characterSummary.length > 0) {
      y += 10;
      drawSectionHeader(ctx, 'Character', x, y, 240, COLORS.UI_TEXT);
      y += 20;
      ctx.font = '13px monospace';
      for (const entry of this.characterSummary) {
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText(entry.label, x, y);
        ctx.fillStyle = COLORS.UI_TEXT;
        ctx.fillText(entry.value, x + 170, y);
        y += 16;
      }
    }
  }

  private renderRightColumn(ctx: CanvasRenderingContext2D, x: number, startY: number): void {
    const stats = this.stats!;
    let y = startY;

    // DAMAGE SOURCES (top 5, sorted descending, with colored swatch + percent)
    drawSectionHeader(ctx, 'Damage Sources', x, y, 260, COLORS.ACCENT_GOLD);
    y += 22;

    // Derive total from the per-weapon buckets so the percentages shown sum to
    // 100 regardless of any rounding/overkill differences in totalDamageDealt.
    let totalDamage = 0;
    for (const v of stats.damageByWeapon.values()) totalDamage += v;
    if (totalDamage <= 0) totalDamage = 1;
    const weaponEntries = [...stats.damageByWeapon.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    ctx.font = '13px monospace';
    for (const [weaponId, damage] of weaponEntries) {
      const name = DAMAGE_SOURCE_NAMES[weaponId] || (weaponId.charAt(0).toUpperCase() + weaponId.slice(1));
      const color = DAMAGE_SOURCE_COLORS[weaponId] || '#CCCCCC';
      const pct = (damage / totalDamage) * 100;

      // Swatch
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 10, 10, 10);
      // Name
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillText(name, x + 16, y);
      // Damage value
      ctx.fillStyle = '#66FF66';
      ctx.fillText(damage.toFixed(0), x + 190, y);
      // Percent
      ctx.fillStyle = '#888888';
      ctx.fillText(`${pct.toFixed(0)}%`, x + 250, y);
      y += 17;
    }
    y += 10;

    // KILLS BY TYPE (top 5)
    drawSectionHeader(ctx, 'Targets', x, y, 260, COLORS.ACCENT_RED);
    y += 22;

    ctx.font = '13px monospace';
    const enemyTypes = BALANCE.enemyTypes as unknown as Record<string, { color?: string }>;
    const killEntries = [...stats.killsByType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [enemyType, amount] of killEntries) {
      const name = enemyType.toUpperCase();
      let baseType = enemyType.toLowerCase();
      if (baseType.startsWith('rage ')) baseType = baseType.substring(5);
      else if (baseType.startsWith('speed ')) baseType = baseType.substring(6);
      const safeBaseType = baseType.trim() || 'basic';
      const color = enemyTypes[safeBaseType]?.color || '#FF0000';

      ctx.fillStyle = color;
      ctx.fillRect(x, y - 10, 10, 10);
      ctx.fillStyle = COLORS.UI_TEXT;
      ctx.fillText(name, x + 16, y);
      ctx.fillStyle = '#FFAAAA';
      ctx.fillText(String(amount), x + 190, y);
      y += 17;
    }
  }

  private renderBadges(ctx: CanvasRenderingContext2D, layout: StatsLayout): void {
    const stats = this.stats!;
    const badges: { label: string; fill: string; stroke: string }[] = [];
    if (stats.damageTaken === 0 && stats.enemiesKilled > 0) {
      badges.push({ label: 'FLAWLESS', fill: '#002244', stroke: '#66CCFF' });
    }
    if (stats.enemiesKilled >= 100) {
      badges.push({ label: 'SLAUGHTER', fill: '#330000', stroke: '#FF5555' });
    }
    if (badges.length === 0) return;

    // Position badges under the title, centered.
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padX = 12;
    const badgeH = 24;
    const gap = 12;
    const widths = badges.map(b => ctx.measureText(b.label).width + padX * 2);
    const totalW = widths.reduce((s, w) => s + w, 0) + gap * (badges.length - 1);
    let bx = this.canvas.logicalWidth / 2 - totalW / 2;
    const by = layout.titleY + 18;

    for (let i = 0; i < badges.length; i++) {
      const b = badges[i];
      const w = widths[i];
      ctx.fillStyle = b.fill;
      ctx.fillRect(bx, by, w, badgeH);
      ctx.strokeStyle = b.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, w, badgeH);
      ctx.fillStyle = b.stroke;
      ctx.fillText(b.label, bx + w / 2, by + badgeH / 2 + 1);
      bx += w + gap;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
}
